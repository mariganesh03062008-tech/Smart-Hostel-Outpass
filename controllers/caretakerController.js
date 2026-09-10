const { pool } = require('../utils/db');
const notificationService = require('../services/notificationService');

/* ==========================================================
   1. CARETAKER DASHBOARD OVERVIEW & METRICS
   ========================================================== */

/**
 * GET /api/caretaker/overview
 * Overview statistics and recent exit feed for Caretaker dashboard
 * Accessible ONLY by authenticated Caretaker staff
 */
exports.getCaretakerOverview = async (req, res, next) => {
  try {
    const caretakerId = req.user.id;

    // 1. Total students currently inside hostel
    const [insideRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM students 
      WHERE current_hostel_status = 'INSIDE' OR current_hostel_status IS NULL;
    `);

    // 2. Total students currently outside hostel
    const [outsideRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM students 
      WHERE current_hostel_status = 'OUTSIDE';
    `);

    // 3. Exits recorded today
    const [todayExitsRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM exit_logs 
      WHERE DATE(exit_time) = CURDATE();
    `);

    // 4. Returns recorded today
    const [todayReturnsRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM return_logs 
      WHERE DATE(return_time) = CURDATE();
    `);

    // 5. Recent 6 exit records
    const [recentRows] = await pool.query(`
      SELECT 
        e.id AS logId,
        e.exit_time AS exitTime,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        s.year_of_study AS yearOfStudy,
        o.request_code AS requestCode,
        o.destination,
        o.to_datetime AS expectedReturnTime,
        st.name AS scannedByName
      FROM exit_logs e
      INNER JOIN students s ON e.student_id = s.id
      INNER JOIN outpass_requests o ON e.outpass_request_id = o.id
      LEFT JOIN staff st ON e.guard_staff_id = st.id
      ORDER BY e.exit_time DESC
      LIMIT 6;
    `);

    return res.status(200).json({
      success: true,
      stats: {
        studentsInside: Number(insideRows[0].count) || 0,
        studentsOutside: Number(outsideRows[0].count) || 0,
        todayExits: Number(todayExitsRows[0].count) || 0,
        todayReturns: Number(todayReturnsRows[0].count) || 0
      },
      recentExits: recentRows
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   2. ATOMIC EXIT SCAN TRANSACTION ENGINE
   ========================================================== */

/**
 * POST /api/caretaker/exit
 * Validates student QR token and atomically records exit in MySQL
 * Accessible ONLY by authenticated Caretaker staff
 */
exports.recordStudentExit = async (req, res, next) => {
  let connection;
  try {
    const caretakerId = req.user.id;
    const { qr_token } = req.body;

    if (!qr_token || typeof qr_token !== 'string' || !qr_token.trim()) {
      return res.status(400).json({
        success: false,
        validity: 'INVALID',
        message: 'QR Token is required to record exit.'
      });
    }

    const rawToken = qr_token.trim();
    const tokenWithoutPrefix = rawToken.replace(/^HOSTEL-QR:/i, '');

    // Get a dedicated MySQL connection from pool for atomic transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Fetch QR, Outpass, and Student with FOR UPDATE row locking
    const [rows] = await connection.query(`
      SELECT 
        q.id AS qrId,
        q.token AS qrToken,
        q.qr_data AS qrData,
        q.valid_from AS validFrom,
        q.valid_until AS validUntil,
        q.status AS qrStatus,
        q.scanned_exit_at AS scannedExitAt,
        q.scanned_return_at AS scannedReturnAt,
        q.used_count AS usedCount,
        q.max_uses AS maxUses,
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status AS outpassStatus,
        o.current_checkpoint_status AS checkpointStatus,
        s.id AS studentId,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        s.current_hostel_status AS currentHostelStatus,
        s.phone AS studentPhone
      FROM qr_codes q
      INNER JOIN outpass_requests o ON q.outpass_request_id = o.id
      INNER JOIN students s ON o.student_id = s.id
      WHERE q.token = ? OR q.token = ? OR q.qr_data = ?
      ORDER BY q.id DESC
      LIMIT 1
      FOR UPDATE;
    `, [rawToken, tokenWithoutPrefix, rawToken]);

    // 2. Token Not Found
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        validity: 'INVALID',
        message: 'INVALID QR CODE: Token not recognized in database.'
      });
    }

    const pass = rows[0];
    const serverNow = new Date();
    const validFromDate = new Date(pass.validFrom);
    const validUntilDate = new Date(pass.validUntil);

    // 3. Outpass Approval Check
    if (pass.outpassStatus !== 'APPROVED') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        validity: 'NOT_APPROVED',
        message: `Outpass is in "${pass.outpassStatus}" state. Only approved passes are valid for exit.`
      });
    }

    // 4. Revocation Check
    if (pass.qrStatus === 'REVOKED') {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        validity: 'REVOKED',
        message: 'QR CODE REVOKED: This pass has been revoked by Hostel Administration.',
        details: { requestCode: pass.requestCode, studentName: pass.studentName }
      });
    }

    // 5. Server-Time Validation: NOT YET VALID
    if (serverNow < validFromDate) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        validity: 'NOT_YET_VALID',
        message: `QR CODE IS NOT YET VALID: Scheduled departure is at ${validFromDate.toLocaleString('en-US')}.`,
        serverTime: serverNow.toISOString(),
        validFrom: validFromDate.toISOString(),
        student: { name: pass.studentName, rollNumber: pass.rollNumber }
      });
    }

    // 6. Server-Time Validation: EXPIRED
    if (serverNow > validUntilDate) {
      await connection.rollback();
      return res.status(410).json({
        success: false,
        validity: 'EXPIRED',
        message: `QR CODE EXPIRED: Outpass validity window ended at ${validUntilDate.toLocaleString('en-US')}.`,
        serverTime: serverNow.toISOString(),
        validUntil: validUntilDate.toISOString(),
        student: { name: pass.studentName, rollNumber: pass.rollNumber }
      });
    }

    // 7. Duplicate Exit Prevention Check for this Outpass
    const [existingExitLogs] = await connection.query(
      'SELECT id, exit_time FROM exit_logs WHERE outpass_request_id = ? LIMIT 1;',
      [pass.outpassId]
    );

    if (pass.scannedExitAt || existingExitLogs.length > 0) {
      await connection.rollback();
      const exitTime = pass.scannedExitAt || (existingExitLogs[0] ? existingExitLogs[0].exit_time : null);
      return res.status(409).json({
        success: false,
        validity: 'ALREADY_EXITED',
        message: 'EXIT ALREADY RECORDED: Student has already checked out for this outpass.',
        details: {
          requestCode: pass.requestCode,
          studentName: pass.studentName,
          rollNumber: pass.rollNumber,
          exitTime: exitTime ? new Date(exitTime).toLocaleString('en-US') : 'Earlier today'
        }
      });
    }

    // 8. Execute Atomic Updates inside Transaction
    // A. Insert entry in exit_logs
    const [insertExitResult] = await connection.query(`
      INSERT INTO exit_logs (
        qr_id,
        outpass_request_id,
        student_id,
        guard_staff_id,
        verification_method,
        exit_time
      ) VALUES (?, ?, ?, ?, 'qr_scan', ?);
    `, [pass.qrId, pass.outpassId, pass.studentId, caretakerId, serverNow]);

    // B. Update student current hostel status to OUTSIDE
    await connection.query(`
      UPDATE students 
      SET current_hostel_status = 'OUTSIDE' 
      WHERE id = ?;
    `, [pass.studentId]);

    // C. Update outpass request with exit timestamp & checkpoint status
    await connection.query(`
      UPDATE outpass_requests 
      SET 
        exit_time = ?,
        current_checkpoint_status = 'outside'
      WHERE id = ?;
    `, [serverNow, pass.outpassId]);

    // D. Update QR code scanned_exit_at and increment used_count (keep status = ACTIVE for Watchman return scan)
    await connection.query(`
      UPDATE qr_codes 
      SET 
        scanned_exit_at = ?,
        used_count = used_count + 1
      WHERE id = ?;
    `, [serverNow, pass.qrId]);

    // E. Log gate exit movement in outpass_approval_history
    await connection.query(`
      INSERT INTO outpass_approval_history (
        outpass_id, student_id, role, user_id, action, message, previous_status, new_status, created_at
      ) VALUES (?, ?, 'caretaker', ?, 'GATE_EXIT', 'Gate departure recorded by Caretaker via QR scan', 'APPROVED', 'APPROVED', NOW())
    `, [pass.outpassId, pass.studentId, caretakerId]).catch(err => console.warn('[History Error]:', err.message));

    // Commit Transaction
    await connection.commit();

    // Notify Student and Watchman
    await notificationService.notifyStudent({
      studentId: pass.studentId,
      title: 'Exit Recorded - Outside Hostel',
      message: `Your exit was verified at ${serverNow.toLocaleTimeString()}. Expected return deadline: ${new Date(pass.returnDatetime).toLocaleString()}.`,
      type: 'EXIT_RECORDED',
      referenceId: pass.outpassId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    await notificationService.notifyWatchman({
      title: 'Student Exited Hostel',
      message: `Student ${pass.studentName} (${pass.rollNumber}) checked out. Return verification pending.`,
      type: 'EXIT_RECORDED',
      referenceId: pass.outpassId,
      linkUrl: '/watchman-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      validity: 'VALID',
      status: 'EXIT_VERIFIED',
      message: 'EXIT VERIFIED: Student exit recorded successfully.',
      data: {
        exitLogId: insertExitResult.insertId,
        studentName: pass.studentName,
        rollNumber: pass.rollNumber,
        department: pass.department,
        yearOfStudy: pass.yearOfStudy,
        hostelBlock: pass.hostelBlock,
        roomNumber: pass.roomNumber,
        studentPhone: pass.studentPhone,
        requestCode: pass.requestCode,
        requestType: pass.requestType === 'one_day_duty' ? 'One-Day Duty' : 'Normal Outpass',
        purpose: pass.purpose,
        destination: pass.destination,
        exitTime: serverNow.toISOString(),
        expectedReturnTime: pass.returnDatetime,
        hostelStatus: 'OUTSIDE HOSTEL',
        qrStatus: 'ACTIVE'
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/* ==========================================================
   3. STUDENTS CURRENTLY OUTSIDE (GROUPED BY ACADEMIC YEAR)
   ========================================================== */

/**
 * GET /api/caretaker/students-outside
 * Retrieves all students currently outside hostel, grouped by Year of Study (Year 1, 2, 3, 4)
 * Accessible ONLY by authenticated Caretaker staff
 */
exports.getStudentsOutside = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        s.id AS studentId,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.semester,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        s.phone AS studentPhone,
        s.current_hostel_status AS hostelStatus,
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        e.exit_time AS exitTime,
        o.to_datetime AS expectedReturnTime,
        o.status AS outpassStatus,
        TIMESTAMPDIFF(MINUTE, NOW(), o.to_datetime) AS minutesRemaining,
        CASE WHEN NOW() > o.to_datetime THEN 1 ELSE 0 END AS isOverdue
      FROM students s
      INNER JOIN outpass_requests o ON s.id = o.student_id AND o.status = 'APPROVED'
      INNER JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE s.current_hostel_status = 'OUTSIDE' AND r.id IS NULL
      ORDER BY e.exit_time DESC;
    `);

    // Group students by actual year of study from MySQL
    const firstYear = rows.filter(s => Number(s.yearOfStudy) === 1);
    const secondYear = rows.filter(s => Number(s.yearOfStudy) === 2);
    const thirdYear = rows.filter(s => Number(s.yearOfStudy) === 3);
    const fourthYear = rows.filter(s => Number(s.yearOfStudy) === 4);

    return res.status(200).json({
      success: true,
      totalOutside: rows.length,
      grouped: {
        firstYear: { count: firstYear.length, students: firstYear },
        secondYear: { count: secondYear.length, students: secondYear },
        thirdYear: { count: thirdYear.length, students: thirdYear },
        fourthYear: { count: fourthYear.length, students: fourthYear }
      },
      allStudents: rows
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   4. EXIT HISTORY & DATE FILTERING
   ========================================================== */

/**
 * GET /api/caretaker/exit-history
 * Retrieves historical exit logs with date filtering (today, yesterday, specific date, all)
 * Accessible ONLY by authenticated Caretaker staff
 */
exports.getExitHistory = async (req, res, next) => {
  try {
    const { filter, date } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filter === 'today') {
      whereClause += ' AND DATE(e.exit_time) = CURDATE()';
    } else if (filter === 'yesterday') {
      whereClause += ' AND DATE(e.exit_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
    } else if (filter === 'date' && date) {
      whereClause += ' AND DATE(e.exit_time) = ?';
      params.push(date);
    }

    const [rows] = await pool.query(`
      SELECT 
        e.id AS logId,
        e.exit_time AS exitTime,
        e.verification_method AS verificationMethod,
        e.remarks,
        s.id AS studentId,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        o.to_datetime AS expectedReturnTime,
        st.name AS scannedByName,
        st.role AS scannedByRole,
        r.return_time AS returnTime,
        CASE WHEN r.id IS NOT NULL THEN 'RETURNED' ELSE 'CURRENTLY_OUTSIDE' END AS currentStatus
      FROM exit_logs e
      INNER JOIN students s ON e.student_id = s.id
      INNER JOIN outpass_requests o ON e.outpass_request_id = o.id
      LEFT JOIN staff st ON e.guard_staff_id = st.id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      ${whereClause}
      ORDER BY e.exit_time DESC
      LIMIT 100;
    `, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      filterApplied: filter || 'all',
      exitHistory: rows
    });

  } catch (error) {
    next(error);
  }
};
