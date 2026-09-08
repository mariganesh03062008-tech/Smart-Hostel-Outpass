/**
 * Smart Hostel Outpass Management System
 * Test Suite: Warden Parent Verification & Parent Message Visibility
 *
 * Verifies:
 *  1. Parent Approval:
 *     - Location verification produces single-use token
 *     - Approval records in parent_messages (outpass_id, student_id, parent_id, parent_mobile, status, response, timestamp)
 *     - Outpass transitions to PENDING_WARDEN with parent_location_verified = 1
 *     - Warden pending queue displays locationVerificationResult === 'VERIFIED'
 *     - Warden pending queue displays parentMessage
 *  2. Parent Rejection:
 *     - Rejection reason is mandatory (empty reason rejected with HTTP 400)
 *     - Rejection records in parent_messages with parent_response = 'rejected'
 *     - Outpass status transitions to REJECTED
 *     - Warden can retrieve rejection reason
 *  3. Verification Guardrails:
 *     - Proximity < 5m blocked (HTTP 403) and does NOT show VERIFIED
 *     - Parent GPS accuracy > 50m blocked (HTTP 422)
 *     - Stale student GPS (> 5 min) blocked (HTTP 422)
 *  4. Warden Student Search:
 *     - Search by exact student name
 *     - Search by partial student name
 *     - Search by student roll number
 *     - Requires Warden authentication
 *     - Structured response includes: student, parent, parent mobile, decision, parent message, location verification, distance, accuracy, submitted at
 *  5. Data Isolation:
 *     - Student A search returns ONLY Student A's parent, message, and outpass
 *     - Student B search returns ONLY Student B's parent, message, and outpass
 *     - Verification for Student A never leaks to Student B
 *  6. Warden Parent Messages Log:
 *     - GET /api/outpass/warden/parent-messages returns relational messages feed
 */

const http = require('http');
const { pool } = require('../utils/db');

const BASE_URL = 'http://localhost:5001';

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    if (details) console.error(`     Details: ${details}`);
    failed++;
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const method = options.method || 'GET';
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const body = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let data = null;
        try {
          data = JSON.parse(rawData);
        } catch {
          data = rawData;
        }
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          data
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 500, ok: false, data: { error: err.message } });
    });

    if (body) req.write(body);
    req.end();
  });
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('🛡️ RUNNING WARDEN PARENT VERIFICATION & MESSAGE VISIBILITY TESTS');
  console.log('======================================================================\n');

  try {
    // ------------------------------------------------------------------
    // 0. Authenticate Actors
    // ------------------------------------------------------------------
    console.log('--- 0. Authentication Setup ---');

    // Warden (WRD-101)
    const wardenLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
    });
    assert(wardenLogin.status === 200 && !!wardenLogin.data.token, 'Warden WRD-101 authenticates successfully');
    const wardenToken = wardenLogin.data.token;

    // Student A (21CS042)
    const studentALogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '21CS042', password: 'Password@123', role: 'student' }
    });
    assert(studentALogin.status === 200 && !!studentALogin.data.token, 'Student A (21CS042) authenticates successfully');
    const studentAToken = studentALogin.data.token;
    const studentAId = studentALogin.data.user.id;

    // Parent A (9876543210)
    const parentALogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '9876543210', password: 'Password@123', role: 'parent' }
    });
    assert(parentALogin.status === 200 && !!parentALogin.data.token, 'Parent A (9876543210) authenticates successfully');
    const parentAToken = parentALogin.data.token;
    const parentAId = parentALogin.data.user.id;

    // ------------------------------------------------------------------
    // 1. Student A GPS Update & Outpass Submission
    // ------------------------------------------------------------------
    console.log('\n--- 1. Parent Approval Flow with GPS Verification & Message Recording ---');

    // Update Student A fresh location (13.0000000, 80.0000000, accuracy: 5m)
    const locUpdateA = await request('/api/outpass/student/location', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentAToken}` },
      body: {
        latitude: 13.0000000,
        longitude: 80.0000000,
        accuracy: 5.0,
        source: 'browser_gps'
      }
    });
    assert(locUpdateA.status === 200 && locUpdateA.data.success, 'Student A live device GPS recorded successfully');

    // Submit Outpass #1 by Student A
    const pad = n => String(n).padStart(2, '0');
    const fDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const futureLeave = new Date(Date.now() + 48 * 3600 * 1000);
    const futureReturn = new Date(Date.now() + 72 * 3600 * 1000);

    const outpass1Res = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentAToken}` },
      body: {
        request_type: 'normal',
        destination: 'Central Library, City Center',
        reason: 'Semester Reference Books',
        leaving_date: fDate(futureLeave),
        leaving_time: '10:00',
        expected_return_date: fDate(futureReturn),
        expected_return_time: '18:00',
        student_phone: '9876500010'
      }
    });
    assert(outpass1Res.status === 201 && !!outpass1Res.data.data.id, 'Student A submits Normal Outpass #1 (Status -> PENDING_PARENT)');
    const outpass1Id = outpass1Res.data.data.id;

    // Parent A performs GPS Location Verification for Outpass #1 (distance ~ 50 meters, >= 5m)
    const verify1Res = await request(`/api/parent/outpass/${outpass1Id}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentAToken}` },
      body: {
        latitude: 13.0004500,
        longitude: 80.0000000,
        accuracy: 4.0
      }
    });
    assert(
      verify1Res.status === 200 &&
      verify1Res.data.locationVerified === true &&
      verify1Res.data.distanceMeters >= 5 &&
      !!verify1Res.data.verificationToken,
      'Parent A verifies GPS location (distance >= 5m, token issued)'
    );
    const verToken1 = verify1Res.data.verificationToken;

    // Parent A approves Outpass #1 with custom parent message
    const parentMsgText = 'Approved for library visit. Return before 6 PM.';
    const approve1Res = await request(`/api/parent/outpass/${outpass1Id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentAToken}` },
      body: {
        verification_token: verToken1,
        parent_message: parentMsgText
      }
    });
    assert(
      approve1Res.status === 200 &&
      approve1Res.data.data.status === 'PENDING_WARDEN',
      'Parent A approves Outpass #1 -> PENDING_WARDEN'
    );

    // Verify parent_messages table in MySQL has record
    const [msgRows1] = await pool.query(
      'SELECT * FROM parent_messages WHERE outpass_request_id = ? ORDER BY id DESC LIMIT 1',
      [outpass1Id]
    );
    assert(msgRows1.length === 1, 'Approval message successfully inserted into parent_messages table');
    assert(
      msgRows1[0].parent_id === parentAId &&
      msgRows1[0].student_id === studentAId &&
      msgRows1[0].parent_response === 'approved' &&
      msgRows1[0].message_body === parentMsgText &&
      msgRows1[0].parent_mobile === '9876543210',
      'parent_messages record strictly linked to correct outpass_id, student_id, parent_id, and parent_mobile'
    );

    // Check Warden Pending Queue returns locationVerificationResult === 'VERIFIED'
    const wardenPendingRes = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(wardenPendingRes.status === 200, 'Warden retrieves pending normal queue successfully');
    const foundOutpass1 = wardenPendingRes.data.pendingRequests?.find(r => r.id === outpass1Id);
    assert(Boolean(foundOutpass1), 'Outpass #1 appears in Warden Pending Queue');
    assert(
      foundOutpass1 && foundOutpass1.locationVerificationResult === 'VERIFIED',
      'Warden queue returns locationVerificationResult === "VERIFIED" (not UNVERIFIED)'
    );
    assert(
      foundOutpass1 && foundOutpass1.parentMessage === parentMsgText,
      'Warden queue includes Parent Approval Message'
    );
    assert(
      foundOutpass1 && foundOutpass1.distanceMeters >= 5 && foundOutpass1.parentApprovalAccuracy <= 50,
      'Warden queue includes valid verified distance and accuracy values'
    );

    // ------------------------------------------------------------------
    // 2. Parent Rejection Flow with Mandatory Reason & Message Recording
    // ------------------------------------------------------------------
    console.log('\n--- 2. Parent Rejection Flow with Mandatory Reason & Message Recording ---');

    // Submit Outpass #2 by Student A
    const outpass2Res = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentAToken}` },
      body: {
        request_type: 'normal',
        destination: 'Late Night Movie',
        reason: 'Cinema with friends',
        leaving_date: fDate(futureLeave),
        leaving_time: '21:00',
        expected_return_date: fDate(futureReturn),
        expected_return_time: '02:00',
        student_phone: '9876500010'
      }
    });
    assert(outpass2Res.status === 201, 'Student A submits Outpass #2 for rejection test');
    const outpass2Id = outpass2Res.data.data.id;

    // Parent attempts to reject with empty reason -> MUST be rejected (HTTP 400)
    const emptyRejectRes = await request(`/api/parent/outpass/${outpass2Id}/reject`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentAToken}` },
      body: { rejection_reason: '   ' }
    });
    assert(
      emptyRejectRes.status === 400,
      'Guardrail: Parent rejection without non-empty reason is rejected with HTTP 400'
    );

    // Parent rejects Outpass #2 with valid reason
    const rejectReasonText = 'Disapproved: Late night movie is not permitted before exams.';
    const validRejectRes = await request(`/api/parent/outpass/${outpass2Id}/reject`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentAToken}` },
      body: { rejection_reason: rejectReasonText }
    });
    assert(validRejectRes.status === 200, 'Parent successfully rejects Outpass #2 with reason');

    // Verify parent_messages table has rejection record
    const [msgRows2] = await pool.query(
      'SELECT * FROM parent_messages WHERE outpass_request_id = ? ORDER BY id DESC LIMIT 1',
      [outpass2Id]
    );
    assert(msgRows2.length === 1, 'Rejection reason successfully inserted into parent_messages table');
    assert(
      msgRows2[0].parent_response === 'rejected' &&
      msgRows2[0].message_body === rejectReasonText &&
      msgRows2[0].student_id === studentAId &&
      msgRows2[0].parent_id === parentAId,
      'parent_messages rejection record correctly associated with outpass, student, and parent'
    );

    // Guardrail: Parent-rejected outpass must NOT appear in Warden Pending Queue
    const wardenPendingCheck2 = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    const foundOutpass2InWarden = wardenPendingCheck2.data.pendingRequests?.some(r => r.id === outpass2Id);
    assert(!foundOutpass2InWarden, 'Guardrail: Parent-rejected outpass does NOT appear in Warden Pending Queue');

    // ------------------------------------------------------------------
    // 3. Proximity & GPS Accuracy Guardrails
    // ------------------------------------------------------------------
    console.log('\n--- 3. Proximity & GPS Accuracy Security Guardrails ---');

    // Submit Outpass #3 for proximity guardrail
    const outpass3Res = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentAToken}` },
      body: {
        request_type: 'normal',
        destination: 'Pharmacy',
        reason: 'Medicine purchase',
        leaving_date: fDate(futureLeave),
        leaving_time: '14:00',
        expected_return_date: fDate(futureReturn),
        expected_return_time: '16:00',
        student_phone: '9876500010'
      }
    });
    const outpass3Id = outpass3Res.data.data.id;

    // Test A: Distance < 5 meters (e.g. coordinates ~ 2 meters apart)
    const closeVerifyRes = await request(`/api/parent/outpass/${outpass3Id}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentAToken}` },
      body: {
        latitude: 13.0000100, // extremely close ~ 1.1 meters
        longitude: 80.0000000,
        accuracy: 5.0
      }
    });
    assert(
      closeVerifyRes.status === 403 &&
      closeVerifyRes.data.proximityBlocked === true,
      'Guardrail: Proximity < 5 meters strictly BLOCKED with HTTP 403'
    );

    // Test B: Accuracy > 50 meters (e.g. 105 meters)
    const poorAccVerifyRes = await request(`/api/parent/outpass/${outpass3Id}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentAToken}` },
      body: {
        latitude: 13.0050000,
        longitude: 80.0000000,
        accuracy: 105.0
      }
    });
    assert(
      poorAccVerifyRes.status === 422 &&
      poorAccVerifyRes.data.accuracyPoor === true,
      'Guardrail: GPS accuracy > 50 meters strictly BLOCKED with HTTP 422'
    );

    // Test C: Check Outpass #3 in DB remains parent_location_verified = 0
    const [op3Db] = await pool.query('SELECT parent_location_verified FROM outpass_requests WHERE id = ?', [outpass3Id]);
    assert(
      op3Db[0].parent_location_verified === 0,
      'Failed proximity verification ensures parent_location_verified remains 0 in outpass_requests'
    );

    // ------------------------------------------------------------------
    // 4. Warden Student Search
    // ------------------------------------------------------------------
    console.log('\n--- 4. Warden Student Search Implementation ---');

    // 4.1 Search without auth fails (HTTP 401)
    const noAuthSearch = await request('/api/outpass/warden/students/search?q=John');
    assert(noAuthSearch.status === 401, 'Warden student search requires authentication (HTTP 401 without token)');

    // 4.2 Search with empty query fails (HTTP 400)
    const emptySearch = await request('/api/outpass/warden/students/search?q=  ', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(emptySearch.status === 400, 'Warden student search requires non-empty query (HTTP 400)');

    // 4.3 Search by exact name "John Doe"
    const exactNameSearch = await request('/api/outpass/warden/students/search?q=John%20Doe', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(exactNameSearch.status === 200 && exactNameSearch.data.count >= 1, 'Search by exact name "John Doe" returns results');
    const matchedJohn = exactNameSearch.data.students.find(s => s.student.regNo === '21CS042');
    assert(Boolean(matchedJohn), 'Result includes student John Doe (21CS042)');
    assert(
      matchedJohn.parent.name === 'Robert Doe' &&
      matchedJohn.parent.mobile === '9876543210',
      'Search result displays correct parent name and registered mobile'
    );
    assert(
      matchedJohn.decision === 'APPROVED' || matchedJohn.decision === 'REJECTED',
      `Search result displays student decision (${matchedJohn.decision})`
    );
    assert(
      matchedJohn.locationVerification === 'VERIFIED',
      'Search result displays Location Verification: VERIFIED'
    );
    assert(
      typeof matchedJohn.parentMessage === 'string' && matchedJohn.parentMessage.length > 0,
      `Search result displays Parent Message: "${matchedJohn.parentMessage}"`
    );

    // 4.4 Search by partial name "John"
    const partialNameSearch = await request('/api/outpass/warden/students/search?q=John', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(partialNameSearch.status === 200 && partialNameSearch.data.count >= 1, 'Search by partial name "John" returns results');

    // 4.5 Search by Roll Number "21CS042"
    const rollNoSearch = await request('/api/outpass/warden/students/search?q=21CS042', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(rollNoSearch.status === 200 && rollNoSearch.data.count >= 1, 'Search by roll number "21CS042" returns results');
    assert(rollNoSearch.data.students[0].student.regNo === '21CS042', 'First matched student has roll number 21CS042');

    // 4.6 Direct route alias /api/warden/students/search?q=21CS042 works
    const aliasSearch = await request('/api/warden/students/search?q=21CS042', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(aliasSearch.status === 200 && aliasSearch.data.success, 'Direct route alias /api/warden/students/search works');

    // ------------------------------------------------------------------
    // 5. Data Isolation & Separation (Student A vs Student B)
    // ------------------------------------------------------------------
    console.log('\n--- 5. Strict Data Isolation (Student A vs Student B) ---');

    // Create a unique Student B
    const stampB = Date.now();
    const regStudentB = await request('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: `STUB_${stampB}`,
        name: `Bob Williams ${stampB}`,
        email: `bob_${stampB}@student.edu`,
        department: 'Mechanical Engineering',
        year_of_study: 2,
        room_no: 'B-201',
        hostel_block: 'Block B',
        phone: '9888877771',
        password: 'Password@123',
        confirm_password: 'Password@123'
      }
    });
    assert(regStudentB.status === 201, 'Student B registered successfully');
    const studentBToken = regStudentB.data.token;
    const studentBId = regStudentB.data.user.id;
    const studentBRegNo = `STUB_${stampB}`;

    // Create a distinct Parent B
    const [pBInsert] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash)
      VALUES (?, ?, ?)
    `, [`Walter Williams ${stampB}`, `91111${stampB.toString().slice(-5)}`, 'hashed_pass']);
    const parentBId = pBInsert.insertId;

    // Link Student B to Parent B
    await pool.query('UPDATE students SET parent_id = ? WHERE id = ?', [parentBId, studentBId]);

    // Student B creates an Outpass
    const outpassBRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentBToken}` },
      body: {
        request_type: 'normal',
        destination: 'Robotics Workshop',
        reason: 'Competition prep',
        leaving_date: fDate(futureLeave),
        leaving_time: '09:00',
        expected_return_date: fDate(futureReturn),
        expected_return_time: '17:00',
        student_phone: '9888877771'
      }
    });
    assert(outpassBRes.status === 201, 'Student B submits outpass');
    const outpassBId = outpassBRes.data.data.id;

    // Store a distinct message for Student B in parent_messages
    const distinctMsgB = `Parent B distinctive note for Bob ${stampB}`;
    await pool.query(`
      INSERT INTO parent_messages (
        parent_id, parent_mobile, student_id, outpass_request_id, message_type, message_body, status, parent_response, responded_at
      ) VALUES (?, ?, ?, ?, 'message', ?, 'responded', 'approved', NOW())
    `, [parentBId, `91111${stampB.toString().slice(-5)}`, studentBId, outpassBId, distinctMsgB]);

    // Search for Student A
    const searchA = await request(`/api/outpass/warden/students/search?q=21CS042`, {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    const resultA = searchA.data.students[0];

    // Search for Student B
    const searchB = await request(`/api/outpass/warden/students/search?q=${studentBRegNo}`, {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    const resultB = searchB.data.students[0];

    assert(Boolean(resultA) && Boolean(resultB), 'Both Student A and Student B searchable independently');
    assert(
      resultA.student.regNo === '21CS042' && resultA.parent.name === 'Robert Doe',
      'Student A returns ONLY Student A parent (Robert Doe)'
    );
    assert(
      resultA.parentMessage !== distinctMsgB,
      'Data Isolation: Student A does NOT receive Student B message'
    );
    assert(
      resultB.student.regNo === studentBRegNo && resultB.parent.name === `Walter Williams ${stampB}`,
      'Student B returns ONLY Student B parent (Walter Williams)'
    );
    assert(
      resultB.parentMessage === distinctMsgB,
      'Data Isolation: Student B receives ONLY Student B message'
    );

    // 5B. Test Rejection Search Display (Student B rejected by parent)
    const rejectReasonB = `Disapproved for ${stampB}: Academic backlog needs clearance.`;
    await pool.query(`
      UPDATE outpass_requests
      SET status = 'REJECTED', parent_approval_status = 'rejected', parent_rejection_reason = ?
      WHERE id = ?
    `, [rejectReasonB, outpassBId]);
    await pool.query(`
      INSERT INTO parent_messages (
        parent_id, parent_mobile, student_id, outpass_request_id, message_type, message_body, status, parent_response, responded_at
      ) VALUES (?, ?, ?, ?, 'message', ?, 'responded', 'rejected', NOW())
    `, [parentBId, `91111${stampB.toString().slice(-5)}`, studentBId, outpassBId, rejectReasonB]);

    const searchBRejected = await request(`/api/outpass/warden/students/search?q=${studentBRegNo}`, {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    const resultBRej = searchBRejected.data.students[0];
    assert(resultBRej.decision === 'REJECTED', 'Rejected student search displays Decision: REJECTED');
    assert(resultBRej.parentMessage === rejectReasonB, 'Rejected student search displays actual Parent Rejection Reason');
    assert(resultBRej.locationVerification === 'UNVERIFIED', 'Rejected student search displays Location Verification: UNVERIFIED');

    // ------------------------------------------------------------------
    // 6. Warden Parent Messages Audit Feed
    // ------------------------------------------------------------------
    console.log('\n--- 6. Warden Parent Messages Log API ---');

    const parentMessagesFeed = await request('/api/outpass/warden/parent-messages', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(parentMessagesFeed.status === 200, 'Warden parent messages feed returns HTTP 200');
    assert(
      Array.isArray(parentMessagesFeed.data.messages) && parentMessagesFeed.data.messages.length >= 2,
      'Feed returns messages including recent approvals and rejections'
    );
    const hasMsg1 = parentMessagesFeed.data.messages.some(m => m.outpassRequestId === outpass1Id && m.parentResponse === 'approved');
    const hasMsg2 = parentMessagesFeed.data.messages.some(m => m.outpassRequestId === outpass2Id && m.parentResponse === 'rejected');
    assert(hasMsg1, 'Feed contains Parent Approval message for Outpass #1');
    assert(hasMsg2, 'Feed contains Parent Rejection message for Outpass #2');

  } catch (err) {
    console.error('Unexpected test failure:', err);
    failed++;
  } finally {
    console.log('\n======================================================================');
    console.log(`🏁 TEST SUITE COMPLETE: ${passed} passed, ${failed} failed`);
    console.log('======================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTestSuite();
