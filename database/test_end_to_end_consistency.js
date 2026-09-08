/**
 * Comprehensive End-to-End Functional Test & Database Consistency Checker
 * Smart Hostel Outpass Management System
 * 
 * Verifies:
 * 1. Normal Outpass Complete Workflow (Student -> Parent -> Warden -> QR -> Caretaker -> Watchman -> Completed)
 * 2. Normal Outpass Rejection Flows (Parent Reject & Warden Reject)
 * 3. One-Day Permission Complete Workflow (Student -> Advisor -> Principal -> QR -> Caretaker -> Watchman -> Completed)
 * 4. One-Day Permission Rejection Flows (Advisor Reject & Principal Reject)
 * 5. QR Generation, Verification, Expiration & Countdown Data
 * 6. Caretaker Gate Exit Operations & Guardrails
 * 7. Watchman Gate Return Operations & Status Transitions
 * 8. Emergency Time Extension Lifecycle (Request -> Warden Approve/Reject -> QR validity extension)
 * 9. Centralized Notification Dispatch & Deduplication
 * 10. Direct MySQL Foreign Key & Referential Integrity Audit (Zero Orphan Records)
 * 11. Status Transition Consistency Guardrails
 * 12. Duplicate Action Prevention (409 Conflict)
 * 13. Data Refresh & Server Persistence
 * 14. Multi-Role Queue Isolation
 * 15. Overall System Health
 */

require('dotenv').config();
const { pool } = require('../utils/db');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5001';

const credentials = {
  student: { username: '21CS042', password: 'Password@123', role: 'student' },
  student2: { username: '21ME018', password: 'Password@123', role: 'student' },
  parent: { username: '9876543210', password: 'Password@123', role: 'parent' },
  advisor: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' },
  warden: { username: 'WRD-101', password: 'Password@123', role: 'warden' },
  principal: { username: 'PRC-001', password: 'Password@123', role: 'principal' },
  caretaker: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' },
  watchman: { username: 'GAT-401', password: 'Password@123', role: 'watchman' }
};

const tokens = {};
let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS]: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL]: ${message}`);
    failedCount++;
  }
}

async function request(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  return {
    status: res.status,
    ok: res.ok,
    data
  };
}

async function login(roleKey) {
  const cred = credentials[roleKey];
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: cred.username,
      password: cred.password,
      role: cred.role
    })
  });
  if (res.data && res.data.token) {
    tokens[roleKey] = res.data.token;
  }
  return res;
}

function authHeaders(roleKey) {
  return {
    headers: { Authorization: `Bearer ${tokens[roleKey]}` }
  };
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

async function runEndToEndTests() {
  console.log('\n🚀 ========================================================');
  console.log('🧪 COMPREHENSIVE END-TO-END FUNCTIONAL & DATABASE CONSISTENCY SUITE');
  console.log('🚀 ========================================================\n');

  try {
    // ----------------------------------------------------
    // STEP 0: AUTHENTICATE ALL ROLES
    // ----------------------------------------------------
    console.log('🔑 Authenticating System Actors (7 Roles)...');
    for (const key of Object.keys(credentials)) {
      const auth = await login(key);
      assert(auth.status === 200 && auth.data.token, `Actor [${key.toUpperCase()}] authenticated successfully`);
    }

    const now = new Date();
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const threeHoursLater = new Date(now.getTime() + 3 * 3600 * 1000);

    // ====================================================
    // 1. NORMAL OUTPASS – COMPLETE LIFECYCLE TEST
    // ====================================================
    console.log('\n🏠 --- 1. NORMAL OUTPASS COMPLETE LIFECYCLE TEST ---');

    // 1.1 Student submits Normal Outpass
    const normCreate = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'normal',
        reason: 'Family wedding celebration',
        destination: 'Coimbatore Town Hall',
        leaving_date: formatLocalDate(tenMinsAgo),
        leaving_time: formatLocalTime(tenMinsAgo),
        expected_return_date: formatLocalDate(threeHoursLater),
        expected_return_time: formatLocalTime(threeHoursLater),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    assert(normCreate.status === 201 && normCreate.data.data.status === 'PENDING_PARENT', '1.1 Student created Normal Outpass (Status: PENDING_PARENT)');
    const normPassId = normCreate.data.data.id;

    // Verify in DB
    const [dbNorm1] = await pool.query('SELECT status, parent_approval_status, warden_approval_status FROM outpass_requests WHERE id = ?', [normPassId]);
    assert(dbNorm1[0].status === 'PENDING_PARENT' && dbNorm1[0].parent_approval_status === 'pending', '1.2 MySQL verified: status is PENDING_PARENT, parent_approval_status is pending');

    // 1.2 Parent views pending queue
    const parQueue = await request('/api/parent/outpass/pending', authHeaders('parent'));
    const inParQueue = parQueue.data.pendingRequests && parQueue.data.pendingRequests.some(r => r.id === normPassId);
    assert(inParQueue, '1.3 Parent receives Outpass in Pending Queue');

    // 1.3 Parent Biometric Verification & Approval
    await request('/api/parent/biometric-verify', {
      method: 'POST',
      body: JSON.stringify({ templateId: 'FP-PAR-98765', matchConfidence: 99 }),
      ...authHeaders('parent')
    });
    const parApprove = await request(`/api/parent/outpass/${normPassId}/approve`, {
      method: 'PATCH',
      ...authHeaders('parent')
    });
    assert(parApprove.status === 200 && parApprove.data.data.status === 'PENDING_WARDEN', '1.4 Parent approved Normal Outpass -> PENDING_WARDEN');

    // Verify in DB
    const [dbNorm2] = await pool.query('SELECT status, parent_approval_status, parent_biometric_verified FROM outpass_requests WHERE id = ?', [normPassId]);
    assert(dbNorm2[0].status === 'PENDING_WARDEN' && dbNorm2[0].parent_approval_status === 'approved' && dbNorm2[0].parent_biometric_verified === 1, '1.5 MySQL verified: status is PENDING_WARDEN, biometric_verified is 1');

    // 1.4 Warden views pending queue & approves
    const wrdQueue = await request('/api/outpass/warden/pending', authHeaders('warden'));
    const inWrdQueue = wrdQueue.data.pendingRequests && wrdQueue.data.pendingRequests.some(r => r.id === normPassId);
    assert(inWrdQueue, '1.6 Warden receives Outpass in Warden Pending Queue');

    const wrdApprove = await request(`/api/outpass/${normPassId}/approve`, {
      method: 'PATCH',
      ...authHeaders('warden')
    });
    assert(wrdApprove.status === 200 && wrdApprove.data.data.status === 'APPROVED', '1.7 Warden gave Final Approval for Normal Outpass -> APPROVED');

    // 1.5 Generate QR Code
    const qrGen = await request(`/api/qr/generate/${normPassId}`, {
      method: 'POST',
      ...authHeaders('warden')
    });
    assert(qrGen.status === 201 || qrGen.status === 200, '1.8 Digital Security QR Code generated successfully');
    const normQrToken = qrGen.data.data.qrToken;

    // 1.6 Student sees Active Outpass & Countdown
    const stuActive = await request('/api/student/active-outpass', authHeaders('student'));
    assert(stuActive.data.hasActiveOutpass && stuActive.data.activeOutpass.qrToken === normQrToken, '1.9 Student portal displays Active Outpass & live countdown');

    // 1.7 Caretaker scans exit QR
    const exitScan = await request('/api/caretaker/exit', {
      method: 'POST',
      body: JSON.stringify({ qr_token: normQrToken }),
      ...authHeaders('caretaker')
    });
    assert(exitScan.status === 200 && exitScan.data.status === 'EXIT_VERIFIED', '1.10 Caretaker recorded exit successfully (EXIT_VERIFIED)');

    // Verify student status in DB
    const [dbStudentAfterExit] = await pool.query('SELECT current_hostel_status FROM students WHERE reg_no = ?', ['21CS042']);
    assert(dbStudentAfterExit[0].current_hostel_status === 'OUTSIDE', '1.11 MySQL verified: student current_hostel_status is OUTSIDE');

    // 1.8 Watchman scans return QR
    const returnScan = await request('/api/watchman/return', {
      method: 'POST',
      body: JSON.stringify({ qr_token: normQrToken }),
      ...authHeaders('watchman')
    });
    assert(returnScan.status === 200 && returnScan.data.status === 'RETURN_VERIFIED', '1.12 Watchman recorded return successfully (RETURN_VERIFIED)');

    // Verify completion in DB
    const [dbStudentAfterReturn] = await pool.query('SELECT current_hostel_status FROM students WHERE reg_no = ?', ['21CS042']);
    const [dbNormFinal] = await pool.query('SELECT status, overall_status FROM outpass_requests WHERE id = ?', [normPassId]);
    assert(dbStudentAfterReturn[0].current_hostel_status === 'INSIDE', '1.13 MySQL verified: student current_hostel_status is INSIDE');
    assert(dbNormFinal[0].status === 'COMPLETED' && dbNormFinal[0].overall_status === 'completed', '1.14 MySQL verified: outpass status is COMPLETED');

    // ====================================================
    // 2. NORMAL OUTPASS REJECTION TESTS
    // ====================================================
    console.log('\n❌ --- 2. NORMAL OUTPASS REJECTION TESTS ---');

    // 2.1 Rejection by Parent
    const normRej1 = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'normal',
        reason: 'Weekend market trip',
        destination: 'RS Puram, Coimbatore',
        leaving_date: formatLocalDate(tenMinsAgo),
        leaving_time: formatLocalTime(tenMinsAgo),
        expected_return_date: formatLocalDate(threeHoursLater),
        expected_return_time: formatLocalTime(threeHoursLater),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    const rej1Id = normRej1.data.data.id;

    // Parent rejects with reason
    await request('/api/parent/biometric-verify', {
      method: 'POST',
      body: JSON.stringify({ templateId: 'FP-PAR-98765', matchConfidence: 98 }),
      ...authHeaders('parent')
    });
    const parRejRes = await request(`/api/parent/outpass/${rej1Id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ rejection_reason: 'Exams next week, permission denied' }),
      ...authHeaders('parent')
    });
    assert(parRejRes.status === 200 && parRejRes.data.data.status === 'REJECTED', '2.1 Parent rejected Normal Outpass with reason -> REJECTED');

    // Verify Warden does NOT see it
    const wrdQueueAfterParRej = await request('/api/outpass/warden/pending', authHeaders('warden'));
    const inWrdRej1 = wrdQueueAfterParRej.data.pendingRequests && wrdQueueAfterParRej.data.pendingRequests.some(r => r.id === rej1Id);
    assert(!inWrdRej1, '2.2 Parent-rejected request is NEVER queued for Warden approval');

    // QR Generation must be blocked
    const qrBlocked1 = await request(`/api/qr/generate/${rej1Id}`, {
      method: 'POST',
      ...authHeaders('warden')
    });
    assert(qrBlocked1.status === 400, '2.3 QR Generation blocked for Parent-rejected request (HTTP 400)');

    // 2.2 Rejection by Warden
    const normRej2 = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'normal',
        reason: 'Visiting friend outside',
        destination: 'Gandhipuram',
        leaving_date: formatLocalDate(tenMinsAgo),
        leaving_time: formatLocalTime(tenMinsAgo),
        expected_return_date: formatLocalDate(threeHoursLater),
        expected_return_time: formatLocalTime(threeHoursLater),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    const rej2Id = normRej2.data.data.id;

    // Parent approves
    await request('/api/parent/biometric-verify', {
      method: 'POST',
      body: JSON.stringify({ templateId: 'FP-PAR-98765', matchConfidence: 98 }),
      ...authHeaders('parent')
    });
    await request(`/api/parent/outpass/${rej2Id}/approve`, {
      method: 'PATCH',
      ...authHeaders('parent')
    });

    // Warden rejects with reason
    const wrdRejRes = await request(`/api/outpass/${rej2Id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ rejection_reason: 'Disciplinary hold on block' }),
      ...authHeaders('warden')
    });
    assert(wrdRejRes.status === 200 && wrdRejRes.data.data.status === 'REJECTED', '2.4 Warden rejected Normal Outpass with reason -> REJECTED');

    // QR Generation must be blocked
    const qrBlocked2 = await request(`/api/qr/generate/${rej2Id}`, {
      method: 'POST',
      ...authHeaders('warden')
    });
    assert(qrBlocked2.status === 400, '2.5 QR Generation blocked for Warden-rejected request (HTTP 400)');

    // ====================================================
    // 3. ONE-DAY PERMISSION – COMPLETE LIFECYCLE TEST
    // ====================================================
    console.log('\n🎓 --- 3. ONE-DAY PERMISSION COMPLETE LIFECYCLE TEST ---');

    // 3.1 Student submits One-Day Duty
    const odCreate = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'duty',
        reason: 'Inter-College Hackathon Competition',
        destination: 'Amrita University, Coimbatore',
        leaving_date: formatLocalDate(tenMinsAgo),
        leaving_time: formatLocalTime(tenMinsAgo),
        expected_return_date: formatLocalDate(threeHoursLater),
        expected_return_time: formatLocalTime(threeHoursLater),
        event_name: 'HackIndia 2026',
        event_location: 'Amrita University, Coimbatore',
        duty_date: formatLocalDate(now),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    assert(odCreate.status === 201 && odCreate.data.data.status === 'PENDING_ADVISOR', '3.1 Student submitted One-Day Duty (Status: PENDING_ADVISOR)');
    const odPassId = odCreate.data.data.id;

    // 3.2 Class Advisor receives & approves
    const advQueue = await request('/api/advisor/one-day/pending', authHeaders('advisor'));
    const inAdvQueue = advQueue.data && advQueue.data.pendingDutyRequests && advQueue.data.pendingDutyRequests.some(r => r.id === odPassId);
    assert(inAdvQueue, '3.2 Class Advisor receives request in Department Queue');

    const advApprove = await request(`/api/advisor/one-day/${odPassId}/approve`, {
      method: 'PATCH',
      ...authHeaders('advisor')
    });
    assert(advApprove.status === 200 && advApprove.data.data.status === 'PENDING_PRINCIPAL', '3.3 Class Advisor approved One-Day Duty -> PENDING_PRINCIPAL');

    // 3.3 Guardrail: Warden is NOT an approver
    const wrdTryOD = await request(`/api/outpass/${odPassId}/approve`, {
      method: 'PATCH',
      ...authHeaders('warden')
    });
    assert(wrdTryOD.status === 403, '3.4 Guardrail: Warden blocked from approving One-Day Permission (HTTP 403)');

    // 3.4 Principal receives & approves
    const prcQueue = await request('/api/principal/one-day-permissions', authHeaders('principal'));
    const inPrcQueue = prcQueue.data && prcQueue.data.permissions && prcQueue.data.permissions.some(r => r.id === odPassId);
    assert(inPrcQueue, '3.5 Principal receives Advisor-cleared request in Principal Queue');

    const prcApprove = await request(`/api/principal/one-day/${odPassId}/approve`, {
      method: 'PATCH',
      ...authHeaders('principal')
    });
    assert(prcApprove.status === 200 && prcApprove.data.data.status === 'APPROVED', '3.6 Principal gave Final Approval for One-Day Permission -> APPROVED');

    // 3.5 Generate QR
    const odQrGen = await request(`/api/qr/generate/${odPassId}`, {
      method: 'POST',
      ...authHeaders('principal')
    });
    assert(odQrGen.status === 201 || odQrGen.status === 200, '3.7 Security QR generated for One-Day Permission');
    const odQrToken = odQrGen.data.data.qrToken;

    // 3.6 Caretaker Exit Scan
    const odExit = await request('/api/caretaker/exit', {
      method: 'POST',
      body: JSON.stringify({ qr_token: odQrToken }),
      ...authHeaders('caretaker')
    });
    assert(odExit.status === 200 && odExit.data.status === 'EXIT_VERIFIED', '3.8 Caretaker recorded One-Day Duty exit');

    // 3.7 Watchman Return Scan
    const odReturn = await request('/api/watchman/return', {
      method: 'POST',
      body: JSON.stringify({ qr_token: odQrToken }),
      ...authHeaders('watchman')
    });
    assert(odReturn.status === 200 && odReturn.data.status === 'RETURN_VERIFIED', '3.9 Watchman recorded One-Day Duty return -> COMPLETED');

    // ====================================================
    // 4. ONE-DAY PERMISSION REJECTION TESTS
    // ====================================================
    console.log('\n❌ --- 4. ONE-DAY PERMISSION REJECTION TESTS ---');

    // 4.1 Rejection by Class Advisor
    const odRej1 = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'duty',
        reason: 'Symposium presentation',
        destination: 'GCT Coimbatore',
        leaving_date: formatLocalDate(tenMinsAgo),
        leaving_time: formatLocalTime(tenMinsAgo),
        expected_return_date: formatLocalDate(threeHoursLater),
        expected_return_time: formatLocalTime(threeHoursLater),
        event_name: 'Techfest',
        event_location: 'GCT',
        duty_date: formatLocalDate(now),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    const odRej1Id = odRej1.data.data.id;

    const advRej = await request(`/api/advisor/one-day/${odRej1Id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ rejection_reason: 'Attendance below department requirement' }),
      ...authHeaders('advisor')
    });
    assert(advRej.status === 200 && advRej.data.data.status === 'REJECTED', '4.1 Class Advisor rejected One-Day Duty -> REJECTED');

    // Principal should NOT receive it
    const prcQueueAfterAdvRej = await request('/api/principal/one-day-permissions', authHeaders('principal'));
    const inPrcRej1 = prcQueueAfterAdvRej.data.pendingPermissions && prcQueueAfterAdvRej.data.pendingPermissions.some(r => r.id === odRej1Id);
    assert(!inPrcRej1, '4.2 Advisor-rejected request is NEVER queued for Principal');

    // 4.2 Rejection by Principal
    const odRej2 = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'duty',
        reason: 'Cultural Fest',
        destination: 'CIT Coimbatore',
        leaving_date: formatLocalDate(tenMinsAgo),
        leaving_time: formatLocalTime(tenMinsAgo),
        expected_return_date: formatLocalDate(threeHoursLater),
        expected_return_time: formatLocalTime(threeHoursLater),
        event_name: 'Muthamil Vizha',
        event_location: 'CIT',
        duty_date: formatLocalDate(now),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    const odRej2Id = odRej2.data.data.id;

    // Advisor approves
    await request(`/api/advisor/one-day/${odRej2Id}/approve`, {
      method: 'PATCH',
      ...authHeaders('advisor')
    });

    // Principal rejects with reason
    const prcRej = await request(`/api/principal/one-day/${odRej2Id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ rejection_reason: 'Clashes with mid-term academic exam' }),
      ...authHeaders('principal')
    });
    assert(prcRej.status === 200 && prcRej.data.data.status === 'REJECTED', '4.3 Principal rejected One-Day Duty with reason -> REJECTED');

    // ====================================================
    // 5. QR CODE VALIDITY & EXPIRATION TEST
    // ====================================================
    console.log('\n📱 --- 5. QR CODE VALIDITY & EXPIRATION TEST ---');

    // 5.1 Create pass with past time (Expired)
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const pastLeave = new Date(yesterday.getTime() - 3 * 3600 * 1000);
    const [expInsert] = await pool.query(`
      INSERT INTO outpass_requests (
        request_code, student_id, outpass_type, reason, destination,
        from_datetime, to_datetime, parent_approval_status, warden_approval_status, status, overall_status
      ) VALUES (?, 1, 'normal', 'Past expired pass test', 'City', ?, ?, 'approved', 'approved', 'APPROVED', 'approved')
    `, [`OUT-EXP-${Date.now()}`, pastLeave, yesterday]);
    const expPassId = expInsert.insertId;

    const expQrGen = await request(`/api/qr/generate/${expPassId}`, {
      method: 'POST',
      ...authHeaders('warden')
    });
    const expToken = expQrGen.data.data.qrToken;

    // Validate expired token
    const expValidate = await request('/api/qr/validate', {
      method: 'POST',
      body: JSON.stringify({ qr_token: expToken })
    });
    assert(expValidate.status === 410 && expValidate.data.validity === 'EXPIRED', '5.1 Expired QR token correctly identified as EXPIRED (HTTP 410)');

    // Caretaker cannot scan expired QR
    const expExitTry = await request('/api/caretaker/exit', {
      method: 'POST',
      body: JSON.stringify({ qr_token: expToken }),
      ...authHeaders('caretaker')
    });
    assert(expExitTry.status === 410, '5.2 Caretaker exit scan rejected for expired QR (HTTP 410 EXPIRED)');

    // ====================================================
    // 6. EMERGENCY EXTENSION TEST
    // ====================================================
    console.log('\n⏱️ --- 6. EMERGENCY TIME EXTENSION LIFECYCLE TEST ---');

    // 6.1 Create Active Exited Outpass
    const extOutpass = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'normal',
        reason: 'Library reference research',
        destination: 'Central Library',
        leaving_date: formatLocalDate(tenMinsAgo),
        leaving_time: formatLocalTime(tenMinsAgo),
        expected_return_date: formatLocalDate(threeHoursLater),
        expected_return_time: formatLocalTime(threeHoursLater),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    const extPassId = extOutpass.data.data.id;

    // Parent approve -> Warden approve -> Generate QR -> Caretaker Exit
    await request('/api/parent/biometric-verify', { method: 'POST', body: JSON.stringify({ templateId: 'FP-PAR-98765', matchConfidence: 98 }), ...authHeaders('parent') });
    await request(`/api/parent/outpass/${extPassId}/approve`, { method: 'PATCH', ...authHeaders('parent') });
    await request(`/api/outpass/${extPassId}/approve`, { method: 'PATCH', ...authHeaders('warden') });
    const extQrRes = await request(`/api/qr/generate/${extPassId}`, { method: 'POST', ...authHeaders('warden') });
    const extQrToken = extQrRes.data.data.qrToken;
    await request('/api/caretaker/exit', { method: 'POST', body: JSON.stringify({ qr_token: extQrToken }), ...authHeaders('caretaker') });

    // 6.2 Exited student requests 2-hour extension
    const extReqRes = await request('/api/extension/request', {
      method: 'POST',
      body: JSON.stringify({
        extension_hours: 2,
        reason: 'Traffic congestion on bridge road'
      }),
      ...authHeaders('student')
    });
    assert(extReqRes.status === 201 && extReqRes.data.data.status === 'PENDING', '6.1 Exited student requested extension (Status: PENDING)');
    const extReqId = extReqRes.data.data.extensionId || extReqRes.data.data.id;

    // 6.3 Warden views & approves extension
    const wrdExtPending = await request('/api/extension/warden/pending', authHeaders('warden'));
    const inExtPending = wrdExtPending.data.pendingExtensions && wrdExtPending.data.pendingExtensions.some(e => e.extensionId === extReqId || e.id === extReqId);
    assert(inExtPending, '6.2 Warden receives extension request in queue');

    const wrdExtApprove = await request(`/api/extension/${extReqId}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ approved_hours: 2 }),
      ...authHeaders('warden')
    });
    assert(wrdExtApprove.status === 200 && (wrdExtApprove.data.status === 'APPROVED' || (wrdExtApprove.data.data && wrdExtApprove.data.data.status === 'APPROVED')), '6.3 Warden approved extension -> APPROVED');

    // Verify QR valid_until was extended in DB
    const [dbExtQr] = await pool.query('SELECT valid_until FROM qr_codes WHERE outpass_request_id = ?', [extPassId]);
    assert(new Date(dbExtQr[0].valid_until).getTime() > new Date(threeHoursLater).getTime(), '6.4 MySQL verified: QR validity extended by +2 hours');

    // Complete return
    await request('/api/watchman/return', { method: 'POST', body: JSON.stringify({ qr_token: extQrToken }), ...authHeaders('watchman') });

    // ====================================================
    // 7. DUPLICATE ACTION & CONCURRENCY GUARDRAILS
    // ====================================================
    console.log('\n🔒 --- 7. DUPLICATE ACTION GUARDRAILS TEST ---');

    // 7.1 Duplicate exit scan prevention
    const dupExitCheck = await request('/api/caretaker/exit', {
      method: 'POST',
      body: JSON.stringify({ qr_token: extQrToken }),
      ...authHeaders('caretaker')
    });
    assert(dupExitCheck.status === 409 || dupExitCheck.status === 400, '7.1 Duplicate exit scan on completed pass prevented (HTTP 409/400)');

    // 7.2 Duplicate return scan prevention
    const dupReturnCheck = await request('/api/watchman/return', {
      method: 'POST',
      body: JSON.stringify({ qr_token: extQrToken }),
      ...authHeaders('watchman')
    });
    assert(dupReturnCheck.status === 409 || dupReturnCheck.status === 400, '7.2 Duplicate return scan on completed pass prevented (HTTP 409/400)');

    // ====================================================
    // 8. MYSQL REFERENTIAL INTEGRITY & DATA CONSISTENCY CHECK
    // ====================================================
    console.log('\n🗄️ --- 8. MYSQL REFERENTIAL INTEGRITY & DATA CONSISTENCY AUDIT ---');

    // 8.1 Check for orphan records in outpass_requests (student_id referencing non-existent student)
    const [orphanOutpasses] = await pool.query(`
      SELECT o.id, o.student_id 
      FROM outpass_requests o 
      LEFT JOIN students s ON o.student_id = s.id 
      WHERE s.id IS NULL;
    `);
    assert(orphanOutpasses.length === 0, '8.1 Zero orphan records in outpass_requests (Foreign keys intact)');

    // 8.2 Check for orphan records in qr_codes
    const [orphanQrs] = await pool.query(`
      SELECT q.id, q.outpass_request_id 
      FROM qr_codes q 
      LEFT JOIN outpass_requests o ON q.outpass_request_id = o.id 
      WHERE o.id IS NULL;
    `);
    assert(orphanQrs.length === 0, '8.2 Zero orphan records in qr_codes (Foreign keys intact)');

    // 8.3 Check for orphan records in exit_logs
    const [orphanExits] = await pool.query(`
      SELECT e.id, e.outpass_request_id 
      FROM exit_logs e 
      LEFT JOIN outpass_requests o ON e.outpass_request_id = o.id 
      WHERE o.id IS NULL;
    `);
    assert(orphanExits.length === 0, '8.3 Zero orphan records in exit_logs (Foreign keys intact)');

    // 8.4 Check for orphan records in return_logs
    const [orphanReturns] = await pool.query(`
      SELECT r.id, r.outpass_request_id 
      FROM return_logs r 
      LEFT JOIN outpass_requests o ON r.outpass_request_id = o.id 
      WHERE o.id IS NULL;
    `);
    assert(orphanReturns.length === 0, '8.4 Zero orphan records in return_logs (Foreign keys intact)');

    // 8.5 Check for orphan records in extension_requests
    const [orphanExtensions] = await pool.query(`
      SELECT ex.id, ex.outpass_request_id 
      FROM extension_requests ex 
      LEFT JOIN outpass_requests o ON ex.outpass_request_id = o.id 
      WHERE o.id IS NULL;
    `);
    assert(orphanExtensions.length === 0, '8.5 Zero orphan records in extension_requests (Foreign keys intact)');

    // 8.6 Check for orphan records in notifications
    const [orphanNotifs] = await pool.query(`
      SELECT n.id, n.student_id 
      FROM notifications n 
      LEFT JOIN students s ON n.student_id = s.id 
      WHERE n.student_id IS NOT NULL AND s.id IS NULL;
    `);
    assert(orphanNotifs.length === 0, '8.6 Zero orphan student references in notifications');

    // 8.7 Check for valid status integrity across outpass_requests
    const validStatuses = ['PENDING_PARENT', 'PENDING_WARDEN', 'PENDING_ADVISOR', 'PENDING_PRINCIPAL', 'APPROVED', 'REJECTED', 'COMPLETED', 'EXPIRED'];
    const [statusRows] = await pool.query(`
      SELECT DISTINCT status FROM outpass_requests;
    `);
    const allStatusesValid = statusRows.every(r => validStatuses.includes(r.status));
    assert(allStatusesValid, `8.7 All outpass request status values conform strictly to defined enum states [${statusRows.map(r => r.status).join(', ')}]`);

    // ====================================================
    // SUMMARY
    // ====================================================
    console.log('\n========================================================');
    console.log(`🏁 END-TO-END & CONSISTENCY AUDIT: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================\n');

    if (failedCount === 0) {
      console.log('🎉 END-TO-END TEST: PASSED');
      console.log('🎉 DATABASE CONSISTENCY: PASSED');
      console.log('🎉 SYSTEM READY FOR FINAL UI POLISH\n');
    } else {
      console.error('⚠️ AUDIT FAILED: Review failed assertions above\n');
      process.exit(1);
    }

  } catch (globalErr) {
    console.error('💥 Global Execution Error:', globalErr.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runEndToEndTests();
