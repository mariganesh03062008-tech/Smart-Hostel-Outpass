/**
 * Comprehensive Test Suite for Parent-Student Linking
 * Tests 1 to 10 covering strict student lookup, name validation,
 * removal of demo student auto-linking, isolation, and security.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { pool } = require('../utils/db');

const BASE_URL = 'http://localhost:5001';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const bodyData = options.body ? JSON.stringify(options.body) : null;
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('PARENT-STUDENT LINKING FIX - AUTOMATED VERIFICATION');
  console.log('====================================================\n');

  const timestamp = Date.now();
  const studentARoll = `TEST_STU_A_${timestamp}`;
  const studentBRoll = `TEST_STU_B_${timestamp}`;
  const studentAName = 'Karthik Raja';
  const studentBName = 'Priya Sridhar';

  const parentAPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const parentBPhone = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
  const parentCPhone = `96${Math.floor(10000000 + Math.random() * 90000000)}`;

  let studentAId, studentBId;
  let parentAToken, parentAId;
  let parentBToken, parentBId;
  let parentCToken, parentCId;

  try {
    // 0. Setup test students in DB
    console.log('Setup: Preparing test students...');
    const [insA] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, room_no, hostel_block, parent_id, password_hash, is_active)
      VALUES (?, ?, ?, '9000000001', 'ECE', 2, 'B-201', 'Block B', 1, '$2a$10$abcdefghijklmnopqrstuu', 1)
    `, [studentARoll, studentAName, `stu_a_${timestamp}@test.edu`]);
    studentAId = insA.insertId;

    const [insB] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, room_no, hostel_block, parent_id, password_hash, is_active)
      VALUES (?, ?, ?, '9000000002', 'IT', 3, 'C-305', 'Block C', 1, '$2a$10$abcdefghijklmnopqrstuu', 1)
    `, [studentBRoll, studentBName, `stu_b_${timestamp}@test.edu`]);
    studentBId = insB.insertId;

    console.log(`  Created Student A (ID: ${studentAId}, Roll: ${studentARoll}, Name: ${studentAName})`);
    console.log(`  Created Student B (ID: ${studentBId}, Roll: ${studentBRoll}, Name: ${studentBName})\n`);

    // ====================================================
    // TEST 1: Create Parent A with Student A Roll Number
    // ====================================================
    console.log('TEST 1: Create Parent A with Student A Roll Number');
    const res1 = await request('/api/auth/register-parent', {
      method: 'POST',
      body: {
        parent_name: 'Muthu Raja',
        mobile: parentAPhone,
        relationship: 'Father',
        student_name: studentAName,
        student_roll_number: studentARoll,
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(res1.status === 201, `Parent A registration HTTP 201 created (got ${res1.status})`);
    assert(res1.data?.success === true, 'Parent A response reports success: true');
    assert(Boolean(res1.data?.token), 'Parent A received valid JWT auth token');
    parentAToken = res1.data?.token;
    parentAId = res1.data?.user?.id;

    // Verify in database that Student A parent_id equals Parent A ID
    const [stuARows] = await pool.query('SELECT parent_id FROM students WHERE id = ?', [studentAId]);
    assert(stuARows[0]?.parent_id === parentAId, `Student A parent_id strictly linked to Parent A (ID: ${parentAId})`);
    console.log('');

    // ====================================================
    // TEST 2: Create Parent B with Student B Roll Number
    // ====================================================
    console.log('TEST 2: Create Parent B with Student B Roll Number');
    const res2 = await request('/api/auth/register-parent', {
      method: 'POST',
      body: {
        parent_name: 'Meena Sridhar',
        mobile: parentBPhone,
        relationship: 'Mother',
        student_name: studentBName,
        student_roll_number: studentBRoll,
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(res2.status === 201, `Parent B registration HTTP 201 created (got ${res2.status})`);
    assert(res2.data?.success === true, 'Parent B response reports success: true');
    assert(Boolean(res2.data?.token), 'Parent B received valid JWT auth token');
    parentBToken = res2.data?.token;
    parentBId = res2.data?.user?.id;

    const [stuBRows] = await pool.query('SELECT parent_id FROM students WHERE id = ?', [studentBId]);
    assert(stuBRows[0]?.parent_id === parentBId, `Student B parent_id strictly linked to Parent B (ID: ${parentBId})`);
    assert(stuBRows[0]?.parent_id !== parentAId, 'Parent B and Parent A are isolated (not cross-linked)');
    console.log('');

    // ====================================================
    // TEST 3: Create Parent with Invalid Roll Number
    // ====================================================
    console.log('TEST 3: Create Parent with invalid Roll Number');
    const res3 = await request('/api/auth/register-parent', {
      method: 'POST',
      body: {
        parent_name: 'Invalid Parent Test',
        mobile: `95${Math.floor(10000000 + Math.random() * 90000000)}`,
        relationship: 'Father',
        student_name: 'Non Existing',
        student_roll_number: 'NON_EXISTENT_ROLL_99999',
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(res3.status === 400, `Registration rejected with HTTP 400 (got ${res3.status})`);
    assert(res3.data?.success === false, 'Response indicates failure');
    assert(
      res3.data?.message === 'Student Roll Number not found. Please enter a valid registered student Roll Number.',
      `Exact validation message returned: "${res3.data?.message}"`
    );
    console.log('');

    // ====================================================
    // TEST 4: Valid Roll Number + Wrong Student Name
    // ====================================================
    console.log('TEST 4: Enter valid Roll Number + wrong Student Name');
    const res4 = await request('/api/auth/register-parent', {
      method: 'POST',
      body: {
        parent_name: 'Mismatch Parent Test',
        mobile: `94${Math.floor(10000000 + Math.random() * 90000000)}`,
        relationship: 'Father',
        student_name: 'Completely Wrong Student Name',
        student_roll_number: studentARoll, // Valid Roll Number (Karthik Raja)
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(res4.status === 400, `Registration rejected with HTTP 400 (got ${res4.status})`);
    assert(res4.data?.success === false, 'Response indicates failure');
    assert(
      res4.data?.message === 'Student Roll Number and Student Name do not match.',
      `Exact mismatch error message returned: "${res4.data?.message}"`
    );
    console.log('');

    // ====================================================
    // TEST 5: Create Parent with different student from demo student
    // ====================================================
    console.log('TEST 5: Create Parent with a different student from demo student');
    const res5 = await request('/api/auth/register-parent', {
      method: 'POST',
      body: {
        parent_name: 'Guardian Test',
        mobile: parentCPhone,
        relationship: 'Guardian',
        student_name: studentBName,
        student_roll_number: studentBRoll,
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(res5.status === 201, `Parent C registered with student B (got ${res5.status})`);
    parentCToken = res5.data?.token;
    parentCId = res5.data?.user?.id;

    const [stuCheck] = await pool.query('SELECT reg_no, name, parent_id FROM students WHERE id = ?', [studentBId]);
    assert(stuCheck[0]?.reg_no === studentBRoll, `Student reg_no is ${studentBRoll} (NOT demo 21CS042)`);
    assert(stuCheck[0]?.parent_id === parentCId, `Parent C is linked to student B (ID: ${parentCId})`);
    console.log('');

    // ====================================================
    // TEST 6: Parent Dashboard - Displays Only Actual Linked Student
    // ====================================================
    console.log('TEST 6: Parent Dashboard - Linked Student Display');
    const overviewA = await request('/api/parent/overview', {
      token: parentAToken
    });

    assert(overviewA.status === 200, `Parent A overview status 200 (got ${overviewA.status})`);
    assert(overviewA.data?.linkedStudent?.regNo === studentARoll, `Parent A linkedStudent regNo is ${studentARoll} (NOT demo 21CS042)`);
    assert(overviewA.data?.linkedStudent?.name === studentAName, `Parent A linkedStudent name is ${studentAName} (NOT John Doe)`);

    const overviewB = await request('/api/parent/overview', {
      token: parentCToken
    });

    assert(overviewB.status === 200, `Parent C overview status 200 (got ${overviewB.status})`);
    assert(overviewB.data?.linkedStudent?.regNo === studentBRoll, `Parent C linkedStudent regNo is ${studentBRoll} (NOT demo 21CS042)`);
    assert(overviewB.data?.linkedStudent?.name === studentBName, `Parent C linkedStudent name is ${studentBName} (NOT John Doe)`);
    console.log('');

    // ====================================================
    // TEST 7: Parent pending outpasses - Filtered by linked student
    // ====================================================
    console.log('TEST 7: Parent pending outpasses - Isolation check');
    const requestCodeA = `OP_TESTA_${timestamp}`;
    const requestCodeB = `OP_TESTB_${timestamp}`;

    // Create Outpass for Student A (linked to Parent A)
    const [opA] = await pool.query(`
      INSERT INTO outpass_requests (
        request_code, student_id, outpass_type, reason, destination,
        from_datetime, to_datetime, parent_approval_status, status
      ) VALUES (?, ?, 'normal', 'Family function', 'Coimbatore', '2026-09-10 09:00:00', '2026-09-10 18:00:00', 'pending', 'PENDING_PARENT')
    `, [requestCodeA, studentAId]);
    const outpassAId = opA.insertId;

    // Create Outpass for Student B (linked to Parent C)
    const [opB] = await pool.query(`
      INSERT INTO outpass_requests (
        request_code, student_id, outpass_type, reason, destination,
        from_datetime, to_datetime, parent_approval_status, status
      ) VALUES (?, ?, 'normal', 'Personal visit', 'Madurai', '2026-09-11 09:00:00', '2026-09-11 18:00:00', 'pending', 'PENDING_PARENT')
    `, [requestCodeB, studentBId]);
    const outpassBId = opB.insertId;

    // Query Parent A pending outpasses
    const pendA = await request('/api/parent/outpass/pending', {
      token: parentAToken
    });

    assert(pendA.status === 200, `Parent A pending requests fetched successfully (got ${pendA.status})`);
    const reqsA = pendA.data?.pendingRequests || [];
    const hasA = reqsA.some(r => r.requestCode === requestCodeA);
    const hasBInA = reqsA.some(r => r.requestCode === requestCodeB);
    assert(hasA, `Parent A sees their linked student's request (${requestCodeA})`);
    assert(!hasBInA, `Parent A does NOT see Student B's request (${requestCodeB})`);

    // Query Parent C pending outpasses
    const pendC = await request('/api/parent/outpass/pending', {
      token: parentCToken
    });

    assert(pendC.status === 200, `Parent C pending requests fetched successfully (got ${pendC.status})`);
    const reqsC = pendC.data?.pendingRequests || [];
    const hasBInC = reqsC.some(r => r.requestCode === requestCodeB);
    const hasAInC = reqsC.some(r => r.requestCode === requestCodeA);
    assert(hasBInC, `Parent C sees their linked student's request (${requestCodeB})`);
    assert(!hasAInC, `Parent C does NOT see Student A's request (${requestCodeA})`);
    console.log('');

    // ====================================================
    // TEST 8: Server-Side Authorization - Attempt to access/approve other student's request
    // ====================================================
    console.log('TEST 8: Security - Attempt to approve another student request');
    // Parent A tries to approve Student B's request (outpassBId)
    const unauthorizedApproval = await request(`/api/parent/outpass/${outpassBId}/approve`, {
      method: 'PATCH',
      token: parentAToken,
      body: { parent_message: 'Hacked approval attempt' }
    });

    assert(unauthorizedApproval.status === 403, `Unauthorized approval blocked with HTTP 403 (got ${unauthorizedApproval.status})`);
    assert(
      unauthorizedApproval.data?.message?.includes('not authorized'),
      `Security error message returned: "${unauthorizedApproval.data?.message}"`
    );

    // Parent A tries to reject Student B's request
    const unauthorizedReject = await request(`/api/parent/outpass/${outpassBId}/reject`, {
      method: 'PATCH',
      token: parentAToken,
      body: { rejection_reason: 'Malicious rejection attempt' }
    });

    assert(unauthorizedReject.status === 403, `Unauthorized rejection blocked with HTTP 403 (got ${unauthorizedReject.status})`);
    console.log('');

    // ====================================================
    // TEST 9: Repeated registration / linking duplicate protection
    // ====================================================
    console.log('TEST 9: Repeated registration & duplicate link protection');
    // Attempt to register again with same mobile and same student
    const dupReg = await request('/api/auth/register-parent', {
      method: 'POST',
      body: {
        parent_name: 'Muthu Raja',
        mobile: parentAPhone,
        relationship: 'Father',
        student_name: studentAName,
        student_roll_number: studentARoll,
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });

    assert(dupReg.status === 409, `Duplicate mobile registration rejected with HTTP 409 (got ${dupReg.status})`);
    assert(
      dupReg.data?.message?.includes('already exists'),
      `Clear duplicate notice returned: "${dupReg.data?.message}"`
    );

    // Profile update with invalid student roll number in updateParentProfile
    const badProfileUpdate = await request('/api/parent/profile', {
      method: 'PUT',
      token: parentAToken,
      body: {
        student_reg_no: 'INVALID_ROLL_999999'
      }
    });

    assert(badProfileUpdate.status === 400, `Invalid roll in profile update rejected with HTTP 400 (got ${badProfileUpdate.status})`);
    assert(
      badProfileUpdate.data?.message === 'Student Roll Number not found. Please enter a valid registered student Roll Number.',
      `Exact roll not found error returned on profile update: "${badProfileUpdate.data?.message}"`
    );
    console.log('');

    // ====================================================
    // TEST 10: Codebase search for hardcoded/demo student fallback logic
    // ====================================================
    console.log('TEST 10: Codebase search for hardcoded/demo student fallback in parent registration');
    const authControllerCode = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
    const parentControllerCode = fs.readFileSync(path.join(__dirname, '../controllers/parentController.js'), 'utf8');

    const hasDemoFallbackAuth = /registerParent[\s\S]*?(21CS042|demo.*student|fallback.*student|student_id\s*=\s*1\b)/i.test(authControllerCode);
    const hasPhantomStudent = /INSERT INTO students \(reg_no, name/i.test(parentControllerCode);

    assert(!hasDemoFallbackAuth, 'No hardcoded/demo student fallback found in registerParent');
    assert(!hasPhantomStudent, 'No phantom student insertion found in parentController');

    // Check parent-dashboard.html static linked student card
    const dashboardHtml = fs.readFileSync(path.join(__dirname, '../public/parent-dashboard.html'), 'utf8');
    const hasStaticJohnDoeInCard = /<span class="field-value" id="profStudentName">John Doe<\/span>/i.test(dashboardHtml);
    assert(!hasStaticJohnDoeInCard, 'No static "John Doe" default in profStudentName');

  } catch (err) {
    console.error('Test Execution Error:', err);
    failed++;
  } finally {
    // Cleanup created test records
    console.log('\nCleanup: Removing test records...');
    try {
      if (studentAId) await pool.query('DELETE FROM outpass_requests WHERE student_id = ?', [studentAId]);
      if (studentBId) await pool.query('DELETE FROM outpass_requests WHERE student_id = ?', [studentBId]);
      if (studentAId) await pool.query('DELETE FROM students WHERE id = ?', [studentAId]);
      if (studentBId) await pool.query('DELETE FROM students WHERE id = ?', [studentBId]);
      if (parentAId) await pool.query('DELETE FROM parents WHERE id = ?', [parentAId]);
      if (parentBId) await pool.query('DELETE FROM parents WHERE id = ?', [parentBId]);
      if (parentCId) await pool.query('DELETE FROM parents WHERE id = ?', [parentCId]);
      console.log('  Cleaned up test students, parents, and outpasses.');
    } catch (e) {
      console.warn('  Cleanup warning:', e.message);
    }
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
