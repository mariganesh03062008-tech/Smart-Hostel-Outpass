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

async function runExactFlowTests() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING EXACT QR WORKFLOW & COUNTDOWN TEST SUITE ON PORT ${PORT}`);
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

  // 1. Authenticate All Roles
  const studentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  assert(studentLogin.ok && studentLogin.data.token, '1. Authenticate Student (21CS042) & Obtain JWT');
  const studentToken = studentLogin.data.token;

  const parentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  assert(parentLogin.ok && parentLogin.data.token, '2. Authenticate Parent (9876543210) & Obtain JWT');
  const parentToken = parentLogin.data.token;

  const advisorLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' }
  });
  assert(advisorLogin.ok && advisorLogin.data.token, '3. Authenticate Class Advisor (ADV-204) & Obtain JWT');
  const advisorToken = advisorLogin.data.token;

  const wardenLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
  });
  assert(wardenLogin.ok && wardenLogin.data.token, '4. Authenticate Warden (WRD-101) & Obtain JWT');
  const wardenToken = wardenLogin.data.token;

  const principalLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'PRC-001', password: 'Password@123', role: 'principal' }
  });
  assert(principalLogin.ok && principalLogin.data.token, '4B. Authenticate Principal (PRC-001) & Obtain JWT');
  const principalToken = principalLogin.data.token;

  console.log('\n========================================================');
  console.log('📌 TEST 1: COMPLETE NORMAL OUTPASS WORKFLOW');
  console.log('Student → Parent → Warden → Generate QR → Student Active Outpass');
  console.log('========================================================\n');

  // Step 1: Student submits Normal Outpass
  const now = new Date();
  const thirtyMinsAgo = new Date(now.getTime() - 1000 * 60 * 30);
  const threeHoursLater = new Date(now.getTime() + 1000 * 60 * 180);

  // Submit student live device GPS coordinates
  await request('/api/outpass/student/location', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: { latitude: 13.0000000, longitude: 80.0000000, accuracy: 5.0, source: 'browser_gps' }
  });

  const normalSubRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Gandhipuram, Coimbatore',
      reason: 'Weekend Family Visit',
      leaving_date: formatLocalDate(thirtyMinsAgo),
      leaving_time: formatLocalTime(thirtyMinsAgo),
      expected_return_date: formatLocalDate(threeHoursLater),
      expected_return_time: formatLocalTime(threeHoursLater),
      student_phone: '9876543210'
    }
  });
  assert(normalSubRes.status === 201 && normalSubRes.data.data.status === 'PENDING_PARENT', '1.1 Student submits Normal Outpass (Status: PENDING_PARENT)');
  const normalPassId = normalSubRes.data.data.id;

  // Step 2: Parent verifies GPS proximity (>= 5 meters away)
  const locVerifyRes = await request(`/api/parent/outpass/${normalPassId}/location-verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { latitude: 13.0004500, longitude: 80.0000000, accuracy: 4.0 }
  });

  // Step 2B: Parent grants consent with verification token
  const parentApproveRes = await request(`/api/parent/outpass/${normalPassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: {
      verification_token: locVerifyRes.data?.verificationToken,
      parent_message: 'Approved for weekend family visit.'
    }
  });
  assert(parentApproveRes.ok && parentApproveRes.data.data.status === 'PENDING_WARDEN', '1.2 Parent grants consent (Status -> PENDING_WARDEN)');

  // Step 3: Guardrail: Cannot generate QR before Warden approval
  const preWardenGen = await request(`/api/qr/generate/${normalPassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(preWardenGen.status === 400, '1.3 Guardrail: Block QR generation before Warden final approval (HTTP 400)');

  // Step 4: Warden approves Normal Outpass
  const wardenApproveRes = await request(`/api/outpass/${normalPassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenApproveRes.ok && wardenApproveRes.data.data.status === 'APPROVED', '1.4 Warden Approves Request (Status -> APPROVED)');

  // Step 5: Warden clicks "Generate QR"
  const wardenGenQrRes = await request(`/api/qr/generate/${normalPassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(
    wardenGenQrRes.status === 201 &&
    wardenGenQrRes.data.data.qrToken &&
    wardenGenQrRes.data.data.qrImageData &&
    wardenGenQrRes.data.data.qrData.startsWith('HOSTEL-QR:'),
    '1.5 Warden clicks "Generate QR" -> Secure QR Generated with HOSTEL-QR encoding'
  );
  const normalQrToken = wardenGenQrRes.data.data.qrToken;
  const normalQrId = wardenGenQrRes.data.data.qrId;

  // Step 6: Student sees QR & Countdown in Active Outpass
  const studentActiveNormal = await request('/api/student/active-outpass', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(
    studentActiveNormal.ok &&
    studentActiveNormal.data.hasActiveOutpass === true &&
    studentActiveNormal.data.activeOutpass.qrImageData &&
    studentActiveNormal.data.activeOutpass.computedStatus === 'ACTIVE' &&
    studentActiveNormal.data.activeOutpass.validUntilTimestamp > Date.now(),
    '1.6 Student Dashboard shows Active QR Code, Details & Remaining Time Countdown'
  );

  console.log('\n========================================================');
  console.log('📌 TEST 2: COMPLETE ONE-DAY DUTY WORKFLOW');
  console.log('Student → Class Advisor → Warden → Generate QR → Student Active Outpass');
  console.log('========================================================\n');

  // Step 1: Student submits One-Day Duty
  const dutySubRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'Anna University, Chennai',
      reason: 'State Level Hackathon',
      event_name: 'Smart India Hackathon 2026',
      event_location: 'Main Auditorium',
      duty_date: formatLocalDate(thirtyMinsAgo),
      leaving_date: formatLocalDate(thirtyMinsAgo),
      leaving_time: formatLocalTime(thirtyMinsAgo),
      expected_return_date: formatLocalDate(threeHoursLater),
      expected_return_time: formatLocalTime(threeHoursLater),
      student_phone: '9876543210'
    }
  });
  assert(dutySubRes.status === 201 && dutySubRes.data.data.status === 'PENDING_ADVISOR', '2.1 Student submits One-Day Duty (Status: PENDING_ADVISOR)');
  const dutyPassId = dutySubRes.data.data.id;

  // Step 2: Class Advisor approves OD request
  const advisorApproveRes = await request(`/api/outpass/${dutyPassId}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(advisorApproveRes.ok && advisorApproveRes.data.data.status === 'PENDING_PRINCIPAL', '2.2 Class Advisor Approves OD (Status -> PENDING_PRINCIPAL)');

  // Step 3: Principal approves OD request
  const principalApproveDuty = await request(`/api/outpass/${dutyPassId}/principal-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(principalApproveDuty.ok && principalApproveDuty.data.data.status === 'APPROVED', '2.3 Principal Approves OD Request (Status -> APPROVED)');

  // Step 4: Principal generates QR for OD pass
  const principalGenDutyQr = await request(`/api/qr/generate/${dutyPassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(
    (principalGenDutyQr.status === 201 || principalGenDutyQr.status === 200) &&
    principalGenDutyQr.data.data.qrImageData &&
    principalGenDutyQr.data.data.qrToken,
    '2.4 Principal generates QR for One-Day Duty Pass'
  );
  const dutyQrId = principalGenDutyQr.data.data.qrId;

  // Step 5: Student sees OD QR in Active Outpass
  const studentActiveDuty = await request('/api/student/active-outpass', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(
    studentActiveDuty.ok &&
    studentActiveDuty.data.hasActiveOutpass === true &&
    studentActiveDuty.data.activeOutpass.requestType === 'One-Day Duty' &&
    studentActiveDuty.data.activeOutpass.qrImageData,
    '2.5 Student Dashboard displays One-Day Duty Pass QR Code & Live Countdown'
  );

  console.log('\n========================================================');
  console.log('📌 TEST 3: GUARDRAILS, EXPIRED & REVOKED WORKFLOWS');
  console.log('========================================================\n');

  // 3.1 Non-Warden (Student) cannot generate QR (HTTP 403)
  const studentTryGen = await request(`/api/qr/generate/${normalPassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentTryGen.status === 403, '3.1 Security: Student Blocked from Generating QR (HTTP 403)');

  // 3.2 Rejected Outpass cannot generate QR (HTTP 400)
  const rejSubRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Unknown Place',
      reason: 'Personal',
      leaving_date: '2026-10-01',
      leaving_time: '10:00',
      expected_return_date: '2026-10-01',
      expected_return_time: '18:00',
      student_phone: '9876543210'
    }
  });
  const rejId = rejSubRes.data.data.id;
  await request(`/api/parent/outpass/${rejId}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { rejection_reason: 'Denied by parent' }
  });
  const rejGenQr = await request(`/api/qr/generate/${rejId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(rejGenQr.status === 400, '3.2 Guardrail: Rejected Outpass cannot generate QR (HTTP 400)');

  // 3.3 Warden Revokes Active QR
  const revokeRes = await request(`/api/qr/revoke/${dutyQrId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` },
    body: { revocation_reason: 'Emergency campus curfew' }
  });
  assert(revokeRes.ok && revokeRes.data.data.status === 'REVOKED', '3.3 Warden Revokes Active QR Code (Status -> REVOKED)');

  // 3.4 Validating Revoked QR returns REVOKED
  const valRevoked = await request('/api/qr/validate', {
    method: 'POST',
    body: { qr_token: principalGenDutyQr.data.data.qrToken }
  });
  assert(valRevoked.status === 403 && valRevoked.data.validity === 'REVOKED', '3.4 Server Validator rejects revoked QR (HTTP 403 REVOKED)');

  // 3.5 Validate Active Normal Pass (with HOSTEL-QR prefix)
  const valNormal = await request('/api/qr/validate', {
    method: 'POST',
    body: { qr_token: `HOSTEL-QR:${normalQrToken}` }
  });
  assert(valNormal.status === 200 && valNormal.data.validity === 'VALID', '3.5 Server Validator accepts HOSTEL-QR prefixed token (HTTP 200 VALID)');

  console.log('\n========================================================');
  console.log(`🏁 EXACT WORKFLOW TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
}

runExactFlowTests();
