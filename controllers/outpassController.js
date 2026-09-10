const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool } = require('../utils/db');
const notificationService = require('../services/notificationService');
const { validateAdvanceSubmissionTime } = require('../utils/timeValidator');
const { normalizeOutpassType } = require('../utils/typeNormalizer');

/**
 * Helper to generate a unique request code
 * e.g., OUT-2026-8741 or OD-2026-9214
 */
function generateRequestCode(type) {
  let prefix = 'OUT';
  if (type === 'one_day_duty') prefix = 'OD';
  else if (type === 'emergency') prefix = 'EMG';
  else if (type === 'special') prefix = 'SPC';
  const year = new Date().getFullYear();
  const timeSuffix = Date.now().toString().slice(-4);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${year}-${timeSuffix}${rand}`;
}

/**
 * Helper to record multi-tier approval history in outpass_approval_history table
 */
async function recordApprovalHistory(dbClient, {
  outpassId,
  studentId,
  parentId = null,
  advisorId = null,
  principalId = null,
  wardenId = null,
  role,
  userId = null,
  action,
  message = null,
  previousStatus = null,
  newStatus
}) {
  try {
    await dbClient.query(`
      INSERT INTO outpass_approval_history (
        outpass_id, student_id, parent_id, advisor_id, principal_id, warden_id,
        role, user_id, action, message, previous_status, new_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      outpassId, studentId, parentId, advisorId, principalId, wardenId,
      role, userId, action, message, previousStatus, newStatus
    ]);
  } catch (err) {
    console.warn('[Approval History Error]:', err.message);
  }
}
exports.recordApprovalHistory = recordApprovalHistory;

/* ==========================================================
   1. STUDENT CONTROLLERS
   ========================================================== */

/**
 * POST /api/outpass
 * Submit a new outpass request (Normal Outpass, One-Day Duty, Emergency, or Special)
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
      duty_description,
      emergency_type,
      special_type,
      emergency_contact,
      additional_remarks,
      attachment_url
    } = req.body;

    // 1. Validate request_type
    let outpassType = 'normal';
    if (request_type === 'duty' || request_type === 'one_day_duty') {
      outpassType = 'one_day_duty';
    } else if (request_type === 'emergency') {
      outpassType = 'emergency';
    } else if (request_type === 'special') {
      outpassType = 'special';
    }

    const isDuty = outpassType === 'one_day_duty';
    const isEmergency = outpassType === 'emergency';
    const isSpecial = outpassType === 'special';

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

    // 3. Advance Request Time Validation (Normal: 10h, Duty: 6h, Emergency: 0h immediate)
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

    // 4. Specific Validations
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

    // Clean Emergency & Special metadata
    const cleanEmergencyType = isEmergency
      ? (emergency_type && typeof emergency_type === 'string' && emergency_type.trim() ? emergency_type.trim() : 'Medical')
      : null;
    const cleanSpecialType = isSpecial
      ? (special_type && typeof special_type === 'string' && special_type.trim() ? special_type.trim() : 'Other')
      : null;

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

    const cleanEmergencyContact = (emergency_contact && typeof emergency_contact === 'string' && emergency_contact.trim())
      ? emergency_contact.trim()
      : contactPhone;
    const cleanRemarks = (additional_remarks && typeof additional_remarks === 'string' && additional_remarks.trim())
      ? additional_remarks.trim()
      : null;
    const cleanAttachment = (attachment_url && typeof attachment_url === 'string' && attachment_url.trim())
      ? attachment_url.trim()
      : null;

    // 6. Workflow Status Determination
    // Normal: Student -> Parent -> Warden (Status: PENDING_PARENT)
    // One-Day Duty: Student -> Class Advisor -> Principal (Status: PENDING_ADVISOR)
    // Emergency: Student -> Parent (Face Verified) -> Warden (Status: PENDING_PARENT)
    // Special: Student -> Parent -> Advisor -> Principal -> Warden (Status: PENDING_PARENT)
    let initialStatus = 'PENDING_PARENT';
    let parentStatus = 'pending';
    let advisorStatus = 'not_required';
    let wardenStatus = 'pending';
    let principalStatus = 'not_required';

    if (isDuty) {
      initialStatus = 'PENDING_PARENT';
      parentStatus = 'pending';
      advisorStatus = 'pending';
      principalStatus = 'pending';
      wardenStatus = 'not_required';
    } else if (isEmergency) {
      initialStatus = 'PENDING_WARDEN';
      parentStatus = 'not_required';
      advisorStatus = 'not_required';
      principalStatus = 'not_required';
      wardenStatus = 'pending';
    } else if (isSpecial) {
      initialStatus = 'PENDING_PARENT';
      parentStatus = 'pending';
      advisorStatus = 'pending';
      principalStatus = 'pending';
      wardenStatus = 'pending';
    }

    const requestCode = generateRequestCode(outpassType);

    // 7. Insert Outpass Request in MySQL
    const [insertResult] = await pool.query(`
      INSERT INTO outpass_requests (
        request_code,
        student_id,
        outpass_type,
        emergency_type,
        special_type,
        reason,
        destination,
        semester,
        student_phone,
        emergency_contact,
        additional_remarks,
        attachment_url,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      requestCode,
      student.id,
      outpassType,
      cleanEmergencyType,
      cleanSpecialType,
      reason.trim(),
      destination.trim(),
      semester || `Semester ${student.year_of_study * 2}`,
      contactPhone,
      cleanEmergencyContact,
      cleanRemarks,
      cleanAttachment,
      isDuty ? event_name.trim() : null,
      isDuty ? event_location.trim() : null,
      isDuty ? duty_date : null,
      isDuty && duty_description ? duty_description.trim() : null,
      fromDatetimeStr,
      toDatetimeStr,
      parentStatus,
      advisorStatus,
      wardenStatus,
      principalStatus,
      initialStatus
    ]);

    const outpassId = insertResult.insertId;

    // Record submission into outpass_approval_history
    await recordApprovalHistory(pool, {
      outpassId,
      studentId: student.id,
      role: 'student',
      userId: student.id,
      action: 'SUBMITTED',
      message: reason.trim(),
      previousStatus: null,
      newStatus: initialStatus
    });

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
      // Notify Linked Parent (OD starts at Parent with Face Verification)
      if (student.parent_id) {
        await notificationService.notifyParent({
          parentId: student.parent_id,
          title: 'One-Day Duty Request Submitted',
          message: `Your ward ${student.name} (${student.reg_no}) submitted a One-Day Duty request (${requestCode}) for ${event_name.trim()} on ${duty_date}. Parent Face Biometric Verification and Consent required.`,
          type: 'OUTPASS_SUBMITTED',
          referenceId: outpassId,
          linkUrl: '/parent-dashboard.html',
          io: req.io
        }).catch(err => console.warn('[Notif Error]:', err.message));
      }
    } else if (isEmergency) {
      // Emergency Outpass: Notify Warden directly for immediate authorization
      await notificationService.notifyWarden({
        title: '🚨 Urgent: Emergency Outpass Submitted',
        message: `Student ${student.name} (${student.reg_no}) submitted an Emergency Outpass (${cleanEmergencyType}) to ${destination.trim()}. Immediate Warden review required.`,
        type: 'EMERGENCY_OUTPASS_SUBMITTED',
        referenceId: outpassId,
        linkUrl: '/warden-dashboard.html',
        io: req.io
      }).catch(err => console.warn('[Notif Error]:', err.message));
    } else if (isSpecial) {
      // Notify Linked Parent
      if (student.parent_id) {
        await notificationService.notifyParent({
          parentId: student.parent_id,
          title: 'Special Outpass Request Submitted',
          message: `Your ward ${student.name} (${student.reg_no}) submitted a Special Outpass (${cleanSpecialType}) to ${destination.trim()}. Parent Face Biometric Verification and Consent required.`,
          type: 'OUTPASS_SUBMITTED',
          referenceId: outpassId,
          linkUrl: '/parent-dashboard.html',
          io: req.io
        }).catch(err => console.warn('[Notif Error]:', err.message));
      }
    } else {
      // Normal Outpass: Notify Parent
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

    let typeLabel = 'Normal Outpass';
    if (isDuty) typeLabel = 'One-Day Duty';
    else if (isEmergency) typeLabel = 'Emergency Outpass';
    else if (isSpecial) typeLabel = 'Special Outpass';

    return res.status(201).json({
      success: true,
      message: `${typeLabel} request submitted successfully.`,
      data: {
        id: outpassId,
        outpassId: outpassId,
        requestCode,
        requestType: typeLabel,
        outpassType,
        status: initialStatus,
        destination: destination.trim(),
        fromDatetime: fromDatetimeStr,
        toDatetime: toDatetimeStr,
        emergencyType: cleanEmergencyType,
        specialType: cleanSpecialType,
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
        o.emergency_type AS emergencyType,
        o.special_type AS specialType,
        o.emergency_contact AS emergencyContact,
        o.additional_remarks AS additionalRemarks,
        o.attachment_url AS attachmentUrl,
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
        o.parent_face_verified AS parentFaceVerified,
        o.advisor_approval_status AS advisorStatus,
        o.principal_approval_status AS principalStatus,
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

    const filterType = req.query.type ? normalizeOutpassType(req.query.type) : null;

    // Format formatted display properties with canonical outpass_type
    let formattedRequests = rows.map(r => {
      const canonicalType = normalizeOutpassType(r.requestType || r.outpass_type);

      let displayType = 'Normal Outpass';
      if (canonicalType === 'one_day_duty') {
        displayType = 'One-Day Duty';
      } else if (canonicalType === 'emergency') {
        displayType = 'Emergency Outpass';
      } else if (canonicalType === 'special') {
        displayType = 'Special Outpass';
      }
      
      let displayStatus = r.status || 'PENDING_PARENT';
      let badgeClass = 'status-pending-parent';

      if (displayStatus === 'PENDING_PARENT') {
        displayStatus = 'Pending Parent Approval';
        badgeClass = canonicalType === 'emergency' ? 'status-pending-emergency' : 'status-pending-parent';
      } else if (displayStatus === 'PENDING_ADVISOR') {
        displayStatus = 'Pending Class Advisor';
        badgeClass = 'status-pending-advisor';
      } else if (displayStatus === 'PENDING_PRINCIPAL') {
        displayStatus = canonicalType === 'special' ? 'Advisor Cleared • Pending Principal' : 'Advisor Approved • Pending Principal';
        badgeClass = 'status-pending-principal';
      } else if (displayStatus === 'PENDING_WARDEN') {
        displayStatus = canonicalType === 'special' ? 'Principal Cleared • Pending Warden' : 'Parent Approved • Pending Warden';
        badgeClass = canonicalType === 'emergency' ? 'status-emergency-warden' : 'status-pending-warden';
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
        outpass_type: canonicalType,
        requestType: canonicalType,
        displayType,
        displayStatus,
        badgeClass,
        effectiveRejectionReason: r.rejectionReason || r.advisorRejectionReason || r.parentRejectionReason || null
      };
    });

    const normalRequests = formattedRequests.filter(r => r.outpass_type === 'normal');
    const dutyRequests = formattedRequests.filter(r => r.outpass_type === 'one_day_duty');
    const emergencyRequests = formattedRequests.filter(r => r.outpass_type === 'emergency');
    const specialRequests = formattedRequests.filter(r => r.outpass_type === 'special');

    if (filterType) {
      formattedRequests = formattedRequests.filter(r => r.outpass_type === filterType);
    }

    return res.status(200).json({
      success: true,
      count: formattedRequests.length,
      requests: formattedRequests,
      normalRequests,
      dutyRequests,
      emergencyRequests,
      specialRequests
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

    const [regTotal] = await pool.query("SELECT COUNT(*) AS count FROM students WHERE is_active = 1;");
    const [regYears] = await pool.query(`
      SELECT year_of_study, COUNT(*) AS count 
      FROM students 
      WHERE is_active = 1 
      GROUP BY year_of_study 
      ORDER BY year_of_study ASC;
    `);

    const yearCounts = { year1: 0, year2: 0, year3: 0, year4: 0 };
    regYears.forEach(r => {
      const y = Number(r.year_of_study);
      if (y >= 1 && y <= 4) yearCounts[`year${y}`] = Number(r.count);
    });

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
        studentsOutside: Number(outsideCount[0].count) || 0,
        registeredTotal: Number(regTotal[0].count) || 0,
        registeredByYear: yearCounts
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
    const filterType = req.query.type ? normalizeOutpassType(req.query.type) : null;

    let stageCondition = `(
      (o.outpass_type IN ('normal', 'regular') AND o.parent_approval_status = 'approved') OR
      (o.outpass_type = 'emergency') OR
      (o.outpass_type = 'special' AND o.parent_approval_status = 'approved' AND o.advisor_approval_status = 'approved' AND o.principal_approval_status = 'approved')
    )`;

    if (filterType === 'normal') {
      stageCondition = "(o.outpass_type IN ('normal', 'regular') AND o.parent_approval_status = 'approved')";
    } else if (filterType === 'emergency') {
      stageCondition = "(o.outpass_type = 'emergency')";
    } else if (filterType === 'special') {
      stageCondition = "(o.outpass_type = 'special' AND o.parent_approval_status = 'approved' AND o.advisor_approval_status = 'approved' AND o.principal_approval_status = 'approved')";
    }

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.emergency_type AS emergencyType,
        o.special_type AS specialType,
        o.emergency_contact AS emergencyContact,
        o.additional_remarks AS additionalRemarks,
        o.attachment_url AS attachmentUrl,
        o.reason AS purpose,
        o.destination,
        o.semester,
        o.student_phone AS contactPhone,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.advisor_approval_status AS advisorStatus,
        o.principal_approval_status AS principalStatus,
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
        COALESCE(o.parent_verified_mobile, p.primary_phone) AS parentPhone,
        COALESCE(o.parent_verified_mobile, p.primary_phone) AS parentVerifiedMobile,
        o.parent_face_verified AS parentFaceVerified,
        CASE 
          WHEN o.parent_face_verified = 1 THEN 'VERIFIED' 
          ELSE 'UNVERIFIED' 
        END AS faceVerificationResult,
        CASE 
          WHEN o.parent_face_verified = 1 THEN 'VERIFIED' 
          ELSE 'UNVERIFIED' 
        END AS biometricVerificationResult,
        COALESCE(o.parent_approval_message, pm.message_body) AS parentMessage,
        o.parent_approved_at AS parentApprovedAt,
        o.parent_face_verified_at AS parentFaceVerifiedAt,
        adv.name AS advisorName,
        prc.name AS principalName
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      LEFT JOIN staff adv ON o.advisor_approved_by_id = adv.id
      LEFT JOIN staff prc ON o.principal_approved_by_id = prc.id
      LEFT JOIN parent_messages pm ON pm.id = (
        SELECT MAX(id) FROM parent_messages
        WHERE outpass_request_id = o.id
      )
      WHERE o.status = 'PENDING_WARDEN' 
        AND ${stageCondition}
      ORDER BY 
        CASE WHEN o.outpass_type = 'emergency' THEN 0 ELSE 1 END,
        o.created_at ASC
    `);

    const normalizedRows = rows.map(r => {
      const canonicalType = normalizeOutpassType(r.requestType || r.outpass_type);
      return {
        ...r,
        outpass_type: canonicalType,
        requestType: canonicalType
      };
    });

    const normalRequests = normalizedRows.filter(r => r.outpass_type === 'normal');
    const emergencyRequests = normalizedRows.filter(r => r.outpass_type === 'emergency');
    const specialRequests = normalizedRows.filter(r => r.outpass_type === 'special');

    return res.status(200).json({
      success: true,
      count: normalizedRows.length,
      pendingRequests: normalizedRows,
      normalRequests,
      emergencyRequests,
      specialRequests
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
        COALESCE(o.parent_verified_mobile, p.primary_phone) AS parentVerifiedMobile,
        o.parent_face_verified AS parentFaceVerified,
        CASE 
          WHEN o.parent_face_verified = 1 THEN 'VERIFIED' 
          ELSE 'UNVERIFIED' 
        END AS faceVerificationResult,
        CASE 
          WHEN o.parent_face_verified = 1 THEN 'VERIFIED' 
          ELSE 'UNVERIFIED' 
        END AS biometricVerificationResult,
        COALESCE(o.parent_approval_message, pm.message_body) AS parentMessage,
        o.parent_approved_at AS parentApprovedAt,
        o.parent_face_verified_at AS parentFaceVerifiedAt,
        e.exit_time AS exitTime,
        r.return_time AS returnTime
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
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
      `SELECT o.id, o.request_code, o.outpass_type, o.status, o.student_id,
              o.parent_face_verified, o.parent_approval_status,
              o.advisor_approval_status, o.principal_approval_status,
              s.name AS studentName, s.parent_id
       FROM outpass_requests o
       INNER JOIN students s ON o.student_id = s.id
       WHERE o.id = ?`,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outpass request not found.'
      });
    }

    const request = rows[0];

    // 2. Workflow Guard: Warden ONLY approves Normal, Emergency, or Special Outpasses
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

    // 4. Strict Hierarchy Verification
    if (request.outpass_type === 'emergency') {
      // Emergency Outpass routes directly to Warden: no Parent approval required
    } else if (request.outpass_type === 'special') {
      if (request.parent_face_verified !== 1 || request.parent_approval_status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Special Outpass requires Parent approval with Face Biometric Verification.'
        });
      }
      if (request.advisor_approval_status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Special Outpass requires Class Advisor approval before Warden authorization.'
        });
      }
      if (request.principal_approval_status !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Special Outpass requires Principal review before Warden final authorization.'
        });
      }
    }

    // 5. Update status to APPROVED and record warden audit timestamp
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

    // Record in outpass_approval_history
    await recordApprovalHistory(pool, {
      outpassId: requestId,
      studentId: request.student_id,
      wardenId,
      role: 'warden',
      userId: wardenId,
      action: 'WARDEN_APPROVED',
      message: 'Approved by Warden',
      previousStatus: 'PENDING_WARDEN',
      newStatus: 'APPROVED'
    });

    const typeLabel = request.outpass_type === 'emergency' ? 'Emergency Outpass' : (request.outpass_type === 'special' ? 'Special Outpass' : 'Normal Outpass');

    // Send notifications to Student and Parent
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: `${typeLabel} Approved by Warden`,
      message: `Your ${typeLabel} (${request.request_code}) has been approved by the Hostel Warden. Gate Pass QR is ready for generation.`,
      type: 'WARDEN_APPROVED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    if (request.parent_id && request.outpass_type !== 'emergency') {
      await notificationService.notifyParent({
        parentId: request.parent_id,
        title: `${typeLabel} Final Approval Granted`,
        message: `${typeLabel} (${request.request_code}) for your ward ${request.studentName || 'Student'} has received final approval from the Warden.`,
        type: 'WARDEN_APPROVED',
        referenceId: requestId,
        linkUrl: '/parent-dashboard.html',
        io: req.io
      }).catch(err => console.warn('[Notif Error]:', err.message));
    }

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
 * Accessible ONLY by authenticated Warden staff
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
      `SELECT o.id, o.request_code, o.outpass_type, o.status, o.student_id, s.name AS studentName, s.parent_id
       FROM outpass_requests o
       INNER JOIN students s ON o.student_id = s.id
       WHERE o.id = ?`,
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outpass request not found.'
      });
    }

    const request = rows[0];

    // 2. Workflow Guard: Warden ONLY rejects Normal, Emergency, or Special Outpasses
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

    // Record in outpass_approval_history
    await recordApprovalHistory(pool, {
      outpassId: requestId,
      studentId: request.student_id,
      wardenId,
      role: 'warden',
      userId: wardenId,
      action: 'WARDEN_REJECTED',
      message: rejection_reason.trim(),
      previousStatus: 'PENDING_WARDEN',
      newStatus: 'REJECTED'
    });

    const typeLabel = request.outpass_type === 'emergency' ? 'Emergency Outpass' : (request.outpass_type === 'special' ? 'Special Outpass' : 'Normal Outpass');

    // Notify Student
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: `${typeLabel} Rejected by Warden`,
      message: `Your ${typeLabel} (${request.request_code}) was rejected by Warden: ${rejection_reason.trim()}`,
      type: 'WARDEN_REJECTED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // Notify Parent
    if (request.parent_id && request.outpass_type !== 'emergency') {
      await notificationService.notifyParent({
        parentId: request.parent_id,
        title: `${typeLabel} Declined by Warden`,
        message: `${typeLabel} (${request.request_code}) for your ward was rejected by Warden: ${rejection_reason.trim()}`,
        type: 'WARDEN_REJECTED',
        referenceId: requestId,
        linkUrl: '/parent-dashboard.html',
        io: req.io
      }).catch(err => console.warn('[Notif Error]:', err.message));
    }

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
      `SELECT o.id, o.request_code, o.student_id, o.outpass_type, o.status,
              o.parent_approval_status, o.parent_face_verified,
              o.advisor_approval_status, o.advisor_approved_by_id,
              s.name AS studentName, s.parent_id, s.class_advisor_id
       FROM outpass_requests o
       INNER JOIN students s ON o.student_id = s.id
       WHERE o.id = ? FOR UPDATE;`,
      [requestId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const request = rows[0];

    // 2. Verify request type is ONE_DAY_DUTY or SPECIAL
    if (request.outpass_type !== 'one_day_duty' && request.outpass_type !== 'duty' && request.outpass_type !== 'special') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Principal can only review One-Day Permission and Special Outpass requests.' });
    }

    // 3. Verify status is PENDING_PRINCIPAL
    if (request.status !== 'PENDING_PRINCIPAL') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `Request cannot be approved. Current status is "${request.status}".` });
    }

    // 4. Verify Class Advisor clearance
    const isAdvisorApproved = request.advisor_approved_by_id || request.advisor_approval_status === 'approved';
    if (!isAdvisorApproved) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Class Advisor must approve request before Principal authorization.' });
    }

    // 4b. For Special Outpass and One-Day Duty, verify Parent has approved with Face Verification
    if (request.outpass_type === 'special' || request.outpass_type === 'one_day_duty' || request.outpass_type === 'duty') {
      if (request.parent_approval_status !== 'approved' || request.parent_face_verified !== 1) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Request must have Parent Face Biometric Verification and Approval before Principal review.' });
      }
    }

    // 5. Update status:
    // One-Day Duty: moves to APPROVED
    // Special Outpass: moves to PENDING_WARDEN (forwarding to Warden for final approval)
    const isSpecial = request.outpass_type === 'special';
    const nextStatus = isSpecial ? 'PENDING_WARDEN' : 'APPROVED';
    const now = new Date();

    await connection.query(`
      UPDATE outpass_requests
      SET 
        status = ?,
        overall_status = ?,
        principal_approval_status = 'approved',
        principal_approved_by_id = ?,
        principal_approved_at = ?
      WHERE id = ?;
    `, [nextStatus, isSpecial ? 'pending' : 'approved', principalId, now, requestId]);

    if (!isSpecial) {
      await connection.query(`
        UPDATE one_day_duty_requests
        SET overall_status = 'approved'
        WHERE request_code = ?;
      `, [request.request_code]).catch(err => console.warn('[OD Table Sync]:', err.message));
    }

    // Record in outpass_approval_history
    await recordApprovalHistory(connection, {
      outpassId: requestId,
      studentId: request.student_id,
      principalId,
      role: 'principal',
      userId: principalId,
      action: 'PRINCIPAL_APPROVED',
      message: 'Approved by Principal',
      previousStatus: 'PENDING_PRINCIPAL',
      newStatus: nextStatus
    });

    await connection.commit();

    if (isSpecial) {
      // Forward to Warden
      await notificationService.notifyWarden({
        title: 'Special Outpass Requires Final Approval',
        message: `Special Outpass for ${request.studentName} (${request.request_code}) was cleared by Principal and is waiting for your final approval.`,
        type: 'PRINCIPAL_APPROVED',
        referenceId: requestId,
        linkUrl: '/warden-dashboard.html',
        io: req.io
      }).catch(err => console.warn('[Notif Error]:', err.message));

      await notificationService.notifyStudent({
        studentId: request.student_id,
        title: 'Special Outpass Cleared by Principal',
        message: `Your Special Outpass (${request.request_code}) was cleared by Principal and forwarded to Warden for final clearance.`,
        type: 'PRINCIPAL_APPROVED',
        referenceId: requestId,
        linkUrl: '/student-dashboard.html',
        io: req.io
      }).catch(err => console.warn('[Notif Error]:', err.message));
    } else {
      // Notify Student of OD Approval
      await notificationService.notifyStudent({
        studentId: request.student_id,
        title: 'One-Day Permission Approved by Principal',
        message: `Your One-Day Permission (${request.request_code}) has been approved by Principal. Gate Pass QR is eligible for generation.`,
        type: 'PRINCIPAL_APPROVED',
        referenceId: requestId,
        linkUrl: '/student-dashboard.html',
        io: req.io
      }).catch(err => console.warn('[Notif Error]:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: isSpecial
        ? 'Special Outpass cleared by Principal and forwarded to Warden for final approval.'
        : 'One-Day Permission approved successfully by Principal. Eligible for digital security QR generation.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: nextStatus,
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
 * Reject One-Day Permission or Special Outpass request
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
      `SELECT o.id, o.request_code, o.student_id, o.outpass_type, o.status,
              s.name AS studentName, s.parent_id, s.class_advisor_id
       FROM outpass_requests o
       INNER JOIN students s ON o.student_id = s.id
       WHERE o.id = ? FOR UPDATE;`,
      [requestId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const request = rows[0];

    // 2. Verify request type is ONE_DAY_DUTY or SPECIAL
    if (request.outpass_type !== 'one_day_duty' && request.outpass_type !== 'duty' && request.outpass_type !== 'special') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Principal can only reject One-Day Permission and Special Outpass requests.' });
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

    // Record in outpass_approval_history
    await recordApprovalHistory(connection, {
      outpassId: requestId,
      studentId: request.student_id,
      principalId,
      role: 'principal',
      userId: principalId,
      action: 'PRINCIPAL_REJECTED',
      message: cleanReason,
      previousStatus: 'PENDING_PRINCIPAL',
      newStatus: 'REJECTED'
    });

    await connection.commit();

    const typeLabel = request.outpass_type === 'special' ? 'Special Outpass' : 'One-Day Permission';

    // Notify Student
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: `${typeLabel} Rejected by Principal`,
      message: `Your ${typeLabel} (${request.request_code}) was rejected by Principal: ${cleanReason}`,
      type: 'PRINCIPAL_REJECTED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // If special outpass, notify parent & advisor as required by prompt
    if (request.outpass_type === 'special') {
      if (request.parent_id) {
        await notificationService.notifyParent({
          parentId: request.parent_id,
          title: 'Special Outpass Rejected by Principal',
          message: `Special Outpass for your ward was rejected by Principal: ${cleanReason}`,
          type: 'PRINCIPAL_REJECTED',
          referenceId: requestId,
          linkUrl: '/parent-dashboard.html',
          io: req.io
        }).catch(err => console.warn('[Notif Error]:', err.message));
      }
      if (request.class_advisor_id) {
        await notificationService.notifyAdvisor({
          advisorId: request.class_advisor_id,
          title: 'Special Outpass Rejected by Principal',
          message: `Special Outpass for ${request.studentName} was rejected by Principal: ${cleanReason}`,
          type: 'PRINCIPAL_REJECTED',
          referenceId: requestId,
          linkUrl: '/advisor-dashboard.html',
          io: req.io
        }).catch(err => console.warn('[Notif Error]:', err.message));
      }
    }

    return res.status(200).json({
      success: true,
      message: `${typeLabel} rejected by Principal.`,
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

    // 1. Pending One-Day Duty requests
    const [pendingDutyRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.status = 'PENDING_ADVISOR'
        AND (o.outpass_type = 'one_day_duty' OR o.outpass_type = 'duty')
        AND ((s.class_advisor_id IS NOT NULL AND s.class_advisor_id = ?) OR (s.class_advisor_id IS NULL AND s.department = ?));
    `, [advisorId, advisorDept]);

    // 1B. Pending Special Outpass requests (Tier 2 Clearance - Parent Approved + Face Biometric Verified)
    const [pendingSpecialRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.status = 'PENDING_ADVISOR'
        AND o.outpass_type = 'special'
        AND o.parent_approval_status = 'approved'
        AND o.parent_face_verified = 1
        AND ((s.class_advisor_id IS NOT NULL AND s.class_advisor_id = ?) OR (s.class_advisor_id IS NULL AND s.department = ?));
    `, [advisorId, advisorDept]);

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
        AND ((s.class_advisor_id IS NOT NULL AND s.class_advisor_id = ?) OR (s.class_advisor_id IS NULL AND s.department = ?))
      ORDER BY o.created_at DESC
      LIMIT 6;
    `, [advisorId, advisorDept]);

      const dutyCount = Number(pendingDutyRows[0].count) || 0;
      const specialCount = Number(pendingSpecialRows[0].count) || 0;

      return res.status(200).json({
        success: true,
        stats: {
          pendingDutyCount: dutyCount,
          pendingSpecialCount: specialCount,
          pendingCount: dutyCount + specialCount,
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
 * GET /api/advisor/duty/pending or /api/advisor/one-day/pending
 * Pending One-Day Duty requests queue for Class Advisor
 * Strictly filters outpass_type IN ('one_day_duty', 'duty')
 * Zero Special Outpasses returned.
 */
exports.getAdvisorDutyPending = async (req, res, next) => {
  try {
    const advisorId = req.user.id;

    const [advRows] = await pool.query(
      'SELECT id, name, department FROM staff WHERE id = ?',
      [advisorId]
    );

    const advisorDept = advRows.length > 0 ? advRows[0].department : null;

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        'one_day_duty' AS requestType,
        'one_day_duty' AS outpass_type,
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
        s.phone AS studentRegisteredPhone
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.status = 'PENDING_ADVISOR'
        AND o.outpass_type IN ('one_day_duty', 'duty')
        AND o.parent_approval_status = 'approved'
        AND o.parent_face_verified = 1
        AND ((s.class_advisor_id IS NOT NULL AND s.class_advisor_id = ?) OR (s.class_advisor_id IS NULL AND s.department = ?))
      ORDER BY o.created_at ASC
    `, [advisorId, advisorDept]);

    const dutyRequests = rows.map(r => ({
      ...r,
      outpass_type: 'one_day_duty',
      requestType: 'one_day_duty'
    }));

    return res.status(200).json({
      success: true,
      count: dutyRequests.length,
      advisorDept,
      requests: dutyRequests,
      dutyRequests,
      pendingDutyRequests: dutyRequests
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/advisor/special/pending
 * Pending Special Outpass requests queue for Class Advisor
 * Strictly filters outpass_type = 'special'
 * ONLY returns requests that have completed Parent Face Biometrics (Tier 1)
 * Zero One-Day Duty requests returned.
 */
exports.getAdvisorSpecialPending = async (req, res, next) => {
  try {
    const advisorId = req.user.id;

    const [advRows] = await pool.query(
      'SELECT id, name, department FROM staff WHERE id = ?',
      [advisorId]
    );

    const advisorDept = advRows.length > 0 ? advRows[0].department : null;

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        'special' AS requestType,
        'special' AS outpass_type,
        o.special_type AS specialType,
        o.emergency_contact AS emergencyContact,
        o.additional_remarks AS additionalRemarks,
        o.attachment_url AS attachmentUrl,
        o.reason AS purpose,
        o.destination,
        o.semester,
        o.student_phone AS contactPhone,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.advisor_approval_status AS advisorStatus,
        o.parent_approval_status AS parentApprovalStatus,
        o.parent_face_verified AS parentFaceVerified,
        CASE 
          WHEN o.parent_face_verified = 1 THEN 'VERIFIED' 
          ELSE 'UNVERIFIED' 
        END AS faceVerificationResult,
        COALESCE(o.parent_approval_message, pm.message_body) AS parentMessage,
        o.parent_approved_at AS parentApprovedAt,
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
      LEFT JOIN parent_messages pm ON pm.id = (
        SELECT MAX(id) FROM parent_messages
        WHERE outpass_request_id = o.id
      )
      WHERE o.status = 'PENDING_ADVISOR'
        AND o.outpass_type = 'special'
        AND o.parent_approval_status = 'approved'
        AND o.parent_face_verified = 1
        AND ((s.class_advisor_id IS NOT NULL AND s.class_advisor_id = ?) OR (s.class_advisor_id IS NULL AND s.department = ?))
      ORDER BY o.created_at ASC
    `, [advisorId, advisorDept]);

    const specialRequests = rows.map(r => ({
      ...r,
      outpass_type: 'special',
      requestType: 'special'
    }));

    return res.status(200).json({
      success: true,
      count: specialRequests.length,
      advisorDept,
      requests: specialRequests,
      specialRequests,
      pendingSpecialRequests: specialRequests
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/advisor/pending
 * Pending One-Day Duty and Special Outpass requests partitioned for Class Advisor
 * Filtered securely by advisor's assigned department
 */
exports.getAdvisorPending = async (req, res, next) => {
  try {
    const filterType = req.query.type ? normalizeOutpassType(req.query.type) : null;

    if (filterType === 'one_day_duty') {
      return exports.getAdvisorDutyPending(req, res, next);
    }
    if (filterType === 'special') {
      return exports.getAdvisorSpecialPending(req, res, next);
    }

    const advisorId = req.user.id;

    // Get Advisor Department
    const [advRows] = await pool.query(
      'SELECT id, name, department FROM staff WHERE id = ?',
      [advisorId]
    );

    const advisorDept = advRows.length > 0 ? advRows[0].department : null;

    // 1. Fetch One-Day Duty requests
    const [dutyRows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        'one_day_duty' AS requestType,
        'one_day_duty' AS outpass_type,
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
        s.phone AS studentRegisteredPhone
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.status = 'PENDING_ADVISOR'
        AND o.outpass_type IN ('one_day_duty', 'duty')
        AND ((s.class_advisor_id IS NOT NULL AND s.class_advisor_id = ?) OR (s.class_advisor_id IS NULL AND s.department = ?))
      ORDER BY o.created_at ASC
    `, [advisorId, advisorDept]);

    // 2. Fetch Special Outpass requests (Only Tier 1 Parent Face Verified)
    const [specialRows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        'special' AS requestType,
        'special' AS outpass_type,
        o.special_type AS specialType,
        o.emergency_contact AS emergencyContact,
        o.additional_remarks AS additionalRemarks,
        o.attachment_url AS attachmentUrl,
        o.reason AS purpose,
        o.destination,
        o.semester,
        o.student_phone AS contactPhone,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.advisor_approval_status AS advisorStatus,
        o.parent_approval_status AS parentApprovalStatus,
        o.parent_face_verified AS parentFaceVerified,
        CASE 
          WHEN o.parent_face_verified = 1 THEN 'VERIFIED' 
          ELSE 'UNVERIFIED' 
        END AS faceVerificationResult,
        COALESCE(o.parent_approval_message, pm.message_body) AS parentMessage,
        o.parent_approved_at AS parentApprovedAt,
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
      LEFT JOIN parent_messages pm ON pm.id = (
        SELECT MAX(id) FROM parent_messages
        WHERE outpass_request_id = o.id
      )
      WHERE o.status = 'PENDING_ADVISOR'
        AND o.outpass_type = 'special'
        AND o.parent_approval_status = 'approved'
        AND o.parent_face_verified = 1
        AND ((s.class_advisor_id IS NOT NULL AND s.class_advisor_id = ?) OR (s.class_advisor_id IS NULL AND s.department = ?))
      ORDER BY o.created_at ASC
    `, [advisorId, advisorDept]);

    const dutyRequests = dutyRows.map(r => ({
      ...r,
      outpass_type: 'one_day_duty',
      requestType: 'one_day_duty'
    }));

    const specialRequests = specialRows.map(r => ({
      ...r,
      outpass_type: 'special',
      requestType: 'special'
    }));

    return res.status(200).json({
      success: true,
      count: dutyRequests.length + specialRequests.length,
      advisorDept,
      dutyRequests,
      specialRequests,
      pendingDutyRequests: dutyRequests, // Strictly duty only!
      pendingSpecialRequests: specialRequests // Strictly special only!
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
        o.outpass_type AS requestType,
        o.special_type AS specialType,
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
        o.outpass_type AS requestType,
        o.special_type AS specialType,
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
 * Approve One-Day Duty or Special Outpass by Class Advisor -> moves to PENDING_PRINCIPAL
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
      SELECT o.id, o.request_code, o.student_id, o.outpass_type, o.status,
             o.parent_approval_status, o.parent_face_verified,
             s.department AS studentDept, s.class_advisor_id, s.name AS studentName, s.parent_id
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

    // 3. Department / Advisor Assignment Authorization Check
    let isAdvisorAuthorized = false;
    if (request.class_advisor_id) {
      isAdvisorAuthorized = (Number(request.class_advisor_id) === Number(advisorId));
    } else {
      isAdvisorAuthorized = (request.studentDept === advisorDept);
    }

    if (!isAdvisorAuthorized) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: `Authorization Error: You are not authorized to approve requests for this student.`
      });
    }

    // 4. Verify request is pending
    if (request.status !== 'PENDING_ADVISOR') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Request is not pending Class Advisor approval (Current status: ${request.status}).`
      });
    }

    // 4b. For Special Outpass and One-Day Duty, verify Parent has approved with Face Verification
    if (request.outpass_type === 'special' || request.outpass_type === 'one_day_duty' || request.outpass_type === 'duty') {
      if (request.parent_approval_status !== 'approved' || request.parent_face_verified !== 1) {
        await connection.rollback();
        const typeTitle = (request.outpass_type === 'special') ? 'Special Outpass' : 'One-Day Duty';
        return res.status(400).json({
          success: false,
          message: `${typeTitle} must have Parent Face Biometric Verification and Approval before Class Advisor clearance.`
        });
      }
    }

    // 5. Update status to PENDING_PRINCIPAL (forwarding to Principal)
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

    // Also update one_day_duty_requests table if duty
    if (request.outpass_type !== 'special') {
      await connection.query(`
        UPDATE one_day_duty_requests
        SET advisor_approval_status = 'approved'
        WHERE request_code = ?;
      `, [request.request_code]).catch(err => console.warn('[OD Table Sync]:', err.message));
    }

    // Record in outpass_approval_history
    await recordApprovalHistory(connection, {
      outpassId: requestId,
      studentId: request.student_id,
      advisorId,
      role: 'class_advisor',
      userId: advisorId,
      action: 'ADVISOR_APPROVED',
      message: 'Approved by Class Advisor',
      previousStatus: 'PENDING_ADVISOR',
      newStatus: 'PENDING_PRINCIPAL'
    });

    await connection.commit();

    const isSpecial = request.outpass_type === 'special';
    const typeLabel = isSpecial ? 'Special Outpass' : 'One-Day Permission';

    // 6. Notify Principal
    await notificationService.notifyPrincipal({
      title: `${typeLabel} Requires Approval`,
      message: `A Class Advisor has approved a ${typeLabel} request (${request.request_code}) and it is waiting for your final approval.`,
      type: 'PRINCIPAL_PENDING',
      referenceId: requestId,
      linkUrl: '/principal-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // 7. Notify Student
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: `${typeLabel} Cleared by Advisor`,
      message: `Your ${typeLabel} (${request.request_code}) was approved by your Class Advisor and forwarded to Principal for review.`,
      type: 'ADVISOR_APPROVED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      message: `${typeLabel} approved by Class Advisor and forwarded to Principal for authorization.`,
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
 * Reject OD or Special request by Class Advisor
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
      SELECT o.id, o.request_code, o.student_id, o.outpass_type, o.status, s.department AS studentDept, s.class_advisor_id, s.name AS studentName, s.parent_id
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

    // 3. Department / Advisor Assignment Authorization Check
    let isAdvisorAuthorized = false;
    if (request.class_advisor_id) {
      isAdvisorAuthorized = (Number(request.class_advisor_id) === Number(advisorId));
    } else {
      isAdvisorAuthorized = (request.studentDept === advisorDept);
    }

    if (!isAdvisorAuthorized) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: `Authorization Error: You are not authorized to reject requests for this student.`
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

    if (request.outpass_type !== 'special') {
      await connection.query(`
        UPDATE one_day_duty_requests
        SET advisor_approval_status = 'rejected', overall_status = 'rejected', rejection_reason = ?
        WHERE request_code = ?;
      `, [cleanReason, request.request_code]).catch(err => console.warn('[OD Table Sync]:', err.message));
    }

    // Record in outpass_approval_history
    await recordApprovalHistory(connection, {
      outpassId: requestId,
      studentId: request.student_id,
      advisorId,
      role: 'class_advisor',
      userId: advisorId,
      action: 'ADVISOR_REJECTED',
      message: cleanReason,
      previousStatus: 'PENDING_ADVISOR',
      newStatus: 'REJECTED'
    });

    await connection.commit();

    const isSpecial = request.outpass_type === 'special';
    const typeLabel = isSpecial ? 'Special Outpass' : 'One-Day Duty';

    // 5. Notify Student
    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: `${typeLabel} Request Rejected`,
      message: `Your ${typeLabel} request (${request.request_code}) was rejected by your Class Advisor: ${cleanReason}`,
      type: 'ADVISOR_REJECTED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // If special outpass, notify parent as required by prompt
    if (isSpecial && request.parent_id) {
      await notificationService.notifyParent({
        parentId: request.parent_id,
        title: 'Special Outpass Rejected by Advisor',
        message: `Special Outpass for your ward was rejected by Class Advisor: ${cleanReason}`,
        type: 'ADVISOR_REJECTED',
        referenceId: requestId,
        linkUrl: '/parent-dashboard.html',
        io: req.io
      }).catch(err => console.warn('[Notif Error]:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: `${typeLabel} request rejected by Class Advisor.`,
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
          WHEN o.parent_face_verified = 1 THEN 'VERIFIED'
          ELSE 'UNVERIFIED'
        END AS faceVerification,
        o.parent_face_verified AS parentFaceVerified,
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
      faceVerification: r.faceVerification,
      parentFaceVerified: Boolean(r.parentFaceVerified),
      biometricVerification: r.faceVerification === 'VERIFIED' ? 'Face Verified' : 'Unverified',
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
          WHEN o.parent_face_verified = 1 THEN 'VERIFIED'
          ELSE 'UNVERIFIED'
        END AS faceVerification,
        o.parent_face_verified AS parentFaceVerified,
        pm.responded_at AS respondedAt,
        pm.created_at AS createdAt
      FROM parent_messages pm
      INNER JOIN students s ON pm.student_id = s.id
      LEFT JOIN parents p ON pm.parent_id = p.id
      LEFT JOIN outpass_requests o ON pm.outpass_request_id = o.id
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

/**
 * GET /api/outpass/:id
 * Secure endpoint to fetch details of a single outpass request
 * Strictly enforces server-side access control:
 * - Student can ONLY view their own outpass (request.student_id === req.user.id) -> 403 Forbidden otherwise
 * - Parent can ONLY view their linked student's outpass (request.parent_id === req.user.id) -> 403 Forbidden otherwise
 * - Class Advisor can ONLY view their assigned student's outpass (or dept match if unassigned) -> 403 Forbidden otherwise
 * - Principal & Warden can view institutionally
 */
exports.getOutpassById = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const user = req.user;

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.outpass_type,
        o.emergency_type AS emergencyType,
        o.special_type AS specialType,
        o.emergency_contact AS emergencyContact,
        o.additional_remarks AS additionalRemarks,
        o.attachment_url AS attachmentUrl,
        o.reason AS purpose,
        o.destination,
        o.semester,
        o.student_phone AS contactPhone,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.overall_status,
        o.parent_approval_status AS parentStatus,
        o.parent_face_verified AS parentFaceVerified,
        o.advisor_approval_status AS advisorStatus,
        o.principal_approval_status AS principalStatus,
        o.warden_approval_status AS wardenStatus,
        o.created_at AS submittedDate,
        s.id AS studentId,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.year_of_study AS studentYear,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.parent_id AS parentId,
        s.class_advisor_id AS classAdvisorId,
        p.father_name AS parentName,
        p.primary_phone AS parentPhone
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      WHERE o.id = ?
    `, [requestId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outpass request not found.'
      });
    }

    const request = rows[0];
    const role = (user.role || '').toLowerCase().trim();

    // 1. Student Authorization: must own the request
    if (role === 'student') {
      if (Number(request.studentId) !== Number(user.id)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You are not authorized to access another student\'s outpass request.'
        });
      }
    }
    // 2. Parent Authorization: must be linked parent
    else if (role === 'parent') {
      if (Number(request.parentId) !== Number(user.id)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You are not authorized to access an outpass request for another student.'
        });
      }
    }
    // 3. Class Advisor Authorization: must match assignment or dept
    else if (role === 'class_advisor' || role === 'advisor') {
      const [advRows] = await pool.query('SELECT department FROM staff WHERE id = ?', [user.id]);
      const advDept = advRows.length > 0 ? advRows[0].department : null;
      let isAuthorized = false;
      if (request.classAdvisorId) {
        isAuthorized = (Number(request.classAdvisorId) === Number(user.id));
      } else {
        isAuthorized = (request.studentDept === advDept);
      }
      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You are not authorized to view requests for students outside your assignment.'
        });
      }
    }

    return res.status(200).json({
      success: true,
      request
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/warden/registered-students/stats
 * Census metrics: total registered students, year-wise breakdown, department-wise breakdown, block distribution
 */
exports.getWardenRegisteredStudentsStats = async (req, res, next) => {
  try {
    const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM students WHERE is_active = 1;');
    const totalStudents = Number(totalRows[0].total) || 0;

    const [yearRows] = await pool.query(`
      SELECT year_of_study, COUNT(*) AS count
      FROM students
      WHERE is_active = 1
      GROUP BY year_of_study
      ORDER BY year_of_study ASC;
    `);

    const yearCounts = { year1: 0, year2: 0, year3: 0, year4: 0, other: 0 };
    yearRows.forEach(r => {
      const y = Number(r.year_of_study);
      if (y >= 1 && y <= 4) {
        yearCounts[`year${y}`] = Number(r.count);
      } else {
        yearCounts.other += Number(r.count);
      }
    });

    const [deptRows] = await pool.query(`
      SELECT department, year_of_study, COUNT(*) AS count
      FROM students
      WHERE is_active = 1
      GROUP BY department, year_of_study
      ORDER BY department ASC, year_of_study ASC;
    `);

    const [blockRows] = await pool.query(`
      SELECT hostel_block, COUNT(*) AS count
      FROM students
      WHERE is_active = 1
      GROUP BY hostel_block
      ORDER BY hostel_block ASC;
    `);

    const [deptList] = await pool.query('SELECT DISTINCT department FROM students WHERE is_active = 1 AND department IS NOT NULL ORDER BY department;');
    const [blockList] = await pool.query('SELECT DISTINCT hostel_block FROM students WHERE is_active = 1 AND hostel_block IS NOT NULL ORDER BY hostel_block;');

    return res.status(200).json({
      success: true,
      stats: {
        totalStudents,
        yearCounts,
        byYear: yearRows.map(r => ({ year: Number(r.year_of_study), count: Number(r.count) })),
        byDept: deptRows.map(r => ({ department: r.department, year: Number(r.year_of_study), count: Number(r.count) })),
        byBlock: blockRows.map(r => ({ block: r.hostel_block, count: Number(r.count) })),
        departments: deptList.map(d => d.department),
        blocks: blockList.map(b => b.hostel_block)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/outpass/warden/registered-students
 * Filterable & searchable directory of registered hostel students with year of study
 */
exports.getWardenRegisteredStudents = async (req, res, next) => {
  try {
    const { year, department, block, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = ['s.is_active = 1'];
    const params = [];

    if (year && year !== 'all' && !isNaN(parseInt(year, 10))) {
      whereClauses.push('s.year_of_study = ?');
      params.push(parseInt(year, 10));
    }

    if (department && department !== 'all') {
      whereClauses.push('s.department = ?');
      params.push(department);
    }

    if (block && block !== 'all') {
      whereClauses.push('s.hostel_block = ?');
      params.push(block);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      whereClauses.push('(s.name LIKE ? OR s.reg_no LIKE ? OR s.room_no LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)');
      params.push(q, q, q, q, q);
    }

    const whereSql = whereClauses.join(' AND ');

    // Total count for pagination
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM students s WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total) || 0;

    // Student records with parent and advisor details
    const [students] = await pool.query(`
      SELECT 
        s.id,
        s.reg_no AS regNo,
        s.name,
        s.email,
        s.phone,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.section,
        s.room_no AS roomNo,
        s.hostel_block AS hostelBlock,
        s.is_active AS isActive,
        s.profile_completed AS profileCompleted,
        s.created_at AS registeredAt,
        COALESCE(p.father_name, p.mother_name, 'Not Listed') AS parentName,
        p.primary_phone AS parentPhone,
        p.secondary_phone AS parentSecondaryPhone,
        p.email AS parentEmail,
        adv.name AS advisorName,
        (
          SELECT COUNT(*) 
          FROM outpass_requests o 
          WHERE o.student_id = s.id
        ) AS totalOutpasses,
        (
          SELECT COUNT(*) 
          FROM exit_logs e
          LEFT JOIN return_logs r ON e.outpass_request_id = r.outpass_request_id
          WHERE e.student_id = s.id AND r.id IS NULL
        ) AS isCurrentlyOutside
      FROM students s
      LEFT JOIN parents p ON s.parent_id = p.id
      LEFT JOIN staff adv ON s.class_advisor_id = adv.id
      WHERE ${whereSql}
      ORDER BY s.year_of_study ASC, s.reg_no ASC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    // Year summary
    const [yearSummaryRows] = await pool.query(`
      SELECT year_of_study, COUNT(*) AS count
      FROM students
      WHERE is_active = 1
      GROUP BY year_of_study
      ORDER BY year_of_study ASC;
    `);

    const yearSummary = { total: 0, year1: 0, year2: 0, year3: 0, year4: 0 };
    yearSummaryRows.forEach(r => {
      const y = Number(r.year_of_study);
      const c = Number(r.count);
      yearSummary.total += c;
      if (y >= 1 && y <= 4) yearSummary[`year${y}`] = c;
    });

    return res.status(200).json({
      success: true,
      students,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      },
      yearSummary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/warden/parents/search
 * Server-side parent search by mobile number with strict Warden role enforcement
 */
exports.searchWardenParentByMobile = async (req, res, next) => {
  try {
    // 1. Role enforcement
    if (req.user?.role !== 'warden') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only authorized Wardens can access Parent Face Management.'
      });
    }

    const rawMobile = req.query.mobile || req.query.q || req.query.phone || '';
    if (!rawMobile || typeof rawMobile !== 'string' || !rawMobile.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Parent mobile number is required for search.'
      });
    }

    const cleanMobile = rawMobile.replace(/\D/g, '').trim();
    if (cleanMobile.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please enter at least 3 digits of the mobile number.'
      });
    }

    // 2. Query parents with joined student details
    const [rows] = await pool.query(`
      SELECT 
        p.id AS parentId,
        p.father_name AS fatherName,
        p.mother_name AS motherName,
        p.primary_phone AS mobileNumber,
        p.secondary_phone AS secondaryPhone,
        p.relationship,
        p.face_registered AS faceRegistered,
        p.face_status AS faceStatus,
        p.face_registered_at AS faceRegisteredAt,
        p.face_revoked_at AS faceRevokedAt,
        p.face_revoked_by AS faceRevokedBy,
        p.face_revocation_reason AS faceRevocationReason,
        s.id AS studentId,
        s.reg_no AS studentRollNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.year_of_study AS studentYear,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock
      FROM parents p
      LEFT JOIN students s ON s.parent_id = p.id AND s.is_active = true
      WHERE p.primary_phone = ? 
         OR p.primary_phone LIKE ?
         OR p.secondary_phone = ?
      ORDER BY p.id DESC
      LIMIT 10;
    `, [cleanMobile, `%${cleanMobile}%`, cleanMobile]);

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        parents: [],
        message: 'No parent found matching the provided mobile number.'
      });
    }

    // Deduplicate/group by parentId in case parent has multiple linked students
    const parentMap = new Map();

    for (const r of rows) {
      if (!parentMap.has(r.parentId)) {
        const resolvedFaceStatus = r.faceStatus || (r.faceRegistered ? 'ACTIVE' : 'NOT_REGISTERED');
        parentMap.set(r.parentId, {
          parentId: r.parentId,
          parentName: r.fatherName || r.motherName || 'Parent Guardian',
          mobileNumber: r.mobileNumber,
          relationship: r.relationship || 'Father',
          faceStatus: resolvedFaceStatus,
          isRevoked: resolvedFaceStatus === 'REVOKED',
          isActive: resolvedFaceStatus === 'ACTIVE',
          registeredAt: r.faceRegisteredAt,
          revokedAt: r.faceRevokedAt,
          revocationReason: r.faceRevocationReason,
          studentName: r.studentName || 'Not Linked',
          studentRollNo: r.studentRollNo || 'N/A',
          studentDept: r.studentDept || 'N/A',
          studentRoom: r.studentRoom ? `${r.studentBlock || ''} - Room ${r.studentRoom}` : 'N/A',
          students: []
        });
      }
      if (r.studentId) {
        parentMap.get(r.parentId).students.push({
          id: r.studentId,
          name: r.studentName,
          rollNo: r.studentRollNo,
          dept: r.studentDept,
          room: `${r.studentBlock || ''} - ${r.studentRoom || ''}`
        });
      }
    }

    const parentResults = Array.from(parentMap.values());

    return res.status(200).json({
      success: true,
      count: parentResults.length,
      parents: parentResults
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/warden/parents/revoke-face
 * Revokes parent face registration with audit logging and session token cancellation
 */
exports.revokeParentFace = async (req, res, next) => {
  try {
    // 1. Strict Warden authorization
    if (req.user?.role !== 'warden') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only authorized Wardens can revoke parent face biometrics.'
      });
    }

    const parentId = req.body.parentId || req.params.id;
    const reason = (req.body.reason || 'Warden authorized face registration revocation').trim();

    if (!parentId || isNaN(Number(parentId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid Parent ID is required.'
      });
    }

    // 2. Fetch parent
    const [parents] = await pool.query(
      'SELECT id, father_name, mother_name, primary_phone, face_status, face_registered FROM parents WHERE id = ?',
      [parentId]
    );

    if (parents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Parent account not found.'
      });
    }

    const parent = parents[0];
    const currentStatus = parent.face_status || (parent.face_registered ? 'ACTIVE' : 'NOT_REGISTERED');

    if (currentStatus === 'REVOKED') {
      return res.status(400).json({
        success: false,
        message: 'Parent face registration is already revoked.'
      });
    }

    const now = new Date();
    const wardenId = req.user.id;

    // 3. Soft-revoke: update parents table
    await pool.query(`
      UPDATE parents 
      SET 
        face_status = 'REVOKED',
        face_registered = 0,
        face_revoked_at = ?,
        face_revoked_by = ?,
        face_revocation_reason = ?
      WHERE id = ?
    `, [now, wardenId, reason, parentId]);

    // 4. Soft-revoke: update parent_face_templates
    await pool.query(`
      UPDATE parent_face_templates 
      SET status = 'REVOKED', updated_at = ?
      WHERE parent_id = ?
    `, [now, parentId]);

    // 5. Invalidate all active verification sessions for this parent
    await pool.query(`
      UPDATE parent_face_verifications 
      SET status = 'EXPIRED'
      WHERE parent_id = ? AND status = 'ACTIVE'
    `, [parentId]);

    // 6. Record audit log entry
    await pool.query(`
      INSERT INTO parent_face_audit_logs (parent_id, warden_id, action, reason, metadata, created_at)
      VALUES (?, ?, 'FACE_REVOKED', ?, ?, ?)
    `, [
      parentId,
      wardenId,
      reason,
      JSON.stringify({
        wardenStaffId: req.user.identifier || req.user.staffId || null,
        revokedAt: now.toISOString(),
        previousStatus: currentStatus
      }),
      now
    ]).catch(err => console.warn('[Audit Log Insert Warning]:', err.message));

    // 7. Emit real-time WebSocket notification if socket instance present
    if (req.io) {
      req.io.to(`role_parent`).emit('sh:parent:face_revoked', {
        parentId: Number(parentId),
        revokedAt: now.toISOString(),
        reason
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Parent face registration successfully revoked. Parent must complete new face registration before approving future outpasses.',
      parentId: Number(parentId),
      faceStatus: 'REVOKED',
      revokedAt: now.toISOString()
    });

  } catch (error) {
    next(error);
  }
};




