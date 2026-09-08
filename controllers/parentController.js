const crypto = require('crypto');
const { pool } = require('../utils/db');
const notificationService = require('../services/notificationService');
const fingerprintService = require('../services/fingerprintService');

// ==========================================================
// PARENT LOCATION & PROXIMITY VERIFICATION CONFIGURATION
// ==========================================================
const APPROVAL_MIN_DISTANCE_METERS = 5; // STRICT 5-METER PROXIMITY SECURITY RULE
const MAX_ALLOWED_ACCURACY_METERS = 50.0; // GPS accuracy threshold in meters

/**
 * Calculates geographic distance in METERS between two coordinates using Haversine formula
 * All calculations on the backend; never trust frontend distances.
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's mean radius in meters
  const phi1 = (Number(lat1) * Math.PI) / 180;
  const phi2 = (Number(lat2) * Math.PI) / 180;
  const deltaPhi = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const deltaLambda = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Number(distance.toFixed(2));
}

/**
 * GET /api/parent/overview
 * Overview stats, linked student info, and verified mobile identity
 */
exports.getParentOverview = async (req, res, next) => {
  try {
    const parentId = req.user.id;

    // 1. Fetch parent details strictly from authenticated DB record
    const [parentRows] = await pool.query(
      'SELECT id, father_name, mother_name, primary_phone, email, address, relationship, profile_completed FROM parents WHERE id = ?',
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
          securityModel: 'GPS_PROXIMITY_5M',
          minDistanceMeters: APPROVAL_MIN_DISTANCE_METERS
        },
        linkedStudent: null,
        stats: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, unreadMessages: 0 },
        locationSecurity: {
          minDistanceMeters: APPROVAL_MIN_DISTANCE_METERS,
          maxAllowedAccuracyMeters: MAX_ALLOWED_ACCURACY_METERS,
          rule: 'Parent and Student devices must be separated by at least 5 meters'
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
      isBiometricRegistered: true,
      verifiedMobile: parent.primary_phone,
      securityModel: {
        type: 'GPS_PROXIMITY_5M',
        minDistanceMeters: APPROVAL_MIN_DISTANCE_METERS,
        maxAllowedAccuracyMeters: MAX_ALLOWED_ACCURACY_METERS
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
        isBiometricRegistered: true,
        securityModel: 'GPS_PROXIMITY_5M',
        minDistanceMeters: APPROVAL_MIN_DISTANCE_METERS
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
      locationSecurity: {
        minDistanceMeters: APPROVAL_MIN_DISTANCE_METERS,
        maxAllowedAccuracyMeters: MAX_ALLOWED_ACCURACY_METERS,
        rule: 'Parent and Student devices must be separated by at least 5 meters'
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/parent/fingerprint/status
 * Returns biometric scanner connectivity status and device info
 */
exports.getFingerprintStatus = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const status = await fingerprintService.getScannerStatus();

    const [parents] = await pool.query(
      'SELECT fingerprint_registered, fingerprint_registered_at FROM parents WHERE id = ?',
      [parentId]
    );
    const isEnrolled = parents.length > 0 && Boolean(parents[0].fingerprint_registered);

    return res.status(200).json({
      ...status,
      parentEnrolled: isEnrolled,
      registeredAt: parents[0]?.fingerprint_registered_at || null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/parent/biometric-verify & /api/parent/fingerprint/verify
 * Biometric verification endpoint using FingerprintService
 */
exports.verifyBiometric = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const result = await fingerprintService.verifyParentFingerprint(parentId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/parent/register-fingerprint & /api/parent/fingerprint/register
 * Enrolls a parent's fingerprint securely in the database
 */
exports.registerFingerprint = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const result = await fingerprintService.registerParentFingerprint(parentId, req.body);
    return res.status(200).json(result);
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

    // 1. Get linked student
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

    // 2. Fetch only PENDING_PARENT requests belonging to this student
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
 * POST /api/parent/outpass/:id/location-verify
 * Verifies live GPS location of parent against latest valid GPS location of student
 * Enforces strict 5-meter proximity rule (calculated strictly on backend in METERS)
 */
exports.verifyParentLocation = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const parentId = req.user.id;
    const { latitude, longitude, accuracy, timestamp } = req.body || {};

    // 1. Validate Parent input coordinates & accuracy
    if (latitude === undefined || longitude === undefined || isNaN(Number(latitude)) || isNaN(Number(longitude))) {
      return res.status(400).json({
        success: false,
        locationVerified: false,
        message: 'Valid GPS coordinates (latitude and longitude) are required.'
      });
    }

    const parentLat = Number(latitude);
    const parentLng = Number(longitude);
    const parentAccuracy = (accuracy !== undefined && !isNaN(Number(accuracy))) ? Number(accuracy) : 10.0;
    const parentTimestamp = timestamp ? new Date(timestamp) : new Date();

    // 2. Fetch authenticated parent and verified mobile strictly from DB record
    const [parents] = await pool.query(
      'SELECT id, father_name, mother_name, primary_phone FROM parents WHERE id = ?',
      [parentId]
    );
    if (parents.length === 0) {
      return res.status(404).json({ success: false, message: 'Parent account not found.' });
    }
    const parentRecord = parents[0];
    const verifiedParentMobile = parentRecord.primary_phone;

    // 3. Check Parent Location Accuracy threshold (Section 7)
    if (isNaN(parentAccuracy) || parentAccuracy <= 0 || parentAccuracy > MAX_ALLOWED_ACCURACY_METERS) {
      return res.status(422).json({
        success: false,
        locationVerified: false,
        accuracyPoor: true,
        device: 'parent',
        distanceMeters: null,
        parentAccuracy,
        accuracy: parentAccuracy,
        threshold: MAX_ALLOWED_ACCURACY_METERS,
        message: `Parent location accuracy (±${Math.round(parentAccuracy || 0)}m) is insufficient for 5-meter verification. Please move to an open area and try again.`
      });
    }

    // 4. Fetch outpass request and verify ownership & status
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
        message: 'Authorization Error: You are not authorized to verify location for this student.'
      });
    }

    if (request.status !== 'PENDING_PARENT') {
      return res.status(400).json({
        success: false,
        message: `Outpass is not awaiting parent approval. Current status: ${request.status}.`
      });
    }

    // 5. Obtain Student latest valid GPS location (Strict: NO hardcoded fallbacks permitted)
    const [studentLocRows] = await pool.query(
      'SELECT latitude, longitude, accuracy, captured_at, updated_at FROM student_locations WHERE student_id = ? ORDER BY COALESCE(captured_at, updated_at) DESC LIMIT 1',
      [request.student_id]
    );

    if (studentLocRows.length === 0) {
      return res.status(422).json({
        success: false,
        locationVerified: false,
        studentLocationMissing: true,
        distanceMeters: null,
        parentAccuracy,
        message: 'Student live location is unavailable. The student must open the Student Portal and enable GPS location before you can verify proximity and approve.'
      });
    }

    const studentLoc = studentLocRows[0];
    const studentLat = Number(studentLoc.latitude);
    const studentLng = Number(studentLoc.longitude);
    const studentAccuracy = Number(studentLoc.accuracy);
    const studentTimestamp = studentLoc.captured_at || studentLoc.updated_at;

    // Validate student coordinate ranges
    if (isNaN(studentLat) || isNaN(studentLng) || studentLat < -90 || studentLat > 90 || studentLng < -180 || studentLng > 180) {
      return res.status(422).json({
        success: false,
        locationVerified: false,
        studentLocationInvalid: true,
        distanceMeters: null,
        parentAccuracy,
        message: 'Student recorded coordinates are invalid. Please ask the student to refresh their location in the Student Portal.'
      });
    }

    // Check Student GPS accuracy (Section 7)
    if (isNaN(studentAccuracy) || studentAccuracy <= 0 || studentAccuracy > MAX_ALLOWED_ACCURACY_METERS) {
      return res.status(422).json({
        success: false,
        locationVerified: false,
        accuracyPoor: true,
        device: 'student',
        distanceMeters: null,
        parentAccuracy,
        studentAccuracy,
        accuracy: studentAccuracy,
        threshold: MAX_ALLOWED_ACCURACY_METERS,
        message: `Student location accuracy (±${Math.round(studentAccuracy || 0)}m) is insufficient for 5-meter verification. Please ask the student to move to an open area and refresh their location.`
      });
    }

    // Check freshness window: must be within 5 minutes (Section 5)
    const STUDENT_LOCATION_MAX_AGE_MINUTES = 5;
    const nowMs = Date.now();
    const locTimeMs = new Date(studentTimestamp).getTime();
    const ageMinutes = (nowMs - locTimeMs) / (1000 * 60);

    if (isNaN(locTimeMs) || ageMinutes > STUDENT_LOCATION_MAX_AGE_MINUTES || ageMinutes < -1) {
      return res.status(422).json({
        success: false,
        locationVerified: false,
        studentLocationStale: true,
        distanceMeters: null,
        parentAccuracy,
        ageMinutes: Math.max(1, Math.round(ageMinutes)),
        maxAgeMinutes: STUDENT_LOCATION_MAX_AGE_MINUTES,
        message: `Student location is outdated (${Math.max(1, Math.round(ageMinutes))} minutes old). Student location must be refreshed within the last 5 minutes. Please ask the student to refresh their location in the Student Portal.`
      });
    }

    // 6. Backend calculates distance using Haversine formula strictly in METERS (Section 7 & 8)
    const distanceMeters = calculateDistanceMeters(parentLat, parentLng, studentLat, studentLng);

    // 7. Apply 5-METER PROXIMITY SECURITY RULE
    if (distanceMeters < APPROVAL_MIN_DISTANCE_METERS) {
      // BLOCK APPROVAL: Less than 5 meters
      const blockedToken = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      await pool.query(`
        INSERT INTO parent_location_verifications (
          verification_token, outpass_request_id, parent_id, student_id,
          parent_mobile, parent_lat, parent_lng, parent_accuracy, parent_timestamp,
          student_lat, student_lng, student_accuracy, student_timestamp,
          distance_meters, verification_result, status, rejection_reason, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BLOCKED', 'EXPIRED', 'Within restricted 5-meter range', ?)
      `, [
        blockedToken, requestId, parentId, request.student_id,
        verifiedParentMobile, parentLat, parentLng, parentAccuracy, parentTimestamp,
        studentLat, studentLng, studentAccuracy, studentTimestamp,
        distanceMeters, now
      ]).catch(err => console.warn('[PLV Insert Error]:', err.message));

      return res.status(403).json({
        success: false,
        locationVerified: false,
        proximityBlocked: true,
        distanceMeters,
        minDistanceRequired: APPROVAL_MIN_DISTANCE_METERS,
        parentAccuracy,
        studentAccuracy,
        message: 'Approval cannot be submitted because the parent and student devices are within the restricted 5-meter range.'
      });
    }

    // ALLOW APPROVAL: Distance >= 5 meters
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes session

    await pool.query(`
      INSERT INTO parent_location_verifications (
        verification_token, outpass_request_id, parent_id, student_id,
        parent_mobile, parent_lat, parent_lng, parent_accuracy, parent_timestamp,
        student_lat, student_lng, student_accuracy, student_timestamp,
        distance_meters, verification_result, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', 'ACTIVE', ?)
    `, [
      verificationToken, requestId, parentId, request.student_id,
      verifiedParentMobile, parentLat, parentLng, parentAccuracy, parentTimestamp,
      studentLat, studentLng, studentAccuracy, studentTimestamp,
      distanceMeters, expiresAt
    ]);

    // Immediately associate the verified location state with the outpass request
    await pool.query(`
      UPDATE outpass_requests
      SET 
        parent_location_verified = 1,
        parent_verified_mobile = ?,
        parent_approval_lat = ?,
        parent_approval_lng = ?,
        parent_approval_accuracy = ?,
        student_loc_lat = ?,
        student_loc_lng = ?,
        distance_meters = ?
      WHERE id = ?
    `, [
      verifiedParentMobile,
      parentLat, parentLng, parentAccuracy,
      studentLat, studentLng,
      distanceMeters,
      requestId
    ]);

    return res.status(200).json({
      success: true,
      locationVerified: true,
      verificationToken,
      distanceMeters,
      parentAccuracy,
      studentAccuracy,
      minDistanceRequired: APPROVAL_MIN_DISTANCE_METERS,
      message: 'Location verified successfully. Safe proximity confirmed.'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/parent/outpass/:id/approve
 * Approve outpass with validated GPS proximity verification token
 * Associating Parent ID, Verified Mobile, Location Snapshot, Distance, and Parent Message
 * Forward request to Warden (Status -> PENDING_WARDEN)
 */
exports.approveOutpass = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const parentId = req.user.id;
    const { verification_token, parent_message } = req.body || {};

    if (!verification_token) {
      return res.status(403).json({
        success: false,
        message: 'Location verification is required before approving this outpass. Please verify your current GPS location.'
      });
    }

    // 1. Validate active location verification session (Section 17)
    const [verRows] = await pool.query(`
      SELECT * FROM parent_location_verifications
      WHERE verification_token = ?
        AND outpass_request_id = ?
        AND parent_id = ?
        AND status = 'ACTIVE'
        AND verification_result = 'VERIFIED'
        AND expires_at > NOW()
    `, [verification_token, requestId, parentId]);

    if (verRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Invalid, consumed, or expired location verification session. Please verify your location again.'
      });
    }

    const verRecord = verRows[0];

    // Re-verify backend distance >= 5m
    if (verRecord.distance_meters < APPROVAL_MIN_DISTANCE_METERS) {
      return res.status(403).json({
        success: false,
        message: 'Approval blocked: Parent and student devices are within restricted 5-meter range.'
      });
    }

    // 2. Fetch outpass request and enforce parent-student relationship
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

    // 3. Validate parent approval message
    if (parent_message !== undefined) {
      if (typeof parent_message !== 'string' || !parent_message.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Parent approval message is required and cannot be empty.'
        });
      }
    }

    // 4. Mark verification token as CONSUMED (cannot be reused!)
    await pool.query(
      'UPDATE parent_location_verifications SET status = "CONSUMED" WHERE id = ?',
      [verRecord.id]
    );

    // 5. Update outpass_requests table with approval and location snapshot
    const now = new Date();
    const parentDisplayName = request.father_name || request.mother_name || 'Parent';
    const verifiedParentMobile = request.parentRegisteredMobile; // Strictly from database
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
        parent_location_verified = 1,
        parent_verified_mobile = ?,
        parent_approval_lat = ?,
        parent_approval_lng = ?,
        parent_approval_accuracy = ?,
        student_loc_lat = ?,
        student_loc_lng = ?,
        distance_meters = ?,
        parent_approval_message = ?
      WHERE id = ?
    `, [
      parentId, now,
      verifiedParentMobile,
      verRecord.parent_lat, verRecord.parent_lng, verRecord.parent_accuracy,
      verRecord.student_lat, verRecord.student_lng,
      verRecord.distance_meters,
      cleanParentMessage,
      requestId
    ]);

    // Store parent approval message in parent_messages
    const finalParentMessage = cleanParentMessage;
    await pool.query(`
      INSERT INTO parent_messages (
        parent_id, parent_mobile, student_id, outpass_request_id, message_type, message_body, status, parent_response, responded_at
      ) VALUES (?, ?, ?, ?, 'message', ?, 'responded', 'approved', ?)
    `, [parentId, verifiedParentMobile, request.student_id, requestId, finalParentMessage, now]).catch(err => console.warn('[Parent Msg Error]:', err.message));

    if (req.io) {
      req.io.to('role_warden').emit('parent:decision', {
        outpassId: Number(requestId),
        decision: 'APPROVED',
        studentId: request.student_id,
        studentName: request.studentName,
        parentMessage: finalParentMessage,
        distanceMeters: verRecord.distance_meters,
        locationVerification: 'VERIFIED',
        timestamp: now.toISOString()
      });
    }

    // 5. Send structured Warden notification as specified in Section 11
    const wardenNotificationText = `PARENT OUTPASS APPROVAL

Parent Name: ${parentDisplayName}
Registered Mobile Number: ${verifiedParentMobile}
Student Name: ${request.studentName}

Approval Location:
Latitude: ${verRecord.parent_lat}
Longitude: ${verRecord.parent_lng}
Location Accuracy: ±${verRecord.parent_accuracy} meters

Approval Time: ${now.toLocaleTimeString()}
Distance Between Parent and Student: ${verRecord.distance_meters} meters

Parent Message: "${cleanParentMessage || 'Approved'}"
Status: APPROVED`;

    await notificationService.notifyWarden({
      title: 'Parent Outpass Approval (GPS Verified)',
      message: wardenNotificationText,
      type: 'PARENT_APPROVED',
      referenceId: requestId,
      linkUrl: '/warden-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    await notificationService.notifyStudent({
      studentId: request.student_id,
      title: 'Parent Consent Granted',
      message: `Parent consent has been granted for your Outpass (${request.request_code}) with GPS proximity verification (${verRecord.distance_meters}m). Forwarded to Hostel Warden for final authorization.`,
      type: 'PARENT_APPROVED',
      referenceId: requestId,
      linkUrl: '/student-dashboard.html',
      io: req.io
    }).catch(err => console.warn('[Notif Error]:', err.message));

    return res.status(200).json({
      success: true,
      message: 'Outpass request approved with GPS location proximity verification and forwarded to Warden.',
      data: {
        id: request.id,
        requestCode: request.request_code,
        status: 'PENDING_WARDEN',
        parentApprovedAt: now.toISOString(),
        parentVerifiedMobile: verifiedParentMobile,
        distanceMeters: verRecord.distance_meters,
        parentMessage: cleanParentMessage
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/parent/outpass/:id/reject
 * Reject outpass with mandatory reason (Section 12)
 * Forwards parent registered mobile number and reason to Warden
 */
exports.rejectOutpass = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const parentId = req.user.id;
    const { rejection_reason } = req.body || {};

    // Require non-empty rejection reason
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

    // Update status to REJECTED with parent verified mobile
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

    // Store parent rejection message in parent_messages
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
        locationVerification: 'UNVERIFIED',
        timestamp: now.toISOString()
      });
    }

    // Send to Warden as per Section 12
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

    // Send notification to Student
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

/* ==========================================================
   4. PARENT MESSAGING (ENGLISH & TAMIL SUPPORT)
   ========================================================== */

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

    // Find linked student
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

    // 1. Update parent details & mark profile_completed = 1
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

    // 2. Link or create student record for this parent
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

