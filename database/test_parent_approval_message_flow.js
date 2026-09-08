/**
 * Smart Hostel Outpass System
 * Automated Test Suite: Parent Approval Message Flow & Dashboard Cleanup
 *
 * Verifies:
 * 1. Parent Message Validation: Empty / whitespace message rejected (HTTP 400).
 * 2. English Message Approval: Saved in outpass_requests & parent_messages without corruption.
 * 3. Tamil Message Approval: Stored in native UTF-8 Unicode with zero translation.
 * 4. GPS Verification Enforcement: Distance >= 5m required, <5m blocked (HTTP 403).
 * 5. Warden Review Queue: Outpass request includes parent approval decision, parent message,
 *    verified mobile, location verification result, distance, and accuracy.
 * 6. Warden Approval & QR Generation: Successful warden approval triggers active QR generation.
 * 7. HTML Dashboard Cleanup: Standalone message tabs & nav buttons removed from Parent & Warden HTML,
 *    while parent_messages database records remain intact.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
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
  console.log('🧪 RUNNING PARENT APPROVAL MESSAGE FLOW & DASHBOARD CLEANUP TESTS');
  console.log('======================================================================\n');

  try {
    // 0. Login accounts
    console.log('--- Step 0: Authentication ---');
    const parentLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '9876543210', password: 'Password@123', role: 'parent' }
    });
    assert(parentLoginRes.ok && parentLoginRes.data?.token, 'Parent login successful', JSON.stringify(parentLoginRes.data));
    const parentToken = parentLoginRes.data?.token;
    const parentId = parentLoginRes.data?.user?.id;

    const studentLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '21CS042', password: 'Password@123', role: 'student' }
    });
    assert(studentLoginRes.ok && studentLoginRes.data?.token, 'Student login successful', JSON.stringify(studentLoginRes.data));
    const studentToken = studentLoginRes.data?.token;
    const studentId = studentLoginRes.data?.user?.id;
    const student = { id: studentId };

    const wardenLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
    });
    assert(wardenLoginRes.ok && wardenLoginRes.data?.token, 'Warden login successful', JSON.stringify(wardenLoginRes.data));
    const wardenToken = wardenLoginRes.data?.token;

    // Update Student live location (13.0000000, 80.0000000)
    const studLocRes = await request('/api/outpass/student/location', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        latitude: 13.0000000,
        longitude: 80.0000000,
        accuracy: 5.0,
        source: 'browser_gps'
      }
    });
    assert(studLocRes.ok, 'Student location updated successfully');

    // =========================================================================
    // TEST CASE 1: Empty / Whitespace Parent Message Rejected (HTTP 400)
    // =========================================================================
    console.log('\n--- Test 1: Parent Message Validation (Empty Message Rejection) ---');
    const pad = n => String(n).padStart(2, '0');
    const fDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const futureLeave1 = new Date(Date.now() + 48 * 3600 * 1000);
    const futureReturn1 = new Date(Date.now() + 72 * 3600 * 1000);
    const outpass1Res = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Home Visit',
        reason: 'Festival Celebration',
        leaving_date: fDate(futureLeave1),
        leaving_time: '10:00',
        expected_return_date: fDate(futureReturn1),
        expected_return_time: '18:00',
        student_phone: '9876500010'
      }
    });
    assert(outpass1Res.ok && outpass1Res.data?.data?.id, 'Student submits outpass request 1', JSON.stringify(outpass1Res.data));
    const outpassId1 = outpass1Res.data?.data?.id;

    // Verify parent location at safe distance (distance ~ 50 meters, >= 5m)
    const locRes1 = await request(`/api/parent/outpass/${outpassId1}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { latitude: 13.0004500, longitude: 80.0000000, accuracy: 4.0 }
    });
    assert(locRes1.ok && locRes1.data?.locationVerified === true, 'Parent location verified for test 1', JSON.stringify(locRes1.data));
    const token1 = locRes1.data?.verificationToken;

    // Attempt approval with empty message
    const emptyApproveRes = await request(`/api/parent/outpass/${outpassId1}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: token1, parent_message: '    ' }
    });
    assert(emptyApproveRes.status === 400, 'Empty / whitespace parent approval message rejected with HTTP 400', JSON.stringify(emptyApproveRes.data));
    assert(emptyApproveRes.data?.message?.includes('Parent approval message is required'), 'Rejection error message guides user to provide message');

    // Verify outpass status remained PENDING_PARENT
    const [checkOutpass1] = await pool.query('SELECT status FROM outpass_requests WHERE id = ?', [outpassId1]);
    assert(checkOutpass1[0]?.status === 'PENDING_PARENT', 'Outpass request remained PENDING_PARENT after empty message rejection');

    // =========================================================================
    // TEST CASE 2: English Message Approval & Flow
    // =========================================================================
    console.log('\n--- Test 2: English Parent Message Approval & Forwarding ---');
    const englishMessage = 'I hereby grant permission for my ward to visit home for the upcoming weekend.';
    const approveEnglishRes = await request(`/api/parent/outpass/${outpassId1}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: token1, parent_message: englishMessage }
    });
    assert(approveEnglishRes.ok && approveEnglishRes.data?.success === true, 'Approval succeeded with valid English message');

    // Verify database persistence in outpass_requests
    const [dbOutpass1] = await pool.query(
      `SELECT status, parent_location_verified, parent_approval_message, distance_meters 
       FROM outpass_requests WHERE id = ?`,
      [outpassId1]
    );
    assert(dbOutpass1[0]?.status === 'PENDING_WARDEN', 'Outpass status transitioned to PENDING_WARDEN');
    assert(dbOutpass1[0]?.parent_location_verified === 1, 'parent_location_verified set to 1');
    assert(dbOutpass1[0]?.parent_approval_message === englishMessage, 'parent_approval_message correctly saved in outpass_requests');

    // Verify database persistence in parent_messages
    const [dbMsg1] = await pool.query(
      `SELECT message_body, parent_response FROM parent_messages 
       WHERE outpass_request_id = ? AND parent_id = ? ORDER BY id DESC LIMIT 1`,
      [outpassId1, parentId]
    );
    assert(dbMsg1.length > 0, 'Record created in parent_messages table');
    assert(dbMsg1[0]?.message_body === englishMessage, 'parent_messages.message_body matches exact English text');
    assert(dbMsg1[0]?.parent_response === 'approved', 'parent_messages.parent_response is approved');

    // =========================================================================
    // TEST CASE 3: Tamil Unicode Message Approval (Zero Translation)
    // =========================================================================
    console.log('\n--- Test 3: Tamil Unicode Message Approval (Zero Translation) ---');
    const futureLeave2 = new Date(Date.now() + 36 * 3600 * 1000);
    const futureReturn2 = new Date(Date.now() + 60 * 3600 * 1000);
    const outpass2Res = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'மதுரை இல்லம்',
        reason: 'குடும்ப விழா',
        leaving_date: fDate(futureLeave2),
        leaving_time: '10:00',
        expected_return_date: fDate(futureReturn2),
        expected_return_time: '18:00',
        student_phone: '9876500010'
      }
    });
    assert(outpass2Res.ok && outpass2Res.data?.data?.id, 'Student submits Tamil outpass request 2');
    const outpassId2 = outpass2Res.data?.data?.id;

    // Verify location
    const locRes2 = await request(`/api/parent/outpass/${outpassId2}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { latitude: 13.0005000, longitude: 80.0000000, accuracy: 4.0 }
    });
    assert(locRes2.ok && locRes2.data?.locationVerified === true, 'Parent location verified for Tamil test');
    const token2 = locRes2.data?.verificationToken;

    const tamilMessage = 'என் மகனை இந்த வார இறுதியில் வீட்டிற்கு வர அனுமதிக்கவும். குடும்பத்தில் விசேஷம் உள்ளது.';
    const approveTamilRes = await request(`/api/parent/outpass/${outpassId2}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { verification_token: token2, parent_message: tamilMessage }
    });
    assert(approveTamilRes.ok && approveTamilRes.data?.success === true, 'Approval succeeded with Tamil message');

    const [dbOutpass2] = await pool.query(
      `SELECT status, parent_approval_message FROM outpass_requests WHERE id = ?`,
      [outpassId2]
    );
    assert(dbOutpass2[0]?.parent_approval_message === tamilMessage, 'Tamil text preserved verbatim in outpass_requests (zero translation)');

    const [dbMsg2] = await pool.query(
      `SELECT message_body FROM parent_messages WHERE outpass_request_id = ? AND parent_id = ? ORDER BY id DESC LIMIT 1`,
      [outpassId2, parentId]
    );
    assert(dbMsg2[0]?.message_body === tamilMessage, 'Tamil text preserved verbatim in parent_messages table');

    // =========================================================================
    // TEST CASE 4: GPS Security Verification Guardrails
    // =========================================================================
    console.log('\n--- Test 4: GPS Security Verification Guardrails (<5m Proximity Block) ---');
    const futureLeave3 = new Date(Date.now() + 48 * 3600 * 1000);
    const futureReturn3 = new Date(Date.now() + 72 * 3600 * 1000);
    const outpass3Res = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Local Visit',
        reason: 'Personal',
        leaving_date: fDate(futureLeave3),
        leaving_time: '10:00',
        expected_return_date: fDate(futureReturn3),
        expected_return_time: '18:00',
        student_phone: '9876500010'
      }
    });
    assert(outpass3Res.ok && outpass3Res.data?.data?.id, 'Student submits outpass request 3 for proximity test');
    const outpassId3 = outpass3Res.data?.data?.id;

    // Student is at (13.0000000, 80.0000000). Parent attempts verification from virtually identical coordinates (<5m)
    const proximityBlockRes = await request(`/api/parent/outpass/${outpassId3}/location-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { latitude: 13.0000100, longitude: 80.0000100, accuracy: 2.0 }
    });
    assert(proximityBlockRes.status === 403, 'Location verification <5m strictly blocked with HTTP 403');
    assert(proximityBlockRes.data?.proximityBlocked === true, 'Response flags proximityBlocked: true');
    assert(proximityBlockRes.data?.distanceMeters < 5, `Calculated distance confirms proximity violation (${proximityBlockRes.data?.distanceMeters}m)`);

    // =========================================================================
    // TEST CASE 5: Warden Review Queue Inline Message & Decision Visibility
    // =========================================================================
    console.log('\n--- Test 5: Warden Pending Queue Visibility of Parent Response ---');
    const wardenPendingRes = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(wardenPendingRes.ok && wardenPendingRes.data?.pendingRequests, 'Warden fetched pending outpasses');
    const pendingList = wardenPendingRes.data?.pendingRequests || [];

    const wardenViewReq1 = pendingList.find(r => r.id === outpassId1);
    assert(!!wardenViewReq1, `Outpass #${outpassId1} visible in Warden pending queue`);
    assert(wardenViewReq1?.parentApprovalStatus?.toUpperCase() === 'APPROVED', 'Warden sees Parent Decision: APPROVED');
    assert(wardenViewReq1?.parentMessage === englishMessage, `Warden sees Parent Message: "${wardenViewReq1?.parentMessage}"`);
    assert(wardenViewReq1?.locationVerificationResult === 'VERIFIED', 'Warden sees Location Verification: VERIFIED');
    assert(wardenViewReq1?.distanceMeters >= 5, `Warden sees calculated distance >= 5m (${wardenViewReq1?.distanceMeters}m)`);
    assert(wardenViewReq1?.parentVerifiedMobile === '9876543210', `Warden sees verified parent mobile: ${wardenViewReq1?.parentVerifiedMobile}`);

    const wardenViewReq2 = pendingList.find(r => r.id === outpassId2);
    assert(!!wardenViewReq2, `Tamil outpass #${outpassId2} visible in Warden pending queue`);
    assert(wardenViewReq2?.parentMessage === tamilMessage, `Warden sees exact Tamil parent message: "${wardenViewReq2?.parentMessage}"`);

    // =========================================================================
    // TEST CASE 6: Warden Approval & QR Generation
    // =========================================================================
    console.log('\n--- Test 6: Warden Approval & QR Generation ---');
    const wardenApproveRes = await request(`/api/outpass/${outpassId1}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(wardenApproveRes.ok && wardenApproveRes.data?.success === true, 'Warden successfully approved outpass');

    // Trigger QR generation
    const qrRes = await request(`/api/qr/generate/${outpassId1}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(qrRes.ok && qrRes.data?.success === true, 'QR generated successfully after Warden approval');

    const [dbQr] = await pool.query('SELECT status FROM qr_codes WHERE outpass_request_id = ?', [outpassId1]);
    assert(dbQr.length > 0 && dbQr[0]?.status === 'ACTIVE', 'Digital Security QR is ACTIVE in database');

    // =========================================================================
    // TEST CASE 7: HTML Cleanup Validation
    // =========================================================================
    console.log('\n--- Test 7: HTML Dashboard Cleanup & DB Intactness ---');
    const parentHtmlPath = path.join(__dirname, '../public/parent-dashboard.html');
    const wardenHtmlPath = path.join(__dirname, '../public/warden-dashboard.html');

    const parentHtmlContent = fs.readFileSync(parentHtmlPath, 'utf8');
    const wardenHtmlContent = fs.readFileSync(wardenHtmlPath, 'utf8');

    // Verify parent dashboard cleanup
    assert(!parentHtmlContent.includes('data-tab="messages"'), 'Parent Dashboard has no data-tab="messages" nav button');
    assert(!parentHtmlContent.includes('id="tab-messages"'), 'Parent Dashboard has no #tab-messages section');
    assert(parentHtmlContent.includes('id="parentMessageConsentSection"'), 'Parent Dashboard retains inline message section in approve modal');
    assert(parentHtmlContent.includes('id="voiceUnsupportedNotice"'), 'Parent Dashboard contains #voiceUnsupportedNotice fallback');

    // Verify warden dashboard cleanup
    assert(!wardenHtmlContent.includes('data-tab="parent-messages"'), 'Warden Dashboard has no data-tab="parent-messages" nav button');
    assert(!wardenHtmlContent.includes('id="tab-parent-messages"'), 'Warden Dashboard has no #tab-parent-messages section');

    // Verify database parent_messages table intactness
    const [msgCount] = await pool.query('SELECT COUNT(*) AS total FROM parent_messages');
    assert(msgCount[0]?.total > 0, `parent_messages database table is intact with ${msgCount[0]?.total} historical messages`);

    // Clean up test outpasses
    await pool.query('DELETE FROM qr_codes WHERE outpass_request_id IN (?, ?, ?)', [outpassId1, outpassId2, outpassId3]);
    await pool.query('DELETE FROM outpass_requests WHERE id IN (?, ?, ?)', [outpassId1, outpassId2, outpassId3]);

  } catch (err) {
    console.error('Unhandled error in test suite:', err);
    failed++;
  } finally {
    console.log('\n======================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTestSuite();
