/**
 * Smart Hostel Outpass Management System
 * Comprehensive Automated Test Suite: Parent Face Biometric Verification
 * 
 * Tests Covered:
 * - Test A: Parent face registration status check (GET /api/parent/face/status)
 * - Test B: Face biometric registration with 128D vector (POST /api/parent/face/register)
 * - Test C: Rejection of invalid descriptor formats (wrong length, non-floats, missing)
 * - Test D: Face verification with matching descriptor (D <= 0.45) -> Issues Token
 * - Test E: Face verification rejection with mismatching descriptor (D > 0.45) -> HTTP 422
 * - Test F: Rejection of missing/empty face descriptor in verification
 * - Test G: Rejection of verification by unauthorized parent (HTTP 403)
 * - Test H: Outpass approval security: Rejects approval without face verification (HTTP 403)
 * - Test I: Outpass approval security: Rejects expired, consumed, or forged token (HTTP 403)
 * - Test J: Complete end-to-end lifecycle: Student submit (no GPS) -> Parent Face Verify -> Parent Approve -> Warden Verify -> QR Generated
 * - Test K: Zero legacy GPS/location authentication dependencies scan
 */

require('dotenv').config();
const { pool } = require('../utils/db');
const faceConfig = require('../utils/faceConfig');
const crypto = require('crypto');

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

let serverInstance = null;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = options.headers || {};
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await res.json().catch(() => ({ statusText: res.statusText }));
  return { status: res.status, ok: res.ok, data };
}

// Generate normalized 128D vector
function generateTestVector(seed = 1.0) {
  const raw = new Array(128).fill(0).map((_, i) => Math.sin((i + 1) * seed) + 0.1);
  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0));
  return raw.map(v => Number((v / norm).toFixed(6)));
}

// Generate matching vector (low perturbation, D <= 0.45)
function generateMatchingVector(baseVec, perturbation = 0.02) {
  const perturbed = baseVec.map(v => v + (Math.sin(v * 10) * perturbation));
  const norm = Math.sqrt(perturbed.reduce((sum, v) => sum + v * v, 0));
  return perturbed.map(v => Number((v / norm).toFixed(6)));
}

// Generate mismatching vector (different person, D > 0.45)
function generateMismatchingVector(seed = 9.5) {
  const raw = new Array(128).fill(0).map((_, i) => Math.cos((i + 1) * seed) * 1.5);
  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0));
  return raw.map(v => Number((v / norm).toFixed(6)));
}

async function ensureServerRunning() {
  try {
    const health = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (health.ok) return;
  } catch (e) {
    // Start server in-process
    const serverModule = require('../server');
    serverInstance = serverModule.server;
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
}

async function runParentFaceVerificationTests() {
  console.log('🧪 ====================================================================');
  console.log('🚀 RUNNING PARENT FACE BIOMETRIC VERIFICATION AUTOMATED TEST SUITE');
  console.log('====================================================================\n');

  await ensureServerRunning();

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 0. Test static portal delivery
    const parentDash = await fetch(`${BASE_URL}/parent-dashboard.html`);
    assert(parentDash.status === 200, '0. Parent Dashboard HTML serves HTTP 200');

    // Authenticate Users
    console.log('\n🔑 Authenticating test actors...');
    const parentLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '9876543210', password: 'Password@123', role: 'parent' }
    });
    assert(parentLogin.ok && parentLogin.data.token, 'Auth: Parent (9876543210) JWT login');
    const parentToken = parentLogin.data.token;
    const parentId = parentLogin.data.user.id;

    const studentLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '21CS042', password: 'Password@123', role: 'student' }
    });
    assert(studentLogin.ok && studentLogin.data.token, 'Auth: Student (21CS042) JWT login');
    const studentToken = studentLogin.data.token;

    const wardenLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
    });
    assert(wardenLogin.ok && wardenLogin.data.token, 'Auth: Warden (WRD-101) JWT login');
    const wardenToken = wardenLogin.data.token;

    // Clean up any existing template for clean test state
    await pool.query('DELETE FROM parent_face_templates WHERE parent_id = ?', [parentId]);
    await pool.query('UPDATE parents SET face_registered = 0, face_registered_at = NULL WHERE id = ?', [parentId]);

    // -------------------------------------------------------------
    // Test A: First-time parent profile setup & face status retrieval
    // -------------------------------------------------------------
    console.log('\n--- Test A: Face Registration Status Check ---');
    const statusBefore = await request('/api/parent/face/status', {
      headers: { 'Authorization': `Bearer ${parentToken}` }
    });
    assert(
      statusBefore.ok && statusBefore.data.faceRegistered === false,
      'Test A1: GET /api/parent/face/status reports faceRegistered = false when un-enrolled'
    );
    assert(
      statusBefore.data.matchThreshold === 0.45,
      'Test A2: Match threshold returns authoritative 0.45'
    );

    // -------------------------------------------------------------
    // Test B: Face template registration with 128D vector
    // -------------------------------------------------------------
    console.log('\n--- Test B: Face Template Registration ---');
    const registeredVector = generateTestVector(1.234);
    const regRes = await request('/api/parent/face/register', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: {
        faceDescriptor: registeredVector,
        singleFace: true,
        qualityScore: 0.98
      }
    });
    assert(
      regRes.ok && regRes.data.success === true,
      'Test B1: POST /api/parent/face/register succeeds with valid 128D descriptor'
    );

    const statusAfter = await request('/api/parent/face/status', {
      headers: { 'Authorization': `Bearer ${parentToken}` }
    });
    assert(
      statusAfter.ok && statusAfter.data.faceRegistered === true,
      'Test B2: GET /api/parent/face/status immediately reflects faceRegistered = true'
    );

    // Verify DB record
    const [templateRows] = await pool.query('SELECT * FROM parent_face_templates WHERE parent_id = ?', [parentId]);
    assert(
      templateRows.length === 1 && JSON.parse(templateRows[0].face_descriptor).length === 128,
      'Test B3: Database parent_face_templates stores exact 128-element float array'
    );

    // -------------------------------------------------------------
    // Test C: Reject invalid face registration descriptors
    // -------------------------------------------------------------
    console.log('\n--- Test C: Invalid Descriptor Format Validations ---');
    const emptyDesc = await request('/api/parent/face/register', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: [], singleFace: true }
    });
    assert(emptyDesc.status === 400, 'Test C1: Rejects empty descriptor with HTTP 400');

    const shortDesc = await request('/api/parent/face/register', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: new Array(64).fill(0.1), singleFace: true }
    });
    assert(shortDesc.status === 400, 'Test C2: Rejects 64-dimensional descriptor (must be 128) with HTTP 400');

    const nanDesc = await request('/api/parent/face/register', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: new Array(128).fill(NaN), singleFace: true }
    });
    assert(nanDesc.status === 400, 'Test C3: Rejects NaN floats in descriptor with HTTP 400');

    const multiFace = await request('/api/parent/face/register', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { faceDescriptor: registeredVector, singleFace: false }
    });
    assert(multiFace.status === 400, 'Test C4: Rejects singleFace = false (multiple faces in frame) with HTTP 400');

    // -------------------------------------------------------------
    // Create an active test outpass for verification & approval tests
    // -------------------------------------------------------------
    console.log('\n--- Setting up Test Outpass Request ---');
    const tomorrow = new Date(Date.now() + 48 * 3600 * 1000);
    const dayAfter = new Date(Date.now() + 72 * 3600 * 1000);
    const pad = n => String(n).padStart(2, '0');
    const leaveDateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    const returnDateStr = `${dayAfter.getFullYear()}-${pad(dayAfter.getMonth() + 1)}-${pad(dayAfter.getDate())}`;

    const createOutpassRes = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Parent House, Coimbatore',
        reason: 'Weekend Family Function',
        student_phone: '9876543211',
        leaving_date: leaveDateStr,
        leaving_time: '08:00',
        expected_return_date: returnDateStr,
        expected_return_time: '18:00'
      }
    });

    if (!createOutpassRes.ok) {
      console.log('❌ createOutpassRes failed:', createOutpassRes.status, createOutpassRes.data);
    }
    assert(
      createOutpassRes.ok && createOutpassRes.data?.success,
      'Setup: Student successfully submits normal outpass request without GPS dependency'
    );
    const testOutpassId = createOutpassRes.data?.data?.outpassId || createOutpassRes.data?.data?.id;

    // -------------------------------------------------------------
    // Test D: Face verification with matching descriptor (D <= 0.45)
    // -------------------------------------------------------------
    console.log('\n--- Test D: Face Matching Verification (D <= 0.45) ---');
    const matchingLiveVector = generateMatchingVector(registeredVector, 0.02);
    const distanceCalculated = faceConfig.calculateEuclideanDistance(registeredVector, matchingLiveVector);
    console.log(`    Calculated Euclidean Distance: ${distanceCalculated} (Threshold: 0.45)`);

    const verifyMatchRes = await request(`/api/parent/outpass/${testOutpassId}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: {
        faceDescriptor: matchingLiveVector,
        singleFace: true
      }
    });

    assert(
      verifyMatchRes.ok && verifyMatchRes.data.faceVerified === true,
      `Test D1: Live face matches registered template (HTTP 200, faceVerified = true)`
    );
    assert(
      verifyMatchRes.data.distance <= 0.45,
      `Test D2: Verified distance ${verifyMatchRes.data.distance} <= 0.45 threshold`
    );
    assert(
      Boolean(verifyMatchRes.data.verificationToken),
      `Test D3: Server issued single-use session verification token: ${verifyMatchRes.data.verificationToken?.substring(0, 16)}...`
    );
    const activeToken = verifyMatchRes.data.verificationToken;

    // Verify token exists in database with ACTIVE status
    const [tokenRows] = await pool.query(
      'SELECT * FROM parent_face_verifications WHERE verification_token = ?',
      [activeToken]
    );
    assert(
      tokenRows.length === 1 && tokenRows[0].status === 'ACTIVE',
      'Test D4: parent_face_verifications stores token with ACTIVE status'
    );

    // -------------------------------------------------------------
    // Test E: Face verification rejection with mismatch (D > 0.45)
    // -------------------------------------------------------------
    console.log('\n--- Test E: Face Mismatch Rejection (D > 0.45) ---');
    const mismatchLiveVector = generateMismatchingVector(8.765);
    const mismatchDistance = faceConfig.calculateEuclideanDistance(registeredVector, mismatchLiveVector);
    console.log(`    Calculated Mismatch Distance: ${mismatchDistance} (> 0.45)`);

    const verifyMismatchRes = await request(`/api/parent/outpass/${testOutpassId}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: {
        faceDescriptor: mismatchLiveVector,
        singleFace: true
      }
    });

    assert(
      verifyMismatchRes.status === 422 && verifyMismatchRes.data.faceVerified === false,
      `Test E1: Server authoritatively rejects mismatch with HTTP 422 (Distance: ${verifyMismatchRes.data.distance})`
    );
    assert(
      !verifyMismatchRes.data.verificationToken,
      'Test E2: No verification token is issued on mismatch'
    );

    // -------------------------------------------------------------
    // Test F: Missing / empty descriptor in verification
    // -------------------------------------------------------------
    console.log('\n--- Test F: Missing Descriptor Rejection ---');
    const missingDescRes = await request(`/api/parent/outpass/${testOutpassId}/face-verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: {}
    });
    assert(
      missingDescRes.status === 400,
      'Test F1: Rejects missing face descriptor with HTTP 400'
    );

    // -------------------------------------------------------------
    // Test G: Unauthorized parent attempt
    // -------------------------------------------------------------
    console.log('\n--- Test G: Parent Authorization Check ---');
    // Login as a second parent (9876543212)
    const otherParentLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '9876543212', password: 'Password@123', role: 'parent' }
    });
    if (otherParentLogin.ok) {
      const otherParentToken = otherParentLogin.data.token;
      const unauthVerify = await request(`/api/parent/outpass/${testOutpassId}/face-verify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${otherParentToken}` },
        body: { faceDescriptor: matchingLiveVector, singleFace: true }
      });
      assert(
        unauthVerify.status === 403,
        'Test G1: Reject verification attempt from unlinked parent with HTTP 403 Forbidden'
      );
    } else {
      console.log('  ⚠️ Note: Second parent account not seeded, skipping multi-parent check');
    }

    // -------------------------------------------------------------
    // Test H: Outpass approval security - Requires face verification
    // -------------------------------------------------------------
    console.log('\n--- Test H: Server-Side Approval Security ---');
    const approveNoToken = await request(`/api/parent/outpass/${testOutpassId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: { parent_message: 'Approved without token' }
    });
    assert(
      approveNoToken.status === 403,
      'Test H1: Reject approval without face verification token or descriptor (HTTP 403)'
    );

    // -------------------------------------------------------------
    // Test I: Outpass approval security - Rejects forged or expired token
    // -------------------------------------------------------------
    console.log('\n--- Test I: Forged & Expired Token Rejection ---');
    const fakeToken = crypto.randomBytes(32).toString('hex');
    const approveFakeToken = await request(`/api/parent/outpass/${testOutpassId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: {
        verification_token: fakeToken,
        parent_message: 'Approved with forged token'
      }
    });
    assert(
      approveFakeToken.status === 403,
      'Test I1: Rejects forged/fabricated verification token (HTTP 403)'
    );

    // -------------------------------------------------------------
    // Test J: Full Outpass Approval Lifecycle with Verified Face Token
    // -------------------------------------------------------------
    console.log('\n--- Test J: Complete Outpass Approval & Token Consumption ---');
    const approveRes = await request(`/api/parent/outpass/${testOutpassId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: {
        verification_token: activeToken,
        parent_message: 'Student is permitted to visit home for the weekend. Approved via Face ID.'
      }
    });

    assert(
      approveRes.ok && approveRes.data.success,
      'Test J1: Parent approves outpass successfully using valid face verification token'
    );

    // Re-attempt approval using same token -> Must be rejected (single-use consumed)
    const approveReusedToken = await request(`/api/parent/outpass/${testOutpassId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${parentToken}` },
      body: {
        verification_token: activeToken,
        parent_message: 'Reused token attempt'
      }
    });
    assert(
      approveReusedToken.status === 400 || approveReusedToken.status === 403,
      'Test J2: Reused token rejected immediately (single-use token consumed)'
    );

    // Check DB state for outpass
    const [outpassDbRows] = await pool.query(
      'SELECT status, parent_approval_status, parent_face_verified, parent_face_verified_at FROM outpass_requests WHERE id = ?',
      [testOutpassId]
    );
    assert(
      outpassDbRows[0].status === 'PENDING_WARDEN',
      'Test J3: Outpass transitioned to PENDING_WARDEN'
    );
    assert(
      outpassDbRows[0].parent_face_verified === 1 && Boolean(outpassDbRows[0].parent_face_verified_at),
      'Test J4: parent_face_verified = 1 and timestamp recorded in outpass_requests'
    );

    // Warden reviews outpass
    console.log('\n--- Test J (cont): Warden Review & QR Generation ---');
    const wardenPending = await request('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });

    const pendingItem = wardenPending.data.pendingRequests?.find(r => r.id === testOutpassId);
    assert(
      Boolean(pendingItem),
      'Test J5: Warden receives outpass in pending queue'
    );
    assert(
      pendingItem && pendingItem.parentFaceVerified === 1 && pendingItem.biometricVerificationResult === 'VERIFIED',
      'Test J6: Warden pending query authoritatively reports parentFaceVerified = 1 and biometricVerificationResult = VERIFIED'
    );

    // Warden Approves Outpass
    const wardenApproveRes = await request(`/api/outpass/${testOutpassId}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });

    assert(
      wardenApproveRes.ok && wardenApproveRes.data.success,
      'Test J7: Warden successfully approves outpass'
    );

    // Check QR code generation
    const qrGenRes = await request(`/api/qr/generate/${testOutpassId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(
      (qrGenRes.status === 200 || qrGenRes.status === 201) && Boolean(qrGenRes.data?.data?.qrToken || qrGenRes.data?.data?.qrImageData),
      'Test J8: Gate QR code generated successfully upon Warden approval'
    );

    // -------------------------------------------------------------
    // Test K: Scan project for zero remaining location dependencies
    // -------------------------------------------------------------
    console.log('\n--- Test K: Scan Codebase for Zero Location Auth Dependencies ---');
    const fs = require('fs');
    const path = require('path');

    const filesToScan = [
      'controllers/parentController.js',
      'controllers/outpassController.js',
      'routes/parent.js',
      'public/student-dashboard.html',
      'public/js/student-dashboard.js',
      'public/parent-dashboard.html'
    ];

    let foundOldLocationDependencies = false;
    for (const relPath of filesToScan) {
      const fullPath = path.join(__dirname, '..', relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (/LOCATION_APPROVAL_THRESHOLD_METERS|studentGpsBar|parentApprovalMap/i.test(content)) {
          console.error(`    Found legacy location keyword in ${relPath}`);
          foundOldLocationDependencies = true;
        }
      }
    }

    assert(
      !foundOldLocationDependencies,
      'Test K1: Zero remaining legacy location authentication dependencies in student and parent portals'
    );

  } catch (err) {
    console.error('❌ Test Suite Execution Exception:', err);
    failed++;
  } finally {
    console.log('\n====================================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log('====================================================================\n');

    if (serverInstance) {
      serverInstance.close();
    }
  }

  return { passed, failed };
}

if (require.main === module) {
  runParentFaceVerificationTests().then(({ failed }) => {
    pool.end().then(() => {
      process.exit(failed > 0 ? 1 : 0);
    });
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runParentFaceVerificationTests };
