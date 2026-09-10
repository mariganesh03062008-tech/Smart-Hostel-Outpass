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

async function runSpecialDashboardSeparationTest() {
  console.log('🧪 ========================================================');
  console.log('🚀 SPECIAL OUTPASS DASHBOARD SEPARATION VERIFICATION SUITE');
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

    // Parent face registration
    const rawVec = new Array(128).fill(0).map((_, i) => Math.sin(i + 1));
    const norm = Math.sqrt(rawVec.reduce((s, v) => s + v * v, 0));
    const registeredFaceVec = rawVec.map(v => Number((v / norm).toFixed(6)));
    await request('/api/parent/face/register', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: registeredFaceVec, qualityScore: 0.98, singleFace: true }
    });
    const matchingFaceVec = registeredFaceVec.map((v, i) => v + (i % 2 === 0 ? 0.003 : -0.003));

    const now = new Date();
    const departNormal = new Date(now.getTime() + 30 * 3600 * 1000);
    const returnNormal = new Date(departNormal.getTime() + 48 * 3600 * 1000);
    const departDuty = new Date(now.getTime() + 30 * 3600 * 1000);
    const returnDuty = new Date(departDuty.getTime() + 12 * 3600 * 1000);
    const departUrgent = new Date(now.getTime() + 2 * 3600 * 1000);
    const returnUrgent = new Date(departUrgent.getTime() + 6 * 3600 * 1000);

    // 2. Submit 4 Requests (Normal, One-Day, Emergency, Special)
    console.log('\n--- 2. Submitting Request Types ---');
    const normalRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Home Town - Coimbatore',
        reason: 'Weekend Visit',
        leaving_date: formatLocalDate(departNormal),
        leaving_time: formatLocalTime(departNormal),
        expected_return_date: formatLocalDate(returnNormal),
        expected_return_time: formatLocalTime(returnNormal),
        student_phone: '9876543210'
      }
    });
    assert(normalRes.status === 201, 'Normal Outpass submitted');
    const normalId = normalRes.data.data.id;

    const dutyRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'one_day_duty',
        event_name: 'Hackathon 2026',
        event_location: 'PSG Tech Coimbatore',
        duty_date: formatLocalDate(departDuty),
        destination: 'PSG Tech Coimbatore',
        reason: 'Coding Hackathon',
        leaving_date: formatLocalDate(departDuty),
        leaving_time: formatLocalTime(departDuty),
        expected_return_date: formatLocalDate(returnDuty),
        expected_return_time: formatLocalTime(returnDuty),
        student_phone: '9876543210'
      }
    });
    assert(dutyRes.status === 201, 'One-Day Duty Outpass submitted');
    const dutyId = dutyRes.data.data.id;

    const emgRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'emergency',
        emergency_type: 'medical',
        emergency_contact: '9988776655',
        additional_remarks: 'Sudden toothache',
        destination: 'Dental Clinic',
        reason: 'Severe Toothache',
        leaving_date: formatLocalDate(departUrgent),
        leaving_time: formatLocalTime(departUrgent),
        expected_return_date: formatLocalDate(returnUrgent),
        expected_return_time: formatLocalTime(returnUrgent),
        student_phone: '9876543210'
      }
    });
    assert(emgRes.status === 201, 'Emergency Outpass submitted');
    const emgId = emgRes.data.data.id;

    const spcRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'special',
        special_type: 'competition',
        additional_remarks: 'National RoboWars Event',
        destination: 'IIT Madras',
        reason: 'RoboWars Finals',
        leaving_date: formatLocalDate(departUrgent),
        leaving_time: formatLocalTime(departUrgent),
        expected_return_date: formatLocalDate(returnUrgent),
        expected_return_time: formatLocalTime(returnUrgent),
        student_phone: '9876543210'
      }
    });
    assert(spcRes.status === 201, 'Special Outpass submitted');
    const spcId = spcRes.data.data.id;

    // 3. Test Requirement A: Special request submitted
    console.log('\n--- 3. Testing Requirement A: Advisor Isolation ---');
    // Before Parent approval, Special is NOT in Advisor queue
    const advDutyBeforeParent = await request('/api/advisor/duty/pending', {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    const advSpecialBeforeParent = await request('/api/advisor/special/pending', {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    assert(
      advDutyBeforeParent.ok && advDutyBeforeParent.data.dutyRequests.some(r => r.id === dutyId),
      'One-Day Duty appears in /api/advisor/duty/pending'
    );
    assert(
      !advDutyBeforeParent.data.dutyRequests.some(r => r.id === spcId),
      'Special Outpass does NOT appear in /api/advisor/duty/pending'
    );
    assert(
      !advSpecialBeforeParent.data.specialRequests.some(r => r.id === spcId),
      'Special Outpass does NOT appear in /api/advisor/special/pending before Parent Face Approval'
    );

    // Parent Face Verifies and Approves Special Outpass
    const faceVerify = await request(`/api/parent/outpass/${spcId}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: matchingFaceVec, singleFace: true }
    });
    assert(faceVerify.status === 200, 'Parent Face Verified for Special Outpass');

    const parentApprove = await request(`/api/parent/outpass/${spcId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: faceVerify.data.verificationToken, parent_message: 'Approved for RoboWars' }
    });
    assert(parentApprove.status === 200, 'Parent approves Special Outpass');

    // After Parent approval: Special appears in Advisor Special section, NOT in One-Day section
    const advDutyAfterParent = await request('/api/advisor/duty/pending', {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    const advSpecialAfterParent = await request('/api/advisor/special/pending', {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    assert(
      !advDutyAfterParent.data.dutyRequests.some(r => r.id === spcId),
      'Special request does NOT appear in Class Advisor One-Day section (/api/advisor/duty/pending)'
    );
    assert(
      advSpecialAfterParent.data.specialRequests.some(r => r.id === spcId),
      'Special request appears in Class Advisor Special section (/api/advisor/special/pending)'
    );
    assert(
      !advSpecialAfterParent.data.specialRequests.some(r => r.id === dutyId),
      'One-Day Duty does NOT appear in Class Advisor Special section (/api/advisor/special/pending)'
    );

    // Also check generic endpoint /api/advisor/pending
    const advGeneric = await request('/api/advisor/pending', {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    assert(
      advGeneric.data.dutyRequests.some(r => r.id === dutyId) && !advGeneric.data.dutyRequests.some(r => r.id === spcId),
      'Advisor generic endpoint partitions dutyRequests cleanly (Zero Special Outpasses in dutyRequests)'
    );
    assert(
      advGeneric.data.specialRequests.some(r => r.id === spcId) && !advGeneric.data.specialRequests.some(r => r.id === dutyId),
      'Advisor generic endpoint partitions specialRequests cleanly (Zero One-Day passes in specialRequests)'
    );

    // 4. Test Requirement B: Advisor Approves Special Outpass
    console.log('\n--- 4. Testing Requirement B: Advisor Approval Transitions ---');
    const advisorApproveSpc = await request(`/api/advisor/special/${spcId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    assert(advisorApproveSpc.status === 200, 'Class Advisor approves Special Outpass via /api/advisor/special/:id/approve');

    // Special disappears from Advisor Special queue
    const advSpecialAfterApproval = await request('/api/advisor/special/pending', {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    assert(
      !advSpecialAfterApproval.data.specialRequests.some(r => r.id === spcId),
      'Special request disappears from Advisor Special queue after Advisor approval'
    );

    // 5. Test Requirement C: Principal Dashboard Isolation
    console.log('\n--- 5. Testing Requirement C: Principal Isolation ---');
    const prcOneDay = await request('/api/principal/one-day-permissions', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    const prcSpecial = await request('/api/principal/special-permissions', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(
      prcSpecial.ok && prcSpecial.data.specialRequests.some(r => r.id === spcId),
      'Special request appears in Principal Special section (/api/principal/special-permissions)'
    );
    assert(
      !prcSpecial.data.specialRequests.some(r => r.id === dutyId),
      'One-Day Duty does NOT appear in Principal Special section'
    );
    assert(
      !prcOneDay.data.dutyRequests.some(r => r.id === spcId),
      'Special request does NOT appear in Principal One-Day dutyRequests table'
    );
    assert(
      !prcOneDay.data.permissions.some(r => r.id === spcId),
      'Special request does NOT appear in Principal One-Day permissions table'
    );

    // Check Overview Counters
    const prcOverview = await request('/api/principal/overview', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      prcOverview.data.stats.pendingSpecialPermissions >= 1,
      `Principal Overview stat pendingSpecialPermissions correctly tracked (${prcOverview.data.stats.pendingSpecialPermissions})`
    );

    // 6. Test Requirement D: Principal Approves Special Outpass
    console.log('\n--- 6. Testing Requirement D: Principal Approval Transitions ---');
    const prcApproveSpc = await request(`/api/principal/special/${spcId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(prcApproveSpc.status === 200, 'Principal approves Special Outpass via /api/principal/special/:id/approve');

    // Disappears from Principal Special queue
    const prcSpecialAfterApproval = await request('/api/principal/special-permissions', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      !prcSpecialAfterApproval.data.specialRequests.some(r => r.id === spcId),
      'Special request disappears from Principal Special queue after approval'
    );

    // Moves to Warden Special queue
    const wardenPending = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(
      wardenPending.data.specialRequests.some(r => r.id === spcId),
      'Special request moves to Warden Special queue (warden.specialRequests)'
    );
    assert(
      !wardenPending.data.normalRequests.some(r => r.id === spcId),
      'Special request does NOT appear in Warden normalRequests'
    );
    assert(
      !wardenPending.data.emergencyRequests.some(r => r.id === spcId),
      'Special request does NOT appear in Warden emergencyRequests'
    );

    // 7. Test Requirements E, F, G: Normal, One-Day, Emergency Isolation
    console.log('\n--- 7. Testing Requirements E, F, G: Normal, One-Day, Emergency Isolation ---');
    // Normal request: in parent approval, never in advisor, never in principal
    const advHasNormal = (advGeneric.data.dutyRequests || []).some(r => r.id === normalId) ||
                         (advGeneric.data.specialRequests || []).some(r => r.id === normalId);
    assert(!advHasNormal, 'Requirement E: Normal request never appears in Class Advisor dashboard');

    const prcHasNormal = (prcOneDay.data.dutyRequests || []).some(r => r.id === normalId) ||
                         (prcSpecial.data.specialRequests || []).some(r => r.id === normalId);
    assert(!prcHasNormal, 'Requirement E: Normal request never appears in Principal dashboard');

    // One-Day request: strictly in advisor duty queue, never in special queue
    const spcHasDuty = advSpecialAfterParent.data.specialRequests.some(r => r.id === dutyId) ||
                       prcSpecial.data.specialRequests.some(r => r.id === dutyId);
    assert(!spcHasDuty, 'Requirement F: One-Day Duty request remains in One-Day workflow (never in Special queues)');

    // Emergency request: strictly warden only, never in advisor or principal
    const advHasEmg = (advGeneric.data.dutyRequests || []).some(r => r.id === emgId) ||
                      (advGeneric.data.specialRequests || []).some(r => r.id === emgId);
    assert(!advHasEmg, 'Requirement G: Emergency request never appears in Class Advisor dashboard');

    const prcHasEmg = (prcOneDay.data.dutyRequests || []).some(r => r.id === emgId) ||
                      (prcSpecial.data.specialRequests || []).some(r => r.id === emgId);
    assert(!prcHasEmg, 'Requirement G: Emergency request never appears in Principal dashboard');

    console.log('\n========================================================');
    console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================\n');

  } catch (err) {
    console.error('Special Dashboard Separation Test Error:', err);
    failed++;
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSpecialDashboardSeparationTest();
