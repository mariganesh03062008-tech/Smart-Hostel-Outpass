/**
 * Comprehensive Test Suite for Watchman Dashboard & Gate Return Verification
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
  console.log('🧪 WATCHMAN DASHBOARD & GATE RETURN VERIFICATION TEST SUITE');
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
  const wtcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' } });

  const studentToken = stuRes.data?.token;
  const parentToken = parRes.data?.token;
  const advisorToken = advRes.data?.token;
  const wardenToken = wrdRes.data?.token;
  const principalToken = prcRes.data?.token;
  const caretakerToken = ctkRes.data?.token;
  const watchmanToken = wtcRes.data?.token;

  assert(Boolean(watchmanToken), 'Watchman logged in successfully (GAT-401)');
  assert(Boolean(studentToken), 'Student logged in successfully (21CS042)');
  assert(Boolean(parentToken), 'Parent logged in successfully (9876543210)');
  assert(Boolean(wardenToken), 'Warden logged in successfully (WRD-101)');
  assert(Boolean(advisorToken), 'Advisor logged in successfully (ADV-204)');
  assert(Boolean(principalToken), 'Principal logged in successfully (PRC-001)');
  assert(Boolean(caretakerToken), 'Caretaker logged in successfully (CTK-305)');

  // 2. Watchman Overview & Statistics
  console.log('\n📊 2. Testing Watchman Overview & Statistical Counters...');
  const overviewRes = await req('/api/watchman/overview', {
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(overviewRes.status === 200, 'GET /api/watchman/overview returns HTTP 200');
  const stats = overviewRes.data?.stats;
  assert(typeof stats?.studentsOutside === 'number', 'Overview contains studentsOutside: ' + stats?.studentsOutside);
  assert(typeof stats?.todayReturns === 'number', 'Overview contains todayReturns: ' + stats?.todayReturns);
  assert(typeof stats?.lateReturns === 'number', 'Overview contains lateReturns: ' + stats?.lateReturns);
  assert(typeof stats?.onTimeReturns === 'number', 'Overview contains onTimeReturns: ' + stats?.onTimeReturns);
  assert(Array.isArray(overviewRes.data?.recentReturns), 'Overview contains recentReturns array');

  // 3. Normal Outpass: Full Approval -> Caretaker Exit -> Watchman Return -> INSIDE & COMPLETED
  console.log('\n🏠 3. Testing Normal Outpass Full Return Lifecycle...');
  const now = new Date();
  const leave = new Date(now.getTime() - 10 * 60000);
  const ret = new Date(now.getTime() + 4 * 3600000);

  // 3.1 Student creates Normal Pass
  const createNormRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Central Mall Shopping',
      reason: 'Grocery Purchase',
      leaving_date: formatLocalDate(leave),
      leaving_time: formatLocalTime(leave),
      expected_return_date: formatLocalDate(ret),
      expected_return_time: formatLocalTime(ret),
      student_phone: '9876543210'
    }
  });
  const normalId = createNormRes.data?.data?.id;
  assert(createNormRes.status === 201, 'Student created Normal Outpass (ID: ' + normalId + ')');

  // 3.2 Parent biometric verify and approve
  await req('/api/parent/biometric-verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { templateId: 'FP-PAR-98765', matchConfidence: 99 }
  });
  const parApproveRes = await req(`/api/parent/outpass/${normalId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(parApproveRes.status === 200, 'Parent approved Normal Outpass');

  // 3.3 Warden approves
  const wrdApproveRes = await req(`/api/outpass/${normalId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wrdApproveRes.status === 200, 'Warden approved Normal Outpass');

  // 3.4 Warden generates QR
  const qrGenRes = await req(`/api/qr/generate/${normalId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const normQrToken = qrGenRes.data?.data?.qrToken;
  assert(Boolean(normQrToken), 'Security QR generated: ' + normQrToken);

  // 3.5 Pre-Exit Return Scan Guardrail (Student has not exited yet)
  const preExitReturnRes = await req('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: normQrToken }
  });
  assert(preExitReturnRes.status === 400, 'Watchman scan rejected before exit (HTTP 400 NOT_EXITED)');
  assert(preExitReturnRes.data?.validity === 'NOT_EXITED', 'Response validity is NOT_EXITED');

  // 3.6 Caretaker records Exit
  const exitRes = await req('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: normQrToken }
  });
  assert(exitRes.status === 200 && exitRes.data?.status === 'EXIT_VERIFIED', 'Caretaker verified exit -> Student is OUTSIDE');

  // 3.7 Watchman records Return
  const returnRes = await req('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: normQrToken }
  });
  assert(returnRes.status === 200 && returnRes.data?.status === 'RETURN_VERIFIED', 'Watchman recorded return (Status: RETURN_VERIFIED)');
  assert(returnRes.data?.data?.studentName === 'John Doe' || Boolean(returnRes.data?.data?.studentName), 'Return response returned verified student name: ' + returnRes.data?.data?.studentName);

  // 3.8 Verify Student Status is now INSIDE
  const stuMeRes = await req('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(stuMeRes.data?.user?.current_hostel_status === 'INSIDE', 'Student status transitioned back to INSIDE in MySQL');

  // 4. One-Day Permission Full Return Lifecycle
  console.log('\n🎓 4. Testing One-Day Permission Return Compatibility...');
  const createDutyRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      event_name: 'Smart India Hackathon',
      event_location: 'Anna University Tech Park',
      duty_date: formatLocalDate(leave),
      duty_description: 'Hackathon finalist presentation',
      destination: 'Anna University Tech Park',
      reason: 'Hackathon Presentation',
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

  // Caretaker records Exit
  await req('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: dutyQrToken }
  });

  // Watchman records Return (using HOSTEL-QR: token format)
  const dutyReturnRes = await req('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: `HOSTEL-QR:${dutyQrToken}` }
  });
  assert(dutyReturnRes.status === 200 && dutyReturnRes.data?.status === 'RETURN_VERIFIED', 'Watchman verified One-Day Duty return with HOSTEL-QR prefix');

  // 5. Invalid QR Token Test
  console.log('\n❌ 5. Testing Invalid QR Token Return Scan...');
  const invalidScanRes = await req('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: 'HOSTEL-QR:invalid_token_9999999999999999' }
  });
  assert(invalidScanRes.status === 404 || invalidScanRes.status === 400, 'Invalid QR token scan rejected with HTTP 404/400');
  assert(invalidScanRes.data?.validity === 'INVALID_QR' || !invalidScanRes.data?.success, 'Scan error message safely indicates invalid token');

  // 6. Duplicate Return Scan Guardrail Test
  console.log('\n🔒 6. Testing Duplicate Return Scan Guardrail...');
  const dupReturnRes = await req('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: dutyQrToken }
  });
  assert(dupReturnRes.status === 409 || dupReturnRes.status === 400, 'Duplicate return scan strictly rejected (HTTP 409/400)');
  assert(dupReturnRes.data?.validity === 'ALREADY_RETURNED' || dupReturnRes.data?.message?.includes('already'), 'Duplicate scan clearly reports ALREADY_RETURNED');

  // 7. Students Outside Roster
  console.log('\n👥 7. Testing Students Outside Live Roster...');
  const outsideRes = await req('/api/watchman/students-outside', {
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(outsideRes.status === 200, 'GET /api/watchman/students-outside returns HTTP 200');
  assert(typeof outsideRes.data?.totalOutside === 'number', 'Contains totalOutside count: ' + outsideRes.data?.totalOutside);
  assert(Array.isArray(outsideRes.data?.students), 'Contains students array');

  // 8. Return History with Date Filters
  console.log('\n📜 8. Testing Return History with Date Filtering...');
  const histTodayRes = await req('/api/watchman/return-history?filter=today', {
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(histTodayRes.status === 200, 'GET /api/watchman/return-history?filter=today returns HTTP 200');
  assert(Array.isArray(histTodayRes.data?.returnHistory), 'Return history contains logs array');
  assert(histTodayRes.data?.returnHistory?.length > 0, 'Recent return scans are recorded in history');

  const histAllRes = await req('/api/watchman/return-history?filter=all', {
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(histAllRes.status === 200, 'GET /api/watchman/return-history?filter=all returns HTTP 200');

  // 9. Role Separation Guardrails
  console.log('\n🛡️ 9. Testing Role Separation Guardrails for Watchman...');
  const wtcApproveRes = await req(`/api/outpass/${normalId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(wtcApproveRes.status === 403, 'Watchman is strictly blocked from approving Outpasses (HTTP 403)');

  const wtcGenQrRes = await req(`/api/qr/generate/${normalId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(wtcGenQrRes.status === 403, 'Watchman is strictly blocked from generating QR codes (HTTP 403)');

  const wtcExitRes = await req('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: normQrToken }
  });
  assert(wtcExitRes.status === 403, 'Watchman is strictly blocked from recording hostel exits (HTTP 403)');

  console.log('\n========================================================');
  console.log(`🏁 WATCHMAN DASHBOARD TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
