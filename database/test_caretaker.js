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

async function runCaretakerExitTests() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING CARETAKER QR SCANNER & STUDENT EXIT TEST SUITE ON PORT ${PORT}`);
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

  // 1. Dashboard HTML Serves Successfully
  const dashRes = await fetch(`${BASE_URL}/caretaker-dashboard.html`);
  assert(dashRes.status === 200, '1. Caretaker Dashboard HTML Serves Successfully (HTTP 200)');

  // 2. Authenticate Caretaker Staff (CTK-305)
  const caretakerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' }
  });
  assert(caretakerLogin.ok && caretakerLogin.data.token, '2. Caretaker can login & obtain JWT');
  const caretakerToken = caretakerLogin.data.token;

  // 3. Authenticate Other Roles for Cross-Role Guardrails
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

  const watchmanLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' }
  });
  const watchmanToken = watchmanLogin.data.token;

  console.log('\n--- Testing Caretaker Overview & Metrics API ---');

  // 4. Caretaker Overview API
  const overviewRes = await request('/api/caretaker/overview', {
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(
    overviewRes.ok && overviewRes.data.stats && typeof overviewRes.data.stats.studentsInside === 'number',
    '3. Caretaker Overview returns occupancy metrics & recent feeds'
  );

  console.log('\n--- Creating Fresh Outpass Requests For Testing Exit Scenarios ---');

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
      body: { verification_token: token, parent_message: 'Approved for departure' }
    });
  }

  // Create Pass A (Advance submission >= 18h, then activated for exit testing)
  const now = new Date();
  const futureLeave = new Date(now.getTime() + 24 * 3600 * 1000);
  const futureReturn = new Date(now.getTime() + 30 * 3600 * 1000);
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const threeHoursLater = new Date(now.getTime() + 3 * 3600 * 1000);

  const passARes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Town Market',
      reason: 'Urgent supplies',
      leaving_date: formatLocalDate(futureLeave),
      leaving_time: formatLocalTime(futureLeave),
      expected_return_date: formatLocalDate(futureReturn),
      expected_return_time: formatLocalTime(futureReturn),
      student_phone: '9876543210'
    }
  });
  const passAId = passARes.data.data.id;
  await parentApproveWithGps(passAId);
  await request(`/api/outpass/${passAId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qrARes = await request(`/api/qr/generate/${passAId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const qrAToken = qrARes.data.data.qrToken;
  const qrAId = qrARes.data.data.qrId;

  // Activate Pass A for immediate exit testing
  await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, qrAId]);
  await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, passAId]);

  console.log('\n--- Testing Valid QR Exit Scan & Transaction Logic ---');

  // 5. Valid active QR is accepted by Caretaker Exit API
  const exitRes = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: `HOSTEL-QR:${qrAToken}` }
  });
  assert(
    exitRes.status === 200 && exitRes.data.status === 'EXIT_VERIFIED' && exitRes.data.data.hostelStatus === 'OUTSIDE HOSTEL',
    '4. Valid Active QR is Accepted by Caretaker Exit API (Status: EXIT_VERIFIED)'
  );

  // 6. Exit time is recorded and returned in response
  assert(
    exitRes.data.data.exitTime && exitRes.data.data.rollNumber === '21CS042',
    '5. Exit Time is recorded with server timestamp and student details'
  );

  // 7. Student status changes to OUTSIDE HOSTEL
  const studentStatusRes = await request('/api/outpass/status-summary', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(
    studentStatusRes.ok && studentStatusRes.data.hostelStatus === 'Outside Hostel',
    '6. Student Status changes to "Outside Hostel" in Student Dashboard API'
  );

  // 8. Student Active Outpass reflects exit time & OUTSIDE status
  const activeOutpassRes = await request('/api/student/active-outpass', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(
    activeOutpassRes.ok &&
    activeOutpassRes.data.activeOutpass.exitTime !== null &&
    activeOutpassRes.data.activeOutpass.studentHostelStatus === 'OUTSIDE',
    '7. Student Active Outpass reflects Exit Time and QR status remains active for return'
  );

  // 9. Same QR cannot record exit twice (ALREADY_EXITED / HTTP 409)
  const dupExitRes = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: qrAToken }
  });
  assert(
    dupExitRes.status === 409 && dupExitRes.data.validity === 'ALREADY_EXITED',
    '8. Prevent Duplicate Exit: Same QR scanned again returns ALREADY_EXITED (HTTP 409)'
  );

  console.log('\n--- Testing Edge Cases: Expired, Revoked, Not Yet Valid, and Invalid QRs ---');

  // 10. Expired QR is rejected
  const expPassRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Store',
      reason: 'Items',
      leaving_date: formatLocalDate(futureLeave),
      leaving_time: formatLocalTime(futureLeave),
      expected_return_date: formatLocalDate(futureReturn),
      expected_return_time: formatLocalTime(futureReturn),
      student_phone: '9876543210'
    }
  });
  const expPassId = expPassRes.data.data.id;
  await parentApproveWithGps(expPassId);
  await request(`/api/outpass/${expPassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const expQrRes = await request(`/api/qr/generate/${expPassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const expToken = expQrRes.data.data.qrToken;
  const expQrId = expQrRes.data.data.qrId;

  // Set as expired in DB
  await pool.query('UPDATE qr_codes SET valid_from = DATE_SUB(NOW(), INTERVAL 4 HOUR), valid_until = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?;', [expQrId]);
  await pool.query('UPDATE outpass_requests SET from_datetime = DATE_SUB(NOW(), INTERVAL 4 HOUR), to_datetime = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?;', [expPassId]);

  const expExitRes = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: expToken }
  });
  assert(
    expExitRes.status === 410 && expExitRes.data.validity === 'EXPIRED',
    '9. Expired QR is Rejected with HTTP 410 EXPIRED'
  );

  // 11. Revoked QR is rejected
  const revPassRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Station',
      reason: 'Travel',
      leaving_date: formatLocalDate(futureLeave),
      leaving_time: formatLocalTime(futureLeave),
      expected_return_date: formatLocalDate(futureReturn),
      expected_return_time: formatLocalTime(futureReturn),
      student_phone: '9876543210'
    }
  });
  const revPassId = revPassRes.data.data.id;
  await parentApproveWithGps(revPassId);
  await request(`/api/outpass/${revPassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const revQrGenRes = await request(`/api/qr/generate/${revPassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const revQrId = revQrGenRes.data.data.qrId;
  const revQrToken = revQrGenRes.data.data.qrToken;

  await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, revQrId]);
  await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, revPassId]);

  // Warden revokes
  await request(`/api/qr/revoke/${revQrId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` },
    body: { revocation_reason: 'Disciplinary action hold' }
  });

  const revExitRes = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: revQrToken }
  });
  assert(
    revExitRes.status === 403 && revExitRes.data.validity === 'REVOKED',
    '10. Revoked QR is Rejected with HTTP 403 REVOKED'
  );

  // 12. Not-yet-valid QR is rejected
  const futurePassDate = new Date(now.getTime() + 36 * 3600 * 1000);
  const futurePassReturn = new Date(now.getTime() + 48 * 3600 * 1000);
  const futurePassRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Home',
      reason: 'Festival',
      leaving_date: formatLocalDate(futurePassDate),
      leaving_time: formatLocalTime(futurePassDate),
      expected_return_date: formatLocalDate(futurePassReturn),
      expected_return_time: formatLocalTime(futurePassReturn),
      student_phone: '9876543210'
    }
  });
  const futPassId = futurePassRes.data.data.id;
  await parentApproveWithGps(futPassId);
  await request(`/api/outpass/${futPassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const futQrRes = await request(`/api/qr/generate/${futPassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const futQrToken = futQrRes.data.data.qrToken;

  const futExitRes = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: futQrToken }
  });
  assert(
    futExitRes.status === 400 && futExitRes.data.validity === 'NOT_YET_VALID',
    '11. Not-Yet-Valid QR is Rejected with HTTP 400 NOT_YET_VALID'
  );

  // 13. Invalid QR Token is rejected
  const invExitRes = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: 'fake_invalid_token_xyz_999' }
  });
  assert(
    invExitRes.status === 404 && invExitRes.data.validity === 'INVALID',
    '12. Invalid QR Token is Rejected with HTTP 404 INVALID'
  );

  console.log('\n--- Testing Role Authorization & RBAC Boundaries ---');

  // 14. Student cannot call Caretaker exit API
  const studentCall = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: { qr_token: qrAToken }
  });
  assert(
    studentCall.status === 403,
    '13. Security: Student Blocked from Calling Caretaker Exit API (HTTP 403)'
  );

  // 15. Watchman cannot call Caretaker exit API
  const watchmanCall = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: qrAToken }
  });
  assert(
    watchmanCall.status === 403,
    '14. Security: Watchman Blocked from Calling Caretaker Exit API (HTTP 403)'
  );

  console.log('\n--- Testing Students Outside & Exit History Roster APIs ---');

  // 16. Students Outside Roster (Grouped by Year)
  const outsideListRes = await request('/api/caretaker/students-outside', {
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(
    outsideListRes.ok &&
    outsideListRes.data.grouped &&
    typeof outsideListRes.data.grouped.thirdYear.count === 'number',
    '15. Students Outside Roster lists departing students grouped by Academic Year'
  );

  // 17. Exit History API with Date Filter
  const historyRes = await request('/api/caretaker/exit-history?filter=today', {
    headers: { 'Authorization': `Bearer ${caretakerToken}` }
  });
  assert(
    historyRes.ok && Array.isArray(historyRes.data.exitHistory) && historyRes.data.exitHistory.length > 0,
    '16. Exit History API returns today checkout logs with student and timestamp details'
  );

  console.log('\n========================================================');
  console.log(`🏁 CARETAKER & EXIT SCANNER TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runCaretakerExitTests();
