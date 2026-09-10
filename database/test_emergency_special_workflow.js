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

async function runComprehensiveTest() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING EMERGENCY & SPECIAL OUTPASS INTEGRATION TEST SUITE`);
  console.log(`📡 URL: ${BASE_URL}`);
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

  // 1. Authenticate All 7 Roles
  console.log('--- 1. Authenticating Roles ---');
  const studentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  assert(studentLogin.ok && studentLogin.data.token, 'Student login (21CS042)');
  const studentToken = studentLogin.data.token;

  const parentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  assert(parentLogin.ok && parentLogin.data.token, 'Parent login (9876543210)');
  const parentToken = parentLogin.data.token;

  const advisorLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' }
  });
  assert(advisorLogin.ok && advisorLogin.data.token, 'Class Advisor login (ADV-204)');
  const advisorToken = advisorLogin.data.token;

  const principalLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'PRC-001', password: 'Password@123', role: 'principal' }
  });
  assert(principalLogin.ok && principalLogin.data.token, 'Principal login (PRC-001)');
  const principalToken = principalLogin.data.token;

  const wardenLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
  });
  assert(wardenLogin.ok && wardenLogin.data.token, 'Warden login (WRD-101)');
  const wardenToken = wardenLogin.data.token;

  const caretakerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' }
  });
  assert(caretakerLogin.ok && caretakerLogin.data.token, 'Caretaker login (CTK-305)');
  const caretakerToken = caretakerLogin.data.token;

  const watchmanLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' }
  });
  assert(watchmanLogin.ok && watchmanLogin.data.token, 'Watchman login (GAT-401)');
  const watchmanToken = watchmanLogin.data.token;

  // Setup Parent face template if needed
  const rawVec = new Array(128).fill(0).map((_, i) => Math.sin(i + 1));
  const norm = Math.sqrt(rawVec.reduce((s, v) => s + v * v, 0));
  const registeredFaceVec = rawVec.map(v => Number((v / norm).toFixed(6)));

  const regRes = await request('/api/parent/face/register', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { faceDescriptor: registeredFaceVec, qualityScore: 0.98, singleFace: true }
  });
  assert(regRes.status === 200, 'Parent face registered in DB');

  // Generate matching vector (D = 0.05 < 0.45)
  const matchingFaceVec = registeredFaceVec.map((v, i) => v + (i % 2 === 0 ? 0.003 : -0.003));
  // Generate mismatching vector (D > 0.8)
  const mismatchFaceVec = registeredFaceVec.map((v, i) => (i % 2 === 0 ? -v : v * 0.2));

  // --- 2. Advance Submission Lock Tests ---
  console.log('\n--- 2. Advance Submission Lock & Exemption Tests ---');
  const now = new Date();
  const departIn2Hours = new Date(now.getTime() + 2 * 3600 * 1000);
  const returnIn6Hours = new Date(now.getTime() + 6 * 3600 * 1000);

  // Normal Outpass < 18h MUST FAIL
  const failNormal = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Local Town',
      reason: 'Shopping',
      leaving_date: formatLocalDate(departIn2Hours),
      leaving_time: formatLocalTime(departIn2Hours),
      expected_return_date: formatLocalDate(returnIn6Hours),
      expected_return_time: formatLocalTime(returnIn6Hours),
      student_phone: '9876543210'
    }
  });
  assert(failNormal.status === 400 && !failNormal.data.success, 'Normal Outpass submitted < 18h advance is rejected with HTTP 400');

  // Emergency Outpass < 18h MUST SUCCEED (EXEMPT)
  const emergencySub = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'emergency',
      emergency_type: 'medical',
      emergency_contact: '9988776655',
      additional_remarks: 'Severe fever and illness requiring immediate hospital visit',
      destination: 'City Hospital Emergency Ward',
      reason: 'Medical Emergency',
      leaving_date: formatLocalDate(departIn2Hours),
      leaving_time: formatLocalTime(departIn2Hours),
      expected_return_date: formatLocalDate(returnIn6Hours),
      expected_return_time: formatLocalTime(returnIn6Hours),
      student_phone: '9876543210'
    }
  });
  assert(emergencySub.status === 201 && emergencySub.data.data.requestCode.startsWith('EMG-'), 'Emergency Outpass bypasses 18h lock and generates EMG- code');
  const emergencyId = emergencySub.data.data.id;

  // Special Outpass < 18h MUST SUCCEED (EXEMPT)
  const specialSub = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'special',
      special_type: 'competition',
      additional_remarks: 'Smart India Hackathon Final Round at IIT Madras',
      attachment_url: 'https://hackathon.gov.in/teams/1234',
      destination: 'IIT Madras Research Park, Chennai',
      reason: 'National Hackathon Finals',
      leaving_date: formatLocalDate(departIn2Hours),
      leaving_time: formatLocalTime(departIn2Hours),
      expected_return_date: formatLocalDate(returnIn6Hours),
      expected_return_time: formatLocalTime(returnIn6Hours),
      student_phone: '9876543210'
    }
  });
  assert(specialSub.status === 201 && specialSub.data.data.requestCode.startsWith('SPC-'), 'Special Outpass bypasses 18h lock and generates SPC- code');
  const specialId = specialSub.data.data.id;

  // --- 3. Emergency Outpass Workflow & Anti-Bypass Security ---
  console.log('\n--- 3. Emergency Outpass Workflow (Student → Warden → QR) & Parent Removal ---');
  
  // Verify Emergency Outpass status is immediately PENDING_WARDEN (NO Parent Involvement)
  assert(emergencySub.data.data.status === 'PENDING_WARDEN', 'Emergency Outpass status is immediately PENDING_WARDEN upon submission (Parent bypassed)');

  // 3a. Security Verification: Parent Portal Isolation
  const parentPending = await request('/api/parent/outpass/pending', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  const emergencyInParentList = parentPending.data?.pendingRequests?.some(r => r.id === emergencyId);
  assert(!emergencyInParentList, 'Emergency Outpass is NOT visible in Parent Pending Requests list');

  // Attempting Parent face verification on Emergency Outpass MUST FAIL with HTTP 400
  const parentFaceOnEmg = await request(`/api/parent/outpass/${emergencyId}/face-verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { faceDescriptor: matchingFaceVec, singleFace: true }
  });
  assert(parentFaceOnEmg.status === 400, 'Parent Face Verification rejected on Emergency Outpass (HTTP 400: Not applicable)');

  // Attempting Parent approval on Emergency Outpass MUST FAIL with HTTP 400
  const parentApproveOnEmg = await request(`/api/parent/outpass/${emergencyId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { verification_token: 'dummy-token', parent_message: 'Not applicable' }
  });
  assert(parentApproveOnEmg.status === 400, 'Parent Approval rejected on Emergency Outpass (HTTP 400: Not applicable)');

  // 3b. Anti-Premature QR Security: QR cannot be generated before Warden approval
  const qrEarlyEmg = await request(`/api/qr/generate/${emergencyId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(qrEarlyEmg.status === 400 && !qrEarlyEmg.data.success, 'QR cannot be generated before Warden authorization (HTTP 400)');

  // 3c. Warden Dashboard Verification
  const wardenPending = await request('/api/outpass/warden/pending', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const emgInWardenList = wardenPending.data?.pendingRequests?.find(r => r.id === emergencyId);
  assert(
    emgInWardenList && emgInWardenList.requestType === 'emergency' && emgInWardenList.emergencyContact === '9988776655',
    'Warden receives Emergency Outpass in Pending Queue with emergency details and contact'
  );

  // 3d. Warden Emergency Rejection Test
  const emergencyRejectSub = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'emergency',
      emergency_type: 'personal',
      emergency_contact: '9988776611',
      additional_remarks: 'Test rejection case',
      destination: 'Hometown',
      reason: 'Urgent errand',
      leaving_date: formatLocalDate(departIn2Hours),
      leaving_time: formatLocalTime(departIn2Hours),
      expected_return_date: formatLocalDate(returnIn6Hours),
      expected_return_time: formatLocalTime(returnIn6Hours),
      student_phone: '9876543210'
    }
  });
  const rejectEmgId = emergencyRejectSub.data.data.id;
  const wardenRejectEmg = await request(`/api/outpass/${rejectEmgId}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` },
    body: { rejection_reason: 'Invalid emergency documentation' }
  });
  assert(wardenRejectEmg.status === 200 && wardenRejectEmg.data.success, 'Warden can REJECT Emergency Outpass with reason');
  const [rejectedDbRow] = await pool.query('SELECT status, rejection_reason, rejected_at FROM outpass_requests WHERE id = ?', [rejectEmgId]);
  assert(rejectedDbRow[0].status === 'REJECTED' && rejectedDbRow[0].rejection_reason === 'Invalid emergency documentation', 'Emergency Outpass status updated to REJECTED with stored reason and timestamp');

  // 3e. Warden Emergency Approval Test
  const wardenApproveEmg = await request(`/api/outpass/${emergencyId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenApproveEmg.status === 200 && wardenApproveEmg.data.data.status === 'APPROVED', 'Warden approves Emergency Outpass directly -> status transitions to APPROVED');

  // 3f. QR Code Generation for Emergency Outpass immediately after Warden approval (NO Parent required)
  const qrEmg = await request(`/api/qr/generate/${emergencyId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert((qrEmg.status === 200 || qrEmg.status === 201) && qrEmg.data?.data?.qrToken, 'Digital Security QR immediately generated for Emergency Outpass after Warden approval');
  const emgQrToken = qrEmg.data?.data?.qrToken;

  // Verify Student can fetch active Emergency QR via /api/qr/my-active
  const studentActiveEmg = await request('/api/qr/my-active', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentActiveEmg.status === 200 && studentActiveEmg.data?.activeOutpass?.qrToken === emgQrToken, 'Student retrieves active Emergency QR via /api/qr/my-active');

  // Caretaker Gate Exit Scan
  await pool.query('UPDATE outpass_requests SET from_datetime = DATE_SUB(NOW(), INTERVAL 5 MINUTE), to_datetime = DATE_ADD(NOW(), INTERVAL 2 HOUR) WHERE id = ?', [emergencyId]);
  await pool.query('UPDATE qr_codes SET valid_from = DATE_SUB(NOW(), INTERVAL 5 MINUTE), valid_until = DATE_ADD(NOW(), INTERVAL 2 HOUR) WHERE outpass_request_id = ?', [emergencyId]);

  const exitScanEmg = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: emgQrToken }
  });
  assert(exitScanEmg.status === 200 && exitScanEmg.data.validity === 'VALID', 'Caretaker records Gate Exit for Emergency Outpass (Student is now OUTSIDE)');

  // Duplicate Exit Scan MUST FAIL
  const dupExitEmg = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: emgQrToken }
  });
  assert(dupExitEmg.status === 409 && dupExitEmg.data.validity === 'ALREADY_EXITED', 'Duplicate exit scan rejected with HTTP 409 (ALREADY_EXITED)');

  // Watchman Gate Return Scan
  const returnScanEmg = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: emgQrToken }
  });
  assert(returnScanEmg.status === 200 && returnScanEmg.data.validity === 'RETURN_VERIFIED', 'Watchman records Gate Return for Emergency Outpass (Pass COMPLETED, Student INSIDE)');

  // Duplicate Return Scan MUST FAIL
  const dupReturnEmg = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: emgQrToken }
  });
  assert(dupReturnEmg.status === 409 && dupReturnEmg.data.validity === 'ALREADY_RETURNED', 'Duplicate return scan rejected with HTTP 409 (ALREADY_RETURNED)');

  // Check audit history for Emergency Outpass: MUST NOT contain parent actions
  const [emgHistory] = await pool.query('SELECT action, role, previous_status, new_status FROM outpass_approval_history WHERE outpass_id = ? ORDER BY id ASC', [emergencyId]);
  const emgActions = emgHistory.map(h => h.action);
  const hasParentAction = emgActions.some(a => a.includes('PARENT'));
  assert(
    !hasParentAction &&
    emgActions.includes('WARDEN_APPROVED') &&
    emgActions.includes('GATE_EXIT') &&
    emgActions.includes('GATE_RETURN'),
    'Emergency Outpass audit history contains NO parent approval records (Direct Student → Warden → QR flow preserved)',
    `Recorded actions: ${emgActions.join(' -> ')}`
  );

  // --- 4. Special Outpass Strict 4-Tier Sequence & Anti-Skip Enforcement ---
  console.log('\n--- 4. Special Outpass Strict 4-Tier Sequence Enforcement ---');
  // Attempt to skip Tier 1: Advisor cannot approve before Parent face verification
  const advisorSkip = await request(`/api/advisor/one-day/${specialId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(advisorSkip.status === 400 && !advisorSkip.data.success, 'Tier 2 (Advisor) cannot approve Special Outpass before Tier 1 Parent Face Verification (HTTP 400)');

  // Attempt to skip Tier 2: Principal cannot approve before Advisor approval
  const principalSkip = await request(`/api/principal/one-day/${specialId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(principalSkip.status === 400 && !principalSkip.data.success, 'Tier 3 (Principal) cannot approve Special Outpass before Tier 2 Advisor clearance (HTTP 400)');

  // Attempt to skip Tier 3: Warden cannot approve before Principal approval
  const wardenSkip = await request(`/api/outpass/${specialId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenSkip.status === 400 && !wardenSkip.data.success, 'Tier 4 (Warden) cannot approve Special Outpass before Tier 3 Principal clearance (HTTP 400)');

  // Attempt QR generation before Warden final approval
  const qrEarly = await request(`/api/qr/generate/${specialId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(qrEarly.status === 400 && !qrEarly.data.success, 'QR code cannot be generated before full 4-tier authorization (HTTP 400)');

  // Tier 1: Parent Face Verification and Approval
  const matchFaceSpc = await request(`/api/parent/outpass/${specialId}/face-verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { faceDescriptor: matchingFaceVec, singleFace: true }
  });
  assert(matchFaceSpc.status === 200 && matchFaceSpc.data.faceVerified, 'Tier 1: Parent face biometrics verified successfully');

  const parentApproveSpc = await request(`/api/parent/outpass/${specialId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { verification_token: matchFaceSpc.data.verificationToken, parent_message: 'Consent given for Hackathon participation' }
  });
  assert(parentApproveSpc.status === 200 && parentApproveSpc.data.data.status === 'PENDING_ADVISOR', 'Tier 1 Approved: Special Outpass status moves to PENDING_ADVISOR');

  // Tier 2: Class Advisor Department Clearance
  const advisorApproveSpc = await request(`/api/advisor/one-day/${specialId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(advisorApproveSpc.status === 200 && advisorApproveSpc.data.data.status === 'PENDING_PRINCIPAL', 'Tier 2 Approved: Class Advisor clears pass -> moves to PENDING_PRINCIPAL');

  // Tier 3: Principal Review & Clearance
  const principalApproveSpc = await request(`/api/principal/one-day/${specialId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(principalApproveSpc.status === 200 && principalApproveSpc.data.data.status === 'PENDING_WARDEN', 'Tier 3 Approved: Principal authorizes pass -> moves to PENDING_WARDEN');

  // Tier 4: Warden Final Authorization
  const wardenApproveSpc = await request(`/api/outpass/${specialId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenApproveSpc.status === 200 && wardenApproveSpc.data.data.status === 'APPROVED', 'Tier 4 Approved: Warden provides final authorization -> moves to APPROVED');

  // QR Code Generation for Special Outpass (Warden Authorized)
  const qrSpc = await request(`/api/qr/generate/${specialId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert((qrSpc.status === 200 || qrSpc.status === 201) && qrSpc.data?.data?.qrToken, 'Digital Security QR generated for Special Outpass after all 4 tiers cleared');
  const spcQrToken = qrSpc.data?.data?.qrToken;

  // Verify Student can fetch active Special QR via /api/qr/my-active
  const studentActiveSpc = await request('/api/qr/my-active', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentActiveSpc.status === 200 && studentActiveSpc.data?.activeOutpass?.qrToken === spcQrToken, 'Student retrieves active Special QR via /api/qr/my-active');

  // Gate Exit & Return
  await pool.query('UPDATE outpass_requests SET from_datetime = DATE_SUB(NOW(), INTERVAL 5 MINUTE), to_datetime = DATE_ADD(NOW(), INTERVAL 2 HOUR) WHERE id = ?', [specialId]);
  await pool.query('UPDATE qr_codes SET valid_from = DATE_SUB(NOW(), INTERVAL 5 MINUTE), valid_until = DATE_ADD(NOW(), INTERVAL 2 HOUR) WHERE outpass_request_id = ?', [specialId]);

  const exitSpc = await request('/api/caretaker/exit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${caretakerToken}` },
    body: { qr_token: spcQrToken }
  });
  assert(exitSpc.status === 200 && exitSpc.data.validity === 'VALID', 'Caretaker records Gate Exit for Special Outpass');

  const returnSpc = await request('/api/watchman/return', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${watchmanToken}` },
    body: { qr_token: spcQrToken }
  });
  assert(returnSpc.status === 200 && returnSpc.data.validity === 'RETURN_VERIFIED', 'Watchman records Gate Return for Special Outpass');

  // Check audit history for Special Outpass
  const [spcHistory] = await pool.query('SELECT action, role, previous_status, new_status FROM outpass_approval_history WHERE outpass_id = ? ORDER BY id ASC', [specialId]);
  const spcActions = spcHistory.map(h => h.action);
  assert(
    spcActions.includes('PARENT_FACE_VERIFIED_APPROVED') &&
    spcActions.includes('ADVISOR_APPROVED') &&
    spcActions.includes('PRINCIPAL_APPROVED') &&
    spcActions.includes('WARDEN_APPROVED') &&
    spcActions.includes('GATE_EXIT') &&
    spcActions.includes('GATE_RETURN'),
    'Special Outpass audit history accurately recorded full 4-tier approval sequence and gate movements',
    `Recorded actions: ${spcActions.join(' -> ')}`
  );

  // --- 5. Regression Test: Normal Outpass & One-Day Duty ---
  console.log('\n--- 5. Regression Testing (Normal Outpass & OD) ---');
  // Normal Outpass (>18h)
  const validFutureLeave = new Date(now.getTime() + 24 * 3600 * 1000);
  const validFutureReturn = new Date(validFutureLeave.getTime() + 8 * 3600 * 1000);

  const normalSub = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Hometown Visit',
      reason: 'Family Event',
      leaving_date: formatLocalDate(validFutureLeave),
      leaving_time: formatLocalTime(validFutureLeave),
      expected_return_date: formatLocalDate(validFutureReturn),
      expected_return_time: formatLocalTime(validFutureReturn),
      student_phone: '9876543210'
    }
  });
  assert(normalSub.status === 201 && normalSub.data.data.requestCode.startsWith('OUT-'), 'Normal Outpass submitted >= 18h advance succeeds (OUT- code, status PENDING_PARENT)');

  // One-Day Duty (>12h)
  const validODLeave = new Date(now.getTime() + 15 * 3600 * 1000);
  const validODReturn = new Date(now.getTime() + 20 * 3600 * 1000);

  const odSub = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      event_name: 'Tech Fest 2026',
      event_location: 'PSG College of Tech',
      duty_date: formatLocalDate(validODLeave),
      duty_description: 'Codeathon Participant',
      destination: 'PSG Tech, Coimbatore',
      reason: 'Inter-collegiate Competition',
      leaving_date: formatLocalDate(validODLeave),
      leaving_time: formatLocalTime(validODLeave),
      expected_return_date: formatLocalDate(validODReturn),
      expected_return_time: formatLocalTime(validODReturn),
      student_phone: '9876543210'
    }
  });
  assert(odSub.status === 201 && odSub.data.data.requestCode.startsWith('OD-'), 'One-Day Duty submitted >= 12h advance succeeds (OD- code, status PENDING_ADVISOR)');

  console.log('\n========================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runComprehensiveTest().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
