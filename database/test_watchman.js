const { pool } = require('../utils/db');
const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = options.headers || {};
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await res.json().catch(() => ({ statusText: res.statusText }));
  return { status: res.status, ok: res.ok, data };
}

async function runWatchmanReturnTests() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING WATCHMAN RETURN MODULE & CHECK-IN WORKFLOW TESTS ON PORT ${PORT}`);
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  // 1. Dashboard HTML Serves Successfully
  const dashRes = await fetch(`${BASE_URL}/watchman-dashboard.html`);
  assert(dashRes.status === 200, '1. Watchman Dashboard HTML Serves Successfully (HTTP 200)');

  // 2. Authenticate Watchman Security Guard (GAT-401)
  const watchmanLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' }
  });
  assert(watchmanLogin.ok && watchmanLogin.data.token, '2. Watchman can login & obtain JWT');
  const watchmanToken = watchmanLogin.data.token;

  // 3. Authenticate Other Roles for Complete Workflow & RBAC Testing
  const studentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  const studentToken = studentLogin.data.token;

  const parentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  const parentToken = parentLogin.data.token;
  await request('/api/parent/biometric-verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { simulation_mode: true }
  });

  const wardenLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
  });
  const wardenToken = wardenLogin.data.token;

  const caretakerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' }
  });
  const caretakerToken = caretakerLogin.data.token;

  const advisorLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' }
  });
  const advisorToken = advisorLogin.data.token;

  const principalLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'PRC-001', password: 'Password@123', role: 'principal' }
  });
  const principalToken = principalLogin.data.token;

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

  console.log('\n--- Testing Watchman Overview & Metrics API ---');

  // 4. Watchman Overview API
  const overviewRes = await request('/api/watchman/overview', {
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(
    overviewRes.ok && overviewRes.data.stats && typeof overviewRes.data.stats.todayReturns === 'number',
    '3. Watchman Overview returns gate statistics & metrics'
  );

  console.log('\n--- Scenario 1: Student who has NOT exited cannot be returned ---');

  // Set fresh student location for proximity verification
  await pool.query(`
    INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
    VALUES (?, 13.0000000, 80.0000000, 10.0, NOW(), 'browser_gps')
    ON DUPLICATE KEY UPDATE
      latitude = 13.0000000,
      longitude = 80.0000000,
      accuracy = 10.0,
      captured_at = NOW(),
      source = 'browser_gps';
  `, [studentLogin.data.user.id]);

  const rawVec = new Array(128).fill(0).map((_, i) => Math.sin(i + 1));
  const norm = Math.sqrt(rawVec.reduce((s, v) => s + v * v, 0));
  const testFaceVector = rawVec.map(v => Number((v / norm).toFixed(6)));

  await request('/api/parent/face/register', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { faceDescriptor: testFaceVector }
  });

  async function parentApproveWithGps(outpassId) {
    const faceRes = await request(`/api/parent/outpass/${outpassId}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: testFaceVector }
    });
    const token = faceRes.data.verificationToken;
    await request(`/api/parent/outpass/${outpassId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: token, parent_message: 'Approved for leave' }
    });
  }

  // Create Pass 1 (Advance submission >= 18h, then activated for exit)
  const now = new Date();
  const futureLeave = new Date(now.getTime() + 24 * 3600 * 1000);
  const futureReturn = new Date(now.getTime() + 30 * 3600 * 1000);
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const threeHoursLater = new Date(now.getTime() + 3 * 3600 * 1000);

  const pass1Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Library',
      reason: 'Study',
      leaving_date: formatLocalDate(futureLeave),
      leaving_time: formatLocalTime(futureLeave),
      expected_return_date: formatLocalDate(futureReturn),
      expected_return_time: formatLocalTime(futureReturn),
      student_phone: '9876543210'
    }
  });
  const pass1Id = pass1Res.data.data.id;
  await parentApproveWithGps(pass1Id);
  await request(`/api/outpass/${pass1Id}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qr1Res = await request(`/api/qr/generate/${pass1Id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qr1Token = qr1Res.data.data.qrToken;
  const qr1Id = qr1Res.data.data.qrId;

  // Activate Pass 1 for exit/return testing
  await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, qr1Id]);
  await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, pass1Id]);

  // Watchman tries to scan return before exit
  const noExitReturnRes = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: qr1Token }
  });
  assert(
    noExitReturnRes.status === 400 && noExitReturnRes.data.validity === 'NOT_EXITED',
    '4. Student who has NOT exited CANNOT be returned (HTTP 400 NOT_EXITED)'
  );

  console.log('\n--- Scenario 2: Complete Normal Outpass Cycle (Student -> Parent -> Warden -> QR -> Caretaker Exit -> Watchman Return On-Time) ---');

  // Caretaker records Exit for Pass 1
  const ctkExitRes = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: qr1Token }
  });
  assert(ctkExitRes.status === 200 && ctkExitRes.data.status === 'EXIT_VERIFIED', '5.1 Caretaker records student exit (Status: EXIT_VERIFIED)');

  // Watchman scans Return (On-Time)
  const watchmanReturnRes = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: `HOSTEL-QR:${qr1Token}` }
  });
  assert(
    watchmanReturnRes.status === 200 &&
    watchmanReturnRes.data.status === 'RETURN_VERIFIED' &&
    watchmanReturnRes.data.returnClassification === 'ON_TIME' &&
    watchmanReturnRes.data.isLate === false,
    '5.2 Valid exited student is returned ON TIME (Status: RETURN_VERIFIED, Classification: ON_TIME)'
  );

  // Check state transitions
  assert(
    watchmanReturnRes.data.data.actualReturnTime &&
    watchmanReturnRes.data.data.hostelStatus === 'INSIDE HOSTEL' &&
    watchmanReturnRes.data.data.outpassStatus === 'COMPLETED' &&
    watchmanReturnRes.data.data.qrStatus === 'COMPLETED',
    '5.3 State Transitions: Student -> INSIDE HOSTEL, Outpass -> COMPLETED, QR -> COMPLETED'
  );

  // Student Dashboard reflects INSIDE HOSTEL
  const studentStatusCheck = await request('/api/outpass/status-summary', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(
    studentStatusCheck.ok && studentStatusCheck.data.hostelStatus === 'Inside Hostel',
    '5.4 Student Dashboard status reflects "Inside Hostel"'
  );

  // Duplicate Return Prevention
  const dupReturnRes = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: qr1Token }
  });
  assert(
    dupReturnRes.status === 409 && dupReturnRes.data.validity === 'ALREADY_RETURNED',
    '5.5 Prevent Duplicate Return: Same QR scanned again returns ALREADY_RETURNED (HTTP 409)'
  );

  console.log('\n--- Scenario 3: Late Return & Expired-But-Exited Outpass Return Handling ---');

  // Create Pass 2 (Leaving with >= 18h advance, then activated for exit)
  const pass2Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Railway Junction',
      reason: 'Drop relative',
      leaving_date: formatLocalDate(futureLeave),
      leaving_time: formatLocalTime(futureLeave),
      expected_return_date: formatLocalDate(futureReturn),
      expected_return_time: formatLocalTime(futureReturn),
      student_phone: '9876543210'
    }
  });
  const pass2Id = pass2Res.data.data.id;
  await parentApproveWithGps(pass2Id);
  await request(`/api/outpass/${pass2Id}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qr2Res = await request(`/api/qr/generate/${pass2Id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qr2Token = qr2Res.data.data.qrToken;
  const qr2Id = qr2Res.data.data.qrId;

  // Activate for exit
  await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, qr2Id]);
  await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, pass2Id]);

  // Student exits while pass is active
  const ctkExit2Res = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: qr2Token }
  });
  assert(ctkExit2Res.status === 200, '6.1 Caretaker records checkout exit for Pass 2');

  // Simulate late arrival (expected return was 45 minutes ago)
  await pool.query('UPDATE outpass_requests SET to_datetime = DATE_SUB(NOW(), INTERVAL 45 MINUTE) WHERE id = ?;', [pass2Id]);
  await pool.query('UPDATE qr_codes SET valid_until = DATE_SUB(NOW(), INTERVAL 45 MINUTE) WHERE outpass_request_id = ?;', [pass2Id]);

  // Watchman records Return (Late Return)
  const lateReturnRes = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: qr2Token }
  });
  assert(
    lateReturnRes.status === 200 &&
    lateReturnRes.data.status === 'RETURN_VERIFIED' &&
    lateReturnRes.data.returnClassification === 'LATE_RETURN' &&
    lateReturnRes.data.isLate === true &&
    lateReturnRes.data.lateDurationMinutes >= 40,
    `6.2 Late Return Identified & Late Duration Calculated (${lateReturnRes.data.lateDurationMinutes} mins late)`
  );

  console.log('\n--- Scenario 4: One-Day Duty Full Cycle (Student -> Advisor -> Warden -> QR -> Caretaker -> Watchman) ---');

  // Submit One-Day Duty (requires >= 12h advance)
  const odLeave = new Date(now.getTime() + 14 * 3600 * 1000);
  const odReturn = new Date(now.getTime() + 18 * 3600 * 1000);
  const odSubRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'Govt College of Tech',
      reason: 'Paper Presentation',
      event_name: 'Tech Symposium 2026',
      event_location: 'Auditorium A',
      duty_date: formatLocalDate(odLeave),
      leaving_date: formatLocalDate(odLeave),
      leaving_time: formatLocalTime(odLeave),
      expected_return_date: formatLocalDate(odReturn),
      expected_return_time: formatLocalTime(odReturn),
      student_phone: '9876543210'
    }
  });
  const odId = odSubRes.data.data.id;
  await request(`/api/outpass/${odId}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  await request(`/api/outpass/${odId}/principal-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  const odQrRes = await request(`/api/qr/generate/${odId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  const odQrToken = odQrRes.data.data.qrToken;
  const odQrId = odQrRes.data.data.qrId;

  // Activate OD pass for immediate exit and return testing
  await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, odQrId]);
  await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, odId]);

  // Caretaker scans OD Exit
  await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: odQrToken }
  });

  // Watchman scans OD Return
  const odReturnRes = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: odQrToken }
  });
  assert(
    odReturnRes.status === 200 &&
    odReturnRes.data.status === 'RETURN_VERIFIED' &&
    odReturnRes.data.data.requestType === 'One-Day Duty' &&
    odReturnRes.data.data.outpassStatus === 'COMPLETED',
    '7. One-Day Duty Full Cycle: Complete clearance & return marked COMPLETED'
  );

  console.log('\n--- Scenario 5: Security, Revocation & Invalid Token Guardrails ---');

  // Create Pass 3 & Revoke it
  const pass3Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Shopping Center',
      reason: 'Personal',
      leaving_date: formatLocalDate(futureLeave),
      leaving_time: formatLocalTime(futureLeave),
      expected_return_date: formatLocalDate(futureReturn),
      expected_return_time: formatLocalTime(futureReturn),
      student_phone: '9876543210'
    }
  });
  const pass3Id = pass3Res.data.data.id;
  await parentApproveWithGps(pass3Id);
  await request(`/api/outpass/${pass3Id}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qr3Res = await request(`/api/qr/generate/${pass3Id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qr3Token = qr3Res.data.data.qrToken;
  const qr3Id = qr3Res.data.data.qrId;

  await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, qr3Id]);
  await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, pass3Id]);

  // Warden revokes QR
  await request(`/api/qr/revoke/${qr3Id}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` },
    body: { revocation_reason: 'Hostel violation' }
  });

  // Watchman tries to scan Revoked QR
  const revReturnRes = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: qr3Token }
  });
  assert(
    revReturnRes.status === 403 && revReturnRes.data.validity === 'REVOKED_QR',
    '8. Revoked QR CANNOT be returned (HTTP 403 REVOKED_QR)'
  );

  // Invalid Token Check
  const invReturnRes = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: 'invalid_fake_qr_token_888' }
  });
  assert(
    invReturnRes.status === 404 && invReturnRes.data.validity === 'INVALID_QR',
    '9. Invalid QR Token is Rejected with HTTP 404 INVALID_QR'
  );

  // RBAC: Student blocked from Watchman return API
  const stuTryReturn = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: { qr_token: qr2Token }
  });
  assert(
    stuTryReturn.status === 403,
    '10. Security: Student Blocked from Calling Watchman Return API (HTTP 403)'
  );

  // RBAC: Caretaker blocked from Watchman return API
  const ctkTryReturn = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: qr2Token }
  });
  assert(
    ctkTryReturn.status === 403,
    '11. Security: Caretaker Blocked from Calling Watchman Return API (HTTP 403)'
  );

  console.log('\n--- Testing Watchman Students Outside & Return History APIs ---');

  // Students Outside list
  const watchmanOutsideRes = await request('/api/watchman/students-outside', {
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(
    watchmanOutsideRes.ok && typeof watchmanOutsideRes.data.totalOutside === 'number',
    '12. Watchman Students Outside Roster returns live list'
  );

  // Return History API with date filter
  const historyRes = await request('/api/watchman/return-history?filter=today', {
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(
    historyRes.ok && Array.isArray(historyRes.data.returnHistory) && historyRes.data.returnHistory.length > 0,
    '13. Return History API returns today check-in records with late calculation'
  );

  console.log('\n========================================================');
  console.log(`🏁 WATCHMAN RETURN MODULE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runWatchmanReturnTests();
