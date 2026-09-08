/**
 * Test Suite for PARENT MODULE - STEP 1 ONLY: ACCOUNT CREATION + PROFILE FIX
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
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    clientReq.on('error', reject);
    if (options.body) clientReq.write(JSON.stringify(options.body));
    clientReq.end();
  });
}

async function run() {
  console.log('🚀 ========================================================');
  console.log('🧪 PARENT MODULE - STEP 1 (ACCOUNT CREATION + PROFILE) TEST');
  console.log('========================================================\n');

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

  // 1. Existing Parent Login
  console.log('🔑 1. Testing Existing Parent Login Flow...');
  const loginRes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  assert(loginRes.status === 200, 'Existing parent login successful with mobile (9876543210)');
  assert(Boolean(loginRes.data?.token), 'JWT token returned on existing parent login');
  const existingParentToken = loginRes.data?.token;

  // 2. New Parent Registration Validation Guardrails
  console.log('\n🛡️ 2. Testing Registration Input Validations...');
  
  // 2.1 Invalid mobile (< 10 digits)
  const invalidMobileRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: { mobile: '12345', password: 'Password@123', confirm_password: 'Password@123' }
  });
  assert(invalidMobileRes.status === 400, 'Short mobile number rejected with HTTP 400');

  // 2.2 Short password (< 6 chars)
  const shortPassRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: { mobile: '9123456780', password: '123', confirm_password: '123' }
  });
  assert(shortPassRes.status === 400, 'Short password (<6 chars) rejected with HTTP 400');

  // 2.3 Password mismatch
  const mismatchPassRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: { mobile: '9123456780', password: 'Password@123', confirm_password: 'DifferentPassword@123' }
  });
  assert(mismatchPassRes.status === 400, 'Password mismatch rejected with HTTP 400');

  // 2.4 Duplicate mobile
  const duplicateMobileRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: { mobile: '9876543210', password: 'Password@123', confirm_password: 'Password@123' }
  });
  assert(duplicateMobileRes.status === 409, 'Duplicate mobile number registration rejected with HTTP 409');

  // 3. New Parent Account Creation & Auto-Login
  console.log('\n📱 3. Testing Valid New Parent Registration & Auto-Login...');
  const newMobile = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const regRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      mobile: newMobile,
      password: 'Password@123',
      confirm_password: 'Password@123'
    }
  });
  assert(regRes.status === 201, `New parent registered successfully (Mobile: ${newMobile})`);
  assert(Boolean(regRes.data?.token), 'Auto-login JWT token issued immediately after registration');
  assert(regRes.data?.user?.isNewProfile === true, 'Response marks profile as new');
  const newParentToken = regRes.data?.token;

  // 4. Parent Profile Setup ("Complete Your Profile")
  console.log('\n📝 4. Testing Parent Profile Setup ("Complete Your Profile")...');
  const setupRes = await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newParentToken}` },
    body: {
      parent_name: 'Arthur Pendelton',
      relationship: 'Father',
      student_name: 'John Doe',
      student_reg_no: '21CS042',
      hostel_block: 'Block A',
      room_no: 'A-304'
    }
  });
  assert(setupRes.status === 200, 'Parent profile setup saved successfully via PUT /api/parent/profile');

  // Verify Overview for new parent
  const newParentOverview = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${newParentToken}` }
  });
  assert(newParentOverview.status === 200, 'GET /api/parent/overview returns HTTP 200 for new parent');
  assert(newParentOverview.data?.parent?.fatherName === 'Arthur Pendelton', 'Parent name persisted: Arthur Pendelton');
  assert(newParentOverview.data?.linkedStudent?.name === 'John Doe', 'Linked ward identified: John Doe');
  assert(newParentOverview.data?.linkedStudent?.regNo === '21CS042', 'Linked ward roll number: 21CS042');

  // 5. Inside Dashboard Profile Edit
  console.log('\n✏️ 5. Testing Profile Edit from Dashboard...');
  const testEmail = `arthur.${Date.now()}@example.com`;
  const editRes = await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${newParentToken}` },
    body: {
      parent_name: 'Arthur Pendelton Jr',
      relationship: 'Guardian',
      address: '99 King Avenue, Chennai, TN',
      email: testEmail,
      student_name: 'John Doe',
      student_reg_no: '21CS042',
      hostel_block: 'Block B',
      room_no: 'B-201'
    }
  });
  assert(editRes.status === 200, 'Profile edited successfully via PUT /api/parent/profile');

  // Re-verify Overview
  const editedOverview = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${newParentToken}` }
  });
  assert(editedOverview.data?.parent?.fatherName === 'Arthur Pendelton Jr', 'Updated parent name persisted: Arthur Pendelton Jr');
  assert(editedOverview.data?.parent?.email === testEmail, 'Updated email persisted');
  assert(editedOverview.data?.parent?.address === '99 King Avenue, Chennai, TN', 'Updated address persisted');

  // 6. Verify Other Roles Are 100% Intact
  console.log('\n🔒 6. Verifying Other Role Logins & Functionality...');
  const stuRes = await req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } });
  const wrdRes = await req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } });
  const advRes = await req('/api/auth/login', { method: 'POST', body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' } });
  const prcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'PRC-001', password: 'Password@123', role: 'principal' } });
  const ctkRes = await req('/api/auth/login', { method: 'POST', body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' } });
  const wtcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' } });

  assert(stuRes.status === 200, 'Student authentication intact (21CS042)');
  assert(wrdRes.status === 200, 'Warden authentication intact (WRD-101)');
  assert(advRes.status === 200, 'Class Advisor authentication intact (ADV-204)');
  assert(prcRes.status === 200, 'Principal authentication intact (PRC-001)');
  assert(ctkRes.status === 200, 'Caretaker authentication intact (CTK-305)');
  assert(wtcRes.status === 200, 'Watchman authentication intact (GAT-401)');

  // 7. Cleanup: Restore Demo Parent 9876543210 Linkage
  await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${existingParentToken}` },
    body: {
      parent_name: 'Robert Doe',
      relationship: 'Father',
      student_name: 'John Doe',
      student_reg_no: '21CS042',
      hostel_block: 'Block A',
      room_no: 'A-304'
    }
  });

  console.log('\n========================================================');
  console.log(`🏁 PARENT STEP 1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
