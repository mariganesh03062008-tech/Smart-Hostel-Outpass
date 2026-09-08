// database/test_student_module_audit.js
const http = require('http');
const { pool } = require('../utils/db');
require('dotenv').config();

console.log('======================================================================');
console.log('🔍 SMART HOSTEL OUTPASS – STUDENT MODULE AUDIT TEST SUITE');
console.log('======================================================================');

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
    if (options.body) {
      clientReq.write(JSON.stringify(options.body));
    }
    clientReq.end();
  });
}

async function runAudit() {
  const auditResults = {};
  let passCount = 0;
  let failCount = 0;

  function record(testName, isPass, details = '') {
    if (isPass) {
      passCount++;
      console.log(`  ✅ PASS: ${testName} ${details ? '(' + details + ')' : ''}`);
    } else {
      failCount++;
      console.log(`  ❌ FAIL: ${testName} ${details ? '--> ' + details : ''}`);
    }
    auditResults[testName] = { pass: isPass, details };
  }

  // --- 1. Authentication ---
  console.log('\n--- 1. Authentication & Session ---');
  const loginRes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  record('Student Login with Valid Credentials', loginRes.status === 200 && loginRes.data?.success && !!loginRes.data?.token);
  const studentToken = loginRes.data?.token;

  const badPassRes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'WrongPassword', role: 'student' }
  });
  record('Student Login with Invalid Password (HTTP 401)', badPassRes.status === 401);

  const roleMismatchRes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'warden' }
  });
  record('Student Login Role Mismatch Rejection (HTTP 401)', roleMismatchRes.status === 401);

  const meRes = await req('/api/auth/me', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  record('Protected Session Profile (/api/auth/me)', meRes.status === 200 && meRes.data?.user?.reg_no === '21CS042');

  // --- 2. Account Creation (Registration) ---
  console.log('\n--- 2. Student Account Creation ---');
  const uniqueId = Date.now().toString().slice(-5);
  const newStudentUsername = `AUDIT_${uniqueId}`;
  const regRes = await req('/api/auth/register-student', {
    method: 'POST',
    body: {
      name: `Audit Student ${uniqueId}`,
      username: newStudentUsername,
      email: `audit_${uniqueId}@college.edu`,
      phone: '9876500001',
      department: 'Computer Science & Engineering',
      year_of_study: 3,
      hostel_block: 'Block A',
      room_no: 'A-101',
      parent_name: 'Audit Parent',
      parent_phone: '9876500002',
      password: 'Password@123',
      confirm_password: 'Password@123'
    }
  });
  record('Student Registration Success (HTTP 201/200)', (regRes.status === 200 || regRes.status === 201) && regRes.data?.success && !!regRes.data?.token);
  const newStudentToken = regRes.data?.token;

  // Test duplicate username
  const dupRegRes = await req('/api/auth/register-student', {
    method: 'POST',
    body: {
      name: `Audit Student Dup`,
      username: newStudentUsername,
      email: `dup_${uniqueId}@college.edu`,
      phone: '9876500003',
      department: 'Computer Science & Engineering',
      year_of_study: 3,
      hostel_block: 'Block A',
      room_no: 'A-102',
      parent_name: 'Audit Parent Dup',
      parent_phone: '9876500004',
      password: 'Password@123',
      confirm_password: 'Password@123'
    }
  });
  record('Duplicate Username Rejection (HTTP 400/409)', dupRegRes.status === 400 || dupRegRes.status === 409);

  // --- 3. Profile Setup & Identity Lock ---
  console.log('\n--- 3. Profile Setup & Identity Lock ---');
  // First-time profile setup
  const firstSetupRes = await req('/api/student/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newStudentToken}` },
    body: {
      name: `Verified Student ${uniqueId}`,
      department: 'Information Technology',
      phone: '9876500001',
      parent_name: 'Verified Parent Name',
      parent_phone: '9876500002',
      year_of_study: 3,
      semester: 'Semester 6',
      hostel_block: 'Block A',
      room_no: 'A-101',
      relationship: 'Father'
    }
  });
  record('First-Time Profile Setup Saves & Sets profile_completed = 1 (HTTP 200)', firstSetupRes.status === 200 && firstSetupRes.data?.profile_completed === true);

  const getProfRes = await req('/api/student/profile', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${newStudentToken}` }
  });
  record('Retrieve Student Profile (/api/student/profile)', getProfRes.status === 200 && getProfRes.data?.student?.reg_no === newStudentUsername);

  // Attempt to modify locked Student Name
  const lockNameRes = await req('/api/student/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newStudentToken}` },
    body: { name: 'Attempted Altered Name' }
  });
  record('Identity Lock: Block alteration of Student Name (HTTP 400)', lockNameRes.status === 400, lockNameRes.data?.message);

  // Attempt to modify locked Department
  const lockDeptRes = await req('/api/student/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newStudentToken}` },
    body: { department: 'Mechanical Engineering' }
  });
  record('Identity Lock: Block alteration of Department (HTTP 400)', lockDeptRes.status === 400, lockDeptRes.data?.message);

  // Attempt to modify locked Student Mobile
  const lockPhoneRes = await req('/api/student/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newStudentToken}` },
    body: { phone: '9999999999' }
  });
  record('Identity Lock: Block alteration of Student Mobile (HTTP 400)', lockPhoneRes.status === 400, lockPhoneRes.data?.message);

  // Attempt to modify locked Parent Name
  const lockParentNameRes = await req('/api/student/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newStudentToken}` },
    body: { parent_name: 'Fake Parent Name' }
  });
  record('Identity Lock: Block alteration of Parent Name (HTTP 400)', lockParentNameRes.status === 400, lockParentNameRes.data?.message);

  // Attempt to modify locked Parent Mobile
  const lockParentPhoneRes = await req('/api/student/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newStudentToken}` },
    body: { parent_phone: '9999900000' }
  });
  record('Identity Lock: Block alteration of Parent Mobile (HTTP 400)', lockParentPhoneRes.status === 400, lockParentPhoneRes.data?.message);

  // Update allowed editable fields (Year, Sem, Block, Room, Relationship)
  const editAllowedRes = await req('/api/student/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newStudentToken}` },
    body: {
      year_of_study: 4,
      semester: 'Semester 7',
      hostel_block: 'Block C',
      room_no: 'C-305',
      relationship: 'Mother'
    }
  });
  record('Allowed Fields Update (Year, Sem, Block, Room) succeeds (HTTP 200)', editAllowedRes.status === 200 && editAllowedRes.data?.success);

  // --- 4. Student Live GPS Location Security ---
  console.log('\n--- 4. Student Live GPS Location Security ---');
  // Valid GPS upload
  const gpsValidRes = await req('/api/outpass/student/location', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      latitude: 11.3410,
      longitude: 77.7172,
      accuracy: 12,
      captured_at: new Date().toISOString(),
      source: 'browser_gps'
    }
  });
  record('Valid Student GPS Location Recording (HTTP 200)', gpsValidRes.status === 200 && gpsValidRes.data?.success);

  // Invalid Latitude (>90)
  const gpsBadLatRes = await req('/api/outpass/student/location', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      latitude: 115.0,
      longitude: 77.7172,
      accuracy: 12
    }
  });
  record('Invalid Latitude (>90) Rejected (HTTP 400)', gpsBadLatRes.status === 400);

  // Invalid Accuracy (<=0)
  const gpsBadAccRes = await req('/api/outpass/student/location', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      latitude: 11.3410,
      longitude: 77.7172,
      accuracy: -5
    }
  });
  record('Invalid Accuracy (<=0) Rejected (HTTP 400)', gpsBadAccRes.status === 400);

  // Freshness check
  const gpsFreshRes = await req('/api/outpass/student/location', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  record('Student Location Freshness Evaluated (isFresh: true)', gpsFreshRes.status === 200 && gpsFreshRes.data?.isFresh === true);

  // Check no hardcoded fallback coords in studentController or outpassController
  const fs = require('fs');
  const outpassCtrlCode = fs.readFileSync('controllers/outpassController.js', 'utf8');
  const parentCtrlCode = fs.readFileSync('controllers/parentController.js', 'utf8');
  const hasHardcodedFallback = outpassCtrlCode.includes('11.0168') || parentCtrlCode.includes('76.9558') || parentCtrlCode.includes('defaultCoords');
  record('Zero Hardcoded Fallback GPS in Backend Controllers', !hasHardcodedFallback);

  // --- 4.1 Mandatory Student Location Security Enforcement ---
  console.log('\n--- 4.1 Mandatory Student Location Security Enforcement (LOCATION REQUIRED) ---');

  const auditStudentId = meRes.data?.user?.id;

  const getOutpassCount = async () => {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM outpass_requests WHERE student_id = ?', [auditStudentId]);
    return Number(rows[0].total);
  };

  const validDepTime = new Date(Date.now() + 24 * 3600 * 1000);
  const validRetTime = new Date(Date.now() + 48 * 3600 * 1000);
  const validDepDateStr = validDepTime.toISOString().split('T')[0];
  const validDepTimeStr = validDepTime.toTimeString().slice(0, 5);
  const validRetDateStr = validRetTime.toISOString().split('T')[0];
  const validRetTimeStr = validRetTime.toTimeString().slice(0, 5);

  const baseOutpassPayload = {
    request_type: 'normal',
    destination: 'Location Security Test',
    reason: 'Testing Mandatory GPS',
    student_phone: '9876543210',
    leaving_date: validDepDateStr,
    leaving_time: validDepTimeStr,
    expected_return_date: validRetDateStr,
    expected_return_time: validRetTimeStr
  };

  // 1. Student GPS valid -> outpass submission ALLOWED
  await pool.query(`
    INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
    VALUES (?, 11.3410, 77.7172, 15, NOW(), 'browser_gps')
    ON DUPLICATE KEY UPDATE latitude = 11.3410, longitude = 77.7172, accuracy = 15, captured_at = NOW(), source = 'browser_gps'
  `, [auditStudentId]);

  const countBeforeValid = await getOutpassCount();
  const validLocRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: baseOutpassPayload
  });
  const countAfterValid = await getOutpassCount();
  record(
    'Location Required: 1. Student GPS Valid -> Outpass Submission Allowed (HTTP 201)',
    validLocRes.status === 201 && validLocRes.data?.success === true && countAfterValid === countBeforeValid + 1
  );

  // 2. Student GPS missing -> submission BLOCKED
  await pool.query('DELETE FROM student_locations WHERE student_id = ?', [auditStudentId]);
  const countBeforeMissing = await getOutpassCount();
  const missingLocRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: baseOutpassPayload
  });
  const countAfterMissing = await getOutpassCount();
  record(
    'Location Required: 2. Student GPS Missing -> Submission Blocked (HTTP 400, STUDENT_LOCATION_REQUIRED)',
    missingLocRes.status === 400 && missingLocRes.data?.code === 'STUDENT_LOCATION_REQUIRED' && countAfterMissing === countBeforeMissing
  );

  // 3. Student GPS stale (> 5 minutes) -> submission BLOCKED
  await pool.query(`
    INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, updated_at, source)
    VALUES (?, 11.3410, 77.7172, 15, NOW() - INTERVAL 10 MINUTE, NOW() - INTERVAL 10 MINUTE, 'browser_gps')
  `, [auditStudentId]);
  const countBeforeStale = await getOutpassCount();
  const staleLocRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: baseOutpassPayload
  });
  const countAfterStale = await getOutpassCount();
  record(
    'Location Required: 3. Student GPS Stale (>5 min) -> Submission Blocked (HTTP 400, STUDENT_LOCATION_REQUIRED)',
    staleLocRes.status === 400 && staleLocRes.data?.code === 'STUDENT_LOCATION_REQUIRED' && countAfterStale === countBeforeStale
  );

  // 4. Student GPS invalid coordinates -> submission BLOCKED
  await pool.query(`
    UPDATE student_locations
    SET latitude = 150.0000, longitude = 200.0000, accuracy = 15, captured_at = NOW(), updated_at = NOW()
    WHERE student_id = ?
  `, [auditStudentId]);
  const countBeforeInvalid = await getOutpassCount();
  const invalidLocRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: baseOutpassPayload
  });
  const countAfterInvalid = await getOutpassCount();
  record(
    'Location Required: 4. Student GPS Invalid Coords -> Submission Blocked (HTTP 400, STUDENT_LOCATION_REQUIRED)',
    invalidLocRes.status === 400 && invalidLocRes.data?.code === 'STUDENT_LOCATION_REQUIRED' && countAfterInvalid === countBeforeInvalid
  );

  // 5. Student GPS unavailable / Low accuracy (> 50m) -> submission BLOCKED
  await pool.query(`
    UPDATE student_locations
    SET latitude = 11.3410, longitude = 77.7172, accuracy = 85, captured_at = NOW(), updated_at = NOW()
    WHERE student_id = ?
  `, [auditStudentId]);
  const countBeforeLowAcc = await getOutpassCount();
  const lowAccLocRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: baseOutpassPayload
  });
  const countAfterLowAcc = await getOutpassCount();
  record(
    'Location Required: 5. Student GPS Low Accuracy (>50m) -> Submission Blocked (HTTP 400, STUDENT_LOCATION_REQUIRED)',
    lowAccLocRes.status === 400 && lowAccLocRes.data?.code === 'STUDENT_LOCATION_REQUIRED' && countAfterLowAcc === countBeforeLowAcc
  );

  // Restore fresh valid GPS for student 21CS042 so subsequent tests run seamlessly
  await pool.query(`
    UPDATE student_locations
    SET latitude = 11.3410, longitude = 77.7172, accuracy = 15, captured_at = NOW(), updated_at = NOW()
    WHERE student_id = ?
  `, [auditStudentId]);

  // --- 5. Outpass Advance Notice & Creation ---
  console.log('\n--- 5. Outpass Advance Time Rules (18h / 12h) ---');
  // Normal 18h rule: 10 mins before departure -> BLOCK
  const now = new Date();
  const tenMinsLater = new Date(now.getTime() + 10 * 60 * 1000);
  const tenMinsDate = tenMinsLater.toISOString().split('T')[0];
  const tenMinsTime = tenMinsLater.toTimeString().slice(0, 5);

  const returnDate = new Date(now.getTime() + 48 * 60 * 1000).toISOString().split('T')[0];
  const returnTime = '18:00';

  const normalBlockRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Audit Destination',
      reason: 'Audit Reason',
      student_phone: '9876543210',
      leaving_date: tenMinsDate,
      leaving_time: tenMinsTime,
      expected_return_date: returnDate,
      expected_return_time: returnTime
    }
  });
  record('Normal Outpass 18h Rule: Departure in 10 mins BLOCKED (HTTP 400)', normalBlockRes.status === 400 && normalBlockRes.data?.code === 'ADVANCE_TIME_LIMIT');

  // Duty 12h rule: 10 mins before departure -> BLOCK
  const dutyBlockRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'Audit Destination',
      reason: 'Audit Reason',
      student_phone: '9876543210',
      leaving_date: tenMinsDate,
      leaving_time: tenMinsTime,
      expected_return_date: returnDate,
      expected_return_time: returnTime,
      event_name: 'Audit Symposium',
      event_location: 'Campus Hall',
      duty_date: tenMinsDate
    }
  });
  record('One-Day Duty 12h Rule: Departure in 10 mins BLOCKED (HTTP 400)', dutyBlockRes.status === 400 && dutyBlockRes.data?.code === 'ADVANCE_TIME_LIMIT');

  // Normal Outpass >= 18h -> ALLOW
  const future24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const future24hDate = future24h.toISOString().split('T')[0];
  const future24hTime = future24h.toTimeString().slice(0, 5);
  const future48hDate = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];

  const normalAllowRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Audit Valid Destination',
      reason: 'Audit Weekend Leave',
      student_phone: '9876543210',
      leaving_date: future24hDate,
      leaving_time: future24hTime,
      expected_return_date: future48hDate,
      expected_return_time: '20:00'
    }
  });
  record('Normal Outpass >= 18h Allowed (HTTP 201)', normalAllowRes.status === 201 && normalAllowRes.data?.success);

  // --- 6. Security & Data Isolation ---
  console.log('\n--- 6. Security & Data Isolation ---');
  // Student cannot access another student's requests
  const myReqRes = await req('/api/outpass/my-requests', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${newStudentToken}` }
  });
  const otherStudentRequests = (myReqRes.data?.data || []).filter(r => r.student_id !== (getProfRes.data?.student?.id));
  record('Student Data Isolation: Cannot see other students requests', otherStudentRequests.length === 0);

  // Student cannot approve outpass
  const approveAttemptRes = await req(`/api/outpass/${normalAllowRes.data?.data?.outpassId || 1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: { remarks: 'Hacked approval' }
  });
  record('RBAC: Student blocked from calling Warden Approve API (HTTP 403)', approveAttemptRes.status === 403);

  // Student cannot call watchman check-in
  const watchmanAttemptRes = await req('/api/gate/checkin', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: { qr_token: 'fake_token' }
  });
  record('RBAC: Student blocked from calling Gate Check-in API (HTTP 403)', watchmanAttemptRes.status === 403);

  // Sensitive parent location & coordinates not exposed to student
  const hasParentCoords = JSON.stringify(myReqRes.data || {}).includes('parent_lat') || JSON.stringify(myReqRes.data || {}).includes('parent_accuracy');
  record('Security: Parent GPS coords & accuracy NOT exposed to Student APIs', !hasParentCoords);

  console.log('\n======================================================================');
  console.log(`🏁 AUDIT RUN COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================================');

  await pool.end();
}

runAudit().catch(err => {
  console.error('Audit Runner Error:', err);
  process.exit(1);
});
