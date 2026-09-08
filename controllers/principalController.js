const { pool } = require('../utils/db');

/* ==========================================================
   1. DASHBOARD OVERVIEW & METRICS
   ========================================================== */

/**
 * GET /api/principal/overview
 * Real-time institutional counters from MySQL
 * Strictly read-only for Principal
 */
exports.getPrincipalOverview = async (req, res, next) => {
  try {
    const [
      [totalStu],
      [insideStu],
      [outsideStu],
      [pendingNormal],
      [pendingDuty],
      [approvedOut],
      [rejectedOut],
      [activeQr],
      [completedOut],
      [pendingExt],
      [lateRet],
      [todayEx],
      [todayRet],
      [todaySub]
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM students WHERE is_active = true;'),
      pool.query('SELECT COUNT(*) AS count FROM students WHERE is_active = true AND current_hostel_status = "INSIDE";'),
      pool.query('SELECT COUNT(*) AS count FROM students WHERE is_active = true AND current_hostel_status = "OUTSIDE";'),
      pool.query('SELECT COUNT(*) AS count FROM outpass_requests WHERE outpass_type = "normal" AND status IN ("PENDING_PARENT", "PENDING_WARDEN");'),
      pool.query('SELECT COUNT(*) AS count FROM outpass_requests WHERE outpass_type IN ("one_day_duty", "duty") AND status = "PENDING_PRINCIPAL";'),
      pool.query('SELECT COUNT(*) AS count FROM outpass_requests WHERE status = "APPROVED";'),
      pool.query('SELECT COUNT(*) AS count FROM outpass_requests WHERE status = "REJECTED";'),
      pool.query('SELECT COUNT(*) AS count FROM qr_codes WHERE status = "ACTIVE";'),
      pool.query('SELECT COUNT(*) AS count FROM outpass_requests WHERE status = "COMPLETED";'),
      pool.query('SELECT COUNT(*) AS count FROM extension_requests WHERE status = "PENDING";'),
      pool.query('SELECT COUNT(*) AS count FROM return_logs WHERE is_late = true;'),
      pool.query('SELECT COUNT(*) AS count FROM exit_logs WHERE DATE(exit_time) = CURDATE();'),
      pool.query('SELECT COUNT(*) AS count FROM return_logs WHERE DATE(return_time) = CURDATE();'),
      pool.query('SELECT COUNT(*) AS count FROM outpass_requests WHERE DATE(created_at) = CURDATE();')
    ]);

    const stats = {
      totalStudents: totalStu[0].count,
      studentsInside: insideStu[0].count,
      studentsOutside: outsideStu[0].count,
      pendingNormalOutpasses: pendingNormal[0].count,
      pendingOneDayPermissions: pendingDuty[0].count,
      pendingOutpasses: pendingNormal[0].count + pendingDuty[0].count,
      approvedOutpasses: approvedOut[0].count,
      rejectedOutpasses: rejectedOut[0].count,
      activeQRCodes: activeQr[0].count,
      completedOutpasses: completedOut[0].count,
      pendingExtensions: pendingExt[0].count,
      lateReturns: lateRet[0].count,
      todayExits: todayEx[0].count,
      todayReturns: todayRet[0].count,
      todaySubmissions: todaySub[0].count,
      serverTime: new Date().toISOString()
    };

    return res.status(200).json({
      success: true,
      stats
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   2. STUDENT HOSTEL STATUS WITH MULTI-FILTERS
   ========================================================== */

/**
 * GET /api/principal/student-status
 * Real-time hostel residency roster and departure tracker
 */
exports.getStudentStatus = async (req, res, next) => {
  try {
    const { department, year, hostel_block, status, search } = req.query;

    let whereClauses = ['s.is_active = true'];
    const params = [];

    if (department && department !== 'all') {
      whereClauses.push('s.department = ?');
      params.push(department);
    }

    if (year && year !== 'all') {
      whereClauses.push('s.year_of_study = ?');
      params.push(Number(year));
    }

    if (hostel_block && hostel_block !== 'all') {
      whereClauses.push('s.hostel_block = ?');
      params.push(hostel_block);
    }

    if (search && search.trim()) {
      whereClauses.push('(s.name LIKE ? OR s.reg_no LIKE ? OR s.room_no LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        s.id AS studentId,
        s.reg_no AS rollNumber,
        s.name AS studentName,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        s.phone AS studentPhone,
        s.current_hostel_status AS currentHostelStatus,
        latest_op.id AS outpassId,
        latest_op.request_code AS requestCode,
        latest_op.outpass_type AS requestType,
        latest_op.status AS outpassStatus,
        latest_op.destination,
        latest_op.from_datetime AS leavingTime,
        latest_op.to_datetime AS expectedReturnTime,
        latest_ex.exit_time AS exitTime,
        latest_ret.return_time AS actualReturnTime,
        latest_ret.is_late AS isLate,
        latest_ret.late_duration_minutes AS lateDurationMinutes,
        ext.status AS extensionStatus,
        ext.extended_to_datetime AS extensionUntil
      FROM students s
      LEFT JOIN (
        SELECT o1.*
        FROM outpass_requests o1
        INNER JOIN (
          SELECT student_id, MAX(id) AS max_id
          FROM outpass_requests
          GROUP BY student_id
        ) o2 ON o1.id = o2.max_id
      ) latest_op ON s.id = latest_op.student_id
      LEFT JOIN exit_logs latest_ex ON latest_op.id = latest_ex.outpass_request_id
      LEFT JOIN return_logs latest_ret ON latest_op.id = latest_ret.outpass_request_id
      LEFT JOIN (
        SELECT e1.*
        FROM extension_requests e1
        INNER JOIN (
          SELECT outpass_request_id, MAX(id) AS max_ext_id
          FROM extension_requests
          GROUP BY outpass_request_id
        ) e2 ON e1.id = e2.max_ext_id
      ) ext ON latest_op.id = ext.outpass_request_id
      ${whereSql}
      ORDER BY 
        CASE 
          WHEN s.current_hostel_status = 'OUTSIDE' THEN 1 
          ELSE 2 
        END,
        s.department ASC,
        s.reg_no ASC
      LIMIT 200;
    `;

    const [rows] = await pool.query(query, params);

    const now = new Date();

    // Map and calculate computed status for each student
    let students = rows.map(r => {
      let computedStatus = 'INSIDE_HOSTEL';
      let isOverdue = false;

      if (r.currentHostelStatus === 'OUTSIDE') {
        computedStatus = 'OUTSIDE_HOSTEL';
        if (r.expectedReturnTime && now > new Date(r.expectedReturnTime)) {
          isOverdue = true;
          computedStatus = 'LATE_RETURN';
        }
      } else if (r.actualReturnTime) {
        if (r.isLate) {
          computedStatus = 'LATE_RETURN';
        } else {
          computedStatus = 'COMPLETED';
        }
      }

      return {
        studentId: r.studentId,
        rollNumber: r.rollNumber,
        studentName: r.studentName,
        department: r.department,
        yearOfStudy: r.yearOfStudy,
        hostelBlock: r.hostelBlock,
        roomNumber: r.roomNumber,
        studentPhone: r.studentPhone,
        currentHostelStatus: r.currentHostelStatus,
        computedStatus,
        isOverdue,
        latestPass: r.outpassId ? {
          outpassId: r.outpassId,
          requestCode: r.requestCode,
          requestType: r.requestType,
          status: r.outpassStatus,
          destination: r.destination,
          leavingTime: r.leavingTime,
          expectedReturnTime: r.expectedReturnTime,
          exitTime: r.exitTime,
          actualReturnTime: r.actualReturnTime,
          isLate: Boolean(r.isLate),
          lateDurationMinutes: r.lateDurationMinutes || 0,
          extensionStatus: r.extensionStatus || null,
          extensionUntil: r.extensionUntil || null
        } : null
      };
    });

    // Apply status filter if provided
    if (status && status !== 'all') {
      const normalizedStatus = status.toUpperCase().trim();
      students = students.filter(s => s.computedStatus === normalizedStatus || s.currentHostelStatus === normalizedStatus);
    }

    return res.status(200).json({
      success: true,
      count: students.length,
      students
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   2B. NORMAL OUTPASS MONITORING (READ-ONLY)
   ========================================================== */

/**
 * GET /api/principal/normal-outpasses
 * Read-only monitoring of Normal Outpass requests
 */
exports.getNormalOutpasses = async (req, res, next) => {
  try {
    const { status, search } = req.query;

    let whereClause = 'o.outpass_type = "normal"';
    const params = [];

    if (status && status !== 'all') {
      if (status === 'pending') {
        whereClause += ' AND o.status IN ("PENDING_PARENT", "PENDING_WARDEN")';
      } else {
        whereClause += ' AND o.status = ?';
        params.push(status.toUpperCase());
      }
    }

    if (search && search.trim()) {
      whereClause += ' AND (s.name LIKE ? OR s.reg_no LIKE ? OR o.request_code LIKE ? OR o.destination LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination AS placeOfVisit,
        o.reason AS purpose,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.parent_approval_status AS parentStatus,
        o.warden_approval_status AS wardenStatus,
        o.status,
        o.created_at AS submittedTime,
        q.status AS qrStatus,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        s.current_hostel_status AS currentStatus,
        e.exit_time AS exitTime,
        r.return_time AS actualReturnTime,
        r.is_late AS isLate,
        r.late_duration_minutes AS lateDurationMinutes
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN qr_codes q ON o.id = q.outpass_request_id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC;
    `, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      normalOutpasses: rows
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   2C. ONE-DAY PERMISSION REQUESTS FOR PRINCIPAL APPROVAL
   ========================================================== */

/**
 * GET /api/principal/one-day-permissions
 * Retrieve One-Day Permission requests specifically for Principal decision-making
 */
exports.getPendingOneDayPermissions = async (req, res, next) => {
  try {
    const { status = 'PENDING_PRINCIPAL', department, search } = req.query;

    let whereClause = 'o.outpass_type IN ("one_day_duty", "duty")';
    const params = [];

    if (status && status !== 'all') {
      whereClause += ' AND o.status = ?';
      params.push(status.toUpperCase());
    }

    if (department && department !== 'all') {
      whereClause += ' AND s.department = ?';
      params.push(department);
    }

    if (search && search.trim()) {
      whereClause += ' AND (s.name LIKE ? OR s.reg_no LIKE ? OR o.request_code LIKE ? OR o.event_name LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.event_name AS eventName,
        o.event_location AS eventLocation,
        o.duty_date AS dutyDate,
        o.duty_description AS dutyDescription,
        o.reason AS purpose,
        o.destination,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.advisor_approval_status AS advisorStatus,
        o.advisor_approved_at AS advisorApprovedAt,
        o.principal_approval_status AS principalStatus,
        o.principal_approved_at AS principalApprovedAt,
        o.principal_rejection_reason AS principalRejectionReason,
        o.created_at AS submittedTime,
        s.id AS studentId,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        s.phone AS studentPhone,
        adv.name AS advisorName,
        adv.staff_id AS advisorStaffId
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN staff adv ON o.advisor_approved_by_id = adv.id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC;
    `, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      permissions: rows
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   3. OUTPASS OVERVIEW & DATE-FILTERED SUMMARY
   ========================================================== */

/**
 * GET /api/principal/outpass-overview
 * Aggregate breakdown and master outpass records
 */
exports.getOutpassOverview = async (req, res, next) => {
  try {
    const { filter, startDate, endDate, type, status } = req.query;

    let dateWhere = '1=1';
    const params = [];

    if (filter === 'today') {
      dateWhere = 'DATE(o.created_at) = CURDATE()';
    } else if (filter === 'week') {
      dateWhere = 'o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (filter === 'month') {
      dateWhere = 'o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    } else if (filter === 'custom' && startDate && endDate) {
      dateWhere = 'DATE(o.created_at) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    let extraFilter = '';
    if (type && type !== 'all') {
      extraFilter += ' AND o.outpass_type = ?';
      params.push(type);
    }

    if (status && status !== 'all') {
      if (status === 'pending') {
        extraFilter += ' AND o.status IN ("PENDING_PARENT", "PENDING_ADVISOR", "PENDING_WARDEN")';
      } else {
        extraFilter += ' AND o.status = ?';
        params.push(status.toUpperCase());
      }
    }

    // Aggregations within the selected window
    const [aggRows] = await pool.query(`
      SELECT 
        COUNT(*) AS totalRequests,
        SUM(CASE WHEN o.outpass_type = 'normal' THEN 1 ELSE 0 END) AS normalRequests,
        SUM(CASE WHEN o.outpass_type = 'one_day_duty' THEN 1 ELSE 0 END) AS dutyRequests,
        SUM(CASE WHEN o.status IN ('PENDING_PARENT', 'PENDING_ADVISOR', 'PENDING_WARDEN') THEN 1 ELSE 0 END) AS pendingRequests,
        SUM(CASE WHEN o.status = 'APPROVED' THEN 1 ELSE 0 END) AS approvedRequests,
        SUM(CASE WHEN o.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejectedRequests,
        SUM(CASE WHEN o.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedRequests
      FROM outpass_requests o
      WHERE ${dateWhere} ${extraFilter};
    `, params);

    const summary = aggRows[0] || {
      totalRequests: 0,
      normalRequests: 0,
      dutyRequests: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      rejectedRequests: 0,
      completedRequests: 0
    };

    // Detailed records
    const [rows] = await pool.query(`
      SELECT 
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS expectedReturnTime,
        o.status,
        o.created_at AS requestedAt,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        e.exit_time AS exitTime,
        r.return_time AS actualReturnTime,
        r.is_late AS isLate,
        r.late_duration_minutes AS lateDurationMinutes,
        ext.status AS extensionStatus,
        ext.approved_valid_until AS extensionApprovedTime
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      LEFT JOIN extension_requests ext ON (ext.outpass_request_id = o.id AND ext.status = 'APPROVED')
      WHERE ${dateWhere} ${extraFilter}
      ORDER BY o.created_at DESC
      LIMIT 100;
    `, params);

    return res.status(200).json({
      success: true,
      summary,
      count: rows.length,
      outpasses: rows
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   4. TODAY'S REAL-TIME ACTIVITY TIMELINE
   ========================================================== */

/**
 * GET /api/principal/today-activity
 * Consolidated live timeline of all hostel outpass operations today
 */
exports.getTodayActivity = async (req, res, next) => {
  try {
    const [
      submissions,
      parentApprovals,
      advisorApprovals,
      wardenApprovals,
      exits,
      returns,
      extensions
    ] = await Promise.all([
      pool.query(`
        SELECT 
          o.id, o.request_code AS requestCode, o.outpass_type AS type,
          s.name AS studentName, s.reg_no AS rollNumber, s.department,
          o.created_at AS timestamp,
          'SUBMISSION' AS activityType,
          CONCAT('Submitted new ', IF(o.outpass_type='one_day_duty', 'One-Day Duty', 'Normal Outpass'), ' request.') AS description
        FROM outpass_requests o
        INNER JOIN students s ON o.student_id = s.id
        WHERE DATE(o.created_at) = CURDATE()
        LIMIT 50;
      `),
      pool.query(`
        SELECT 
          o.id, o.request_code AS requestCode, o.outpass_type AS type,
          s.name AS studentName, s.reg_no AS rollNumber, s.department,
          o.parent_approved_at AS timestamp,
          'PARENT_APPROVAL' AS activityType,
          'Parent granted biometric/consent approval.' AS description
        FROM outpass_requests o
        INNER JOIN students s ON o.student_id = s.id
        WHERE o.parent_approved_at IS NOT NULL AND DATE(o.parent_approved_at) = CURDATE()
        LIMIT 50;
      `),
      pool.query(`
        SELECT 
          o.id, o.request_code AS requestCode, o.outpass_type AS type,
          s.name AS studentName, s.reg_no AS rollNumber, s.department,
          o.advisor_approved_at AS timestamp,
          'ADVISOR_APPROVAL' AS activityType,
          'Class Advisor granted academic clearance for One-Day Duty.' AS description
        FROM outpass_requests o
        INNER JOIN students s ON o.student_id = s.id
        WHERE o.advisor_approved_at IS NOT NULL AND DATE(o.advisor_approved_at) = CURDATE()
        LIMIT 50;
      `),
      pool.query(`
        SELECT 
          o.id, o.request_code AS requestCode, o.outpass_type AS type,
          s.name AS studentName, s.reg_no AS rollNumber, s.department,
          o.approved_at AS timestamp,
          'WARDEN_APPROVAL' AS activityType,
          'Hostel Warden approved pass and authorized gate clearance.' AS description
        FROM outpass_requests o
        INNER JOIN students s ON o.student_id = s.id
        WHERE o.approved_at IS NOT NULL AND DATE(o.approved_at) = CURDATE()
        LIMIT 50;
      `),
      pool.query(`
        SELECT 
          o.id, o.request_code AS requestCode, o.outpass_type AS type,
          s.name AS studentName, s.reg_no AS rollNumber, s.department,
          e.exit_time AS timestamp,
          'GATE_EXIT' AS activityType,
          'Caretaker verified QR and logged gate departure.' AS description
        FROM exit_logs e
        INNER JOIN outpass_requests o ON e.outpass_request_id = o.id
        INNER JOIN students s ON e.student_id = s.id
        WHERE DATE(e.exit_time) = CURDATE()
        LIMIT 50;
      `),
      pool.query(`
        SELECT 
          o.id, o.request_code AS requestCode, o.outpass_type AS type,
          s.name AS studentName, s.reg_no AS rollNumber, s.department,
          r.return_time AS timestamp,
          'GATE_RETURN' AS activityType,
          IF(r.is_late = 1, CONCAT('Watchman logged LATE return (', r.late_duration_minutes, ' mins late).'), 'Watchman logged ON-TIME return check-in.') AS description
        FROM return_logs r
        INNER JOIN outpass_requests o ON r.outpass_request_id = o.id
        INNER JOIN students s ON r.student_id = s.id
        WHERE DATE(r.return_time) = CURDATE()
        LIMIT 50;
      `),
      pool.query(`
        SELECT 
          o.id, o.request_code AS requestCode, o.outpass_type AS type,
          s.name AS studentName, s.reg_no AS rollNumber, s.department,
          ext.created_at AS timestamp,
          'EXTENSION' AS activityType,
          CONCAT('Emergency extension requested: ', ext.status, ' (Reason: ', ext.reason, ')') AS description
        FROM extension_requests ext
        INNER JOIN outpass_requests o ON ext.outpass_request_id = o.id
        INNER JOIN students s ON ext.student_id = s.id
        WHERE DATE(ext.created_at) = CURDATE()
        LIMIT 50;
      `)
    ]);

    // Combine all events
    const allActivities = [
      ...submissions[0],
      ...parentApprovals[0],
      ...advisorApprovals[0],
      ...wardenApprovals[0],
      ...exits[0],
      ...returns[0],
      ...extensions[0]
    ];

    // Sort newest first
    allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.status(200).json({
      success: true,
      count: allActivities.length,
      activities: allActivities.slice(0, 100)
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   5. ANALYTICS & CHART DATA ENGINE
   ========================================================== */

/**
 * GET /api/principal/analytics
 * Real-time MySQL aggregation data for 6 institutional charts
 */
exports.getAnalytics = async (req, res, next) => {
  try {
    const [
      [chart1Rows],
      [chart2Rows],
      [chart3Rows],
      [chart4Exits],
      [chart4Returns],
      [chart5Rows],
      [chart6Rows]
    ] = await Promise.all([
      // Chart 1: Outpass Requests by Day (Last 14 days)
      pool.query(`
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m-%d') AS dayDate,
          DATE_FORMAT(created_at, '%b %d') AS dayLabel,
          COUNT(*) AS requestCount
        FROM outpass_requests
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
        GROUP BY dayDate, dayLabel
        ORDER BY dayDate ASC;
      `),

      // Chart 2: Approval vs Rejection vs Pending
      pool.query(`
        SELECT 
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approvedCount,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejectedCount,
          SUM(CASE WHEN status IN ('PENDING_PARENT', 'PENDING_ADVISOR', 'PENDING_WARDEN') THEN 1 ELSE 0 END) AS pendingCount,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedCount
        FROM outpass_requests;
      `),

      // Chart 3: Normal vs One-Day Duty
      pool.query(`
        SELECT 
          SUM(CASE WHEN outpass_type = 'normal' THEN 1 ELSE 0 END) AS normalCount,
          SUM(CASE WHEN outpass_type = 'one_day_duty' THEN 1 ELSE 0 END) AS dutyCount
        FROM outpass_requests;
      `),

      // Chart 4: Exit activity by day (Last 7 days)
      pool.query(`
        SELECT 
          DATE_FORMAT(exit_time, '%Y-%m-%d') AS dayDate,
          DATE_FORMAT(exit_time, '%b %d') AS dayLabel,
          COUNT(*) AS exitCount
        FROM exit_logs
        WHERE exit_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY dayDate, dayLabel
        ORDER BY dayDate ASC;
      `),

      // Chart 4: Return activity by day (Last 7 days)
      pool.query(`
        SELECT 
          DATE_FORMAT(return_time, '%Y-%m-%d') AS dayDate,
          DATE_FORMAT(return_time, '%b %d') AS dayLabel,
          COUNT(*) AS returnCount
        FROM return_logs
        WHERE return_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY dayDate, dayLabel
        ORDER BY dayDate ASC;
      `),

      // Chart 5: Late Returns trend by day (Last 7 days)
      pool.query(`
        SELECT 
          DATE_FORMAT(return_time, '%Y-%m-%d') AS dayDate,
          DATE_FORMAT(return_time, '%b %d') AS dayLabel,
          COUNT(*) AS lateCount
        FROM return_logs
        WHERE is_late = true AND return_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY dayDate, dayLabel
        ORDER BY dayDate ASC;
      `),

      // Chart 6: Extension Requests breakdown
      pool.query(`
        SELECT 
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pendingExt,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approvedExt,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejectedExt
        FROM extension_requests;
      `)
    ]);

    // Build Chart 1
    const chart1 = {
      labels: chart1Rows.map(r => r.dayLabel),
      data: chart1Rows.map(r => r.requestCount)
    };

    // Build Chart 2
    const c2 = chart2Rows[0] || {};
    const chart2 = {
      labels: ['Approved', 'Rejected', 'Pending', 'Completed'],
      data: [
        Number(c2.approvedCount || 0),
        Number(c2.rejectedCount || 0),
        Number(c2.pendingCount || 0),
        Number(c2.completedCount || 0)
      ]
    };

    // Build Chart 3
    const c3 = chart3Rows[0] || {};
    const chart3 = {
      labels: ['Normal Outpass', 'One-Day Duty (OD)'],
      data: [Number(c3.normalCount || 0), Number(c3.dutyCount || 0)]
    };

    // Build Chart 4 (Combined timeline)
    const allDaysMap = new Map();
    chart4Exits.forEach(r => {
      allDaysMap.set(r.dayDate, { label: r.dayLabel, exits: r.exitCount, returns: 0 });
    });
    chart4Returns.forEach(r => {
      if (allDaysMap.has(r.dayDate)) {
        allDaysMap.get(r.dayDate).returns = r.returnCount;
      } else {
        allDaysMap.set(r.dayDate, { label: r.dayLabel, exits: 0, returns: r.returnCount });
      }
    });

    const sortedDays = Array.from(allDaysMap.keys()).sort();
    const chart4 = {
      labels: sortedDays.map(k => allDaysMap.get(k).label),
      exits: sortedDays.map(k => allDaysMap.get(k).exits),
      returns: sortedDays.map(k => allDaysMap.get(k).returns)
    };

    // Build Chart 5
    const chart5 = {
      labels: chart5Rows.map(r => r.dayLabel),
      data: chart5Rows.map(r => r.lateCount)
    };

    // Build Chart 6
    const c6 = chart6Rows[0] || {};
    const chart6 = {
      labels: ['Approved', 'Pending', 'Rejected'],
      data: [
        Number(c6.approvedExt || 0),
        Number(c6.pendingExt || 0),
        Number(c6.rejectedExt || 0)
      ]
    };

    return res.status(200).json({
      success: true,
      analytics: {
        chart1_requestsByDay: chart1,
        chart2_approvalRatio: chart2,
        chart3_typeDistribution: chart3,
        chart4_movementActivity: chart4,
        chart5_lateReturnsTrend: chart5,
        chart6_extensionStats: chart6
      }
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   6. INSTITUTIONAL REPORTS (7 DEDICATED REPORT TYPES)
   ========================================================== */

/**
 * GET /api/principal/reports/daily
 */
exports.getDailyReport = async (req, res, next) => {
  try {
    const reportDate = req.query.date || new Date().toISOString().split('T')[0];

    const [rows] = await pool.query(`
      SELECT 
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        o.destination,
        o.reason AS purpose,
        o.from_datetime AS leavingTime,
        o.to_datetime AS expectedReturnTime,
        e.exit_time AS exitTime,
        r.return_time AS actualReturnTime,
        o.status AS outpassStatus,
        r.is_late AS isLate,
        r.late_duration_minutes AS lateDurationMinutes
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE DATE(o.created_at) = ? OR DATE(e.exit_time) = ? OR DATE(r.return_time) = ?
      ORDER BY o.created_at DESC;
    `, [reportDate, reportDate, reportDate]);

    return res.status(200).json({
      success: true,
      reportType: 'Daily Outpass Report',
      reportDate,
      count: rows.length,
      records: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/principal/reports/monthly
 */
exports.getMonthlyReport = async (req, res, next) => {
  try {
    const now = new Date();
    const year = req.query.year || now.getFullYear();
    const month = req.query.month || (now.getMonth() + 1);

    const [rows] = await pool.query(`
      SELECT 
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        o.destination,
        o.reason AS purpose,
        o.from_datetime AS leavingTime,
        o.to_datetime AS expectedReturnTime,
        e.exit_time AS exitTime,
        r.return_time AS actualReturnTime,
        o.status AS outpassStatus,
        r.is_late AS isLate,
        r.late_duration_minutes AS lateDurationMinutes,
        o.created_at AS requestedAt
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE YEAR(o.created_at) = ? AND MONTH(o.created_at) = ?
      ORDER BY o.created_at DESC;
    `, [year, month]);

    return res.status(200).json({
      success: true,
      reportType: 'Monthly Outpass Report',
      period: `${year}-${String(month).padStart(2, '0')}`,
      count: rows.length,
      records: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/principal/reports/outside-students
 */
exports.getOutsideStudentsReport = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
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
        e.exit_time AS exitTime,
        o.to_datetime AS expectedReturnTime,
        ext.status AS extensionStatus,
        ext.extended_to_datetime AS extendedUntil,
        TIMESTAMPDIFF(MINUTE, o.to_datetime, NOW()) AS overdueMinutes
      FROM students s
      INNER JOIN outpass_requests o ON (
        o.student_id = s.id AND o.status = 'APPROVED'
      )
      INNER JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN extension_requests ext ON (ext.outpass_request_id = o.id AND ext.status = 'APPROVED')
      WHERE s.current_hostel_status = 'OUTSIDE'
      ORDER BY e.exit_time ASC;
    `);

    const now = new Date();
    const formatted = rows.map(r => ({
      ...r,
      isOverdue: now > new Date(r.expectedReturnTime),
      overdueMinutes: now > new Date(r.expectedReturnTime) 
        ? Math.max(1, Math.ceil((now.getTime() - new Date(r.expectedReturnTime).getTime()) / 60000))
        : 0
    }));

    return res.status(200).json({
      success: true,
      reportType: 'Students Outside Hostel Report',
      count: formatted.length,
      records: formatted
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/principal/reports/late-returns
 */
exports.getLateReturnsReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateWhere = 'r.is_late = true';
    const params = [];

    if (startDate && endDate) {
      dateWhere += ' AND DATE(r.return_time) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const [rows] = await pool.query(`
      SELECT 
        r.id AS returnLogId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        o.to_datetime AS expectedReturnTime,
        r.return_time AS actualReturnTime,
        r.late_duration_minutes AS lateDurationMinutes,
        ext.status AS extensionStatus,
        ext.previous_valid_until AS originalDeadline,
        ext.approved_valid_until AS extendedDeadline
      FROM return_logs r
      INNER JOIN outpass_requests o ON r.outpass_request_id = o.id
      INNER JOIN students s ON r.student_id = s.id
      LEFT JOIN extension_requests ext ON (ext.outpass_request_id = o.id AND ext.status = 'APPROVED')
      WHERE ${dateWhere}
      ORDER BY r.return_time DESC;
    `, params);

    return res.status(200).json({
      success: true,
      reportType: 'Late Return Report',
      count: rows.length,
      records: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/principal/reports/extensions
 */
exports.getExtensionsReport = async (req, res, next) => {
  try {
    const { startDate, endDate, status } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (startDate && endDate) {
      whereClause += ' AND DATE(ext.created_at) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    if (status && status !== 'all') {
      whereClause += ' AND ext.status = ?';
      params.push(status.toUpperCase());
    }

    const [rows] = await pool.query(`
      SELECT 
        ext.id AS extensionId,
        o.request_code AS requestCode,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        ext.previous_valid_until AS originalReturnTime,
        ext.extended_to_datetime AS requestedReturnTime,
        ext.approved_valid_until AS approvedReturnTime,
        ext.reason,
        ext.status,
        ext.rejection_reason AS rejectionReason,
        ext.created_at AS requestedAt,
        ext.reviewed_at AS reviewedAt,
        st.name AS reviewedByName
      FROM extension_requests ext
      INNER JOIN outpass_requests o ON ext.outpass_request_id = o.id
      INNER JOIN students s ON ext.student_id = s.id
      LEFT JOIN staff st ON ext.reviewed_by_staff_id = st.id
      WHERE ${whereClause}
      ORDER BY ext.created_at DESC;
    `, params);

    return res.status(200).json({
      success: true,
      reportType: 'Emergency Extension Report',
      count: rows.length,
      records: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/principal/reports/one-day-duty
 */
exports.getOneDayDutyReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateWhere = 'o.outpass_type = "one_day_duty"';
    const params = [];

    if (startDate && endDate) {
      dateWhere += ' AND DATE(o.created_at) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const [rows] = await pool.query(`
      SELECT 
        o.id AS outpassId,
        o.request_code AS requestCode,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        o.event_name AS eventName,
        o.event_location AS eventLocation,
        o.duty_date AS dutyDate,
        o.duty_description AS dutyDescription,
        o.from_datetime AS leavingTime,
        o.to_datetime AS expectedReturnTime,
        o.status AS outpassStatus,
        adv.name AS advisorName,
        wrd.name AS wardenName
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN staff adv ON o.advisor_approved_by_id = adv.id
      LEFT JOIN staff wrd ON o.approved_by_warden_id = wrd.id
      WHERE ${dateWhere}
      ORDER BY o.created_at DESC;
    `, params);

    return res.status(200).json({
      success: true,
      reportType: 'One-Day Duty (OD) Report',
      count: rows.length,
      records: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/principal/reports/normal
 */
exports.getNormalOutpassReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let dateWhere = 'o.outpass_type = "normal"';
    const params = [];

    if (startDate && endDate) {
      dateWhere += ' AND DATE(o.created_at) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    const [rows] = await pool.query(`
      SELECT 
        o.id AS outpassId,
        o.request_code AS requestCode,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        o.destination,
        o.reason AS purpose,
        o.from_datetime AS leavingTime,
        o.to_datetime AS expectedReturnTime,
        o.status AS outpassStatus,
        p.father_name AS parentName,
        wrd.name AS wardenName
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      LEFT JOIN staff wrd ON o.approved_by_warden_id = wrd.id
      WHERE ${dateWhere}
      ORDER BY o.created_at DESC;
    `, params);

    return res.status(200).json({
      success: true,
      reportType: 'Normal Outpass Report',
      count: rows.length,
      records: rows
    });

  } catch (error) {
    next(error);
  }
};
