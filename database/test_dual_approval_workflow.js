/**
 * Comprehensive Integration Test Suite: Dual Flow Approval Architecture
 * Flow A: Normal Outpass (Student -> Parent -> Warden -> QR -> Caretaker -> Watchman)
 * Flow B: One-Day Permission (Student -> Class Advisor -> Principal -> QR -> Caretaker -> Watchman)
 * Flow C: One-Day Rejection by Principal
 * Flow D: Role Security & Access Control
 * Flow E: Principal Dashboard, Reports & Analytics Endpoints
 */

const { pool } = require('../utils/db');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runDualApprovalWorkflowTests() {
  console.log('🚀 ========================================================');
  console.log('🧪 RUNNING DUAL APPROVAL WORKFLOW INTEGRATION TEST SUITE');
  console.log('🚀 ========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // 1. Authenticate All 7 Roles
    // ----------------------------------------------------
    console.log('🔑 1. Authenticating test user roles...');
    
    const [stuRes, parRes, advRes, wrdRes, prcRes, ctkRes, watRes] = await Promise.all([
      req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } }),
      req('/api/auth/login', { method: 'POST', body: { username: '9876543210', password: 'Password@123', role: 'parent' } }),
      req('/api/auth/login', { method: 'POST', body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' } }),
      req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } }),
      req('/api/auth/login', { method: 'POST', body: { username: 'PRC-001', password: 'Password@123', role: 'principal' } }),
      req('/api/auth/login', { method: 'POST', body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' } }),
      req('/api/auth/login', { method: 'POST', body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' } })
    ]);

    const studentToken = stuRes.data?.token;
    const parentToken = parRes.data?.token;
    const advisorToken = advRes.data?.token;
    const wardenToken = wrdRes.data?.token;
    const principalToken = prcRes.data?.token;
    const caretakerToken = ctkRes.data?.token;
    const watchmanToken = watRes.data?.token;

    assert(Boolean(studentToken), 'Student authenticated successfully (21CS042)');
    assert(Boolean(parentToken), 'Parent authenticated successfully (9876543210)');
    assert(Boolean(advisorToken), 'Class Advisor authenticated successfully (ADV-204)');
    assert(Boolean(wardenToken), 'Warden authenticated successfully (WRD-101)');
    assert(Boolean(principalToken), 'Principal authenticated successfully (PRC-001)');
    assert(Boolean(caretakerToken), 'Caretaker authenticated successfully (CTK-305)');
    assert(Boolean(watchmanToken), 'Watchman authenticated successfully (GAT-401)');

    // ----------------------------------------------------
    // WORKFLOW A: NORMAL OUTPASS
    // Student -> Parent -> Warden -> QR -> Caretaker -> Watchman
    // ----------------------------------------------------
    console.log('\n🏠 --- 2. WORKFLOW A: NORMAL OUTPASS LIFECYCLE ---');

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

    // Ensure student location is recorded
    await pool.query(`
      INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
      VALUES (1, 13.0000000, 80.0000000, 10.0, NOW(), 'browser_gps')
      ON DUPLICATE KEY UPDATE
        latitude = 13.0000000,
        longitude = 80.0000000,
        accuracy = 10.0,
        captured_at = NOW(),
        source = 'browser_gps';
    `);

    const now = new Date();
    const futureLeave = new Date(now.getTime() + 24 * 3600 * 1000);
    const futureReturn = new Date(now.getTime() + 30 * 3600 * 1000);
    const odLeave = new Date(now.getTime() + 14 * 3600 * 1000);
    const odReturn = new Date(now.getTime() + 18 * 3600 * 1000);
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const threeHoursLater = new Date(now.getTime() + 3 * 3600 * 1000);

    const normalPayload = {
      request_type: 'normal',
      destination: 'Hometown - Chennai',
      reason: 'Attending family festival',
      semester: 'Semester 6',
      student_phone: '9876543210',
      leaving_date: formatLocalDate(futureLeave),
      leaving_time: formatLocalTime(futureLeave),
      expected_return_date: formatLocalDate(futureReturn),
      expected_return_time: formatLocalTime(futureReturn)
    };

    // A1: Student creates Normal Outpass
    const createNormRes = await req('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: normalPayload
    });

    assert(createNormRes.status === 201, 'Student created Normal Outpass (HTTP 201)');
    const normalId = createNormRes.data?.data?.id;
    assert(createNormRes.data?.data?.status === 'PENDING_PARENT', 'Normal Outpass status is PENDING_PARENT');

    // A2: Parent verifies location and approves
    const locVerifyRes = await req(`/api/parent/outpass/${normalId}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { latitude: 13.0010000, longitude: 80.0010000, accuracy: 15.0 }
    });
    const verToken = locVerifyRes.data?.verificationToken || locVerifyRes.data?.verification_token;

    const parApproveRes = await req(`/api/parent/outpass/${normalId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: verToken, parent_message: 'Approved for leave' }
    });

    assert(parApproveRes.status === 200, 'Parent approved Normal Outpass (HTTP 200)');
    assert(parApproveRes.data?.data?.status === 'PENDING_WARDEN', 'Normal Outpass transitioned to PENDING_WARDEN');

    // A3: Principal CANNOT approve Normal Outpass (HTTP 400/403)
    const prcNormApproveRes = await req(`/api/outpass/${normalId}/principal-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(prcNormApproveRes.status === 400 || prcNormApproveRes.status === 403, 'Principal CANNOT approve Normal Outpass (HTTP 400/403)');

    // A4: Warden approves Normal Outpass
    const wrdNormApproveRes = await req(`/api/outpass/${normalId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });

    assert(wrdNormApproveRes.status === 200, 'Warden approved Normal Outpass (HTTP 200)');
    assert(wrdNormApproveRes.data?.data?.status === 'APPROVED', 'Normal Outpass status is APPROVED');

    // A5: Generate QR for Normal Outpass
    const genNormQrRes = await req(`/api/qr/generate/${normalId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });

    assert(genNormQrRes.status === 201 || genNormQrRes.status === 200, 'QR Code generated for Normal Outpass (HTTP 201/200)');
    const normQrToken = genNormQrRes.data?.data?.qrToken;
    const normQrId = genNormQrRes.data?.data?.qrId;
    assert(Boolean(normQrToken), 'QR token received for Normal Outpass');

    // Activate for departure testing
    await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, normQrId]);
    await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, normalId]);

    // A6: Caretaker scans exit for Normal Outpass
    const ctkExitRes = await req('/api/caretaker/exit', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${caretakerToken}` },
      body: { qr_token: normQrToken }
    });

    assert(ctkExitRes.status === 200, 'Caretaker recorded Exit for Normal Outpass (HTTP 200)');

    // A7: Watchman scans return for Normal Outpass
    const watRetRes = await req('/api/watchman/return', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${watchmanToken}` },
      body: { qr_token: normQrToken }
    });

    assert(watRetRes.status === 200, 'Watchman recorded Return for Normal Outpass (HTTP 200)');
    assert(watRetRes.data?.data?.outpassStatus === 'COMPLETED' || watRetRes.data?.validity === 'RETURN_VERIFIED', 'Normal Outpass successfully COMPLETED');

    // ----------------------------------------------------
    // WORKFLOW B: ONE-DAY PERMISSION (OD)
    // Student -> Class Advisor -> Principal -> QR -> Caretaker -> Watchman
    // ----------------------------------------------------
    console.log('\n🎓 --- 3. WORKFLOW B: ONE-DAY PERMISSION LIFECYCLE ---');

    const dutyPayload = {
      request_type: 'one_day_duty',
      event_name: 'National Level Technical Symposium 2026',
      event_location: 'IIT Madras Research Park, Chennai',
      duty_date: formatLocalDate(odLeave),
      duty_description: 'Representing college in AI Paper Presentation contest',
      destination: 'IIT Madras Research Park, Chennai',
      reason: 'AI Paper Presentation contest',
      semester: 'Semester 6',
      student_phone: '9876543210',
      leaving_date: formatLocalDate(odLeave),
      leaving_time: formatLocalTime(odLeave),
      expected_return_date: formatLocalDate(odReturn),
      expected_return_time: formatLocalTime(odReturn)
    };

    // B1: Student creates One-Day Duty request
    const createDutyRes = await req('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: dutyPayload
    });

    assert(createDutyRes.status === 201, 'Student created One-Day Duty request (HTTP 201)');
    const dutyId = createDutyRes.data?.data?.id;
    assert(createDutyRes.data?.data?.status === 'PENDING_ADVISOR', 'One-Day Duty initial status is PENDING_ADVISOR');

    // B2: Advisor approves One-Day Duty -> MUST forward to PENDING_PRINCIPAL
    const advApproveRes = await req(`/api/outpass/${dutyId}/advisor-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });

    assert(advApproveRes.status === 200, 'Class Advisor approved One-Day Duty (HTTP 200)');
    assert(advApproveRes.data?.data?.status === 'PENDING_PRINCIPAL', 'One-Day Duty transitioned to PENDING_PRINCIPAL');

    // B3: Warden CANNOT approve One-Day Duty (HTTP 403)
    const wrdDutyApproveRes = await req(`/api/outpass/${dutyId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });

    assert(wrdDutyApproveRes.status === 403, 'Warden CANNOT approve One-Day Duty (HTTP 403 Forbidden)');

    // B4: QR generation blocked while PENDING_PRINCIPAL
    const prematureQrRes = await req(`/api/qr/generate/${dutyId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(prematureQrRes.status === 400, 'QR generation blocked while PENDING_PRINCIPAL (HTTP 400)');

    // B5: Principal approves One-Day Permission
    const prcApproveRes = await req(`/api/outpass/${dutyId}/principal-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(prcApproveRes.status === 200, 'Principal approved One-Day Permission (HTTP 200)');
    assert(prcApproveRes.data?.data?.status === 'APPROVED', 'One-Day Permission status is APPROVED');

    // B6: Generate QR for One-Day Permission
    const genDutyQrRes = await req(`/api/qr/generate/${dutyId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(genDutyQrRes.status === 201 || genDutyQrRes.status === 200, 'QR Code generated for One-Day Permission (HTTP 201/200)');
    const dutyQrToken = genDutyQrRes.data?.data?.qrToken;
    const dutyQrId = genDutyQrRes.data?.data?.qrId;
    assert(Boolean(dutyQrToken), 'QR token generated for One-Day Permission');

    // Activate for departure testing
    await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, dutyQrId]);
    await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, dutyId]);

    // B7: Caretaker scans exit for One-Day Permission
    const ctkDutyExitRes = await req('/api/caretaker/exit', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${caretakerToken}` },
      body: { qr_token: dutyQrToken }
    });

    assert(ctkDutyExitRes.status === 200, 'Caretaker recorded Exit for One-Day Permission (HTTP 200)');

    // B8: Watchman scans return for One-Day Permission
    const watDutyRetRes = await req('/api/watchman/return', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${watchmanToken}` },
      body: { qr_token: dutyQrToken }
    });

    assert(watDutyRetRes.status === 200, 'Watchman recorded Return for One-Day Permission (HTTP 200)');
    assert(watDutyRetRes.data?.data?.outpassStatus === 'COMPLETED' || watDutyRetRes.data?.validity === 'RETURN_VERIFIED', 'One-Day Permission successfully COMPLETED');

    // ----------------------------------------------------
    // WORKFLOW C: ONE-DAY PERMISSION REJECTION BY PRINCIPAL
    // ----------------------------------------------------
    console.log('\n❌ --- 4. WORKFLOW C: ONE-DAY PERMISSION REJECTION BY PRINCIPAL ---');

    const dutyPayload2 = {
      ...dutyPayload,
      event_name: 'Hackathon 2026 Round 2'
    };

    const createDuty2Res = await req('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: dutyPayload2
    });

    const dutyId2 = createDuty2Res.data?.data?.id;

    // Advisor approves
    await req(`/api/outpass/${dutyId2}/advisor-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });

    // Principal rejects with reason
    const prcRejectRes = await req(`/api/outpass/${dutyId2}/principal-reject`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` },
      body: { rejection_reason: 'Clashing with mandatory campus placement drive' }
    });

    assert(prcRejectRes.status === 200, 'Principal rejected One-Day Permission (HTTP 200)');
    assert(prcRejectRes.data?.data?.status === 'REJECTED', 'One-Day Permission status is REJECTED');

    // QR generation fails for rejected pass
    const rejectedQrRes = await req(`/api/qr/generate/${dutyId2}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(rejectedQrRes.status === 400, 'QR generation blocked for REJECTED One-Day Permission (HTTP 400)');

    // ----------------------------------------------------
    // WORKFLOW D: PRINCIPAL DASHBOARD & MONITORING ENDPOINTS
    // ----------------------------------------------------
    console.log('\n📊 --- 5. WORKFLOW D: PRINCIPAL DASHBOARD & MONITORING APIS ---');

    // D1: Principal Overview Metrics
    const overviewRes = await req('/api/principal/overview', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(overviewRes.status === 200, 'GET /api/principal/overview returned HTTP 200');
    assert('totalStudents' in overviewRes.data.stats, 'Overview contains totalStudents');
    assert('pendingNormalOutpasses' in overviewRes.data.stats, 'Overview contains pendingNormalOutpasses');
    assert('pendingOneDayPermissions' in overviewRes.data.stats, 'Overview contains pendingOneDayPermissions');
    assert('activeQRCodes' in overviewRes.data.stats, 'Overview contains activeQRCodes');

    // D2: Principal Normal Outpass Monitoring (Read-Only)
    const normMonitoringRes = await req('/api/principal/normal-outpasses', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(normMonitoringRes.status === 200, 'GET /api/principal/normal-outpasses returned HTTP 200');
    assert(Array.isArray(normMonitoringRes.data.normalOutpasses), 'Returns array of Normal Outpasses');

    // D3: Principal One-Day Permissions Queue
    const odQueueRes = await req('/api/principal/one-day-permissions?status=all', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(odQueueRes.status === 200, 'GET /api/principal/one-day-permissions returned HTTP 200');
    assert(Array.isArray(odQueueRes.data.permissions), 'Returns array of One-Day Permissions');

    // D4: Principal Student Residency Status
    const stuStatusRes = await req('/api/principal/student-status', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(stuStatusRes.status === 200, 'GET /api/principal/student-status returned HTTP 200');

    // D5: Principal Students Outside
    const outsideRes = await req('/api/principal/students-outside', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(outsideRes.status === 200, 'GET /api/principal/students-outside returned HTTP 200');

    // D6: Principal Analytics (5 Charts)
    const analyticsRes = await req('/api/principal/analytics', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(analyticsRes.status === 200, 'GET /api/principal/analytics returned HTTP 200');
    assert('chart3_typeDistribution' in analyticsRes.data.analytics, 'Analytics contains Chart 1: Normal vs OD');
    assert('chart2_approvalRatio' in analyticsRes.data.analytics, 'Analytics contains Chart 2: Approval Ratio');
    assert('chart4_movementActivity' in analyticsRes.data.analytics, 'Analytics contains Chart 3: Movement Activity');
    assert('chart5_lateReturnsTrend' in analyticsRes.data.analytics, 'Analytics contains Chart 4: Late Returns');
    assert('chart6_extensionStats' in analyticsRes.data.analytics, 'Analytics contains Chart 5: Extension Stats');

    // D7: Principal Reports
    const dailyRepRes = await req('/api/principal/reports/daily', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(dailyRepRes.status === 200, 'GET /api/principal/reports/daily returned HTTP 200');

    const monthlyRepRes = await req('/api/principal/reports/monthly', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });

    assert(monthlyRepRes.status === 200, 'GET /api/principal/reports/monthly returned HTTP 200');

    console.log('\n========================================================');
    console.log(`🏁 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    return { success: failed === 0, passed, failed };

  } catch (err) {
    console.error('Fatal error during integration testing:', err);
    return { success: false, error: err.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runDualApprovalWorkflowTests().then(r => {
    process.exit(r.success ? 0 : 1);
  });
}

module.exports = { runDualApprovalWorkflowTests };
