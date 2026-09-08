const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool } = require('../utils/db');
const notificationService = require('../services/notificationService');

/**
 * Helper to generate a cryptographically secure random QR token
 * e.g., qr_sec_9e3f4a8b1c0d5e7f2a4b6c8d0e1f3a5b7c9d1e3f5a7b
 */
function generateSecureQrToken() {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `qr_sec_${randomBytes}`;
}

/**
 * Helper to render standard QR Code Base64 PNG Data URL
 * Encodes ONLY: HOSTEL-QR:<secure-token>
 */
async function generateQrDataUrl(qrString) {
  return await QRCode.toDataURL(qrString, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    margin: 2,
    width: 320,
    color: {
      dark: '#111827',
      light: '#ffffff'
    }
  });
}

/* ==========================================================
   1. QR GENERATION & REGENERATION (WARDEN ONLY)
   ========================================================== */

/**
 * POST /api/qr/generate/:outpassId
 * Generate a cryptographically secure QR code for a final-approved outpass
 * Accessible ONLY by authenticated Warden
 */
exports.generateQrForOutpass = async (req, res, next) => {
  try {
    const outpassId = req.params.outpassId;
    const actorId = req.user.id;

    // 1. Fetch outpass request and student details
    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code,
        o.student_id,
        o.outpass_type,
        o.destination,
        o.reason,
        o.from_datetime,
        o.to_datetime,
        o.status,
        o.parent_approval_status,
        o.advisor_approval_status,
        o.warden_approval_status,
        o.principal_approval_status,
        o.approved_by_warden_id,
        o.principal_approved_by_id,
        o.advisor_approved_by_id,
        s.name AS student_name,
        s.reg_no AS student_reg_no,
        s.department AS student_dept
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.id = ?
    `, [outpassId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outpass request not found.'
      });
    }

    const outpass = rows[0];

    // 2. Strict status check: MUST be APPROVED
    if (outpass.status !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: `QR code cannot be generated for outpass in "${outpass.status}" state. Only final approved requests are eligible for QR generation.`
      });
    }

    // 3. Workflow-Specific Approval Verification (Rule 13)
    if (outpass.outpass_type === 'normal') {
      // Normal Outpass: Requires Warden final approval
      const isWardenApproved = outpass.approved_by_warden_id || outpass.warden_approval_status === 'approved';
      if (!isWardenApproved) {
        return res.status(400).json({
          success: false,
          message: 'Normal Outpass requires Warden final approval before QR generation.'
        });
      }
    } else if (outpass.outpass_type === 'one_day_duty' || outpass.outpass_type === 'duty') {
      // One-Day Permission: Requires Class Advisor approval AND Principal final approval
      const isAdvisorApproved = outpass.advisor_approved_by_id || outpass.advisor_approval_status === 'approved';
      const isPrincipalApproved = outpass.principal_approved_by_id || outpass.principal_approval_status === 'approved';

      if (!isAdvisorApproved) {
        return res.status(400).json({
          success: false,
          message: 'One-Day Permission requires Class Advisor approval before QR generation.'
        });
      }

      if (!isPrincipalApproved) {
        return res.status(400).json({
          success: false,
          message: 'One-Day Permission requires Principal final approval before QR generation.'
        });
      }
    }

    // 3. Check if an active QR already exists for this outpass
    const [existingQrs] = await pool.query(
      'SELECT id, token, qr_data, qr_image_data, valid_from, valid_until, status, created_at FROM qr_codes WHERE outpass_request_id = ? AND status = "ACTIVE"',
      [outpassId]
    );

    if (existingQrs.length > 0) {
      const existing = existingQrs[0];
      return res.status(200).json({
        success: true,
        message: 'Active QR code already exists for this outpass.',
        data: {
          qrId: existing.id,
          outpassId: outpass.id,
          requestCode: outpass.request_code,
          qrToken: existing.token,
          qrData: existing.qr_data,
          qrImageData: existing.qr_image_data,
          validFrom: existing.valid_from,
          validUntil: existing.valid_until,
          status: existing.status,
          generatedAt: existing.created_at
        }
      });
    }

    // 4. Generate cryptographically secure token & QR image
    // Encodes ONLY secure token in standard format: HOSTEL-QR:<secure-token>
    const secureToken = generateSecureQrToken();
    const qrString = `HOSTEL-QR:${secureToken}`;
    const qrImageDataUrl = await generateQrDataUrl(qrString);

    // 5. Insert QR record into MySQL
    const [insertResult] = await pool.query(`
      INSERT INTO qr_codes (
        outpass_request_id,
        token,
        qr_data,
        qr_image_data,
        valid_from,
        valid_until,
        status,
        generated_by_warden_id,
        max_uses
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 2)
    `, [
      outpass.id,
      secureToken,
      qrString,
      qrImageDataUrl,
      outpass.from_datetime,
      outpass.to_datetime,
      actorId
    ]);

    // Send notifications to Student and Caretaker
    await notificationService.notifyStudent({
      studentId: outpass.student_id,
      title: 'Security QR Code Generated',
      message: `Your digital Gate Pass QR for outpass (${outpass.request_code}) is now ACTIVE. Present at security desk during departure.`,
      type: 'QR_GENERATED',
      referenceId: outpass.id,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    await notificationService.notifyCaretaker({
      title: 'New Active Outpass QR Ready',
      message: `Student ${outpass.student_name || 'Student'} (${outpass.student_reg_no || ''}) has an active QR for ${outpass.destination || 'Exit'}. Ready for departure verification.`,
      type: 'QR_GENERATED',
      referenceId: outpass.id,
      linkUrl: '/caretaker-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(201).json({
      success: true,
      message: 'Cryptographically secure QR Code generated successfully.',
      data: {
        qrId: insertResult.insertId,
        outpassId: outpass.id,
        requestCode: outpass.request_code,
        qrToken: secureToken,
        qrData: qrString,
        qrImageData: qrImageDataUrl,
        validFrom: outpass.from_datetime,
        validUntil: outpass.to_datetime,
        status: 'ACTIVE',
        student: {
          name: outpass.student_name,
          regNo: outpass.student_reg_no,
          department: outpass.student_dept
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/qr/regenerate/:outpassId
 * Invalidate existing QR and generate a brand-new token for the outpass
 * Accessible ONLY by authenticated Warden
 */
exports.regenerateQr = async (req, res, next) => {
  try {
    const outpassId = req.params.outpassId;
    const wardenId = req.user.id;
    const { reason } = req.body;

    // 1. Fetch outpass
    const [outpassRows] = await pool.query(
      'SELECT id, request_code, status, from_datetime, to_datetime FROM outpass_requests WHERE id = ?',
      [outpassId]
    );

    if (outpassRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const outpass = outpassRows[0];
    if (outpass.status !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Only approved outpasses can have QR regenerated.' });
    }

    // 2. Invalidate previous QR records
    await pool.query(`
      UPDATE qr_codes
      SET 
        status = 'REVOKED',
        revoked_by_warden_id = ?,
        revoked_at = NOW(),
        revocation_reason = ?
      WHERE outpass_request_id = ? AND status = 'ACTIVE'
    `, [wardenId, reason || 'Regenerated by Warden', outpassId]);

    // 3. Generate fresh token & QR Image
    const secureToken = generateSecureQrToken();
    const qrString = `HOSTEL-QR:${secureToken}`;
    const qrImageDataUrl = await generateQrDataUrl(qrString);

    // 4. Insert newly generated active QR
    const [insertResult] = await pool.query(`
      INSERT INTO qr_codes (
        outpass_request_id,
        token,
        qr_data,
        qr_image_data,
        valid_from,
        valid_until,
        status,
        generated_by_warden_id,
        max_uses
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 2)
    `, [
      outpass.id,
      secureToken,
      qrString,
      qrImageDataUrl,
      outpass.from_datetime,
      outpass.to_datetime,
      wardenId
    ]);

    return res.status(201).json({
      success: true,
      message: 'Previous QR revoked and new secure QR Code regenerated successfully.',
      data: {
        qrId: insertResult.insertId,
        outpassId: outpass.id,
        requestCode: outpass.request_code,
        qrToken: secureToken,
        qrData: qrString,
        qrImageData: qrImageDataUrl,
        validFrom: outpass.from_datetime,
        validUntil: outpass.to_datetime,
        status: 'ACTIVE'
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/qr/revoke/:qrId
 * Revoke an active QR code
 * Accessible ONLY by authenticated Warden
 */
exports.revokeQr = async (req, res, next) => {
  try {
    const qrId = req.params.qrId;
    const wardenId = req.user.id;
    const { revocation_reason } = req.body;

    const [rows] = await pool.query('SELECT id, outpass_request_id, status FROM qr_codes WHERE id = ?', [qrId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'QR Code record not found.' });
    }

    const qr = rows[0];
    if (qr.status === 'REVOKED') {
      return res.status(400).json({ success: false, message: 'QR Code is already revoked.' });
    }

    const reason = (revocation_reason && typeof revocation_reason === 'string' && revocation_reason.trim()) 
      ? revocation_reason.trim() 
      : 'Revoked by Warden for security inspection';

    const now = new Date();
    await pool.query(`
      UPDATE qr_codes
      SET 
        status = 'REVOKED',
        revoked_by_warden_id = ?,
        revoked_at = ?,
        revocation_reason = ?
      WHERE id = ?
    `, [wardenId, now, reason, qrId]);

    return res.status(200).json({
      success: true,
      message: 'QR Code revoked successfully. It will no longer validate at gate checkpoints.',
      data: {
        qrId: qr.id,
        status: 'REVOKED',
        revokedAt: now.toISOString(),
        revocationReason: reason
      }
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   2. STUDENT ACTIVE OUTPASS & COUNTDOWN
   ========================================================== */

/**
 * GET /api/student/active-outpass
 * Retrieve the authenticated student's current approved outpass with an active QR code
 */
exports.getStudentActiveOutpass = async (req, res, next) => {
  try {
    const studentId = req.user.id;

    // Fetch latest active QR and associated approved pass for this student
    const [rows] = await pool.query(`
      SELECT 
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
        q.id AS qrId,
        q.token AS qrToken,
        q.qr_data AS qrData,
        q.qr_image_data AS qrImageData,
        q.valid_from AS validFrom,
        q.valid_until AS validUntil,
        q.status AS qrStatus,
        q.scanned_exit_at AS scannedExitAt,
        q.scanned_return_at AS scannedReturnAt,
        q.is_used AS isUsed,
        q.used_count AS usedCount,
        q.max_uses AS maxUses,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.current_hostel_status AS studentHostelStatus
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      INNER JOIN qr_codes q ON o.id = q.outpass_request_id
      WHERE o.student_id = ? AND o.status = 'APPROVED' AND q.status != 'COMPLETED'
      ORDER BY q.id DESC
      LIMIT 1
    `, [studentId]);

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        hasActiveOutpass: false,
        activeOutpass: null,
        message: 'No active outpass found.'
      });
    }

    const pass = rows[0];
    const serverNow = new Date();
    const validFromDate = new Date(pass.validFrom);
    const validUntilDate = new Date(pass.validUntil);

    // Fetch latest extension request for this outpass if any
    const [extRows] = await pool.query(`
      SELECT 
        id AS extensionId,
        extended_to_datetime AS requestedUntil,
        previous_valid_until AS previousReturnTime,
        approved_valid_until AS approvedReturnTime,
        reason,
        status,
        rejection_reason AS rejectionReason,
        created_at AS requestedAt,
        reviewed_at AS reviewedAt
      FROM extension_requests
      WHERE outpass_request_id = ?
      ORDER BY id DESC
      LIMIT 1;
    `, [pass.outpassId]);

    const latestExtension = extRows.length > 0 ? extRows[0] : null;

    let computedStatus = 'ACTIVE';
    let statusMessage = 'Active & Ready for Gate Clearance';

    if (pass.qrStatus === 'REVOKED') {
      computedStatus = 'REVOKED';
      statusMessage = 'QR Code Revoked';
    } else if (pass.isUsed || pass.usedCount >= pass.maxUses) {
      computedStatus = 'COMPLETED';
      statusMessage = 'Outpass Completed';
    } else if (serverNow < validFromDate) {
      computedStatus = 'NOT_YET_VALID';
      statusMessage = `Pass activates at scheduled leaving time (${validFromDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    } else if (serverNow > validUntilDate) {
      computedStatus = 'EXPIRED';
      statusMessage = 'QR Code Expired';
    } else if (pass.scannedExitAt || pass.exitTime) {
      computedStatus = 'ACTIVE';
      statusMessage = 'Student Outside Hostel (Exit Recorded)';
    }

    return res.status(200).json({
      success: true,
      hasActiveOutpass: true,
      serverTime: serverNow.toISOString(),
      activeOutpass: {
        outpassId: pass.outpassId,
        requestCode: pass.requestCode,
        studentName: pass.studentName,
        rollNumber: pass.studentRegNo,
        department: pass.studentDept,
        roomNo: pass.studentRoom,
        hostelBlock: pass.studentBlock,
        studentHostelStatus: pass.studentHostelStatus || (pass.exitTime ? 'OUTSIDE' : 'INSIDE'),
        requestType: pass.requestType === 'one_day_duty' ? 'One-Day Duty' : 'Normal Outpass',
        purpose: pass.purpose,
        destination: pass.destination,
        leavingDatetime: pass.leavingDatetime,
        returnDatetime: pass.returnDatetime,
        exitTime: pass.exitTime || pass.scannedExitAt || null,
        returnTime: pass.returnTime || pass.scannedReturnAt || null,
        qrId: pass.qrId,
        qrToken: pass.qrToken,
        qrData: pass.qrData,
        qrImageData: pass.qrImageData,
        validFrom: pass.validFrom,
        validUntil: pass.validUntil,
        qrStatus: pass.qrStatus,
        computedStatus: computedStatus,
        statusMessage: statusMessage,
        validFromTimestamp: validFromDate.getTime(),
        validUntilTimestamp: validUntilDate.getTime(),
        serverTimestamp: serverNow.getTime(),
        latestExtension
      }
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   3. QR CODE VALIDATION ENGINE (GATE SCANNER & SECURITY)
   ========================================================== */

/**
 * POST /api/qr/validate
 * Server-authoritative QR validation endpoint
 * Validates cryptographically secure token against current server time and pass status
 */
exports.validateQrToken = async (req, res, next) => {
  try {
    const { qr_token, action } = req.body;

    if (!qr_token || typeof qr_token !== 'string' || !qr_token.trim()) {
      return res.status(400).json({
        success: false,
        validity: 'INVALID',
        message: 'QR token is required for validation.'
      });
    }

    const rawToken = qr_token.trim();
    const tokenWithoutPrefix = rawToken.replace(/^HOSTEL-QR:/i, '');

    // 1. Query token record in MySQL (match raw token, un-prefixed token, or qr_data)
    const [rows] = await pool.query(`
      SELECT 
        q.id AS qrId,
        q.token AS qrToken,
        q.qr_data AS qrData,
        q.valid_from AS validFrom,
        q.valid_until AS validUntil,
        q.status AS qrStatus,
        q.is_used AS isUsed,
        q.used_count AS usedCount,
        q.max_uses AS maxUses,
        q.scanned_exit_at AS scannedExitAt,
        q.scanned_return_at AS scannedReturnAt,
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        o.reason AS purpose,
        o.event_name AS eventName,
        o.status AS outpassStatus,
        o.exit_time AS exitTime,
        s.id AS studentId,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.phone AS studentPhone,
        s.current_hostel_status AS studentHostelStatus
      FROM qr_codes q
      INNER JOIN outpass_requests o ON q.outpass_request_id = o.id
      INNER JOIN students s ON o.student_id = s.id
      WHERE q.token = ? OR q.token = ? OR q.qr_data = ?
      ORDER BY q.id DESC
      LIMIT 1
    `, [rawToken, tokenWithoutPrefix, rawToken]);

    // 2. Token Not Found -> INVALID
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        validity: 'INVALID',
        message: 'INVALID QR CODE: Token is invalid or does not exist in the system.'
      });
    }

    const record = rows[0];
    const serverNow = new Date();
    const validFromDate = new Date(record.validFrom);
    const validUntilDate = new Date(record.validUntil);

    // 3. Outpass Approval Check
    if (record.outpassStatus !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        validity: 'NOT_APPROVED',
        message: `Outpass is not in APPROVED state (Current: ${record.outpassStatus}).`
      });
    }

    // 4. Revocation Check
    if (record.qrStatus === 'REVOKED') {
      return res.status(403).json({
        success: false,
        validity: 'REVOKED',
        message: 'QR CODE REVOKED: This QR code pass has been revoked by Hostel Administration.',
        details: { requestCode: record.requestCode, studentName: record.studentName }
      });
    }

    // 5. Check if Outpass Already Completed
    if (record.isUsed || record.usedCount >= record.maxUses) {
      return res.status(409).json({
        success: false,
        validity: 'ALREADY_USED',
        message: 'This QR pass has already completed the full checkout and return cycle.',
        details: { requestCode: record.requestCode, scannedExitAt: record.scannedExitAt, scannedReturnAt: record.scannedReturnAt }
      });
    }

    // 6. Check if Already Exited (for exit scans)
    if (action === 'exit' && (record.scannedExitAt || record.exitTime || record.studentHostelStatus === 'OUTSIDE')) {
      return res.status(409).json({
        success: false,
        validity: 'ALREADY_EXITED',
        message: 'EXIT ALREADY RECORDED: Student has already checked out for this outpass.',
        details: { requestCode: record.requestCode, studentName: record.studentName, exitTime: record.scannedExitAt || record.exitTime }
      });
    }

    // 7. Server Time Check: NOT YET VALID
    if (serverNow < validFromDate) {
      return res.status(400).json({
        success: false,
        validity: 'NOT_YET_VALID',
        message: `QR CODE IS NOT YET VALID: Scheduled departure is at ${validFromDate.toLocaleString('en-US')}.`,
        serverTime: serverNow.toISOString(),
        validFrom: validFromDate.toISOString(),
        student: { name: record.studentName, regNo: record.studentRegNo }
      });
    }

    // 8. Server Time Check: EXPIRED
    if (serverNow > validUntilDate) {
      return res.status(410).json({
        success: false,
        validity: 'EXPIRED',
        message: `QR CODE EXPIRED: This QR code expired at ${validUntilDate.toLocaleString('en-US')}.`,
        serverTime: serverNow.toISOString(),
        validUntil: validUntilDate.toISOString(),
        student: { name: record.studentName, regNo: record.studentRegNo }
      });
    }

    // 9. Successful Validation: VALID
    return res.status(200).json({
      success: true,
      validity: 'VALID',
      message: 'QR Pass is VALID and active.',
      serverTime: serverNow.toISOString(),
      student: {
        name: record.studentName,
        regNo: record.studentRegNo,
        department: record.studentDept,
        room: `${record.studentBlock} - ${record.studentRoom}`,
        phone: record.studentPhone,
        hostelStatus: record.studentHostelStatus || 'INSIDE'
      },
      outpass: {
        requestCode: record.requestCode,
        requestType: record.requestType === 'one_day_duty' ? 'One-Day Duty' : 'Normal Outpass',
        destination: record.destination,
        purpose: record.purpose,
        eventName: record.eventName || null,
        leavingDatetime: record.validFrom,
        returnDatetime: record.validUntil
      },
      scanStatus: {
        usedCount: record.usedCount,
        maxUses: record.maxUses,
        nextScanType: record.usedCount === 0 ? 'EXIT' : 'RETURN'
      }
    });

  } catch (error) {
    next(error);
  }
};

/* ==========================================================
   4. WARDEN QR MONITORING LIST
   ========================================================== */

/**
 * GET /api/qr/warden/active-qrs
 * List all active QR codes for Warden monitoring
 */
exports.getWardenActiveQrs = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        q.id AS qrId,
        q.token AS qrToken,
        q.qr_data AS qrData,
        q.qr_image_data AS qrImageData,
        q.valid_from AS validFrom,
        q.valid_until AS validUntil,
        q.status AS qrStatus,
        q.used_count AS usedCount,
        q.max_uses AS maxUses,
        q.created_at AS generatedAt,
        o.id AS outpassId,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.destination,
        s.name AS studentName,
        s.reg_no AS studentRegNo,
        s.department AS studentDept,
        s.hostel_block AS studentBlock,
        s.room_no AS studentRoom
      FROM qr_codes q
      INNER JOIN outpass_requests o ON q.outpass_request_id = o.id
      INNER JOIN students s ON o.student_id = s.id
      WHERE q.status = 'ACTIVE'
      ORDER BY q.valid_until ASC
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      activeQrs: rows
    });

  } catch (error) {
    next(error);
  }
};
