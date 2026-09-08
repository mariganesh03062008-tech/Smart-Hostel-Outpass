/**
 * ============================================================================
 * AUTOMATED TEST SUITE: PARENT MODULE MANTRA FINGERPRINT INTEGRATION
 * ============================================================================
 * Verifies all 8 required scenarios:
 * 1. New Parent -> Create Account -> Fingerprint Registration -> Profile -> Dashboard
 * 2. Existing Parent -> Login -> Dashboard
 * 3. Student submits request -> Parent receives request in Pending Queue
 * 4. Parent clicks Approve -> Fingerprint Verification Required
 * 5. Mock MATCH -> Approval + Parent Message -> Warden (Status PENDING_WARDEN, Biometric Verified)
 * 6. Mock NO MATCH -> Approval blocked (HTTP 403 / Request remains PENDING_PARENT)
 * 7. Parent Sign Out -> Main Login Portal (/index.html)
 * 8. Other 6 roles (Student, Warden, Principal, Advisor, Caretaker, Watchman) continue working
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
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    clientReq.on('error', reject);
    if (options.body) clientReq.write(JSON.stringify(options.body));
    clientReq.end();
  });
}

async function run() {
  console.log('🚀 ====================================================================');
  console.log('🧪 TEST SUITE: PARENT MODULE MANTRA FINGERPRINT SCANNER INTEGRATION');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;
  function assert(condition, name, msg = '') {
    if (condition) {
      console.log(`  ✅ [PASS]: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL]: ${name} ${msg ? '(' + msg + ')' : ''}`);
      failed++;
    }
  }

  const timestamp = Date.now().toString().slice(-6);
  const mobileParent1 = `91${timestamp}11`;
  const passParent1 = 'SecurePass@123';

  // -------------------------------------------------------------------------
  // TEST 1: New Parent -> Create Account -> Fingerprint Registration -> Profile -> Dashboard
  // -------------------------------------------------------------------------
  console.log('👤 TEST 1: New Parent Registration & Biometric Enrollment...');
  const regRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'Anand Sharma',
      mobile: mobileParent1,
      password: passParent1,
      confirm_password: passParent1
    }
  });
  assert(regRes.status === 201, 'New Parent Account Created with HTTP 201');
  const tokenP1 = regRes.data?.token;
  assert(Boolean(tokenP1), 'Auto-login JWT token issued immediately');

  // Check overview before fingerprint registration (should be un-enrolled)
  const overviewPreReg = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${tokenP1}` }
  });
  assert(overviewPreReg.status === 200, 'Parent overview returned HTTP 200');
  assert(overviewPreReg.data?.parent?.fingerprintRegistered === false, 'Fingerprint enrolled flag is false initially');

  // Check hardware status
  const scannerStatus = await req('/api/parent/fingerprint/status', {
    headers: { 'Authorization': `Bearer ${tokenP1}` }
  });
  assert(scannerStatus.status === 200, 'Scanner status endpoint returned HTTP 200');
  assert(scannerStatus.data?.mode === 'mock', 'Scanner active in development mock mode');
  assert(scannerStatus.data?.connected === true, 'Simulated scanner connected & ready');

  // Register Fingerprint
  const fpRegRes = await req('/api/parent/fingerprint/register', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenP1}` },
    body: { qualityThreshold: 85 }
  });
  assert(fpRegRes.status === 200, 'Fingerprint registered via FingerprintService');
  assert(fpRegRes.data?.fingerprintRegistered === true, 'fingerprintRegistered returned true');
  assert(fpRegRes.data?.isDevelopmentMock === true, 'Explicitly tagged as development mock');

  // Setup Parent Profile & Link to Student 21CS042
  const profileRes = await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokenP1}` },
    body: {
      parent_name: 'Anand Sharma',
      relationship: 'Father',
      student_name: 'John Doe',
      student_reg_no: '21CS042',
      hostel_block: 'Block A',
      room_no: 'A-304',
      address: '45 Lake View Road, Chennai'
    }
  });
  assert(profileRes.status === 200, 'Parent Profile saved and linked to Student');

  // Verify overview post-registration
  const overviewPostReg = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${tokenP1}` }
  });
  assert(overviewPostReg.data?.parent?.fingerprintRegistered === true, 'Fingerprint enrolled flag is now true');
  assert(overviewPostReg.data?.linkedStudent?.regNo === '21CS042', 'Linked student verified as 21CS042');

  // -------------------------------------------------------------------------
  // TEST 2: Existing Parent -> Login -> Dashboard
  // -------------------------------------------------------------------------
  console.log('\n🔑 TEST 2: Existing Parent Login...');
  const loginRes = await req('/api/auth/login', {
    method: 'POST',
    body: {
      username: mobileParent1,
      password: passParent1,
      role: 'parent'
    }
  });
  assert(loginRes.status === 200, 'Existing parent login successful');
  assert(Boolean(loginRes.data?.token), 'Authenticated session JWT returned');
  const tokenP1Login = loginRes.data?.token;

  const overviewLogin = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${tokenP1Login}` }
  });
  assert(overviewLogin.data?.parent?.fingerprintRegistered === true, 'Existing parent already enrolled (no re-registration modal needed)');

  // -------------------------------------------------------------------------
  // TEST 3: Student submits request -> Parent receives request
  // -------------------------------------------------------------------------
  console.log('\n📱 TEST 3: Student Submits Outpass -> Parent Receives Request...');
  const studentLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'student' }
  });
  const studentToken = studentLogin.data?.token;

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr1 = '09:00';
  const timeStr2 = '18:00';

  const createOutpass = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      reason: 'Home Visit for Festival with Family',
      destination: 'Chennai Main City',
      leaving_date: dateStr,
      leaving_time: timeStr1,
      expected_return_date: dateStr,
      expected_return_time: timeStr2,
      student_phone: '9876500010'
    }
  });
  assert(createOutpass.status === 201, 'Student submitted Normal Outpass (Status: PENDING_PARENT)');
  const outpassId = createOutpass.data?.data?.id || createOutpass.data?.outpass?.id;
  const outpassCode = createOutpass.data?.data?.requestCode || createOutpass.data?.outpass?.requestCode;
  assert(Boolean(outpassId), `Outpass ID created: ${outpassId} (${outpassCode})`);

  // Parent fetches pending queue
  const pendingQueue = await req('/api/parent/outpass/pending', {
    headers: { 'Authorization': `Bearer ${tokenP1}` }
  });
  assert(pendingQueue.status === 200, 'Pending queue returned HTTP 200');
  const foundReq = pendingQueue.data?.pendingRequests?.find(r => r.id === outpassId);
  assert(Boolean(foundReq), `Outpass ${outpassCode} found in Parent pending queue`);

  // -------------------------------------------------------------------------
  // TEST 4 & 6: Approval BLOCKED without Biometric Match (NO MATCH Scenario)
  // -------------------------------------------------------------------------
  console.log('\n❌ TEST 4 & 6: Approval Blocked on NO MATCH Simulation...');
  
  // Attempting to approve directly without biometric verification
  const directApproveRes = await req(`/api/parent/outpass/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenP1}` },
    body: { parent_message: 'Direct approve without scan' }
  });
  assert(directApproveRes.status === 403, 'Direct approval without biometric match blocked with HTTP 403');
  assert(directApproveRes.data?.message?.includes('verification is required'), 'Error message instructs biometric verification');

  // Trigger NO MATCH simulation
  const noMatchVerify = await req('/api/parent/fingerprint/verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenP1}` },
    body: { simulation_match: false, requestId: outpassId }
  });
  assert(noMatchVerify.status === 200, 'Verification endpoint returned response');
  assert(noMatchVerify.data?.match === false, 'Biometric match is FALSE (NO MATCH simulation)');
  assert(noMatchVerify.data?.message === 'Fingerprint Verification Failed', 'Result reports verification failure');

  // Attempting approval after NO MATCH
  const approveAfterFail = await req(`/api/parent/outpass/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenP1}` },
    body: { parent_message: 'Trying to approve after failed scan' }
  });
  assert(approveAfterFail.status === 403, 'Approval strictly BLOCKED after failed verification (HTTP 403)');

  // -------------------------------------------------------------------------
  // TEST 5: Mock MATCH -> Approval + Parent Message -> Forwarded to Warden
  // -------------------------------------------------------------------------
  console.log('\n✅ TEST 5: Biometric MATCH -> Approval + Message Forwarded to Warden...');
  
  // Trigger MATCH simulation
  const matchVerify = await req('/api/parent/fingerprint/verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenP1}` },
    body: { simulation_match: true, requestId: outpassId }
  });
  assert(matchVerify.status === 200, 'Verification endpoint returned HTTP 200');
  assert(matchVerify.data?.match === true, 'Biometric match is TRUE (MATCH simulation)');
  assert(matchVerify.data?.message === 'Fingerprint Verified Successfully', 'Result reports verification success');

  // Submit Approval with Parent Message
  const parentNote = 'I give full parental permission for John to visit home for the festival. Please approve.';
  const approveRes = await req(`/api/parent/outpass/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${tokenP1}` },
    body: { parent_message: parentNote }
  });
  assert(approveRes.status === 200, 'Outpass Approved by Parent with Biometric Verification (HTTP 200)');
  assert(approveRes.data?.data?.status === 'PENDING_WARDEN', 'Outpass Status transitioned to PENDING_WARDEN');
  assert(approveRes.data?.data?.parentMessage === parentNote, 'Parent message attached to approval data');

  // Verify Warden Receives Request and Parent Message
  const wardenLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
  });
  const wardenToken = wardenLogin.data?.token;

  const wardenQueue = await req('/api/outpass/warden/pending', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenQueue.status === 200, 'Warden queue retrieved with HTTP 200');
  const wardenReq = wardenQueue.data?.data?.find(r => r.id === outpassId) || wardenQueue.data?.requests?.find(r => r.id === outpassId) || wardenQueue.data?.pendingRequests?.find(r => r.id === outpassId);
  assert(Boolean(wardenReq), `Warden received outpass ${outpassCode} in Pending Queue`);

  // -------------------------------------------------------------------------
  // TEST 7: Parent Sign Out -> Main Login Portal
  // -------------------------------------------------------------------------
  console.log('\n🚪 TEST 7: Parent Logout & Navigation Protection...');
  const logoutRes = await req('/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenP1}` }
  });
  assert(logoutRes.status === 200, 'Parent Logout endpoint returned HTTP 200');

  const mainPortal = await req('/index.html');
  assert(mainPortal.status === 200, 'Main Login Portal (/index.html) served properly');

  // -------------------------------------------------------------------------
  // TEST 8: Verify Other 6 Roles Remain Fully Functional
  // -------------------------------------------------------------------------
  console.log('\n🔒 TEST 8: Verifying Other 6 Roles (Student, Warden, Advisor, Principal, Caretaker, Watchman)...');
  const [sRes, wRes, aRes, pRes, cRes, gRes] = await Promise.all([
    req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } }),
    req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } }),
    req('/api/auth/login', { method: 'POST', body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' } }),
    req('/api/auth/login', { method: 'POST', body: { username: 'PRC-001', password: 'Password@123', role: 'principal' } }),
    req('/api/auth/login', { method: 'POST', body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' } }),
    req('/api/auth/login', { method: 'POST', body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' } })
  ]);

  assert(sRes.status === 200, 'Role [Student] login functional');
  assert(wRes.status === 200, 'Role [Warden] login functional');
  assert(aRes.status === 200, 'Role [Class Advisor] login functional');
  assert(pRes.status === 200, 'Role [Principal] login functional');
  assert(cRes.status === 200, 'Role [Caretaker] login functional');
  assert(gRes.status === 200, 'Role [Watchman] login functional');

  // Restore Default Parent Linkage for regression tests
  const demoParentLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  if (demoParentLogin.data?.token) {
    await req('/api/parent/fingerprint/register', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${demoParentLogin.data.token}` }
    });
    await req('/api/parent/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${demoParentLogin.data.token}` },
      body: {
        parent_name: 'Robert Doe',
        relationship: 'Father',
        student_name: 'John Doe',
        student_reg_no: '21CS042',
        hostel_block: 'Block A',
        room_no: 'A-304'
      }
    });
  }

  console.log('\n====================================================================');
  console.log(`🏁 FINGERPRINT INTEGRATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
