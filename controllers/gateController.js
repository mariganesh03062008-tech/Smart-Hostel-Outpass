const { pool } = require('../utils/db');

/**
 * Helper to format date string as YYYY-MM-DD
 */
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format minutes to hours & minutes
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0 mins';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours} hr${hours > 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`;
  }
  return `${mins} min${mins !== 1 ? 's' : ''}`;
}

/* ==========================================================
   1. DAILY MOVEMENT SUMMARY & DAY-END COUNTS
   ========================================================== */

/**
 * GET /api/gate/daily-summary?date=YYYY-MM-DD
 * Calculates authoritative movement statistics for the specified date
 * Accessible by Caretaker, Watchman, Warden, and Principal
 *
 * Formula:
 * - totalCheckedOut: Count of valid check-outs on date (exit_logs where DATE(exit_time) = date)
 * - totalCheckedIn: Count of valid check-ins on date (return_logs where DATE(return_time) = date)
 * - currentlyOutside: Students who checked out on date but have not checked in (return log is NULL)
 * - stillOutsideList: Roster of students who checked out on that date and have not checked in
 */
exports.getDailyMovementSummary = async (req, res, next) => {
  try {
    const requestedDate = req.query.date ? req.query.date.trim() : getLocalDateString();

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Expected YYYY-MM-DD.'
      });
    }

    // 1. Fetch all exit check-outs on the selected date with matched return status
    const [checkedOutRows] = await pool.query(`
      SELECT 
        e.id AS exitLogId,
        e.exit_time AS exitTime,
        e.outpass_request_id AS outpassId,
        e.verification_method AS exitMethod,
        s.id AS studentId,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        s.phone AS studentPhone,
        s.current_hostel_status AS currentHostelStatus,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS expectedReturnTime,
        o.status AS outpassStatus,
        st_exit.name AS checkedOutByStaffName,
        r.id AS returnLogId,
        r.return_time AS actualReturnTime,
        r.is_late AS isLate,
        r.late_duration_minutes AS lateDurationMinutes,
        st_ret.name AS checkedInByStaffName,
        CASE 
          WHEN r.id IS NOT NULL THEN 'CHECKED_IN'
          ELSE 'STILL_OUTSIDE'
        END AS movementStatus
      FROM exit_logs e
      INNER JOIN outpass_requests o ON e.outpass_request_id = o.id
      INNER JOIN students s ON e.student_id = s.id
      LEFT JOIN staff st_exit ON e.guard_staff_id = st_exit.id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      LEFT JOIN staff st_ret ON r.guard_staff_id = st_ret.id
      WHERE DATE(e.exit_time) = ?
      ORDER BY e.exit_time ASC;
    `, [requestedDate]);

    // 2. Fetch all return check-ins on the selected date
    const [checkedInRows] = await pool.query(`
      SELECT 
        r.id AS returnLogId,
        r.return_time AS actualReturnTime,
        r.is_late AS isLate,
        r.late_duration_minutes AS lateDurationMinutes,
        r.verification_method AS returnMethod,
        r.outpass_request_id AS outpassId,
        s.id AS studentId,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        s.phone AS studentPhone,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        e.exit_time AS exitTime,
        o.to_datetime AS expectedReturnTime,
        st_ret.name AS checkedInByStaffName,
        'CHECKED_IN' AS movementStatus
      FROM return_logs r
      INNER JOIN outpass_requests o ON r.outpass_request_id = o.id
      INNER JOIN students s ON r.student_id = s.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN staff st_ret ON r.guard_staff_id = st_ret.id
      WHERE DATE(r.return_time) = ?
      ORDER BY r.return_time ASC;
    `, [requestedDate]);

    // 3. Students who checked out on the selected date and have NOT checked in yet ("STILL OUTSIDE")
    const stillOutsideList = checkedOutRows.filter(row => row.movementStatus === 'STILL_OUTSIDE');

    // 4. Overall hostel occupancy: total students currently in 'OUTSIDE' state
    const [overallOutsideCountRows] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM students 
      WHERE current_hostel_status = 'OUTSIDE';
    `);
    const overallCurrentlyOutside = Number(overallOutsideCountRows[0].count) || 0;

    const totalCheckedOut = checkedOutRows.length;
    const totalCheckedIn = checkedInRows.length;
    // Task 11 formula: Currently Outside for date = Total Valid Check-Outs on date - Students With Valid Check-In
    const currentlyOutsideOnDate = stillOutsideList.length;

    return res.status(200).json({
      success: true,
      date: requestedDate,
      summary: {
        totalCheckedOut,
        totalCheckedIn,
        currentlyOutside: currentlyOutsideOnDate,
        currentlyOutsideOnDate,
        stillOutside: currentlyOutsideOnDate,
        overallHostelOutside: overallCurrentlyOutside,
        overallCurrentlyOutside
      },
      counts: {
        totalCheckedOut,
        totalCheckedIn,
        currentlyOutside: currentlyOutsideOnDate,
        stillOutside: currentlyOutsideOnDate,
        overallHostelOutside: overallCurrentlyOutside
      },
      checkedOutStudents: checkedOutRows,
      checkedInStudents: checkedInRows,
      stillOutsideStudents: stillOutsideList,
      checkedOutList: checkedOutRows,
      checkedInList: checkedInRows,
      stillOutsideList: stillOutsideList
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   2. CARETAKER CHECK-OUT LIST
   ========================================================== */

/**
 * GET /api/gate/checkout-list?date=YYYY-MM-DD
 * Retrieves check-out records with detailed student & outpass info
 * Accessible by Caretaker, Watchman, Warden, and Principal
 */
exports.getCheckoutList = async (req, res, next) => {
  try {
    const { date, filter } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filter === 'today' || (!date && !filter)) {
      whereClause += ' AND DATE(e.exit_time) = CURDATE()';
    } else if (filter === 'yesterday') {
      whereClause += ' AND DATE(e.exit_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
    } else if (date) {
      whereClause += ' AND DATE(e.exit_time) = ?';
      params.push(date.trim());
    }

    const [rows] = await pool.query(`
      SELECT 
        e.id AS exitLogId,
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
        s.phone AS studentPhone,
        s.current_hostel_status AS currentHostelStatus,
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS expectedReturnTime,
        o.status AS outpassStatus,
        st.name AS scannedByName,
        r.id AS returnLogId,
        r.return_time AS returnTime,
        CASE 
          WHEN r.id IS NOT NULL THEN 'RETURNED'
          ELSE 'CURRENTLY_OUTSIDE'
        END AS movementStatus
      FROM exit_logs e
      INNER JOIN students s ON e.student_id = s.id
      INNER JOIN outpass_requests o ON e.outpass_request_id = o.id
      LEFT JOIN staff st ON e.guard_staff_id = st.id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      ${whereClause}
      ORDER BY e.exit_time DESC
      LIMIT 200;
    `, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      checkoutList: rows
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   3. WATCHMAN CHECK-IN / RETURN LIST
   ========================================================== */

/**
 * GET /api/gate/checkin-list?date=YYYY-MM-DD
 * Retrieves check-in records with return timeliness and outpass info
 * Accessible by Caretaker, Watchman, Warden, and Principal
 */
exports.getCheckinList = async (req, res, next) => {
  try {
    const { date, filter } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filter === 'today' || (!date && !filter)) {
      whereClause += ' AND DATE(r.return_time) = CURDATE()';
    } else if (filter === 'yesterday') {
      whereClause += ' AND DATE(r.return_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
    } else if (date) {
      whereClause += ' AND DATE(r.return_time) = ?';
      params.push(date.trim());
    }

    const [rows] = await pool.query(`
      SELECT 
        r.id AS returnLogId,
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
        s.phone AS studentPhone,
        s.current_hostel_status AS currentHostelStatus,
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        e.exit_time AS exitTime,
        o.to_datetime AS expectedReturnTime,
        o.status AS outpassStatus,
        st.name AS scannedByName,
        CASE 
          WHEN r.is_late = 1 THEN 'LATE'
          ELSE 'ON_TIME'
        END AS timelinessStatus,
        CASE 
          WHEN r.is_late = 1 THEN 'LATE'
          ELSE 'ON_TIME'
        END AS returnStatus
      FROM return_logs r
      INNER JOIN students s ON r.student_id = s.id
      INNER JOIN outpass_requests o ON r.outpass_request_id = o.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN staff st ON r.guard_staff_id = st.id
      ${whereClause}
      ORDER BY r.return_time DESC
      LIMIT 200;
    `, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      checkinList: rows
    });

  } catch (error) {
    next(error);
  }
};
