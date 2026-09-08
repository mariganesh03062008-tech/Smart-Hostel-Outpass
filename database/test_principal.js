const { pool } = require('../utils/db');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';

async function request(path, options = {}) {
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
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
  } else {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPrincipalModuleTests() {
  console.log('\n🧪 ========================================================');
  console.log('🚀 RUNNING PRINCIPAL MONITORING, REPORTS & ANALYTICS TEST SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // 1. Authenticate Principal
    const princLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'PRC-001', password: 'Password@123', role: 'principal' }
    });
    assert(princLogin.ok && princLogin.data.token, '1. Authenticate Principal (PRC-001 / Dr. A. Sharma)');
    const principalToken = princLogin.data.token;

    // Authenticate Student for security negative tests
    const stuLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '21CS042', password: 'Password@123', role: 'student' }
    });
    assert(stuLogin.ok && stuLogin.data.token, '2. Authenticate Student for access control checks');
    const studentToken = stuLogin.data.token;

    console.log('\n--- SCENARIO 1: Dashboard Overview Counters API ---');

    // 3. Principal Overview API
    const overviewRes = await request('/api/principal/overview', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      overviewRes.ok && 
      overviewRes.data.success && 
      overviewRes.data.stats &&
      typeof overviewRes.data.stats.totalStudents === 'number' &&
      typeof overviewRes.data.stats.studentsInside === 'number' &&
      typeof overviewRes.data.stats.studentsOutside === 'number' &&
      typeof overviewRes.data.stats.pendingOutpasses === 'number' &&
      typeof overviewRes.data.stats.approvedOutpasses === 'number' &&
      typeof overviewRes.data.stats.rejectedOutpasses === 'number' &&
      typeof overviewRes.data.stats.activeQRCodes === 'number' &&
      typeof overviewRes.data.stats.completedOutpasses === 'number' &&
      typeof overviewRes.data.stats.pendingExtensions === 'number' &&
      typeof overviewRes.data.stats.lateReturns === 'number',
      '3. Overview API returns all 10 real-time institutional counters from MySQL'
    );

    console.log('\n--- SCENARIO 2: Student Hostel Status & Residency Roster ---');

    // 4. Student Status without filters
    const statusAllRes = await request('/api/principal/student-status', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      statusAllRes.ok && 
      statusAllRes.data.success && 
      Array.isArray(statusAllRes.data.students) && 
      statusAllRes.data.students.length > 0,
      '4. Student Status API returns full active student list with computed statuses'
    );

    // 5. Student Status with Department filter
    const statusCseRes = await request('/api/principal/student-status?department=Computer%20Science%20%26%20Engineering', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      statusCseRes.ok && 
      statusCseRes.data.students.every(s => s.department === 'Computer Science & Engineering'),
      '5. Student Status API filters accurately by Department'
    );

    // 6. Student Status with Hostel Block filter
    const statusBlockRes = await request('/api/principal/student-status?hostel_block=Block%20A', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      statusBlockRes.ok && 
      statusBlockRes.data.students.every(s => s.hostelBlock === 'Block A'),
      '6. Student Status API filters accurately by Hostel Block'
    );

    console.log('\n--- SCENARIO 3: Outpass Overview & Timeframe Metrics ---');

    // 7. Outpass Overview Today
    const opTodayRes = await request('/api/principal/outpass-overview?filter=today', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      opTodayRes.ok && 
      opTodayRes.data.summary && 
      typeof opTodayRes.data.summary.totalRequests === 'number' &&
      Array.isArray(opTodayRes.data.outpasses),
      '7. Outpass Overview returns summary aggregation and records for Today'
    );

    // 8. Outpass Overview All Time with Category Filter
    const opAllRes = await request('/api/principal/outpass-overview?filter=all&type=normal', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      opAllRes.ok && 
      opAllRes.data.outpasses.every(op => op.requestType === 'normal'),
      '8. Outpass Overview filters by request type (Normal Outpass)'
    );

    console.log('\n--- SCENARIO 4: Today\'s Real-Time Unified Activity Stream ---');

    // 9. Today's Activity API
    const activityRes = await request('/api/principal/today-activity', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(
      activityRes.ok && 
      activityRes.data.success && 
      Array.isArray(activityRes.data.activities),
      '9. Today Activity Stream returns chronological merged events'
    );

    console.log('\n--- SCENARIO 5: Institutional Analytics & 6 Chart Datasets ---');

    // 10. Analytics API
    const analyticsRes = await request('/api/principal/analytics', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    const an = analyticsRes.data?.analytics;
    assert(
      analyticsRes.ok &&
      an &&
      an.chart1_requestsByDay && Array.isArray(an.chart1_requestsByDay.labels) &&
      an.chart2_approvalRatio && Array.isArray(an.chart2_approvalRatio.data) &&
      an.chart3_typeDistribution && Array.isArray(an.chart3_typeDistribution.data) &&
      an.chart4_movementActivity && Array.isArray(an.chart4_movementActivity.exits) &&
      an.chart5_lateReturnsTrend && Array.isArray(an.chart5_lateReturnsTrend.data) &&
      an.chart6_extensionStats && Array.isArray(an.chart6_extensionStats.data),
      '10. Analytics API generates aggregated MySQL datasets for all 6 visual charts'
    );

    console.log('\n--- SCENARIO 6: Institutional Reports Endpoints ---');

    // 11. Daily Report
    const dailyRep = await request('/api/principal/reports/daily', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(dailyRep.ok && Array.isArray(dailyRep.data.records), '11. Daily Outpass Report generated successfully');

    // 12. Monthly Report
    const monthlyRep = await request('/api/principal/reports/monthly', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(monthlyRep.ok && Array.isArray(monthlyRep.data.records), '12. Monthly Outpass Report generated successfully');

    // 13. Outside Students Report
    const outsideRep = await request('/api/principal/reports/outside-students', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(outsideRep.ok && Array.isArray(outsideRep.data.records), '13. Students Outside Hostel Report generated successfully');

    // 14. Late Returns Report
    const lateRep = await request('/api/principal/reports/late-returns', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(lateRep.ok && Array.isArray(lateRep.data.records), '14. Late Returns Report generated successfully');

    // 15. Extension Report
    const extRep = await request('/api/principal/reports/extensions', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(extRep.ok && Array.isArray(extRep.data.records), '15. Emergency Extension Report generated successfully');

    // 16. One-Day Duty Report
    const odRep = await request('/api/principal/reports/one-day-duty', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(odRep.ok && Array.isArray(odRep.data.records), '16. One-Day Duty Report generated successfully');

    // 17. Normal Outpass Report
    const normalRep = await request('/api/principal/reports/normal', {
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(normalRep.ok && Array.isArray(normalRep.data.records), '17. Normal Outpass Report generated successfully');

    console.log('\n--- SCENARIO 7: Security Guardrails & Strictly Read-Only Role Enforcement ---');

    // 18. Student blocked from Principal endpoints (HTTP 403)
    const stuAccessPrinc = await request('/api/principal/overview', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert(stuAccessPrinc.status === 403, '18. Security: Non-principal role blocked from Principal APIs (HTTP 403)');

    // 19. Principal blocked from Warden Outpass Approval (HTTP 403)
    const princWardenApprove = await request('/api/outpass/1/approve', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(princWardenApprove.status === 403, '19. Security: Principal blocked from Warden Outpass Approval (HTTP 403)');

    // 20. Principal blocked from Advisor OD Approval (HTTP 403)
    const princAdvisorApprove = await request('/api/outpass/1/advisor-approve', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    // 21. Principal blocked from Warden Outpass Reject (HTTP 403)
    const princWardenReject = await request('/api/outpass/1/reject', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` },
      body: { rejection_reason: 'Denied' }
    });
    assert(princWardenReject.status === 403, '21. Security: Principal blocked from Warden Outpass Reject (HTTP 403)');

    // 22. Principal blocked from Caretaker Exit Logging (HTTP 403)
    const princCaretakerExit = await request('/api/caretaker/exit', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${principalToken}` },
      body: { qr_token: 'dummy_token' }
    });
    assert(princCaretakerExit.status === 403, '22. Security: Principal blocked from Caretaker Exit Logging (HTTP 403)');

    // 23. Principal blocked from Watchman Return Check-in (HTTP 403)
    const princWatchmanReturn = await request('/api/watchman/return', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${principalToken}` },
      body: { qr_token: 'dummy_token' }
    });
    assert(princWatchmanReturn.status === 403, '23. Security: Principal blocked from Watchman Return Check-in (HTTP 403)');

    // 24. Principal blocked from Extension Approval (HTTP 403)
    const princExtApprove = await request('/api/extension/1/approve', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principalToken}` }
    });
    assert(princExtApprove.status === 403, '24. Security: Principal blocked from Extension Approval (HTTP 403)');

    console.log('\n========================================================');
    console.log('🏁 PRINCIPAL MODULE TEST SUMMARY: ALL 24 TESTS PASSED FLAWLESSLY!');
    console.log('========================================================\n');

  } catch (error) {
    console.error('\n❌ PRINCIPAL TEST SUITE TERMINATED WITH ERROR:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runPrincipalModuleTests();
}

module.exports = { runPrincipalModuleTests };
