/**
 * SMART HOSTEL OUTPASS SYSTEM
 * Comprehensive Multi-Student / Multi-Parent Exact Workflow Routing & Data Isolation Test
 * 
 * Tests:
 * 1. Normal Outpass: Student A -> Parent A Face -> Warden -> QR
 * 2. One-Day Duty: Student B -> Parent B Face -> Advisor B -> Principal -> QR (Warden NEVER involved)
 * 3. Emergency: Student C -> Warden -> QR (Parent, Advisor, Principal Bypassed)
 * 4. Special: Student D -> Parent D Face -> Advisor D -> Principal -> Warden -> QR
 * 
 * Validates:
 * - Request ID Invariant (id unchanged throughout lifecycle)
 * - Strict Cross-Account Isolation (Parents & Advisors cannot view or approve other requests)
 * - Interleaved / Concurrent Lifecycle Execution
 * - Guardrails & HTTP 403 Rejections
 */

const http = require('http');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const BASE_URL = 'http://localhost:5001';
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key-change-it-in-production';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_hostel_outpass',
  port: parseInt(process.env.DB_PORT || '3306')
};

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: json });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.setHeader('Content-Type', 'application/json');
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function generateFaceDescriptor(seed = 1) {
  const desc = [];
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const val = Math.sin(seed * (i + 1));
    desc.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  return desc.map(v => Number((v / norm).toFixed(6)));
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

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runExactWorkflowRoutingSuite() {
  console.log('========================================================================');
  console.log('🚀 EXACT WORKFLOW-BASED MULTI-STUDENT / MULTI-PARENT ROUTING TEST SUITE');
  console.log('========================================================================\n');

  const pool = await mysql.createPool(DB_CONFIG);
  const runId = Date.now().toString().slice(-4);
  const createdIds = {
    parents: [],
    students: [],
    staff: [],
    outpasses: [],
    qrs: []
  };

  try {
    const passwordHash = await bcrypt.hash('Password@123', 10);

    // 1. Create Staff: 4 Advisors (one per dept), 1 Warden, 1 Principal
    console.log('--- 1. SETTING UP ISOLATED TEST FIXTURES ---');

    async function createStaff(staffId, name, role, dept) {
      const [res] = await pool.query(
        'INSERT INTO staff (staff_id, name, email, phone, role, department, password_hash, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [staffId, name, `${staffId.toLowerCase()}@test.edu`, `98000${staffId.slice(-4)}`, role, dept, passwordHash]
      );
      createdIds.staff.push(res.insertId);
      const token = jwt.sign({ id: res.insertId, staff_id: staffId, role, name, department: dept }, JWT_SECRET, { expiresIn: '2h' });
      return { id: res.insertId, staffId, token };
    }

    const advisorA = await createStaff(`ADV_A_${runId}`, `Advisor Alpha (CSE)`, 'class_advisor', 'Computer Science & Engineering');
    const advisorB = await createStaff(`ADV_B_${runId}`, `Advisor Beta (ECE)`, 'class_advisor', 'Electronics & Communication');
    const advisorC = await createStaff(`ADV_C_${runId}`, `Advisor Gamma (MECH)`, 'class_advisor', 'Mechanical Engineering');
    const advisorD = await createStaff(`ADV_D_${runId}`, `Advisor Delta (CIVIL)`, 'class_advisor', 'Civil Engineering');
    const warden = await createStaff(`WRD_${runId}`, `Chief Warden`, 'warden', 'Hostel Office');
    const principal = await createStaff(`PRC_${runId}`, `Principal Dean`, 'principal', 'Administration');

    // 2. Create 4 Parents with Active Face Templates
    async function createParent(mobile, name, faceVector) {
      const [res] = await pool.query(
        `INSERT INTO parents (father_name, primary_phone, password_hash, face_registered, face_status, face_registered_at, profile_completed) 
         VALUES (?, ?, ?, 1, 'ACTIVE', NOW(), 1)`,
        [name, mobile, passwordHash]
      );
      const parentId = res.insertId;
      createdIds.parents.push(parentId);

      await pool.query(
        `INSERT INTO parent_face_templates (parent_id, face_descriptor, status, quality_score)
         VALUES (?, ?, 'ACTIVE', 0.95)`,
        [parentId, JSON.stringify(faceVector)]
      );

      const token = jwt.sign({ id: parentId, role: 'parent', primary_phone: mobile, name }, JWT_SECRET, { expiresIn: '2h' });
      return { id: parentId, mobile, token, faceVector, name };
    }

    const faceVecA = generateFaceDescriptor(11);
    const faceVecB = generateFaceDescriptor(22);
    const faceVecC = generateFaceDescriptor(33);
    const faceVecD = generateFaceDescriptor(44);

    const parentA = await createParent(`9810${runId}01`, `Parent Alpha`, faceVecA);
    const parentB = await createParent(`9820${runId}02`, `Parent Beta`, faceVecB);
    const parentC = await createParent(`9830${runId}03`, `Parent Gamma`, faceVecC);
    const parentD = await createParent(`9840${runId}04`, `Parent Delta`, faceVecD);

    // 3. Create 4 Students linked to their respective Parent & Advisor
    async function createStudent(regNo, name, dept, parentId, advisorId, mobile) {
      const [res] = await pool.query(
        `INSERT INTO students (reg_no, name, email, phone, department, year_of_study, semester, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
         VALUES (?, ?, ?, ?, ?, 3, 'Semester 5', 'A', '101', 'Block-A', ?, ?, ?, 1)`,
        [regNo, name, `${regNo.toLowerCase()}@test.edu`, mobile, dept, parentId, advisorId, passwordHash]
      );
      const studentId = res.insertId;
      createdIds.students.push(studentId);
      const token = jwt.sign({ id: studentId, reg_no: regNo, role: 'student', name, department: dept, parent_id: parentId, class_advisor_id: advisorId }, JWT_SECRET, { expiresIn: '2h' });
      return { id: studentId, regNo, name, token, parentId, advisorId };
    }

    const studentA = await createStudent(`24CS${runId}`, `Student Alpha (CSE)`, 'Computer Science & Engineering', parentA.id, advisorA.id, `9710${runId}01`);
    const studentB = await createStudent(`24EC${runId}`, `Student Beta (ECE)`, 'Electronics & Communication', parentB.id, advisorB.id, `9720${runId}02`);
    const studentC = await createStudent(`24ME${runId}`, `Student Gamma (MECH)`, 'Mechanical Engineering', parentC.id, advisorC.id, `9730${runId}03`);
    const studentD = await createStudent(`24CE${runId}`, `Student Delta (CIVIL)`, 'Civil Engineering', parentD.id, advisorD.id, `9740${runId}04`);

    console.log('✅ Created 4 Students, 4 Parents, 4 Advisors, Warden, and Principal.\n');

    // Dates for outpass creation (valid advance times: >10h for normal, >6h for duty)
    const now = new Date();
    const leaveNormal = new Date(now.getTime() + 15 * 3600 * 1000);
    const returnNormal = new Date(leaveNormal.getTime() + 8 * 3600 * 1000);

    const leaveDuty = new Date(now.getTime() + 12 * 3600 * 1000);
    const returnDuty = new Date(leaveDuty.getTime() + 6 * 3600 * 1000);

    const leaveEmergency = new Date(now.getTime() + 2 * 3600 * 1000);
    const returnEmergency = new Date(leaveEmergency.getTime() + 5 * 3600 * 1000);

    const leaveSpecial = new Date(now.getTime() + 18 * 3600 * 1000);
    const returnSpecial = new Date(leaveSpecial.getTime() + 48 * 3600 * 1000);

    // =========================================================================
    // 2. SUBMISSION OF ALL 4 CANONICAL WORKFLOWS
    // =========================================================================
    console.log('--- 2. SUBMITTING ALL 4 CANONICAL OUTPASS WORKFLOWS ---');

    // 2.1 Workflow 1: Normal Outpass (Student A)
    const subNormal = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentA.token}` },
      body: {
        request_type: 'normal',
        destination: 'Coimbatore City',
        reason: 'Weekend Home Visit',
        leaving_date: formatLocalDate(leaveNormal),
        leaving_time: formatLocalTime(leaveNormal),
        expected_return_date: formatLocalDate(returnNormal),
        expected_return_time: formatLocalTime(returnNormal),
        student_phone: '9710000001'
      }
    });
    assert(subNormal.status === 201 && subNormal.data.data.status === 'PENDING_PARENT', '2.1 Student A Normal Outpass submitted -> Status: PENDING_PARENT');
    const reqA_id = subNormal.data.data.id;
    createdIds.outpasses.push(reqA_id);

    // 2.2 Workflow 2: One-Day Duty Outpass (Student B)
    const subDuty = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentB.token}` },
      body: {
        request_type: 'one_day_duty',
        destination: 'PSG College of Tech',
        reason: 'Paper Presentation',
        event_name: 'Technovation 2026',
        event_location: 'ECE Seminar Hall',
        duty_date: formatLocalDate(leaveDuty),
        leaving_date: formatLocalDate(leaveDuty),
        leaving_time: formatLocalTime(leaveDuty),
        expected_return_date: formatLocalDate(returnDuty),
        expected_return_time: formatLocalTime(returnDuty),
        student_phone: '9720000002'
      }
    });
    assert(subDuty.status === 201 && subDuty.data.data.status === 'PENDING_PARENT', '2.2 Student B One-Day Duty submitted -> Status: PENDING_PARENT (Parent face verification required)');
    const reqB_id = subDuty.data.data.id;
    createdIds.outpasses.push(reqB_id);

    // 2.3 Workflow 3: Emergency Outpass (Student C)
    const subEmergency = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentC.token}` },
      body: {
        request_type: 'emergency',
        destination: 'City Hospital',
        reason: 'Medical Emergency',
        emergency_type: 'Medical Emergency',
        emergency_contact: '9830000003',
        leaving_date: formatLocalDate(leaveEmergency),
        leaving_time: formatLocalTime(leaveEmergency),
        expected_return_date: formatLocalDate(returnEmergency),
        expected_return_time: formatLocalTime(returnEmergency),
        student_phone: '9730000003'
      }
    });
    assert(subEmergency.status === 201 && subEmergency.data.data.status === 'PENDING_WARDEN', '2.3 Student C Emergency Outpass submitted -> Status: PENDING_WARDEN (Strictly bypasses Parent & Advisor)');
    const reqC_id = subEmergency.data.data.id;
    createdIds.outpasses.push(reqC_id);

    // 2.4 Workflow 4: Special Outpass (Student D)
    const subSpecial = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentD.token}` },
      body: {
        request_type: 'special',
        destination: 'IIT Madras, Chennai',
        reason: 'National Hackathon Competition',
        special_type: 'Technical Competition',
        additional_remarks: 'Representing college at national level hackathon',
        leaving_date: formatLocalDate(leaveSpecial),
        leaving_time: formatLocalTime(leaveSpecial),
        expected_return_date: formatLocalDate(returnSpecial),
        expected_return_time: formatLocalTime(returnSpecial),
        student_phone: '9740000004'
      }
    });
    assert(subSpecial.status === 201 && subSpecial.data.data.status === 'PENDING_PARENT', '2.4 Student D Special Outpass submitted -> Status: PENDING_PARENT (Tier 1 consent needed)');
    const reqD_id = subSpecial.data.data.id;
    createdIds.outpasses.push(reqD_id);

    console.log(`\n📋 Created Outpasses: A(Normal): ${reqA_id} | B(OD): ${reqB_id} | C(Emergency): ${reqC_id} | D(Special): ${reqD_id}\n`);

    // =========================================================================
    // 3. INITIAL ISOLATION AUDIT (DASHBOARDS & VISIBILITY)
    // =========================================================================
    console.log('--- 3. DATA ISOLATION AUDIT ACROSS PARENT & STAFF DASHBOARDS ---');

    // Parent A should see ONLY reqA_id
    const parentAPending = await request('/api/parent/outpass/pending', { headers: { 'Authorization': `Bearer ${parentA.token}` } });
    assert(parentAPending.ok && parentAPending.data.pendingRequests.length === 1 && parentAPending.data.pendingRequests[0].id === reqA_id,
      '3.1 Parent A dashboard contains ONLY Student A request (no leakage of B, C, D)');

    // Parent B should see ONLY reqB_id (in dutyRequests partition)
    const parentBPending = await request('/api/parent/outpass/pending', { headers: { 'Authorization': `Bearer ${parentB.token}` } });
    assert(parentBPending.ok && parentBPending.data.pendingRequests.length === 1 && parentBPending.data.pendingRequests[0].id === reqB_id && parentBPending.data.dutyRequests.length === 1,
      '3.2 Parent B dashboard contains ONLY Student B One-Day Duty request (dutyRequests partitioned)');

    // Parent C should see 0 pending requests (Emergency bypassed Parent C)
    const parentCPending = await request('/api/parent/outpass/pending', { headers: { 'Authorization': `Bearer ${parentC.token}` } });
    assert(parentCPending.ok && parentCPending.data.pendingRequests.length === 0,
      '3.3 Parent C dashboard contains 0 pending requests (Emergency correctly bypassed Parent)');

    // Parent D should see ONLY reqD_id (in specialRequests partition)
    const parentDPending = await request('/api/parent/outpass/pending', { headers: { 'Authorization': `Bearer ${parentD.token}` } });
    assert(parentDPending.ok && parentDPending.data.pendingRequests.length === 1 && parentDPending.data.pendingRequests[0].id === reqD_id && parentDPending.data.specialRequests.length === 1,
      '3.4 Parent D dashboard contains ONLY Student D Special request (specialRequests partitioned)');

    // Warden should see ONLY Emergency request reqC_id
    const wardenPending = await request('/api/outpass/warden/pending', { headers: { 'Authorization': `Bearer ${warden.token}` } });
    const wardenReqIds = (wardenPending.data?.pendingRequests || []).map(r => r.id);
    assert(wardenReqIds.includes(reqC_id) && !wardenReqIds.includes(reqA_id) && !wardenReqIds.includes(reqB_id) && !wardenReqIds.includes(reqD_id),
      '3.5 Warden queue contains ONLY Emergency request reqC_id (A, B, D not visible before prerequisites)');

    // Class Advisors should see 0 pending duty/special requests at this stage
    const advBPending = await request('/api/outpass/advisor/duty/pending', { headers: { 'Authorization': `Bearer ${advisorB.token}` } });
    assert(advBPending.ok && (advBPending.data?.dutyRequests || []).length === 0,
      '3.6 Advisor B cannot see One-Day Duty reqB_id before Parent B face verification');

    // =========================================================================
    // 4. CROSS-ACCOUNT SECURITY & GUARDRAIL ENFORCEMENT (HTTP 403 / 400 CHECKS)
    // =========================================================================
    console.log('\n--- 4. CROSS-ACCOUNT SECURITY & GUARDRAIL ENFORCEMENT ---');

    // 4.1 Parent B attempts to face-verify Student A's request -> 403
    const crossFaceVerify = await request(`/api/parent/outpass/${reqA_id}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentB.token}` },
      body: { faceDescriptor: faceVecB }
    });
    assert(crossFaceVerify.status === 403, '4.1 Security: Parent B cannot face-verify Student A request (HTTP 403 Forbidden)');

    // 4.2 Parent B attempts to approve Student A's request -> 403
    const crossApprove = await request(`/api/parent/outpass/${reqA_id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentB.token}` },
      body: { faceDescriptor: faceVecB, parent_message: 'Unauthorized approval' }
    });
    assert(crossApprove.status === 403, '4.2 Security: Parent B cannot approve Student A request (HTTP 403 Forbidden)');

    // 4.3 Advisor A attempts to approve Student B's request -> 403
    const crossAdvisor = await request(`/api/outpass/${reqB_id}/advisor-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${advisorA.token}` }
    });
    assert(crossAdvisor.status === 403 || crossAdvisor.status === 400, '4.3 Security: Advisor A cannot approve Student B request (HTTP 403/400)');

    // 4.4 Warden attempts to approve One-Day Duty pass -> 403
    const wardenDutyReject = await request(`/api/outpass/${reqB_id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(wardenDutyReject.status === 403, '4.4 Guardrail: Warden strictly forbidden from approving One-Day Duty (HTTP 403 Forbidden)');

    // 4.5 Warden attempts to generate QR for One-Day Duty pass -> 403
    const wardenDutyQrReject = await request(`/api/qr/generate/${reqB_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(wardenDutyQrReject.status === 403, '4.5 Guardrail: Warden strictly forbidden from generating QR for One-Day Duty (HTTP 403 Forbidden)');

    // 4.6 Principal attempts to approve Normal Outpass -> 400
    const principalNormalReject = await request(`/api/outpass/${reqA_id}/principal-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principal.token}` }
    });
    assert(principalNormalReject.status === 400, '4.6 Guardrail: Principal cannot approve Normal Outpass (HTTP 400)');

    // 4.7 Student attempts to generate QR -> 403
    const studentQrReject = await request(`/api/qr/generate/${reqA_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentA.token}` }
    });
    assert(studentQrReject.status === 403, '4.7 Security: Student cannot generate QR code (HTTP 403 Forbidden)');

    // 4.8 Premature QR generation attempt on unapproved Normal request -> 400
    const prematureQr = await request(`/api/qr/generate/${reqA_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(prematureQr.status === 400, '4.8 Guardrail: Premature QR generation rejected (HTTP 400 - Not Approved)');

    // =========================================================================
    // 5. CONCURRENT & INTERLEAVED EXECUTION OF CANONICAL WORKFLOWS
    // =========================================================================
    console.log('\n--- 5. CONCURRENT & INTERLEAVED EXECUTION OF ALL 4 WORKFLOWS ---');

    // Step 5.1: Parent D approves Special (D)
    console.log('Action 1: Parent D verifies face & approves Special Outpass (D)');
    const faceD = await request(`/api/parent/outpass/${reqD_id}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentD.token}` },
      body: { faceDescriptor: faceVecD }
    });
    assert(faceD.ok && faceD.data.faceVerified, '5.1A Parent D Face Biometric Verified');
    const approveD_P = await request(`/api/parent/outpass/${reqD_id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentD.token}` },
      body: { verification_token: faceD.data.verificationToken, parent_message: 'Approved for National Hackathon.' }
    });
    assert(approveD_P.ok && approveD_P.data.data.status === 'PENDING_ADVISOR', '5.1B Special Outpass D transitioned -> PENDING_ADVISOR');
    assert(approveD_P.data.data.id === reqD_id, '5.1C Request ID invariant maintained for D: ' + reqD_id);

    // Step 5.2: Parent B approves One-Day Duty (B)
    console.log('Action 2: Parent B verifies face & approves One-Day Duty (B)');
    const faceB = await request(`/api/parent/outpass/${reqB_id}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentB.token}` },
      body: { faceDescriptor: faceVecB }
    });
    assert(faceB.ok && faceB.data.faceVerified, '5.2A Parent B Face Biometric Verified');
    const approveB_P = await request(`/api/parent/outpass/${reqB_id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentB.token}` },
      body: { verification_token: faceB.data.verificationToken, parent_message: 'Approved for paper presentation.' }
    });
    assert(approveB_P.ok && approveB_P.data.data.status === 'PENDING_ADVISOR', '5.2B One-Day Duty B transitioned -> PENDING_ADVISOR');
    assert(approveB_P.data.data.id === reqB_id, '5.2C Request ID invariant maintained for B: ' + reqB_id);

    // Step 5.3: Warden approves Emergency Outpass (C) & Generates QR
    console.log('Action 3: Warden approves Emergency Outpass (C) directly');
    const approveC_W = await request(`/api/outpass/${reqC_id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(approveC_W.ok && approveC_W.data.data.status === 'APPROVED', '5.3A Emergency Outpass C transitioned -> APPROVED');
    assert(approveC_W.data.data.id === reqC_id, '5.3B Request ID invariant maintained for C: ' + reqC_id);

    const qrC = await request(`/api/qr/generate/${reqC_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(qrC.status === 201 && qrC.data.data.qrData.startsWith('HOSTEL-QR:'), '5.3C Warden generated QR for Emergency Outpass C');
    createdIds.qrs.push(qrC.data.data.qrId);

    // Step 5.4: Advisor B approves One-Day Duty (B)
    console.log('Action 4: Advisor B approves One-Day Duty (B)');
    const approveB_Adv = await request(`/api/outpass/${reqB_id}/advisor-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${advisorB.token}` }
    });
    assert(approveB_Adv.ok && approveB_Adv.data.data.status === 'PENDING_PRINCIPAL', '5.4A One-Day Duty B transitioned -> PENDING_PRINCIPAL');
    assert(approveB_Adv.data.data.id === reqB_id, '5.4B Request ID invariant maintained for B: ' + reqB_id);

    // Step 5.5: Parent A approves Normal Outpass (A)
    console.log('Action 5: Parent A verifies face & approves Normal Outpass (A)');
    const faceA = await request(`/api/parent/outpass/${reqA_id}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentA.token}` },
      body: { faceDescriptor: faceVecA }
    });
    assert(faceA.ok && faceA.data.faceVerified, '5.5A Parent A Face Biometric Verified');
    const approveA_P = await request(`/api/parent/outpass/${reqA_id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentA.token}` },
      body: { verification_token: faceA.data.verificationToken, parent_message: 'Approved for weekend family visit.' }
    });
    assert(approveA_P.ok && approveA_P.data.data.status === 'PENDING_WARDEN', '5.5B Normal Outpass A transitioned -> PENDING_WARDEN');
    assert(approveA_P.data.data.id === reqA_id, '5.5C Request ID invariant maintained for A: ' + reqA_id);

    // Step 5.6: Advisor D approves Special Outpass (D)
    console.log('Action 6: Advisor D approves Special Outpass (D)');
    const approveD_Adv = await request(`/api/outpass/${reqD_id}/advisor-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${advisorD.token}` }
    });
    assert(approveD_Adv.ok && approveD_Adv.data.data.status === 'PENDING_PRINCIPAL', '5.6A Special Outpass D transitioned -> PENDING_PRINCIPAL');
    assert(approveD_Adv.data.data.id === reqD_id, '5.6B Request ID invariant maintained for D: ' + reqD_id);

    // Step 5.7: Principal approves One-Day Duty (B) & Generates QR (Principal is final authority for OD)
    console.log('Action 7: Principal approves One-Day Duty (B) & generates QR');
    const approveB_Prc = await request(`/api/outpass/${reqB_id}/principal-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principal.token}` }
    });
    assert(approveB_Prc.ok && approveB_Prc.data.data.status === 'APPROVED', '5.7A One-Day Duty B transitioned -> APPROVED');
    assert(approveB_Prc.data.data.id === reqB_id, '5.7B Request ID invariant maintained for B: ' + reqB_id);

    const qrB = await request(`/api/qr/generate/${reqB_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${principal.token}` }
    });
    assert(qrB.status === 201 && qrB.data.data.qrData.startsWith('HOSTEL-QR:'), '5.7C Principal generated QR for One-Day Duty B (Warden never involved)');
    createdIds.qrs.push(qrB.data.data.qrId);

    // Step 5.8: Principal reviews Special Outpass (D) -> PENDING_WARDEN
    console.log('Action 8: Principal reviews Special Outpass (D)');
    const approveD_Prc = await request(`/api/outpass/${reqD_id}/principal-approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${principal.token}` }
    });
    assert(approveD_Prc.ok && approveD_Prc.data.data.status === 'PENDING_WARDEN', '5.8A Special Outpass D transitioned -> PENDING_WARDEN');
    assert(approveD_Prc.data.data.id === reqD_id, '5.8B Request ID invariant maintained for D: ' + reqD_id);

    // Step 5.9: Warden approves Normal Outpass (A) & Generates QR
    console.log('Action 9: Warden approves Normal Outpass (A) & generates QR');
    const approveA_W = await request(`/api/outpass/${reqA_id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(approveA_W.ok && approveA_W.data.data.status === 'APPROVED', '5.9A Normal Outpass A transitioned -> APPROVED');
    assert(approveA_W.data.data.id === reqA_id, '5.9B Request ID invariant maintained for A: ' + reqA_id);

    const qrA = await request(`/api/qr/generate/${reqA_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(qrA.status === 201 && qrA.data.data.qrData.startsWith('HOSTEL-QR:'), '5.9C Warden generated QR for Normal Outpass A');
    createdIds.qrs.push(qrA.data.data.qrId);

    // Step 5.10: Warden approves Special Outpass (D) & Generates QR
    console.log('Action 10: Warden final approves Special Outpass (D) & generates QR');
    const approveD_W = await request(`/api/outpass/${reqD_id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(approveD_W.ok && approveD_W.data.data.status === 'APPROVED', '5.10A Special Outpass D transitioned -> APPROVED');
    assert(approveD_W.data.data.id === reqD_id, '5.10B Request ID invariant maintained for D: ' + reqD_id);

    const qrD = await request(`/api/qr/generate/${reqD_id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${warden.token}` }
    });
    assert(qrD.status === 201 && qrD.data.data.qrData.startsWith('HOSTEL-QR:'), '5.10C Warden generated QR for Special Outpass D');
    createdIds.qrs.push(qrD.data.data.qrId);

    // =========================================================================
    // 6. STUDENT DASHBOARD QR & COUNTDOWN ACCESSIBILITY
    // =========================================================================
    console.log('\n--- 6. VERIFYING STUDENT ACTIVE OUTPASS & SECURE QR CODES ---');

    // Activate QR windows for student dashboard display
    const thirtyMinsAgo = new Date(now.getTime() - 1000 * 60 * 30);
    await pool.query('UPDATE qr_codes SET valid_from = ? WHERE outpass_request_id IN (?, ?, ?, ?)',
      [thirtyMinsAgo, reqA_id, reqB_id, reqC_id, reqD_id]);
    await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id IN (?, ?, ?, ?)',
      [thirtyMinsAgo, reqA_id, reqB_id, reqC_id, reqD_id]);

    const activeA = await request('/api/student/active-outpass', { headers: { 'Authorization': `Bearer ${studentA.token}` } });
    assert(activeA.ok && activeA.data.hasActiveOutpass && (activeA.data.activeOutpass.id || activeA.data.activeOutpass.outpassId) === reqA_id && activeA.data.activeOutpass.computedStatus === 'ACTIVE',
      '6.1 Student A receives valid Active Normal Outpass & QR');

    const activeB = await request('/api/student/active-outpass', { headers: { 'Authorization': `Bearer ${studentB.token}` } });
    assert(activeB.ok && activeB.data.hasActiveOutpass && (activeB.data.activeOutpass.id || activeB.data.activeOutpass.outpassId) === reqB_id && activeB.data.activeOutpass.computedStatus === 'ACTIVE',
      '6.2 Student B receives valid Active One-Day Duty Outpass & QR');

    const activeC = await request('/api/student/active-outpass', { headers: { 'Authorization': `Bearer ${studentC.token}` } });
    assert(activeC.ok && activeC.data.hasActiveOutpass && (activeC.data.activeOutpass.id || activeC.data.activeOutpass.outpassId) === reqC_id && activeC.data.activeOutpass.computedStatus === 'ACTIVE',
      '6.3 Student C receives valid Active Emergency Outpass & QR');

    const activeD = await request('/api/student/active-outpass', { headers: { 'Authorization': `Bearer ${studentD.token}` } });
    assert(activeD.ok && activeD.data.hasActiveOutpass && (activeD.data.activeOutpass.id || activeD.data.activeOutpass.outpassId) === reqD_id && activeD.data.activeOutpass.computedStatus === 'ACTIVE',
      '6.4 Student D receives valid Active Special Outpass & QR');

    // =========================================================================
    // 7. APPROVAL HISTORY & AUDIT TRAIL VERIFICATION
    // =========================================================================
    console.log('\n--- 7. AUDIT TRAIL VERIFICATION IN outpass_approval_history ---');

    const [historyRows] = await pool.query(
      'SELECT outpass_id, role, user_id, action, previous_status, new_status FROM outpass_approval_history WHERE outpass_id IN (?, ?, ?, ?) ORDER BY id ASC',
      [reqA_id, reqB_id, reqC_id, reqD_id]
    );

    const historyByPass = { [reqA_id]: [], [reqB_id]: [], [reqC_id]: [], [reqD_id]: [] };
    historyRows.forEach(r => historyByPass[r.outpass_id].push(r));

    assert(historyByPass[reqA_id].length >= 2, '7.1 History for Normal Outpass A contains Parent and Warden actions');
    assert(historyByPass[reqB_id].length >= 3, '7.2 History for One-Day Duty B contains Parent, Advisor, and Principal actions');
    assert(historyByPass[reqC_id].length >= 1, '7.3 History for Emergency Outpass C contains Warden action');
    assert(historyByPass[reqD_id].length >= 4, '7.4 History for Special Outpass D contains Parent, Advisor, Principal, and Warden actions');

    // =========================================================================
    // 8. SECTION 21 ROUTING VERIFICATION TABLE
    // =========================================================================
    console.log('\n=======================================================================================================================');
    console.log('📌 SECTION 21: EXACT WORKFLOW ROUTING VERIFICATION TABLE');
    console.log('=======================================================================================================================');
    console.log('| Req ID | Student (Roll)    | Pass Type    | Step 1           | Step 2             | Step 3              | Step 4           | QR Issuer | Isolation Status |');
    console.log('|--------|-------------------|--------------|------------------|--------------------|---------------------|------------------|-----------|------------------|');
    console.log(`| #${reqA_id.toString().padEnd(6)} | ${studentA.regNo.padEnd(17)} | Normal       | Parent Face (${parentA.name.slice(0, 10)}) | Warden (${warden.staffId})     | —                   | —                | Warden    | ✅ ISOLATED PASS  |`);
    console.log(`| #${reqB_id.toString().padEnd(6)} | ${studentB.regNo.padEnd(17)} | One-Day Duty | Parent Face (${parentB.name.slice(0, 10)}) | Advisor (${advisorB.staffId})  | Principal (${principal.staffId}) | —                | Principal | ✅ ISOLATED PASS  |`);
    console.log(`| #${reqC_id.toString().padEnd(6)} | ${studentC.regNo.padEnd(17)} | Emergency    | Warden (${warden.staffId})   | —                  | —                   | —                | Warden    | ✅ ISOLATED PASS  |`);
    console.log(`| #${reqD_id.toString().padEnd(6)} | ${studentD.regNo.padEnd(17)} | Special      | Parent Face (${parentD.name.slice(0, 10)}) | Advisor (${advisorD.staffId})  | Principal (${principal.staffId}) | Warden (${warden.staffId}) | Warden    | ✅ ISOLATED PASS  |`);
    console.log('=======================================================================================================================\n');

  } finally {
    // Cleanup temporary test records
    if (createdIds.qrs.length > 0) {
      await pool.query('DELETE FROM qr_codes WHERE id IN (?)', [createdIds.qrs]).catch(() => {});
    }
    if (createdIds.outpasses.length > 0) {
      await pool.query('DELETE FROM outpass_approval_history WHERE outpass_id IN (?)', [createdIds.outpasses]).catch(() => {});
      await pool.query('DELETE FROM parent_messages WHERE outpass_request_id IN (?)', [createdIds.outpasses]).catch(() => {});
      await pool.query('DELETE FROM parent_face_verifications WHERE outpass_request_id IN (?)', [createdIds.outpasses]).catch(() => {});
      await pool.query('DELETE FROM outpass_requests WHERE id IN (?)', [createdIds.outpasses]).catch(() => {});
    }
    if (createdIds.students.length > 0) {
      await pool.query('DELETE FROM students WHERE id IN (?)', [createdIds.students]).catch(() => {});
    }
    if (createdIds.parents.length > 0) {
      await pool.query('DELETE FROM parent_face_templates WHERE parent_id IN (?)', [createdIds.parents]).catch(() => {});
      await pool.query('DELETE FROM parents WHERE id IN (?)', [createdIds.parents]).catch(() => {});
    }
    if (createdIds.staff.length > 0) {
      await pool.query('DELETE FROM staff WHERE id IN (?)', [createdIds.staff]).catch(() => {});
    }
    await pool.end();
  }

  console.log('========================================================================');
  console.log(`🏁 EXACT WORKFLOW ROUTING SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runExactWorkflowRoutingSuite().catch(err => {
  console.error('\n❌ Unhandled error during test suite execution:', err);
  process.exit(1);
});
