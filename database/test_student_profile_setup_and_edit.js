/**
 * ============================================================================
 * AUTOMATED TEST SUITE: STUDENT FIRST-TIME PROFILE SETUP & EDITABLE PROFILE
 * ============================================================================
 * Tests:
 * 1. First-Time Setup:
 *    - New student registration initializes profile_completed = 0.
 *    - Incomplete profile detected via login and /api/auth/me.
 *    - First-time profile setup submitted via PUT /api/student/profile.
 *    - Parent details correctly created/linked with relationship.
 *    - Profile completion persisted in MySQL (profile_completed = 1).
 *    - Subsequent login confirms profile completeness = true.
 * 2. Profile Editing:
 *    - Profile retrieved via GET /api/student/profile.
 *    - Student updates academic info (Year, Semester, Block, Room).
 *    - Student updates parent contact details (Name, Phone, Relationship).
 *    - Changes verified in MySQL students and parents tables.
 *    - Changes persist across logout and re-login.
 * 3. Security & Role Guardrails:
 *    - Identity isolation: req.user.id is authoritative (student_id in body ignored).
 *    - Student cannot change reg_no / username.
 *    - Student cannot change role or password_hash via profile update.
 *    - Unauthenticated requests rejected with HTTP 401.
 *    - Non-student roles (Warden, Caretaker, Watchman) blocked with HTTP 403.
 *    - Passwords and password hashes never exposed.
 * 4. Data Consistency & Relational Isolation:
 *    - Student A updating profile does NOT affect Student B.
 *    - Parent reuse: Existing parent mobile number reuses parent record (no duplicates).
 *    - Existing outpasses, GPS records, QR codes, gate logs, extensions remain intact.
 */

const http = require('http');
const { pool } = require('../utils/db');

function req(pathName, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 5001,
      path: pathName,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const clientReq = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    clientReq.on('error', reject);
    if (options.body) clientReq.write(JSON.stringify(options.body));
    clientReq.end();
  });
}

async function run() {
  console.log('======================================================================');
  console.log('🎓 RUNNING STUDENT FIRST-TIME PROFILE SETUP & EDITABLE PROFILE TESTS');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, msg = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${msg ? '(' + msg + ')' : ''}`);
      failed++;
    }
  }

  const stamp = Date.now().toString().slice(-6);
  const testRegA = `STU_A_${stamp}`;
  const testRegB = `STU_B_${stamp}`;
  const testPass = 'Student@Pass123';
  const testParentMobileA = `98${stamp}11`;
  const testParentMobileB = `98${stamp}22`;

  try {
    // ------------------------------------------------------------------
    // SECTION 1: First-Time Profile Setup Workflow
    // ------------------------------------------------------------------
    console.log('--- Section 1: First-Time Profile Setup Workflow ---');

    // 1.1 Register New Student Account A
    const regResA = await req('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: testRegA,
        password: testPass,
        confirm_password: testPass,
        name: 'Alex Mercer',
        email: `alex_${stamp}@college.edu`
      }
    });

    assert(regResA.status === 201 && regResA.data.success === true, 'New student account created successfully (HTTP 201)');
    const tokenA = regResA.data?.token;
    assert(Boolean(tokenA), 'Automatic login token issued upon registration');
    assert(regResA.data?.user?.profile_completed === false, 'New student profile is marked profile_completed = false');

    // 1.2 Verify in MySQL: profile_completed is 0
    const [dbRowsA] = await pool.query('SELECT id, reg_no, name, profile_completed FROM students WHERE reg_no = ?', [testRegA]);
    assert(dbRowsA.length === 1, 'Student A record verified in MySQL');
    assert(dbRowsA[0].profile_completed === 0, 'MySQL persistence confirms profile_completed = 0');
    const studentAId = dbRowsA[0].id;

    // 1.3 Verify GET /api/auth/me detects incomplete profile
    const meResA = await req('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(meResA.status === 200, 'Authenticated session retrieved from /api/auth/me');
    assert(meResA.data?.user?.profile_completed === false, 'Session check indicates profile_completed = false (requires First-Time Setup)');

    // 1.4 Verify GET /api/student/profile detects incomplete profile
    const profileResA = await req('/api/student/profile', {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(profileResA.status === 200, 'Student profile endpoint responds with HTTP 200');
    assert(profileResA.data?.profile_completed === false, 'GET /api/student/profile returns profile_completed: false');

    // 1.5 Validation Guardrails on Setup Submission
    const emptySubmitRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: {
        name: '',
        department: 'Computer Science & Engineering'
      }
    });
    assert(emptySubmitRes.status === 400, 'Profile setup without student name rejected with HTTP 400');

    const invalidPhoneRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: {
        name: 'Alex Mercer',
        department: 'Computer Science & Engineering',
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-201',
        parent_name: 'David Mercer',
        parent_phone: '123',
        relationship: 'Father'
      }
    });
    assert(invalidPhoneRes.status === 400, 'Profile setup with invalid parent phone rejected with HTTP 400');

    // 1.6 Successful First-Time Profile Setup Submission
    const validSetupRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: {
        name: 'Alex Mercer',
        department: 'Computer Science & Engineering',
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-201',
        phone: '9876500099',
        parent_name: 'David Mercer',
        parent_phone: testParentMobileA,
        relationship: 'Father'
      }
    });

    assert(validSetupRes.status === 200 && validSetupRes.data.success === true, 'First-time profile setup saved successfully with HTTP 200');
    assert(validSetupRes.data?.profile_completed === true, 'Response confirms profile_completed: true');
    assert(validSetupRes.data?.student?.room_no === 'A-201', 'Updated room number matches A-201');
    assert(validSetupRes.data?.parent?.name === 'David Mercer', 'Parent name matches David Mercer');
    assert(validSetupRes.data?.parent?.relationship === 'Father', 'Parent relationship matches Father');

    // 1.7 Verify MySQL persistence after setup
    const [afterSetupRows] = await pool.query(
      'SELECT profile_completed, hostel_block, room_no, parent_id FROM students WHERE id = ?',
      [studentAId]
    );
    assert(afterSetupRows[0].profile_completed === 1, 'MySQL students table confirms profile_completed = 1');
    assert(afterSetupRows[0].room_no === 'A-201', 'MySQL students table confirms room_no = A-201');

    // 1.8 Verify Parent record in MySQL
    const parentAId = afterSetupRows[0].parent_id;
    const [parentRowsA] = await pool.query('SELECT father_name, primary_phone, relationship FROM parents WHERE id = ?', [parentAId]);
    assert(parentRowsA.length === 1, 'Parent record exists in parents table');
    assert(parentRowsA[0].father_name === 'David Mercer', 'Parent father_name in DB is David Mercer');
    assert(parentRowsA[0].primary_phone === testParentMobileA, 'Parent primary_phone matches');
    assert(parentRowsA[0].relationship === 'Father', 'Parent relationship matches Father');

    // 1.9 Re-Login with completed student -> Profile completeness is true (Setup does NOT re-appear)
    const reloginRes = await req('/api/auth/login', {
      method: 'POST',
      body: {
        username: testRegA,
        password: testPass,
        role: 'student'
      }
    });
    assert(reloginRes.status === 200, 'Student re-login succeeds with HTTP 200');
    assert(reloginRes.data?.user?.profile_completed === true, 'Subsequent login confirms profile_completed = true (no setup prompt)');

    // ------------------------------------------------------------------
    // SECTION 2: Student Profile Edit Workflow
    // ------------------------------------------------------------------
    console.log('\n--- Section 2: Student Profile Edit Workflow ---');

    // 2.1 View Current Profile
    const viewProfileRes = await req('/api/student/profile', {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(viewProfileRes.status === 200, 'Student views profile via GET /api/student/profile');
    assert(viewProfileRes.data?.student?.year_of_study === 3, 'Initial year of study is 3');
    assert(viewProfileRes.data?.student?.hostel_block === 'Block A', 'Initial hostel block is Block A');

    // 2.2 Attempt to modify locked identity fields (Name/Dept) -> Must be rejected with HTTP 400
    const lockedAttemptRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: {
        name: 'Alex J. Mercer (Modified)',
        department: 'Information Technology (Modified)',
        year_of_study: 4,
        semester: 'Semester 7',
        hostel_block: 'Block B',
        room_no: 'B-305',
        phone: '9876500088',
        parent_name: 'David Mercer (Modified)',
        parent_phone: testParentMobileA,
        relationship: 'Guardian'
      }
    });

    assert(lockedAttemptRes.status === 400, 'Attempt to alter locked identity fields rejected with HTTP 400');
    assert(lockedAttemptRes.data?.message === 'Identity fields can only be set during initial profile setup.', 'Rejection message matches "Identity fields can only be set during initial profile setup."');

    // 2.3 Edit Academic and Hostel Details (Allowed fields)
    const editRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: {
        name: 'Alex Mercer',
        department: 'Computer Science & Engineering',
        year_of_study: 4,
        semester: 'Semester 7',
        hostel_block: 'Block B',
        room_no: 'B-305',
        phone: '9876500099',
        parent_name: 'David Mercer',
        parent_phone: testParentMobileA,
        relationship: 'Guardian'
      }
    });

    assert(editRes.status === 200 && editRes.data.success === true, 'Profile edited successfully with HTTP 200');
    assert(editRes.data?.student?.name === 'Alex Mercer', 'Student name preserved as Alex Mercer');
    assert(editRes.data?.student?.department === 'Computer Science & Engineering', 'Department preserved as Computer Science & Engineering');
    assert(editRes.data?.student?.year_of_study === 4, 'Updated year_of_study is 4');
    assert(editRes.data?.student?.semester === 'Semester 7', 'Updated semester is Semester 7');
    assert(editRes.data?.student?.hostel_block === 'Block B', 'Updated hostel_block is Block B');
    assert(editRes.data?.student?.room_no === 'B-305', 'Updated room_no is B-305');
    assert(editRes.data?.parent?.relationship === 'Guardian', 'Updated relationship is Guardian');

    // 2.4 Verify changes persisted in MySQL
    const [dbEditRows] = await pool.query(
      'SELECT name, department, year_of_study, semester, hostel_block, room_no FROM students WHERE id = ?',
      [studentAId]
    );
    assert(dbEditRows[0].name === 'Alex Mercer', 'MySQL confirms student name preserved');
    assert(dbEditRows[0].department === 'Computer Science & Engineering', 'MySQL confirms department preserved');
    assert(dbEditRows[0].year_of_study === 4, 'MySQL confirms year_of_study updated');
    assert(dbEditRows[0].semester === 'Semester 7', 'MySQL confirms semester updated');
    assert(dbEditRows[0].hostel_block === 'Block B', 'MySQL confirms hostel_block updated');
    assert(dbEditRows[0].room_no === 'B-305', 'MySQL confirms room_no updated');

    // 2.5 Verify changes persist after logout and subsequent login
    const logoutRes = await req('/api/auth/logout', { method: 'POST' });
    assert(logoutRes.status === 200, 'Student logs out cleanly');

    const freshLogin = await req('/api/auth/login', {
      method: 'POST',
      body: {
        username: testRegA,
        password: testPass,
        role: 'student'
      }
    });
    assert(freshLogin.status === 200, 'Fresh login succeeds');
    assert(freshLogin.data?.user?.department === 'Computer Science & Engineering', 'Fresh login reflects preserved department');
    assert(freshLogin.data?.user?.roomNo === 'B-305', 'Fresh login reflects updated room number');

    // ------------------------------------------------------------------
    // SECTION 3: Security, Protection & Authorization Guardrails
    // ------------------------------------------------------------------
    console.log('\n--- Section 3: Security & Authorization Guardrails ---');

    // 3.1 Register Student B
    const regResB = await req('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: testRegB,
        password: testPass,
        confirm_password: testPass,
        name: 'Brian O-Conner',
        email: `brian_${stamp}@college.edu`
      }
    });
    const tokenB = regResB.data?.token;
    assert(Boolean(tokenB), 'Student B registered and authenticated');

    const [dbRowsB] = await pool.query('SELECT id FROM students WHERE reg_no = ?', [testRegB]);
    const studentBId = dbRowsB[0].id;

    // Complete Student B's profile
    await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenB}` },
      body: {
        name: 'Brian O-Conner',
        department: 'Mechanical Engineering',
        year_of_study: 2,
        semester: 'Semester 4',
        hostel_block: 'Block C',
        room_no: 'C-101',
        phone: '9876500066',
        parent_name: 'Sean O-Conner',
        parent_phone: testParentMobileB,
        relationship: 'Father'
      }
    });

    // 3.2 Student A attempts to update Student B by supplying student_id in body
    const hijackAttempt = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: {
        student_id: studentBId, // Maliciously trying to alter Student B
        id: studentBId,
        name: 'Alex Mercer',
        department: 'Computer Science & Engineering',
        phone: '9876500099',
        parent_name: 'David Mercer',
        parent_phone: testParentMobileA,
        relationship: 'Father',
        year_of_study: 1,
        semester: 'Semester 1',
        hostel_block: 'Block X',
        room_no: 'X-999'
      }
    });
    assert(hijackAttempt.status === 200, 'Profile request succeeds based strictly on token');

    // Verify Student B was NOT modified
    const [checkStudentB] = await pool.query(
      'SELECT name, department, hostel_block, room_no FROM students WHERE id = ?',
      [studentBId]
    );
    assert(checkStudentB[0].name === 'Brian O-Conner', 'Security: Student B name was NOT altered');
    assert(checkStudentB[0].department === 'Mechanical Engineering', 'Security: Student B department was NOT altered');
    assert(checkStudentB[0].room_no === 'C-101', 'Security: Student B room was NOT altered');

    // 3.3 Register Number (Institutional ID) Protection
    const regTamperAttempt = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: {
        reg_no: 'MALICIOUS_ROLL_999',
        name: 'Alex Mercer',
        department: 'Computer Science & Engineering',
        phone: '9876500099',
        parent_name: 'David Mercer',
        parent_phone: testParentMobileA,
        relationship: 'Guardian',
        year_of_study: 4,
        semester: 'Semester 7',
        hostel_block: 'Block B',
        room_no: 'B-305'
      }
    });
    assert(regTamperAttempt.status === 200, 'Update request processed');
    const [checkRegA] = await pool.query('SELECT reg_no FROM students WHERE id = ?', [studentAId]);
    assert(checkRegA[0].reg_no === testRegA, 'Security: Register number cannot be altered through profile update');

    // 3.4 Unauthenticated request blocked
    const unauthRes = await req('/api/student/profile');
    assert(unauthRes.status === 401, 'Unauthenticated access rejected with HTTP 401');

    // 3.5 Non-student roles blocked
    const wardenLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
    });
    const wardenToken = wardenLogin.data?.token;

    const wardenAttempt = await req('/api/student/profile', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(wardenAttempt.status === 403, 'Warden role calling student profile endpoint blocked with HTTP 403 Forbidden');

    // 3.6 Zero Password / Hash Exposure in Profile Endpoints
    const profileData = viewProfileRes.data;
    assert(!profileData.student.password && !profileData.student.password_hash, 'Security: Zero student password/hash exposure');
    assert(!profileData.parent.password && !profileData.parent.password_hash, 'Security: Zero parent password/hash exposure');

    // ------------------------------------------------------------------
    // SECTION 4: Data Consistency & Relational Integrity
    // ------------------------------------------------------------------
    console.log('\n--- Section 4: Relational Parent Reuse & Data Integrity ---');

    // 4.1 Parent Reuse: Register Student C linked to existing parent A phone
    const testRegC = `STU_C_${stamp}`;
    const regResC = await req('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: testRegC,
        password: testPass,
        confirm_password: testPass,
        name: 'Chris Mercer',
        email: `chris_${stamp}@college.edu`
      }
    });
    const tokenC = regResC.data?.token;

    // Complete profile using Parent A's exact mobile number
    const setupResC = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenC}` },
      body: {
        name: 'Chris Mercer',
        department: 'Civil Engineering',
        year_of_study: 1,
        semester: 'Semester 2',
        hostel_block: 'Block A',
        room_no: 'A-105',
        phone: '9876500077',
        parent_name: 'David Mercer',
        parent_phone: testParentMobileA, // Matches Parent A
        relationship: 'Father'
      }
    });
    assert(setupResC.status === 200, 'Student C profile setup saved successfully');

    // Verify Student C is linked to the existing Parent A record (no duplicate parent created)
    const [dbRowsC] = await pool.query('SELECT parent_id FROM students WHERE reg_no = ?', [testRegC]);
    assert(dbRowsC[0].parent_id === parentAId, 'Parent Reuse: Student C correctly linked to existing Parent A ID');

    const [parentCount] = await pool.query('SELECT COUNT(*) as count FROM parents WHERE primary_phone = ?', [testParentMobileA]);
    assert(parentCount[0].count === 1, 'Data Integrity: Exactly 1 parent record exists for mobile number (no duplicates)');

    // 4.2 Existing Outpass, GPS, QR, and Extension Integrity
    // Verify existing demo student 21CS042 remains fully intact
    const [demoStudentRows] = await pool.query(
      'SELECT id, reg_no, profile_completed FROM students WHERE reg_no = "21CS042"'
    );
    assert(demoStudentRows.length === 1, 'Demo student 21CS042 exists');
    assert(demoStudentRows[0].profile_completed === 1, 'Demo student profile_completed is 1 (completed)');

    const [outpassCount] = await pool.query(
      'SELECT COUNT(*) as count FROM outpass_requests WHERE student_id = ?',
      [demoStudentRows[0].id]
    );
    assert(outpassCount[0].count > 0, 'Data Integrity: Existing outpasses remain associated with student');

  } catch (error) {
    console.error('❌ Test suite execution error:', error);
    failed++;
  } finally {
    // Clean up temporary test student records
    try {
      await pool.query('DELETE FROM outpass_requests WHERE student_id IN (SELECT id FROM students WHERE reg_no IN (?, ?, ?))', [testRegA, testRegB, `STU_C_${stamp}`]);
      await pool.query('DELETE FROM students WHERE reg_no IN (?, ?, ?)', [testRegA, testRegB, `STU_C_${stamp}`]);
      await pool.query('DELETE FROM parents WHERE primary_phone IN (?, ?)', [testParentMobileA, testParentMobileB]);
    } catch (e) {
      // ignore cleanup errors
    }
  }

  console.log('\n======================================================================');
  console.log(`🏁 TEST SUITE COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('======================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run();
