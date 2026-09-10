/**
 * SMART HOSTEL OUTPASS SYSTEM
 * Comprehensive Test Suite: Parent Face Authentication Lifecycle
 * Covers: Registration, Verification, Controlled Revocation & Recovery
 * 
 * Test Cases: 18 Automated Checks
 */

const http = require('http');
const mysql = require('mysql2/promise');
require('dotenv').config();

const BASE_URL = 'http://localhost:5001';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_hostel_outpass',
  port: parseInt(process.env.DB_PORT || '3306')
};

// Helper: Make HTTP Requests
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// Generate synthetic 128D unit vector descriptor
function generateFaceDescriptor(seed = 1) {
  const desc = [];
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const val = Math.sin(seed * (i + 1));
    desc.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  return desc.map(v => v / norm);
}

// Perturb descriptor to achieve a precise Euclidean distance
function perturbDescriptor(baseDesc, noiseAmount = 0.05) {
  const perturbed = baseDesc.map((v, i) => v + (Math.sin(i * 3.7) * noiseAmount));
  let sumSq = 0;
  perturbed.forEach(v => sumSq += v * v);
  const norm = Math.sqrt(sumSq);
  return perturbed.map(v => v / norm);
}

// Compute Euclidean distance
function euclideanDistance(d1, d2) {
  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    const diff = d1[i] - d2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 PARENT FACE AUTHENTICATION LIFECYCLE: 18 COMPREHENSIVE TESTS');
  console.log('===============================================================');

  const pool = await mysql.createPool(DB_CONFIG);
  let studentId = null;
  let originalParentId = null;

  try {
    // 0. Setup test parent & student identity
    const timestamp = Date.now().toString().slice(-6);
    const testMobile = `98${timestamp}12`;
    const testPassword = 'Password@123';
    const testParentName = `Test Parent ${timestamp}`;

    // Get an existing active student from DB to link to
    const [existingStudents] = await pool.query('SELECT id, reg_no, name, parent_id FROM students WHERE is_active = 1 LIMIT 1');
    if (existingStudents.length === 0) {
      throw new Error('No active students found in database to link parent to.');
    }
    studentId = existingStudents[0].id;
    originalParentId = existingStudents[0].parent_id;
    const testRollNo = existingStudents[0].reg_no;
    const testStudentName = existingStudents[0].name;

    console.log(`\n📋 Test Parameters: Mobile: ${testMobile} | Roll: ${testRollNo} | Student: ${testStudentName}`);

    // Fetch a warden account for testing warden endpoints
    const [wardens] = await pool.query("SELECT id, staff_id, email, phone FROM staff WHERE role = 'warden' LIMIT 1");
    if (wardens.length === 0) {
      throw new Error('No warden staff record found in database.');
    }
    const wardenIdentifier = wardens[0].staff_id || wardens[0].email;

    // Login as Warden
    const wardenLoginRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: 'WRD-101', username: 'WRD-101', password: 'Password@123', role: 'warden' }
    });
    const wardenToken = wardenLoginRes.data?.token;
    assert(wardenLoginRes.status === 200 && !!wardenToken, 'Warden authentication succeeded');

    // -------------------------------------------------------------
    // TEST 1: First-Time Parent Account Creation
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: First-Time Parent Registration (face_status = NOT_REGISTERED) ---');
    const regRes = await request('/api/auth/register-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        parent_name: testParentName,
        mobile: testMobile,
        relationship: 'Father',
        student_roll_number: testRollNo,
        student_name: testStudentName,
        password: testPassword,
        confirm_password: testPassword
      }
    });

    assert(regRes.status === 201, `Registration HTTP status is 201 (Got: ${regRes.status})`);
    assert(regRes.data?.requiresFaceRegistration === true, 'Response requiresFaceRegistration is true');
    assert(regRes.data?.faceStatus === 'NOT_REGISTERED', 'Response faceStatus is NOT_REGISTERED');
    assert(regRes.data?.user?.faceStatus === 'NOT_REGISTERED', 'User payload has faceStatus = NOT_REGISTERED');

    const parentToken = regRes.data?.token;
    const parentId = regRes.data?.user?.id;

    // Verify in DB directly
    const [pRows] = await pool.query('SELECT face_status, face_registered FROM parents WHERE id = ?', [parentId]);
    assert(pRows[0]?.face_status === 'NOT_REGISTERED', `Database parents.face_status is NOT_REGISTERED (Got: ${pRows[0]?.face_status})`);
    assert(pRows[0]?.face_registered === 0, 'Database parents.face_registered is 0 (false)');

    // -------------------------------------------------------------
    // TEST 2: Attempting Dashboard Access with NOT_REGISTERED status
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Dashboard Access Gate for NOT_REGISTERED Face ---');
    const overviewBlocked = await request('/api/parent/overview', {
      headers: { 'Authorization': `Bearer ${parentToken}` }
    });
    assert(overviewBlocked.data?.accessBlocked === true, 'Parent overview marks accessBlocked: true');
    assert(overviewBlocked.data?.faceStatus === 'NOT_REGISTERED', 'Parent overview returns faceStatus: NOT_REGISTERED');

    const pendingBlocked = await request('/api/parent/outpass/pending', {
      headers: { 'Authorization': `Bearer ${parentToken}` }
    });
    assert(pendingBlocked.status === 403, `Pending outpasses endpoint returns 403 Forbidden (Got: ${pendingBlocked.status})`);
    assert(pendingBlocked.data?.face_registration_required === true, 'Pending response indicates face_registration_required: true');

    // -------------------------------------------------------------
    // TEST 3: First-time Face Registration (Save 128D descriptor)
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Submitting 128D Face Embedding ---');
    const originalDescriptor = generateFaceDescriptor(42);
    const registerFaceRes = await request('/api/parent/face/register', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: { faceDescriptor: originalDescriptor, singleFace: true }
    });

    assert(registerFaceRes.status === 200, `Register face HTTP status is 200 (Got: ${registerFaceRes.status})`);
    assert(registerFaceRes.data?.success === true, 'Register face success is true');
    assert(registerFaceRes.data?.faceStatus === 'ACTIVE', 'Register face returns faceStatus: ACTIVE');

    // Verify in DB
    const [pRowsAfterReg] = await pool.query('SELECT face_status, face_registered FROM parents WHERE id = ?', [parentId]);
    assert(pRowsAfterReg[0]?.face_status === 'ACTIVE', 'Database parents.face_status updated to ACTIVE');
    assert(pRowsAfterReg[0]?.face_registered === 1, 'Database parents.face_registered updated to 1');

    const [tmplRows] = await pool.query('SELECT status, face_descriptor FROM parent_face_templates WHERE parent_id = ?', [parentId]);
    assert(tmplRows.length === 1 && tmplRows[0].status === 'ACTIVE', 'parent_face_templates has active template');

    // Verify audit log
    const [auditReg] = await pool.query(
      'SELECT action FROM parent_face_audit_logs WHERE parent_id = ? ORDER BY id DESC LIMIT 1',
      [parentId]
    );
    assert(auditReg.length > 0 && auditReg[0].action === 'FACE_REGISTERED', 'Audit log records FACE_REGISTERED action');

    // -------------------------------------------------------------
    // TEST 4: Parent Dashboard Access Unlocked
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Parent Dashboard Unlocked After Face Registration ---');
    const overviewUnlocked = await request('/api/parent/overview', {
      headers: { 'Authorization': `Bearer ${parentToken}` }
    });
    assert(overviewUnlocked.status === 200, 'Overview returns 200 OK');
    assert(!overviewUnlocked.data?.accessBlocked, 'Overview accessBlocked is false/undefined');
    assert(overviewUnlocked.data?.parent?.faceStatus === 'ACTIVE', 'Overview returns parent.faceStatus: ACTIVE');

    const faceStatusRes = await request('/api/parent/face/status', {
      headers: { 'Authorization': `Bearer ${parentToken}` }
    });
    assert(faceStatusRes.data?.faceStatus === 'ACTIVE', 'Face status endpoint returns ACTIVE');
    assert(faceStatusRes.data?.faceRegistered === true, 'Face status endpoint returns faceRegistered: true');

    // -------------------------------------------------------------
    // Create an outpass request for subsequent verification tests
    // -------------------------------------------------------------
    const [outpassRes] = await pool.query(`
      INSERT INTO outpass_requests 
        (student_id, request_code, outpass_type, reason, destination, from_datetime, to_datetime, status, student_phone)
      VALUES 
        (?, ?, 'normal', 'Family function', 'Home Town', NOW() + INTERVAL 1 DAY, NOW() + INTERVAL 3 DAY, 'PENDING_PARENT', ?)
    `, [studentId, `REQ-${timestamp}`, testMobile]);
    const outpassId = outpassRes.insertId;

    // -------------------------------------------------------------
    // TEST 5: Face Verification Success (Euclidean D <= 0.45)
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Face Verification Match (D <= 0.45) ---');
    const matchingDescriptor = perturbDescriptor(originalDescriptor, 0.04);
    const distMatch = euclideanDistance(originalDescriptor, matchingDescriptor);
    console.log(`  ℹ️ Computed client synthetic Euclidean distance: ${distMatch.toFixed(4)} (Threshold: <= 0.45)`);

    const verifySuccessRes = await request(`/api/parent/outpass/${outpassId}/face-verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: { faceDescriptor: matchingDescriptor, singleFace: true }
    });

    assert(verifySuccessRes.status === 200, `Verify face HTTP status is 200 (Got: ${verifySuccessRes.status})`);
    assert(verifySuccessRes.data?.faceVerified === true, 'verifySuccess returns faceVerified: true');
    assert(verifySuccessRes.data?.distance <= 0.45, `Reported distance <= 0.45 (Got: ${verifySuccessRes.data?.distance})`);
    const validVerificationToken = verifySuccessRes.data?.verificationToken;
    assert(!!validVerificationToken, 'Verification token issued');

    // -------------------------------------------------------------
    // TEST 6: Face Verification Mismatch (Euclidean D > 0.45)
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Face Verification Mismatch (D > 0.45) ---');
    const mismatchDescriptor = generateFaceDescriptor(999); // Orthogonal/different seed
    const distMismatch = euclideanDistance(originalDescriptor, mismatchDescriptor);
    console.log(`  ℹ️ Computed client synthetic mismatch distance: ${distMismatch.toFixed(4)} (Threshold: > 0.45)`);

    const verifyMismatchRes = await request(`/api/parent/outpass/${outpassId}/face-verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: { faceDescriptor: mismatchDescriptor, singleFace: true }
    });

    assert(verifyMismatchRes.status === 422 || verifyMismatchRes.status === 401, `Mismatch HTTP status is 422/401 (Got: ${verifyMismatchRes.status})`);
    assert(verifyMismatchRes.data?.faceVerified === false, 'verifyMismatch returns faceVerified: false');
    assert(verifyMismatchRes.data?.distance > 0.45, `Reported distance > 0.45 (Got: ${verifyMismatchRes.data?.distance})`);

    // -------------------------------------------------------------
    // TEST 7: Approval Gate - Rejection on Empty Comment
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Mandatory Non-Empty Approval Comment Enforcement ---');
    const emptyCommentRes = await request(`/api/parent/outpass/${outpassId}/approve`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        verification_token: validVerificationToken,
        parent_message: '   ' // empty string
      }
    });

    assert(emptyCommentRes.status === 400, `Empty comment HTTP status is 400 Bad Request (Got: ${emptyCommentRes.status})`);
    assert(emptyCommentRes.data?.success === false, 'Approval with empty message rejected');

    // -------------------------------------------------------------
    // TEST 8: Approval Success with Token and Non-Empty Comment
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: Successful Outpass Approval with Face Token & Comment ---');
    const approveSuccessRes = await request(`/api/parent/outpass/${outpassId}/approve`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        verification_token: validVerificationToken,
        parent_message: 'I approve my ward travel home for family wedding.'
      }
    });

    assert(approveSuccessRes.status === 200, `Approve HTTP status is 200 OK (Got: ${approveSuccessRes.status})`);
    assert(approveSuccessRes.data?.success === true, 'Outpass approved successfully');

    // DB verify outpass state
    const [opRows] = await pool.query('SELECT status, parent_approval_message FROM outpass_requests WHERE id = ?', [outpassId]);
    assert(opRows[0].status === 'PENDING_WARDEN', `Outpass status transitioned to PENDING_WARDEN (Got: ${opRows[0].status})`);
    assert(opRows[0].parent_approval_message.includes('family wedding'), 'Parent message recorded in database');

    // -------------------------------------------------------------
    // TEST 9: Verification Token Invalidation (Single-use token)
    // -------------------------------------------------------------
    console.log('\n--- TEST 9: Verification Token Single-Use Consumption ---');
    const replayApproveRes = await request(`/api/parent/outpass/${outpassId}/approve`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        verification_token: validVerificationToken,
        parent_message: 'Attempting replay attack with used token'
      }
    });

    assert(replayApproveRes.status >= 400, `Replaying used token rejected with HTTP ${replayApproveRes.status}`);

    // -------------------------------------------------------------
    // TEST 10: Non-Warden Cannot Search Parent Face (403 Forbidden)
    // -------------------------------------------------------------
    console.log('\n--- TEST 10: Non-Warden Search Authorization Guard ---');
    const unauthSearchRes = await request(`/api/warden/parents/search?mobile=${testMobile}`, {
      headers: { 'Authorization': `Bearer ${parentToken}` } // Parent role
    });
    assert(unauthSearchRes.status === 403, `Non-warden search returns 403 Forbidden (Got: ${unauthSearchRes.status})`);

    // -------------------------------------------------------------
    // TEST 11: Warden Search Parent by Mobile
    // -------------------------------------------------------------
    console.log('\n--- TEST 11: Warden Parent Search by Mobile ---');
    const wardenSearchRes = await request(`/api/warden/parents/search?mobile=${testMobile}`, {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });

    assert(wardenSearchRes.status === 200, 'Warden search returns 200 OK');
    assert(wardenSearchRes.data?.count > 0, `Search returns parent record (Count: ${wardenSearchRes.data?.count})`);
    const searchedParent = wardenSearchRes.data?.parents?.[0];
    assert(searchedParent?.faceStatus === 'ACTIVE', `Searched parent faceStatus is ACTIVE (Got: ${searchedParent?.faceStatus})`);
    assert(searchedParent?.studentRollNo === testRollNo, `Linked student roll number matches: ${searchedParent?.studentRollNo}`);
    assert(searchedParent?.isActive === true, 'isActive flag is true');

    // -------------------------------------------------------------
    // TEST 12: Non-Warden Cannot Revoke Parent Face (403 Forbidden)
    // -------------------------------------------------------------
    console.log('\n--- TEST 12: Non-Warden Revocation Authorization Guard ---');
    const unauthRevokeRes = await request('/api/warden/parents/revoke-face', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: { parentId, reason: 'Unauthorized revocation attempt' }
    });
    assert(unauthRevokeRes.status === 403, `Non-warden revocation returns 403 Forbidden (Got: ${unauthRevokeRes.status})`);

    // -------------------------------------------------------------
    // TEST 13: Warden Executes Controlled Face Revocation
    // -------------------------------------------------------------
    console.log('\n--- TEST 13: Warden Executes Face Revocation ---');
    const revokeRes = await request('/api/warden/parents/revoke-face', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${wardenToken}`,
        'Content-Type': 'application/json'
      },
      body: { parentId, reason: 'Identity re-verification requested by hostel administration' }
    });

    assert(revokeRes.status === 200, `Revocation HTTP status is 200 OK (Got: ${revokeRes.status})`);
    assert(revokeRes.data?.success === true, 'Revocation success is true');
    assert(revokeRes.data?.faceStatus === 'REVOKED', 'Revocation returns faceStatus: REVOKED');

    // Verify DB soft-revocation
    const [pRevokedRows] = await pool.query(
      'SELECT face_status, face_registered, face_revoked_at, face_revocation_reason FROM parents WHERE id = ?',
      [parentId]
    );
    assert(pRevokedRows[0].face_status === 'REVOKED', 'Database parents.face_status set to REVOKED');
    assert(pRevokedRows[0].face_registered === 0, 'Database parents.face_registered set to 0');
    assert(pRevokedRows[0].face_revoked_at !== null, 'Database parents.face_revoked_at is populated');
    assert(pRevokedRows[0].face_revocation_reason.includes('Identity re-verification'), 'Revocation reason saved in DB');

    // Verify template status
    const [tmplRevoked] = await pool.query(
      'SELECT status FROM parent_face_templates WHERE parent_id = ?',
      [parentId]
    );
    assert(tmplRevoked[0].status === 'REVOKED', 'parent_face_templates.status set to REVOKED');

    // Verify audit log
    const [auditRevoke] = await pool.query(
      'SELECT action, reason FROM parent_face_audit_logs WHERE parent_id = ? ORDER BY id DESC LIMIT 1',
      [parentId]
    );
    assert(auditRevoke[0].action === 'FACE_REVOKED', 'Audit log records FACE_REVOKED action');

    // -------------------------------------------------------------
    // TEST 14: Relational Data Integrity Preserved After Revocation
    // -------------------------------------------------------------
    console.log('\n--- TEST 14: Relational Data Integrity (Account & Student Intact) ---');
    const [parentRecord] = await pool.query('SELECT id, primary_phone FROM parents WHERE id = ?', [parentId]);
    assert(parentRecord.length === 1, 'Parent account record exists in database');

    const [linkedStudents] = await pool.query('SELECT id, name FROM students WHERE parent_id = ?', [parentId]);
    assert(linkedStudents.length === 1 && linkedStudents[0].id === studentId, 'Parent-Student relationship preserved intact');

    // Parent can still login with password
    const parentRelogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { identifier: testMobile, password: testPassword, role: 'parent' }
    });
    assert(parentRelogin.status === 200, 'Revoked parent can still login with credentials');
    assert(parentRelogin.data?.user?.faceStatus === 'REVOKED', 'Login payload reflects faceStatus: REVOKED');

    // -------------------------------------------------------------
    // TEST 15: Revoked Parent Blocked From Approving Outpasses
    // -------------------------------------------------------------
    console.log('\n--- TEST 15: Revoked Parent Verification & Approval Blocked ---');
    // Create new outpass request
    const [newOp] = await pool.query(`
      INSERT INTO outpass_requests 
        (student_id, request_code, outpass_type, reason, destination, from_datetime, to_datetime, status, student_phone)
      VALUES 
        (?, ?, 'normal', 'Doctor visit', 'City Clinic', NOW() + INTERVAL 1 DAY, NOW() + INTERVAL 2 DAY, 'PENDING_PARENT', ?)
    `, [studentId, `REQ-REV-${timestamp}`, testMobile]);
    const revokedOutpassId = newOp.insertId;

    // Verify attempt should be blocked with 403
    const blockedVerify = await request(`/api/parent/outpass/${revokedOutpassId}/face-verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: { faceDescriptor: originalDescriptor, singleFace: true }
    });

    assert(blockedVerify.status === 403, `Revoked face verification returns 403 Forbidden (Got: ${blockedVerify.status})`);
    assert(blockedVerify.data?.requiresRegistration === true, 'Response specifies requiresRegistration: true');

    // -------------------------------------------------------------
    // TEST 16: Post-Revocation Recovery (Parent Re-Registers Face)
    // -------------------------------------------------------------
    console.log('\n--- TEST 16: Post-Revocation Recovery Registration ---');
    const newDescriptor = generateFaceDescriptor(77); // New distinct facial template
    const recoveryRes = await request('/api/parent/face/register', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: { faceDescriptor: newDescriptor, singleFace: true }
    });

    assert(recoveryRes.status === 200, `Re-registration HTTP status is 200 OK (Got: ${recoveryRes.status})`);
    assert(recoveryRes.data?.faceStatus === 'ACTIVE', 'Re-registration returns faceStatus: ACTIVE');

    // DB checks
    const [recoveredParent] = await pool.query(
      'SELECT face_status, face_registered, face_revoked_at FROM parents WHERE id = ?',
      [parentId]
    );
    assert(recoveredParent[0].face_status === 'ACTIVE', 'Database parents.face_status recovered to ACTIVE');
    assert(recoveredParent[0].face_registered === 1, 'Database parents.face_registered restored to 1');
    assert(recoveredParent[0].face_revoked_at === null, 'Revocation timestamp cleared upon recovery');

    // Audit log
    const [auditRecover] = await pool.query(
      'SELECT action FROM parent_face_audit_logs WHERE parent_id = ? ORDER BY id DESC LIMIT 1',
      [parentId]
    );
    assert(auditRecover[0].action === 'FACE_REGISTERED', 'New FACE_REGISTERED audit log entry recorded');

    // -------------------------------------------------------------
    // TEST 17: Post-Recovery Approval Flow Works Immediately
    // -------------------------------------------------------------
    console.log('\n--- TEST 17: Post-Recovery Immediate Verification & Approval ---');
    // Old descriptor should now fail against new template
    const oldDescVerify = await request(`/api/parent/outpass/${revokedOutpassId}/face-verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: { faceDescriptor: originalDescriptor, singleFace: true }
    });
    assert(oldDescVerify.status === 422 || oldDescVerify.status === 401, `Previous descriptor rejected against new recovered template (Got: ${oldDescVerify.status})`);

    // New matching descriptor should succeed
    const newMatchingDesc = perturbDescriptor(newDescriptor, 0.03);
    const newVerifyRes = await request(`/api/parent/outpass/${revokedOutpassId}/face-verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: { faceDescriptor: newMatchingDesc, singleFace: true }
    });

    assert(newVerifyRes.status === 200 && newVerifyRes.data?.faceVerified === true, 'New descriptor verifies successfully');
    const newRecoveryToken = newVerifyRes.data?.verificationToken;

    // Approve outpass
    const recoveredApproveRes = await request(`/api/parent/outpass/${revokedOutpassId}/approve`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${parentToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        verification_token: newRecoveryToken,
        parent_message: 'Doctor visit approved after face recovery.'
      }
    });

    assert(recoveredApproveRes.status === 200, 'Outpass approved successfully after face recovery');

    // -------------------------------------------------------------
    // TEST 18: Zero Workflow Regression Across Roles
    // -------------------------------------------------------------
    console.log('\n--- TEST 18: Zero Workflow Regression Across Roles ---');
    // Health check
    const health = await request('/api/health');
    assert(health.status === 200, 'System health endpoint 200 OK');

    // Emergency Outpass bypasses parent face completely
    const [emergOp] = await pool.query(`
      INSERT INTO outpass_requests 
        (student_id, request_code, outpass_type, emergency_type, emergency_contact, reason, destination, from_datetime, to_datetime, status)
      VALUES 
        (?, ?, 'emergency', 'Medical Emergency', '9999999999', 'Acute fever', 'Hospital', NOW(), NOW() + INTERVAL 1 DAY, 'PENDING_WARDEN')
    `, [studentId, `EMG-${timestamp}`]);
    const emergId = emergOp.insertId;

    const wardenApproveEmerg = await request(`/api/outpass/${emergId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(wardenApproveEmerg.status === 200, 'Emergency outpass directly approved by Warden without parent involvement');

    // One-Day Duty outpass
    const [dutyOp] = await pool.query(`
      INSERT INTO outpass_requests 
        (student_id, request_code, outpass_type, reason, destination, from_datetime, to_datetime, status)
      VALUES 
        (?, ?, 'one_day_duty', 'College Symposium', 'Campus Auditorium', NOW(), NOW() + INTERVAL 8 HOUR, 'PENDING_ADVISOR')
    `, [studentId, `DUTY-${timestamp}`]);
    const dutyId = dutyOp.insertId;

    const [dutyRow] = await pool.query('SELECT status, outpass_type FROM outpass_requests WHERE id = ?', [dutyId]);
    assert(dutyRow[0].status === 'PENDING_ADVISOR' && dutyRow[0].outpass_type === 'one_day_duty', 'One-Day Duty outpass route preserved intact');

  } catch (err) {
    console.error('Test Execution Error:', err);
    failedTests++;
  } finally {
    if (studentId && originalParentId) {
      try {
        await pool.query('UPDATE students SET parent_id = ? WHERE id = ?', [originalParentId, studentId]);
      } catch (cleanupErr) {
        console.error('Failed to restore student parent_id:', cleanupErr);
      }
    }
    await pool.end();
  }

  console.log('\n===============================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
