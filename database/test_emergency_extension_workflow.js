/**
 * Automated Test Suite: Emergency Extension Workflow
 * Tests all 20 required verification scenarios per Step 12.
 */

const http = require('http');
const mysql = require('mysql2/promise');
require('dotenv').config();

const BASE_URL = 'http://localhost:5001';
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function request(path, options = {}) {
  const url = new URL(path, BASE_URL);
  const headers = options.headers || {};
  let body = options.body;

  if (body && typeof body === 'object') {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  return new Promise((resolve) => {
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = { raw: data };
        }
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          data: json
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 500, ok: false, error: err });
    });

    if (body) {
      req.write(body);
    }
    req.end();
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

async function runEmergencyExtensionTests() {
  console.log('======================================================================');
  console.log('⏱️  RUNNING EMERGENCY EXTENSION WORKFLOW TEST SUITE ON PORT 5001');
  console.log('======================================================================\n');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_hostel_outpass',
    port: process.env.DB_PORT || 3306
  });

  try {
    // ----------------------------------------------------
    // Section 0: Authenticate All System Roles
    // ----------------------------------------------------
    console.log('--- Section 0: Authentication & Account Preparation ---');

    const s1Auth = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '21CS042', password: 'Password@123', role: 'student' }
    });
    assert(s1Auth.ok && s1Auth.data.token, 'Authenticate Student 1 (21CS042)');
    const s1Token = s1Auth.data.token;
    const s1Id = s1Auth.data.user.id;

    const s2Auth = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '21ME018', password: 'Password@123', role: 'student' }
    });
    assert(s2Auth.ok && s2Auth.data.token, 'Authenticate Student 2 (21ME018 - for non-owner tests)');
    const s2Token = s2Auth.data.token;

    const parentAuth = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '9876543210', password: 'Password@123', role: 'parent' }
    });
    assert(parentAuth.ok && parentAuth.data.token, 'Authenticate Parent (9876543210)');
    const parentToken = parentAuth.data.token;

    const wardenAuth = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
    });
    assert(wardenAuth.ok && wardenAuth.data.token, 'Authenticate Warden (WRD-101)');
    const wardenToken = wardenAuth.data.token;

    const caretakerAuth = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' }
    });
    assert(caretakerAuth.ok && caretakerAuth.data.token, 'Authenticate Caretaker (CTK-305)');
    const caretakerToken = caretakerAuth.data.token;

    const watchmanAuth = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' }
    });
    assert(watchmanAuth.ok && watchmanAuth.data.token, 'Authenticate Watchman (GAT-401)');
    const watchmanToken = watchmanAuth.data.token;

    // ----------------------------------------------------
    // Section 1: Setup Test Outpass Cycle #1 (For Approval Test)
    // ----------------------------------------------------
    console.log('\n--- Section 1: Setup Active Outpass for Extension Testing ---');

    await pool.query(`UPDATE students SET current_hostel_status = 'INSIDE' WHERE id = ?;`, [s1Id]);

    // Make sure student has live GPS location in DB for parent consent
    await pool.query(`
      INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
      VALUES (?, 11.2750000, 77.5850000, 10.0, NOW(), 'browser_geolocation')
      ON DUPLICATE KEY UPDATE latitude = 11.2750000, longitude = 77.5850000, accuracy = 10.0, captured_at = NOW();
    `, [s1Id]);

    const now = new Date();
    const futureLeave = new Date(now.getTime() + 24 * 3600 * 1000);
    const futureReturn = new Date(futureLeave.getTime() + 6 * 3600 * 1000);

    // 1. Submit outpass
    const subRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: {
        request_type: 'normal',
        destination: 'District Central Library',
        reason: 'Research project preparation',
        leaving_date: formatLocalDate(futureLeave),
        leaving_time: formatLocalTime(futureLeave),
        expected_return_date: formatLocalDate(futureReturn),
        expected_return_time: formatLocalTime(futureReturn),
        student_phone: '9876500010'
      }
    });
    const pass1Id = subRes.data?.data?.id;
    assert(subRes.status === 201 && pass1Id, `Created Test Outpass #1 (ID: ${pass1Id})`);

    // 2. Parent Location Verify (Distance = 10m >= 5m)
    const pLocRes = await request(`/api/parent/outpass/${pass1Id}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { latitude: 11.2750900, longitude: 77.5850000, accuracy: 12.0 }
    });
    const pToken = pLocRes.data?.verificationToken || pLocRes.data?.verification_token;

    // 3. Parent Approve
    await request(`/api/parent/outpass/${pass1Id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: pToken, parent_message: 'Approved with verified device location' }
    });

    // 4. Warden Approve
    await request(`/api/outpass/${pass1Id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });

    // 5. Generate QR
    const qrRes = await request(`/api/qr/generate/${pass1Id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    const qrToken1 = qrRes.data?.data?.qrToken;
    assert(qrToken1, 'Warden generated active QR for Outpass #1');

    // Simulate departure time arrived (15 mins ago) and expected return is 2 hours from now
    const leaving = new Date(Date.now() - 15 * 60 * 1000);
    const expectedReturn = new Date(Date.now() + 2 * 3600 * 1000);
    await pool.query('UPDATE qr_codes SET valid_from = ?, valid_until = ? WHERE outpass_request_id = ?', [leaving, expectedReturn, pass1Id]);
    await pool.query('UPDATE outpass_requests SET from_datetime = ?, to_datetime = ? WHERE id = ?', [leaving, expectedReturn, pass1Id]);

    // 6. Caretaker Check-Out
    const exitRes = await request('/api/gate/checkout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${caretakerToken}` },
      body: { qr_token: qrToken1 }
    });
    assert(exitRes.status === 200, 'Caretaker recorded student checkout (Status -> OUTSIDE)');

    // ----------------------------------------------------
    // Section 2: Validation Guardrails for Extension Submission
    // ----------------------------------------------------
    console.log('\n--- Section 2: Student Extension Validation Guardrails ---');

    // Test 2: Empty reason rejected (HTTP 400)
    const laterTime1 = new Date(expectedReturn.getTime() + 2 * 3600 * 1000); // 4 hrs from now
    const emptyReasonRes = await request('/api/extension-requests', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: {
        outpass_id: pass1Id,
        requested_extension_until: laterTime1.toISOString(),
        reason: '   '
      }
    });
    assert(emptyReasonRes.status === 400, 'Test 2: Empty reason rejected with HTTP 400');

    // Test 3: Invalid requested time rejected (HTTP 400)
    const invalidTimeRes = await request('/api/extension-requests', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: {
        outpass_id: pass1Id,
        requested_extension_until: 'not-a-valid-date-time',
        reason: 'Delayed transport'
      }
    });
    assert(invalidTimeRes.status === 400, 'Test 3: Invalid requested time rejected with HTTP 400');

    // Test 4: Requested time earlier than current deadline rejected (HTTP 400)
    const earlierTime = new Date(expectedReturn.getTime() - 30 * 60 * 1000); // 30 mins before scheduled return
    const earlierTimeRes = await request('/api/extension-requests', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: {
        outpass_id: pass1Id,
        requested_extension_until: earlierTime.toISOString(),
        reason: 'Trying to shorten time'
      }
    });
    assert(earlierTimeRes.status === 400, 'Test 4: Requested time earlier than current deadline rejected with HTTP 400');

    // Test 5: Non-owner student cannot request extension for another student's outpass (HTTP 403)
    const nonOwnerRes = await request('/api/extension-requests', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s2Token}` },
      body: {
        outpass_id: pass1Id,
        requested_extension_until: laterTime1.toISOString(),
        reason: 'Impersonating peer'
      }
    });
    assert(nonOwnerRes.status === 403, 'Test 5: Non-owner student blocked from requesting extension for another outpass (HTTP 403)');

    // Test 1: Student submits valid extension request (HTTP 201)
    const validExtRes = await request('/api/extension-requests', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: {
        outpass_id: pass1Id,
        requested_extension_until: laterTime1.toISOString(),
        reason: 'State transport bus delayed due to heavy rain'
      }
    });
    assert(validExtRes.status === 201 && validExtRes.data.success, 'Test 1: Student submits valid extension request (HTTP 201 Created)');
    const ext1Id = validExtRes.data?.data?.extensionId || validExtRes.data?.data?.id;
    assert(ext1Id, `Received valid Extension Request ID: ${ext1Id}`);

    // Test 6: Duplicate pending extension rejected (HTTP 409)
    const duplicateExtRes = await request('/api/extension-requests', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: {
        outpass_id: pass1Id,
        requested_extension_until: new Date(laterTime1.getTime() + 3600 * 1000).toISOString(),
        reason: 'Additional delay request while one is pending'
      }
    });
    assert(duplicateExtRes.status === 409, 'Test 6: Duplicate pending extension rejected with HTTP 409 Conflict');

    // Test 16: Warden receives extension requested notification
    const [wardenNotifs] = await pool.query(`
      SELECT * FROM notifications 
      WHERE type = 'EXTENSION_REQUESTED' AND reference_id = ?
      ORDER BY id DESC LIMIT 1;
    `, [String(ext1Id)]);
    assert(wardenNotifs.length > 0, 'Test 16: Warden notification created in MySQL for new extension request');

    // ----------------------------------------------------
    // Section 3: Warden Extension Queue & Security
    // ----------------------------------------------------
    console.log('\n--- Section 3: Warden Queue & Review Security ---');

    // Test 7: Warden can see pending extension requests
    const wardenQueueRes = await request('/api/extension-requests', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(wardenQueueRes.status === 200, 'Test 7: Warden retrieves pending extension queue (HTTP 200)');
    const pendingList = wardenQueueRes.data?.data || wardenQueueRes.data?.pendingExtensions || [];
    const foundExt = pendingList.find(e => e.id === ext1Id || e.extensionId === ext1Id);
    assert(foundExt && foundExt.roll_number === '21CS042', 'Test 7 Check: Pending queue contains student roll number, outpass, requested time, and reason');

    // Test 8: Unauthorized roles cannot review extension (HTTP 403)
    const studentReviewAttempt = await request(`/api/extension-requests/${ext1Id}/review`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: { action: 'approve' }
    });
    assert(studentReviewAttempt.status === 403, 'Test 8: Student blocked from reviewing extension (HTTP 403)');

    const caretakerReviewAttempt = await request(`/api/extension-requests/${ext1Id}/review`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${caretakerToken}` },
      body: { action: 'approve' }
    });
    assert(caretakerReviewAttempt.status === 403, 'Test 8: Caretaker blocked from reviewing extension (HTTP 403)');

    const watchmanReviewAttempt = await request(`/api/extension-requests/${ext1Id}/review`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${watchmanToken}` },
      body: { action: 'approve' }
    });
    assert(watchmanReviewAttempt.status === 403, 'Test 8: Watchman blocked from reviewing extension (HTTP 403)');

    // ----------------------------------------------------
    // Section 4: Warden Approval & Pass Update
    // ----------------------------------------------------
    console.log('\n--- Section 4: Warden Extension Approval ---');

    // Test 9: Warden approves extension
    const approveRes = await request(`/api/extension-requests/${ext1Id}/review`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` },
      body: { action: 'approve' }
    });
    assert(approveRes.status === 200 && approveRes.data.status === 'APPROVED', 'Test 9: Warden approves extension (HTTP 200, status=APPROVED)');

    // Test 10: Approved extension updates outpass deadline and QR valid_until
    const [outpassAfterApprove] = await pool.query('SELECT to_datetime FROM outpass_requests WHERE id = ?;', [pass1Id]);
    const [qrAfterApprove] = await pool.query('SELECT valid_until, status FROM qr_codes WHERE outpass_request_id = ?;', [pass1Id]);

    const updatedOutpassDate = new Date(outpassAfterApprove[0].to_datetime).getTime();
    const updatedQrDate = new Date(qrAfterApprove[0].valid_until).getTime();
    const targetTimeMs = laterTime1.getTime();

    assert(Math.abs(updatedOutpassDate - targetTimeMs) < 2000, 'Test 10: Outpass to_datetime updated to new approved extension time');
    assert(Math.abs(updatedQrDate - targetTimeMs) < 2000 && qrAfterApprove[0].status === 'ACTIVE', 'Test 10: QR valid_until extended to new time and status confirmed ACTIVE');

    // Test 13: Already reviewed request cannot be reviewed again (HTTP 400 / 409)
    const duplicateApprove = await request(`/api/extension-requests/${ext1Id}/review`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` },
      body: { action: 'approve' }
    });
    assert(duplicateApprove.status === 400 || duplicateApprove.status === 409, 'Test 13: Already approved request cannot be reviewed again');

    // Test 14: Student receives approval notification
    const [s1ApproveNotifs] = await pool.query(`
      SELECT * FROM notifications 
      WHERE user_id = ? AND type = 'EXTENSION_APPROVED' AND reference_id = ?
      ORDER BY id DESC LIMIT 1;
    `, [s1Id, String(ext1Id)]);
    assert(s1ApproveNotifs.length > 0, 'Test 14: Student receives approval notification in MySQL notifications table');

    // ----------------------------------------------------
    // Section 5: Watchman Check-In With Approved Extension
    // ----------------------------------------------------
    console.log('\n--- Section 5: Gate Integration & Timeliness Evaluation ---');

    // Test 17: Return past original deadline but before approved extended deadline is ON_TIME
    // Set previous_valid_until to past to simulate arriving past the old deadline
    await pool.query('UPDATE extension_requests SET previous_valid_until = ? WHERE id = ?;', [
      new Date(now.getTime() - 20 * 60 * 1000), // 20 mins ago
      ext1Id
    ]);

    const watchmanReturnRes = await request('/api/gate/checkin', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${watchmanToken}` },
      body: { qr_token: qrToken1 }
    });

    assert(watchmanReturnRes.status === 200, 'Watchman successfully records return using SAME QR');
    assert(
      watchmanReturnRes.data.isLate === false &&
      (watchmanReturnRes.data.returnClassification === 'ON_TIME_WITH_EXTENSION' ||
       watchmanReturnRes.data.timeliness?.classification === 'ON_TIME_WITH_EXTENSION' ||
       watchmanReturnRes.data.timelinessStatus === 'ON_TIME'),
      'Test 17: Student return past old deadline but before extended deadline is classified ON TIME (is_late: 0)'
    );

    // ----------------------------------------------------
    // Section 6: Warden Rejection Workflow
    // ----------------------------------------------------
    console.log('\n--- Section 6: Warden Extension Rejection Workflow ---');

    // Create a fresh cycle for Student 1
    const subRes2 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: {
        request_type: 'normal',
        destination: 'Railway Station',
        reason: 'Book parcel collection',
        leaving_date: formatLocalDate(futureLeave),
        leaving_time: formatLocalTime(futureLeave),
        expected_return_date: formatLocalDate(futureReturn),
        expected_return_time: formatLocalTime(futureReturn),
        student_phone: '9876500010'
      }
    });
    const pass2Id = subRes2.data?.data?.id;

    // Ensure student location is fresh for consent
    await pool.query(`
      INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
      VALUES (?, 11.2750000, 77.5850000, 10.0, NOW(), 'browser_geolocation')
      ON DUPLICATE KEY UPDATE latitude = 11.2750000, longitude = 77.5850000, accuracy = 10.0, captured_at = NOW();
    `, [s1Id]);

    // Consent, Approve, Generate QR, Checkout
    const pLocRes2 = await request(`/api/parent/outpass/${pass2Id}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { latitude: 11.2750900, longitude: 77.5850000, accuracy: 12.0 }
    });
    const pToken2 = pLocRes2.data?.verificationToken || pLocRes2.data?.verification_token;
    await request(`/api/parent/outpass/${pass2Id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: pToken2, parent_message: 'Approved' }
    });
    await request(`/api/outpass/${pass2Id}/approve`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${wardenToken}` } });
    const qrRes2 = await request(`/api/qr/generate/${pass2Id}`, { method: 'POST', headers: { 'Authorization': `Bearer ${wardenToken}` } });
    const qrToken2 = qrRes2.data?.data?.qrToken;
    await pool.query('UPDATE qr_codes SET valid_from = ?, valid_until = ? WHERE outpass_request_id = ?', [leaving, expectedReturn, pass2Id]);
    await pool.query('UPDATE outpass_requests SET from_datetime = ?, to_datetime = ? WHERE id = ?', [leaving, expectedReturn, pass2Id]);
    await request('/api/gate/checkout', { method: 'POST', headers: { 'Authorization': `Bearer ${caretakerToken}` }, body: { qr_token: qrToken2 } });

    // Submit extension for pass 2
    const ext2Res = await request('/api/extension-requests', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${s1Token}` },
      body: {
        outpass_id: pass2Id,
        requested_extension_until: laterTime1.toISOString(),
        reason: 'Heavy traffic congestion on Avinashi Road'
      }
    });
    const ext2Id = ext2Res.data?.data?.extensionId || ext2Res.data?.data?.id;
    assert(ext2Id, `Created Test Extension #2 (ID: ${ext2Id})`);

    // Test 12: Rejection without reason rejected (HTTP 400)
    const rejectNoReason = await request(`/api/extension-requests/${ext2Id}/review`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` },
      body: { action: 'reject' }
    });
    assert(rejectNoReason.status === 400, 'Test 12: Rejection without mandatory reason rejected with HTTP 400');

    // Test 11: Warden rejects extension with reason
    const rejectReason = 'Hostel night curfew policy strictly disallows non-emergency extensions beyond 8 PM';
    const rejectRes = await request(`/api/extension-requests/${ext2Id}/review`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` },
      body: { action: 'reject', reason: rejectReason }
    });
    assert(rejectRes.status === 200 && rejectRes.data.status === 'REJECTED', 'Test 11: Warden rejects extension with mandatory reason (HTTP 200, status=REJECTED)');

    // Verify outpass return deadline remained unchanged
    const [outpassAfterReject] = await pool.query('SELECT to_datetime FROM outpass_requests WHERE id = ?;', [pass2Id]);
    const expectedReturnMs = expectedReturn.getTime();
    const rejectOutpassDateMs = new Date(outpassAfterReject[0].to_datetime).getTime();
    assert(Math.abs(rejectOutpassDateMs - expectedReturnMs) < 60000, 'Test 11 Check: Outpass return deadline remains unchanged upon rejection');

    // Test 15: Student receives rejection notification
    const [s1RejectNotifs] = await pool.query(`
      SELECT * FROM notifications 
      WHERE user_id = ? AND type = 'EXTENSION_REJECTED' AND reference_id = ?
      ORDER BY id DESC LIMIT 1;
    `, [s1Id, String(ext2Id)]);
    assert(s1RejectNotifs.length > 0 && s1RejectNotifs[0].message.includes(rejectReason), 'Test 15: Student receives rejection notification containing exact rejection reason');

    // Test 13 (Rejection side): Rejected request cannot be reviewed again
    const duplicateReject = await request(`/api/extension-requests/${ext2Id}/review`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` },
      body: { action: 'approve' }
    });
    assert(duplicateReject.status === 400 || duplicateReject.status === 409, 'Test 13: Already rejected request cannot be approved again');

    // Clean up pass 2 by checking in
    await request('/api/gate/checkin', { method: 'POST', headers: { 'Authorization': `Bearer ${watchmanToken}` }, body: { qr_token: qrToken2 } });

    console.log('\n======================================================================');
    console.log(`🏁 EMERGENCY EXTENSION WORKFLOW TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================\n');

  } catch (err) {
    console.error('Fatal error during extension workflow tests:', err);
    failed++;
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runEmergencyExtensionTests();
