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

async function runWardenTests() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING WARDEN DASHBOARD & APPROVAL WORKFLOW TESTS ON PORT ${PORT}`);
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

  // 1. Static Warden Dashboard Serves HTTP 200
  const dashRes = await fetch(`${BASE_URL}/warden-dashboard.html`);
  assert(dashRes.status === 200, '1. Warden Dashboard HTML Serves Successfully (HTTP 200)');

  // 2. Authenticate Warden (WRD-101)
  const wardenLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
  });
  assert(wardenLogin.ok && wardenLogin.data.token, '2. Warden Authentication (WRD-101) & JWT Issuance');
  const wardenToken = wardenLogin.data.token;

  // 3. Authenticate Student (21CS042)
  const studentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  assert(studentLogin.ok && studentLogin.data.token, '3. Student Authentication (21CS042) & JWT Issuance');
  const studentToken = studentLogin.data.token;

  // 4. Authenticate Class Advisor (ADV-204)
  const advisorLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' }
  });
  assert(advisorLogin.ok && advisorLogin.data.token, '4. Class Advisor Authentication (ADV-204) & JWT Issuance');
  const advisorToken = advisorLogin.data.token;

  // 5. Authenticate Parent for normal outpass consent
  const parentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  assert(parentLogin.ok && parentLogin.data.token, '5. Authenticate Parent (9876543210) & JWT Issuance');
  const parentToken = parentLogin.data.token;

  // 5B. Authenticate Principal (PRC-001)
  const principalLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'PRC-001', password: 'Password@123', role: 'principal' }
  });
  assert(principalLogin.ok && principalLogin.data.token, '5B. Authenticate Principal (PRC-001) & Obtain JWT');
  const principalToken = principalLogin.data.token;

  // 5.1 Authenticate Watchman (SEC-001) for security check
  const watchmanLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'SEC-001', password: 'Password@123', role: 'watchman' }
  });
  const watchmanToken = watchmanLogin.data.token;

  // Submit student live device GPS coordinates (ensures 5-minute freshness)
  const studentGpsRes = await request('/api/outpass/student/location', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: { latitude: 13.0000000, longitude: 80.0000000, accuracy: 5.0, source: 'browser_gps' }
  });
  assert(studentGpsRes.ok, '5C. Student Live GPS Location Guard updated and active');

  console.log('\n--- Creating Fresh Outpass Requests For Warden Testing ---');

  const pad = n => String(n).padStart(2, '0');
  const fDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dLeave = new Date(Date.now() + 48 * 3600 * 1000);
  const dReturn = new Date(Date.now() + 72 * 3600 * 1000);
  const leavingDateStr = fDate(dLeave);
  const returnDateStr = fDate(dReturn);

  // 6. Submit Normal Outpass #1 (For Approval Test)
  const norm1Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Avinashi Road, Coimbatore',
      reason: 'Doctor Appointment',
      leaving_date: leavingDateStr,
      leaving_time: '15:00',
      expected_return_date: leavingDateStr,
      expected_return_time: '19:30',
      student_phone: '9876543210'
    }
  });
  assert(norm1Res.status === 201 && norm1Res.data.data.status === 'PENDING_PARENT', '6. Submit Normal Outpass #1 (PENDING_PARENT)');
  const normalPassId1 = norm1Res.data.data.id;

  // Parent verifies GPS location (50m >= 5m) and approves #1
  const locVerify1 = await request(`/api/parent/outpass/${normalPassId1}/location-verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { latitude: 13.0004500, longitude: 80.0000000, accuracy: 4.0 }
  });
  const parentApprove1 = await request(`/api/parent/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: {
      verification_token: locVerify1.data?.verificationToken,
      parent_message: 'Approved for medical consultation.'
    }
  });
  assert(parentApprove1.ok && parentApprove1.data.data.status === 'PENDING_WARDEN', '6B. Parent grants consent with GPS verification for #1 (Status -> PENDING_WARDEN)');

  // 7. Submit Normal Outpass #2 (For Rejection Test)
  const norm2Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Mall / Cinema Hall',
      reason: 'Late Night Movie',
      leaving_date: leavingDateStr,
      leaving_time: '21:00',
      expected_return_date: returnDateStr,
      expected_return_time: '02:00',
      student_phone: '9876543210'
    }
  });
  assert(norm2Res.status === 201 && norm2Res.data.data.status === 'PENDING_PARENT', '7. Submit Normal Outpass #2 (PENDING_PARENT)');
  const normalPassId2 = norm2Res.data.data.id;

  // Parent verifies GPS location and approves #2
  const locVerify2 = await request(`/api/parent/outpass/${normalPassId2}/location-verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { latitude: 13.0004500, longitude: 80.0000000, accuracy: 4.0 }
  });
  const parentApprove2 = await request(`/api/parent/outpass/${normalPassId2}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: {
      verification_token: locVerify2.data?.verificationToken,
      parent_message: 'Consent granted.'
    }
  });
  assert(parentApprove2.ok && parentApprove2.data.data.status === 'PENDING_WARDEN', '7B. Parent grants consent with GPS verification for #2 (Status -> PENDING_WARDEN)');

  // 7C. Submit Normal Outpass #3 (Parent Rejection Guardrail Test)
  const norm3Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Late Night Party',
      reason: 'Weekend Clubbing',
      leaving_date: leavingDateStr,
      leaving_time: '22:00',
      expected_return_date: returnDateStr,
      expected_return_time: '04:00',
      student_phone: '9876543210'
    }
  });
  const normalPassId3 = norm3Res.data?.data?.id;
  const parentRejectRes = await request(`/api/parent/outpass/${normalPassId3}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { rejection_reason: 'Parent disapproves late night party.' }
  });
  assert(parentRejectRes.ok, '7C. Parent Rejects Outpass #3 with Reason');

  // 8. Submit One-Day Duty Outpass
  const dutyRes = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'PSG College of Tech, Coimbatore',
      reason: 'State Level Coding Hackathon',
      event_name: 'Hackathon 2026',
      event_location: 'IT Block, PSG Tech',
      duty_date: leavingDateStr,
      duty_description: '24-hour hackathon representation',
      leaving_date: leavingDateStr,
      leaving_time: '08:00',
      expected_return_date: returnDateStr,
      expected_return_time: '12:00',
      student_phone: '9876543210'
    }
  });
  assert(dutyRes.status === 201 && dutyRes.data.data.status === 'PENDING_ADVISOR', '8. Submit One-Day Duty (Initially PENDING_ADVISOR)');
  const dutyPassId = dutyRes.data.data.id;

  console.log('\n--- Testing Warden Pending Queues & Workflow Guardrails ---');

  // 9. Check Warden Pending Normal Queue includes #1 and #2, and excludes Parent-Rejected #3
  const wardenNormPending = await request('/api/outpass/warden/pending', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const foundNorm1 = wardenNormPending.data.pendingRequests?.find(r => r.id === normalPassId1);
  const foundNorm2 = wardenNormPending.data.pendingRequests?.find(r => r.id === normalPassId2);
  const foundNorm3 = wardenNormPending.data.pendingRequests?.find(r => r.id === normalPassId3);
  assert(wardenNormPending.ok && Boolean(foundNorm1) && Boolean(foundNorm2), '9. Pending Normal Outpasses appear in Warden Queue');
  assert(!foundNorm3, '9B. Guardrail: Parent-Rejected Outpass DOES NOT appear in Warden Queue');

  // 9C. Verify Parent Response Display fields in Warden Queue
  assert(
    foundNorm1.studentName &&
    foundNorm1.studentRegNo &&
    foundNorm1.parentVerifiedMobile === '9876543210' &&
    foundNorm1.parentApprovalLat !== null &&
    foundNorm1.parentApprovalLng !== null &&
    foundNorm1.distanceMeters >= 5 &&
    foundNorm1.locationVerificationResult === 'VERIFIED' &&
    foundNorm1.parentMessage === 'Approved for medical consultation.' &&
    foundNorm1.studentLocLat !== null &&
    foundNorm1.studentLocLng !== null,
    '9C. Parent Response Display verified (Student Info, Mobile, GPS, Accuracy, Distance, Message, Verification Result)'
  );

  // 10. Check Warden Pending Duty Queue DOES NOT include Duty request before Advisor approval!
  const wardenDutyBeforeAdvisor = await request('/api/outpass/warden/pending-duty', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const foundDutyEarly = wardenDutyBeforeAdvisor.data.pendingDutyRequests?.some(r => r.id === dutyPassId);
  assert(!foundDutyEarly, '10. Guardrail: One-Day Duty request DOES NOT appear in Warden Queue before Advisor approval');

  // 11. Class Advisor approves One-Day Duty request
  const advisorApproveRes = await request(`/api/outpass/${dutyPassId}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(
    advisorApproveRes.ok && advisorApproveRes.data.data.status === 'PENDING_PRINCIPAL',
    '11. Class Advisor Approves OD Pass → Transitions status to PENDING_PRINCIPAL'
  );

  // 12. Security Rule: Warden CANNOT approve One-Day Duty (HTTP 403)
  const wardenDutyForbidden = await request(`/api/outpass/${dutyPassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenDutyForbidden.status === 403, '12. Warden is Forbidden from Approving One-Day Duty (HTTP 403)');

  console.log('\n--- Testing Warden Approval & Rejection APIs ---');

  // 13. Warden Approves Normal Outpass #1
  const approveRes = await request(`/api/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(
    approveRes.ok && approveRes.data.success === true && approveRes.data.data.status === 'APPROVED',
    '13. Warden Approves Normal Outpass #1 (Status -> APPROVED)'
  );

  // 13B. Trigger QR generation after Warden Approval
  const qrGenRes = await request(`/api/qr/generate/${normalPassId1}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(
    (qrGenRes.status === 201 || qrGenRes.status === 200) && qrGenRes.data.data?.qrToken,
    '13B. QR Code Generated after valid Warden Approval'
  );

  // 13C. Student Dashboard can retrieve active approved outpass and QR
  const studentActive = await request('/api/student/active-outpass', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(
    studentActive.ok && studentActive.data.hasActiveOutpass === true && studentActive.data.activeOutpass.qrToken,
    '13C. Student Dashboard successfully retrieves active approved outpass & QR code'
  );

  // 14. Warden Rejection without reason fails (HTTP 400)
  const rejectNoReason = await request(`/api/outpass/${normalPassId2}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` },
    body: { rejection_reason: '' }
  });
  assert(rejectNoReason.status === 400 && rejectNoReason.data.success === false, '14. Reject Warden Rejection Without Reason (HTTP 400)');

  // 15. Warden Rejects Normal Outpass #2 with Reason
  const rejectRes = await request(`/api/outpass/${normalPassId2}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` },
    body: { rejection_reason: 'Late night movies not permitted on weekday evenings.' }
  });
  assert(
    rejectRes.ok && rejectRes.data.success === true && rejectRes.data.data.status === 'REJECTED',
    '15. Warden Rejects Normal Outpass #2 With Reason (Status -> REJECTED)'
  );

  // 15B. QR is NOT generated for rejected outpass
  const rejectQrRes = await request(`/api/qr/generate/${normalPassId2}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(rejectQrRes.status === 400, '15B. Guardrail: QR is NOT generated for rejected outpass (HTTP 400)');

  // 16. Principal Approves One-Day Duty Pass
  const approveDutyRes = await request(`/api/outpass/${dutyPassId}/principal-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(
    approveDutyRes.ok && approveDutyRes.data.data.status === 'APPROVED',
    '16. Principal Approves One-Day Duty Pass (Status -> APPROVED)'
  );

  // 17. Verify Approved & Rejected requests are removed from Warden Pending list
  const refreshedPending = await request('/api/outpass/warden/pending', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const stillHas1 = refreshedPending.data.pendingRequests?.some(r => r.id === normalPassId1);
  const stillHas2 = refreshedPending.data.pendingRequests?.some(r => r.id === normalPassId2);
  assert(!stillHas1 && !stillHas2, '17. Approved & Rejected requests automatically disappear from Warden Pending Queue');

  // 18. Verify Warden Overview Stats
  const overviewRes = await request('/api/outpass/warden/overview', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(
    overviewRes.ok &&
    overviewRes.data.stats.approvedTotal >= 2 &&
    overviewRes.data.stats.rejectedTotal >= 1,
    `18. Warden Overview Metrics Updated (Approved: ${overviewRes.data.stats.approvedTotal}, Rejected: ${overviewRes.data.stats.rejectedTotal})`
  );

  console.log('\n--- Testing Security Isolation & Role Authorization ---');

  // 19. Sensitive parent location data is NOT exposed through student APIs
  const studentMyRequests = await request('/api/outpass/my-requests', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  const myReqSample = studentMyRequests.data.requests?.[0];
  const leaksParentLocation = myReqSample && (
    'parentApprovalLat' in myReqSample ||
    'parent_approval_lat' in myReqSample ||
    'parentApprovalLng' in myReqSample ||
    'distanceMeters' in myReqSample ||
    'parentVerifiedMobile' in myReqSample
  );
  assert(!leaksParentLocation, '19. Security Rule: Sensitive parent location & mobile data NOT exposed to student APIs');

  // 20. Student CANNOT call Warden approve (HTTP 403)
  const studentApproveBlock = await request(`/api/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentApproveBlock.status === 403, '20. Student Blocked from Calling Warden Approve API (HTTP 403)');

  // 21. Watchman CANNOT call Warden approve (HTTP 403)
  const watchmanApproveBlock = await request(`/api/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${watchmanToken}` }
  });
  assert(watchmanApproveBlock.status === 403, '21. Watchman Blocked from Calling Warden Approve API (HTTP 403)');

  // 22. Class Advisor CANNOT call Warden approve (HTTP 403)
  const advisorWardenBlock = await request(`/api/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(advisorWardenBlock.status === 403, '22. Class Advisor Blocked from Calling Warden Approve API (HTTP 403)');

  console.log('\n========================================================');
  console.log(`🏁 WARDEN MODULE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
}

runWardenTests();
