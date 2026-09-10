/**
 * SMART HOSTEL OUTPASS SYSTEM – COMPLETE STUDENT REQUEST DATA ISOLATION & WORKFLOW AUDIT
 * Comprehensive 20-Point Multi-Student Integration Test Suite
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/db');
const { JWT_SECRET } = require('../middleware/auth');

const BASE_URL = 'http://localhost:5001';

let passedCount = 0;
let failedCount = 0;

function assert(condition, message, errorDetail = '') {
  if (condition) {
    passedCount++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    failedCount++;
    console.error(`  ❌ [FAIL] ${message}`);
    if (errorDetail) console.error(`     Details: ${JSON.stringify(errorDetail)}`);
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
    ...(options.headers || {})
  };
  const fetchOptions = {
    method: options.method || 'GET',
    headers
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
  return { status: res.status, data };
}

async function runAudit() {
  console.log('========================================================');
  console.log('🚀 RUNNING COMPLETE STUDENT DATA ISOLATION & WORKFLOW AUDIT');
  console.log('========================================================\n');

  try {
    // -------------------------------------------------------------
    // SETUP: Provision distinct students, parents, advisors, warden, principal
    // -------------------------------------------------------------
    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);
    const suffix = Date.now().toString().slice(-4);

    // 1. Staff accounts
    // Advisor 1 (CSE, assigned to Student D & B)
    const adv1StaffId = `ADV_${suffix}_1`;
    const [adv1Res] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Advisor Alpha', ?, '9800000001', 'class_advisor', 'Computer Science & Engineering', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [adv1StaffId, `adv1_${suffix}@college.edu`, defaultPasswordHash]);
    const advisor1Id = adv1Res.insertId;

    // Advisor 2 (ECE, assigned to Student E)
    const adv2StaffId = `ADV_${suffix}_2`;
    const [adv2Res] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Advisor Beta', ?, '9800000002', 'class_advisor', 'Electronics & Communication', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [adv2StaffId, `adv2_${suffix}@college.edu`, defaultPasswordHash]);
    const advisor2Id = adv2Res.insertId;

    // Warden
    const wardenStaffId = `WRD_${suffix}`;
    const [wrdRes] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Warden Chief', ?, '9800000003', 'warden', 'Hostel Office', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [wardenStaffId, `wrd_${suffix}@college.edu`, defaultPasswordHash]);
    const wardenId = wrdRes.insertId;

    // Principal
    const principalStaffId = `PRC_${suffix}`;
    const [prcRes] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Principal Dean', ?, '9800000004', 'principal', 'Administration', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [principalStaffId, `prc_${suffix}@college.edu`, defaultPasswordHash]);
    const principalId = prcRes.insertId;

    // 2. Parents
    // Parent A
    const parentAPhone = `91${suffix}01`;
    const [pARes] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash, relationship, profile_completed)
      VALUES ('Parent Alpha', ?, ?, 'Father', 1)
    `, [parentAPhone, defaultPasswordHash]);
    const parentAId = pARes.insertId;

    // Parent B
    const parentBPhone = `91${suffix}02`;
    const [pBRes] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash, relationship, profile_completed)
      VALUES ('Parent Beta', ?, ?, 'Father', 1)
    `, [parentBPhone, defaultPasswordHash]);
    const parentBId = pBRes.insertId;

    // Parent C
    const parentCPhone = `91${suffix}03`;
    const [pCRes] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash, relationship, profile_completed)
      VALUES ('Parent Gamma', ?, ?, 'Mother', 1)
    `, [parentCPhone, defaultPasswordHash]);
    const parentCId = pCRes.insertId;

    // Parent D
    const parentDPhone = `91${suffix}04`;
    const [pDRes] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash, relationship, profile_completed)
      VALUES ('Parent Delta', ?, ?, 'Father', 1)
    `, [parentDPhone, defaultPasswordHash]);
    const parentDId = pDRes.insertId;

    // 3. Students
    // Student A (CSE, Parent A)
    const stuARoll = `IT_${suffix}_A`;
    const [sARes] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, 'Student Alpha', ?, '9870000001', 'Computer Science & Engineering', 3, 'A', '101', 'Block A', ?, ?, ?, 1)
    `, [stuARoll, `stua_${suffix}@college.edu`, parentAId, advisor1Id, defaultPasswordHash]);
    const studentAId = sARes.insertId;

    // Student B (CSE, Parent B, Advisor 1)
    const stuBRoll = `IT_${suffix}_B`;
    const [sBRes] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, 'Student Beta', ?, '9870000002', 'Computer Science & Engineering', 3, 'A', '102', 'Block A', ?, ?, ?, 1)
    `, [stuBRoll, `stub_${suffix}@college.edu`, parentBId, advisor1Id, defaultPasswordHash]);
    const studentBId = sBRes.insertId;

    // Student C (CSE, Parent C)
    const stuCRoll = `IT_${suffix}_C`;
    const [sCRes] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, 'Student Gamma', ?, '9870000003', 'Computer Science & Engineering', 2, 'B', '201', 'Block B', ?, ?, ?, 1)
    `, [stuCRoll, `stuc_${suffix}@college.edu`, parentCId, advisor1Id, defaultPasswordHash]);
    const studentCId = sCRes.insertId;

    // Student D (CSE, Parent D, Advisor 1)
    const stuDRoll = `IT_${suffix}_D`;
    const [sDRes] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, 'Student Delta', ?, '9870000004', 'Computer Science & Engineering', 3, 'A', '103', 'Block A', ?, ?, ?, 1)
    `, [stuDRoll, `stud_${suffix}@college.edu`, parentDId, advisor1Id, defaultPasswordHash]);
    const studentDId = sDRes.insertId;

    // Student E (ECE, Parent D, assigned to Advisor 2)
    const stuERoll = `IT_${suffix}_E`;
    const [sERes] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, 'Student Epsilon', ?, '9870000005', 'Electronics & Communication', 2, 'A', '205', 'Block C', ?, ?, ?, 1)
    `, [stuERoll, `stue_${suffix}@college.edu`, parentDId, advisor2Id, defaultPasswordHash]);
    const studentEId = sERes.insertId;

    // Generate JWT tokens
    const studentAToken = jwt.sign({ id: studentAId, role: 'student', identifier: stuARoll, name: 'Student Alpha' }, JWT_SECRET, { expiresIn: '1h' });
    const studentBToken = jwt.sign({ id: studentBId, role: 'student', identifier: stuBRoll, name: 'Student Beta' }, JWT_SECRET, { expiresIn: '1h' });
    const studentCToken = jwt.sign({ id: studentCId, role: 'student', identifier: stuCRoll, name: 'Student Gamma' }, JWT_SECRET, { expiresIn: '1h' });
    const studentDToken = jwt.sign({ id: studentDId, role: 'student', identifier: stuDRoll, name: 'Student Delta' }, JWT_SECRET, { expiresIn: '1h' });
    const studentEToken = jwt.sign({ id: studentEId, role: 'student', identifier: stuERoll, name: 'Student Epsilon' }, JWT_SECRET, { expiresIn: '1h' });

    const parentAToken = jwt.sign({ id: parentAId, role: 'parent', identifier: parentAPhone, name: 'Parent Alpha' }, JWT_SECRET, { expiresIn: '1h' });
    const parentBToken = jwt.sign({ id: parentBId, role: 'parent', identifier: parentBPhone, name: 'Parent Beta' }, JWT_SECRET, { expiresIn: '1h' });

    const advisor1Token = jwt.sign({ id: advisor1Id, role: 'class_advisor', identifier: adv1StaffId, name: 'Advisor Alpha' }, JWT_SECRET, { expiresIn: '1h' });
    const advisor2Token = jwt.sign({ id: advisor2Id, role: 'class_advisor', identifier: adv2StaffId, name: 'Advisor Beta' }, JWT_SECRET, { expiresIn: '1h' });
    const wardenToken = jwt.sign({ id: wardenId, role: 'warden', identifier: wardenStaffId, name: 'Warden Chief' }, JWT_SECRET, { expiresIn: '1h' });
    const principalToken = jwt.sign({ id: principalId, role: 'principal', identifier: principalStaffId, name: 'Principal Dean' }, JWT_SECRET, { expiresIn: '1h' });

    console.log('✅ Test actors created successfully:');
    console.log(`   Student A: ${stuARoll} (ID: ${studentAId}) -> Parent A (ID: ${parentAId})`);
    console.log(`   Student B: ${stuBRoll} (ID: ${studentBId}) -> Parent B (ID: ${parentBId})`);
    console.log(`   Student C: ${stuCRoll} (ID: ${studentCId}) -> Parent C (ID: ${parentCId})`);
    console.log(`   Student D: ${stuDRoll} (ID: ${studentDId}) -> Advisor 1 (ID: ${advisor1Id})`);
    console.log(`   Student E: ${stuERoll} (ID: ${studentEId}) -> Advisor 2 (ID: ${advisor2Id})\n`);

    // Helper dates satisfying advance notice: 26 hours in future (> 18h for Normal, > 12h for Duty)
    const leaveDateObj = new Date(Date.now() + 26 * 3600 * 1000);
    const returnDateObj = new Date(Date.now() + 50 * 3600 * 1000);
    const futureLeave = leaveDateObj.toISOString().slice(0, 10);
    const futureReturn = returnDateObj.toISOString().slice(0, 10);

    // =============================================================
    // TEST 1: Student A creates Normal Outpass -> request.student_id = Student A
    // =============================================================
    console.log('--- TEST 1 & 2: Student Request Creation & Database Source of Truth ---');
    const createARes = await request('/api/outpass', {
      method: 'POST',
      token: studentAToken,
      body: {
        request_type: 'normal',
        reason: 'Visiting Home for weekend',
        destination: 'Chennai',
        leaving_date: futureLeave,
        leaving_time: '18:00',
        expected_return_date: futureReturn,
        expected_return_time: '18:00'
      }
    });

    const requestAId = createARes.data?.data?.id || createARes.data?.data?.outpassId;
    const [reqARows] = await pool.query('SELECT id, student_id, request_code, outpass_type, status FROM outpass_requests WHERE id = ?', [requestAId || 0]);
    assert(reqARows.length > 0 && reqARows[0].student_id === studentAId, 'TEST 1: Student A creates request -> request.student_id equals Student A DB ID', createARes.data);

    // =============================================================
    // TEST 2: Student B creates Special Outpass -> request.student_id = Student B
    // =============================================================
    const createBRes = await request('/api/outpass', {
      method: 'POST',
      token: studentBToken,
      body: {
        request_type: 'special',
        special_type: 'Medical Treatment',
        reason: 'Medical examination and therapy',
        destination: 'Coimbatore Medical Hospital',
        leaving_date: futureLeave,
        leaving_time: '09:00',
        expected_return_date: futureReturn,
        expected_return_time: '17:00'
      }
    });

    const requestBId = createBRes.data?.data?.id || createBRes.data?.data?.outpassId;
    const [reqBRows] = await pool.query('SELECT id, student_id, request_code, outpass_type, status FROM outpass_requests WHERE id = ?', [requestBId || 0]);
    assert(reqBRows.length > 0 && reqBRows[0].student_id === studentBId, 'TEST 2: Student B creates request -> request.student_id equals Student B DB ID', createBRes.data);

    // =============================================================
    // TEST 3: Parent A sees Student A request -> PASS
    // =============================================================
    console.log('\n--- TEST 3, 4 & 5: Parent-Student Linking & Isolation ---');
    const parentAPending = await request('/api/parent/outpass/pending', { token: parentAToken });
    const parentAPendingList = parentAPending.data?.pendingRequests || [];
    const foundAInParentA = parentAPendingList.some(r => Number(r.id) === Number(requestAId));
    assert(foundAInParentA === true, 'TEST 3: Parent A sees Student A request in pending queue', parentAPending.data);

    // =============================================================
    // TEST 4: Parent A cannot see Student B request -> PASS
    // =============================================================
    const foundBInParentA = parentAPendingList.some(r => Number(r.id) === Number(requestBId));
    assert(foundBInParentA === false, 'TEST 4: Parent A CANNOT see Student B request in dashboard queue');

    // =============================================================
    // TEST 5: Parent B sees Student B request -> PASS
    // =============================================================
    const parentBPending = await request('/api/parent/outpass/pending', { token: parentBToken });
    const parentBPendingList = parentBPending.data?.pendingRequests || [];
    const foundBInParentB = parentBPendingList.some(r => Number(r.id) === Number(requestBId));
    const foundAInParentB = parentBPendingList.some(r => Number(r.id) === Number(requestAId));
    assert(foundBInParentB === true && foundAInParentB === false, 'TEST 5: Parent B sees ONLY Student B request and NOT Student A request', parentBPending.data);

    // =============================================================
    // TEST 6 & 7: Advisor queues for One-Day Duty and Special Outpass
    // =============================================================
    console.log('\n--- TEST 6 & 7: Class Advisor Queue Isolation ---');
    // Student D submits One-Day Duty request
    const createDRes = await request('/api/outpass', {
      method: 'POST',
      token: studentDToken,
      body: {
        request_type: 'one_day_duty',
        duty_date: futureLeave,
        event_name: 'State Tech Hackathon',
        event_location: 'PSG Tech, Coimbatore',
        reason: 'Representing college in IEEE Hackathon',
        destination: 'PSG Tech, Coimbatore',
        leaving_date: futureLeave,
        leaving_time: '08:00',
        expected_return_date: futureLeave,
        expected_return_time: '20:00'
      }
    });
    const requestDId = createDRes.data?.data?.id || createDRes.data?.data?.outpassId;

    // Student E (assigned to Advisor 2) submits One-Day Duty request
    const createERes = await request('/api/outpass', {
      method: 'POST',
      token: studentEToken,
      body: {
        request_type: 'one_day_duty',
        duty_date: futureLeave,
        event_name: 'Robotics Workshop',
        event_location: 'GCT Coimbatore',
        reason: 'Attending robotics symposium',
        destination: 'GCT Coimbatore',
        leaving_date: futureLeave,
        leaving_time: '08:30',
        expected_return_date: futureLeave,
        expected_return_time: '19:30'
      }
    });
    const requestEId = createERes.data?.data?.id || createERes.data?.data?.outpassId;

    // Advisor 1 fetches duty pending queue
    const adv1DutyRes = await request('/api/outpass/advisor/duty/pending', { token: advisor1Token });
    const adv1DutyList = adv1DutyRes.data?.dutyRequests || [];
    const adv1HasD = adv1DutyList.some(r => Number(r.id) === Number(requestDId));
    const adv1HasE = adv1DutyList.some(r => Number(r.id) === Number(requestEId));
    assert(adv1HasD === true && adv1HasE === false, 'TEST 6: Advisor 1 receives assigned Student D One-Day request and NOT Student E (assigned to Advisor 2)', { adv1HasD, adv1HasE, requestDId, requestEId, listCount: adv1DutyList.length });

    // Now parent B approves Student B's special outpass with face verification so it moves to PENDING_ADVISOR
    await pool.query(`
      UPDATE outpass_requests 
      SET status = 'PENDING_ADVISOR', parent_approval_status = 'approved', parent_face_verified = 1
      WHERE id = ?
    `, [requestBId]);

    const adv1SpecialRes = await request('/api/outpass/advisor/special/pending', { token: advisor1Token });
    const adv1SpecialList = adv1SpecialRes.data?.specialRequests || [];
    const adv1HasB = adv1SpecialList.some(r => Number(r.id) === Number(requestBId));
    assert(adv1HasB === true, 'TEST 7: Advisor 1 receives Special Outpass request B after Parent Face Clearance', adv1SpecialRes.data);

    // =============================================================
    // TEST 8 & 9: Principal One-Day and Special Queues Strict Separation
    // =============================================================
    console.log('\n--- TEST 8 & 9: Principal Queue Strict Separation ---');
    // Advisor 1 approves One-Day Duty request D -> moves to PENDING_PRINCIPAL
    await pool.query(`
      UPDATE outpass_requests 
      SET status = 'PENDING_PRINCIPAL', advisor_approval_status = 'approved', advisor_approved_by_id = ?
      WHERE id = ?
    `, [advisor1Id, requestDId]);

    // Advisor 1 approves Special request B -> moves to PENDING_PRINCIPAL
    await pool.query(`
      UPDATE outpass_requests 
      SET status = 'PENDING_PRINCIPAL', advisor_approval_status = 'approved', advisor_approved_by_id = ?
      WHERE id = ?
    `, [advisor1Id, requestBId]);

    // Fetch Principal One-Day queue
    const prcOneDayRes = await request('/api/principal/one-day-permissions?type=one_day_duty', { token: principalToken });
    const prcOneDayList = prcOneDayRes.data?.requests || prcOneDayRes.data?.dutyRequests || [];
    const prcOneDayHasD = prcOneDayList.some(r => Number(r.id) === Number(requestDId));
    const prcOneDayHasSpecial = prcOneDayList.some(r => r.outpass_type === 'special');
    assert(prcOneDayHasD === true && prcOneDayHasSpecial === false, 'TEST 8: Principal One-Day queue contains ONLY One-Day requests (Zero Special Outpasses)', prcOneDayRes.data);

    // Fetch Principal Special queue
    const prcSpecialRes = await request('/api/principal/special-permissions', { token: principalToken });
    const prcSpecialList = prcSpecialRes.data?.requests || prcSpecialRes.data?.specialRequests || [];
    const prcSpecialHasB = prcSpecialList.some(r => Number(r.id) === Number(requestBId));
    const prcSpecialHasOD = prcSpecialList.some(r => r.outpass_type === 'one_day_duty' || r.outpass_type === 'duty');
    assert(prcSpecialHasB === true && prcSpecialHasOD === false, 'TEST 9: Principal Special queue contains ONLY Special requests (Zero One-Day Duty requests)', prcSpecialRes.data);

    // =============================================================
    // TEST 10, 11 & 12: Warden Queues (Normal, Emergency, Special)
    // =============================================================
    console.log('\n--- TEST 10, 11 & 12: Warden Queues Strict Type Separation ---');
    // Student C creates Emergency Outpass -> goes directly to PENDING_WARDEN (parent approval NOT required)
    const createCRes = await request('/api/outpass', {
      method: 'POST',
      token: studentCToken,
      body: {
        request_type: 'emergency',
        emergency_type: 'Severe Acute Illness',
        emergency_contact: '9870000003',
        reason: 'Urgent medical treatment required at clinic',
        destination: 'City Hospital',
        leaving_date: futureLeave,
        leaving_time: '14:00',
        expected_return_date: futureLeave,
        expected_return_time: '22:00'
      }
    });
    const requestCId = createCRes.data?.data?.id || createCRes.data?.data?.outpassId;

    // Parent A approves Normal request A -> moves to PENDING_WARDEN
    await pool.query(`
      UPDATE outpass_requests 
      SET status = 'PENDING_WARDEN', parent_approval_status = 'approved', parent_face_verified = 1
      WHERE id = ?
    `, [requestAId]);

    // Principal approves Special request B -> moves to PENDING_WARDEN
    await pool.query(`
      UPDATE outpass_requests 
      SET status = 'PENDING_WARDEN', principal_approval_status = 'approved', principal_approved_by_id = ?
      WHERE id = ?
    `, [principalId, requestBId]);

    // Fetch Warden Normal queue
    const wrdNormalRes = await request('/api/outpass/warden/pending?type=normal', { token: wardenToken });
    const wrdNormalList = wrdNormalRes.data?.normalRequests || [];
    const wrdNormalHasA = wrdNormalList.some(r => Number(r.id) === Number(requestAId));
    const wrdNormalHasNonNormal = wrdNormalList.some(r => r.outpass_type !== 'normal' && r.outpass_type !== 'regular');
    assert(wrdNormalHasA === true && wrdNormalHasNonNormal === false, 'TEST 10: Warden Normal queue contains ONLY Normal requests', { wrdNormalHasA, count: wrdNormalList.length });

    // Fetch Warden Emergency queue
    const wrdEmergencyRes = await request('/api/outpass/warden/pending?type=emergency', { token: wardenToken });
    const wrdEmergList = wrdEmergencyRes.data?.emergencyRequests || [];
    const wrdEmergHasC = wrdEmergList.some(r => Number(r.id) === Number(requestCId));
    const wrdEmergHasNonEmerg = wrdEmergList.some(r => r.outpass_type !== 'emergency');
    assert(wrdEmergHasC === true && wrdEmergHasNonEmerg === false, 'TEST 11: Warden Emergency queue contains ONLY Emergency requests', wrdEmergencyRes.data);

    // Fetch Warden Special queue
    const wrdSpecialRes = await request('/api/outpass/warden/pending?type=special', { token: wardenToken });
    const wrdSpecialList = wrdSpecialRes.data?.specialRequests || [];
    const wrdSpecialHasB = wrdSpecialList.some(r => Number(r.id) === Number(requestBId));
    const wrdSpecialHasNonSpecial = wrdSpecialList.some(r => r.outpass_type !== 'special');
    assert(wrdSpecialHasB === true && wrdSpecialHasNonSpecial === false, 'TEST 12: Warden Special queue contains ONLY Special requests', wrdSpecialRes.data);

    // =============================================================
    // TEST 13: Unauthorized Student Request Access -> HTTP 403
    // =============================================================
    console.log('\n--- TEST 13, 14 & 15: Authorization Security & ID Tampering ---');
    // Student A tries to view Student B's outpass
    const crossStudentRes = await request(`/api/outpass/${requestBId}`, { token: studentAToken });
    assert(crossStudentRes.status === 403, 'TEST 13: Unauthorized student request access returns HTTP 403 Forbidden', crossStudentRes.status);

    // =============================================================
    // TEST 14: Unauthorized Parent Request Access -> HTTP 403
    // =============================================================
    // Parent A attempts to view Student B's outpass
    const crossParentRes = await request(`/api/parent/outpass/${requestBId}`, { token: parentAToken });
    assert(crossParentRes.status === 403, 'TEST 14: Unauthorized parent request access returns HTTP 403 Forbidden', crossParentRes.status);

    // =============================================================
    // TEST 15: ID Tampering Attempt (Advisor 1 tries to approve Student E assigned to Advisor 2)
    // =============================================================
    const tamperRes = await request(`/api/outpass/${requestEId}/advisor-approve`, {
      method: 'PATCH',
      token: advisor1Token
    });
    assert(tamperRes.status === 403, 'TEST 15: Advisor 1 ID tampering attempt to approve Student E (assigned to Advisor 2) returns HTTP 403 Forbidden', tamperRes.status);

    // =============================================================
    // TEST 16: Logout / Login Switch -> No Stale User Data Leakage
    // =============================================================
    console.log('\n--- TEST 16: Authentication Isolation & Cache Integrity ---');
    const studentAMyRequests = await request('/api/outpass/my-requests', { token: studentAToken });
    const studentBMyRequests = await request('/api/outpass/my-requests', { token: studentBToken });
    const listAIds = (studentAMyRequests.data?.requests || []).map(r => Number(r.id));
    const listBIds = (studentBMyRequests.data?.requests || []).map(r => Number(r.id));
    const noCrossPollution = !listAIds.includes(Number(requestBId)) && !listBIds.includes(Number(requestAId));
    assert(noCrossPollution === true, 'TEST 16: Student A and Student B request lists are 100% isolated with zero stale data leakage');

    // =============================================================
    // TEST 17: QR Code Isolation -> Linked to Exact Outpass
    // =============================================================
    console.log('\n--- TEST 17: QR Code Isolation & Binding ---');
    // Warden approves Normal request A
    await request(`/api/outpass/${requestAId}/approve`, {
      method: 'PATCH',
      token: wardenToken
    });

    // Warden generates QR for Normal request A
    const genQrRes = await request(`/api/qr/generate/${requestAId}`, {
      method: 'POST',
      token: wardenToken
    });
    const qrData = genQrRes.data?.data;
    const qrToken = qrData?.qrToken;

    // Set valid_from to current active window so gate scan evaluates cleanly
    await pool.query('UPDATE qr_codes SET valid_from = NOW() - INTERVAL 5 MINUTE, valid_until = NOW() + INTERVAL 2 HOUR WHERE outpass_request_id = ?', [requestAId]);

    // Validate QR token at gate checkpoint
    const validateRes = await request('/api/qr/validate', {
      method: 'POST',
      body: {
        qr_token: qrToken,
        action: 'EXIT'
      }
    });
    const scannedPass = validateRes.data;
    const studentRegScanned = scannedPass.student?.regNo;
    const matchedExactPass = studentRegScanned === stuARoll && scannedPass.validity === 'VALID';
    assert(matchedExactPass === true, 'TEST 17: Gate scanner returns exact Student A outpass details, never another student or outpass', scannedPass);

    // =============================================================
    // TEST 18: Approval Isolation -> Modifies ONLY Requested Outpass
    // =============================================================
    console.log('\n--- TEST 18: Approval Isolation ---');
    // Check status of Request B before Warden approves Request C
    const [bBefore] = await pool.query('SELECT status FROM outpass_requests WHERE id = ?', [requestBId]);
    // Approve Request C (Emergency)
    await request(`/api/outpass/${requestCId}/approve`, {
      method: 'PATCH',
      token: wardenToken
    });
    const [bAfter] = await pool.query('SELECT status FROM outpass_requests WHERE id = ?', [requestBId]);
    const [cAfter] = await pool.query('SELECT status FROM outpass_requests WHERE id = ?', [requestCId]);
    assert(cAfter[0].status === 'APPROVED' && bBefore[0].status === bAfter[0].status, 'TEST 18: Approving Emergency Request C modifies ONLY Request C and leaves Request B unchanged');

    // =============================================================
    // TEST 19: Real Authenticated Users Receive No Demo Fallback
    // =============================================================
    console.log('\n--- TEST 19: Zero Demo / Dummy Fallback ---');
    // Student C has no active QR generated yet
    const studentCActive = await request('/api/qr/my-active', { token: studentCToken });
    const hasCleanEmptyState = studentCActive.data?.hasActiveOutpass === false && studentCActive.data?.activeOutpass === null;
    assert(hasCleanEmptyState === true, 'TEST 19: When real user has no active outpass QR, API returns clean null/empty state, NEVER demo data');

    // =============================================================
    // TEST 20: Invalid Workflow Transition Rejected (HTTP 400/403)
    // =============================================================
    console.log('\n--- TEST 20: Invalid Workflow Transitions Rejection ---');
    // Create a new normal outpass at PENDING_PARENT
    const prematureRes = await request('/api/outpass', {
      method: 'POST',
      token: studentAToken,
      body: {
        request_type: 'normal',
        reason: 'Weekend test',
        destination: 'Trichy',
        leaving_date: futureLeave,
        leaving_time: '18:00',
        expected_return_date: futureReturn,
        expected_return_time: '18:00'
      }
    });
    const prematureId = prematureRes.data?.data?.id || prematureRes.data?.data?.outpassId;

    // Warden attempts to approve while request is still waiting for Parent (PENDING_PARENT)
    const prematureApproveRes = await request(`/api/outpass/${prematureId}/approve`, {
      method: 'PATCH',
      token: wardenToken
    });
    const wardenPrematureReject = prematureApproveRes.status === 400 || prematureApproveRes.status === 403;
    assert(wardenPrematureReject === true, 'TEST 20: Warden cannot approve request still in PENDING_PARENT stage (Rejected with HTTP 400)', { prematureApproveResStatus: prematureApproveRes.status, prematureId });

    // -------------------------------------------------------------
    // AUDIT SUMMARY
    // -------------------------------------------------------------
    console.log('\n========================================================');
    console.log(`🏁 AUDIT TEST SUITE FINISHED: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================\n');

    if (failedCount === 0) {
      console.log('🎉 ALL 20 DATA ISOLATION & WORKFLOW ACCEPTANCE CRITERIA MET WITH 100% SUCCESS!');
      process.exit(0);
    } else {
      console.error(`⚠️ ${failedCount} tests failed.`);
      process.exit(1);
    }

  } catch (error) {
    console.error('Audit crashed with error:', error.message);
    process.exit(1);
  }
}

runAudit();
