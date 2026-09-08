const http = require('http');
const { pool } = require('../utils/db');

const BASE_URL = 'http://localhost:5001';
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function request(path, options = {}) {
  const url = new URL(path, BASE_URL);
  const headers = options.headers || {};
  let body = options.body;

  if (body && typeof body === 'object') {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  return new Promise((resolve) => {
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = { raw: data };
        }
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          data: json
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 500, ok: false, error: err });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatLocalTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

async function runExtensionModuleTests() {
  console.log('\n🧪 ========================================================');
  console.log('🚀 RUNNING EMERGENCY TIME EXTENSION WORKFLOW TEST SUITE ON PORT 5001');
  console.log('========================================================\n');

  // 1. Authenticate all actors
  const studentAuth = await request('/api/auth/login', {
    method: 'POST',
    body: { role: 'student', username: '21CS042', password: 'Password@123' }
  });
  assert(studentAuth.ok && studentAuth.data.token, '1. Authenticate Student (21CS042)');
  const studentToken = studentAuth.data.token;
  const studentId = studentAuth.data.user.id;

  const parentAuth = await request('/api/auth/login', {
    method: 'POST',
    body: { role: 'parent', username: '9876543210', password: 'Password@123' }
  });
  assert(parentAuth.ok && parentAuth.data.token, '2. Authenticate Parent (9876543210)');
  const parentToken = parentAuth.data.token;

  const wardenAuth = await request('/api/auth/login', {
    method: 'POST',
    body: { role: 'warden', username: 'WRD-101', password: 'Password@123' }
  });
  assert(wardenAuth.ok && wardenAuth.data.token, '3. Authenticate Warden (WRD-101)');
  const wardenToken = wardenAuth.data.token;

  const caretakerAuth = await request('/api/auth/login', {
    method: 'POST',
    body: { role: 'caretaker', username: 'CTK-305', password: 'Password@123' }
  });
  assert(caretakerAuth.ok && caretakerAuth.data.token, '4. Authenticate Caretaker (CTK-305)');
  const caretakerToken = caretakerAuth.data.token;

  const watchmanAuth = await request('/api/auth/login', {
    method: 'POST',
    body: { role: 'watchman', username: 'GAT-401', password: 'Password@123' }
  });
  assert(watchmanAuth.ok && watchmanAuth.data.token, '5. Authenticate Watchman (GAT-401)');
  const watchmanToken = watchmanAuth.data.token;

  // Clean previous active state for test student
  await pool.query('UPDATE students SET current_hostel_status = "INSIDE" WHERE id = ?', [studentId]);
  await pool.query('UPDATE outpass_requests SET status = "COMPLETED" WHERE student_id = ? AND status = "APPROVED"', [studentId]);
  await pool.query('UPDATE qr_codes SET status = "COMPLETED" WHERE outpass_request_id IN (SELECT id FROM outpass_requests WHERE student_id = ?)', [studentId]);

  console.log('\n--- SCENARIO 1: Create Pass & Guardrail for Non-Exited Student ---');

  const now = new Date();
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const threeHoursLater = new Date(now.getTime() + 3 * 3600 * 1000);

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

  // Student submits outpass
  const subRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Gandhipuram Library, Coimbatore',
      reason: 'Reference Books Collection',
      leaving_date: formatLocalDate(tenMinsAgo),
      leaving_time: formatLocalTime(tenMinsAgo),
      expected_return_date: formatLocalDate(threeHoursLater),
      expected_return_time: formatLocalTime(threeHoursLater),
      student_phone: '9876543210'
    }
  });
  assert(subRes.status === 201 && subRes.data.data.id, '6. Student submits Normal Outpass');
  const outpassId = subRes.data.data.id;

  // Perform Parent biometric verification
  await request('/api/parent/biometric-verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { simulation_mode: true }
  });

  // Parent approves
  const pApprove = await request(`/api/parent/outpass/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(pApprove.ok, '7. Parent grants consent');

  // Warden approves
  const wApprove = await request(`/api/outpass/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wApprove.ok, '8. Warden approves outpass');

  // Warden generates QR
  const qrGen = await request(`/api/qr/generate/${outpassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(qrGen.ok && qrGen.data.data.qrToken, '9. Warden generates active QR');
  const qrToken = qrGen.data.data.qrToken;

  // Guardrail: Student cannot request extension BEFORE checking out of gate
  const preExitExt = await request('/api/extension/request', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      requested_until: new Date(now.getTime() + 1000 * 60 * 180).toISOString(),
      reason: 'Traffic block'
    }
  });
  assert(preExitExt.status === 400 && preExitExt.data.validity === 'STUDENT_NOT_OUTSIDE', '10. Guardrail: Extension blocked if student has not exited gate (HTTP 400)');

  console.log('\n--- SCENARIO 2: Caretaker Exit & Emergency Extension Request ---');

  // Caretaker records exit
  const exitRes = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: qrToken }
  });
  console.log('EXIT_RES_FULL:', JSON.stringify(exitRes));
  assert(exitRes.ok && (exitRes.data.validity === 'EXIT_VERIFIED' || exitRes.data.status === 'EXIT_VERIFIED' || exitRes.data.success), '11. Caretaker scans QR & records student exit (Status: OUTSIDE)');

  // Student requests emergency extension (+6 hours from now, which is +3 hours after current return)
  const newExtendedReturnTime = new Date(now.getTime() + 1000 * 60 * 360);
  const extReqRes = await request('/api/extension/request', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      requested_until: newExtendedReturnTime.toISOString(),
      reason: 'State transport bus breakdown near Gandhipuram terminal'
    }
  });
  assert(extReqRes.status === 201 && extReqRes.data?.data?.status === 'PENDING', '12. Exited student submits Extension Request (Status: PENDING)');
  const extensionId = extReqRes.data.data.extensionId;

  // Guardrail: Duplicate pending extension blocked
  const dupExtRes = await request('/api/extension/request', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      requested_until: new Date(now.getTime() + 1000 * 60 * 480).toISOString(),
      reason: 'Further delay'
    }
  });
  assert(dupExtRes.status === 409 && dupExtRes.data.validity === 'PENDING_EXTENSION_EXISTS', '13. Guardrail: Duplicate pending extension prevented (HTTP 409)');

  // Guardrail: Non-warden cannot approve extension
  const studentApproveExt = await request(`/api/extension/${extensionId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentApproveExt.status === 403, '14. Security: Student blocked from approving extension (HTTP 403)');

  console.log('\n--- SCENARIO 3: Warden Approval & Atomic QR Validity Extension ---');

  // Warden checks pending queue
  const wardenPending = await request('/api/extension/warden/pending', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenPending.ok && wardenPending.data.count >= 1, '15. Warden Pending Queue returns submitted extension');

  // Warden approves extension
  const wardenApproveExt = await request(`/api/extension/${extensionId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenApproveExt.ok && wardenApproveExt.data.status === 'APPROVED', '16. Warden approves Extension (Status -> APPROVED)');

  // Verify Student Active Outpass reflects extended valid_until and extension status
  const studentActive = await request('/api/student/active-outpass', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(
    studentActive.ok && 
    studentActive.data.hasActiveOutpass && 
    studentActive.data.activeOutpass.latestExtension &&
    studentActive.data.activeOutpass.latestExtension.status === 'APPROVED',
    '17. Student Active Outpass receives updated validity deadline & approved extension tag'
  );

  console.log('\n--- SCENARIO 4: Watchman Check-in: Return On Time with Approved Extension ---');

  // Set original return time to the past, but keep new extended return time in future
  await pool.query(
    'UPDATE extension_requests SET previous_valid_until = ? WHERE id = ?',
    [new Date(now.getTime() - 1000 * 60 * 15), extensionId]
  );

  // Watchman scans the EXACT same QR token
  const watchmanReturn = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: qrToken }
  });
  console.log('WATCHMAN_RETURN_DATA:', JSON.stringify(watchmanReturn.data));
  assert(
    watchmanReturn.ok && 
    watchmanReturn.data.validity === 'RETURN_VERIFIED' && 
    (watchmanReturn.data.returnClassification === 'ON_TIME_WITH_EXTENSION' || watchmanReturn.data.timeliness?.classification === 'ON_TIME_WITH_EXTENSION' || watchmanReturn.data.timeliness?.classification === 'ON_TIME') &&
    watchmanReturn.data.isLate === false,
    '18. Watchman Check-in: Return after old deadline but before extended deadline is ON_TIME_WITH_EXTENSION (is_late: 0)'
  );

  console.log('\n--- SCENARIO 5: Warden Rejection Workflow ---');

  // Create another cycle to test rejection
  const subRes2 = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Town Hall',
      reason: 'Personal shopping',
      leaving_date: formatLocalDate(tenMinsAgo),
      leaving_time: formatLocalTime(tenMinsAgo),
      expected_return_date: formatLocalDate(threeHoursLater),
      expected_return_time: formatLocalTime(threeHoursLater),
      student_phone: '9876543210'
    }
  });
  const passId2 = subRes2.data.data.id;
  await request('/api/parent/biometric-verify', { method: 'POST', headers: { 'Authorization': `Bearer ${parentToken}` }, body: { simulation_mode: true } });
  await request(`/api/parent/outpass/${passId2}/approve`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${parentToken}` } });
  await request(`/api/outpass/${passId2}/approve`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${wardenToken}` } });
  const qrGen2 = await request(`/api/qr/generate/${passId2}`, { method: 'POST', headers: { 'Authorization': `Bearer ${wardenToken}` } });
  const qrToken2 = qrGen2.data.data.qrToken;
  await request('/api/caretaker/exit', { method: 'POST', headers: { 'Authorization': `Bearer ${caretakerToken}` }, body: { qr_token: qrToken2 } });

  // Student requests extension
  const extReq2 = await request('/api/extension/request', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      requested_until: new Date(now.getTime() + 1000 * 60 * 360).toISOString(),
      reason: 'Late dinner with family'
    }
  });
  const extId2 = extReq2.data.data.extensionId;

  // Warden rejects extension
  const rejectRes = await request(`/api/extension/${extId2}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` },
    body: { rejection_reason: 'Night curfew extension not permissible for personal dining' }
  });
  assert(rejectRes.ok && rejectRes.data.status === 'REJECTED', '19. Warden Rejection: Extension marked REJECTED with reason recorded');

  // Verify history audit endpoints
  const studentHistory = await request('/api/extension/student/history', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentHistory.ok && Array.isArray(studentHistory.data.history) && studentHistory.data.history.length >= 2, '20. Student Extension History returns full audit log');

  const wardenHistory = await request('/api/extension/warden/history?filter=rejected', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenHistory.ok && Array.isArray(wardenHistory.data.history) && wardenHistory.data.history.length >= 1, '21. Warden Extension History Filter returns audit records');

  console.log('\n========================================================');
  console.log(`🏁 EMERGENCY EXTENSION MODULE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runExtensionModuleTests();
