/**
 * Smart Hostel Outpass Management System
 * Test Suite: Student Account Creation & Student Login
 *
 * Verifies:
 *  1. Existing student login (valid credentials, invalid password, unknown user, missing fields, redirect)
 *  2. Password security (bcrypt hashing, zero plaintext in DB, zero password exposure in API)
 *  3. Student account creation / registration (input validations, unique username & email, auto-login JWT)
 *  4. Database integrity (MySQL students table relations, parent linkage, active status)
 *  5. Immediate auto-login token validity (/api/auth/me)
 *  6. Role authorization protection (student blocked from parent, warden, principal, caretaker, watchman routes)
 *  7. Regression & end-to-end integration (GPS location update, outpass submission, outpass listing)
 */

const http = require('http');
const bcrypt = require('bcrypt');
const { pool } = require('../utils/db');

const BASE_URL = 'http://localhost:5001';

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    if (details) console.error(`     Details: ${details}`);
    failed++;
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const method = options.method || 'GET';
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const body = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let data = null;
        try {
          data = JSON.parse(rawData);
        } catch {
          data = rawData;
        }
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          data
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 500, ok: false, data: { error: err.message } });
    });

    if (body) req.write(body);
    req.end();
  });
}

async function runStudentAuthTests() {
  console.log('======================================================================');
  console.log('🎓 RUNNING STUDENT ACCOUNT & LOGIN TEST SUITE ON PORT 5001');
  console.log('======================================================================\n');

  const testStamp = Date.now();
  const testStudentUser = `STU_${testStamp}`;
  const testStudentEmail = `stu_${testStamp}@student.edu`;
  const testStudentPass = 'SecurePass@2026';
  let registeredStudentToken = null;
  let registeredStudentId = null;

  try {
    // ------------------------------------------------------------------
    // Section 1: Existing Student Login Flow
    // ------------------------------------------------------------------
    console.log('--- Section 1: Existing Student Account Login ---');

    // 1.1 Valid Existing Student Login (21CS042 / Password@123)
    const validLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: '21CS042',
        password: 'Password@123',
        role: 'student'
      }
    });

    assert(
      validLoginRes.status === 200 && validLoginRes.data.success === true && !!validLoginRes.data.token,
      'Valid student login succeeds with HTTP 200 and issues JWT token'
    );
    assert(
      validLoginRes.data.user && validLoginRes.data.user.role === 'student' && validLoginRes.data.user.identifier === '21CS042',
      'Login response contains authenticated student identity (roll number 21CS042)'
    );
    assert(
      validLoginRes.data.redirectTo === '/student-dashboard.html',
      'Login response specifies redirect to /student-dashboard.html'
    );
    assert(
      !validLoginRes.data.user.password && !validLoginRes.data.user.password_hash,
      'Zero password/hash exposure in login API response'
    );

    // 1.2 Login with role omitted (defaults cleanly to student)
    const noRoleLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: '21CS042',
        password: 'Password@123'
      }
    });
    assert(
      noRoleLoginRes.status === 200 && noRoleLoginRes.data.success === true,
      'Student login with omitted role parameter defaults to student role'
    );

    // 1.3 Invalid Password
    const wrongPassRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: '21CS042',
        password: 'TotallyWrongPassword999',
        role: 'student'
      }
    });
    assert(
      wrongPassRes.status === 401 && wrongPassRes.data.success === false,
      'Invalid password rejected with HTTP 401 and error message'
    );

    // 1.4 Non-existent Student Username
    const unknownUserRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: `NONEXISTENT_STU_${testStamp}`,
        password: 'Password@123',
        role: 'student'
      }
    });
    assert(
      unknownUserRes.status === 401 && unknownUserRes.data.success === false,
      'Unknown username rejected with HTTP 401'
    );

    // 1.5 Missing Password Field
    const missingPassRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: '21CS042',
        role: 'student'
      }
    });
    assert(
      missingPassRes.status === 400 && missingPassRes.data.success === false,
      'Missing password field rejected with HTTP 400'
    );

    // 1.6 Missing Username Field
    const missingUserRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        password: 'Password@123',
        role: 'student'
      }
    });
    assert(
      missingUserRes.status === 400 && missingUserRes.data.success === false,
      'Missing username field rejected with HTTP 400'
    );

    // ------------------------------------------------------------------
    // Section 2: Student Account Creation (Registration)
    // ------------------------------------------------------------------
    console.log('\n--- Section 2: Student Account Creation Validation & Registration ---');

    // 2.1 Missing Username / Roll Number
    const regNoUserRes = await request('/api/auth/register-student', {
      method: 'POST',
      body: {
        name: 'Test Student',
        password: testStudentPass,
        confirm_password: testStudentPass
      }
    });
    assert(
      regNoUserRes.status === 400 && regNoUserRes.data.success === false,
      'Registration without username/roll number rejected with HTTP 400'
    );

    // 2.2 Short Username (< 3 characters)
    const regShortUserRes = await request('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: 'ab',
        name: 'Test Student',
        password: testStudentPass,
        confirm_password: testStudentPass
      }
    });
    assert(
      regShortUserRes.status === 400 && regShortUserRes.data.success === false,
      'Registration with short username (< 3 chars) rejected with HTTP 400'
    );

    // 2.3 Short Password (< 6 characters)
    const regShortPassRes = await request('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: testStudentUser,
        name: 'Test Student',
        password: '123',
        confirm_password: '123'
      }
    });
    assert(
      regShortPassRes.status === 400 && regShortPassRes.data.success === false,
      'Registration with short password (< 6 chars) rejected with HTTP 400'
    );

    // 2.4 Password Mismatch
    const regMismatchPassRes = await request('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: testStudentUser,
        name: 'Test Student',
        password: testStudentPass,
        confirm_password: 'DifferentPassword@999'
      }
    });
    assert(
      regMismatchPassRes.status === 400 && regMismatchPassRes.data.success === false,
      'Registration with mismatched passwords rejected with HTTP 400'
    );

    // 2.5 Duplicate Username Check (Using existing demo 21CS042)
    const regDupUserRes = await request('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: '21CS042',
        name: 'Imposter Student',
        email: `imposter_${testStamp}@student.edu`,
        password: testStudentPass,
        confirm_password: testStudentPass
      }
    });
    assert(
      regDupUserRes.status === 409 && regDupUserRes.data.success === false,
      'Registration with already existing username / roll number rejected with HTTP 409 Conflict'
    );

    // 2.6 Duplicate Email Check (Using existing demo john.doe@student.edu)
    const regDupEmailRes = await request('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: `NEW_${testStamp}`,
        name: 'Imposter Student',
        email: 'john.doe@student.edu',
        password: testStudentPass,
        confirm_password: testStudentPass
      }
    });
    assert(
      regDupEmailRes.status === 409 && regDupEmailRes.data.success === false,
      'Registration with already existing email rejected with HTTP 409 Conflict'
    );

    // 2.7 Successful Student Account Creation (Valid Details)
    const newStudentData = {
      username: testStudentUser,
      reg_no: testStudentUser,
      name: 'Rohan Verma',
      email: testStudentEmail,
      phone: '9876541122',
      department: 'Computer Science & Engineering',
      year_of_study: 3,
      semester: 'Semester 6',
      section: 'A',
      room_no: 'A-402',
      hostel_block: 'Block A',
      parent_name: 'Suresh Verma',
      parent_phone: '9876549988',
      password: testStudentPass,
      confirm_password: testStudentPass
    };

    const registerRes = await request('/api/auth/register-student', {
      method: 'POST',
      body: newStudentData
    });

    assert(
      registerRes.status === 201 && registerRes.data.success === true && !!registerRes.data.token,
      'Successful student registration returns HTTP 201 Created and JWT token'
    );
    assert(
      registerRes.data.redirectTo === '/student-dashboard.html',
      'Registration response instructs auto-redirect to /student-dashboard.html'
    );
    assert(
      registerRes.data.user && registerRes.data.user.reg_no === testStudentUser,
      'Registration response returns created user profile with matching roll number'
    );
    assert(
      !registerRes.data.user.password && !registerRes.data.user.password_hash,
      'Zero password/hash returned in registration response'
    );

    registeredStudentToken = registerRes.data.token;
    registeredStudentId = registerRes.data.user.id;

    // 2.8 Database Verification of Stored Student
    const [dbRows] = await pool.query(
      'SELECT id, reg_no, name, email, phone, department, year_of_study, room_no, hostel_block, parent_id, password_hash, is_active, current_hostel_status FROM students WHERE id = ?;',
      [registeredStudentId]
    );

    assert(dbRows.length === 1, 'Student record verified inserted in MySQL students table');
    const dbStudent = dbRows[0];
    assert(dbStudent.reg_no === testStudentUser, 'Database reg_no matches registered username');
    assert(dbStudent.name === 'Rohan Verma', 'Database name matches registered full name');
    assert(dbStudent.email === testStudentEmail, 'Database email matches registered email');
    assert(dbStudent.is_active === 1, 'Student is active by default (is_active = 1)');
    assert(dbStudent.current_hostel_status === 'INSIDE', 'Student status is initialized to INSIDE');

    // 2.9 Verify Bcrypt Password Hashing (NEVER stored plaintext)
    assert(
      dbStudent.password_hash !== testStudentPass && dbStudent.password_hash.startsWith('$2b$'),
      'Password is securely hashed with bcrypt in MySQL (never plaintext)'
    );
    const passMatches = await bcrypt.compare(testStudentPass, dbStudent.password_hash);
    assert(passMatches === true, 'Bcrypt hash correctly verifies against student password');

    // 2.10 Verify Parent Association in Database
    assert(dbStudent.parent_id > 0, 'Student is associated with a valid parent record (parent_id > 0)');
    const [parentRows] = await pool.query(
      'SELECT id, father_name, primary_phone FROM parents WHERE id = ?;',
      [dbStudent.parent_id]
    );
    assert(
      parentRows.length === 1 && parentRows[0].primary_phone === '9876549988',
      'Parent record exists and primary_phone matches parent phone entered during student registration'
    );

    // ------------------------------------------------------------------
    // Section 3: Auto-Login & Subsequent Login Verification
    // ------------------------------------------------------------------
    console.log('\n--- Section 3: Automatic Login & Authentication State ---');

    // 3.1 Verify issued auto-login token via /api/auth/me
    const meRes = await request('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` }
    });

    assert(
      meRes.status === 200 && meRes.data.success === true,
      'Automatic login token authenticates against GET /api/auth/me'
    );
    assert(
      meRes.data.user.role === 'student' && meRes.data.user.reg_no === testStudentUser,
      '/api/auth/me returns student profile matching newly registered account'
    );

    // 3.2 Verify student can subsequently sign in using their new credentials
    const subLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: testStudentUser,
        password: testStudentPass,
        role: 'student'
      }
    });
    assert(
      subLoginRes.status === 200 && subLoginRes.data.success === true && !!subLoginRes.data.token,
      'Newly registered student can subsequently log in with their credentials'
    );

    // ------------------------------------------------------------------
    // Section 4: Role-Based Authorization & Security Isolation
    // ------------------------------------------------------------------
    console.log('\n--- Section 4: Role Isolation & Authorization Boundaries ---');

    // 4.1 Student blocked from Parent routes
    const parentRouteAttempt = await request('/api/parent/overview', {
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` }
    });
    assert(
      parentRouteAttempt.status === 403,
      'Student blocked from Parent protected route (/api/parent/overview) with HTTP 403 Forbidden'
    );

    // 4.2 Student blocked from Warden routes
    const wardenRouteAttempt = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` }
    });
    assert(
      wardenRouteAttempt.status === 403,
      'Student blocked from Warden pending queue with HTTP 403 Forbidden'
    );

    // 4.3 Student blocked from Principal routes
    const principalRouteAttempt = await request('/api/principal/dashboard-stats', {
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` }
    });
    assert(
      principalRouteAttempt.status === 403,
      'Student blocked from Principal route with HTTP 403 Forbidden'
    );

    // 4.4 Student blocked from Caretaker Check-Out
    const caretakerRouteAttempt = await request('/api/gate/checkout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` },
      body: { qr_token: 'DUMMY_TOKEN' }
    });
    assert(
      caretakerRouteAttempt.status === 403,
      'Student blocked from Gate Check-Out with HTTP 403 Forbidden'
    );

    // 4.5 Student blocked from Watchman Check-In
    const watchmanRouteAttempt = await request('/api/gate/checkin', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` },
      body: { qr_token: 'DUMMY_TOKEN' }
    });
    assert(
      watchmanRouteAttempt.status === 403,
      'Student blocked from Gate Check-In with HTTP 403 Forbidden'
    );

    // ------------------------------------------------------------------
    // Section 5: End-to-End Functional Integration (Outpass & GPS)
    // ------------------------------------------------------------------
    console.log('\n--- Section 5: End-to-End Functional Integration for New Student ---');

    // 5.1 Student updates live GPS location
    const gpsRes = await request('/api/outpass/student/location', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` },
      body: {
        latitude: 11.2750000,
        longitude: 77.5850000,
        accuracy: 12.5,
        source: 'browser_geolocation'
      }
    });
    assert(
      gpsRes.status === 200 && gpsRes.data.success === true,
      'Newly registered student can activate and update Live GPS location'
    );

    // 5.2 Student creates normal outpass request
    const now = new Date();
    const leaving = new Date(now.getTime() + 24 * 3600 * 1000);
    const returnTime = new Date(now.getTime() + 48 * 3600 * 1000);

    const pad = (n) => String(n).padStart(2, '0');
    const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const formatTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const createOutpassRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Central City Mall',
        reason: 'Procuring academic stationery and project components',
        leaving_date: formatDate(leaving),
        leaving_time: formatTime(leaving),
        expected_return_date: formatDate(returnTime),
        expected_return_time: formatTime(returnTime),
        student_phone: '9876541122'
      }
    });

    assert(
      createOutpassRes.status === 201 && createOutpassRes.data.success === true,
      'Newly registered student can successfully create outpass request (Status -> PENDING_PARENT)'
    );
    const createdOutpassId = createOutpassRes.data?.data?.id;

    // 5.3 Student retrieves personal outpass list
    const myRequestsRes = await request('/api/outpass/my-requests', {
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` }
    });

    assert(
      myRequestsRes.status === 200 && myRequestsRes.data.success === true && Array.isArray(myRequestsRes.data.requests),
      'Student can retrieve personal outpass history from /api/outpass/my-requests'
    );
    const foundPass = myRequestsRes.data.requests.find((p) => p.id === createdOutpassId);
    assert(
      !!foundPass && foundPass.destination === 'Central City Mall',
      'Created outpass appears accurately in student outpass list'
    );

    // 5.4 Student queries dashboard status summary
    const summaryRes = await request('/api/outpass/status-summary', {
      headers: { 'Authorization': `Bearer ${registeredStudentToken}` }
    });
    assert(
      summaryRes.status === 200 && summaryRes.data.success === true && (summaryRes.data.stats?.total >= 1 || summaryRes.data.stats?.pending >= 1),
      'Student dashboard metrics reflect new outpass count accurately (/api/outpass/status-summary)'
    );

    // ------------------------------------------------------------------
    // Section 6: Cleanup Test Data
    // ------------------------------------------------------------------
    console.log('\n--- Section 6: Cleanup Test Artifacts ---');
    if (createdOutpassId) {
      await pool.query('DELETE FROM outpass_requests WHERE id = ?;', [createdOutpassId]);
    }
    if (registeredStudentId) {
      await pool.query('DELETE FROM student_locations WHERE student_id = ?;', [registeredStudentId]);
      await pool.query('DELETE FROM students WHERE id = ?;', [registeredStudentId]);
    }
    console.log('  Cleaned up temporary test student and outpass records.');

    console.log('\n======================================================================');
    console.log(`🏁 STUDENT ACCOUNT & LOGIN TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================\n');

  } catch (err) {
    console.error('Fatal error during student auth tests:', err);
    failed++;
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runStudentAuthTests();
