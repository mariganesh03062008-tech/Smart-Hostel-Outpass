/**
 * Comprehensive Test Suite for Principal Dashboard & Executive Controls
 */

const http = require('http');

function req(path, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 5001,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const clientReq = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    clientReq.on('error', reject);
    if (options.body) clientReq.write(JSON.stringify(options.body));
    clientReq.end();
  });
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

async function run() {
  console.log('🚀 ========================================================');
  console.log('🧪 PRINCIPAL DASHBOARD & EXECUTIVE APPROVAL TEST SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;
  function assert(condition, name, msg = '') {
    if (condition) {
      console.log(`  ✅ [PASS]: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL]: ${name} ${msg ? '(' + msg + ')' : ''}`);
      failed++;
    }
  }

  // 1. Authenticate Principal and supporting roles
  console.log('🔑 1. Authenticating Roles...');
  const stuRes = await req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } });
  const parRes = await req('/api/auth/login', { method: 'POST', body: { username: '9876543210', password: 'Password@123', role: 'parent' } });
  const advRes = await req('/api/auth/login', { method: 'POST', body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' } });
  const wrdRes = await req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } });
  const prcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'PRC-001', password: 'Password@123', role: 'principal' } });

  const studentToken = stuRes.data?.token;
  const parentToken = parRes.data?.token;
  const advisorToken = advRes.data?.token;
  const wardenToken = wrdRes.data?.token;
  const principalToken = prcRes.data?.token;

  assert(Boolean(principalToken), 'Principal logged in successfully (PRC-001)');
  assert(Boolean(studentToken), 'Student logged in successfully (21CS042)');
  assert(Boolean(advisorToken), 'Advisor logged in successfully (ADV-204)');
  assert(Boolean(wardenToken), 'Warden logged in successfully (WRD-101)');

  // 2. Principal Overview & Stats API
  console.log('\n📊 2. Testing Principal Overview & Statistical Counters...');
  const overviewRes = await req('/api/principal/overview', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(overviewRes.status === 200, 'GET /api/principal/overview returns HTTP 200');
  const stats = overviewRes.data?.stats;
  assert(typeof stats?.totalStudents === 'number', 'Overview contains totalStudents');
  assert(typeof stats?.pendingNormalOutpasses === 'number', 'Overview contains pendingNormalOutpasses');
  assert(typeof stats?.pendingOneDayPermissions === 'number', 'Overview contains pendingOneDayPermissions');
  assert(typeof stats?.activeQRCodes === 'number', 'Overview contains activeQRCodes');
  assert(typeof stats?.studentsInside === 'number', 'Overview contains studentsInside');
  assert(typeof stats?.studentsOutside === 'number', 'Overview contains studentsOutside');

  // 3. Normal Outpass Monitoring (Read-Only Guardrail)
  console.log('\n🏠 3. Testing Normal Outpass Monitoring (Read-Only & Action Guardrail)...');
  const now = new Date();
  const futureLeave = new Date(now.getTime() + 24 * 3600 * 1000);
  const futureReturn = new Date(now.getTime() + 30 * 3600 * 1000);
  const odLeave = new Date(now.getTime() + 14 * 3600 * 1000);
  const odReturn = new Date(now.getTime() + 18 * 3600 * 1000);

  // Student creates normal outpass
  const createNormRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Home City',
      reason: 'Weekend Visit',
      leaving_date: formatLocalDate(futureLeave),
      leaving_time: formatLocalTime(futureLeave),
      expected_return_date: formatLocalDate(futureReturn),
      expected_return_time: formatLocalTime(futureReturn),
      student_phone: '9876543210'
    }
  });
  const normalId = createNormRes.data?.data?.id;
  assert(createNormRes.status === 201, 'Student created Normal Outpass (ID: ' + normalId + ')');

  // Principal can view in monitoring
  const normMonRes = await req('/api/principal/normal-outpasses', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(normMonRes.status === 200, 'Principal accessed Normal Outpass Monitoring (HTTP 200)');
  const inNormMon = (normMonRes.data?.normalOutpasses || []).some(o => o.requestCode === createNormRes.data?.data?.requestCode);
  assert(inNormMon, 'Created Normal Outpass is visible in Principal Monitoring view');

  // Guardrail: Principal CANNOT approve Normal Outpass
  const prcNormApproveRes = await req(`/api/outpass/${normalId}/principal-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(prcNormApproveRes.status === 400 || prcNormApproveRes.status === 403, 'Principal is strictly blocked from approving Normal Outpass (HTTP 400/403)');

  // Guardrail: Principal CANNOT reject Normal Outpass
  const prcNormRejectRes = await req(`/api/outpass/${normalId}/principal-reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` },
    body: { rejection_reason: 'Testing guardrail' }
  });
  assert(prcNormRejectRes.status === 400 || prcNormRejectRes.status === 403, 'Principal is strictly blocked from rejecting Normal Outpass (HTTP 400/403)');

  // 4. One-Day Permission: Complete Lifecycle (Advisor -> Principal -> QR -> Student Active)
  console.log('\n🎓 4. Testing One-Day Permission Approval Flow & QR Generation...');
  const dutyPayload = {
    request_type: 'one_day_duty',
    event_name: 'IEEE AI Symposium 2026',
    event_location: 'Anna University, Chennai',
    duty_date: formatLocalDate(odLeave),
    duty_description: 'Keynote presentation',
    destination: 'Anna University, Chennai',
    reason: 'IEEE AI Symposium',
    semester: 'Semester 6',
    student_phone: '9876543210',
    leaving_date: formatLocalDate(odLeave),
    leaving_time: formatLocalTime(odLeave),
    expected_return_date: formatLocalDate(odReturn),
    expected_return_time: formatLocalTime(odReturn)
  };

  const createDutyRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: dutyPayload
  });
  const dutyId = createDutyRes.data?.data?.id;
  assert(createDutyRes.status === 201 && createDutyRes.data?.data?.status === 'PENDING_ADVISOR', 'Student created One-Day Duty request (Status: PENDING_ADVISOR)');

  // Advisor approves
  const advApproveRes = await req(`/api/advisor/one-day/${dutyId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  assert(advApproveRes.status === 200 && advApproveRes.data?.data?.status === 'PENDING_PRINCIPAL', 'Class Advisor approved -> Status transitioned to PENDING_PRINCIPAL');

  // Principal receives in queue
  const prcQueueRes = await req('/api/principal/one-day-permissions', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  const inPrcQueue = (prcQueueRes.data?.permissions || []).some(p => p.id === dutyId);
  assert(inPrcQueue, 'Principal receives Advisor-cleared request in Executive Approval Queue');

  // Principal approves
  const prcApproveRes = await req(`/api/principal/one-day/${dutyId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(prcApproveRes.status === 200 && prcApproveRes.data?.data?.status === 'APPROVED', 'Principal approved One-Day Permission -> Status: APPROVED');

  // QR Generation
  const qrGenRes = await req(`/api/qr/generate/${dutyId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(qrGenRes.status === 200 || qrGenRes.status === 201, 'Digital Security QR generated after Principal approval');
  const qrToken = qrGenRes.data?.data?.qrToken;
  assert(Boolean(qrToken), 'QR Token successfully created: ' + qrToken);

  // Student Active Outpass view
  const stuActiveRes = await req('/api/student/active-outpass', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(stuActiveRes.data?.hasActiveOutpass && (stuActiveRes.data?.activeOutpass?.outpassId === dutyId || stuActiveRes.data?.activeOutpass?.id === dutyId), 'Student Portal displays Active Outpass with QR Code and Live Countdown');

  // 5. One-Day Permission: Principal Rejection Flow
  console.log('\n❌ 5. Testing One-Day Permission Rejection Flow by Principal...');
  const createDuty2Res = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: { ...dutyPayload, event_name: 'Hackathon Round 2' }
  });
  const dutyId2 = createDuty2Res.data?.data?.id;

  // Advisor approves
  await req(`/api/advisor/one-day/${dutyId2}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });

  // Principal rejects with reason
  const prcRejectRes = await req(`/api/principal/one-day/${dutyId2}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` },
    body: { rejection_reason: 'Clashing with end-semester lab assessments' }
  });
  assert(prcRejectRes.status === 200 && prcRejectRes.data?.data?.status === 'REJECTED', 'Principal rejected One-Day Permission with reason -> Status: REJECTED');

  // QR generation is blocked for rejected request
  const qrBlockRes = await req(`/api/qr/generate/${dutyId2}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(qrBlockRes.status === 400, 'QR generation strictly blocked for Principal-rejected request (HTTP 400)');

  // 6. Reports & Analytics APIs
  console.log('\n📈 6. Testing Institutional Analytics & Reports Engine...');
  const analyticsRes = await req('/api/principal/analytics', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(analyticsRes.status === 200, 'GET /api/principal/analytics returns HTTP 200');
  const a = analyticsRes.data?.analytics || analyticsRes.data;
  assert(Boolean(a?.chart3_typeDistribution || a?.typeDistribution), 'Analytics contains Type Distribution data (Chart 1)');
  assert(Boolean(a?.chart2_approvalRatio || a?.approvalRatio), 'Analytics contains Approval Ratio data (Chart 2)');
  assert(Boolean(a?.chart4_movementActivity || a?.movementActivity), 'Analytics contains Movement Activity data (Chart 3)');
  assert(Boolean(a?.chart5_lateReturnsTrend || a?.lateReturns), 'Analytics contains Late Returns data (Chart 4)');
  assert(Boolean(a?.chart6_extensionStats || a?.extensionStats), 'Analytics contains Extension Stats data (Chart 5)');

  const dailyReportRes = await req('/api/principal/reports/daily', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(dailyReportRes.status === 200, 'GET /api/principal/reports/daily returns HTTP 200');

  const monthlyReportRes = await req('/api/principal/reports/monthly', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(monthlyReportRes.status === 200, 'GET /api/principal/reports/monthly returns HTTP 200');

  const outsideStudentsRes = await req('/api/principal/students-outside', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  assert(outsideStudentsRes.status === 200, 'GET /api/principal/students-outside returns HTTP 200');

  console.log('\n========================================================');
  console.log(`🏁 PRINCIPAL DASHBOARD TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
