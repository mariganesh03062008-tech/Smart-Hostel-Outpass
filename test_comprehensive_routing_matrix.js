const { pool } = require('./utils/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const JWT_SECRET = process.env.JWT_SECRET || 'smart_hostel_outpass_secure_jwt_secret_key_2026';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ ${message}`);
}

async function runTestMatrix() {
  console.log('\n===============================================================');
  console.log('STARTING COMPREHENSIVE ONE-DAY & SPECIAL ROUTING VERIFICATION MATRIX');
  console.log('===============================================================\n');

  // Student A: ID 153 (raja, reg_no '21eee21', class_advisor_id: 3, parent_id: 153)
  const [studA] = await pool.query('SELECT s.*, p.id AS parent_id FROM students s LEFT JOIN parents p ON s.parent_id = p.id WHERE s.id = 153');
  assert(studA.length > 0, 'Student A (153) exists');

  // Advisor B
  let [advBList] = await pool.query("SELECT * FROM staff WHERE role = 'class_advisor' AND id != 3 LIMIT 1");
  let advB = advBList[0];
  if (!advB) {
    const [resB] = await pool.query(`
      INSERT INTO staff (name, staff_id, email, role, department, is_active)
      VALUES ('Advisor Beta Matrix', 'ADV-B-MAT', 'advb_matrix@college.edu', 'class_advisor', 'Mechanical Engineering', 1)
    `);
    const [created] = await pool.query('SELECT * FROM staff WHERE id = ?', [resB.insertId]);
    advB = created[0];
  }

  // Student B
  let [studBList] = await pool.query('SELECT s.*, p.id AS parent_id FROM students s LEFT JOIN parents p ON s.parent_id = p.id WHERE s.id != 153 AND s.parent_id IS NOT NULL LIMIT 1');
  let studentB = studBList[0];
  assert(studentB, 'Student B exists');
  await pool.query('UPDATE students SET class_advisor_id = ? WHERE id = ?', [advB.id, studentB.id]);
  console.log(`Linked Student B (${studentB.name}, ID: ${studentB.id}) to Advisor B (${advB.name}, ID: ${advB.id})`);

  // Tokens
  const tokenStudentA = generateToken({ id: 153, role: 'student', regNo: '21eee21' });
  const tokenStudentB = generateToken({ id: studentB.id, role: 'student', regNo: studentB.reg_no });

  const tokenParentA = generateToken({ id: studA[0].parent_id, role: 'parent', studentId: 153 });
  const tokenParentB = generateToken({ id: studentB.parent_id, role: 'parent', studentId: studentB.id });

  const tokenAdvisorA = generateToken({ id: 3, role: 'class_advisor', staffId: 'ADV-204', department: 'Computer Science & Engineering' });
  const tokenAdvisorB = generateToken({ id: advB.id, role: 'class_advisor', staffId: advB.staff_id, department: advB.department });

  // Principal & Warden
  const [principals] = await pool.query("SELECT * FROM staff WHERE role = 'principal' LIMIT 1");
  const principal = principals[0];
  const tokenPrincipal = generateToken({ id: principal.id, role: 'principal', staffId: principal.staff_id });

  const [wardens] = await pool.query("SELECT * FROM staff WHERE role = 'warden' LIMIT 1");
  const warden = wardens[0];
  const tokenWarden = generateToken({ id: warden.id, role: 'warden', staffId: warden.staff_id });

  // Generate 128-float unit vectors for biometric faces
  const rawVecA = new Array(128).fill(0).map((_, i) => Math.sin(i + 1));
  const normA = Math.sqrt(rawVecA.reduce((s, v) => s + v * v, 0));
  const testFaceVectorA = rawVecA.map(v => Number((v / normA).toFixed(6)));

  const rawVecB = new Array(128).fill(0).map((_, i) => Math.cos(i + 1));
  const normB = Math.sqrt(rawVecB.reduce((s, v) => s + v * v, 0));
  const testFaceVectorB = rawVecB.map(v => Number((v / normB).toFixed(6)));

  // Register parent faces
  await fetch(`${BASE_URL}/api/parent/face/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenParentA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ faceDescriptor: testFaceVectorA })
  });

  await fetch(`${BASE_URL}/api/parent/face/register`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenParentB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ faceDescriptor: testFaceVectorB })
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dayAfterStr = dayAfter.toISOString().split('T')[0];

  // -------------------------------------------------------------
  // TEST 1: ONE-DAY DUTY WORKFLOW
  // (Student A -> Parent A Face -> Advisor A -> Principal -> QR)
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: ONE-DAY DUTY END-TO-END WORKFLOW ---');
  
  // 1.1 Submit One-Day Duty
  const dutySubRes = await fetch(`${BASE_URL}/api/outpass`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudentA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_type: 'one_day_duty',
      reason: 'State Level Tech Symposium Presentation',
      destination: 'Government College of Technology, Coimbatore',
      event_name: 'TechFest 2026',
      event_location: 'GCT Campus',
      duty_date: tomorrowStr,
      duty_description: 'Paper Presentation & Robotics Track',
      leaving_date: tomorrowStr,
      leaving_time: '08:00',
      expected_return_date: tomorrowStr,
      expected_return_time: '18:00',
      student_phone: '9876543210'
    })
  }).then(r => r.json());

  assert(dutySubRes.success === true, `Student A submits One-Day Duty (Status: ${dutySubRes.data?.status})`);
  const dutyReqId = dutySubRes.data.id;
  const dutyReqCode = dutySubRes.data.requestCode;
  assert(dutySubRes.data.status === 'PENDING_PARENT', 'Initial status is PENDING_PARENT');

  // 1.2 Parent A Face Biometric Verification & Approval
  const faceVerifyA = await fetch(`${BASE_URL}/api/parent/outpass/${dutyReqId}/face-verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenParentA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ faceDescriptor: testFaceVectorA })
  }).then(r => r.json());
  assert(faceVerifyA.success && faceVerifyA.faceVerified, 'Parent A Face Biometric verification successful');

  const parentDutyApproveRes = await fetch(`${BASE_URL}/api/parent/outpass/${dutyReqId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenParentA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      verification_token: faceVerifyA.verificationToken,
      parent_message: 'I approve my son Raja attending the Tech symposium.'
    })
  }).then(r => r.json());

  assert(parentDutyApproveRes.success === true, 'Parent A approved One-Day Duty with Biometrics & Message');
  assert(parentDutyApproveRes.data.status === 'PENDING_ADVISOR', 'Duty pass transitioned to PENDING_ADVISOR');
  assert(parentDutyApproveRes.data.id === dutyReqId, 'SAME database request ID maintained after Parent approval');

  // 1.3 Verify Request appears in Advisor A's Queue (and NOT in Advisor B's queue!)
  const advAQueue1 = await fetch(`${BASE_URL}/api/advisor/duty/pending`, {
    headers: { 'Authorization': `Bearer ${tokenAdvisorA}` }
  }).then(r => r.json());
  const foundDutyAdvA = advAQueue1.requests.find(r => r.id === dutyReqId);
  assert(Boolean(foundDutyAdvA), `Request ${dutyReqCode} appears in Advisor A's duty pending queue`);

  const advBQueue1 = await fetch(`${BASE_URL}/api/advisor/duty/pending`, {
    headers: { 'Authorization': `Bearer ${tokenAdvisorB}` }
  }).then(r => r.json());
  const foundDutyAdvB = advBQueue1.requests.find(r => r.id === dutyReqId);
  assert(!foundDutyAdvB, `Request ${dutyReqCode} is strictly ISOLATED and NOT visible to Advisor B`);

  // 1.4 Advisor B attempts unauthorized approval (Must be rejected with 403)
  const unauthAdvB = await fetch(`${BASE_URL}/api/outpass/${dutyReqId}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenAdvisorB}` }
  });
  assert(unauthAdvB.status === 403, 'Cross-advisor approval attempt rejected with HTTP 403 Forbidden');

  // 1.5 Advisor A Approves Request -> moves to PENDING_PRINCIPAL
  const advDutyApproveRes = await fetch(`${BASE_URL}/api/outpass/${dutyReqId}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenAdvisorA}` }
  }).then(r => r.json());
  assert(advDutyApproveRes.success === true, 'Advisor A successfully approves One-Day Duty');
  assert(advDutyApproveRes.data.status === 'PENDING_PRINCIPAL', 'Duty pass transitioned to PENDING_PRINCIPAL');
  assert(advDutyApproveRes.data.id === dutyReqId, 'SAME request ID maintained after Advisor approval');

  // 1.6 Verify Request appears in Principal's One-Day Queue
  const prcQueue1 = await fetch(`${BASE_URL}/api/principal/one-day-permissions`, {
    headers: { 'Authorization': `Bearer ${tokenPrincipal}` }
  }).then(r => r.json());
  const foundDutyPrc = prcQueue1.permissions.find(r => r.id === dutyReqId);
  assert(Boolean(foundDutyPrc), `Request ${dutyReqCode} appears in Principal One-Day queue`);

  // 1.7 Principal Approves Request -> moves to APPROVED (One-Day Duty bypasses Warden)
  const prcDutyApproveRes = await fetch(`${BASE_URL}/api/outpass/${dutyReqId}/principal-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenPrincipal}` }
  }).then(r => r.json());
  assert(prcDutyApproveRes.success === true, 'Principal successfully approves One-Day Duty');
  assert(prcDutyApproveRes.data.status === 'APPROVED', 'One-Day Duty pass status is APPROVED (Final)');
  assert(prcDutyApproveRes.data.id === dutyReqId, 'SAME request ID maintained across entire One-Day lifecycle');

  // 1.8 Principal generates Gate Pass QR for One-Day Duty
  const qrGenRes1 = await fetch(`${BASE_URL}/api/qr/generate/${dutyReqId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenPrincipal}` }
  }).then(r => r.json());
  assert(qrGenRes1.success === true && qrGenRes1.data?.qrImageData, 'Gate Pass QR code successfully generated for Approved One-Day Duty');

  const activeRes1 = await fetch(`${BASE_URL}/api/qr/my-active`, {
    headers: { 'Authorization': `Bearer ${tokenStudentA}` }
  }).then(r => r.json());
  console.log('activeRes1:', activeRes1);
  assert(activeRes1.success === true && activeRes1.hasActiveOutpass, 'Student A sees One-Day Duty in Active Outpass');


  // -------------------------------------------------------------
  // TEST 2: SPECIAL OUTPASS WORKFLOW
  // (Student B -> Parent B Face -> Advisor B -> Principal -> Warden -> QR)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: SPECIAL OUTPASS END-TO-END WORKFLOW ---');

  // 2.1 Submit Special Outpass
  const spcSubRes = await fetch(`${BASE_URL}/api/outpass`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudentB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_type: 'special',
      special_type: 'Family Function / Festival',
      reason: 'Sister Wedding Ceremony in Native Town',
      destination: 'Madurai',
      leaving_date: tomorrowStr,
      leaving_time: '10:00',
      expected_return_date: dayAfterStr,
      expected_return_time: '20:00',
      student_phone: '9876543211',
      emergency_contact: '9876543212',
      additional_remarks: 'Formal invitation attached'
    })
  }).then(r => r.json());

  assert(spcSubRes.success === true, `Student B submits Special Outpass (Status: ${spcSubRes.data?.status})`);
  const spcReqId = spcSubRes.data.id;
  const spcReqCode = spcSubRes.data.requestCode;
  assert(spcSubRes.data.status === 'PENDING_PARENT', 'Initial status is PENDING_PARENT');

  // 2.2 Parent B Face Biometric Verification & Approval
  const faceVerifyB = await fetch(`${BASE_URL}/api/parent/outpass/${spcReqId}/face-verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenParentB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ faceDescriptor: testFaceVectorB })
  }).then(r => r.json());
  assert(faceVerifyB.success && faceVerifyB.faceVerified, 'Parent B Face Biometric verification successful');

  const parentSpcApproveRes = await fetch(`${BASE_URL}/api/parent/outpass/${spcReqId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenParentB}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      verification_token: faceVerifyB.verificationToken,
      parent_message: 'We approve our child travelling home for sister wedding ceremony.'
    })
  }).then(r => r.json());

  assert(parentSpcApproveRes.success === true, 'Parent B approved Special Outpass with Biometrics & Message');
  assert(parentSpcApproveRes.data.status === 'PENDING_ADVISOR', 'Special pass transitioned to PENDING_ADVISOR');
  assert(parentSpcApproveRes.data.id === spcReqId, 'SAME request ID maintained after Parent approval');

  // 2.3 Verify Request appears in Advisor B's Queue (and NOT Advisor A!)
  const advBQueue2 = await fetch(`${BASE_URL}/api/advisor/special/pending`, {
    headers: { 'Authorization': `Bearer ${tokenAdvisorB}` }
  }).then(r => r.json());
  const foundSpcAdvB = advBQueue2.requests.find(r => r.id === spcReqId);
  assert(Boolean(foundSpcAdvB), `Request ${spcReqCode} appears in Advisor B's special pending queue`);

  const advAQueue2 = await fetch(`${BASE_URL}/api/advisor/special/pending`, {
    headers: { 'Authorization': `Bearer ${tokenAdvisorA}` }
  }).then(r => r.json());
  const foundSpcAdvA = advAQueue2.requests.find(r => r.id === spcReqId);
  assert(!foundSpcAdvA, `Request ${spcReqCode} is strictly ISOLATED from Advisor A`);

  // 2.4 Advisor A attempts unauthorized approval (403 Forbidden)
  const unauthAdvA = await fetch(`${BASE_URL}/api/outpass/${spcReqId}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenAdvisorA}` }
  });
  assert(unauthAdvA.status === 403, 'Cross-advisor approval attempt on Special pass rejected with HTTP 403');

  // 2.5 Advisor B Approves Special Outpass -> moves to PENDING_PRINCIPAL
  const advBSpcApproveRes = await fetch(`${BASE_URL}/api/outpass/${spcReqId}/advisor-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenAdvisorB}` }
  }).then(r => r.json());
  assert(advBSpcApproveRes.success === true, 'Advisor B approves Special Outpass');
  assert(advBSpcApproveRes.data.status === 'PENDING_PRINCIPAL', 'Special pass transitioned to PENDING_PRINCIPAL');

  // 2.6 Verify Special Outpass appears in Principal's Special Permissions Queue
  const prcQueue2 = await fetch(`${BASE_URL}/api/principal/special-permissions`, {
    headers: { 'Authorization': `Bearer ${tokenPrincipal}` }
  }).then(r => r.json());
  const foundSpcPrc = prcQueue2.requests.find(r => r.id === spcReqId);
  assert(Boolean(foundSpcPrc), `Request ${spcReqCode} appears in Principal Special queue`);

  // 2.7 Principal Approves Special Outpass -> moves to PENDING_WARDEN (Forwarded to Warden!)
  const prcSpcApproveRes = await fetch(`${BASE_URL}/api/outpass/${spcReqId}/principal-approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenPrincipal}` }
  }).then(r => r.json());
  assert(prcSpcApproveRes.success === true, 'Principal clears Special Outpass');
  assert(prcSpcApproveRes.data.status === 'PENDING_WARDEN', 'Special pass status transitioned to PENDING_WARDEN for Warden final approval');

  // 2.8 Verify Special Outpass appears in Warden's Pending Queue
  const wrdQueue = await fetch(`${BASE_URL}/api/outpass/warden/pending?type=special`, {
    headers: { 'Authorization': `Bearer ${tokenWarden}` }
  }).then(r => r.json());
  const foundSpcWrd = wrdQueue.specialRequests.find(r => r.id === spcReqId);
  assert(Boolean(foundSpcWrd), `Request ${spcReqCode} appears in Warden Special queue`);

  // 2.9 Warden Approves Special Outpass -> moves to APPROVED (Final)
  const wrdApproveRes = await fetch(`${BASE_URL}/api/outpass/${spcReqId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenWarden}` }
  }).then(r => r.json());
  assert(wrdApproveRes.success === true, 'Warden grants final approval to Special Outpass');
  assert(wrdApproveRes.data.status === 'APPROVED', 'Special pass status is APPROVED (Final)');
  assert(wrdApproveRes.data.id === spcReqId, 'SAME request ID maintained across entire Special Outpass lifecycle');

  // 2.10 Warden generates Gate Pass QR for Special Outpass
  const qrGenRes2 = await fetch(`${BASE_URL}/api/qr/generate/${spcReqId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenWarden}` }
  }).then(r => r.json());
  assert(qrGenRes2.success === true && qrGenRes2.data?.qrImageData, 'Gate Pass QR code successfully generated for Approved Special Outpass');

  const activeRes2 = await fetch(`${BASE_URL}/api/qr/my-active`, {
    headers: { 'Authorization': `Bearer ${tokenStudentB}` }
  }).then(r => r.json());
  assert(activeRes2.success === true && activeRes2.hasActiveOutpass, 'Student B sees Special Outpass in Active Outpass');


  // -------------------------------------------------------------
  // TEST 3: REGRESSION ON NORMAL OUTPASS
  // (Student -> Parent Face -> Warden -> QR; Advisor & Principal bypassed)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: NORMAL OUTPASS REGRESSION TEST ---');

  const normalSubRes = await fetch(`${BASE_URL}/api/outpass`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudentA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_type: 'normal',
      reason: 'Weekend Family Visit',
      destination: 'Chennai',
      leaving_date: tomorrowStr,
      leaving_time: '17:00',
      expected_return_date: dayAfterStr,
      expected_return_time: '21:00',
      student_phone: '9876543210'
    })
  }).then(r => r.json());

  assert(normalSubRes.success === true, `Normal Outpass created (${normalSubRes.data?.requestCode})`);
  const normId = normalSubRes.data.id;
  assert(normalSubRes.data.status === 'PENDING_PARENT', 'Normal Outpass begins at PENDING_PARENT');

  // Parent Approves Normal Outpass -> moves to PENDING_WARDEN (Advisor bypassed!)
  const normFaceVerify = await fetch(`${BASE_URL}/api/parent/outpass/${normId}/face-verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenParentA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ faceDescriptor: testFaceVectorA })
  }).then(r => r.json());
  assert(normFaceVerify.success && normFaceVerify.faceVerified, 'Parent Face verified for Normal Outpass');

  const parNormApproveRes = await fetch(`${BASE_URL}/api/parent/outpass/${normId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenParentA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      verification_token: normFaceVerify.verificationToken,
      parent_message: 'Normal weekend visit approved.'
    })
  }).then(r => r.json());

  assert(parNormApproveRes.success === true, 'Parent approved Normal Outpass');
  assert(parNormApproveRes.data.status === 'PENDING_WARDEN', 'Normal Outpass transitioned directly to PENDING_WARDEN (Advisor bypassed)');

  // Verify Advisor does NOT see Normal Outpass
  const advDutyCheck = await fetch(`${BASE_URL}/api/advisor/duty/pending`, {
    headers: { 'Authorization': `Bearer ${tokenAdvisorA}` }
  }).then(r => r.json());
  assert(!advDutyCheck.requests.some(r => r.id === normId), 'Normal Outpass is NOT in Advisor Duty queue');

  const advSpcCheck = await fetch(`${BASE_URL}/api/advisor/special/pending`, {
    headers: { 'Authorization': `Bearer ${tokenAdvisorA}` }
  }).then(r => r.json());
  assert(!advSpcCheck.requests.some(r => r.id === normId), 'Normal Outpass is NOT in Advisor Special queue');


  // -------------------------------------------------------------
  // TEST 4: REGRESSION ON EMERGENCY OUTPASS
  // (Student -> Warden; Parent, Advisor & Principal bypassed)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: EMERGENCY OUTPASS REGRESSION TEST ---');

  const emergSubRes = await fetch(`${BASE_URL}/api/outpass`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenStudentA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_type: 'emergency',
      emergency_type: 'Medical',
      reason: 'Sudden high fever and clinic consultation',
      destination: 'City Hospital',
      leaving_date: tomorrowStr,
      leaving_time: '11:00',
      expected_return_date: tomorrowStr,
      expected_return_time: '15:00',
      student_phone: '9876543210'
    })
  }).then(r => r.json());

  assert(emergSubRes.success === true, `Emergency Outpass created (${emergSubRes.data?.requestCode})`);
  const emergId = emergSubRes.data.id;
  assert(emergSubRes.data.status === 'PENDING_WARDEN', 'Emergency Outpass immediately reaches PENDING_WARDEN (Parent, Advisor, Principal bypassed)');

  // Verify Warden sees Emergency Outpass
  const wrdEmergQueue = await fetch(`${BASE_URL}/api/outpass/warden/pending?type=emergency`, {
    headers: { 'Authorization': `Bearer ${tokenWarden}` }
  }).then(r => r.json());
  assert(wrdEmergQueue.emergencyRequests.some(r => r.id === emergId), 'Emergency Outpass is in Warden Emergency queue');


  console.log('\n===============================================================');
  console.log('✅ ALL TESTS PASSED: 100% ROUTING MATRIX SUCCESSFUL!');
  console.log('===============================================================\n');
  process.exit(0);
}

runTestMatrix().catch(err => {
  console.error('\n❌ Matrix failed with error:', err);
  process.exit(1);
});
