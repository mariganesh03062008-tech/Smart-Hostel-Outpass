const { pool } = require('../utils/db');
const notificationService = require('../services/notificationService');

/* ==========================================================
   1. STUDENT: REQUEST TIME EXTENSION
   ========================================================== */

/**
 * POST /api/extension/request
 * Submit an emergency time extension request for active outpass
 * Accessible ONLY by authenticated students
 */
exports.requestExtension = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { outpass_id, outpassId: altOutpassId, requested_extension_until, requested_until, extended_to_datetime, reason, extension_hours } = req.body;

    // 1. Fetch verified student details
    const [stuRows] = await pool.query(
      'SELECT id, name, reg_no, department, hostel_block, room_no, current_hostel_status FROM students WHERE id = ? AND is_active = true;',
      [studentId]
    );

    if (stuRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student record not found.'
      });
    }

    const student = stuRows[0];
    const targetOutpassId = outpass_id || altOutpassId;
    let pass;

    // 2. Validate specified outpass or find student's active approved outpass
    if (targetOutpassId) {
      const [specificRows] = await pool.query(`
        SELECT 
          o.id AS outpassId,
          o.student_id AS passStudentId,
          o.request_code AS requestCode,
          o.outpass_type AS requestType,
          o.from_datetime AS leavingDatetime,
          o.to_datetime AS returnDatetime,
          o.status AS outpassStatus,
          q.id AS qrId,
          q.status AS qrStatus,
          q.valid_until AS qrValidUntil,
          e.id AS exitLogId,
          r.id AS returnLogId
        FROM outpass_requests o
        LEFT JOIN qr_codes q ON o.id = q.outpass_request_id
        LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
        LEFT JOIN return_logs r ON o.id = r.outpass_request_id
        WHERE o.id = ?;
      `, [targetOutpassId]);

      if (specificRows.length === 0) {
        return res.status(404).json({
          success: false,
          validity: 'OUTPASS_NOT_FOUND',
          message: 'Outpass request not found.'
        });
      }

      if (specificRows[0].passStudentId !== studentId) {
        return res.status(403).json({
          success: false,
          validity: 'FORBIDDEN',
          message: 'Unauthorized: This outpass does not belong to you.'
        });
      }

      pass = specificRows[0];
    } else {
      const [outpassRows] = await pool.query(`
        SELECT 
          o.id AS outpassId,
          o.student_id AS passStudentId,
          o.request_code AS requestCode,
          o.outpass_type AS requestType,
          o.from_datetime AS leavingDatetime,
          o.to_datetime AS returnDatetime,
          o.status AS outpassStatus,
          q.id AS qrId,
          q.status AS qrStatus,
          q.valid_until AS qrValidUntil,
          e.id AS exitLogId,
          r.id AS returnLogId
        FROM outpass_requests o
        LEFT JOIN qr_codes q ON o.id = q.outpass_request_id
        LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
        LEFT JOIN return_logs r ON o.id = r.outpass_request_id
        WHERE o.student_id = ? AND o.status = 'APPROVED'
        ORDER BY o.id DESC
        LIMIT 1;
      `, [studentId]);

      if (outpassRows.length === 0) {
        return res.status(400).json({
          success: false,
          validity: 'NO_ACTIVE_OUTPASS',
          message: 'No active approved outpass found for your account.'
        });
      }

      pass = outpassRows[0];
    }

    // 3. Guardrail: Outpass must be currently active
    if (pass.outpassStatus !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        validity: 'OUTPASS_NOT_ACTIVE',
        message: `Outpass is in "${pass.outpassStatus}" state. Extensions can only be requested for approved outpasses.`
      });
    }

    // 4. Guardrail: Outpass must not be already completed
    if (pass.returnLogId || pass.outpassStatus === 'COMPLETED' || student.current_hostel_status === 'INSIDE') {
      return res.status(400).json({
        success: false,
        validity: 'OUTPASS_COMPLETED',
        message: 'This outpass has already been completed and returned.'
      });
    }

    // 5. Guardrail: QR must not be revoked
    if (pass.qrStatus === 'REVOKED') {
      return res.status(403).json({
        success: false,
        validity: 'QR_REVOKED',
        message: 'This outpass has been revoked by Hostel Administration and cannot be extended.'
      });
    }

    // 6. Guardrail: No duplicate PENDING extension requests
    const [pendingRows] = await pool.query(
      'SELECT id, extended_to_datetime, created_at FROM extension_requests WHERE outpass_request_id = ? AND status = "PENDING" LIMIT 1;',
      [pass.outpassId]
    );

    if (pendingRows.length > 0) {
      return res.status(409).json({
        success: false,
        validity: 'PENDING_EXTENSION_EXISTS',
        message: 'You already have a pending extension request awaiting Warden review.',
        details: {
          extensionId: pendingRows[0].id,
          requestedUntil: pendingRows[0].extended_to_datetime,
          requestedAt: pendingRows[0].created_at
        }
      });
    }

    // 7. Validate requested return datetime
    const rawRequestedUntil = requested_extension_until || requested_until || extended_to_datetime;
    let targetDatetime;
    if (rawRequestedUntil) {
      if (typeof rawRequestedUntil === 'string') {
        const cleanedStr = rawRequestedUntil.trim();
        targetDatetime = new Date(cleanedStr);
        if (isNaN(targetDatetime.getTime())) {
          targetDatetime = new Date(cleanedStr.replace(' ', 'T'));
        }
      } else {
        targetDatetime = new Date(rawRequestedUntil);
      }
    } else if (extension_hours && Number(extension_hours) > 0) {
      const currentExpected = new Date(pass.returnDatetime);
      targetDatetime = new Date(currentExpected.getTime() + Number(extension_hours) * 3600 * 1000);
    }

    if (!targetDatetime || isNaN(targetDatetime.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'A valid requested new return date and time is required.'
      });
    }

    const currentReturnDate = new Date(pass.returnDatetime);
    if (targetDatetime.getTime() <= currentReturnDate.getTime()) {
      return res.status(400).json({
        success: false,
        validity: 'INVALID_EXTENSION_TIME',
        message: 'Requested new return time must be strictly later than your current scheduled return time.',
        debug: {
          requested: targetDatetime.toISOString(),
          currentExpected: currentReturnDate.toISOString()
        }
      });
    }

    // 8. Validate reason
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reason for requesting time extension is required.'
      });
    }

    // 9. Insert into extension_requests table
    const targetDatetimeStr = targetDatetime;
    const [insertResult] = await pool.query(`
      INSERT INTO extension_requests (
        outpass_request_id,
        student_id,
        extended_to_datetime,
        reason,
        status,
        previous_valid_until
      ) VALUES (?, ?, ?, ?, 'PENDING', ?);
    `, [
      pass.outpassId,
      studentId,
      targetDatetimeStr,
      reason.trim(),
      pass.returnDatetime
    ]);

    // 10. Notify Warden of Emergency Extension Request
    await notificationService.notifyWarden({
      title: 'Emergency Extension Requested',
      message: `Student ${student.name} (${student.reg_no}) requested an emergency extension for outpass (${pass.requestCode}). Reason: ${reason.trim()}`,
      type: 'EXTENSION_REQUESTED',
      referenceId: insertResult.insertId,
      linkUrl: '/warden-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // Emit Socket.IO event for real-time dashboard sync
    const io = req.io || notificationService.getSocketIoInstance();
    if (io) {
      io.to('role_warden').emit('extension:requested', {
        extensionId: insertResult.insertId,
        outpassId: pass.outpassId,
        studentName: student.name,
        rollNumber: student.reg_no,
        reason: reason.trim()
      });
      io.emit('sh:notification:new');
    }

    return res.status(201).json({
      success: true,
      message: 'Extension request submitted successfully',
      data: {
        extensionId: insertResult.insertId,
        id: insertResult.insertId,
        outpassId: pass.outpassId,
        outpass_id: pass.outpassId,
        requestCode: pass.requestCode,
        currentReturnTime: pass.returnDatetime,
        requestedReturnTime: targetDatetimeStr,
        requested_extension_until: targetDatetimeStr,
        reason: reason.trim(),
        status: 'pending',
        requestedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    next(error);
  }
};

exports.createExtensionRequest = exports.requestExtension;

/* ==========================================================
   2. WARDEN: PENDING EXTENSION REQUESTS
   ========================================================== */

/**
 * GET /api/extension-requests OR /api/extension/warden/pending
 * Retrieve all pending extension requests for Warden review
 * Accessible ONLY by authenticated Wardens
 */
exports.getWardenPendingExtensions = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        ex.id AS id,
        ex.id AS extensionId,
        ex.outpass_request_id AS outpass_id,
        ex.outpass_request_id AS outpassId,
        ex.student_id AS student_id,
        ex.student_id AS studentId,
        ex.extended_to_datetime AS requested_extension_until,
        ex.extended_to_datetime AS requestedUntil,
        ex.reason,
        ex.status,
        ex.previous_valid_until AS original_expected_return_time,
        ex.previous_valid_until AS previousReturnTime,
        ex.created_at AS created_at,
        ex.created_at AS requestedAt,
        s.name AS student_name,
        s.name AS studentName,
        s.reg_no AS roll_number,
        s.reg_no AS rollNumber,
        s.department,
        s.year_of_study AS yearOfStudy,
        s.hostel_block AS hostel_block,
        s.hostel_block AS hostelBlock,
        s.room_no AS room_no,
        s.room_no AS roomNumber,
        s.phone AS studentPhone,
        o.request_code AS request_code,
        o.request_code AS requestCode,
        o.outpass_type AS outpass_type,
        o.outpass_type AS requestType,
        o.to_datetime AS currentReturnTime,
        o.destination,
        e.exit_time AS exitTime,
        TIMESTAMPDIFF(MINUTE, o.to_datetime, ex.extended_to_datetime) AS extensionMinutes
      FROM extension_requests ex
      INNER JOIN outpass_requests o ON ex.outpass_request_id = o.id
      INNER JOIN students s ON ex.student_id = s.id
      LEFT JOIN exit_logs e ON o.id = e.outpass_request_id
      WHERE ex.status = 'PENDING'
      ORDER BY ex.created_at ASC;
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
      pendingExtensions: rows
    });

  } catch (error) {
    next(error);
  }
};

exports.getPendingExtensionRequests = exports.getWardenPendingExtensions;

/**
 * PATCH /api/extension-requests/:id/review
 * Unified Warden review endpoint: approve or reject
 */
exports.reviewExtensionRequest = async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!action || (action !== 'approve' && action !== 'reject')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid review action. Must be "approve" or "reject".'
      });
    }

    if (action === 'approve') {
      return exports.approveExtension(req, res, next);
    } else {
      if (!req.body.rejection_reason && req.body.reason) {
        req.body.rejection_reason = req.body.reason;
      }
      return exports.rejectExtension(req, res, next);
    }
  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   3. WARDEN: APPROVE EXTENSION (ATOMIC TRANSACTION)
   ========================================================== */

/**
 * PATCH /api/extension/:id/approve
 * Approve student extension, atomically extend outpass to_datetime & QR valid_until
 * Accessible ONLY by authenticated Wardens
 */
exports.approveExtension = async (req, res, next) => {
  let connection;
  try {
    const wardenId = req.user.id;
    const extensionId = req.params.id;

    if (!extensionId || isNaN(parseInt(extensionId, 10))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid extension request ID.'
      });
    }

    // Dedicated MySQL connection for atomic transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Fetch Extension, Outpass, Student, and QR with FOR UPDATE locking
    const [rows] = await connection.query(`
      SELECT 
        ex.id AS extensionId,
        ex.outpass_request_id AS outpassId,
        ex.student_id AS studentId,
        ex.extended_to_datetime AS requestedUntil,
        ex.reason,
        ex.status AS extensionStatus,
        o.request_code AS requestCode,
        o.to_datetime AS currentReturnTime,
        o.status AS outpassStatus,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.current_hostel_status AS studentHostelStatus,
        q.id AS qrId,
        q.token AS qrToken,
        q.valid_until AS qrValidUntil,
        q.status AS qrStatus
      FROM extension_requests ex
      INNER JOIN outpass_requests o ON ex.outpass_request_id = o.id
      INNER JOIN students s ON ex.student_id = s.id
      LEFT JOIN qr_codes q ON o.id = q.outpass_request_id
      WHERE ex.id = ?
      FOR UPDATE;
    `, [extensionId]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Extension request not found.'
      });
    }

    const ex = rows[0];

    // 2. Check if already reviewed
    if (ex.extensionStatus !== 'PENDING') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        validity: 'ALREADY_REVIEWED',
        message: `This extension request has already been ${ex.extensionStatus}.`
      });
    }

    // 3. Check outpass is not completed
    if (ex.outpassStatus === 'COMPLETED' || ex.studentHostelStatus === 'INSIDE') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        validity: 'OUTPASS_COMPLETED',
        message: 'Cannot approve extension for a student who has already returned and completed the pass.'
      });
    }

    // 4. Check QR is not revoked
    if (ex.qrStatus === 'REVOKED') {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        validity: 'QR_REVOKED',
        message: 'Cannot approve extension for a revoked outpass.'
      });
    }

    const previousReturnTime = ex.currentReturnTime;
    const newApprovedReturnTime = ex.requestedUntil;
    const serverNow = new Date();

    // 5. Update Outpass Expected Return Datetime in MySQL
    await connection.query(`
      UPDATE outpass_requests 
      SET 
        to_datetime = ?,
        updated_at = ?
      WHERE id = ?;
    `, [newApprovedReturnTime, serverNow, ex.outpassId]);

    // 6. Update QR Code valid_until and ensure status is ACTIVE (reactivating if previously expired)
    if (ex.qrId) {
      await connection.query(`
        UPDATE qr_codes 
        SET 
          valid_until = ?,
          status = 'ACTIVE',
          updated_at = ?
        WHERE id = ?;
      `, [newApprovedReturnTime, serverNow, ex.qrId]);
    }

    // 7. Update Extension Request status to APPROVED with audit trail
    await connection.query(`
      UPDATE extension_requests 
      SET 
        status = 'APPROVED',
        previous_valid_until = ?,
        approved_valid_until = ?,
        reviewed_by_staff_id = ?,
        reviewed_at = ?,
        updated_at = ?
      WHERE id = ?;
    `, [
      previousReturnTime,
      newApprovedReturnTime,
      wardenId,
      serverNow,
      serverNow,
      ex.extensionId
    ]);

    // Commit Transaction
    await connection.commit();

    // Notify Student of Extension Approval
    await notificationService.notifyStudent({
      studentId: ex.studentId,
      title: 'Emergency Extension Approved',
      message: `Your emergency time extension for outpass (${ex.requestCode}) was approved until ${new Date(newApprovedReturnTime).toLocaleString()}. QR validity updated.`,
      type: 'EXTENSION_APPROVED',
      referenceId: ex.extensionId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // Real-time Socket.IO emission
    const io = req.io || notificationService.getSocketIoInstance();
    if (io) {
      io.to(`user_student_${ex.studentId}`).emit('extension:approved', {
        extensionId: ex.extensionId,
        outpassId: ex.outpassId,
        approvedReturnTime: newApprovedReturnTime
      });
      io.to('role_warden').emit('extension:status_changed', {
        extensionId: ex.extensionId,
        status: 'APPROVED'
      });
      io.emit('sh:notification:new');
    }

    return res.status(200).json({
      success: true,
      status: 'APPROVED',
      message: 'Extension request approved successfully. Pass validity extended.',
      data: {
        extensionId: ex.extensionId,
        outpassId: ex.outpassId,
        requestCode: ex.requestCode,
        studentName: ex.studentName,
        rollNumber: ex.rollNumber,
        previousReturnTime,
        approvedReturnTime: newApprovedReturnTime,
        reviewedBy: wardenId,
        reviewedAt: serverNow.toISOString()
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
   4. WARDEN: REJECT EXTENSION
   ========================================================== */

/**
 * PATCH /api/extension/:id/reject
 * Reject extension request with reason (QR validity remains unchanged)
 * Accessible ONLY by authenticated Wardens
 */
exports.rejectExtension = async (req, res, next) => {
  try {
    const wardenId = req.user.id;
    const extensionId = req.params.id;
    const { rejection_reason } = req.body;

    if (!extensionId || isNaN(parseInt(extensionId, 10))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid extension request ID.'
      });
    }

    if (!rejection_reason || typeof rejection_reason !== 'string' || !rejection_reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required.'
      });
    }

    const [rows] = await pool.query(
      'SELECT id, outpass_request_id, student_id, status FROM extension_requests WHERE id = ?;',
      [extensionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Extension request not found.'
      });
    }

    const ex = rows[0];
    if (ex.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `This extension request has already been ${ex.status}.`
      });
    }

    const serverNow = new Date();
    const cleanReason = rejection_reason.trim();
    await pool.query(`
      UPDATE extension_requests 
      SET 
        status = 'REJECTED',
        rejection_reason = ?,
        reviewed_by_staff_id = ?,
        reviewed_at = ?,
        updated_at = ?
      WHERE id = ?;
    `, [
      cleanReason,
      wardenId,
      serverNow,
      serverNow,
      extensionId
    ]);

    // Notify Student of Extension Rejection
    await notificationService.notifyStudent({
      studentId: ex.student_id,
      title: 'Emergency Extension Rejected',
      message: `Your emergency time extension request was rejected by Warden: ${cleanReason}`,
      type: 'EXTENSION_REJECTED',
      referenceId: extensionId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    // Real-time Socket.IO emission
    const io = req.io || notificationService.getSocketIoInstance();
    if (io) {
      io.to(`user_student_${ex.student_id}`).emit('extension:rejected', {
        extensionId: parseInt(extensionId, 10),
        rejectionReason: cleanReason
      });
      io.to('role_warden').emit('extension:status_changed', {
        extensionId: parseInt(extensionId, 10),
        status: 'REJECTED'
      });
      io.emit('sh:notification:new');
    }

    return res.status(200).json({
      success: true,
      status: 'REJECTED',
      message: 'Extension request rejected.',
      data: {
        extensionId: parseInt(extensionId, 10),
        rejectionReason: cleanReason,
        reviewedAt: serverNow.toISOString()
      }
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   5. EXTENSION HISTORY (STUDENT & WARDEN)
   ========================================================== */

/**
 * GET /api/extension/student/history
 * Retrieve student's extension history
 * Accessible ONLY by authenticated students
 */
exports.getStudentExtensionHistory = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    const [rows] = await pool.query(`
      SELECT 
        ex.id AS extensionId,
        ex.outpass_request_id AS outpassId,
        ex.extended_to_datetime AS requestedUntil,
        ex.previous_valid_until AS previousReturnTime,
        ex.approved_valid_until AS approvedReturnTime,
        ex.reason,
        ex.status,
        ex.rejection_reason AS rejectionReason,
        ex.created_at AS requestedAt,
        ex.reviewed_at AS reviewedAt,
        o.request_code AS requestCode,
        st.name AS reviewedByName
      FROM extension_requests ex
      INNER JOIN outpass_requests o ON ex.outpass_request_id = o.id
      LEFT JOIN staff st ON ex.reviewed_by_staff_id = st.id
      WHERE ex.student_id = ?
      ORDER BY ex.created_at DESC;
    `, [studentId]);

    return res.status(200).json({
      success: true,
      count: rows.length,
      history: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/extension/warden/history
 * Retrieve warden extension audit history with filters
 * Accessible ONLY by authenticated Wardens
 */
exports.getWardenExtensionHistory = async (req, res, next) => {
  try {
    const { filter, date } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filter === 'pending') {
      whereClause += ' AND ex.status = "PENDING"';
    } else if (filter === 'approved') {
      whereClause += ' AND ex.status = "APPROVED"';
    } else if (filter === 'rejected') {
      whereClause += ' AND ex.status = "REJECTED"';
    } else if (filter === 'date' && date) {
      whereClause += ' AND DATE(ex.created_at) = ?';
      params.push(date);
    }

    const [rows] = await pool.query(`
      SELECT 
        ex.id AS extensionId,
        ex.outpass_request_id AS outpassId,
        ex.extended_to_datetime AS requestedUntil,
        ex.previous_valid_until AS previousReturnTime,
        ex.approved_valid_until AS approvedReturnTime,
        ex.reason,
        ex.status,
        ex.rejection_reason AS rejectionReason,
        ex.created_at AS requestedAt,
        ex.reviewed_at AS reviewedAt,
        s.name AS studentName,
        s.reg_no AS rollNumber,
        s.department,
        s.hostel_block AS hostelBlock,
        s.room_no AS roomNumber,
        o.request_code AS requestCode,
        st.name AS reviewedByName
      FROM extension_requests ex
      INNER JOIN outpass_requests o ON ex.outpass_request_id = o.id
      INNER JOIN students s ON ex.student_id = s.id
      LEFT JOIN staff st ON ex.reviewed_by_staff_id = st.id
      ${whereClause}
      ORDER BY ex.created_at DESC
      LIMIT 100;
    `, params);

    return res.status(200).json({
      success: true,
      count: rows.length,
      history: rows
    });

  } catch (error) {
    next(error);
  }
};
