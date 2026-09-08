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

async function runOutpassTests() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING OUTPASS MODULE & WORKFLOW TESTS ON PORT ${PORT}`);
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

  // 1. Verify Student Dashboard static page exists
  const dashRes = await fetch(`${BASE_URL}/student-dashboard.html`);
  assert(dashRes.status === 200, '1. Student Dashboard HTML Serves Successfully (HTTP 200)');

  // 2. Authenticate Student
  const studentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  assert(studentLogin.ok && studentLogin.data.token, '2. Authenticate Student (21CS042) & Obtain JWT');
  const studentToken = studentLogin.data.token;

  // 3. Authenticate Warden
  const wardenLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
  });
  assert(wardenLogin.ok && wardenLogin.data.token, '3. Authenticate Warden (WRD-101) & Obtain JWT');
  const wardenToken = wardenLogin.data.token;

  // 4. Authenticate Class Advisor
  const advisorLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' }
  });
  assert(advisorLogin.ok && advisorLogin.data.token, '4. Authenticate Class Advisor (ADV-204) & Obtain JWT');
  const advisorToken = advisorLogin.data.token;

  console.log('\n--- Testing Outpass Input Validation ---');

  // 5. Validation: Missing destination
  const valNoDest = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      reason: 'Home visit',
      leaving_date: '2026-08-30',
      leaving_time: '14:00',
      expected_return_date: '2026-08-31',
      expected_return_time: '20:00'
    }
  });
  assert(valNoDest.status === 400 && valNoDest.data.success === false, '5. Reject Missing Destination (HTTP 400)');

  // 6. Validation: Missing purpose / reason
  const valNoReason = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Chennai',
      leaving_date: '2026-08-30',
      leaving_time: '14:00',
      expected_return_date: '2026-08-31',
      expected_return_time: '20:00'
    }
  });
  assert(valNoReason.status === 400 && valNoReason.data.success === false, '6. Reject Missing Purpose / Reason (HTTP 400)');

  // 7. Validation: Return Date/Time earlier than Leaving Date/Time
  const valInvalidTime = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Chennai',
      reason: 'Family Event',
      leaving_date: '2026-08-30',
      leaving_time: '18:00',
      expected_return_date: '2026-08-30',
      expected_return_time: '12:00' // earlier!
    }
  });
  assert(valInvalidTime.status === 400 && valInvalidTime.data.success === false, '7. Reject Return Date Earlier Than Leaving Date (HTTP 400)');

  // 8. Validation: Missing Event Info for One-Day Duty
  const valDutyNoEvent = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'MIT Campus',
      reason: 'Paper Presentation',
      leaving_date: '2026-09-01',
      leaving_time: '08:00',
      expected_return_date: '2026-09-01',
      expected_return_time: '19:00'
      // missing event_name & event_location
    }
  });
  assert(valDutyNoEvent.status === 400 && valDutyNoEvent.data.success === false, '8. Reject One-Day Duty When Event Info Missing (HTTP 400)');

  console.log('\n--- Testing Outpass Submission & Workflow Status Routing ---');

  // 9. Submit Normal Outpass
  const pad = n => String(n).padStart(2, '0');
  const formatDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const formatTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const now = new Date();
  const futureNormLeave = new Date(now.getTime() + 24 * 3600 * 1000);
  const futureNormReturn = new Date(now.getTime() + 48 * 3600 * 1000);

  const normalSubmission = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Gandhipuram, Coimbatore',
      reason: 'Weekend Home Visit',
      leaving_date: formatDate(futureNormLeave),
      leaving_time: formatTime(futureNormLeave),
      expected_return_date: formatDate(futureNormReturn),
      expected_return_time: formatTime(futureNormReturn),
      student_phone: '9876543210'
    }
  });

  assert(
    normalSubmission.status === 201 &&
    normalSubmission.data.success === true &&
    normalSubmission.data.data.status === 'PENDING_PARENT',
    '9. Submit Normal Outpass → Initial Status is PENDING_PARENT (HTTP 201)',
    JSON.stringify(normalSubmission.data)
  );

  // 10. Submit One-Day Duty Outpass
  const futureDutyLeave = new Date(now.getTime() + 16 * 3600 * 1000);
  const futureDutyReturn = new Date(now.getTime() + 28 * 3600 * 1000);

  const dutySubmission = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'one_day_duty',
      destination: 'Anna University, Chennai',
      reason: 'National Symposium Project Expo',
      event_name: 'TechExpo 2026',
      event_location: 'ECE Dept, CEG Campus',
      duty_date: formatDate(futureDutyLeave),
      duty_description: 'Representing college in paper presentation competition',
      leaving_date: formatDate(futureDutyLeave),
      leaving_time: formatTime(futureDutyLeave),
      expected_return_date: formatDate(futureDutyReturn),
      expected_return_time: formatTime(futureDutyReturn),
      student_phone: '9876543210'
    }
  });

  assert(
    dutySubmission.status === 201 &&
    dutySubmission.data.success === true &&
    dutySubmission.data.data.status === 'PENDING_ADVISOR',
    '10. Submit One-Day Duty → Initial Status is PENDING_ADVISOR (HTTP 201)',
    JSON.stringify(dutySubmission.data)
  );

  console.log('\n--- Testing Student Requests and Status Summary APIs ---');

  // 11. GET /api/outpass/my-requests
  const myRequests = await request('/api/outpass/my-requests', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });

  assert(
    myRequests.ok &&
    myRequests.data.success === true &&
    myRequests.data.requests.length >= 2,
    `11. Fetch Student My Requests (Found ${myRequests.data.count} items)`,
    JSON.stringify(myRequests.data)
  );

  // 12. GET /api/outpass/status-summary
  const statusSummary = await request('/api/outpass/status-summary', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });

  assert(
    statusSummary.ok &&
    statusSummary.data.success === true &&
    statusSummary.data.stats.total >= 2 &&
    (statusSummary.data.hostelStatus === 'Inside Hostel' || statusSummary.data.hostelStatus === 'Outside Hostel'),
    `12. Fetch Student Status Summary (Total: ${statusSummary.data.stats.total}, Hostel: ${statusSummary.data.hostelStatus})`
  );

  console.log('\n--- Testing Role Authorization for Warden & Class Advisor Endpoints ---');

  // 13. Student access to Warden Pending Queue must be BLOCKED (HTTP 403)
  const studentBlockedFromWarden = await request('/api/outpass/warden/pending', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentBlockedFromWarden.status === 403, '13. Block Student from Accessing Warden Pending Queue (HTTP 403)');

  // 14. Student access to Advisor Pending Queue must be BLOCKED (HTTP 403)
  const studentBlockedFromAdvisor = await request('/api/outpass/advisor/pending', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentBlockedFromAdvisor.status === 403, '14. Block Student from Accessing Advisor Pending Queue (HTTP 403)');

  // 15. Authenticated Warden Access to Warden Pending Queue
  const wardenPending = await request('/api/outpass/warden/pending', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(
    wardenPending.ok &&
    wardenPending.data.success === true &&
    Array.isArray(wardenPending.data.pendingRequests),
    `15. Warden Successfully Accesses Pending Outpass Queue (${wardenPending.data.count} requests awaiting Warden)`
  );

  // 16. Authenticated Class Advisor Access to Advisor Pending Queue
  const advisorPending = await request('/api/outpass/advisor/pending', {
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(
    advisorPending.ok &&
    advisorPending.data.success === true &&
    Array.isArray(advisorPending.data.pendingDutyRequests),
    `16. Class Advisor Successfully Accesses Pending Duty Queue (${advisorPending.data.count} OD requests awaiting Advisor)`
  );

  console.log('\n========================================================');
  console.log(`🏁 OUTPASS MODULE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
}

runOutpassTests();
