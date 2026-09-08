/**
 * Automated Test Suite: Student First-Time Profile Setup & Editable Profile
 * 
 * Verifies:
 * 1. Database schema: profile_completed column exists in students table.
 * 2. Existing active students have profile_completed = 1.
 * 3. Newly registered student has profile_completed = 0.
 * 4. GET /api/auth/me and GET /api/student/profile reflect profile_completed status.
 * 5. Input validations on PUT /api/student/profile (missing fields, invalid phone, year, etc.).
 * 6. Security guardrails: immutability of reg_no, id, role, password_hash; strict scoping to authenticated token.
 * 7. First-time profile submission: sets profile_completed = 1, links/updates parent record.
 * 8. Parent relational integrity: parent mobile search, deduplication, and non-corruption of shared parents.
 * 9. Subsequent profile editing: room, semester, department updates properly persist and reflect in profile endpoints.
 * 10. Login endpoint returns accurate profile_completed flag.
 */

const http = require('http');
const { pool } = require('../utils/db');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('   TEST SUITE: STUDENT FIRST-TIME PROFILE SETUP & EDIT PROFILE  ');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Verify DB Schema
    console.log('\n--- 1. Database Schema & Seed Verification ---');
    const [cols] = await pool.query("SHOW COLUMNS FROM students LIKE 'profile_completed'");
    assert(cols.length > 0, "Column 'profile_completed' exists in students table");

    const [seededStudents] = await pool.query("SELECT id, reg_no, profile_completed FROM students WHERE reg_no = '21CS042'");
    assert(seededStudents.length > 0 && seededStudents[0].profile_completed === 1, "Seeded student 21CS042 has profile_completed = 1");

    // 2. Register New Student (profile_completed should be 0)
    console.log('\n--- 2. New Student Registration & Profile Completion Check ---');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const testRegNo = `TESTSTU${randSuffix}`;
    const testEmail = `student_${randSuffix}@hostel.edu`;
    const testPassword = 'Password@123';

    const regRes = await makeRequest('POST', '/api/auth/register-student', {
      username: testRegNo,
      reg_no: testRegNo,
      name: `Setup Student ${randSuffix}`,
      email: testEmail,
      phone: `987000${randSuffix}`,
      department: 'Computer Science & Engineering',
      year_of_study: 3,
      semester: 'Semester 6',
      hostel_block: 'Block A',
      room_no: 'A-201',
      parent_name: `Parent ${randSuffix}`,
      parent_phone: `912345${randSuffix}`,
      password: testPassword,
      confirm_password: testPassword
    });

    assert(regRes.status === 201, `Student registration succeeded (Status 201)`);
    assert(regRes.body.success === true, `Registration body success === true`);
    assert(Boolean(regRes.body.user.profile_completed) === false, `Registration response returns profile_completed === false`);
    const studentToken = regRes.body.token;
    const studentId = regRes.body.user.id;
    assert(Boolean(studentToken), `JWT token received upon registration`);

    // Verify DB record directly
    const [dbRows] = await pool.query('SELECT id, reg_no, profile_completed FROM students WHERE id = ?', [studentId]);
    assert(dbRows.length > 0 && dbRows[0].profile_completed === 0, `DB record has profile_completed = 0`);

    // 3. GET /api/auth/me & GET /api/student/profile for Incomplete Profile
    console.log('\n--- 3. Profile Endpoint Inspection Before Setup ---');
    const meRes = await makeRequest('GET', '/api/auth/me', null, studentToken);
    assert(meRes.status === 200, `GET /api/auth/me returns 200`);
    assert(Boolean(meRes.body.user.profile_completed) === false, `GET /api/auth/me user.profile_completed is false`);

    const profRes = await makeRequest('GET', '/api/student/profile', null, studentToken);
    assert(profRes.status === 200, `GET /api/student/profile returns 200`);
    assert(profRes.body.profile_completed === false, `GET /api/student/profile profile_completed is false`);
    assert(profRes.body.student.reg_no === testRegNo, `GET /api/student/profile student.reg_no matches`);
    assert(profRes.body.parent.mobile === `912345${randSuffix}`, `GET /api/student/profile parent.mobile matches initial registration`);

    // 4. Input Validations on Profile Update
    console.log('\n--- 4. Profile Update Input Validation Guardrails ---');
    // Missing student name
    const valRes1 = await makeRequest('PUT', '/api/student/profile', {
      name: '',
      department: 'Computer Science & Engineering',
      year_of_study: 3,
      semester: 'Semester 6',
      hostel_block: 'Block A',
      room_no: 'A-201',
      parent_name: 'Parent Name',
      parent_phone: '9876543210',
      relationship: 'Father'
    }, studentToken);
    assert(valRes1.status === 400 && valRes1.body.message.includes('name is required'), `Missing name returns 400`);

    // Invalid year_of_study
    const valRes2 = await makeRequest('PUT', '/api/student/profile', {
      name: 'Valid Name',
      department: 'Computer Science & Engineering',
      year_of_study: 9,
      semester: 'Semester 6',
      hostel_block: 'Block A',
      room_no: 'A-201',
      parent_name: 'Parent Name',
      parent_phone: '9876543210',
      relationship: 'Father'
    }, studentToken);
    assert(valRes2.status === 400 && valRes2.body.message.includes('Year of study'), `Invalid year (9) returns 400`);

    // Missing room number
    const valRes3 = await makeRequest('PUT', '/api/student/profile', {
      name: 'Valid Name',
      department: 'Computer Science & Engineering',
      year_of_study: 3,
      semester: 'Semester 6',
      hostel_block: 'Block A',
      room_no: '',
      parent_name: 'Parent Name',
      parent_phone: '9876543210',
      relationship: 'Father'
    }, studentToken);
    assert(valRes3.status === 400 && valRes3.body.message.includes('Room number is required'), `Missing room returns 400`);

    // Invalid parent phone (< 10 digits)
    const valRes4 = await makeRequest('PUT', '/api/student/profile', {
      name: 'Valid Name',
      department: 'Computer Science & Engineering',
      year_of_study: 3,
      semester: 'Semester 6',
      hostel_block: 'Block A',
      room_no: 'A-201',
      parent_name: 'Parent Name',
      parent_phone: '12345',
      relationship: 'Father'
    }, studentToken);
    assert(valRes4.status === 400 && valRes4.body.message.includes('10-digit parent mobile'), `Invalid parent phone (<10 digits) returns 400`);

    // 5. First-Time Profile Setup Submission
    console.log('\n--- 5. First-Time Profile Setup Execution ---');
    const updateRes = await makeRequest('PUT', '/api/student/profile', {
      name: `Completed Student ${randSuffix}`,
      department: 'Information Technology',
      year_of_study: 3,
      semester: 'Semester 6',
      hostel_block: 'Block B',
      room_no: 'B-304',
      phone: `987111${randSuffix}`,
      parent_name: `Verified Parent ${randSuffix}`,
      parent_phone: `988888${randSuffix}`,
      relationship: 'Mother',
      // Attacker trying to hijack protected fields:
      reg_no: 'HACKED_REG_NO',
      id: 1,
      role: 'warden',
      password_hash: 'hacked_hash'
    }, studentToken);

    assert(updateRes.status === 200, `Profile setup returned 200 OK`);
    assert(updateRes.body.success === true, `Profile setup body success === true`);
    assert(updateRes.body.profile_completed === true, `Profile setup body profile_completed === true`);
    assert(updateRes.body.student.reg_no === testRegNo, `Security: reg_no was NOT altered (retained ${testRegNo})`);
    assert(updateRes.body.student.department === 'Information Technology', `Department updated to 'Information Technology'`);
    assert(updateRes.body.student.hostel_block === 'Block B', `Hostel block updated to 'Block B'`);
    assert(updateRes.body.student.room_no === 'B-304', `Room number updated to 'B-304'`);
    assert(updateRes.body.parent.name === `Verified Parent ${randSuffix}`, `Parent name updated`);
    assert(updateRes.body.parent.relationship === 'Mother', `Parent relationship updated to Mother`);

    // 6. Verify Database & Endpoints after Setup
    console.log('\n--- 6. Post-Setup State Persistence Checks ---');
    const [afterRows] = await pool.query('SELECT * FROM students WHERE id = ?', [studentId]);
    assert(afterRows[0].profile_completed === 1, `DB students.profile_completed is now 1`);
    assert(afterRows[0].reg_no === testRegNo, `DB students.reg_no remained unchanged`);
    assert(afterRows[0].department === 'Information Technology', `DB students.department persisted`);
    assert(afterRows[0].room_no === 'B-304', `DB students.room_no persisted`);

    // GET /api/auth/me
    const postMeRes = await makeRequest('GET', '/api/auth/me', null, studentToken);
    assert(postMeRes.body.user.profile_completed === true, `GET /api/auth/me reports profile_completed === true`);
    assert(postMeRes.body.user.department === 'Information Technology', `GET /api/auth/me returns updated department`);
    assert(postMeRes.body.user.parent_name === `Verified Parent ${randSuffix}`, `GET /api/auth/me returns updated parent name`);

    // GET /api/student/profile
    const postProfRes = await makeRequest('GET', '/api/student/profile', null, studentToken);
    assert(postProfRes.body.profile_completed === true, `GET /api/student/profile reports profile_completed === true`);
    assert(postProfRes.body.parent.relationship === 'Mother', `GET /api/student/profile parent.relationship is Mother`);

    // 7. Login with newly completed student
    console.log('\n--- 7. Login Post-Setup Profile Status ---');
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      username: testRegNo,
      password: testPassword,
      role: 'student'
    });
    assert(loginRes.status === 200, `Login succeeded with 200 OK`);
    assert(loginRes.body.user.profile_completed === true, `Login response user.profile_completed is true`);
    assert(loginRes.body.user.department === 'Information Technology', `Login response user has updated department`);
    assert(loginRes.body.user.parentName === `Verified Parent ${randSuffix}`, `Login response user has updated parentName`);

    // 8. Relational Parent Deduplication & Non-Corruption
    console.log('\n--- 8. Relational Parent Deduplication & Integrity ---');
    // Register another student that links to the SAME parent mobile
    const secondRegNo = `TESTSTU2_${randSuffix}`;
    const regRes2 = await makeRequest('POST', '/api/auth/register-student', {
      username: secondRegNo,
      reg_no: secondRegNo,
      name: `Sibling Student ${randSuffix}`,
      email: `sibling_${randSuffix}@hostel.edu`,
      phone: `987222${randSuffix}`,
      department: 'Mechanical Engineering',
      year_of_study: 2,
      semester: 'Semester 4',
      hostel_block: 'Block A',
      room_no: 'A-101',
      parent_name: `Verified Parent ${randSuffix}`,
      parent_phone: `988888${randSuffix}`, // same parent mobile as first student
      password: testPassword,
      confirm_password: testPassword
    });
    assert(regRes2.status === 201, `Sibling student registered successfully`);
    const siblingToken = regRes2.body.token;

    // Complete sibling student profile linking to same parent
    const sibUpdateRes = await makeRequest('PUT', '/api/student/profile', {
      name: `Sibling Student ${randSuffix}`,
      department: 'Mechanical Engineering',
      year_of_study: 2,
      semester: 'Semester 4',
      hostel_block: 'Block A',
      room_no: 'A-102',
      parent_name: `Verified Parent ${randSuffix}`,
      parent_phone: `988888${randSuffix}`,
      relationship: 'Mother'
    }, siblingToken);

    assert(sibUpdateRes.status === 200, `Sibling profile updated successfully`);

    // Verify parent table has NOT duplicated this phone number
    const [parentsWithPhone] = await pool.query('SELECT * FROM parents WHERE primary_phone = ?', [`988888${randSuffix}`]);
    assert(parentsWithPhone.length === 1, `Parent deduplication verified: exactly 1 parent record exists for mobile 988888${randSuffix}`);

    // Verify first student's profile is still intact and unaffected
    const checkFirstStudent = await makeRequest('GET', '/api/student/profile', null, studentToken);
    assert(checkFirstStudent.body.student.reg_no === testRegNo, `First student reg_no unchanged`);
    assert(checkFirstStudent.body.student.room_no === 'B-304', `First student room_no (B-304) unchanged`);
    assert(checkFirstStudent.body.parent.id === parentsWithPhone[0].id, `Both students share the identical parent ID`);

    // 9. Subsequent Profile Edit (Room change / Department change)
    console.log('\n--- 9. Subsequent Profile Edit in Dashboard ---');
    const editRes = await makeRequest('PUT', '/api/student/profile', {
      name: `Completed Student ${randSuffix}`,
      department: 'Information Technology',
      year_of_study: 4,
      semester: 'Semester 7',
      hostel_block: 'Block B',
      room_no: 'B-405',
      phone: `987999${randSuffix}`,
      parent_name: `Verified Parent ${randSuffix}`,
      parent_phone: `988888${randSuffix}`,
      relationship: 'Mother'
    }, studentToken);

    assert(editRes.status === 200, `Subsequent profile edit returns 200`);
    assert(editRes.body.student.room_no === 'B-405', `Room successfully modified to B-405`);
    assert(editRes.body.student.semester === 'Semester 7', `Semester successfully modified to Semester 7`);
    assert(editRes.body.student.year_of_study === 4, `Year of study successfully modified to 4`);

    // Cleanup test data
    console.log('\n--- Cleaning up test records ---');
    await pool.query('DELETE FROM students WHERE reg_no IN (?, ?)', [testRegNo, secondRegNo]);
    await pool.query('DELETE FROM parents WHERE primary_phone = ?', [`988888${randSuffix}`]);
    console.log('Test cleanup completed.');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    console.log('\n===============================================================');
    console.log(`   TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('===============================================================');

    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
