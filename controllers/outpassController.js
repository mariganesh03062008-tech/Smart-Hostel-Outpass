const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool } = require('../utils/db');
const notificationService = require('../services/notificationService');
const { validateAdvanceSubmissionTime } = require('../utils/timeValidator');

/**
 * Helper to generate a unique request code
 * e.g., OUT-2026-8741 or OD-2026-9214
 */
function generateRequestCode(type) {
  const prefix = type === 'one_day_duty' ? 'OD' : 'OUT';
  const year = new Date().getFullYear();
  const timeSuffix = Date.now().toString().slice(-4);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${year}-${timeSuffix}${rand}`;
}

/* ==========================================================
   1. STUDENT CONTROLLERS
   ========================================================== */

/**
 * POST /api/outpass
 * Submit a new outpass request (Normal Outpass or One-Day Duty)
 * Accessible ONLY by authenticated students
 */
exports.createOutpass = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    // Fetch verified student data from DB (never trust client-supplied identity)
    const [students] = await pool.query(
      'SELECT id, name, reg_no, department, year_of_study, hostel_block, room_no, phone, parent_id, class_advisor_id FROM students WHERE id = ?',
      [studentId]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student profile record not found in system.'
      });
    }

    const student = students[0];

    const {
      request_type,
      reason,
      destination,
      semester,
      student_phone,
      leaving_date,
      leaving_time,
      expected_return_date,
      expected_return_time,
      event_name,
      event_location,
      duty_date,
      duty_description
    } = req.body;

    // 1. Validate request_type
    const outpassType = (request_type === 'duty' || request_type === 'one_day_duty') ? 'one_day_duty' : 'normal';
    const isDuty = outpassType === 'one_day_duty';

    // 2. Common Required Field Validation
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reason for outpass / purpose of visit is required.'
      });
    }

    if (!destination || typeof destination !== 'string' || !destination.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Destination / place of visit is required.'
      });
    }

    if (!leaving_date || !leaving_time || !expected_return_date || !expected_return_time) {
      return res.status(400).json({
        success: false,
        message: 'Leaving date, leaving time, expected return date, and expected return time are required.'
      });
    }

    // 3. Date & Time Validation
    const fromDatetimeStr = `${leaving_date} ${leaving_time.length === 5 ? leaving_time + ':00' : leaving_time}`;
    const toDatetimeStr = `${expected_return_date} ${expected_return_time.length === 5 ? expected_return_time + ':00' : expected_return_time}`;

    const fromDate = new Date(fromDatetimeStr);
    const toDate = new Date(toDatetimeStr);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date or time format provided.'
      });
    }

    if (toDate <= fromDate) {
      return res.status(400).json({
        success: false,
        message: 'Expected return date & time must be later than leaving date & time.'
      });
    }

    // 3.1 Advance Request Time Validation (Normal: 18h advance, One-Day: 12h advance)
    const advanceValidation = validateAdvanceSubmissionTime(outpassType, fromDate, new Date());
    if (!advanceValidation.allowed) {
      return res.status(400).json({
        success: false,
        code: advanceValidation.code,
        message: advanceValidation.message,
        required_hours: advanceValidation.required_hours,
        departure_time: advanceValidation.departure_time,
        latest_submission_time: advanceValidation.latest_submission_time
      });
    }

    // 4. One-Day Duty Specific Validation
    if (isDuty) {
      if (!event_name || typeof event_name !== 'string' || !event_name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Duty / Event Name is required for One-Day Duty requests.'
        });
      }
      if (!event_location || typeof event_location !== 'string' || !event_location.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Event Location / Venue is required for One-Day Duty requests.'
        });
      }
      if (!duty_date) {
        return res.status(400).json({
          success: false,
          message: 'Duty Date is required for One-Day Duty requests.'
        });
      }
    }

    // 5. Phone Validation
    const contactPhone = (student_phone && typeof student_phone === 'string' && student_phone.trim()) 
      ? student_phone.trim() 
      : student.phone;

    if (!/^[0-9+\s-]{8,20}$/.test(contactPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please provide a valid 10-digit mobile number.'
      });
    }

    // 5.1 Mandatory Student Live Location Security Enforcement
    // Requirement: Student location is compulsory for outpass submission.
    const [studentLocRows] = await pool.query(
      'SELECT latitude, longitude, accuracy, captured_at, updated_at FROM student_locations WHERE student_id = ? ORDER BY COALESCE(captured_at, updated_at) DESC LIMIT 1',
      [student.id]
    );

    if (studentLocRows.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'STUDENT_LOCATION_REQUIRED',
        message: 'Current student location is required before submitting an outpass. Please enable GPS location access on your device and refresh your location.'
      });
    }

    const studentLoc = studentLocRows[0];
    const studentLat = Number(studentLoc.latitude);
    const studentLng = Number(studentLoc.longitude);
    const studentAccuracy = Number(studentLoc.accuracy);
    const locTimestamp = studentLoc.captured_at || studentLoc.updated_at;

    // Validate coordinate boundaries & accuracy
    if (isNaN(studentLat) || isNaN(studentLng) || studentLat < -90 || studentLat > 90 || studentLng < -180 || studentLng > 180) {
      return res.status(400).json({
        success: false,
        code: 'STUDENT_LOCATION_REQUIRED',
        message: 'Recorded student GPS coordinates are invalid. Please update your location before submitting.'
      });
    }

    if (isNaN(studentAccuracy) || studentAccuracy <= 0 || studentAccuracy > 50) {
      return res.status(400).json({
        success: false,
        code: 'STUDENT_LOCATION_REQUIRED',
        message: 'Student GPS accuracy is insufficient for security verification (must be within 50 meters). Please move to an open area and refresh your location.'
      });
    }

    // Freshness check: must be within 5 minutes
    const locAgeMinutes = (Date.now() - new Date(locTimestamp).getTime()) / (1000 * 60);
    if (locAgeMinutes > 5) {
      return res.status(400).json({
        success: false,
        code: 'STUDENT_LOCATION_REQUIRED',
        message: 'Your recorded location is outdated (older than 5 minutes). Please tap "Update My Location" to refresh your GPS before submitting an outpass.'
      });
    }

    // 6. Workflow Status Determination
    // Normal Outpass: Student -> Parent -> Warden (Status: PENDING_PARENT)
    // One-Day Duty: Student -> Class Advisor -> Principal (Status: PENDING_ADVISOR)
    const initialStatus = isDuty ? 'PENDING_ADVISOR' : 'PENDING_PARENT';
    const parentStatus = isDuty ? 'not_required' : 'pending';
    const advisorStatus = isDuty ? 'pending' : 'not_required';
    const wardenStatus = 'pending';
    const requestCode = generateRequestCode(outpassType);

    // 7. Insert Outpass Request in MySQL
    const [insertResult] = await pool.query(`
      INSERT INTO outpass_requests (
        request_code,
        student_id,
        outpass_type,
        reason,
        destination,
        semester,
        student_phone,
        event_name,
        event_location,
        duty_date,
        duty_description,
        from_datetime,
        to_datetime,
        parent_approval_status,
        advisor_approval_status,
        warden_approval_status,
        principal_approval_status,
        status,
        overall_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_required', ?, 'pending')
    `, [
      requestCode,
      student.id,
      outpassType,
      reason.trim(),
      destination.trim(),
      semester || `Semester ${student.year_of_study * 2}`,
      contactPhone,
      isDuty ? event_name.trim() : null,
      isDuty ? event_location.trim() : null,
      isDuty ? duty_date : null,
      isDuty && duty_description ? duty_description.trim() : null,
      fromDatetimeStr,
      toDatetimeStr,
      parentStatus,
      advisorStatus,
      wardenStatus,
      initialStatus
    ]);

    const outpassId = insertResult.insertId;

    // If duty, also record into one_day_duty_requests table for full referential parity
    if (isDuty) {
      await pool.query(`
        INSERT INTO one_day_duty_requests (
          request_code,
          student_id,
          event_name,
          organization_venue,
          duty_date,
          departure_time,
          expected_return_time,
          advisor_approval_status,
          warden_approval_status,
          overall_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 'pending')
        ON DUPLICATE KEY UPDATE event_name = VALUES(event_name);
      `, [
        requestCode,
        student.id,
        event_name.trim(),
        event_location.trim(),
        duty_date,
        leaving_time.length === 5 ? leaving_time + ':00' : leaving_time,
        expected_return_time.length === 5 ? expected_return_time + ':00' : expected_return_time
      ]).catch(err => console.warn('[Duty table sync warning]:', err.message));
    }

    // 8. Trigger Workflow Notifications
    if (isDuty) {
      // Notify Class Advisor
      await notificationService.notifyAdvisor({
        advisorId: student.class_advisor_id,
        department: student.department,
        title: 'New One-Day Permission Request',
        message: `Student ${student.name} (${student.reg_no}) submitted a One-Day Duty request (${requestCode}) for ${event_name.trim()} on ${duty_date}.`,
        type: 'OUTPASS_SUBMITTED',
        referenceId: outpassId,
        linkUrl: '/advisor-dashboard.html',
        io: req.io
      }).catch(err => console.warn('[Notif Error]:', err.message));
    } else {
      // Notify Parent
      if (student.parent_id) {
        await notificationService.notifyParent({
          parentId: student.parent_id,
          title: 'New Outpass Request Submitted',
          message: `Your child ${student.name} (${student.reg_no}) submitted a Normal Outpass request (${requestCode}) to ${destination.trim()}. Action required.`,
          type: 'OUTPASS_SUBMITTED',
          referenceId: outpassId,
          linkUrl: '/parent-dashboard.html',
          io: req.io
        }).catch(err => console.warn('[Notif Error]:', err.message));
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Outpass request submitted successfully.',
      data: {
        id: outpassId,
        requestCode,
        requestType: isDuty ? 'One-Day Duty' : 'Normal Outpass',
        status: initialStatus,
        destination: destination.trim(),
        fromDatetime: fromDatetimeStr,
        toDatetime: toDatetimeStr,
        submittedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/my-requests
 * Retrieve all outpass requests for the authenticated student
 */
exports.getMyRequests = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.reason AS purpose,
        o.destination,
        o.semester,
        o.student_phone AS studentPhone,
        o.event_name AS eventName,
        o.event_location AS eventLocation,
        o.duty_date AS dutyDate,
        o.duty_description AS dutyDescription,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.parent_approval_status AS parentStatus,
        o.advisor_approval_status AS advisorStatus,
        o.warden_approval_status AS wardenStatus,
        o.overall_status AS overallStatus,
        o.rejection_reason AS rejectionReason,
        o.advisor_rejection_reason AS advisorRejectionReason,
        o.parent_rejection_reason AS parentRejectionReason,
        o.created_at AS submittedDate,
        p.father_name AS parentName,
        adv.name AS advisorName,
        wrd.name AS wardenName
      FROM outpass_requests o
      LEFT JOIN parents p ON o.parent_approved_by_id = p.id
      LEFT JOIN staff adv ON o.advisor_approved_by_id = adv.id
      LEFT JOIN staff wrd ON o.approved_by_warden_id = wrd.id
      WHERE o.student_id = ?
      ORDER BY o.created_at DESC
    `, [studentId]);

    // Format formatted display properties
    const formattedRequests = rows.map(r => {
      const isDuty = r.requestType === 'one_day_duty' || r.requestType === 'duty';
      
      let displayStatus = r.status || 'PENDING_PARENT';
      let badgeClass = 'status-pending-parent';

      if (displayStatus === 'PENDING_PARENT') {
        displayStatus = 'Pending Parent';
        badgeClass = 'status-pending-parent';
      } else if (displayStatus === 'PENDING_ADVISOR') {
        displayStatus = 'Pending Class Advisor';
        badgeClass = 'status-pending-advisor';
      } else if (displayStatus === 'PENDING_PRINCIPAL') {
        displayStatus = 'Advisor Approved • Pending Principal';
        badgeClass = 'status-pending-principal';
      } else if (displayStatus === 'PENDING_WARDEN') {
        displayStatus = 'Parent Approved • Pending Warden';
        badgeClass = 'status-pending-warden';
      } else if (displayStatus === 'APPROVED') {
        displayStatus = 'Approved';
        badgeClass = 'status-approved';
      } else if (displayStatus === 'REJECTED') {
        displayStatus = 'Rejected';
        badgeClass = 'status-rejected';
      } else if (displayStatus === 'COMPLETED') {
        displayStatus = 'Completed';
        badgeClass = 'status-completed';
      } else if (displayStatus === 'EXPIRED') {
        displayStatus = 'Expired';
        badgeClass = 'status-expired';
      }

      return {
        ...r,
        displayType: isDuty ? 'One-Day Duty' : 'Normal Outpass',
        displayStatus,
        badgeClass,
        effectiveRejectionReason: r.rejectionReason || r.advisorRejectionReason || r.parentRejectionReason || null
      };
    });

    return res.status(200).json({
      success: true,
      count: formattedRequests.length,
      requests: formattedRequests
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/status-summary
 * Get summary metrics & current hostel status for student dashboard
 */
exports.getStatusSummary = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    // Aggregate counts
    const [countRows] = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('PENDING_WARDEN', 'PENDING_ADVISOR') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
      FROM outpass_requests
      WHERE student_id = ?
    `, [studentId]);

    // Check for active outpass (where student has exited but not yet returned)
    const [activeRows] = await pool.query(`
      SELECT 
        o.id, o.request_code, o.outpass_type, o.destination, o.from_datetime, o.to_datetime, o.status,
        e.exit_time, r.return_time
      FROM outpass_requests o
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE o.student_id = ? AND o.status IN ('APPROVED', 'PENDING_WARDEN', 'PENDING_ADVISOR')
      ORDER BY o.created_at DESC
      LIMIT 1
    `, [studentId]);

    // Check student's persistent current_hostel_status column
    const [stuRows] = await pool.query(`
      SELECT current_hostel_status FROM students WHERE id = ?;
    `, [studentId]);

    const activePass = activeRows.length > 0 ? activeRows[0] : null;
    const dbHostelStatus = stuRows[0]?.current_hostel_status;
    
    // Consistent state: follow current_hostel_status directly
    const isOutside = (dbHostelStatus === 'OUTSIDE');
    const hostelStatus = isOutside ? 'Outside Hostel' : 'Inside Hostel';

    return res.status(200).json({
      success: true,
      stats: {
        total: Number(countRows[0].total) || 0,
        pending: Number(countRows[0].pending) || 0,
        approved: Number(countRows[0].approved) || 0,
        rejected: Number(countRows[0].rejected) || 0,
        completed: Number(countRows[0].completed) || 0
      },
      hostelStatus,
      activeOutpass: activePass
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/outpass/student/location & /api/student/location
 * Records the student's live GPS position captured via browser Geolocation API
 * Validates coordinate ranges and positive accuracy.
 * Never stores fake/fallback coordinates.
 */
exports.updateStudentLocation = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { latitude, longitude, accuracy, captured_at, source } = req.body || {};

    // 1. Validate existence and numeric types
    if (latitude === undefined || longitude === undefined || accuracy === undefined ||
        latitude === null || longitude === null || accuracy === null ||
        isNaN(Number(latitude)) || isNaN(Number(longitude)) || isNaN(Number(accuracy))) {
      return res.status(400).json({
        success: false,
        message: 'Valid GPS coordinates (latitude, longitude) and accuracy are required.'
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const acc = Number(accuracy);

    // 2. Validate Coordinate Ranges (Section 4)
    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude. Must be between -90 and 90 degrees.'
      });
    }

    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid longitude. Must be between -180 and 180 degrees.'
      });
    }

    // 3. Accuracy must be a positive number
    if (acc <= 0) {
      return res.status(400).json({
        success: false,
        message: 'GPS accuracy must be a positive number.'
      });
    }

    const capturedAt = (captured_at && !isNaN(new Date(captured_at).getTime()))
      ? new Date(captured_at)
      : new Date();
    const locSource = (source && typeof source === 'string') ? source.trim() : 'browser_gps';

    // 4. Store latest valid location in MySQL student_locations table
    await pool.query(`
      INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        accuracy = VALUES(accuracy),
        captured_at = VALUES(captured_at),
        source = VALUES(source),
        updated_at = CURRENT_TIMESTAMP;
    `, [studentId, lat, lng, acc, capturedAt, locSource]);

    const locData = {
      studentId,
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      capturedAt,
      source: locSource
    };

    return res.status(200).json({
      success: true,
      message: 'Student live GPS location recorded successfully.',
      data: locData,
      location: locData
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/student/location & /api/student/location
 * Returns the current stored live location and freshness status for authenticated student
 */
exports.getStudentLocation = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const [rows] = await pool.query(
      'SELECT latitude, longitude, accuracy, captured_at, updated_at, source FROM student_locations WHERE student_id = ? ORDER BY COALESCE(captured_at, updated_at) DESC LIMIT 1',
      [studentId]
    );

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        hasLocation: false,
        location: null,
        message: 'No live GPS location recorded for this student.'
      });
    }

    const loc = rows[0];
    const timestamp = loc.captured_at || loc.updated_at;
    const ageMinutes = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60);

    return res.status(200).json({
      success: true,
      hasLocation: true,
      isFresh: ageMinutes <= 5,
      ageMinutes: Math.round(ageMinutes * 10) / 10,
      location: {
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
        accuracy: Number(loc.accuracy),
        capturedAt: timestamp,
        source: loc.source
      }
    });
  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   2. WARDEN CONTROLLERS & WORKFLOW
   ========================================================== */

/**
 * GET /api/outpass/warden/overview
 * Overview metrics for Warden Dashboard cards
 */
exports.getWardenOverview = async (req, res, next) => {
  try {
    const [normalCount] = await pool.query(
      "SELECT COUNT(*) AS count FROM outpass_requests WHERE status = 'PENDING_WARDEN' AND (outpass_type = 'normal' OR outpass_type = 'regular');"
    );

    const [dutyCount] = await pool.query(
      "SELECT COUNT(*) AS count FROM outpass_requests WHERE status = 'PENDING_WARDEN' AND (outpass_type = 'one_day_duty' OR outpass_type = 'duty');"
    );

    const [approvedCount] = await pool.query(
      "SELECT COUNT(*) AS count FROM outpass_requests WHERE status = 'APPROVED';"
    );

    const [rejectedCount] = await pool.query(
      "SELECT COUNT(*) AS count FROM outpass_requests WHERE status = 'REJECTED';"
    );

    const [activeCount] = await pool.query(
      "SELECT COUNT(*) AS count FROM outpass_requests WHERE status = 'APPROVED' AND to_datetime >= NOW();"
    );

    const [outsideCount] = await pool.query(`
      SELECT COUNT(DISTINCT e.student_id) AS count
      FROM exit_logs e
      LEFT JOIN return_logs r ON e.outpass_request_id = r.outpass_request_id
      WHERE r.id IS NULL;
    `);

    const [recentRows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        o.status,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.created_at AS submittedDate,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      ORDER BY o.created_at DESC
      LIMIT 6;
    `);

    return res.status(200).json({
      success: true,
      stats: {
        pendingNormal: Number(normalCount[0].count) || 0,
        pendingDuty: Number(dutyCount[0].count) || 0,
        approvedTotal: Number(approvedCount[0].count) || 0,
        rejectedTotal: Number(rejectedCount[0].count) || 0,
        activeOutpasses: Number(activeCount[0].count) || 0,
        studentsOutside: Number(outsideCount[0].count) || 0
      },
      recentRequests: recentRows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/warden/pending
 * Pending Normal Outpass requests queue for Warden
 */
exports.getWardenPending = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.reason AS purpose,
        o.destination,
        o.semester,
        o.student_phone AS contactPhone,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.advisor_approval_status AS advisorStatus,
        o.parent_approval_status AS parentStatus,
        o.parent_approval_status AS parentApprovalStatus,
        o.created_at AS submittedDate,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.year_of_study AS studentYear,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.phone AS studentRegisteredPhone,
        p.father_name AS parentName,
        COALESCE(o.parent_verified_mobile, plv.parent_mobile, p.primary_phone) AS parentPhone,
        COALESCE(o.parent_verified_mobile, plv.parent_mobile, p.primary_phone) AS parentVerifiedMobile,
        COALESCE(o.parent_approval_lat, plv.parent_lat) AS parentApprovalLat,
        COALESCE(o.parent_approval_lng, plv.parent_lng) AS parentApprovalLng,
        COALESCE(o.parent_approval_accuracy, plv.parent_accuracy) AS parentApprovalAccuracy,
        COALESCE(o.student_loc_lat, plv.student_lat) AS studentLocLat,
        COALESCE(o.student_loc_lng, plv.student_lng) AS studentLocLng,
        COALESCE(o.distance_meters, plv.distance_meters) AS distanceMeters,
        o.parent_location_verified AS parentLocationVerified,
        CASE 
          WHEN o.parent_location_verified = 1 OR (plv.verification_result = 'VERIFIED' AND plv.distance_meters >= 5) THEN 'VERIFIED' 
          ELSE 'UNVERIFIED' 
        END AS locationVerificationResult,
        COALESCE(o.parent_approval_message, pm.message_body) AS parentMessage,
        o.parent_approved_at AS parentApprovedAt,
        COALESCE(plv.parent_timestamp, o.parent_approved_at) AS parentGpsTimestamp,
        COALESCE(plv.student_accuracy, o.parent_approval_accuracy) AS studentGpsAccuracy,
        COALESCE(plv.student_timestamp, o.parent_approved_at) AS studentGpsTimestamp
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      LEFT JOIN parent_location_verifications plv ON plv.id = (
        SELECT MAX(id) FROM parent_location_verifications 
        WHERE outpass_request_id = o.id 
          AND verification_result = 'VERIFIED'
          AND distance_meters >= 5
      )
      LEFT JOIN parent_messages pm ON pm.id = (
        SELECT MAX(id) FROM parent_messages
        WHERE outpass_request_id = o.id
      )
      WHERE o.status = 'PENDING_WARDEN' AND (o.outpass_type = 'normal' OR o.outpass_type = 'regular')
      ORDER BY o.created_at ASC
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      pendingRequests: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/warden/pending-duty
 * Pending One-Day Duty requests queue for Warden
 * (Only shows requests already APPROVED by Class Advisor)
 */
exports.getWardenPendingDuty = async (req, res, next) => {
  try {
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
        o.semester,
        o.student_phone AS contactPhone,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.advisor_approval_status AS advisorStatus,
        o.advisor_approved_at AS advisorApprovedAt,
        o.parent_approval_status AS parentStatus,
        o.created_at AS submittedDate,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.year_of_study AS studentYear,
        s.section AS studentSection,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.phone AS studentRegisteredPhone,
        p.father_name AS parentName,
        p.primary_phone AS parentPhone,
        adv.name AS advisorName
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      LEFT JOIN staff adv ON o.advisor_approved_by_id = adv.id
      WHERE o.status = 'PENDING_WARDEN' 
        AND (o.outpass_type = 'one_day_duty' OR o.outpass_type = 'duty')
        AND (o.advisor_approval_status = 'approved' OR o.advisor_approval_status = 'not_required')
      ORDER BY o.created_at ASC
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      pendingDutyRequests: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/warden/active
 * Active outpasses list for Warden monitoring
 */
exports.getWardenActive = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.approved_at AS approvedAt,
        q.id AS qrId,
        q.token AS qrToken,
        q.qr_image_data AS qrImageData,
        q.status AS qrStatus,
        q.used_count AS qrUsedCount,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.phone AS studentPhone,
        p.father_name AS parentName,
        COALESCE(o.parent_verified_mobile, plv.parent_mobile, p.primary_phone) AS parentVerifiedMobile,
        COALESCE(o.distance_meters, plv.distance_meters) AS distanceMeters,
        COALESCE(o.parent_approval_lat, plv.parent_lat) AS parentApprovalLat,
        COALESCE(o.parent_approval_lng, plv.parent_lng) AS parentApprovalLng,
        COALESCE(o.parent_approval_accuracy, plv.parent_accuracy) AS parentApprovalAccuracy,
        COALESCE(o.student_loc_lat, plv.student_lat) AS studentLocLat,
        COALESCE(o.student_loc_lng, plv.student_lng) AS studentLocLng,
        o.parent_location_verified AS parentLocationVerified,
        CASE 
          WHEN o.parent_location_verified = 1 OR (plv.verification_result = 'VERIFIED' AND plv.distance_meters >= 5) THEN 'VERIFIED' 
          ELSE 'UNVERIFIED' 
        END AS locationVerificationResult,
        COALESCE(o.parent_approval_message, pm.message_body) AS parentMessage,
        o.parent_approved_at AS parentApprovedAt,
        e.exit_time AS exitTime,
        r.return_time AS returnTime
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      LEFT JOIN parent_location_verifications plv ON plv.id = (
        SELECT MAX(id) FROM parent_location_verifications 
        WHERE outpass_request_id = o.id 
          AND verification_result = 'VERIFIED'
          AND distance_meters >= 5
      )
      LEFT JOIN parent_messages pm ON pm.id = (
        SELECT MAX(id) FROM parent_messages
        WHERE outpass_request_id = o.id
      )
      LEFT JOIN qr_codes q ON o.id = q.outpass_request_id AND q.status = 'ACTIVE'
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE o.status = 'APPROVED'
      ORDER BY o.to_datetime ASC
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      activeOutpasses: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/outpass/:id/approve
 * Approve an outpass request (Normal or One-Day Duty)
 * Accessible ONLY by authenticated Warden staff
 */
exports.approveOutpass = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const wardenId = req.user.id;

    // 1. Verify request exists
    const [rows] = await pool.query(
      'SELECT id, request_code, outpass_type, status, student_id FROM outpass_requests WHERE id = ?',
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outpass request not found.'
      });
    }

    const request = rows[0];

    // 2. Workflow Guard: Warden ONLY approves Normal Outpasses (Rule 11)
    if (request.outpass_type === 'one_day_duty' || request.outpass_type === 'duty') {
      return res.status(403).json({
        success: false,
        message: 'Warden is not authorized to approve One-Day Permission requests. One-Day Permission requires Principal approval.'
      });
    }

    // 3. Verify request is actually pending for Warden
    if (request.status !== 'PENDING_WARDEN') {
      return res.status(400).json({
        success: false,
        message: `Request cannot be approved. It is currently in "${request.status}" state.`
      });
    }

    // 4. Update status to APPROVED and record warden audit timestamp
    const now = new Date();
    await pool.query(`
      UPDATE outpass_requests
      SET 
        status = 'APPROVED',
        overall_status = 'approved',
        warden_approval_status = 'approved',
        approved_by_warden_id = ?,
        approved_at = ?
      WHERE id = ?
    `, [wardenId, now, requestId]);

    // Send notifications to Student and Parent
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'Outpass Approved by Warden',
      message: `Your Normal Outpass (${request.request_code}) has been approved by the Hostel Warden. Gate Pass QR is ready for generation.`,
      type: 'WARDEN_APPROVED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // Real-time synchronization event for Warden monitoring dashboards
    if (req.io) {
      req.io.to('role_warden').emit('outpass:status_changed', {
        id: requestId,
        requestCode: request.request_code,
        status: 'APPROVED',
        approvedAt: now.toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Outpass request approved successfully. You can now generate the digital security QR code.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'APPROVED',
        approvedAt: now.toISOString(),
        approvedByWardenId: wardenId
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/outpass/:id/reject
 * Reject an outpass request with reason
 * Accessible ONLY by authenticated Warden staff for Normal Outpasses
 */
exports.rejectOutpass = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const wardenId = req.user.id;
    const { rejection_reason } = req.body;

    if (!rejection_reason || typeof rejection_reason !== 'string' || !rejection_reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required.'
      });
    }

    // 1. Verify request exists
    const [rows] = await pool.query(
      'SELECT id, request_code, outpass_type, status, student_id FROM outpass_requests WHERE id = ?',
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outpass request not found.'
      });
    }

    const request = rows[0];

    // 2. Workflow Guard: Warden ONLY rejects Normal Outpasses
    if (request.outpass_type === 'one_day_duty' || request.outpass_type === 'duty') {
      return res.status(403).json({
        success: false,
        message: 'Warden is not authorized to reject One-Day Permission requests. One-Day Permission is handled by the Principal.'
      });
    }

    // 3. Verify request is actually pending
    if (request.status !== 'PENDING_WARDEN') {
      return res.status(400).json({
        success: false,
        message: `Request cannot be rejected. It is currently in "${request.status}" state.`
      });
    }

    // 4. Update status to REJECTED and record warden audit timestamp
    const now = new Date();
    await pool.query(`
      UPDATE outpass_requests
      SET 
        status = 'REJECTED',
        overall_status = 'rejected',
        warden_approval_status = 'rejected',
        rejected_by_warden_id = ?,
        rejected_at = ?,
        rejection_reason = ?
      WHERE id = ?
    `, [wardenId, now, rejection_reason.trim(), requestId]);

    // Notify Student
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'Outpass Rejected by Warden',
      message: `Your Normal Outpass (${request.request_code}) was rejected by Warden: ${rejection_reason.trim()}`,
      type: 'WARDEN_REJECTED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // Real-time synchronization event for Warden monitoring dashboards
    if (req.io) {
      req.io.to('role_warden').emit('outpass:status_changed', {
        id: requestId,
        requestCode: request.request_code,
        status: 'REJECTED',
        rejectionReason: rejection_reason.trim(),
        rejectedAt: now.toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Outpass request rejected successfully.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'REJECTED',
        rejectionReason: rejection_reason.trim(),
        rejectedAt: now.toISOString(),
        rejectedByWardenId: wardenId
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/outpass/:id/principal-approve
 * Approve One-Day Permission request
 * Accessible ONLY by authenticated Principal role
 */
exports.principalApprove = async (req, res, next) => {
  let connection;
  try {
    const requestId = req.params.id;
    const principalId = req.user.id;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Fetch request with row-lock
    const [rows] = await connection.query(
      'SELECT id, request_code, student_id, outpass_type, status, advisor_approval_status, advisor_approved_by_id FROM outpass_requests WHERE id = ? FOR UPDATE;',
      [requestId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const request = rows[0];

    // 2. Verify request type is ONE_DAY_DUTY
    if (request.outpass_type !== 'one_day_duty' && request.outpass_type !== 'duty') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Principal can only approve One-Day Permission (Duty) requests.' });
    }

    // 3. Verify status is PENDING_PRINCIPAL
    if (request.status !== 'PENDING_PRINCIPAL') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Request cannot be approved. Current status is "${request.status}".` });
    }

    // 4. Verify Class Advisor has approved it
    const isAdvisorApproved = request.advisor_approved_by_id || request.advisor_approval_status === 'approved';
    if (!isAdvisorApproved) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Class Advisor must approve One-Day Duty before Principal authorization.' });
    }

    // 5. Update status to APPROVED with Principal audit details
    const now = new Date();
    await connection.query(`
      UPDATE outpass_requests
      SET 
        status = 'APPROVED',
        overall_status = 'approved',
        principal_approval_status = 'approved',
        principal_approved_by_id = ?,
        principal_approved_at = ?
      WHERE id = ?;
    `, [principalId, now, requestId]);

    // Update one_day_duty_requests table if exists
    await connection.query(`
      UPDATE one_day_duty_requests
      SET overall_status = 'approved'
      WHERE request_code = ?;
    `, [request.request_code]).catch(err => console.warn('[OD Table Sync]:', err.message));

    await connection.commit();

    // Notify Student of Principal Approval
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'One-Day Permission Approved by Principal',
      message: `Your One-Day Permission (${request.request_code}) has been approved by Principal. Gate Pass QR is eligible for generation.`,
      type: 'PRINCIPAL_APPROVED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      message: 'One-Day Permission approved successfully by Principal. Eligible for digital security QR generation.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'APPROVED',
        principalApprovedAt: now.toISOString(),
        principalId
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * PATCH /api/outpass/:id/principal-reject
 * Reject One-Day Permission request
 * Accessible ONLY by authenticated Principal role
 */
exports.principalReject = async (req, res, next) => {
  let connection;
  try {
    const requestId = req.params.id;
    const principalId = req.user.id;
    const { rejection_reason } = req.body;

    if (!rejection_reason || typeof rejection_reason !== 'string' || !rejection_reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Fetch request with row-lock
    const [rows] = await connection.query(
      'SELECT id, request_code, student_id, outpass_type, status FROM outpass_requests WHERE id = ? FOR UPDATE;',
      [requestId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const request = rows[0];

    // 2. Verify request type is ONE_DAY_DUTY
    if (request.outpass_type !== 'one_day_duty' && request.outpass_type !== 'duty') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Principal can only reject One-Day Permission (Duty) requests.' });
    }

    // 3. Verify status is PENDING_PRINCIPAL
    if (request.status !== 'PENDING_PRINCIPAL') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Request cannot be rejected. Current status is "${request.status}".` });
    }

    // 4. Update status to REJECTED with Principal audit details
    const now = new Date();
    const cleanReason = rejection_reason.trim();
    await connection.query(`
      UPDATE outpass_requests
      SET 
        status = 'REJECTED',
        overall_status = 'rejected',
        principal_approval_status = 'rejected',
        principal_rejected_by_id = ?,
        principal_rejected_at = ?,
        principal_rejection_reason = ?,
        rejection_reason = ?
      WHERE id = ?;
    `, [principalId, now, cleanReason, cleanReason, requestId]);

    // Update one_day_duty_requests table if exists
    await connection.query(`
      UPDATE one_day_duty_requests
      SET overall_status = 'rejected', rejection_reason = ?
      WHERE request_code = ?;
    `, [cleanReason, request.request_code]).catch(err => console.warn('[OD Table Sync]:', err.message));

    await connection.commit();

    // Notify Student of Principal Rejection
    notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'One-Day Permission Rejected by Principal',
      message: `Your One-Day Permission (${request.request_code}) was rejected by Principal: ${cleanReason}`,
      type: 'PRINCIPAL_REJECTED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      message: 'One-Day Permission rejected by Principal.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'REJECTED',
        rejectionReason: cleanReason,
        principalRejectedAt: now.toISOString(),
        principalId
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/* ==========================================================
   3. CLASS ADVISOR CONTROLLERS & WORKFLOW
   ========================================================== */

/**
 * GET /api/outpass/advisor/overview
 * Overview metrics for Class Advisor Dashboard
 */
exports.getAdvisorOverview = async (req, res, next) => {
  try {
    const advisorId = req.user.id;

    // Get Advisor Department
    const [advRows] = await pool.query(
      'SELECT id, name, department FROM staff WHERE id = ?',
      [advisorId]
    );

    const advisorDept = advRows.length > 0 ? advRows[0].department : null;

    // 1. Pending One-Day Duty Requests in Advisor's department
    const [pendingRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.status = 'PENDING_ADVISOR'
        AND (o.outpass_type = 'one_day_duty' OR o.outpass_type = 'duty')
        AND (s.department = ? OR s.class_advisor_id = ?);
    `, [advisorDept, advisorId]);

    // 2. Approved Today by this advisor
    const [approvedTodayRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests
      WHERE advisor_approved_by_id = ? AND DATE(advisor_approved_at) = CURDATE();
    `, [advisorId]);

    // 3. Rejected Today by this advisor
    const [rejectedTodayRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests
      WHERE advisor_rejected_by_id = ? AND DATE(advisor_rejected_at) = CURDATE();
    `, [advisorId]);

    // 4. Total Approved
    const [totalApprovedRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests
      WHERE advisor_approved_by_id = ?;
    `, [advisorId]);

    // 5. Total Rejected
    const [totalRejectedRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests
      WHERE advisor_rejected_by_id = ?;
    `, [advisorId]);

    // 6. Recent Activity in department
    const [recentRows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.event_name AS eventName,
        o.event_location AS eventLocation,
        o.duty_date AS dutyDate,
        o.status,
        o.advisor_approval_status AS advisorStatus,
        o.created_at AS submittedDate,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        s.year_of_study AS studentYear
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE (o.outpass_type = 'one_day_duty' OR o.outpass_type = 'duty')
        AND (s.department = ? OR s.class_advisor_id = ?)
      ORDER BY o.created_at DESC
      LIMIT 6;
    `, [advisorDept, advisorId]);

    return res.status(200).json({
      success: true,
      stats: {
        pendingCount: Number(pendingRows[0].count) || 0,
        approvedTodayCount: Number(approvedTodayRows[0].count) || 0,
        rejectedTodayCount: Number(rejectedTodayRows[0].count) || 0,
        totalApprovedCount: Number(totalApprovedRows[0].count) || 0,
        totalRejectedCount: Number(totalRejectedRows[0].count) || 0
      },
      advisorDept,
      recentActivity: recentRows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/advisor/pending
 * Pending One-Day Duty requests queue for Class Advisor
 * Filtered securely by advisor's assigned department
 */
exports.getAdvisorPending = async (req, res, next) => {
  try {
    const advisorId = req.user.id;

    // Get Advisor Department
    const [advRows] = await pool.query(
      'SELECT id, name, department FROM staff WHERE id = ?',
      [advisorId]
    );

    const advisorDept = advRows.length > 0 ? advRows[0].department : null;

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
        o.semester,
        o.student_phone AS contactPhone,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.advisor_approval_status AS advisorStatus,
        o.created_at AS submittedDate,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.year_of_study AS studentYear,
        s.section AS studentSection,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.phone AS studentRegisteredPhone,
        p.father_name AS parentName,
        p.primary_phone AS parentPhone
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      WHERE o.status = 'PENDING_ADVISOR'
        AND (o.outpass_type = 'one_day_duty' OR o.outpass_type = 'duty')
        AND (s.department = ? OR s.class_advisor_id = ?)
      ORDER BY o.created_at ASC
    `, [advisorDept, advisorId]);

    return res.status(200).json({
      success: true,
      count: rows.length,
      advisorDept,
      pendingDutyRequests: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/advisor/approved
 * Approved One-Day Duty requests list for Class Advisor
 */
exports.getAdvisorApproved = async (req, res, next) => {
  try {
    const advisorId = req.user.id;

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.event_name AS eventName,
        o.event_location AS eventLocation,
        o.duty_date AS dutyDate,
        o.duty_description AS dutyDescription,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.advisor_approved_at AS approvedAt,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.year_of_study AS studentYear,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.advisor_approved_by_id = ?
      ORDER BY o.advisor_approved_at DESC
    `, [advisorId]);

    return res.status(200).json({
      success: true,
      count: rows.length,
      approvedRequests: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/advisor/rejected
 * Rejected One-Day Duty requests list for Class Advisor
 */
exports.getAdvisorRejected = async (req, res, next) => {
  try {
    const advisorId = req.user.id;

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.event_name AS eventName,
        o.event_location AS eventLocation,
        o.duty_date AS dutyDate,
        o.advisor_rejection_reason AS rejectionReason,
        o.advisor_rejected_at AS rejectedAt,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.year_of_study AS studentYear
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.advisor_rejected_by_id = ?
      ORDER BY o.advisor_rejected_at DESC
    `, [advisorId]);

    return res.status(200).json({
      success: true,
      count: rows.length,
      rejectedRequests: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/outpass/:id/advisor-approve
 * Approve OD request by Class Advisor -> moves to PENDING_PRINCIPAL
 * Enforces Department-level authorization and transaction safety
 */
exports.advisorApprove = async (req, res, next) => {
  let connection;
  try {
    const requestId = req.params.id;
    const advisorId = req.user.id;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Get Advisor Department
    const [advRows] = await connection.query(
      'SELECT id, name, department FROM staff WHERE id = ?',
      [advisorId]
    );

    if (advRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Class Advisor record not found.' });
    }

    const advisorDept = advRows[0].department;

    // 2. Fetch request with row lock and check student department
    const [rows] = await connection.query(`
      SELECT o.id, o.request_code, o.student_id, o.outpass_type, o.status, s.department AS studentDept, s.class_advisor_id, s.name AS studentName
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.id = ?
      FOR UPDATE;
    `, [requestId]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const request = rows[0];

    // 3. Department Authorization Check
    if (request.studentDept !== advisorDept && request.class_advisor_id !== advisorId) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: `Department Mismatch: You can only approve requests from your department (${advisorDept}). This student belongs to (${request.studentDept}).`
      });
    }

    // 4. Verify request is a One-Day Duty and pending
    if (request.status !== 'PENDING_ADVISOR') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Request is not pending Class Advisor approval (Current status: ${request.status}).`
      });
    }

    // 5. Update status to PENDING_PRINCIPAL (forwarding to Principal for final authorization)
    const now = new Date();
    await connection.query(`
      UPDATE outpass_requests
      SET 
        status = 'PENDING_PRINCIPAL',
        advisor_approval_status = 'approved',
        advisor_approved_by_id = ?,
        advisor_approved_at = ?
      WHERE id = ?;
    `, [advisorId, now, requestId]);

    // Also update one_day_duty_requests table if present
    await connection.query(`
      UPDATE one_day_duty_requests
      SET advisor_approval_status = 'approved'
      WHERE request_code = ?;
    `, [request.request_code]).catch(err => console.warn('[OD Table Sync]:', err.message));

    await connection.commit();

    // 6. Notify Principal (Rule 5)
    await notificationService.notifyPrincipal({
      title: 'One-Day Permission Requires Approval',
      message: 'A Class Advisor has approved a One-Day Permission request and it is waiting for your final approval.',
      type: 'PRINCIPAL_PENDING',
      referenceId: requestId,
      linkUrl: '/principal-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // 7. Notify Student
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'One-Day Permission Cleared by Advisor',
      message: `Your One-Day Duty request (${request.request_code}) was approved by your Class Advisor and forwarded to Principal for final approval.`,
      type: 'ADVISOR_APPROVED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      message: 'One-Day Permission approved by Class Advisor and forwarded to Principal for final authorization.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'PENDING_PRINCIPAL',
        advisorApprovedAt: now.toISOString(),
        advisorId
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * PATCH /api/outpass/:id/advisor-reject
 * Reject OD request by Class Advisor
 * Enforces Department-level authorization and transaction safety
 */
exports.advisorReject = async (req, res, next) => {
  let connection;
  try {
    const requestId = req.params.id;
    const advisorId = req.user.id;
    const { rejection_reason } = req.body;

    if (!rejection_reason || typeof rejection_reason !== 'string' || !rejection_reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Get Advisor Department
    const [advRows] = await connection.query(
      'SELECT id, name, department FROM staff WHERE id = ?',
      [advisorId]
    );

    if (advRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Class Advisor record not found.' });
    }

    const advisorDept = advRows[0].department;

    // 2. Fetch request with row lock and check student department
    const [rows] = await connection.query(`
      SELECT o.id, o.request_code, o.student_id, o.outpass_type, o.status, s.department AS studentDept, s.class_advisor_id
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.id = ?
      FOR UPDATE;
    `, [requestId]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const request = rows[0];

    // 3. Department Authorization Check
    if (request.studentDept !== advisorDept && request.class_advisor_id !== advisorId) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: `Department Mismatch: You can only reject requests from your department (${advisorDept}). This student belongs to (${request.studentDept}).`
      });
    }

    if (request.status !== 'PENDING_ADVISOR') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Request is not pending Class Advisor approval (Current status: ${request.status}).`
      });
    }

    // 4. Update status to REJECTED (Do not forward to Warden or Principal)
    const now = new Date();
    const cleanReason = rejection_reason.trim();
    await connection.query(`
      UPDATE outpass_requests
      SET 
        status = 'REJECTED',
        overall_status = 'rejected',
        advisor_approval_status = 'rejected',
        advisor_rejected_by_id = ?,
        advisor_rejected_at = ?,
        advisor_rejection_reason = ?,
        rejection_reason = ?
      WHERE id = ?;
    `, [advisorId, now, cleanReason, cleanReason, requestId]);

    // Also sync one_day_duty_requests table
    await connection.query(`
      UPDATE one_day_duty_requests
      SET advisor_approval_status = 'rejected', overall_status = 'rejected', rejection_reason = ?
      WHERE request_code = ?;
    `, [cleanReason, request.request_code]).catch(err => console.warn('[OD Table Sync]:', err.message));

    await connection.commit();

    // 5. Notify Student
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'One-Day Duty Request Rejected',
      message: `Your One-Day Duty request (${request.request_code}) was rejected by your Class Advisor: ${cleanReason}`,
      type: 'ADVISOR_REJECTED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      message: 'One-Day Duty request rejected by Class Advisor.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'REJECTED',
        rejectionReason: cleanReason,
        advisorRejectedAt: now.toISOString()
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * GET /api/outpass/warden/students/search?q=...
 * Search student by name or roll number for Warden review.
 * Returns linked parent details, outpass decision, parent message, and verification state.
 * Strict data isolation: scoped exclusively to each matched student.
 */
exports.searchWardenStudents = async (req, res, next) => {
  try {
    const q = req.query.q;
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query parameter "q" (student name or roll number) is required.'
      });
    }

    const searchTerm = `%${q.trim()}%`;

    const [rows] = await pool.query(`
      SELECT 
        s.id AS studentId,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        s.year_of_study AS studentYear,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.phone AS studentPhone,
        p.id AS parentId,
        COALESCE(p.father_name, p.mother_name, 'Parent') AS parentName,
        COALESCE(o.parent_verified_mobile, plv.parent_mobile, p.primary_phone) AS parentMobile,
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.status AS outpassStatus,
        CASE 
          WHEN o.parent_approval_status = 'approved' THEN 'APPROVED'
          WHEN o.parent_approval_status = 'rejected' OR o.status = 'REJECTED' THEN 'REJECTED'
          WHEN pm.parent_response = 'approved' THEN 'APPROVED'
          WHEN pm.parent_response = 'rejected' THEN 'REJECTED'
          WHEN o.status = 'PENDING_PARENT' THEN 'PENDING'
          ELSE 'PENDING'
        END AS decision,
        COALESCE(
          pm.message_body,
          o.parent_approval_message,
          o.parent_rejection_reason,
          o.rejection_reason
        ) AS parentMessage,
        CASE 
          WHEN o.parent_location_verified = 1 OR (plv.verification_result = 'VERIFIED' AND plv.distance_meters >= 5) THEN 'VERIFIED'
          ELSE 'UNVERIFIED'
        END AS locationVerification,
        COALESCE(o.distance_meters, plv.distance_meters) AS distanceMeters,
        COALESCE(o.parent_approval_accuracy, plv.parent_accuracy) AS gpsAccuracy,
        COALESCE(
          pm.responded_at,
          o.parent_approved_at,
          o.parent_rejected_at,
          pm.created_at,
          o.created_at
        ) AS submittedAt
      FROM students s
      LEFT JOIN parents p ON s.parent_id = p.id
      LEFT JOIN outpass_requests o ON o.id = COALESCE(
        (
          SELECT id FROM outpass_requests 
          WHERE student_id = s.id 
            AND (status IN ('PENDING_WARDEN', 'APPROVED') OR parent_approval_status = 'approved')
          ORDER BY id DESC LIMIT 1
        ),
        (
          SELECT id FROM outpass_requests 
          WHERE student_id = s.id 
            AND (status = 'REJECTED' OR parent_approval_status = 'rejected')
          ORDER BY id DESC LIMIT 1
        ),
        (
          SELECT id FROM outpass_requests 
          WHERE student_id = s.id AND outpass_type IN ('normal', 'regular')
          ORDER BY id DESC LIMIT 1
        ),
        (
          SELECT id FROM outpass_requests 
          WHERE student_id = s.id
          ORDER BY id DESC LIMIT 1
        )
      )
      LEFT JOIN parent_messages pm ON pm.id = (
        SELECT MAX(id) FROM parent_messages 
        WHERE student_id = s.id 
          AND (outpass_request_id = o.id OR (o.id IS NULL AND student_id = s.id))
      )
      LEFT JOIN parent_location_verifications plv ON plv.id = (
        SELECT MAX(id) FROM parent_location_verifications 
        WHERE student_id = s.id 
          AND (outpass_request_id = o.id OR o.id IS NULL)
          AND verification_result = 'VERIFIED'
      )
      WHERE s.name LIKE ? OR s.reg_no LIKE ?
      ORDER BY s.name ASC
      LIMIT 25;
    `, [searchTerm, searchTerm]);

    const formattedStudents = rows.map(r => ({
      student: {
        id: r.studentId,
        name: r.studentName,
        regNo: r.studentRegNo,
        department: r.studentDept,
        year: r.studentYear,
        roomNo: r.studentRoom,
        hostelBlock: r.studentBlock,
        phone: r.studentPhone
      },
      parent: {
        id: r.parentId,
        name: r.parentName,
        mobile: r.parentMobile || 'N/A'
      },
      decision: r.decision,
      parentMessage: r.parentMessage || null,
      locationVerification: r.locationVerification,
      distance: r.distanceMeters !== null && r.distanceMeters !== undefined 
        ? `${r.distanceMeters} meters` 
        : (r.locationVerification === 'VERIFIED' ? '>= 5 meters' : 'N/A'),
      distanceMeters: r.distanceMeters !== null && r.distanceMeters !== undefined ? Number(r.distanceMeters) : null,
      gpsAccuracy: r.gpsAccuracy !== null && r.gpsAccuracy !== undefined 
        ? `<= ${Math.round(r.gpsAccuracy)} meters` 
        : (r.locationVerification === 'VERIFIED' ? '<= 50 meters' : 'N/A'),
      gpsAccuracyMeters: r.gpsAccuracy !== null && r.gpsAccuracy !== undefined ? Number(r.gpsAccuracy) : null,
      submittedAt: r.submittedAt || null,
      outpass: r.outpassId ? {
        id: r.outpassId,
        requestCode: r.requestCode,
        requestType: r.requestType,
        status: r.outpassStatus
      } : null
    }));

    return res.status(200).json({
      success: true,
      query: q.trim(),
      count: formattedStudents.length,
      students: formattedStudents
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/warden/parent-messages
 * Fetches recent parent messages log with student and outpass relational data
 */
exports.getWardenParentMessages = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        pm.id,
        pm.parent_id AS parentId,
        COALESCE(pm.parent_mobile, p.primary_phone) AS parentMobile,
        COALESCE(p.father_name, p.mother_name, 'Parent') AS parentName,
        pm.student_id AS studentId,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        pm.outpass_request_id AS outpassRequestId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        pm.message_type AS messageType,
        pm.message_body AS messageBody,
        pm.status AS messageStatus,
        pm.parent_response AS parentResponse,
        CASE 
          WHEN o.parent_location_verified = 1 OR (plv.verification_result = 'VERIFIED' AND plv.distance_meters >= 5) THEN 'VERIFIED'
          ELSE 'UNVERIFIED'
        END AS locationVerification,
        COALESCE(o.distance_meters, plv.distance_meters) AS distanceMeters,
        COALESCE(o.parent_approval_accuracy, plv.parent_accuracy) AS gpsAccuracy,
        pm.responded_at AS respondedAt,
        pm.created_at AS createdAt
      FROM parent_messages pm
      INNER JOIN students s ON pm.student_id = s.id
      LEFT JOIN parents p ON pm.parent_id = p.id
      LEFT JOIN outpass_requests o ON pm.outpass_request_id = o.id
      LEFT JOIN parent_location_verifications plv ON plv.id = (
        SELECT id FROM parent_location_verifications 
        WHERE outpass_request_id = o.id AND verification_result = 'VERIFIED'
        ORDER BY id DESC LIMIT 1
      )
      ORDER BY COALESCE(pm.responded_at, pm.created_at) DESC
      LIMIT 100;
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      messages: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/warden/reports
 * Real MySQL-driven Hostel Movement Reports & Analytics for Warden
 * Supports Date Filtering: 'today', 'yesterday', 'custom' (startDate to endDate)
 * Fully parameterized SQL queries. Respects role authorization and privacy.
 */
exports.getWardenReports = async (req, res, next) => {
  try {
    const { filter = 'today', startDate, endDate } = req.query;

    let startDateTime = '';
    let endDateTime = '';
    const now = new Date();

    // Helper to format Date object into YYYY-MM-DD
    const formatDateYMD = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (filter === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = formatDateYMD(yest);
      startDateTime = `${yestStr} 00:00:00`;
      endDateTime = `${yestStr} 23:59:59`;
    } else if (filter === 'custom' && startDate && endDate) {
      // Validate date format YYYY-MM-DD
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const cleanStart = dateRegex.test(String(startDate).trim()) ? String(startDate).trim() : formatDateYMD(now);
      const cleanEnd = dateRegex.test(String(endDate).trim()) ? String(endDate).trim() : formatDateYMD(now);
      startDateTime = `${cleanStart} 00:00:00`;
      endDateTime = `${cleanEnd} 23:59:59`;
    } else {
      // Default: 'today'
      const todayStr = formatDateYMD(now);
      startDateTime = `${todayStr} 00:00:00`;
      endDateTime = `${todayStr} 23:59:59`;
    }

    // 1. Summary Cards SQL Aggregation (Parameterized)
    const [summaryRows] = await pool.query(`
      SELECT 
        COUNT(DISTINCT o.id) AS totalOutpasses,
        SUM(CASE WHEN o.status LIKE 'PENDING%' OR o.overall_status = 'pending' THEN 1 ELSE 0 END) AS pendingRequests,
        SUM(CASE WHEN o.warden_approval_status = 'approved' OR o.status = 'APPROVED' THEN 1 ELSE 0 END) AS approvedRequests,
        SUM(CASE WHEN o.status = 'REJECTED' OR o.warden_approval_status = 'rejected' THEN 1 ELSE 0 END) AS rejectedRequests,
        SUM(CASE WHEN e.id IS NOT NULL AND r.id IS NULL THEN 1 ELSE 0 END) AS currentlyOutside,
        SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) AS returnedStudents,
        SUM(CASE WHEN r.is_late = 1 OR r.late_duration_minutes > 0 THEN 1 ELSE 0 END) AS lateReturns,
        COUNT(DISTINCT ext.id) AS emergencyExtensions
      FROM outpass_requests o
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      LEFT JOIN extension_requests ext ON o.id = ext.outpass_request_id
      WHERE o.created_at >= ? AND o.created_at <= ?
    `, [startDateTime, endDateTime]);

    const rawSummary = summaryRows[0] || {};
    const summary = {
      totalOutpasses: Number(rawSummary.totalOutpasses) || 0,
      pendingRequests: Number(rawSummary.pendingRequests) || 0,
      approvedRequests: Number(rawSummary.approvedRequests) || 0,
      rejectedRequests: Number(rawSummary.rejectedRequests) || 0,
      currentlyOutside: Number(rawSummary.currentlyOutside) || 0,
      returnedStudents: Number(rawSummary.returnedStudents) || 0,
      lateReturns: Number(rawSummary.lateReturns) || 0,
      emergencyExtensions: Number(rawSummary.emergencyExtensions) || 0
    };

    // 2. Department-wise Summary SQL Aggregation (Parameterized)
    const [deptRows] = await pool.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(s.department), ''), 'General') AS department,
        COUNT(DISTINCT o.id) AS totalOutpasses,
        SUM(CASE WHEN o.warden_approval_status = 'approved' OR o.status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN o.status = 'REJECTED' OR o.warden_approval_status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN (o.warden_approval_status = 'pending' OR o.status LIKE '%PENDING%') AND o.status != 'REJECTED' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) AS returned,
        SUM(CASE WHEN e.id IS NOT NULL AND r.id IS NULL THEN 1 ELSE 0 END) AS currentlyOutside
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE o.created_at >= ? AND o.created_at <= ?
      GROUP BY s.department
      ORDER BY totalOutpasses DESC, department ASC
    `, [startDateTime, endDateTime]);

    const departments = deptRows.map(row => ({
      department: row.department,
      totalOutpasses: Number(row.totalOutpasses) || 0,
      approved: Number(row.approved) || 0,
      rejected: Number(row.rejected) || 0,
      pending: Number(row.pending) || 0,
      returned: Number(row.returned) || 0,
      currentlyOutside: Number(row.currentlyOutside) || 0
    }));

    // 3. Outpass Status Report Table (Parameterized, detailed records)
    const [outpassRows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        o.outpass_type AS outpassType,
        o.from_datetime AS fromDatetime,
        o.to_datetime AS toDatetime,
        o.status,
        o.parent_approval_status AS parentDecision,
        o.warden_approval_status AS wardenDecision,
        CASE 
          WHEN e.id IS NOT NULL THEN CONCAT('Exited at ', DATE_FORMAT(e.exit_time, '%d %b %H:%i'))
          ELSE 'Not Exited'
        END AS exitStatus,
        CASE 
          WHEN r.id IS NOT NULL AND (r.is_late = 1 OR r.late_duration_minutes > 0) THEN CONCAT('Late Return (', r.late_duration_minutes, 'm)')
          WHEN r.id IS NOT NULL THEN CONCAT('Returned at ', DATE_FORMAT(r.return_time, '%d %b %H:%i'))
          WHEN e.id IS NOT NULL THEN 'Still Outside'
          ELSE 'N/A'
        END AS returnStatus,
        o.created_at AS createdAt
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      WHERE o.created_at >= ? AND o.created_at <= ?
      ORDER BY o.created_at DESC
      LIMIT 250
    `, [startDateTime, endDateTime]);

    // 4. Late Return Report (Parameterized)
    const [lateReturnRows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        o.outpass_type AS outpassType,
        o.to_datetime AS originalReturnTime,
        r.return_time AS actualReturnTime,
        COALESCE(r.late_duration_minutes, 0) AS lateDurationMinutes,
        COALESCE(ext.status, 'No Extension') AS extensionStatus
      FROM return_logs r
      INNER JOIN outpass_requests o ON r.outpass_request_id = o.id
      INNER JOIN students s ON r.student_id = s.id
      LEFT JOIN extension_requests ext ON o.id = ext.outpass_request_id
      WHERE (r.is_late = 1 OR r.late_duration_minutes > 0)
        AND (r.return_time >= ? AND r.return_time <= ? OR o.created_at >= ? AND o.created_at <= ?)
      ORDER BY r.return_time DESC
      LIMIT 100
    `, [startDateTime, endDateTime, startDateTime, endDateTime]);

    // 5. Currently Outside Report
    // Students who have checked out (exit_logs) but have not yet checked in (return_logs IS NULL)
    const [currentlyOutsideRows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        o.outpass_type AS outpassType,
        o.destination AS destination,
        e.exit_time AS exitTime,
        o.to_datetime AS expectedReturnTime,
        COALESCE(ext.status, 'None') AS extensionStatus
      FROM exit_logs e
      INNER JOIN outpass_requests o ON e.outpass_request_id = o.id
      INNER JOIN students s ON e.student_id = s.id
      LEFT JOIN return_logs r ON o.id = r.outpass_request_id
      LEFT JOIN extension_requests ext ON o.id = ext.outpass_request_id
      WHERE r.id IS NULL
      ORDER BY e.exit_time DESC
      LIMIT 100
    `);

    // 6. Emergency Extensions Report
    const [extensionRows] = await pool.query(`
      SELECT 
        ex.id,
        ex.outpass_request_id AS outpassRequestId,
        o.request_code AS requestCode,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        ex.created_at AS requestTime,
        o.to_datetime AS previousReturnTime,
        ex.extended_to_datetime AS extendedReturnTime,
        TIMESTAMPDIFF(MINUTE, o.to_datetime, ex.extended_to_datetime) AS extensionMinutes,
        ex.reason,
        ex.status
      FROM extension_requests ex
      INNER JOIN outpass_requests o ON ex.outpass_request_id = o.id
      INNER JOIN students s ON ex.student_id = s.id
      WHERE (ex.created_at >= ? AND ex.created_at <= ?)
         OR (o.created_at >= ? AND o.created_at <= ?)
      ORDER BY ex.created_at DESC
      LIMIT 100
    `, [startDateTime, endDateTime, startDateTime, endDateTime]);

    return res.status(200).json({
      success: true,
      filter,
      dateRange: {
        startDate: startDateTime.split(' ')[0],
        endDate: endDateTime.split(' ')[0],
        startDateTime,
        endDateTime
      },
      summary,
      departments,
      outpassStatusReport: outpassRows,
      lateReturnReport: lateReturnRows,
      currentlyOutsideReport: currentlyOutsideRows,
      extensionReport: extensionRows
    });

  } catch (error) {
    next(error);
  }
};

