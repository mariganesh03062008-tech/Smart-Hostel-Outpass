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

async function runAdvisorTests() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING CLASS ADVISOR DASHBOARD & OD WORKFLOW TESTS ON PORT ${PORT}`);
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

  // 1. Static Advisor Dashboard Serves HTTP 200
  const dashRes = await fetch(`${BASE_URL}/advisor-dashboard.html`);
  assert(dashRes.status === 200, '1. Class Advisor Dashboard HTML Serves Successfully (HTTP 200)');

  // 2. Authenticate Class Advisor (ADV-204 - CSE Dept)
  const advisorLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' }
  });
  assert(advisorLogin.ok && advisorLogin.data.token, '2. Authenticate Class Advisor (ADV-204, CSE) & Obtain JWT');
  const advisorToken = advisorLogin.data.token;

  // 3. Authenticate CSE Student (21CS042)
  const studentCseLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  assert(studentCseLogin.ok && studentCseLogin.data.token, '3. Authenticate CSE Student (21CS042) & Obtain JWT');
  const studentCseToken = studentCseLogin.data.token;

  // 4. Authenticate Mech Student (21ME018)
  const studentMechLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21ME018', password: 'Password@123', role: 'student' }
  });
  assert(studentMechLogin.ok && studentMechLogin.data.token, '4. Authenticate Mech Student (21ME018) & Obtain JWT');
  const studentMechToken = studentMechLogin.data.token;

  // 5. Authenticate Warden (WRD-101)
  const wardenLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
  });
  assert(wardenLogin.ok && wardenLogin.data.token, '5. Authenticate Warden (WRD-101) & Obtain JWT');
  const wardenToken = wardenLogin.data.token;

  // 5B. Authenticate Principal (PRC-001)
  const principalLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'PRC-001', password: 'Password@123', role: 'principal' }
  });
  assert(principalLogin.ok && principalLogin.data.token, '5B. Authenticate Principal (PRC-001) & Obtain JWT');
  const principalToken = principalLogin.data.token;

  console.log('\n--- Creating One-Day Duty Requests for Testing Workflow ---');

  // 6. CSE Student Submits OD Request #1 (For Approval Test)
  const od1Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentCseToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'IIT Madras, Chennai',
      reason: 'National Robotics Challenge',
      event_name: 'Shaastra 2026',
      event_location: 'Central Lecture Hall, IITM',
      duty_date: '2026-09-10',
      duty_description: 'Autonomous line follower robotics competition',
      leaving_date: '2026-09-10',
      leaving_time: '06:00',
      expected_return_date: '2026-09-10',
      expected_return_time: '22:00',
      student_phone: '9876500010'
    }
  });
  assert(od1Res.status === 201 && od1Res.data.data.status === 'PENDING_ADVISOR', '6. CSE Student Submits OD #1 (Initial status: PENDING_ADVISOR)');
  const odPassId1 = od1Res.data.data.id;

  // 7. CSE Student Submits OD Request #2 (For Rejection Test)
  const od2Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentCseToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'Local Gaming Arena',
      reason: 'Gaming Championship',
      event_name: 'LAN Esports Cup',
      event_location: 'Coimbatore Gaming Hub',
      duty_date: '2026-09-12',
      duty_description: 'Unofficial video gaming competition',
      leaving_date: '2026-09-12',
      leaving_time: '10:00',
      expected_return_date: '2026-09-12',
      expected_return_time: '18:00',
      student_phone: '9876500010'
    }
  });
  assert(od2Res.status === 201 && od2Res.data.data.status === 'PENDING_ADVISOR', '7. CSE Student Submits OD #2 (Initial status: PENDING_ADVISOR)');
  const odPassId2 = od2Res.data.data.id;

  // 8. Mech Student Submits OD Request #3 (For Department Isolation Test)
  const od3Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentMechToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'L&T Manufacturing Plant, Coimbatore',
      reason: 'Industrial Automation Expo',
      event_name: 'AutoMech Expo 2026',
      event_location: 'L&T Complex, Eachanari',
      duty_date: '2026-09-15',
      duty_description: 'Mechanical automation study visit',
      leaving_date: '2026-09-15',
      leaving_time: '09:00',
      expected_return_date: '2026-09-15',
      expected_return_time: '17:00',
      student_phone: '9876500018'
    }
  });
  assert(od3Res.status === 201 && od3Res.data.data.status === 'PENDING_ADVISOR', '8. Mech Student Submits OD #3 (Initial status: PENDING_ADVISOR)');
  const odPassId3 = od3Res.data.data.id;

  console.log('\n--- Testing Class Advisor Pending Queues & Department Isolation ---');

  // 9. CSE Advisor Pending Queue contains CSE OD #1 and #2
  const advPendingRes = await request('/api/outpass/advisor/pending', {
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  const foundOd1 = advPendingRes.data.pendingDutyRequests?.some(r => r.id === odPassId1);
  const foundOd2 = advPendingRes.data.pendingDutyRequests?.some(r => r.id === odPassId2);
  assert(advPendingRes.ok && foundOd1 && foundOd2, '9. Pending CSE OD requests appear in CSE Advisor Queue');

  // 10. Department Isolation: CSE Advisor Queue DOES NOT contain Mech OD #3!
  const foundMechInCse = advPendingRes.data.pendingDutyRequests?.some(r => r.id === odPassId3);
  assert(!foundMechInCse, '10. Department Isolation: CSE Advisor CANNOT see Mech Department OD request');

  // 11. Department Security: CSE Advisor attempts to approve Mech OD #3 -> BLOCKED (HTTP 403)
  const crossDeptApprove = await request(`/api/outpass/${odPassId3}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(crossDeptApprove.status === 403, '11. Security Rule 5: CSE Advisor Blocked from Approving Mech OD Request (HTTP 403)');

  console.log('\n--- Testing Class Advisor Approval Workflow (Student -> Advisor -> Principal) ---');

  // 12. CSE Advisor approves OD #1
  const advApproveRes = await request(`/api/outpass/${odPassId1}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(
    advApproveRes.ok && advApproveRes.data.data.status === 'PENDING_PRINCIPAL',
    '12. Class Advisor Approves OD #1 → Status Transitions to PENDING_PRINCIPAL'
  );

  // 13. Warden CANNOT approve OD #1 (HTTP 403)
  const wardenDutyRes = await request(`/api/outpass/${odPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenDutyRes.status === 403, '13. Warden is Forbidden from Approving One-Day Permission (HTTP 403)');

  // 14. Principal gives final approval for OD #1
  const principalApproveRes = await request(`/api/outpass/${odPassId1}/principal-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(
    principalApproveRes.ok && principalApproveRes.data.data.status === 'APPROVED',
    '14. Principal Gives Final Approval for OD #1 (Status -> APPROVED)'
  );

  console.log('\n--- Testing Class Advisor Rejection Workflow ---');

  // 15. Advisor rejection without reason fails (HTTP 400)
  const rejNoReason = await request(`/api/outpass/${odPassId2}/advisor-reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` },
    body: { rejection_reason: '' }
  });
  assert(rejNoReason.status === 400, '15. Reject Advisor Rejection Without Reason (HTTP 400)');

  // 16. Advisor rejects OD #2 with reason
  const advRejectRes = await request(`/api/outpass/${odPassId2}/advisor-reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` },
    body: { rejection_reason: 'Unofficial private event. College OD passes are only granted for recognized academic symposiums.' }
  });
  assert(
    advRejectRes.ok && advRejectRes.data.data.status === 'REJECTED',
    '16. Class Advisor Rejects OD #2 With Reason (Status -> REJECTED)'
  );

  // 17. Guardrail: Rejected OD #2 must NOT appear in Warden Pending Queue!
  const wardenCheckRejected = await request('/api/outpass/warden/pending-duty', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const wardenHasRejectedOd2 = wardenCheckRejected.data.pendingDutyRequests?.some(r => r.id === odPassId2);
  assert(!wardenHasRejectedOd2, '17. Guardrail: Advisor-Rejected OD #2 is NEVER sent to Warden');

  console.log('\n--- Testing Student Status Visibility & Rejection Reason ---');

  // 18. Student My Requests shows rejection reason for OD #2
  const studentReqs = await request('/api/outpass/my-requests', {
    headers: { 'Authorization': `Bearer ${studentCseToken}` }
  });
  const studentOd2 = studentReqs.data.requests?.find(r => r.id === odPassId2);
  assert(
    studentOd2 && studentOd2.displayStatus === 'Rejected' && studentOd2.effectiveRejectionReason,
    '18. Student Portal Displays "Rejected" with Class Advisor Rejection Reason'
  );

  console.log('\n--- Testing RBAC on Advisor Endpoints ---');

  // 19. Student CANNOT call advisor approval (HTTP 403)
  const studentCallAdvisorApprove = await request(`/api/outpass/${odPassId2}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${studentCseToken}` }
  });
  assert(studentCallAdvisorApprove.status === 403, '19. Student Blocked from Advisor Approval API (HTTP 403)');

  // 20. Warden CANNOT call advisor approval (HTTP 403)
  const wardenCallAdvisorApprove = await request(`/api/outpass/${odPassId2}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenCallAdvisorApprove.status === 403, '20. Warden Blocked from Advisor Approval API (HTTP 403)');

  console.log('\n========================================================');
  console.log(`🏁 CLASS ADVISOR MODULE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
}

runAdvisorTests();
