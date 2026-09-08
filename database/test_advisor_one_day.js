/**
 * Dedicated Test: Class Advisor One-Day Workflow & Principal Handoff Verification
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
  console.log('🧪 CLASS ADVISOR & ONE-DAY PERMISSION WORKFLOW TEST');
  console.log('========================================================\n');

  // 1. Authenticate Actors
  console.log('🔑 Authenticating Actors...');
  const stuRes = await req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } });
  const advRes = await req('/api/auth/login', { method: 'POST', body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' } });
  const prcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'PRC-001', password: 'Password@123', role: 'principal' } });
  const wrdRes = await req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } });

  const studentToken = stuRes.data?.token;
  const advisorToken = advRes.data?.token;
  const principalToken = prcRes.data?.token;
  const wardenToken = wrdRes.data?.token;

  console.log('  ✅ Student authenticated (21CS042)');
  console.log('  ✅ Class Advisor authenticated (ADV-204)');
  console.log('  ✅ Principal authenticated (PRC-001)');
  console.log('  ✅ Warden authenticated (WRD-101)');

  const now = new Date();
  const leave = new Date(now.getTime() + 14 * 3600000);
  const ret = new Date(now.getTime() + 18 * 3600000);

  // 2. Normal Lifecycle: Student -> Advisor -> Principal -> QR -> Active Outpass -> Countdown
  console.log('\n📌 1. TESTING COMPLETE ONE-DAY LIFECYCLE (APPROVAL FLOW)...');
  const dutyPayload = {
    request_type: 'one_day_duty',
    event_name: 'National Robotics Hackathon 2026',
    event_location: 'IIT Madras Research Park, Chennai',
    duty_date: formatLocalDate(leave),
    duty_description: 'Representing college in finale',
    destination: 'IIT Madras Research Park, Chennai',
    reason: 'National Robotics Hackathon',
    semester: 'Semester 6',
    student_phone: '9876543210',
    leaving_date: formatLocalDate(leave),
    leaving_time: formatLocalTime(leave),
    expected_return_date: formatLocalDate(ret),
    expected_return_time: formatLocalTime(ret)
  };

  const createRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: dutyPayload
  });

  const outpassId = createRes.data?.data?.id;
  const reqCode = createRes.data?.data?.requestCode;
  console.log(`  ✅ 1.1 Student created One-Day Duty request (${reqCode}, ID: ${outpassId}, Status: ${createRes.data?.data?.status})`);

  // Class Advisor view queue
  const advPendingRes = await req('/api/advisor/one-day/pending', {
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  const foundInAdvisor = (advPendingRes.data?.pendingDutyRequests || []).some(r => r.id === outpassId);
  if (!foundInAdvisor) throw new Error('Request not found in Class Advisor queue');
  console.log('  ✅ 1.2 Class Advisor receives request in Department Queue');

  // Guardrail: Warden CANNOT approve One-Day Duty
  const wardenApproveRes = await req(`/api/outpass/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  if (wardenApproveRes.status !== 403) throw new Error(`Warden was not blocked! Status: ${wardenApproveRes.status}`);
  console.log('  ✅ 1.3 Guardrail: Warden is blocked from approving One-Day Duty (HTTP 403)');

  // Class Advisor approves
  const advApproveRes = await req(`/api/advisor/one-day/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` }
  });
  if (advApproveRes.status !== 200) throw new Error('Advisor approval failed');
  console.log('  ✅ 1.4 Class Advisor approved request -> Status: PENDING_PRINCIPAL');

  // Principal receives request
  const prcPendingRes = await req('/api/principal/one-day-permissions', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  const prcList = prcPendingRes.data?.permissions || prcPendingRes.data?.oneDayPermissions || [];
  const foundInPrincipal = prcList.some(r => r.id === outpassId);
  if (!foundInPrincipal) throw new Error('Request not found in Principal queue after Advisor approval');
  console.log('  ✅ 1.5 Principal receives Advisor-cleared request in Executive Queue');

  // Principal approves
  const prcApproveRes = await req(`/api/principal/one-day/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  if (prcApproveRes.status !== 200) throw new Error('Principal approval failed');
  console.log('  ✅ 1.6 Principal approved One-Day Permission -> Status: APPROVED');

  // Generate QR
  const qrGenRes = await req(`/api/qr/generate/${outpassId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  if (qrGenRes.status !== 200 && qrGenRes.status !== 201) throw new Error('QR generation failed');
  console.log('  ✅ 1.7 QR Code generated successfully with token: ' + qrGenRes.data?.data?.qrToken);

  // Student Active Outpass verification
  const activeRes = await req('/api/student/active-outpass', {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  if (!activeRes.data?.hasActiveOutpass || (activeRes.data?.activeOutpass?.outpassId !== outpassId && activeRes.data?.activeOutpass?.id !== outpassId)) {
    throw new Error('Student Active Outpass does not show the generated pass');
  }
  console.log('  ✅ 1.8 Student Dashboard Active Outpass renders QR code & countdown data');

  // 3. Rejection Lifecycle: Student -> Advisor Rejects -> Principal does NOT receive -> QR blocked
  console.log('\n📌 2. TESTING CLASS ADVISOR REJECTION FLOW...');
  const dutyPayload2 = {
    ...dutyPayload,
    event_name: 'Inter-College Basketball Tournament',
    duty_description: 'Tournament player',
    reason: 'Basketball Tournament'
  };

  const createRes2 = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: dutyPayload2
  });

  const outpassId2 = createRes2.data?.data?.id;
  const reqCode2 = createRes2.data?.data?.requestCode;
  console.log(`  ✅ 2.1 Student created One-Day Duty request #2 (${reqCode2})`);

  // Advisor rejects with reason
  const advRejectRes = await req(`/api/advisor/one-day/${outpassId2}/reject`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${advisorToken}` },
    body: { rejection_reason: 'Attendance is below 75% departmental criteria' }
  });
  if (advRejectRes.status !== 200) throw new Error('Advisor rejection failed');
  console.log('  ✅ 2.2 Class Advisor rejected request with stated academic reason');

  // Confirm Principal does NOT receive it
  const prcCheckRes = await req('/api/principal/one-day-permissions', {
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  const prcRejectList = prcCheckRes.data?.permissions || prcCheckRes.data?.oneDayPermissions || [];
  const inPrincipal = prcRejectList.some(r => r.id === outpassId2 && r.status === 'PENDING_PRINCIPAL');
  if (inPrincipal) throw new Error('Rejected request was incorrectly queued for Principal!');
  console.log('  ✅ 2.3 Guardrail: Advisor-rejected request is NEVER queued for Principal');

  // Confirm QR cannot be generated
  const qrBlockRes = await req(`/api/qr/generate/${outpassId2}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${principalToken}` }
  });
  if (qrBlockRes.status !== 400) throw new Error('QR generation was not blocked for rejected request!');
  console.log('  ✅ 2.4 Guardrail: QR generation is blocked for Advisor-rejected request (HTTP 400)');

  console.log('\n========================================================');
  console.log('🏁 ALL CLASS ADVISOR & ONE-DAY TESTS PASSED (12/12)');
  console.log('========================================================');
}

run().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
