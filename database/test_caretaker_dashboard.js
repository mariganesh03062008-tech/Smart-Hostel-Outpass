/**
 * Comprehensive Test Suite for Caretaker Dashboard & Gate Exit Verification
 */

const http = require('http');

function req(path, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 5001,
      path,
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
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    clientReq.on('error', reject);
    if (options.body) clientReq.write(JSON.stringify(options.body));
    clientReq.end();
  });
}

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalTime(d) {
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${mins}`;
}

async function run() {
  console.log('🚀 ========================================================');
  console.log('🧪 CARETAKER DASHBOARD & GATE EXIT VERIFICATION TEST SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;
  function assert(condition, name, msg = '') {
    if (condition) {
      console.log(`  ✅ [PASS]: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL]: ${name} ${msg ? '(' + msg + ')' : ''}`);
      failed++;
    }
  }

  // 1. Authenticate Roles
  console.log('🔑 1. Authenticating Roles...');
  const stuRes = await req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } });
  const parRes = await req('/api/auth/login', { method: 'POST', body: { username: '9876543210', password: 'Password@123', role: 'parent' } });
  const advRes = await req('/api/auth/login', { method: 'POST', body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' } });
  const wrdRes = await req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } });
  const prcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'PRC-001', password: 'Password@123', role: 'principal' } });
  const ctkRes = await req('/api/auth/login', { method: 'POST', body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' } });

  const studentToken = stuRes.data?.token;
  const parentToken = parRes.data?.token;
  const advisorToken = advRes.data?.token;
  const wardenToken = wrdRes.data?.token;
  const principalToken = prcRes.data?.token;
  const caretakerToken = ctkRes.data?.token;

  assert(Boolean(caretakerToken), 'Caretaker logged in successfully (CTK-305)');
  assert(Boolean(studentToken), 'Student logged in successfully (21CS042)');
  assert(Boolean(parentToken), 'Parent logged in successfully (9876543210)');
  assert(Boolean(wardenToken), 'Warden logged in successfully (WRD-101)');
  assert(Boolean(advisorToken), 'Advisor logged in successfully (ADV-204)');
  assert(Boolean(principalToken), 'Principal logged in successfully (PRC-001)');

  // 2. Caretaker Overview & Metrics
  console.log('\n📊 2. Testing Caretaker Overview & Statistical Counters...');
  const overviewRes = await req('/api/caretaker/overview', {
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(overviewRes.status === 200, 'GET /api/caretaker/overview returns HTTP 200');
  const stats = overviewRes.data?.stats;
  assert(typeof stats?.studentsInside === 'number', 'Overview contains studentsInside count: ' + stats?.studentsInside);
  assert(typeof stats?.studentsOutside === 'number', 'Overview contains studentsOutside count: ' + stats?.studentsOutside);
  assert(typeof stats?.todayExits === 'number', 'Overview contains todayExits count: ' + stats?.todayExits);
  assert(typeof stats?.todayReturns === 'number', 'Overview contains todayReturns count: ' + stats?.todayReturns);
  assert(Array.isArray(overviewRes.data?.recentExits), 'Overview contains recentExits array');

  // 3. Normal Outpass: Full Approval -> Caretaker Exit Scan -> Student OUTSIDE
  console.log('\n🏠 3. Testing Normal Outpass Exit Scan & Status Transition...');
  const now = new Date();
  const leave = new Date(now.getTime() - 5 * 60000);
  const ret = new Date(now.getTime() + 4 * 3600000);

  // 3.1 Student creates pass
  const createNormRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Downtown Library',
      reason: 'Book Collection',
      leaving_date: formatLocalDate(leave),
      leaving_time: formatLocalTime(leave),
      expected_return_date: formatLocalDate(ret),
      expected_return_time: formatLocalTime(ret),
      student_phone: '9876543210'
    }
  });
  const normalId = createNormRes.data?.data?.id;
  assert(createNormRes.status === 201, 'Student created Normal Outpass (ID: ' + normalId + ')');

  // 3.2 Parent biometric verify and approves
  await req('/api/parent/biometric-verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { templateId: 'FP-PAR-98765', matchConfidence: 99 }
  });

  const parApproveRes = await req(`/api/parent/outpass/${normalId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(parApproveRes.status === 200 && parApproveRes.data?.data?.status === 'PENDING_WARDEN', 'Parent approved Normal Outpass -> PENDING_WARDEN');

  // 3.3 Warden approves
  const wrdApproveRes = await req(`/api/outpass/${normalId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wrdApproveRes.status === 200 && wrdApproveRes.data?.data?.status === 'APPROVED', 'Warden approved Normal Outpass -> APPROVED');

  // 3.4 Warden generates QR
  const qrGenRes = await req(`/api/qr/generate/${normalId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qrTokenNorm = qrGenRes.data?.data?.qrToken;
  assert(Boolean(qrTokenNorm), 'Security QR generated for Normal Outpass: ' + qrTokenNorm);

  // 3.5 Caretaker scans QR to record Exit
  const exitRes = await req('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: qrTokenNorm }
  });
  assert(exitRes.status === 200 && exitRes.data?.status === 'EXIT_VERIFIED', 'Caretaker recorded student exit (Status: EXIT_VERIFIED)');
  assert(exitRes.data?.data?.studentName === 'Alex Johnson' || Boolean(exitRes.data?.data?.studentName), 'Exit response returned verified student name: ' + exitRes.data?.data?.studentName);

  // 3.6 Check Student Hostel Status
  const meRes = await req('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(meRes.data?.user?.current_hostel_status === 'OUTSIDE', 'Student current_hostel_status transitioned to OUTSIDE in MySQL');

  // 4. One-Day Permission: Full Approval -> Caretaker Exit Scan
  console.log('\n🎓 4. Testing One-Day Permission Exit Scan Compatibility...');
  const createDutyRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      event_name: 'National Robotics Expo',
      event_location: 'IIT Madras Research Park',
      duty_date: formatLocalDate(leave),
      duty_description: 'Autonomous Rover demo',
      destination: 'IIT Madras Research Park',
      reason: 'Robotics Expo',
      semester: 'Semester 6',
      student_phone: '9876543210',
      leaving_date: formatLocalDate(leave),
      leaving_time: formatLocalTime(leave),
      expected_return_date: formatLocalDate(ret),
      expected_return_time: formatLocalTime(ret)
    }
  });
  const dutyId = createDutyRes.data?.data?.id;

  // Advisor approves
  await req(`/api/advisor/one-day/${dutyId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });

  // Principal approves
  await req(`/api/principal/one-day/${dutyId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });

  // Generate QR
  const dutyQrRes = await req(`/api/qr/generate/${dutyId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  const dutyQrToken = dutyQrRes.data?.data?.qrToken;
  assert(Boolean(dutyQrToken), 'Security QR generated for One-Day Duty pass: ' + dutyQrToken);

  // Caretaker scans One-Day QR (with HOSTEL-QR: prefix)
  const dutyExitRes = await req('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: `HOSTEL-QR:${dutyQrToken}` }
  });
  assert(dutyExitRes.status === 200 && dutyExitRes.data?.status === 'EXIT_VERIFIED', 'Caretaker successfully verified One-Day Duty exit (HOSTEL-QR prefix handled)');

  // 5. Invalid QR Token Test
  console.log('\n❌ 5. Testing Invalid QR Token Scan...');
  const invalidScanRes = await req('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: 'HOSTEL-QR:fake_token_1234567890abcdef' }
  });
  assert(invalidScanRes.status === 404 || invalidScanRes.status === 400, 'Invalid QR token scan rejected with HTTP 404/400');
  assert(invalidScanRes.data?.validity === 'INVALID' || !invalidScanRes.data?.success, 'Scan error message safely indicates invalid token');

  // 6. Duplicate Exit Scan Guardrail Test
  console.log('\n🔒 6. Testing Duplicate Exit Scan Guardrail...');
  const dupScanRes = await req('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: dutyQrToken }
  });
  assert(dupScanRes.status === 400 || dupScanRes.status === 409, 'Duplicate exit scan strictly rejected (HTTP 400/409)');
  assert(dupScanRes.data?.validity === 'ALREADY_EXITED' || dupScanRes.data?.message?.includes('already'), 'Duplicate scan clearly reports ALREADY_EXITED');

  // 7. Students Outside Roster & Year Filter
  console.log('\n👥 7. Testing Students Outside Live Roster & Grouping...');
  const outsideRes = await req('/api/caretaker/students-outside', {
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(outsideRes.status === 200, 'GET /api/caretaker/students-outside returns HTTP 200');
  assert(typeof outsideRes.data?.totalOutside === 'number', 'Contains totalOutside count: ' + outsideRes.data?.totalOutside);
  assert(Boolean(outsideRes.data?.grouped), 'Contains grouped by year data (1st, 2nd, 3rd, 4th yr)');
  assert(Array.isArray(outsideRes.data?.allStudents), 'Contains allStudents array');

  // 8. Exit History with Date Filtering
  console.log('\n📜 8. Testing Exit History with Date Filtering...');
  const histTodayRes = await req('/api/caretaker/exit-history?filter=today', {
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(histTodayRes.status === 200, 'GET /api/caretaker/exit-history?filter=today returns HTTP 200');
  assert(Array.isArray(histTodayRes.data?.exitHistory), 'Exit history contains logs array');
  assert(histTodayRes.data?.exitHistory?.length > 0, 'Recent exit scans are recorded in history');

  const histAllRes = await req('/api/caretaker/exit-history?filter=all', {
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(histAllRes.status === 200, 'GET /api/caretaker/exit-history?filter=all returns HTTP 200');

  // 9. Role Separation Guardrails
  console.log('\n🛡️ 9. Testing Role Separation Guardrails for Caretaker...');
  const ctkApproveRes = await req(`/api/outpass/${normalId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(ctkApproveRes.status === 403, 'Caretaker is strictly blocked from approving Outpasses (HTTP 403)');

  const ctkGenQrRes = await req(`/api/qr/generate/${normalId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(ctkGenQrRes.status === 403, 'Caretaker is strictly blocked from generating QR codes (HTTP 403)');

  console.log('\n========================================================');
  console.log(`🏁 CARETAKER DASHBOARD TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
