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

async function runDashboardSeparationTest() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING STRICT DASHBOARD SEPARATION VERIFICATION SUITE`);
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

  try {
    // 1. Authenticate Roles
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
    const matchingFaceVec = registeredFaceVec.map((v, i) => v + (i % 2 === 0 ? 0.003 : -0.003));

    // Dates for test requests
    const now = new Date();
    const departNormal = new Date(now.getTime() + 30 * 3600 * 1000); // 30h advance
    const returnNormal = new Date(departNormal.getTime() + 48 * 3600 * 1000);

    const departDuty = new Date(now.getTime() + 30 * 3600 * 1000);
    const returnDuty = new Date(departDuty.getTime() + 12 * 3600 * 1000);

    const departUrgent = new Date(now.getTime() + 2 * 3600 * 1000);
    const returnUrgent = new Date(departUrgent.getTime() + 6 * 3600 * 1000);

    // 2. Submit All 4 Outpass Types
    console.log('\n--- 2. Submitting 4 Outpass Requests ---');
    
    // a. Normal Outpass
    const normalRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Home Town - Coimbatore',
        reason: 'Weekend Family Visit',
        leaving_date: formatLocalDate(departNormal),
        leaving_time: formatLocalTime(departNormal),
        expected_return_date: formatLocalDate(returnNormal),
        expected_return_time: formatLocalTime(returnNormal),
        student_phone: '9876543210'
      }
    });
    assert(normalRes.status === 201 && normalRes.data.data.requestCode.startsWith('OUT-'), 'Normal Outpass submitted successfully');
    const normalId = normalRes.data.data.id;

    // b. One-Day Duty Outpass
    const dutyRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'one_day_duty',
        event_name: 'Inter-College AI Symposium',
        event_location: 'PSG Tech, Coimbatore',
        duty_date: formatLocalDate(departDuty),
        destination: 'PSG Tech, Coimbatore',
        reason: 'Paper Presentation',
        leaving_date: formatLocalDate(departDuty),
        leaving_time: formatLocalTime(departDuty),
        expected_return_date: formatLocalDate(returnDuty),
        expected_return_time: formatLocalTime(returnDuty),
        student_phone: '9876543210'
      }
    });
    assert(dutyRes.status === 201 && dutyRes.data.data.requestCode.startsWith('OD-'), 'One-Day Duty Outpass submitted successfully');
    const dutyId = dutyRes.data.data.id;

    // c. Emergency Outpass
    const emgRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'emergency',
        emergency_type: 'medical',
        emergency_contact: '9988776655',
        additional_remarks: 'Sudden severe abdominal pain, clinic referral',
        destination: 'Apollo Specialty Hospital',
        reason: 'Medical Emergency',
        leaving_date: formatLocalDate(departUrgent),
        leaving_time: formatLocalTime(departUrgent),
        expected_return_date: formatLocalDate(returnUrgent),
        expected_return_time: formatLocalTime(returnUrgent),
        student_phone: '9876543210'
      }
    });
    assert(emgRes.status === 201 && emgRes.data.data.requestCode.startsWith('EMG-'), 'Emergency Outpass submitted successfully');
    const emgId = emgRes.data.data.id;

    // d. Special Outpass
    const spcRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'special',
        special_type: 'competition',
        additional_remarks: 'National Robotic Competition Finals',
        attachment_url: 'https://competition.edu/proof.pdf',
        destination: 'IIT Madras Research Campus',
        reason: 'National Robotics Finals',
        leaving_date: formatLocalDate(departUrgent),
        leaving_time: formatLocalTime(departUrgent),
        expected_return_date: formatLocalDate(returnUrgent),
        expected_return_time: formatLocalTime(returnUrgent),
        student_phone: '9876543210'
      }
    });
    assert(spcRes.status === 201 && spcRes.data.data.requestCode.startsWith('SPC-'), 'Special Outpass submitted successfully');
    const spcId = spcRes.data.data.id;

    // 3. Parent Dashboard Isolation Verification
    console.log('\n--- 3. Parent Dashboard Isolation Verification ---');
    const parentPendingRes = await request('/api/parent/outpass/pending', {
      headers: { 'Authorization': `Bearer ${parentToken}` }
    });
    assert(parentPendingRes.status === 200, 'Parent pending requests fetched');
    const parentData = parentPendingRes.data;

    const normalInParentNormal = (parentData.normalRequests || []).some(r => r.id === normalId);
    const normalInParentSpecial = (parentData.specialRequests || []).some(r => r.id === normalId);
    assert(normalInParentNormal && !normalInParentSpecial, 'Normal Outpass is in parent.normalRequests ONLY, not in parent.specialRequests');

    const spcInParentSpecial = (parentData.specialRequests || []).some(r => r.id === spcId);
    const spcInParentNormal = (parentData.normalRequests || []).some(r => r.id === spcId);
    assert(spcInParentSpecial && !spcInParentNormal, 'Special Outpass is in parent.specialRequests ONLY, not in parent.normalRequests');

    const dutyInParent = (parentData.pendingRequests || []).some(r => r.id === dutyId);
    assert(!dutyInParent, 'One-Day Duty Outpass is NEVER present in Parent pending requests');

    const emgInParent = (parentData.pendingRequests || []).some(r => r.id === emgId);
    assert(!emgInParent, 'Emergency Outpass is NEVER present in Parent pending requests');

    // 4. Class Advisor Dashboard Isolation Verification
    console.log('\n--- 4. Class Advisor Dashboard Isolation Verification ---');
    const advisorPendingRes = await request('/api/outpass/advisor/pending', {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    assert(advisorPendingRes.status === 200, 'Advisor pending requests fetched');
    const advisorData = advisorPendingRes.data;

    const dutyInAdvisorDuty = (advisorData.dutyRequests || []).some(r => r.id === dutyId);
    const dutyInAdvisorSpecial = (advisorData.specialRequests || []).some(r => r.id === dutyId);
    assert(dutyInAdvisorDuty && !dutyInAdvisorSpecial, 'One-Day Duty is in advisor.dutyRequests ONLY, not in advisor.specialRequests');

    const normalInAdvisor = (advisorData.pendingRequests || []).some(r => r.id === normalId);
    assert(!normalInAdvisor, 'Normal Outpass is NEVER present in Advisor pending requests');

    const emgInAdvisor = (advisorData.pendingRequests || []).some(r => r.id === emgId);
    assert(!emgInAdvisor, 'Emergency Outpass is NEVER present in Advisor pending requests');

    const spcInAdvisorBeforeParent = (advisorData.pendingRequests || []).some(r => r.id === spcId);
    assert(!spcInAdvisorBeforeParent, 'Special Outpass is NOT in Advisor queue before Parent Face Approval');

    // 5. Principal Dashboard Isolation Verification
    console.log('\n--- 5. Principal Dashboard Isolation Verification ---');
    const principalPendingRes = await request('/api/principal/one-day-permissions', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(principalPendingRes.status === 200, 'Principal pending permissions fetched');
    const principalData = principalPendingRes.data;

    const dutyInPrincipalBeforeAdvisor = (principalData.requests || []).some(r => r.id === dutyId);
    assert(!dutyInPrincipalBeforeAdvisor, 'One-Day Duty is NOT in Principal queue before Advisor approval');

    const normalInPrincipal = (principalData.requests || []).some(r => r.id === normalId);
    assert(!normalInPrincipal, 'Normal Outpass is NEVER present in Principal permissions queue');

    const emgInPrincipal = (principalData.requests || []).some(r => r.id === emgId);
    assert(!emgInPrincipal, 'Emergency Outpass is NEVER present in Principal permissions queue');

    // Advisor Approves One-Day Duty
    const advApproveDuty = await request(`/api/advisor/one-day/${dutyId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    assert(advApproveDuty.status === 200, 'Advisor approves One-Day Duty');

    const principalAfterAdvisor = await request('/api/principal/one-day-permissions', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    const dutyInPrincipalDuty = (principalAfterAdvisor.data.dutyRequests || []).some(r => r.id === dutyId);
    const dutyInPrincipalSpecial = (principalAfterAdvisor.data.specialRequests || []).some(r => r.id === dutyId);
    assert(dutyInPrincipalDuty && !dutyInPrincipalSpecial, 'One-Day Duty moves to principal.dutyRequests ONLY, not in principal.specialRequests');

    // 6. Warden Dashboard Isolation Verification
    console.log('\n--- 6. Warden Dashboard Isolation Verification ---');
    const wardenPendingRes = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(wardenPendingRes.status === 200, 'Warden pending requests fetched');
    const wardenData = wardenPendingRes.data;

    // Emergency Outpass must be in warden.emergencyRequests ONLY
    const emgInWardenEmg = (wardenData.emergencyRequests || []).some(r => r.id === emgId);
    const emgInWardenNormal = (wardenData.normalRequests || []).some(r => r.id === emgId);
    const emgInWardenSpecial = (wardenData.specialRequests || []).some(r => r.id === emgId);
    assert(emgInWardenEmg && !emgInWardenNormal && !emgInWardenSpecial, 'Emergency Outpass is in warden.emergencyRequests ONLY, not in normal or special queues');

    // Duty Outpass must NEVER be in Warden queues
    const dutyInWarden = (wardenData.pendingRequests || []).some(r => r.id === dutyId);
    assert(!dutyInWarden, 'One-Day Duty Outpass is NEVER in Warden pending queues (Handled by Advisor & Principal)');

    // Normal Outpass not in Warden queue before Parent approval
    const normalInWardenBeforeParent = (wardenData.normalRequests || []).some(r => r.id === normalId);
    assert(!normalInWardenBeforeParent, 'Normal Outpass is NOT in Warden queue before Parent approval');

    // 7. Workflow Progressions & Segregation Maintenance
    console.log('\n--- 7. Workflow Progressions & Segregation Maintenance ---');
    
    // Parent Approves Normal Outpass
    const faceVerifyNormal = await request(`/api/parent/outpass/${normalId}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: matchingFaceVec, singleFace: true }
    });
    assert(faceVerifyNormal.status === 200, 'Parent Face Verified for Normal Outpass');

    const parentApproveNormal = await request(`/api/parent/outpass/${normalId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: faceVerifyNormal.data.verificationToken, parent_message: 'Approved for weekend' }
    });
    assert(parentApproveNormal.status === 200, 'Parent approves Normal Outpass');

    // Warden queue should now have Normal Outpass in normalRequests ONLY
    const wardenAfterParent = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    const normalInWardenNormal = (wardenAfterParent.data.normalRequests || []).some(r => r.id === normalId);
    const normalInWardenEmg = (wardenAfterParent.data.emergencyRequests || []).some(r => r.id === normalId);
    const normalInWardenSpecial = (wardenAfterParent.data.specialRequests || []).some(r => r.id === normalId);
    assert(normalInWardenNormal && !normalInWardenEmg && !normalInWardenSpecial, 'Normal Outpass appears in warden.normalRequests ONLY, not in emergency or special');

    // Parent Approves Special Outpass
    const faceVerifySpc = await request(`/api/parent/outpass/${spcId}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: matchingFaceVec, singleFace: true }
    });
    assert(faceVerifySpc.status === 200, 'Parent Face Verified for Special Outpass');

    const parentApproveSpc = await request(`/api/parent/outpass/${spcId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: faceVerifySpc.data.verificationToken, parent_message: 'Approved for competition' }
    });
    assert(parentApproveSpc.status === 200 && parentApproveSpc.data.data.status === 'PENDING_ADVISOR', 'Parent approves Special Outpass (status PENDING_ADVISOR)');

    // Advisor queue now has Special Outpass in specialRequests ONLY
    const advisorAfterParent = await request('/api/outpass/advisor/pending', {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    const spcInAdvisorSpecial = (advisorAfterParent.data.specialRequests || []).some(r => r.id === spcId);
    const spcInAdvisorDuty = (advisorAfterParent.data.dutyRequests || []).some(r => r.id === spcId);
    assert(spcInAdvisorSpecial && !spcInAdvisorDuty, 'Special Outpass appears in advisor.specialRequests ONLY, not in dutyRequests');

    // Advisor Approves Special Outpass
    const advApproveSpc = await request(`/api/advisor/one-day/${spcId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    assert(advApproveSpc.status === 200 && advApproveSpc.data.data.status === 'PENDING_PRINCIPAL', 'Advisor approves Special Outpass (status PENDING_PRINCIPAL)');

    // Principal queue now has Special Outpass in specialRequests ONLY
    const principalAfterAdvisor2 = await request('/api/principal/one-day-permissions', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    const spcInPrincipalSpecial = (principalAfterAdvisor2.data.specialRequests || []).some(r => r.id === spcId);
    const spcInPrincipalDuty = (principalAfterAdvisor2.data.dutyRequests || []).some(r => r.id === spcId);
    assert(spcInPrincipalSpecial && !spcInPrincipalDuty, 'Special Outpass appears in principal.specialRequests ONLY, not in dutyRequests');

    // Principal Approves Special Outpass
    const prcApproveSpc = await request(`/api/principal/one-day/${spcId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(prcApproveSpc.status === 200 && prcApproveSpc.data.data.status === 'PENDING_WARDEN', 'Principal approves Special Outpass (status PENDING_WARDEN)');

    // Warden queue now has Special Outpass in specialRequests ONLY
    const wardenAfterPrc = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    const spcInWardenSpecial = (wardenAfterPrc.data.specialRequests || []).some(r => r.id === spcId);
    const spcInWardenNormal = (wardenAfterPrc.data.normalRequests || []).some(r => r.id === spcId);
    const spcInWardenEmg = (wardenAfterPrc.data.emergencyRequests || []).some(r => r.id === spcId);
    assert(spcInWardenSpecial && !spcInWardenNormal && !spcInWardenEmg, 'Special Outpass appears in warden.specialRequests ONLY, not in normalRequests or emergencyRequests');

    // 8. Student Dashboard Segregation Verification
    console.log('\n--- 8. Student Dashboard Segregation Verification ---');
    const studentRequestsRes = await request('/api/outpass/my-requests', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert(studentRequestsRes.status === 200, 'Student requests fetched');
    const studentData = studentRequestsRes.data;

    const myNormal = (studentData.normalRequests || []).some(r => r.id === normalId);
    const myDuty = (studentData.dutyRequests || []).some(r => r.id === dutyId);
    const myEmergency = (studentData.emergencyRequests || []).some(r => r.id === emgId);
    const mySpecial = (studentData.specialRequests || []).some(r => r.id === spcId);

    assert(myNormal, 'Student normalRequests contains Normal Outpass');
    assert(myDuty, 'Student dutyRequests contains One-Day Duty Outpass');
    assert(myEmergency, 'Student emergencyRequests contains Emergency Outpass');
    assert(mySpecial, 'Student specialRequests contains Special Outpass');

    // Verify cross-contamination check
    const normalInStudentDuty = (studentData.dutyRequests || []).some(r => r.id === normalId);
    const emgInStudentNormal = (studentData.normalRequests || []).some(r => r.id === emgId);
    const spcInStudentEmergency = (studentData.emergencyRequests || []).some(r => r.id === spcId);
    assert(!normalInStudentDuty && !emgInStudentNormal && !spcInStudentEmergency, 'Student segregated categories have ZERO cross-contamination');

    console.log('\n========================================================');
    console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================\n');

  } catch (err) {
    console.error('Test Suite Error:', err);
    failed++;
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runDashboardSeparationTest();
