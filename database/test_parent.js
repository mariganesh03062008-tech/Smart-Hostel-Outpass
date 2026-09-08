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

async function runParentTests() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING PARENT MODULE & BIOMETRIC CONSENT TESTS ON PORT ${PORT}`);
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

  // 1. Static Parent Dashboard Serves HTTP 200
  const dashRes = await fetch(`${BASE_URL}/parent-dashboard.html`);
  assert(dashRes.status === 200, '1. Parent Dashboard HTML Serves Successfully (HTTP 200)');

  // 2. Authenticate Parent (Phone: 9876543210 - Linked to John Doe 21CS042)
  const parentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  assert(parentLogin.ok && parentLogin.data.token, '2. Authenticate Parent (9876543210) & Obtain JWT');
  const parentToken = parentLogin.data.token;

  // 3. Authenticate Student (21CS042)
  const studentLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  assert(studentLogin.ok && studentLogin.data.token, '3. Authenticate Student (21CS042) & Obtain JWT');
  const studentToken = studentLogin.data.token;

  // 4. Authenticate Warden (WRD-101)
  const wardenLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
  });
  assert(wardenLogin.ok && wardenLogin.data.token, '4. Authenticate Warden (WRD-101) & Obtain JWT');
  const wardenToken = wardenLogin.data.token;

  // 5. Parent Overview & Linked Student Verification
  const overviewRes = await request('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(
    overviewRes.ok && overviewRes.data.linkedStudent?.regNo === '21CS042',
    '5. Parent Overview accurately fetches linked ward (John Doe, 21CS042)'
  );

  console.log('\n--- Creating Outpass Requests for Parent Approval & Rejection Flow ---');

  // 6. Student Submits Normal Outpass #1 (For Parent Approval)
  const norm1Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Family Home, Chennai',
      reason: 'Weekend Home Visit',
      leaving_date: '2026-09-05',
      leaving_time: '17:00',
      expected_return_date: '2026-09-07',
      expected_return_time: '20:00',
      student_phone: '9876500010'
    }
  });
  assert(norm1Res.status === 201 && norm1Res.data.data.status === 'PENDING_PARENT', '6. Student Submits Normal Outpass #1 (Initial status: PENDING_PARENT)');
  const normalPassId1 = norm1Res.data.data.id;

  // 7. Student Submits Normal Outpass #2 (For Parent Rejection)
  const norm2Res = await request('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'City Shopping Complex',
      reason: 'Shopping with friends',
      leaving_date: '2026-09-08',
      leaving_time: '16:00',
      expected_return_date: '2026-09-08',
      expected_return_time: '21:00',
      student_phone: '9876500010'
    }
  });
  assert(norm2Res.status === 201 && norm2Res.data.data.status === 'PENDING_PARENT', '7. Student Submits Normal Outpass #2 (Initial status: PENDING_PARENT)');
  const normalPassId2 = norm2Res.data.data.id;

  console.log('\n--- Testing Parent Pending Queue & Biometric Gate ---');

  // Reset biometric session to test gate verification cleanly
  await request('/api/parent/biometric-verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { reset: true }
  });

  // 8. Parent sees linked student's pending requests
  const parentPendingRes = await request('/api/parent/outpass/pending', {
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  const hasNorm1 = parentPendingRes.data.pendingRequests?.some(r => r.id === normalPassId1);
  const hasNorm2 = parentPendingRes.data.pendingRequests?.some(r => r.id === normalPassId2);
  assert(parentPendingRes.ok && hasNorm1 && hasNorm2, '8. Parent Pending Queue lists linked student requests');

  // 9. Biometric Gate: Approving before biometric verification MUST FAIL (HTTP 403)
  const approveNoBio = await request(`/api/parent/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(approveNoBio.status === 403, '9. Biometric Gate: Approval Blocked without Biometric Verification (HTTP 403)');

  // 10. Perform Software Biometric Verification
  const bioVerifyRes = await request('/api/parent/biometric-verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { simulation_mode: true }
  });
  assert(
    bioVerifyRes.ok && bioVerifyRes.data.biometric?.status === 'VERIFIED',
    '10. Software Biometric Fingerprint Verification Successful'
  );

  console.log('\n--- Testing Parent Approval Workflow (Student -> Parent -> Warden) ---');

  // 11. Parent Approves Outpass #1 with Biometric Signature
  const parentApproveRes = await request(`/api/parent/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(
    parentApproveRes.ok && parentApproveRes.data.data.status === 'PENDING_WARDEN',
    '11. Parent Approves Outpass #1 → Status Transitions to PENDING_WARDEN'
  );

  // 12. Warden Pending Queue NOW includes Outpass #1
  const wardenPending = await request('/api/outpass/warden/pending', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const wardenHasNorm1 = wardenPending.data.pendingRequests?.some(r => r.id === normalPassId1);
  assert(wardenPending.ok && wardenHasNorm1, '12. Warden Queue receives Parent-Approved Outpass #1');

  // 13. Warden Approves Outpass #1 -> Status becomes APPROVED
  const wardenApproveRes = await request(`/api/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(
    wardenApproveRes.ok && wardenApproveRes.data.data.status === 'APPROVED',
    '13. Warden Gives Final Approval for Outpass #1 (Status -> APPROVED)'
  );

  console.log('\n--- Testing Parent Rejection Workflow ---');

  // 14. Parent Rejection without reason fails (HTTP 400)
  const rejNoReason = await request(`/api/parent/outpass/${normalPassId2}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { rejection_reason: '' }
  });
  assert(rejNoReason.status === 400, '14. Reject Parent Rejection Without Reason (HTTP 400)');

  // 15. Parent Rejects Outpass #2 with Reason
  const parentRejectRes = await request(`/api/parent/outpass/${normalPassId2}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { rejection_reason: 'Exams next week. Focus on study at hostel.' }
  });
  assert(
    parentRejectRes.ok && parentRejectRes.data.data.status === 'REJECTED',
    '15. Parent Rejects Outpass #2 with Reason (Status -> REJECTED)'
  );

  // 16. Guardrail: Rejected Outpass #2 is NEVER sent to Warden
  const wardenCheckRej = await request('/api/outpass/warden/pending', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const wardenHasRej = wardenCheckRej.data.pendingRequests?.some(r => r.id === normalPassId2);
  assert(!wardenHasRej, '16. Guardrail: Parent-Rejected Outpass #2 is NEVER sent to Warden');

  console.log('\n--- Testing Multilingual Parent Messaging (English & Tamil) ---');

  // 17. Parent Sends English Message
  const msgEnRes = await request('/api/parent/messages', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { message: 'Dear Warden, I have approved John home visit for the weekend. Thank you.' }
  });
  assert(msgEnRes.status === 201 && msgEnRes.data.success, '17. Parent Sends English Message');

  // 18. Parent Sends Tamil Unicode Message
  const msgTaRes = await request('/api/parent/messages', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { message: 'விடுதி நிர்வாகத்திற்கு வணக்கம்: எனது மகனின் வெளியூர் பயணத்திற்கு ஒப்புதல் அளித்துள்ளேன். - பெற்றோர்' }
  });
  assert(msgTaRes.status === 201 && msgTaRes.data.success, '18. Parent Sends Tamil Message (தமிழ் Unicode utf8mb4)');

  // 19. Retrieve Parent Message Log
  const msgListRes = await request('/api/parent/messages', {
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(msgListRes.ok && msgListRes.data.count >= 2, `19. Retrieve Parent Message Stream (Found ${msgListRes.data.count} messages)`);

  console.log('\n--- Testing Student Status Visibility ---');

  // 20. Student My Requests shows Parent Rejection Reason
  const studentReqs = await request('/api/outpass/my-requests', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  const studentNorm2 = studentReqs.data.requests?.find(r => r.id === normalPassId2);
  assert(
    studentNorm2 && studentNorm2.displayStatus === 'Rejected' && studentNorm2.effectiveRejectionReason,
    '20. Student Portal Displays "Rejected" with Parent Stated Rejection Reason'
  );

  console.log('\n--- Testing Role Authorization & Cross-Role Security ---');

  // 21. Student CANNOT access parent endpoints (HTTP 403)
  const studentCallParent = await request('/api/parent/outpass/pending', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(studentCallParent.status === 403, '21. Student Blocked from Accessing Parent Endpoints (HTTP 403)');

  // 22. Warden CANNOT call parent approve (HTTP 403)
  const wardenCallParentApprove = await request(`/api/parent/outpass/${normalPassId1}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenCallParentApprove.status === 403, '22. Warden Blocked from Parent Approval API (HTTP 403)');

  console.log('\n========================================================');
  console.log(`🏁 PARENT MODULE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
}

runParentTests();
