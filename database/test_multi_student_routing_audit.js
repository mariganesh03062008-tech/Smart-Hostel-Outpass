/**
 * SMART HOSTEL OUTPASS SYSTEM
 * MULTI-STUDENT + MULTI-PARENT REQUEST ROUTING & DATA ISOLATION AUDIT SUITE
 *
 * Verifies that outpass requests from different students and parents are
 * permanently bound to their respective next responsible dashboard/stakeholder.
 * Validates zero request leakage, zero cross-parent access, zero cross-student access,
 * and canonical workflow routing.
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/db');
const { JWT_SECRET } = require('../middleware/auth');
const faceConfig = require('../utils/faceConfig');

const BASE_URL = 'http://localhost:5001';

let passedCount = 0;
let failedCount = 0;
const testMatrixResults = [];

function assert(condition, testName, expected, actual, details = null) {
  const result = condition ? 'PASS' : 'FAIL';
  if (condition) {
    passedCount++;
    console.log(`  ✅ [PASS] ${testName} (Expected: ${expected}, Actual: ${actual})`);
  } else {
    failedCount++;
    console.error(`  ❌ [FAIL] ${testName} (Expected: ${expected}, Actual: ${actual})`);
    if (details) console.error(`     Details: ${JSON.stringify(details)}`);
  }
  testMatrixResults.push({
    test: testName,
    expected: String(expected),
    actual: String(actual),
    result
  });
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

// Generate deterministic 128D face descriptor
function generateDeterministicDescriptor(baseValue) {
  const descriptor = [];
  for (let i = 0; i < 128; i++) {
    descriptor.push(baseValue + (i * 0.0005));
  }
  return descriptor;
}

async function runRoutingAudit() {
  console.log('================================================================');
  console.log('🚀 MULTI-STUDENT + MULTI-PARENT ROUTING & DATA ISOLATION AUDIT');
  console.log('================================================================\n');

  try {
    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);
    const suffix = Date.now().toString().slice(-4);

    // =============================================================
    // 1. PROVISION TEST ACTORS:
    //    3 Students, 3 Parents, 3 Class Advisors, 1 Warden, 1 Principal
    // =============================================================
    console.log('--- PHASE 1: Provisioning Isolated Test Hierarchy ---');

    // 1.1 Staff - Advisors
    // Advisor A (CSE)
    const advAStaffId = `ADV_A_${suffix}`;
    const [advARes] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Advisor Alpha', ?, '9810000001', 'class_advisor', 'Computer Science & Engineering', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [advAStaffId, `adva_${suffix}@college.edu`, defaultPasswordHash]);
    const advisorAId = advARes.insertId;

    // Advisor B (CSE)
    const advBStaffId = `ADV_B_${suffix}`;
    const [advBRes] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Advisor Beta', ?, '9810000002', 'class_advisor', 'Computer Science & Engineering', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [advBStaffId, `advb_${suffix}@college.edu`, defaultPasswordHash]);
    const advisorBId = advBRes.insertId;

    // Advisor C (ECE)
    const advCStaffId = `ADV_C_${suffix}`;
    const [advCRes] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Advisor Gamma', ?, '9810000003', 'class_advisor', 'Electronics & Communication', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [advCStaffId, `advc_${suffix}@college.edu`, defaultPasswordHash]);
    const advisorCId = advCRes.insertId;

    // 1.2 Staff - Warden & Principal
    const wardenStaffId = `WRD_${suffix}`;
    const [wrdRes] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Chief Warden', ?, '9810000004', 'warden', 'Hostel Office', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [wardenStaffId, `wrd_${suffix}@college.edu`, defaultPasswordHash]);
    const wardenId = wrdRes.insertId;

    const principalStaffId = `PRC_${suffix}`;
    const [prcRes] = await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active)
      VALUES (?, 'Principal Dean', ?, '9810000005', 'principal', 'Administration', ?, 1)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [principalStaffId, `prc_${suffix}@college.edu`, defaultPasswordHash]);
    const principalId = prcRes.insertId;

    // 1.3 Parents with Registered Active Face Templates
    // Parent A
    const parentAPhone = `92${suffix}01`;
    const [pARes] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash, relationship, profile_completed, face_registered, face_status, face_registered_at)
      VALUES ('Parent Alpha', ?, ?, 'Father', 1, 1, 'ACTIVE', NOW())
    `, [parentAPhone, defaultPasswordHash]);
    const parentAId = pARes.insertId;

    const parentAFaceDescriptor = generateDeterministicDescriptor(0.10);
    await pool.query(`
      INSERT INTO parent_face_templates (parent_id, face_descriptor, quality_score, status, updated_at)
      VALUES (?, ?, 0.95, 'ACTIVE', NOW())
      ON DUPLICATE KEY UPDATE face_descriptor=VALUES(face_descriptor), status='ACTIVE'
    `, [parentAId, JSON.stringify(parentAFaceDescriptor)]);

    // Parent B
    const parentBPhone = `92${suffix}02`;
    const [pBRes] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash, relationship, profile_completed, face_registered, face_status, face_registered_at)
      VALUES ('Parent Beta', ?, ?, 'Father', 1, 1, 'ACTIVE', NOW())
    `, [parentBPhone, defaultPasswordHash]);
    const parentBId = pBRes.insertId;

    const parentBFaceDescriptor = generateDeterministicDescriptor(0.20);
    await pool.query(`
      INSERT INTO parent_face_templates (parent_id, face_descriptor, quality_score, status, updated_at)
      VALUES (?, ?, 0.95, 'ACTIVE', NOW())
      ON DUPLICATE KEY UPDATE face_descriptor=VALUES(face_descriptor), status='ACTIVE'
    `, [parentBId, JSON.stringify(parentBFaceDescriptor)]);

    // Parent C
    const parentCPhone = `92${suffix}03`;
    const [pCRes] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash, relationship, profile_completed, face_registered, face_status, face_registered_at)
      VALUES ('Parent Gamma', ?, ?, 'Mother', 1, 1, 'ACTIVE', NOW())
    `, [parentCPhone, defaultPasswordHash]);
    const parentCId = pCRes.insertId;

    const parentCFaceDescriptor = generateDeterministicDescriptor(0.30);
    await pool.query(`
      INSERT INTO parent_face_templates (parent_id, face_descriptor, quality_score, status, updated_at)
      VALUES (?, ?, 0.95, 'ACTIVE', NOW())
      ON DUPLICATE KEY UPDATE face_descriptor=VALUES(face_descriptor), status='ACTIVE'
    `, [parentCId, JSON.stringify(parentCFaceDescriptor)]);

    // 1.4 Students
    // Student A (Parent A, Advisor A)
    const stuARoll = `STU_${suffix}_A`;
    const [sARes] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, 'Student Alpha', ?, '9700000001', 'Computer Science & Engineering', 3, 'A', '101', 'Block A', ?, ?, ?, 1)
    `, [stuARoll, `stua_${suffix}@college.edu`, parentAId, advisorAId, defaultPasswordHash]);
    const studentAId = sARes.insertId;

    // Student B (Parent B, Advisor B)
    const stuBRoll = `STU_${suffix}_B`;
    const [sBRes] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, 'Student Beta', ?, '9700000002', 'Computer Science & Engineering', 3, 'B', '102', 'Block A', ?, ?, ?, 1)
    `, [stuBRoll, `stub_${suffix}@college.edu`, parentBId, advisorBId, defaultPasswordHash]);
    const studentBId = sBRes.insertId;

    // Student C (Parent C, Advisor C)
    const stuCRoll = `STU_${suffix}_C`;
    const [sCRes] = await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, 'Student Gamma', ?, '9700000003', 'Electronics & Communication', 2, 'A', '201', 'Block B', ?, ?, ?, 1)
    `, [stuCRoll, `stuc_${suffix}@college.edu`, parentCId, advisorCId, defaultPasswordHash]);
    const studentCId = sCRes.insertId;

    // 1.5 Generate Authentic JWT Auth Tokens
    const studentAToken = jwt.sign({ id: studentAId, role: 'student', identifier: stuARoll, name: 'Student Alpha' }, JWT_SECRET, { expiresIn: '2h' });
    const studentBToken = jwt.sign({ id: studentBId, role: 'student', identifier: stuBRoll, name: 'Student Beta' }, JWT_SECRET, { expiresIn: '2h' });
    const studentCToken = jwt.sign({ id: studentCId, role: 'student', identifier: stuCRoll, name: 'Student Gamma' }, JWT_SECRET, { expiresIn: '2h' });

    const parentAToken = jwt.sign({ id: parentAId, role: 'parent', identifier: parentAPhone, name: 'Parent Alpha' }, JWT_SECRET, { expiresIn: '2h' });
    const parentBToken = jwt.sign({ id: parentBId, role: 'parent', identifier: parentBPhone, name: 'Parent Beta' }, JWT_SECRET, { expiresIn: '2h' });
    const parentCToken = jwt.sign({ id: parentCId, role: 'parent', identifier: parentCPhone, name: 'Parent Gamma' }, JWT_SECRET, { expiresIn: '2h' });

    const advisorAToken = jwt.sign({ id: advisorAId, role: 'class_advisor', identifier: advAStaffId, name: 'Advisor Alpha' }, JWT_SECRET, { expiresIn: '2h' });
    const advisorBToken = jwt.sign({ id: advisorBId, role: 'class_advisor', identifier: advBStaffId, name: 'Advisor Beta' }, JWT_SECRET, { expiresIn: '2h' });
    const advisorCToken = jwt.sign({ id: advisorCId, role: 'class_advisor', identifier: advCStaffId, name: 'Advisor Gamma' }, JWT_SECRET, { expiresIn: '2h' });

    const wardenToken = jwt.sign({ id: wardenId, role: 'warden', identifier: wardenStaffId, name: 'Chief Warden' }, JWT_SECRET, { expiresIn: '2h' });
    const principalToken = jwt.sign({ id: principalId, role: 'principal', identifier: principalStaffId, name: 'Principal Dean' }, JWT_SECRET, { expiresIn: '2h' });

    console.log('✅ Test hierarchy provisioned:');
    console.log(`   Student A [${studentAId}] -> Parent A [${parentAId}] -> Advisor A [${advisorAId}]`);
    console.log(`   Student B [${studentBId}] -> Parent B [${parentBId}] -> Advisor B [${advisorBId}]`);
    console.log(`   Student C [${studentCId}] -> Parent C [${parentCId}] -> Advisor C [${advisorCId}]`);
    console.log(`   Warden [${wardenId}], Principal [${principalId}]\n`);

    // Helper dates satisfying advance notice rules (> 10h for Normal, > 6h for Duty)
    const leaveDateObj = new Date(Date.now() + 26 * 3600 * 1000);
    const returnDateObj = new Date(Date.now() + 50 * 3600 * 1000);
    const futureLeaveDate = leaveDateObj.toISOString().slice(0, 10);
    const futureReturnDate = returnDateObj.toISOString().slice(0, 10);

    // =============================================================
    // PHASE 2: CREATE CANONICAL TEST REQUESTS
    // =============================================================
    console.log('--- PHASE 2: Creating Test Outpass Requests ---');

    // Request A1: Student A -> Normal Outpass
    const resA1 = await request('/api/outpass', {
      method: 'POST',
      token: studentAToken,
      body: {
        request_type: 'normal',
        reason: 'Family event in hometown',
        destination: 'Madurai',
        leaving_date: futureLeaveDate,
        leaving_time: '18:00',
        expected_return_date: futureReturnDate,
        expected_return_time: '18:00'
      }
    });
    const reqA1Id = resA1.data?.data?.id || resA1.data?.data?.outpassId;

    // Request B1: Student B -> Normal Outpass
    const resB1 = await request('/api/outpass', {
      method: 'POST',
      token: studentBToken,
      body: {
        request_type: 'normal',
        reason: 'Visiting local relatives',
        destination: 'Coimbatore Town',
        leaving_date: futureLeaveDate,
        leaving_time: '18:00',
        expected_return_date: futureReturnDate,
        expected_return_time: '18:00'
      }
    });
    const reqB1Id = resB1.data?.data?.id || resB1.data?.data?.outpassId;

    // Request C1: Student C -> Special Outpass
    const resC1 = await request('/api/outpass', {
      method: 'POST',
      token: studentCToken,
      body: {
        request_type: 'special',
        special_type: 'Medical Treatment / Specialist Appointment',
        emergency_contact: '9700000003',
        reason: 'Doctor consultation at specialty clinic',
        destination: 'Apollo Clinic, Coimbatore',
        leaving_date: futureLeaveDate,
        leaving_time: '10:00',
        expected_return_date: futureLeaveDate,
        expected_return_time: '18:00'
      }
    });
    const reqC1Id = resC1.data?.data?.id || resC1.data?.data?.outpassId;

    // Request A_Duty: Student A -> One-Day Duty
    const resADuty = await request('/api/outpass', {
      method: 'POST',
      token: studentAToken,
      body: {
        request_type: 'one_day_duty',
        duty_date: futureLeaveDate,
        event_name: 'Inter-College Hackathon 2026',
        event_location: 'PSG Tech, Coimbatore',
        reason: 'Representing CSE department in IEEE hackathon',
        destination: 'PSG Tech, Coimbatore',
        leaving_date: futureLeaveDate,
        leaving_time: '08:00',
        expected_return_date: futureLeaveDate,
        expected_return_time: '20:00'
      }
    });
    const reqADutyId = resADuty.data?.data?.id || resADuty.data?.data?.outpassId;

    // Request B_Duty: Student B -> One-Day Duty
    const resBDuty = await request('/api/outpass', {
      method: 'POST',
      token: studentBToken,
      body: {
        request_type: 'one_day_duty',
        duty_date: futureLeaveDate,
        event_name: 'Robotics Workshop',
        event_location: 'CIT Coimbatore',
        reason: 'Attending robotics hands-on session',
        destination: 'CIT Coimbatore',
        leaving_date: futureLeaveDate,
        leaving_time: '08:30',
        expected_return_date: futureLeaveDate,
        expected_return_time: '19:30'
      }
    });
    const reqBDutyId = resBDuty.data?.data?.id || resBDuty.data?.data?.outpassId;

    // Request C_Emerg: Student C -> Emergency Outpass
    const resCEmerg = await request('/api/outpass', {
      method: 'POST',
      token: studentCToken,
      body: {
        request_type: 'emergency',
        emergency_type: 'Medical Emergency',
        emergency_contact: '9700000003',
        reason: 'Immediate urgent clinic visit',
        destination: 'City Hospital',
        leaving_date: futureLeaveDate,
        leaving_time: '14:00',
        expected_return_date: futureLeaveDate,
        expected_return_time: '22:00'
      }
    });
    const reqCEmergId = resCEmerg.data?.data?.id || resCEmerg.data?.data?.outpassId;

    console.log(`   Normal A1 ID: ${reqA1Id} (Student A)`);
    console.log(`   Normal B1 ID: ${reqB1Id} (Student B)`);
    console.log(`   Special C1 ID: ${reqC1Id} (Student C)`);
    console.log(`   Duty A_Duty ID: ${reqADutyId} (Student A)`);
    console.log(`   Duty B_Duty ID: ${reqBDutyId} (Student B)`);
    console.log(`   Emergency C_Emerg ID: ${reqCEmergId} (Student C)\n`);

    // =============================================================
    // PHASE 3: VERIFY REQUEST OWNERSHIP LINKAGE (Section 4)
    // =============================================================
    console.log('--- PHASE 3: Request Ownership Verification in Database ---');
    const [dbRows] = await pool.query(`
      SELECT o.id, o.outpass_type, o.status, o.student_id, s.name AS student_name,
             s.parent_id, p.father_name AS parent_name,
             s.class_advisor_id, adv.name AS advisor_name
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      LEFT JOIN staff adv ON s.class_advisor_id = adv.id
      WHERE o.id IN (?, ?, ?, ?, ?, ?)
      ORDER BY o.id ASC;
    `, [reqA1Id, reqB1Id, reqC1Id, reqADutyId, reqBDutyId, reqCEmergId]);

    assert(dbRows.length === 6, 'All 6 requests resolved from database by exact ID', '6 rows', `${dbRows.length} rows`);

    const rowA1 = dbRows.find(r => r.id === reqA1Id);
    assert(
      Number(rowA1.student_id) === Number(studentAId) &&
      Number(rowA1.parent_id) === Number(parentAId) &&
      Number(rowA1.class_advisor_id) === Number(advisorAId),
      'Request A1 permanently bound to Student A -> Parent A -> Advisor A',
      `stu=${studentAId}, par=${parentAId}, adv=${advisorAId}`,
      `stu=${rowA1.student_id}, par=${rowA1.parent_id}, adv=${rowA1.class_advisor_id}`
    );

    const rowB1 = dbRows.find(r => r.id === reqB1Id);
    assert(
      Number(rowB1.student_id) === Number(studentBId) &&
      Number(rowB1.parent_id) === Number(parentBId) &&
      Number(rowB1.class_advisor_id) === Number(advisorBId),
      'Request B1 permanently bound to Student B -> Parent B -> Advisor B',
      `stu=${studentBId}, par=${parentBId}, adv=${advisorBId}`,
      `stu=${rowB1.student_id}, par=${rowB1.parent_id}, adv=${rowB1.class_advisor_id}`
    );

    const rowC1 = dbRows.find(r => r.id === reqC1Id);
    assert(
      Number(rowC1.student_id) === Number(studentCId) &&
      Number(rowC1.parent_id) === Number(parentCId) &&
      Number(rowC1.class_advisor_id) === Number(advisorCId),
      'Request C1 permanently bound to Student C -> Parent C -> Advisor C',
      `stu=${studentCId}, par=${parentCId}, adv=${advisorCId}`,
      `stu=${rowC1.student_id}, par=${rowC1.parent_id}, adv=${rowC1.class_advisor_id}`
    );

    // =============================================================
    // PHASE 4: PARENT QUEUE TEST (Section 5)
    // =============================================================
    console.log('\n--- PHASE 4: Parent Queue Isolation ---');
    const pAPendingRes = await request('/api/parent/outpass/pending', { token: parentAToken });
    const pAPending = pAPendingRes.data?.pendingRequests || [];
    const pAHasA1 = pAPending.some(r => Number(r.id) === Number(reqA1Id));
    const pAHasB1 = pAPending.some(r => Number(r.id) === Number(reqB1Id));
    const pAHasC1 = pAPending.some(r => Number(r.id) === Number(reqC1Id));
    const pAHasDuty = pAPending.some(r => r.outpass_type === 'one_day_duty' || r.requestType === 'one_day_duty');
    const pAHasEmerg = pAPending.some(r => r.outpass_type === 'emergency' || r.requestType === 'emergency');

    assert(pAHasA1 === true, 'Parent A sees Student A', 'YES', pAHasA1 ? 'YES' : 'NO');
    assert(pAHasB1 === false, 'Parent A sees Student B', 'NO', pAHasB1 ? 'YES' : 'NO');
    assert(pAHasC1 === false, 'Parent A sees Student C', 'NO', pAHasC1 ? 'YES' : 'NO');
    assert(pAHasDuty === false, 'Parent A queue does NOT contain One-Day Duty', 'NO', pAHasDuty ? 'YES' : 'NO');
    assert(pAHasEmerg === false, 'Parent A queue does NOT contain Emergency', 'NO', pAHasEmerg ? 'YES' : 'NO');

    const pBPendingRes = await request('/api/parent/outpass/pending', { token: parentBToken });
    const pBPending = pBPendingRes.data?.pendingRequests || [];
    const pBHasB1 = pBPending.some(r => Number(r.id) === Number(reqB1Id));
    const pBHasA1 = pBPending.some(r => Number(r.id) === Number(reqA1Id));
    const pBHasC1 = pBPending.some(r => Number(r.id) === Number(reqC1Id));

    assert(pBHasB1 === true, 'Parent B sees Student B', 'YES', pBHasB1 ? 'YES' : 'NO');
    assert(pBHasA1 === false, 'Parent B sees Student A', 'NO', pBHasA1 ? 'YES' : 'NO');
    assert(pBHasC1 === false, 'Parent B sees Student C', 'NO', pBHasC1 ? 'YES' : 'NO');

    const pCPendingRes = await request('/api/parent/outpass/pending', { token: parentCToken });
    const pCPending = pCPendingRes.data?.pendingRequests || [];
    const pCHasC1 = pCPending.some(r => Number(r.id) === Number(reqC1Id));
    const pCHasA1 = pCPending.some(r => Number(r.id) === Number(reqA1Id));
    const pCHasB1 = pCPending.some(r => Number(r.id) === Number(reqB1Id));
    const pCHasDuty = pCPending.some(r => r.outpass_type === 'one_day_duty' || r.requestType === 'one_day_duty');
    const pCHasEmerg = pCPending.some(r => r.outpass_type === 'emergency' || r.requestType === 'emergency');

    assert(pCHasC1 === true, 'Parent C sees Student C Special Outpass', 'YES', pCHasC1 ? 'YES' : 'NO');
    assert(pCHasA1 === false, 'Parent C sees Student A', 'NO', pCHasA1 ? 'YES' : 'NO');
    assert(pCHasB1 === false, 'Parent C sees Student B', 'NO', pCHasB1 ? 'YES' : 'NO');
    assert(pCHasDuty === false, 'Parent C queue does NOT contain Duty', 'NO', pCHasDuty ? 'YES' : 'NO');
    assert(pCHasEmerg === false, 'Parent C queue does NOT contain Emergency', 'NO', pCHasEmerg ? 'YES' : 'NO');

    // =============================================================
    // PHASE 5: PARENT APPROVAL OWNERSHIP & FACE SECURITY (Sections 6 & 7)
    // =============================================================
    console.log('\n--- PHASE 5: Parent Cross-Approval & Face Verification Enforcement ---');

    // Attempt 1: Parent A attempts to verify face for Student B request
    const pAVerifyB = await request(`/api/parent/outpass/${reqB1Id}/face-verify`, {
      method: 'POST',
      token: parentAToken,
      body: { faceDescriptor: parentAFaceDescriptor, singleFace: true }
    });
    assert(pAVerifyB.status === 403, 'Parent A face-verify Student B request rejected with 403', 403, pAVerifyB.status);

    // Attempt 2: Parent A attempts to approve Student B's request directly
    const pAApproveB = await request(`/api/parent/outpass/${reqB1Id}/approve`, {
      method: 'PATCH',
      token: parentAToken,
      body: {
        faceDescriptor: parentAFaceDescriptor,
        parent_message: 'Unauthorized approval attempt by Parent A'
      }
    });
    assert(pAApproveB.status === 403, 'Parent A approves Student B request rejected with 403', 403, pAApproveB.status);

    // Attempt 3: Parent A attempts to reject Student B's request
    const pARejectB = await request(`/api/parent/outpass/${reqB1Id}/reject`, {
      method: 'PATCH',
      token: parentAToken,
      body: { rejection_reason: 'Malicious rejection attempt' }
    });
    assert(pARejectB.status === 403, 'Parent A rejects Student B request rejected with 403', 403, pARejectB.status);

    // Attempt 4: Parent B attempts to approve Student A's request
    const pBApproveA = await request(`/api/parent/outpass/${reqA1Id}/approve`, {
      method: 'PATCH',
      token: parentBToken,
      body: {
        faceDescriptor: parentBFaceDescriptor,
        parent_message: 'Unauthorized approval attempt by Parent B'
      }
    });
    assert(pBApproveA.status === 403, 'Parent B approves Student A', 403, pBApproveA.status);

    // Attempt 5: Parent B attempts to reject Student A's request
    const pBRejectA = await request(`/api/parent/outpass/${reqA1Id}/reject`, {
      method: 'PATCH',
      token: parentBToken,
      body: { rejection_reason: 'Malicious rejection attempt by Parent B' }
    });
    assert(pBRejectA.status === 403, 'Parent B rejects Student A request rejected with 403', 403, pBRejectA.status);

    // Attempt 6: Frontend bypass check - body tampering with forged parent_id / student_id
    const tamperAttempt = await request(`/api/parent/outpass/${reqB1Id}/approve`, {
      method: 'PATCH',
      token: parentAToken,
      body: {
        parent_id: parentBId,
        student_id: studentBId,
        faceMatched: true,
        parent_message: 'Bypass attempt via forged body fields'
      }
    });
    assert(tamperAttempt.status === 403, 'Body tampering with forged parent_id/student_id rejected with 403', 403, tamperAttempt.status);

    // =============================================================
    // PHASE 6: LEGITIMATE PARENT APPROVAL + MESSAGE ISOLATION (Section 8)
    // =============================================================
    console.log('\n--- PHASE 6: Legitimate Parent Approval & Message Isolation ---');

    // Parent A face verification on Student A request
    const pAVerifyA = await request(`/api/parent/outpass/${reqA1Id}/face-verify`, {
      method: 'POST',
      token: parentAToken,
      body: { faceDescriptor: parentAFaceDescriptor, singleFace: true }
    });
    assert(pAVerifyA.status === 200 && pAVerifyA.data?.faceVerified === true, 'Parent A face-verify Student A request succeeds', true, pAVerifyA.data?.faceVerified);
    const tokenA = pAVerifyA.data?.verificationToken;

    // Parent A executes approval with distinct message
    const parentAMessage = 'Approved by Parent A for Student A. Reach destination safely!';
    const pAApproveA = await request(`/api/parent/outpass/${reqA1Id}/approve`, {
      method: 'PATCH',
      token: parentAToken,
      body: {
        verification_token: tokenA,
        parent_message: parentAMessage
      }
    });
    assert(pAApproveA.status === 200 && pAApproveA.data?.success === true, 'Parent A approves Student A', 'SUCCESS', pAApproveA.status === 200 ? 'SUCCESS' : 'FAILED');

    // Verify Request A1 updated to PENDING_WARDEN
    const [rowA1After] = await pool.query('SELECT status, parent_approval_status, parent_face_verified, parent_approval_message FROM outpass_requests WHERE id = ?', [reqA1Id]);
    assert(
      rowA1After[0].status === 'PENDING_WARDEN' &&
      rowA1After[0].parent_approval_status === 'approved' &&
      rowA1After[0].parent_face_verified === 1,
      'Request A1 moved to PENDING_WARDEN with parent approval and face verified',
      'PENDING_WARDEN, approved, 1',
      `${rowA1After[0].status}, ${rowA1After[0].parent_approval_status}, ${rowA1After[0].parent_face_verified}`
    );

    // Verify Request B1 remained PENDING_PARENT (Untouched)
    const [rowB1After] = await pool.query('SELECT status, parent_approval_status, parent_face_verified FROM outpass_requests WHERE id = ?', [reqB1Id]);
    assert(
      rowB1After[0].status === 'PENDING_PARENT' &&
      rowB1After[0].parent_approval_status === 'pending',
      'Request B1 remains strictly PENDING_PARENT after Parent A approves A1',
      'PENDING_PARENT, pending',
      `${rowB1After[0].status}, ${rowB1After[0].parent_approval_status}`
    );

    // Verify Parent A approval message appears ONLY on Request A1
    assert(rowA1After[0].parent_approval_message === parentAMessage, 'Parent A approval message attached to Request A1', parentAMessage, rowA1After[0].parent_approval_message);

    // Verify message isolation in parent_messages table
    const [pmRows] = await pool.query('SELECT * FROM parent_messages WHERE outpass_request_id = ?', [reqB1Id]);
    assert(pmRows.length === 0, 'No parent messages leaked onto Request B1', 0, pmRows.length);

    // =============================================================
    // PHASE 7: ADVISOR ROUTING & ISOLATION (Section 10)
    // =============================================================
    console.log('\n--- PHASE 7: Class Advisor Routing & Isolation ---');

    // Advisor A checks duty pending queue
    const advADutyRes = await request('/api/advisor/one-day/pending', { token: advisorAToken });
    const advADutyList = advADutyRes.data?.dutyRequests || advADutyRes.data?.requests || [];
    const advAHasA = advADutyList.some(r => Number(r.id) === Number(reqADutyId));
    const advAHasB = advADutyList.some(r => Number(r.id) === Number(reqBDutyId));

    assert(advAHasA === true, 'Advisor A sees Student A OD', 'YES', advAHasA ? 'YES' : 'NO');
    assert(advAHasB === false, 'Advisor A sees Student B OD', 'NO', advAHasB ? 'YES' : 'NO');

    // Advisor B checks duty pending queue
    const advBDutyRes = await request('/api/advisor/one-day/pending', { token: advisorBToken });
    const advBDutyList = advBDutyRes.data?.dutyRequests || advBDutyRes.data?.requests || [];
    const advBHasB = advBDutyList.some(r => Number(r.id) === Number(reqBDutyId));
    const advBHasA = advBDutyList.some(r => Number(r.id) === Number(reqADutyId));

    assert(advBHasB === true, 'Advisor B sees Student B OD', 'YES', advBHasB ? 'YES' : 'NO');
    assert(advBHasA === false, 'Advisor B sees Student A OD', 'NO', advBHasA ? 'YES' : 'NO');

    // Cross-Advisor Approval: Advisor B attempts to approve Student A Duty request
    const advBApproveA = await request(`/api/advisor/one-day/${reqADutyId}/approve`, {
      method: 'PATCH',
      token: advisorBToken
    });
    assert(advBApproveA.status === 403, 'Advisor B approves Student A', 403, advBApproveA.status);

    // Legitimate Advisor A approves Student A Duty request -> moves to PENDING_PRINCIPAL
    const advAApproveA = await request(`/api/advisor/one-day/${reqADutyId}/approve`, {
      method: 'PATCH',
      token: advisorAToken
    });
    assert(advAApproveA.status === 200, 'Advisor A approves Student A Duty request', 200, advAApproveA.status);

    const [rowADutyAfter] = await pool.query('SELECT status, advisor_approval_status, advisor_approved_by_id FROM outpass_requests WHERE id = ?', [reqADutyId]);
    assert(
      rowADutyAfter[0].status === 'PENDING_PRINCIPAL' &&
      rowADutyAfter[0].advisor_approval_status === 'approved' &&
      Number(rowADutyAfter[0].advisor_approved_by_id) === Number(advisorAId),
      'Request A_Duty transitioned to PENDING_PRINCIPAL with Advisor A recorded',
      'PENDING_PRINCIPAL, approved',
      `${rowADutyAfter[0].status}, ${rowADutyAfter[0].advisor_approval_status}`
    );

    // Special Outpass C1 Workflow: Parent C approves with face verification
    const pCVerifyC = await request(`/api/parent/outpass/${reqC1Id}/face-verify`, {
      method: 'POST',
      token: parentCToken,
      body: { faceDescriptor: parentCFaceDescriptor, singleFace: true }
    });
    const tokenC = pCVerifyC.data?.verificationToken;

    await request(`/api/parent/outpass/${reqC1Id}/approve`, {
      method: 'PATCH',
      token: parentCToken,
      body: {
        verification_token: tokenC,
        parent_message: 'Approved Special Outpass for medical consultation.'
      }
    });

    // Special Outpass C1 should now appear in Advisor C's special queue
    const advCSpecialRes = await request('/api/advisor/special/pending', { token: advisorCToken });
    const advCSpecialList = advCSpecialRes.data?.specialRequests || advCSpecialRes.data?.requests || [];
    const advCHasC1 = advCSpecialList.some(r => Number(r.id) === Number(reqC1Id));
    assert(advCHasC1 === true, 'Advisor C receives approved Special Outpass C1', 'YES', advCHasC1 ? 'YES' : 'NO');

    // Advisor A must NOT see Special Outpass C1
    const advASpecialRes = await request('/api/advisor/special/pending', { token: advisorAToken });
    const advASpecialList = advASpecialRes.data?.specialRequests || advASpecialRes.data?.requests || [];
    const advAHasC1 = advASpecialList.some(r => Number(r.id) === Number(reqC1Id));
    assert(advAHasC1 === false, 'Advisor A does NOT see Special Outpass C1', 'NO', advAHasC1 ? 'YES' : 'NO');

    // Advisor C approves Special Outpass C1 -> moves to PENDING_PRINCIPAL
    const advCApproveC1 = await request(`/api/advisor/special/${reqC1Id}/approve`, {
      method: 'PATCH',
      token: advisorCToken
    });
    assert(advCApproveC1.status === 200, 'Advisor C approves Special Outpass C1', 200, advCApproveC1.status);

    // =============================================================
    // PHASE 8: PRINCIPAL ROUTING & ISOLATION (Section 11)
    // =============================================================
    console.log('\n--- PHASE 8: Principal Queue Isolation ---');

    // Principal One-Day Duty queue
    const prcDutyRes = await request('/api/principal/one-day-permissions?type=one_day_duty', { token: principalToken });
    const prcDutyList = prcDutyRes.data?.requests || prcDutyRes.data?.dutyRequests || [];
    const prcHasADuty = prcDutyList.some(r => Number(r.id) === Number(reqADutyId));
    const prcHasBDuty = prcDutyList.some(r => Number(r.id) === Number(reqBDutyId)); // B is still PENDING_ADVISOR
    const prcHasNormalA = prcDutyList.some(r => Number(r.id) === Number(reqA1Id));
    const prcHasEmergC = prcDutyList.some(r => Number(r.id) === Number(reqCEmergId));

    assert(prcHasADuty === true, 'Principal sees correct OD', 'YES', prcHasADuty ? 'YES' : 'NO');
    assert(prcHasBDuty === false, 'Principal does NOT see un-approved OD B', 'NO', prcHasBDuty ? 'YES' : 'NO');
    assert(prcHasNormalA === false, 'Principal sees unrelated Normal', 'NO', prcHasNormalA ? 'YES' : 'NO');
    assert(prcHasEmergC === false, 'Principal does NOT see Emergency', 'NO', prcHasEmergC ? 'YES' : 'NO');

    // Principal Special permissions queue
    const prcSpecialRes = await request('/api/principal/special-permissions', { token: principalToken });
    const prcSpecialList = prcSpecialRes.data?.requests || prcSpecialRes.data?.specialRequests || [];
    const prcHasC1Special = prcSpecialList.some(r => Number(r.id) === Number(reqC1Id));
    assert(prcHasC1Special === true, 'Principal receives cleared Special Outpass C1', 'YES', prcHasC1Special ? 'YES' : 'NO');

    // Principal Approves One-Day Duty reqADutyId -> moves to APPROVED (QR ready)
    const prcApproveDuty = await request(`/api/principal/one-day/${reqADutyId}/approve`, {
      method: 'PATCH',
      token: principalToken
    });
    assert(prcApproveDuty.status === 200, 'Principal approves OD request -> moves to APPROVED', 200, prcApproveDuty.status);

    const [rowADutyFinal] = await pool.query('SELECT status, principal_approval_status FROM outpass_requests WHERE id = ?', [reqADutyId]);
    assert(rowADutyFinal[0].status === 'APPROVED' && rowADutyFinal[0].principal_approval_status === 'approved', 'OD workflow complete: Student -> Advisor -> Principal -> APPROVED', 'APPROVED', rowADutyFinal[0].status);

    // Principal Approves Special Outpass reqC1Id -> moves to PENDING_WARDEN
    const prcApproveSpecial = await request(`/api/principal/special/${reqC1Id}/approve`, {
      method: 'PATCH',
      token: principalToken
    });
    assert(prcApproveSpecial.status === 200, 'Principal authorizes Special Outpass -> moves to PENDING_WARDEN', 200, prcApproveSpecial.status);

    const [rowC1SpecialFinal] = await pool.query('SELECT status, principal_approval_status FROM outpass_requests WHERE id = ?', [reqC1Id]);
    assert(rowC1SpecialFinal[0].status === 'PENDING_WARDEN', 'Special Outpass moves to PENDING_WARDEN for Warden final approval', 'PENDING_WARDEN', rowC1SpecialFinal[0].status);

    // =============================================================
    // PHASE 9: WARDEN ROUTING & ISOLATION (Section 12)
    // =============================================================
    console.log('\n--- PHASE 9: Warden Queue & Workflow Routing ---');

    // Warden Pending Queue should contain:
    // 1. Approved Normal A1
    // 2. Direct Emergency C_Emerg
    // 3. Principal-Approved Special C1
    // Should NOT contain:
    // - Unapproved Normal B1 (still PENDING_PARENT)
    // - One-Day Duty A_Duty (already finalized at Principal stage)
    const wrdPendingRes = await request('/api/outpass/warden/pending', { token: wardenToken });
    const wrdPendingList = wrdPendingRes.data?.requests || wrdPendingRes.data?.pendingRequests || [];

    const wrdHasA1 = wrdPendingList.some(r => Number(r.id) === Number(reqA1Id));
    const wrdHasB1 = wrdPendingList.some(r => Number(r.id) === Number(reqB1Id));
    const wrdHasC1 = wrdPendingList.some(r => Number(r.id) === Number(reqC1Id));
    const wrdHasCEmerg = wrdPendingList.some(r => Number(r.id) === Number(reqCEmergId));
    const wrdHasADuty = wrdPendingList.some(r => Number(r.id) === Number(reqADutyId));

    assert(wrdHasA1 === true, 'Warden receives approved Normal A', 'YES', wrdHasA1 ? 'YES' : 'NO');
    assert(wrdHasB1 === false, 'Warden does NOT receive pending-parent Normal B', 'NO', wrdHasB1 ? 'YES' : 'NO');
    assert(wrdHasCEmerg === true, 'Warden receives direct Emergency Outpass C', 'YES', wrdHasCEmerg ? 'YES' : 'NO');
    assert(wrdHasC1 === true, 'Warden receives cleared Special Outpass C', 'YES', wrdHasC1 ? 'YES' : 'NO');
    assert(wrdHasADuty === false, 'Warden queue does NOT contain One-Day Duty requests', 'NO', wrdHasADuty ? 'YES' : 'NO');

    // Warden approves Normal A1
    const wrdApproveA1 = await request(`/api/outpass/${reqA1Id}/approve`, {
      method: 'PATCH',
      token: wardenToken
    });
    assert(wrdApproveA1.status === 200, 'Warden final approval on Normal A1', 200, wrdApproveA1.status);

    // Warden approves Emergency C_Emerg
    const wrdApproveCEmerg = await request(`/api/outpass/${reqCEmergId}/approve`, {
      method: 'PATCH',
      token: wardenToken
    });
    assert(wrdApproveCEmerg.status === 200, 'Warden final approval on Emergency C_Emerg', 200, wrdApproveCEmerg.status);

    // Warden approves Special C1
    const wrdApproveC1 = await request(`/api/outpass/${reqC1Id}/approve`, {
      method: 'PATCH',
      token: wardenToken
    });
    assert(wrdApproveC1.status === 200, 'Warden final approval on Special C1', 200, wrdApproveC1.status);

    // Warden attempts to approve One-Day Duty reqADutyId -> 403 Forbidden
    const wrdApproveDuty = await request(`/api/outpass/${reqADutyId}/approve`, {
      method: 'PATCH',
      token: wardenToken
    });
    assert(wrdApproveDuty.status === 403, 'Warden attempting to approve One-Day Duty rejected with 403 Forbidden', 403, wrdApproveDuty.status);

    // Now parent B approves Student B's Normal request B1
    const pBVerifyB = await request(`/api/parent/outpass/${reqB1Id}/face-verify`, {
      method: 'POST',
      token: parentBToken,
      body: { faceDescriptor: parentBFaceDescriptor, singleFace: true }
    });
    const tokenB = pBVerifyB.data?.verificationToken;

    await request(`/api/parent/outpass/${reqB1Id}/approve`, {
      method: 'PATCH',
      token: parentBToken,
      body: {
        verification_token: tokenB,
        parent_message: 'Approved by Parent B for Student B.'
      }
    });

    // Verify Warden now receives approved Normal B
    const wrdPendingRes2 = await request('/api/outpass/warden/pending', { token: wardenToken });
    const wrdPendingList2 = wrdPendingRes2.data?.requests || wrdPendingRes2.data?.pendingRequests || [];
    const wrdHasB1Now = wrdPendingList2.some(r => Number(r.id) === Number(reqB1Id));
    assert(wrdHasB1Now === true, 'Warden receives approved Normal B', 'YES', wrdHasB1Now ? 'YES' : 'NO');

    // =============================================================
    // PHASE 10: STUDENT DASHBOARD & DIRECT API ISOLATION (Section 13)
    // =============================================================
    console.log('\n--- PHASE 10: Student Dashboard & Direct API Isolation ---');

    // Student A checks my-requests
    const stuAMyRequestsRes = await request('/api/outpass/my-requests', { token: studentAToken });
    const stuAList = stuAMyRequestsRes.data?.requests || [];
    const stuAHasA = stuAList.some(r => Number(r.id) === Number(reqA1Id));
    const stuAHasB = stuAList.some(r => Number(r.id) === Number(reqB1Id));

    assert(stuAHasA === true, 'Student A sees own requests', 'YES', stuAHasA ? 'YES' : 'NO');
    assert(stuAHasB === false, 'Student A sees Student B request', 'NO', stuAHasB ? 'YES' : 'NO');

    // Direct API Lookup /api/outpass/:id
    // Student A attempts to access Student B's request
    const directAccessAtoB = await request(`/api/outpass/${reqB1Id}`, { token: studentAToken });
    assert(directAccessAtoB.status === 403, 'Student A accessing Student B request ID yields 403 Forbidden', 403, directAccessAtoB.status);

    // Student B attempts to access Student A's request
    const directAccessBtoA = await request(`/api/outpass/${reqA1Id}`, { token: studentBToken });
    assert(directAccessBtoA.status === 403, 'Student B accessing Student A request ID yields 403 Forbidden', 403, directAccessBtoA.status);

    // Student A accesses Student A's own request
    const directAccessAtoA = await request(`/api/outpass/${reqA1Id}`, { token: studentAToken });
    assert(directAccessAtoA.status === 200 && Number(directAccessAtoA.data?.request?.id) === Number(reqA1Id), 'Student A accesses own request ID successfully', 200, directAccessAtoA.status);

    // =============================================================
    // PHASE 11: NOTIFICATION & RECIPIENT ISOLATION (Section 14)
    // =============================================================
    console.log('\n--- PHASE 11: Notification Isolation ---');

    const [notifARows] = await pool.query(`
      SELECT id, parent_id, student_id, type, title, message 
      FROM notifications 
      WHERE reference_id = ? AND parent_id = ?
    `, [String(reqA1Id), parentAId]);

    const [notifBRows] = await pool.query(`
      SELECT id, parent_id, student_id, type, title, message 
      FROM notifications 
      WHERE reference_id = ? AND parent_id = ?
    `, [String(reqA1Id), parentBId]);

    assert(notifARows.length > 0, 'Notification Parent A', 'YES', notifARows.length > 0 ? 'YES' : 'NO');
    assert(notifBRows.length === 0, 'Notification Parent B', 'NO', notifBRows.length === 0 ? 'NO' : 'YES');

    // =============================================================
    // PHASE 12: API SECURITY & ROLE RESTRICTION TEST (Section 15)
    // =============================================================
    console.log('\n--- PHASE 12: API Security & Role Restrictions ---');

    // 1. Student attempts to call Parent approval endpoint
    const stuApproveParent = await request(`/api/parent/outpass/${reqA1Id}/approve`, {
      method: 'PATCH',
      token: studentAToken,
      body: { parent_message: 'Illegal student call' }
    });
    assert(stuApproveParent.status === 403, 'Student cannot call Parent approval endpoint', 403, stuApproveParent.status);

    // 2. Parent attempts to call Advisor approval endpoint
    const parentApproveAdv = await request(`/api/advisor/one-day/${reqADutyId}/approve`, {
      method: 'PATCH',
      token: parentAToken
    });
    assert(parentApproveAdv.status === 403, 'Parent cannot call Advisor approval endpoint', 403, parentApproveAdv.status);

    // 3. Advisor attempts to call Principal approval endpoint
    const advApprovePrc = await request(`/api/principal/one-day/${reqADutyId}/approve`, {
      method: 'PATCH',
      token: advisorAToken
    });
    assert(advApprovePrc.status === 403, 'Advisor cannot call Principal approval endpoint', 403, advApprovePrc.status);

    // 4. Student attempts to call Warden approval endpoint
    const stuApproveWrd = await request(`/api/outpass/${reqA1Id}/approve`, {
      method: 'PATCH',
      token: studentAToken
    });
    assert(stuApproveWrd.status === 403, 'Student cannot call Warden approval endpoint', 403, stuApproveWrd.status);

    // =============================================================
    // PHASE 13: CONCURRENT REQUEST RACE-CONDITION TEST (Section 18)
    // =============================================================
    console.log('\n--- PHASE 13: Concurrent Request Test ---');

    const concurrentPromises = [
      request('/api/outpass', {
        method: 'POST',
        token: studentAToken,
        body: {
          request_type: 'normal',
          reason: 'Concurrent request A',
          destination: 'Tiruppur',
          leaving_date: futureLeaveDate,
          leaving_time: '18:00',
          expected_return_date: futureReturnDate,
          expected_return_time: '18:00'
        }
      }),
      request('/api/outpass', {
        method: 'POST',
        token: studentBToken,
        body: {
          request_type: 'normal',
          reason: 'Concurrent request B',
          destination: 'Salem',
          leaving_date: futureLeaveDate,
          leaving_time: '18:00',
          expected_return_date: futureReturnDate,
          expected_return_time: '18:00'
        }
      }),
      request('/api/outpass', {
        method: 'POST',
        token: studentCToken,
        body: {
          request_type: 'normal',
          reason: 'Concurrent request C',
          destination: 'Erode',
          leaving_date: futureLeaveDate,
          leaving_time: '18:00',
          expected_return_date: futureReturnDate,
          expected_return_time: '18:00'
        }
      })
    ];

    const concurrentResults = await Promise.all(concurrentPromises);
    const concAId = concurrentResults[0].data?.data?.id;
    const concBId = concurrentResults[1].data?.data?.id;
    const concCId = concurrentResults[2].data?.data?.id;

    const allDistinct = (concAId !== concBId) && (concBId !== concCId) && (concAId !== concCId);

    const [concRows] = await pool.query(
      'SELECT id, student_id FROM outpass_requests WHERE id IN (?, ?, ?)',
      [concAId, concBId, concCId]
    );

    const concAMatch = concRows.find(r => r.id === concAId)?.student_id === studentAId;
    const concBMatch = concRows.find(r => r.id === concBId)?.student_id === studentBId;
    const concCMatch = concRows.find(r => r.id === concCId)?.student_id === studentCId;

    assert(
      allDistinct && concAMatch && concBMatch && concCMatch,
      'Concurrent request isolation',
      'PASS',
      (allDistinct && concAMatch && concBMatch && concCMatch) ? 'PASS' : 'FAIL'
    );

    // =============================================================
    // PHASE 14: DATABASE VERIFICATION TABLE (Section 17)
    // =============================================================
    console.log('\n================================================================');
    console.log('📊 DATABASE RELATIONSHIP & WORKFLOW STATE TABLE');
    console.log('================================================================');

    const [finalTableRows] = await pool.query(`
      SELECT 
        o.id AS request_id,
        s.name AS student_name,
        s.id AS student_user_id,
        p.id AS parent_id,
        p.father_name AS parent_name,
        s.class_advisor_id AS advisor_id,
        o.outpass_type,
        o.status,
        CASE 
          WHEN o.status = 'APPROVED' THEN 'QR_READY / COMPLETED'
          WHEN o.status = 'PENDING_WARDEN' THEN 'WARDEN_QUEUE'
          WHEN o.status = 'PENDING_PRINCIPAL' THEN 'PRINCIPAL_QUEUE'
          WHEN o.status = 'PENDING_ADVISOR' THEN 'ADVISOR_QUEUE'
          WHEN o.status = 'PENDING_PARENT' THEN 'PARENT_QUEUE'
          ELSE o.status
        END AS current_stage
      FROM outpass_requests o
      INNER JOIN students s ON o.student_id = s.id
      LEFT JOIN parents p ON s.parent_id = p.id
      WHERE o.id IN (?, ?, ?, ?, ?, ?)
      ORDER BY o.id ASC;
    `, [reqA1Id, reqB1Id, reqC1Id, reqADutyId, reqBDutyId, reqCEmergId]);

    console.table(finalTableRows);

    // =============================================================
    // PHASE 15: REQUIRED TEST MATRIX (Section 21)
    // =============================================================
    console.log('\n================================================================');
    console.log('📋 REQUIRED TEST MATRIX RESULTS');
    console.log('================================================================');
    console.table(testMatrixResults);

    console.log('\n================================================================');
    console.log(`🏁 AUDIT COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal Error during Routing Audit:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runRoutingAudit();
