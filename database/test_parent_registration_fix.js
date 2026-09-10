/**
 * SMART HOSTEL OUTPASS SYSTEM
 * Comprehensive Test Suite: Parent New Account Creation & Face Registration Fix
 * 
 * Tests:
 * 1. New Parent Registration with Student Linkage
 * 2. Pre-Face Registration Dashboard Gating (Dashboard blocked)
 * 3. Face Registration & Template Persistence (Status becomes ACTIVE)
 * 4. Post-Face Registration Dashboard Access (Overview unblocked, correct ward data)
 * 5. Duplicate Mobile Handling (HTTP 409 with exact message)
 * 6. Invalid Student Roll Handling & Transaction Safety (HTTP 400 with exact message, zero orphan records)
 * 7. Second Parent Creation & Cross-Parent Data Isolation (Parent A vs Parent B)
 * 8. Existing Parent Login with ACTIVE Face (Direct dashboard access)
 * 9. Warden Face Revocation & Recovery Workflow Integrity
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

function generateUnitDescriptor(seed = 1) {
  const rawVec = new Array(128).fill(0).map((_, i) => Math.sin(seed * (i + 1)));
  const norm = Math.sqrt(rawVec.reduce((s, v) => s + v * v, 0));
  return rawVec.map(v => Number((v / norm).toFixed(6)));
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('🧪 PARENT NEW REGISTRATION & FACE REGISTRATION VERIFICATION');
  console.log('================================================================\n');

  const pool = mysql.createPool(DB_CONFIG);

  try {
    // 0. Prepare clean test environment
    const testMobileA = '9800000001';
    const testMobileB = '9800000002';
    const invalidMobile = '9800000003';

    // Clean up any previous test runs
    await pool.query('DELETE FROM parents WHERE primary_phone IN (?, ?, ?)', [testMobileA, testMobileB, invalidMobile]);

    // Ensure we have two test students with known roll numbers
    const [studentRows] = await pool.query('SELECT id, reg_no, name FROM students WHERE is_active = true ORDER BY id ASC LIMIT 2');
    if (studentRows.length < 2) {
      throw new Error('At least 2 active students required in database for isolation testing');
    }
    const studentA = studentRows[0];
    const studentB = studentRows[1];

    console.log(`Using Student A: ${studentA.name} (${studentA.reg_no})`);
    console.log(`Using Student B: ${studentB.name} (${studentB.reg_no})\n`);

    // ================================================================
    // Test 1: New Parent A Registration
    // ================================================================
    console.log('--- Test 1: New Parent Registration ---');
    const regResA = await request('/api/auth/register-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        parent_name: 'Test Parent Alpha',
        mobile: testMobileA,
        relationship: 'Father',
        student_roll_number: studentA.reg_no,
        student_name: studentA.name,
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(regResA.status === 201, `Registration returns HTTP 201 (got ${regResA.status})`);
    assert(regResA.data.success === true, 'Response indicates success: true');
    assert(Boolean(regResA.data.token), 'Response includes JWT authentication token');
    assert(regResA.data.requiresFaceRegistration === true, 'requiresFaceRegistration is true');
    assert(regResA.data.faceStatus === 'NOT_REGISTERED', 'faceStatus is NOT_REGISTERED');
    assert(regResA.data.user.role === 'parent', 'User role is correctly set to "parent"');
    assert(regResA.data.user.linkedStudent.regNo === studentA.reg_no, 'Linked student roll matches Student A');

    const tokenA = regResA.data.token;
    const parentAId = regResA.data.user.id;

    // Verify database record for Parent A
    const [dbParentA] = await pool.query('SELECT * FROM parents WHERE id = ?', [parentAId]);
    assert(dbParentA.length === 1, 'Parent A database record exists');
    assert(dbParentA[0].face_status === 'NOT_REGISTERED', 'DB face_status is "NOT_REGISTERED"');
    assert(dbParentA[0].face_registered === 0, 'DB face_registered is 0 (false)');
    assert(dbParentA[0].primary_phone === testMobileA, 'DB primary_phone matches test mobile');

    // Verify student linkage
    const [linkedStudentA] = await pool.query('SELECT parent_id FROM students WHERE id = ?', [studentA.id]);
    assert(linkedStudentA[0].parent_id === parentAId, 'Student A parent_id updated to Parent A ID');

    // ================================================================
    // Test 2: Pre-Face Registration Dashboard Gating
    // ================================================================
    console.log('\n--- Test 2: Dashboard Gating Before Face Registration ---');
    const preFaceOverviewA = await request('/api/parent/overview', {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert(preFaceOverviewA.status === 200, 'Overview endpoint responds');
    assert(preFaceOverviewA.data.accessBlocked === true, 'Parent Dashboard accessBlocked is true');
    assert(preFaceOverviewA.data.faceStatus === 'NOT_REGISTERED', 'Overview faceStatus is NOT_REGISTERED');

    // Verify GET /api/auth/me reflects NOT_REGISTERED
    const meResA = await request('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(meResA.status === 200, 'GET /api/auth/me responds');
    assert(meResA.data.user.faceStatus === 'NOT_REGISTERED', 'GET /api/auth/me reports faceStatus: NOT_REGISTERED');
    assert(meResA.data.user.name === 'Test Parent Alpha', 'GET /api/auth/me properly resolves parent name');

    // ================================================================
    // Test 3: Face Registration & Biometric Enrollment
    // ================================================================
    console.log('\n--- Test 3: First-Time Face Biometric Enrollment ---');
    const faceVecA = generateUnitDescriptor(101);
    const faceRegResA = await request('/api/parent/face/register', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      },
      body: {
        faceDescriptor: faceVecA,
        qualityScore: 0.98,
        singleFace: true
      }
    });

    assert(faceRegResA.status === 200, 'Face registration returns HTTP 200');
    assert(faceRegResA.data.success === true, 'Face registration success is true');

    // Verify database record updated to ACTIVE
    const [dbParentAActive] = await pool.query('SELECT face_status, face_registered FROM parents WHERE id = ?', [parentAId]);
    assert(dbParentAActive[0].face_status === 'ACTIVE', 'DB face_status transitioned to ACTIVE');
    assert(dbParentAActive[0].face_registered === 1, 'DB face_registered transitioned to 1');

    // Verify template row in parent_face_templates
    const [dbTemplatesA] = await pool.query('SELECT status FROM parent_face_templates WHERE parent_id = ?', [parentAId]);
    assert(dbTemplatesA.length > 0 && dbTemplatesA[0].status === 'ACTIVE', 'parent_face_templates row exists with status ACTIVE');

    // ================================================================
    // Test 4: Post-Face Registration Dashboard Access
    // ================================================================
    console.log('\n--- Test 4: Dashboard Access Post-Face Registration ---');
    const postFaceOverviewA = await request('/api/parent/overview', {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert(postFaceOverviewA.status === 200, 'Overview returns HTTP 200');
    assert(postFaceOverviewA.data.accessBlocked === false, 'accessBlocked is now false (unlocked)');
    assert(postFaceOverviewA.data.faceStatus === 'ACTIVE', 'Overview reports faceStatus: ACTIVE');
    assert(postFaceOverviewA.data.parent.name === 'Test Parent Alpha', 'Parent overview shows correct parent name');
    assert(postFaceOverviewA.data.parent.phone === testMobileA, 'Parent overview shows correct mobile');
    assert(postFaceOverviewA.data.linkedStudent.regNo === studentA.reg_no, 'Parent overview shows correct linked student');

    // ================================================================
    // Test 5: Duplicate Mobile Number Handling
    // ================================================================
    console.log('\n--- Test 5: Duplicate Mobile Number Handling ---');
    const dupRes = await request('/api/auth/register-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        parent_name: 'Duplicate Parent',
        mobile: testMobileA, // Already registered
        relationship: 'Mother',
        student_roll_number: studentB.reg_no,
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(dupRes.status === 409, `Duplicate mobile returns HTTP 409 Conflict (got ${dupRes.status})`);
    assert(dupRes.data.success === false, 'Duplicate mobile returns success: false');
    assert(dupRes.data.message === 'An account with this mobile number already exists.', 'Returns required duplicate message');

    // ================================================================
    // Test 6: Invalid Student Roll & Transaction Safety
    // ================================================================
    console.log('\n--- Test 6: Invalid Student Roll & Transaction Rollback ---');
    const invalidRollRes = await request('/api/auth/register-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        parent_name: 'Orphan Parent Candidate',
        mobile: invalidMobile,
        relationship: 'Father',
        student_roll_number: 'NONEXISTENT_ROLL_9999',
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(invalidRollRes.status === 400, `Invalid roll returns HTTP 400 Bad Request (got ${invalidRollRes.status})`);
    assert(invalidRollRes.data.success === false, 'Invalid roll returns success: false');
    assert(invalidRollRes.data.message === 'Student not found. Please check the student roll number.', 'Returns exact required student not found message');

    // Verify transaction rollback: no orphan parent record was created
    const [orphanCheck] = await pool.query('SELECT id FROM parents WHERE primary_phone = ?', [invalidMobile]);
    assert(orphanCheck.length === 0, 'Zero orphan accounts created in parents table (transaction rollback verified)');

    // ================================================================
    // Test 7: Second Parent Creation & Data Isolation
    // ================================================================
    console.log('\n--- Test 7: Second Parent Creation & Data Isolation ---');
    const regResB = await request('/api/auth/register-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        parent_name: 'Test Parent Beta',
        mobile: testMobileB,
        relationship: 'Mother',
        student_roll_number: studentB.reg_no,
        student_name: studentB.name,
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(regResB.status === 201, 'Parent B registration succeeds with HTTP 201');
    const tokenB = regResB.data.token;
    const parentBId = regResB.data.user.id;

    // Enroll Parent B face
    const faceVecB = generateUnitDescriptor(202);
    await request('/api/parent/face/register', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenB}`,
        'Content-Type': 'application/json'
      },
      body: {
        faceDescriptor: faceVecB,
        qualityScore: 0.99,
        singleFace: true
      }
    });

    // Check Parent A overview
    const overviewA = await request('/api/parent/overview', {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    // Check Parent B overview
    const overviewB = await request('/api/parent/overview', {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    assert(overviewA.data.parent.id === parentAId, 'Overview A belongs strictly to Parent A');
    assert(overviewA.data.parent.name === 'Test Parent Alpha', 'Overview A shows Parent A name');
    assert(overviewA.data.linkedStudent.regNo === studentA.reg_no, 'Overview A shows Student A only');

    assert(overviewB.data.parent.id === parentBId, 'Overview B belongs strictly to Parent B');
    assert(overviewB.data.parent.name === 'Test Parent Beta', 'Overview B shows Parent B name');
    assert(overviewB.data.linkedStudent.regNo === studentB.reg_no, 'Overview B shows Student B only');

    assert(overviewA.data.parent.id !== overviewB.data.parent.id, 'Parent A and Parent B have unique distinct IDs');
    assert(overviewA.data.linkedStudent.id !== overviewB.data.linkedStudent.id, 'Student A and Student B are completely isolated');

    // ================================================================
    // Test 8: Existing Parent Login with ACTIVE Face
    // ================================================================
    console.log('\n--- Test 8: Existing Parent Login with ACTIVE Face ---');
    const loginResA = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        username: testMobileA,
        password: 'Password@123',
        role: 'parent'
      }
    });

    assert(loginResA.status === 200, 'Existing parent login returns HTTP 200');
    assert(loginResA.data.success === true, 'Login response success: true');
    assert(loginResA.data.user.faceStatus === 'ACTIVE', 'Login response confirms faceStatus is ACTIVE');
    assert(loginResA.data.redirectTo === '/parent-dashboard.html', 'Directs immediately to /parent-dashboard.html');

    // ================================================================
    // Test 9: Warden Face Revocation & Recovery Workflow
    // ================================================================
    console.log('\n--- Test 9: Warden Revocation & Recovery Workflow Integrity ---');
    // Login as Warden
    const wardenLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
    });
    assert(wardenLogin.status === 200, 'Warden login succeeds');
    const wardenToken = wardenLogin.data.token;

    // Revoke Parent A's face
    const revokeRes = await request('/api/warden/parents/revoke-face', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${wardenToken}`,
        'Content-Type': 'application/json'
      },
      body: { parentId: parentAId, reason: 'Annual biometric re-verification required' }
    });
    assert(revokeRes.status === 200, 'Warden revoke returns HTTP 200');

    // Verify DB state is REVOKED
    const [revokedDb] = await pool.query('SELECT face_status FROM parents WHERE id = ?', [parentAId]);
    assert(revokedDb[0].face_status === 'REVOKED', 'Parent A face_status is REVOKED in DB');

    // Parent A re-registers new face
    const newFaceVecA = generateUnitDescriptor(303);
    const reRegisterRes = await request('/api/parent/face/register', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      },
      body: {
        faceDescriptor: newFaceVecA,
        qualityScore: 0.97,
        singleFace: true
      }
    });
    assert(reRegisterRes.status === 200, 'Parent re-enrollment returns HTTP 200');

    // Verify DB restored to ACTIVE
    const [restoredDb] = await pool.query('SELECT face_status FROM parents WHERE id = ?', [parentAId]);
    assert(restoredDb[0].face_status === 'ACTIVE', 'Parent A face_status restored to ACTIVE');

    // Clean up test parents
    await pool.query('DELETE FROM parents WHERE primary_phone IN (?, ?)', [testMobileA, testMobileB]);

    console.log('\n================================================================');
    console.log(`🎉 ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions verified successfully!`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Suite Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSuite();
