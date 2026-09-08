const { pool } = require('../utils/db');
const notificationService = require('../services/notificationService');

/* ==========================================================
   1. WATCHMAN DASHBOARD OVERVIEW & METRICS
   ========================================================== */

/**
 * GET /api/watchman/overview
 * Overview statistics and recent return feed for Watchman dashboard
 * Accessible ONLY by authenticated Watchman staff
 */
exports.getWatchmanOverview = async (req, res, next) => {
  try {
    const watchmanId = req.user.id;

    // 1. Total students currently outside hostel
    const [outsideRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM students 
      WHERE current_hostel_status = 'OUTSIDE';
    `);

    // 2. Returns recorded today
    const [todayReturnsRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM return_logs 
      WHERE DATE(return_time) = CURDATE();
    `);

    // 3. Late returns today
    const [lateReturnsRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM return_logs 
      WHERE DATE(return_time) = CURDATE() AND is_late = 1;
    `);

    // 4. On-time returns today
    const [onTimeReturnsRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM return_logs 
      WHERE DATE(return_time) = CURDATE() AND is_late = 0;
    `);

    // 5. Recent 6 return records
    const [recentRows] = await pool.query(`
      SELECT 
        r.id AS logId,
        r.return_time AS returnTime,
        r.is_late AS isLate,
        r.late_duration_minutes AS lateDurationMinutes,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        o.request_code AS requestCode,
        o.destination,
        o.to_datetime AS expectedReturnTime,
        e.exit_time AS exitTime,
        st.name AS scannedByName
      FROM return_logs r
      INNER JOIN students s ON r.student_id = s.id
      INNER JOIN outpass_requests o ON r.outpass_request_id = o.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN staff st ON r.guard_staff_id = st.id
      ORDER BY r.return_time DESC
      LIMIT 6;
    `);

    return res.status(200).json({
      success: true,
      stats: {
        studentsOutside: Number(outsideRows[0].count) || 0,
        todayReturns: Number(todayReturnsRows[0].count) || 0,
        lateReturns: Number(lateReturnsRows[0].count) || 0,
        pendingReturns: Number(outsideRows[0].count) || 0,
        onTimeReturns: Number(onTimeReturnsRows[0].count) || 0
      },
      recentReturns: recentRows
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   2. ATOMIC RETURN SCAN TRANSACTION ENGINE
   ========================================================== */

/**
 * POST /api/watchman/return
 * Validates student QR token, checks exit status, records return, updates student/outpass/qr status to COMPLETED
 * Accessible ONLY by authenticated Watchman staff
 */
exports.recordStudentReturn = async (req, res, next) => {
  let connection;
  try {
    const watchmanId = req.user.id;
    const { qr_token } = req.body;

    if (!qr_token || typeof qr_token !== 'string' || !qr_token.trim()) {
      return res.status(400).json({
        success: false,
        validity: 'INVALID_QR',
        message: 'QR Token is required to record return.'
      });
    }

    const rawToken = qr_token.trim();
    const tokenWithoutPrefix = rawToken.replace(/^HOSTEL-QR:/i, '');

    // Get a dedicated MySQL connection from pool for atomic transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Fetch QR, Outpass, Student, and Exit Log with FOR UPDATE row locking
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
        o.exit_time AS exitTime,
        o.return_time AS returnTime,
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

    // 2. Token Not Found -> INVALID_QR
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        validity: 'INVALID_QR',
        message: 'INVALID QR CODE: Token not recognized in database.'
      });
    }

    const pass = rows[0];
    const serverNow = new Date();
    const expectedReturnDate = new Date(pass.returnDatetime);

    // 3. Revocation Check -> REVOKED_QR
    if (pass.qrStatus === 'REVOKED') {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        validity: 'REVOKED_QR',
        message: 'QR CODE REVOKED: This pass has been revoked by Hostel Administration.',
        details: { requestCode: pass.requestCode, studentName: pass.studentName }
      });
    }

    // 4. Outpass Approval Check
    if (pass.outpassStatus !== 'APPROVED' && pass.outpassStatus !== 'COMPLETED') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        validity: 'NOT_APPROVED',
        message: `Outpass is in "${pass.outpassStatus}" state. Only approved passes can be returned.`
      });
    }

    // 5. Check if Student Recorded an Exit for THIS Outpass -> NOT_EXITED
    const [existingExitLogs] = await connection.query(
      'SELECT id, exit_time FROM exit_logs WHERE outpass_request_id = ? LIMIT 1;',
      [pass.outpassId]
    );

    const hasExited = Boolean(pass.scannedExitAt || pass.exitTime || existingExitLogs.length > 0);

    if (!hasExited) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        validity: 'NOT_EXITED',
        message: 'STUDENT HAS NOT EXITED: No gate checkout record found for this outpass.',
        details: {
          requestCode: pass.requestCode,
          studentName: pass.studentName,
          rollNumber: pass.rollNumber
        }
      });
    }

    // 6. Check if Return Already Recorded -> ALREADY_RETURNED
    const [existingReturnLogs] = await connection.query(
      'SELECT id, return_time, is_late, late_duration_minutes FROM return_logs WHERE outpass_request_id = ? LIMIT 1;',
      [pass.outpassId]
    );

    if (pass.scannedReturnAt || pass.returnTime || existingReturnLogs.length > 0 || pass.outpassStatus === 'COMPLETED' || pass.qrStatus === 'COMPLETED') {
      await connection.rollback();
      const prevReturn = existingReturnLogs[0] || {};
      const returnTime = pass.scannedReturnAt || pass.returnTime || prevReturn.return_time;
      return res.status(409).json({
        success: false,
        validity: 'ALREADY_RETURNED',
        message: 'RETURN ALREADY RECORDED: Student has already checked in for this outpass.',
        details: {
          requestCode: pass.requestCode,
          studentName: pass.studentName,
          rollNumber: pass.rollNumber,
          returnTime: returnTime ? new Date(returnTime).toLocaleString('en-US') : 'Earlier'
        }
      });
    }

    // 7. Calculate Late Duration (Checks Final Approved Return Date & Extension Status)
    let isLate = 0;
    let lateDurationMinutes = 0;
    let returnClassification = 'ON_TIME';

    // Check if an approved extension exists for this outpass
    const [extRows] = await connection.query(
      'SELECT id, previous_valid_until, approved_valid_until FROM extension_requests WHERE outpass_request_id = ? AND status = "APPROVED" ORDER BY id DESC LIMIT 1;',
      [pass.outpassId]
    );
    const approvedExtension = extRows.length > 0 ? extRows[0] : null;

    if (serverNow.getTime() > expectedReturnDate.getTime()) {
      isLate = 1;
      const diffMs = serverNow.getTime() - expectedReturnDate.getTime();
      lateDurationMinutes = Math.max(1, Math.ceil(diffMs / (60 * 1000)));
      returnClassification = 'LATE_RETURN';
    } else if (approvedExtension && approvedExtension.previous_valid_until && serverNow.getTime() > new Date(approvedExtension.previous_valid_until).getTime()) {
      isLate = 0;
      lateDurationMinutes = 0;
      returnClassification = 'ON_TIME_WITH_EXTENSION';
    }

    // 8. Execute Atomic Updates inside Transaction
    // A. Insert entry in return_logs
    const [insertReturnResult] = await connection.query(`
      INSERT INTO return_logs (
        qr_id,
        outpass_request_id,
        student_id,
        guard_staff_id,
        verification_method,
        return_time,
        is_late,
        late_duration_minutes,
        remarks
      ) VALUES (?, ?, ?, ?, 'qr_scan', ?, ?, ?, ?);
    `, [
      pass.qrId,
      pass.outpassId,
      pass.studentId,
      watchmanId,
      serverNow,
      isLate,
      lateDurationMinutes,
      isLate ? `Returned ${lateDurationMinutes} minutes after scheduled return time.` : 'Returned on time.'
    ]);

    // B. Update student current hostel status to INSIDE
    await connection.query(`
      UPDATE students 
      SET current_hostel_status = 'INSIDE' 
      WHERE id = ?;
    `, [pass.studentId]);

    // C. Update outpass request with return timestamp, checkpoint status, and status = COMPLETED
    await connection.query(`
      UPDATE outpass_requests 
      SET 
        return_time = ?,
        current_checkpoint_status = 'returned',
        status = 'COMPLETED',
        overall_status = 'completed'
      WHERE id = ?;
    `, [serverNow, pass.outpassId]);

    // D. Update QR code scanned_return_at, increment used_count, status = COMPLETED, is_used = 1
    await connection.query(`
      UPDATE qr_codes 
      SET 
        scanned_return_at = ?,
        used_count = used_count + 1,
        status = 'COMPLETED',
        is_used = 1
      WHERE id = ?;
    `, [serverNow, pass.qrId]);

    // Commit Transaction
    await connection.commit();

    // Notify Student of Return Verification
    await notificationService.notifyStudent({
      studentId: pass.studentId,
      title: isLate ? 'Late Return Recorded' : 'Return Recorded - Outpass Completed',
      message: isLate 
        ? `Your return was recorded at ${serverNow.toLocaleTimeString()} (${lateDurationMinutes} mins late). Status: Inside Hostel.`
        : 'Your return was verified on time. Outpass marked COMPLETED. Welcome back!',
      type: isLate ? 'LATE_RETURN' : 'RETURN_RECORDED',
      referenceId: pass.outpassId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      validity: 'RETURN_VERIFIED',
      status: 'RETURN_VERIFIED',
      returnClassification,
      isLate: Boolean(isLate),
      lateDurationMinutes,
      lateDurationFormatted: formatLateDuration(lateDurationMinutes),
      timeliness: {
        classification: returnClassification,
        isLate: Boolean(isLate),
        lateDurationMinutes,
        lateDurationFormatted: formatLateDuration(lateDurationMinutes)
      },
      message: isLate 
        ? `RETURN VERIFIED (LATE): Student returned ${lateDurationMinutes} minutes late.`
        : (returnClassification === 'ON_TIME_WITH_EXTENSION'
            ? 'RETURN VERIFIED: Student returned ON TIME with authorized emergency extension.'
            : 'RETURN VERIFIED: Student returned ON TIME.'),
      data: {
        returnLogId: insertReturnResult.insertId,
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
        exitTime: pass.exitTime || pass.scannedExitAt || (existingExitLogs[0] ? existingExitLogs[0].exit_time : null),
        expectedReturnTime: pass.returnDatetime,
        actualReturnTime: serverNow.toISOString(),
        hostelStatus: 'INSIDE HOSTEL',
        outpassStatus: 'COMPLETED',
        qrStatus: 'COMPLETED'
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
   3. STUDENTS CURRENTLY OUTSIDE (FOR WATCHMAN TRACKING)
   ========================================================== */

/**
 * GET /api/watchman/students-outside
 * Retrieves all students who have exited and are currently outside hostel
 * Accessible ONLY by authenticated Watchman staff
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
        CASE WHEN NOW() > o.to_datetime THEN 1 ELSE 0 END AS isOverdue,
        CASE 
          WHEN NOW() > o.to_datetime THEN TIMESTAMPDIFF(MINUTE, o.to_datetime, NOW())
          ELSE 0 
        END AS overdueDurationMinutes
      FROM students s
      INNER JOIN outpass_requests o ON s.id = o.student_id AND o.status = 'APPROVED'
      INNER JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE s.current_hostel_status = 'OUTSIDE' AND r.id IS NULL
      ORDER BY e.exit_time DESC;
    `);

    return res.status(200).json({
      success: true,
      totalOutside: rows.length,
      students: rows
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   4. RETURN HISTORY & DATE FILTERING
   ========================================================== */

/**
 * GET /api/watchman/return-history
 * Retrieves return checkout logs with date filtering (today, yesterday, specific date, all)
 * Accessible ONLY by authenticated Watchman staff
 */
exports.getReturnHistory = async (req, res, next) => {
  try {
    const { filter, date } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filter === 'today') {
      whereClause += ' AND DATE(r.return_time) = CURDATE()';
    } else if (filter === 'yesterday') {
      whereClause += ' AND DATE(r.return_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
    } else if (filter === 'date' && date) {
      whereClause += ' AND DATE(r.return_time) = ?';
      params.push(date);
    }

    const [rows] = await pool.query(`
      SELECT 
        r.id AS logId,
        r.return_time AS returnTime,
        r.is_late AS isLate,
        r.late_duration_minutes AS lateDurationMinutes,
        r.verification_method AS verificationMethod,
        r.remarks,
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
        e.exit_time AS exitTime,
        o.to_datetime AS expectedReturnTime,
        st.name AS scannedByName,
        st.role AS scannedByRole
      FROM return_logs r
      INNER JOIN students s ON r.student_id = s.id
      INNER JOIN outpass_requests o ON r.outpass_request_id = o.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN staff st ON r.guard_staff_id = st.id
      ${whereClause}
      ORDER BY r.return_time DESC
      LIMIT 100;
    `, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      filterApplied: filter || 'all',
      returnHistory: rows
    });

  } catch (error) {
    next(error);
  }
};

/* Helper function to format late duration */
function formatLateDuration(minutes) {
  if (!minutes || minutes <= 0) return '0 mins';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours} hr${hours > 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`;
  }
  return `${mins} minute${mins !== 1 ? 's' : ''}`;
}
