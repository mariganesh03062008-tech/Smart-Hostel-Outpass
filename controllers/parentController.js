const crypto = require('crypto');
const { pool } = require('../utils/db');
const notificationService = require('../services/notificationService');
const faceConfig = require('../utils/faceConfig');

/**
 * GET /api/parent/overview
 * Overview stats, linked student info, and verified face security state
 */
exports.getParentOverview = async (req, res, next) => {
  try {
    const parentId = req.user.id;

    // 1. Fetch parent details strictly from authenticated DB record
    const [parentRows] = await pool.query(
      'SELECT id, father_name, mother_name, primary_phone, email, address, relationship, profile_completed, face_registered, face_registered_at FROM parents WHERE id = ?',
      [parentId]
    );

    if (parentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Parent record not found.' });
    }

    const parent = parentRows[0];
    const parentDisplayName = parent.father_name || parent.mother_name || 'Parent';

    // 2. Fetch linked student (strictly enforced by parent_id)
    const [studentRows] = await pool.query(
      'SELECT id, reg_no, name, email, phone, department, year_of_study, semester, section, room_no, hostel_block FROM students WHERE parent_id = ? AND is_active = true',
      [parentId]
    );

    const linkedStudent = studentRows.length > 0 ? studentRows[0] : null;
    const isProfileCompleted = Boolean(parent.profile_completed || linkedStudent);
    const isFaceRegistered = Boolean(parent.face_registered);

    if (!linkedStudent) {
      return res.status(200).json({
        success: true,
        parent: {
          id: parent.id,
          name: parentDisplayName,
          fatherName: parent.father_name,
          motherName: parent.mother_name,
          phone: parent.primary_phone,
          verifiedMobile: parent.primary_phone,
          email: parent.email,
          address: parent.address,
          relationship: parent.relationship || 'Father',
          profileCompleted: isProfileCompleted,
          faceRegistered: isFaceRegistered,
          faceRegisteredAt: parent.face_registered_at,
          securityModel: 'PARENT_FACE_VERIFICATION'
        },
        linkedStudent: null,
        stats: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, unreadMessages: 0 },
        faceSecurity: {
          faceRegistered: isFaceRegistered,
          faceRegisteredAt: parent.face_registered_at,
          matchThreshold: faceConfig.FACE_MATCH_THRESHOLD
        }
      });
    }

    // 3. Count Pending Outpasses for this linked student
    const [pendingRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests
      WHERE student_id = ? AND status = 'PENDING_PARENT';
    `, [linkedStudent.id]);

    // 4. Count Approved Outpasses by this parent
    const [approvedRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests
      WHERE parent_approved_by_id = ?;
    `, [parentId]);

    // 5. Count Rejected Outpasses by this parent
    const [rejectedRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM outpass_requests
      WHERE parent_rejected_by_id = ?;
    `, [parentId]);

    // 6. Count Messages
    const [msgCount] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM parent_messages
      WHERE parent_id = ?;
    `, [parentId]);

    return res.status(200).json({
      success: true,
      profileCompleted: isProfileCompleted,
      faceRegistered: isFaceRegistered,
      faceRegisteredAt: parent.face_registered_at,
      verifiedMobile: parent.primary_phone,
      securityModel: {
        type: 'PARENT_FACE_VERIFICATION',
        matchThreshold: faceConfig.FACE_MATCH_THRESHOLD
      },
      parent: {
        id: parent.id,
        name: parentDisplayName,
        fatherName: parent.father_name,
        motherName: parent.mother_name,
        phone: parent.primary_phone,
        verifiedMobile: parent.primary_phone,
        email: parent.email,
        address: parent.address,
        relationship: parent.relationship || 'Father',
        profileCompleted: isProfileCompleted,
        faceRegistered: isFaceRegistered,
        faceRegisteredAt: parent.face_registered_at,
        securityModel: 'PARENT_FACE_VERIFICATION'
      },
      linkedStudent: {
        id: linkedStudent.id,
        name: linkedStudent.name,
        regNo: linkedStudent.reg_no,
        department: linkedStudent.department,
        yearOfStudy: linkedStudent.year_of_study,
        semester: linkedStudent.semester || `Semester ${linkedStudent.year_of_study * 2}`,
        roomNo: linkedStudent.room_no,
        hostelBlock: linkedStudent.hostel_block,
        phone: linkedStudent.phone
      },
      stats: {
        pendingCount: Number(pendingRows[0].count) || 0,
        approvedCount: Number(approvedRows[0].count) || 0,
        rejectedCount: Number(rejectedRows[0].count) || 0,
        messageCount: Number(msgCount[0].count) || 0
      },
      faceSecurity: {
        faceRegistered: isFaceRegistered,
        faceRegisteredAt: parent.face_registered_at,
        matchThreshold: faceConfig.FACE_MATCH_THRESHOLD
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/parent/face/status
 * Returns parent face registration status and configuration
 */
exports.getFaceStatus = async (req, res, next) => {
  try {
    const parentId = req.user.id;

    const [parents] = await pool.query(
      'SELECT face_registered, face_registered_at FROM parents WHERE id = ?',
      [parentId]
    );

    if (parents.length === 0) {
      return res.status(404).json({ success: false, message: 'Parent not found.' });
    }

    const [templates] = await pool.query(
      'SELECT id, quality_score, registered_at, updated_at FROM parent_face_templates WHERE parent_id = ?',
      [parentId]
    );

    const isRegistered = parents[0].face_registered === 1 && templates.length > 0;

    return res.status(200).json({
      success: true,
      faceRegistered: isRegistered,
      registeredAt: templates[0]?.registered_at || parents[0].face_registered_at || null,
      qualityScore: templates[0]?.quality_score || 1.0,
      matchThreshold: faceConfig.FACE_MATCH_THRESHOLD,
      vectorDimensions: faceConfig.FACE_VECTOR_DIMENSIONS
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/parent/face/register
 * Enrolls a parent's 128D face descriptor vector securely in the database
 */
exports.registerFace = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { faceDescriptor, qualityScore, landmarksSummary, singleFace } = req.body || {};

    // 1. Check single-face validation flag
    if (singleFace === false) {
      return res.status(400).json({
        success: false,
        message: 'Multiple faces or no face detected. Please ensure only your face is visible in the camera.'
      });
    }

    // 2. Validate descriptor array format (must be 128 finite floats)
    if (!faceConfig.validateDescriptorFormat(faceDescriptor)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid face descriptor format. Expected 128 finite numerical floats generated by face detection.'
      });
    }

    const cleanScore = (qualityScore !== undefined && !isNaN(Number(qualityScore)))
      ? Number(qualityScore)
      : 1.0;

    const landmarksJson = landmarksSummary ? JSON.stringify(landmarksSummary) : null;
    const descriptorJson = JSON.stringify(Array.from(faceDescriptor).map(Number));

    // 3. Upsert face template in parent_face_templates
    await pool.query(`
      INSERT INTO parent_face_templates (parent_id, face_descriptor, face_landmarks_summary, quality_score, registered_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        face_descriptor = VALUES(face_descriptor),
        face_landmarks_summary = VALUES(face_landmarks_summary),
        quality_score = VALUES(quality_score),
        updated_at = NOW()
    `, [parentId, descriptorJson, landmarksJson, cleanScore]);

    // 4. Update parents table
    const now = new Date();
    await pool.query(
      'UPDATE parents SET face_registered = 1, face_registered_at = ? WHERE id = ?',
      [now, parentId]
    );

    return res.status(200).json({
      success: true,
      message: 'Parent face biometric template successfully registered.',
      registeredAt: now.toISOString(),
      qualityScore: cleanScore
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/parent/outpass/:id/face-verify
 * Verifies live camera face descriptor against registered parent face template
 * Returns a cryptographically signed verification token upon match (D <= 0.45)
 */
exports.verifyFace = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const parentId = req.user.id;
    const { faceDescriptor, livenessCheck, singleFace } = req.body || {};

    // 1. Validate request and ownership
    const [rows] = await pool.query(`
      SELECT o.id, o.request_code, o.status, o.student_id, s.parent_id, s.name AS studentName
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.id = ?
    `, [requestId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }
    const request = rows[0];

    if (request.parent_id !== parentId) {
      return res.status(403).json({
        success: false,
        message: 'Authorization Error: You are not authorized to verify outpasses for this student.'
      });
    }

    if (request.status !== 'PENDING_PARENT') {
      return res.status(400).json({
        success: false,
        message: `Outpass is not awaiting parent approval. Current status: ${request.status}.`
      });
    }

    // 2. Validate face input
    if (singleFace === false) {
      return res.status(400).json({
        success: false,
        faceVerified: false,
        message: 'Face detection issue: Multiple faces or no face detected in camera.'
      });
    }

    if (!faceConfig.validateDescriptorFormat(faceDescriptor)) {
      return res.status(400).json({
        success: false,
        faceVerified: false,
        message: 'Valid 128-dimensional face descriptor array is required.'
      });
    }

    // 3. Fetch registered template for this parent
    const [templates] = await pool.query(
      'SELECT face_descriptor, quality_score FROM parent_face_templates WHERE parent_id = ?',
      [parentId]
    );

    if (templates.length === 0 || !templates[0].face_descriptor) {
      return res.status(400).json({
        success: false,
        faceVerified: false,
        notRegistered: true,
        message: 'Parent face is not registered yet. Please complete Face Registration first.'
      });
    }

    let registeredDescriptor;
    try {
      registeredDescriptor = JSON.parse(templates[0].face_descriptor);
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: 'Corrupted registered face template. Please re-register your face.'
      });
    }

    // 4. Perform authoritative Euclidean distance matching
    const matchResult = faceConfig.verifyFaceMatch(registeredDescriptor, faceDescriptor);

    // 5. Handle Mismatch (D > 0.45)
    if (!matchResult.match) {
      return res.status(422).json({
        success: false,
        faceVerified: false,
        match: false,
        distance: matchResult.distance,
        similarity: matchResult.similarity,
        threshold: matchResult.threshold,
        message: `Face verification failed. Captured face does not match the registered parent template (Distance: ${matchResult.distance}, Threshold: ${matchResult.threshold}).`
      });
    }

    // 6. Handle Match (D <= 0.45) -> Issue single-use session verification token (valid 10 mins)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(`
      INSERT INTO parent_face_verifications (
        verification_token, outpass_request_id, parent_id,
        distance_score, similarity_score, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
    `, [
      verificationToken, requestId, parentId,
      matchResult.distance, matchResult.similarity, expiresAt
    ]);

    return res.status(200).json({
      success: true,
      faceVerified: true,
      match: true,
      distance: matchResult.distance,
      similarity: matchResult.similarity,
      threshold: matchResult.threshold,
      verificationToken,
      message: 'Parent face verified successfully. Identity confirmed.'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/parent/outpass/:id/approve
 * Authoritative Parent Outpass Approval Security Verification
 * Requires verified parent face session token or matching live descriptor.
 */
exports.approveOutpass = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const parentId = req.user.id;
    const { verification_token, faceDescriptor, parent_message } = req.body || {};

    // 1. Fetch outpass request and linked student/parent details
    const [rows] = await pool.query(`
      SELECT o.id, o.request_code, o.outpass_type, o.status, o.student_id, s.parent_id,
             s.name AS studentName, s.reg_no AS studentRegNo,
             p.father_name, p.mother_name, p.primary_phone AS parentRegisteredMobile
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      INNER JOIN parents p ON s.parent_id = p.id
      WHERE o.id = ?
    `, [requestId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const request = rows[0];

    // Ownership validation: Request MUST belong to this parent's linked student
    if (request.parent_id !== parentId) {
      return res.status(403).json({
        success: false,
        message: 'Authorization Error: You are not authorized to approve outpass requests for another student.'
      });
    }

    // Verify request status is PENDING_PARENT
    if (request.status !== 'PENDING_PARENT') {
      return res.status(400).json({
        success: false,
        message: `Request cannot be approved by parent. Current status: ${request.status}.`
      });
    }

    // 2. Validate Parent Face Biometrics Authoritatively
    let verifiedSessionId = null;

    if (verification_token) {
      // Check active verification token in parent_face_verifications
      const [verRows] = await pool.query(`
        SELECT * FROM parent_face_verifications
        WHERE verification_token = ?
          AND outpass_request_id = ?
          AND parent_id = ?
          AND status = 'ACTIVE'
          AND expires_at > NOW()
      `, [verification_token, requestId, parentId]);

      if (verRows.length === 0) {
        return res.status(403).json({
          success: false,
          faceVerified: false,
          message: 'Invalid, consumed, or expired face verification session. Please verify your face again.'
        });
      }

      verifiedSessionId = verRows[0].id;

    } else if (faceDescriptor) {
      // Direct live face descriptor submitted with approval
      if (!faceConfig.validateDescriptorFormat(faceDescriptor)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid face descriptor format. Expected 128 finite floats.'
        });
      }

      const [templates] = await pool.query(
        'SELECT face_descriptor FROM parent_face_templates WHERE parent_id = ?',
        [parentId]
      );

      if (templates.length === 0 || !templates[0].face_descriptor) {
        return res.status(403).json({
          success: false,
          message: 'Parent face is not registered. Please register your face first.'
        });
      }

      const registeredDescriptor = JSON.parse(templates[0].face_descriptor);
      const matchResult = faceConfig.verifyFaceMatch(registeredDescriptor, faceDescriptor);

      if (!matchResult.match) {
        return res.status(403).json({
          success: false,
          faceVerified: false,
          message: `Face verification failed. Captured face does not match registered parent (Distance: ${matchResult.distance}).`
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        faceVerified: false,
        message: 'Parent face verification is required before approving this outpass. Please scan and verify your face.'
      });
    }

    // Mark verification session as CONSUMED if token used
    if (verifiedSessionId) {
      await pool.query(
        'UPDATE parent_face_verifications SET status = "CONSUMED" WHERE id = ?',
        [verifiedSessionId]
      );
    }

    // 3. Validate parent approval message
    if (parent_message !== undefined && parent_message !== null) {
      if (typeof parent_message !== 'string' || !parent_message.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Parent approval message cannot be empty.'
        });
      }
    }

    // 4. Update outpass_requests table with approval decision and Face Verified status
    const now = new Date();
    const parentDisplayName = request.father_name || request.mother_name || 'Parent';
    const verifiedParentMobile = request.parentRegisteredMobile;
    const cleanParentMessage = (parent_message && typeof parent_message === 'string' && parent_message.trim())
      ? parent_message.trim()
      : 'Approved';

    await pool.query(`
      UPDATE outpass_requests
      SET 
        status = 'PENDING_WARDEN',
        parent_approval_status = 'approved',
        parent_approved_by_id = ?,
        parent_approved_at = ?,
        parent_face_verified = 1,
        parent_face_verified_at = ?,
        parent_verified_mobile = ?,
        parent_approval_message = ?
      WHERE id = ?
    `, [
      parentId, now, now,
      verifiedParentMobile,
      cleanParentMessage,
      requestId
    ]);

    // Store parent approval message in parent_messages
    await pool.query(`
      INSERT INTO parent_messages (
        parent_id, parent_mobile, student_id, outpass_request_id, message_type, message_body, status, parent_response, responded_at
      ) VALUES (?, ?, ?, ?, 'message', ?, 'responded', 'approved', ?)
    `, [parentId, verifiedParentMobile, request.student_id, requestId, cleanParentMessage, now]).catch(err => console.warn('[Parent Msg Error]:', err.message));

    // Emit real-time WebSocket event to Warden
    if (req.io) {
      req.io.to('role_warden').emit('parent:decision', {
        outpassId: Number(requestId),
        decision: 'APPROVED',
        studentId: request.student_id,
        studentName: request.studentName,
        studentRegNo: request.studentRegNo,
        parentName: parentDisplayName,
        parentMobile: verifiedParentMobile,
        parentMessage: cleanParentMessage,
        faceVerification: 'VERIFIED',
        parentFaceVerified: 1,
        timestamp: now.toISOString()
      });
    }

    // Send notification to Warden
    const wardenNotificationText = `PARENT OUTPASS APPROVAL

Student Name: ${request.studentName}
Student Roll Number: ${request.studentRegNo || 'N/A'}
Parent Name: ${parentDisplayName}
Registered Mobile Number: ${verifiedParentMobile}
Outpass ID: ${requestId}
Approval Status: APPROVED
Parent Message: "${cleanParentMessage}"

----------------------------------
PARENT BIOMETRIC VERIFICATION
----------------------------------
Status: BIOMETRIC FACE VERIFIED ✓
Parent Identity: CONFIRMED
Timestamp: ${now.toLocaleString()}
Parent Approval: APPROVED
----------------------------------`;

    await notificationService.notifyWarden({
      title: 'Parent Outpass Approval (Face Verified)',
      message: wardenNotificationText,
      type: 'PARENT_APPROVED',
      referenceId: requestId,
      linkUrl: '/warden-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'Parent Consent Granted',
      message: `Parent consent has been granted for your Outpass (${request.request_code}) with Face Verification. Forwarded to Hostel Warden for final authorization.`,
      type: 'PARENT_APPROVED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      message: 'Outpass request approved with parent face verification and forwarded to Warden.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'PENDING_WARDEN',
        parentApprovedAt: now.toISOString(),
        parentVerifiedMobile: verifiedParentMobile,
        faceVerified: true,
        parentMessage: cleanParentMessage
      }
    });

  } catch (error) {
    if (typeof next === 'function') {
      next(error);
    } else {
      console.error('[approveOutpass Error]:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
};

/**
 * PATCH /api/parent/outpass/:id/reject
 * Reject outpass with mandatory reason
 */
exports.rejectOutpass = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const parentId = req.user.id;
    const { rejection_reason } = req.body || {};

    if (!rejection_reason || typeof rejection_reason !== 'string' || !rejection_reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required and cannot be empty.' });
    }

    const cleanReason = rejection_reason.trim();

    // 1. Fetch request, linked student, and parent details
    const [rows] = await pool.query(`
      SELECT o.id, o.request_code, o.outpass_type, o.status, o.student_id, s.parent_id, s.name AS studentName, p.father_name, p.mother_name, p.primary_phone AS parentRegisteredMobile
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      INNER JOIN parents p ON s.parent_id = p.id
      WHERE o.id = ?
    `, [requestId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Outpass request not found.' });
    }

    const request = rows[0];

    // Ownership validation
    if (request.parent_id !== parentId) {
      return res.status(403).json({
        success: false,
        message: 'Authorization Error: You are not authorized to reject outpass requests for another student.'
      });
    }

    if (request.status !== 'PENDING_PARENT') {
      return res.status(400).json({
        success: false,
        message: `Request cannot be rejected by parent. Current status: ${request.status}.`
      });
    }

    const now = new Date();
    const parentDisplayName = request.father_name || request.mother_name || 'Parent';
    const verifiedParentMobile = request.parentRegisteredMobile;

    await pool.query(`
      UPDATE outpass_requests
      SET 
        status = 'REJECTED',
        overall_status = 'rejected',
        parent_approval_status = 'rejected',
        parent_rejected_by_id = ?,
        parent_rejected_at = ?,
        parent_rejection_reason = ?,
        rejection_reason = ?,
        parent_verified_mobile = ?
      WHERE id = ?
    `, [parentId, now, cleanReason, cleanReason, verifiedParentMobile, requestId]);

    await pool.query(`
      INSERT INTO parent_messages (
        parent_id, parent_mobile, student_id, outpass_request_id, message_type, message_body, status, parent_response, responded_at
      ) VALUES (?, ?, ?, ?, 'message', ?, 'responded', 'rejected', ?)
    `, [parentId, verifiedParentMobile, request.student_id, requestId, cleanReason, now]).catch(err => console.warn('[Parent Msg Error]:', err.message));

    if (req.io) {
      req.io.to('role_warden').emit('parent:decision', {
        outpassId: Number(requestId),
        decision: 'REJECTED',
        studentId: request.student_id,
        studentName: request.studentName,
        parentMessage: cleanReason,
        faceVerification: 'UNVERIFIED',
        timestamp: now.toISOString()
      });
    }

    const wardenRejectionText = `PARENT OUTPASS REJECTION

Parent Name: ${parentDisplayName}
Registered Mobile Number: ${verifiedParentMobile}
Student Name: ${request.studentName}
Rejection Reason: "${cleanReason}"
Timestamp: ${now.toLocaleString()}
Status: REJECTED`;

    await notificationService.notifyWarden({
      title: 'Parent Declined Outpass Request',
      message: wardenRejectionText,
      type: 'PARENT_REJECTED',
      referenceId: requestId,
      linkUrl: '/warden-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'Parent Declined Outpass Request',
      message: `Your parent declined your Outpass request (${request.request_code}): ${cleanReason}`,
      type: 'PARENT_REJECTED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      message: 'Outpass request rejected by parent.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'REJECTED',
        rejectionReason: cleanReason,
        parentRejectedAt: now.toISOString()
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/parent/outpass/pending
 * Pending outpass requests for the authenticated parent's linked student only
 */
exports.getPendingRequests = async (req, res, next) => {
  try {
    const parentId = req.user.id;

    const [studentRows] = await pool.query(
      'SELECT id, reg_no, name, department, year_of_study, semester, room_no, hostel_block, phone FROM students WHERE parent_id = ? AND is_active = true',
      [parentId]
    );

    if (studentRows.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        pendingRequests: []
      });
    }

    const linkedStudent = studentRows[0];

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
        o.parent_approval_status AS parentStatus,
        o.parent_face_verified AS parentFaceVerified,
        o.created_at AS submittedDate,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.year_of_study AS studentYear,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock,
        s.phone AS studentRegisteredPhone
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.student_id = ? AND o.status = 'PENDING_PARENT'
      ORDER BY o.created_at ASC
    `, [linkedStudent.id]);

    return res.status(200).json({
      success: true,
      count: rows.length,
      linkedStudent: {
        id: linkedStudent.id,
        name: linkedStudent.name,
        regNo: linkedStudent.reg_no,
        department: linkedStudent.department,
        block: linkedStudent.hostel_block,
        room: linkedStudent.room_no
      },
      pendingRequests: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/parent/outpass/approved
 * History of requests approved by this parent
 */
exports.getApprovedRequests = async (req, res, next) => {
  try {
    const parentId = req.user.id;

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.reason AS purpose,
        o.destination,
        o.from_datetime AS leavingDatetime,
        o.to_datetime AS returnDatetime,
        o.status,
        o.parent_approved_at AS parentApprovedAt,
        o.parent_face_verified AS parentFaceVerified,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept,
        s.room_no AS studentRoom,
        s.hostel_block AS studentBlock
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.parent_approved_by_id = ?
      ORDER BY o.parent_approved_at DESC
    `, [parentId]);

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
 * GET /api/parent/outpass/rejected
 * History of requests rejected by this parent
 */
exports.getRejectedRequests = async (req, res, next) => {
  try {
    const parentId = req.user.id;

    const [rows] = await pool.query(`
      SELECT 
        o.id,
        o.request_code AS requestCode,
        o.outpass_type AS requestType,
        o.reason AS purpose,
        o.destination,
        o.parent_rejection_reason AS rejectionReason,
        o.parent_rejected_at AS rejectedAt,
        s.reg_no AS studentRegNo,
        s.name AS studentName,
        s.department AS studentDept
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      WHERE o.parent_rejected_by_id = ?
      ORDER BY o.parent_rejected_at DESC
    `, [parentId]);

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
 * Backward-compatible location verification endpoint stub (deprecated)
 */
exports.verifyParentLocation = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Location verification has been replaced with Parent Face Biometric Verification.'
  });
};

/**
 * Backward-compatible fingerprint stubs
 */
exports.getFingerprintStatus = async (req, res) => {
  return res.status(200).json({
    connected: false,
    service: 'Parent Face Verification Active',
    parentEnrolled: true
  });
};

exports.registerFingerprint = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Biometric verification is handled via Parent Face Verification.'
  });
};

exports.verifyBiometric = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Biometric verification is handled via Parent Face Verification.'
  });
};

/**
 * GET /api/parent/messages
 * Retrieve messages between parent and hostel authorities
 */
exports.getMessages = async (req, res, next) => {
  try {
    const parentId = req.user.id;

    const [rows] = await pool.query(`
      SELECT 
        m.id,
        m.parent_id AS parentId,
        m.student_id AS studentId,
        m.outpass_request_id AS outpassRequestId,
        m.message_type AS messageType,
        m.message_body AS messageBody,
        m.status,
        m.parent_response AS parentResponse,
        m.created_at AS createdAt,
        s.name AS studentName,
        s.reg_no AS studentRegNo
      FROM parent_messages m
      INNER JOIN students s ON m.student_id = s.id
      WHERE m.parent_id = ?
      ORDER BY m.created_at ASC
    `, [parentId]);

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
 * POST /api/parent/messages
 * Send English or Tamil message from Parent
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { message, message_type } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required.'
      });
    }

    const [studentRows] = await pool.query(
      'SELECT id, name FROM students WHERE parent_id = ? AND is_active = true',
      [parentId]
    );

    if (studentRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No linked student found for this parent.'
      });
    }

    const linkedStudent = studentRows[0];
    const msgType = message_type && ['sms', 'whatsapp', 'system_notice', 'consent_request', 'message'].includes(message_type) 
      ? message_type 
      : 'message';

    const [insertRes] = await pool.query(`
      INSERT INTO parent_messages (
        parent_id,
        student_id,
        message_type,
        message_body,
        status,
        parent_response
      ) VALUES (?, ?, ?, ?, 'sent', 'none')
    `, [parentId, linkedStudent.id, msgType, message.trim()]);

    return res.status(201).json({
      success: true,
      message: 'Message recorded and sent successfully.',
      data: {
        id: insertRes.insertId,
        parentId,
        studentId: linkedStudent.id,
        studentName: linkedStudent.name,
        messageBody: message.trim(),
        messageType: msgType,
        createdAt: new Date().toISOString()
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/parent/profile
 * Allows parent/guardian to update their profile information and linked ward
 */
exports.updateParentProfile = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { 
      parent_name, father_name, mother_name, primary_phone, email, address, relationship,
      student_name, student_reg_no, roll_no, hostel_block, room_no
    } = req.body;

    const resolvedParentName = (parent_name || father_name || '').trim() || null;
    const resolvedRelationship = (relationship || 'Father').trim();
    const resolvedRegNo = (student_reg_no || roll_no || '').trim().toUpperCase();
    const resolvedStudentName = (student_name || '').trim() || 'Student Ward';
    const resolvedBlock = (hostel_block || 'Block A').trim();
    const resolvedRoom = (room_no || 'A-101').trim();

    await pool.query(`
      UPDATE parents 
      SET 
        father_name = COALESCE(?, father_name),
        mother_name = COALESCE(?, mother_name),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        relationship = COALESCE(?, relationship),
        profile_completed = 1
      WHERE id = ?
    `, [resolvedParentName, mother_name || null, email || null, address || null, resolvedRelationship, parentId]);

    if (resolvedRegNo) {
      const [existingStudents] = await pool.query(
        'SELECT id, name FROM students WHERE UPPER(TRIM(reg_no)) = ?',
        [resolvedRegNo]
      );

      if (existingStudents.length > 0) {
        await pool.query(`
          UPDATE students
          SET 
            parent_id = ?,
            name = COALESCE(?, name),
            hostel_block = COALESCE(?, hostel_block),
            room_no = COALESCE(?, room_no),
            is_active = true
          WHERE UPPER(TRIM(reg_no)) = ?
        `, [parentId, resolvedStudentName, resolvedBlock, resolvedRoom, resolvedRegNo]);
      } else {
        await pool.query(`
          INSERT INTO students (reg_no, name, hostel_block, room_no, parent_id, department, year_of_study, is_active)
          VALUES (?, ?, ?, ?, ?, 'CSE', 3, true)
        `, [resolvedRegNo, resolvedStudentName, resolvedBlock, resolvedRoom, parentId]);
      }
    } else if (student_name || hostel_block || room_no) {
      await pool.query(`
        UPDATE students
        SET 
          name = COALESCE(?, name),
          hostel_block = COALESCE(?, hostel_block),
          room_no = COALESCE(?, room_no),
          is_active = true
        WHERE parent_id = ?
      `, [resolvedStudentName, resolvedBlock, resolvedRoom, parentId]);
    }

    return res.status(200).json({
      success: true,
      profile_completed: true,
      message: 'Parent profile and ward details updated successfully.'
    });
  } catch (error) {
    next(error);
  }
};
