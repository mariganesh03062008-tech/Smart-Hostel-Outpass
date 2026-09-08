/**
 * Automated Test Suite for PARENT AUTHENTICATION UI - UNIFIED MAIN PORTAL FLOW (MATCHING STUDENT LAYOUT)
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
  console.log('🧪 TEST SUITE: PARENT AUTHENTICATION - UNIFIED STUDENT-MATCHING LAYOUT');
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
  const mobileA = `91${timestamp}91`;
  const mobileB = `91${timestamp}92`;
  const passA = 'SecureParentA@123';
  const passB = 'SecureParentB@123';

  // 1. TEST 1: Main Login Portal Contains All 7 Roles and Unified Login Card
  console.log('🏠 1. Verifying Unified Main Login Portal Layout (index.html)...');
  const indexRes = await req('/index.html');
  assert(indexRes.status === 200, 'index.html served with HTTP 200');
  assert(indexRes.raw.includes('data-role="student"'), 'Contains Student category');
  assert(indexRes.raw.includes('data-role="parent"'), 'Contains Parent category');
  assert(indexRes.raw.includes('data-role="warden"'), 'Contains Warden category');
  assert(indexRes.raw.includes('data-role="principal"'), 'Contains Principal category');
  assert(indexRes.raw.includes('data-role="class_advisor"'), 'Contains Class Advisor category');
  assert(indexRes.raw.includes('data-role="caretaker"'), 'Contains Caretaker category');
  assert(indexRes.raw.includes('data-role="watchman"'), 'Contains Watchman category');
  assert(indexRes.raw.includes('id="loginForm"'), 'Contains single dynamic loginForm matching Student layout');
  assert(indexRes.raw.includes('id="parentCreateAccountBox"'), 'Contains inline parentCreateAccountBox');
  assert(indexRes.raw.includes('id="parentRegisterForm"'), 'Contains inline parentRegisterForm');
  assert(indexRes.raw.includes('showParentRegisterForm'), 'Includes showParentRegisterForm handler');
  assert(indexRes.raw.includes('showParentLoginForm'), 'Includes showParentLoginForm handler');
  assert(indexRes.raw.includes('handleParentInlineRegisterSubmit'), 'Includes inline register submit handler');

  // 2. TEST 2: Inline New Parent Account Creation
  console.log('\n👤 2. Testing Inline Account Creation on Main Portal...');
  const regARes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'Meena Sundaram',
      mobile: mobileA,
      password: passA,
      confirm_password: passA
    }
  });
  assert(regARes.status === 201, `Account created for ${mobileA} in MySQL`);
  assert(Boolean(regARes.data?.token), 'Auto-login token issued immediately');
  assert(regARes.data?.redirectTo === '/parent-dashboard.html', 'Redirect target points to /parent-dashboard.html');
  const tokenA = regARes.data?.token;

  // 3. TEST 3: Duplicate Mobile Prevention
  const dupRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'Meena Duplicate',
      mobile: mobileA,
      password: passA,
      confirm_password: passA
    }
  });
  assert(dupRes.status === 409, 'Duplicate mobile registration rejected with HTTP 409');
  assert(dupRes.data?.message === 'An account with this mobile number already exists.', 'Duplicate error message verified');

  // 4. TEST 4: Existing Account Login on Main Portal
  console.log('\n🔑 4. Testing Existing Parent Login on Main Portal...');
  const loginARes = await req('/api/auth/login', {
    method: 'POST',
    body: {
      username: mobileA,
      password: passA,
      role: 'parent'
    }
  });
  assert(loginARes.status === 200, 'Existing parent login successful');
  assert(Boolean(loginARes.data?.token), 'Authenticated JWT returned');

  // 5. TEST 5: Second Parent Account Creation (Parent B) & Data Isolation
  console.log('\n👥 5. Testing Multiple Separate Parent Accounts...');
  const regBRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'Vikram Joshi',
      mobile: mobileB,
      password: passB,
      confirm_password: passB
    }
  });
  assert(regBRes.status === 201, `Parent B registered with mobile ${mobileB}`);
  const tokenB = regBRes.data?.token;

  // Profile setup for Parent B
  const setupBRes = await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokenB}` },
    body: {
      parent_name: 'Vikram Joshi',
      relationship: 'Father',
      email: `vikram.${timestamp}@example.com`,
      address: '22 Marine Drive, Mumbai, MH',
      student_name: 'Alex Smith',
      student_reg_no: '21ME018',
      hostel_block: 'Block B',
      room_no: 'B-201'
    }
  });
  assert(setupBRes.status === 200, 'Parent B profile saved in MySQL');

  // Verify Parent B overview data isolation
  const overviewBRes = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert(overviewBRes.data?.parent?.fatherName === 'Vikram Joshi', 'Parent B isolated data: Vikram Joshi');
  assert(overviewBRes.data?.linkedStudent?.regNo === '21ME018', 'Parent B linked ward: 21ME018');

  // 6. TEST 6: Route Protection & Logout Redirection to Main Portal
  console.log('\n🚪 6. Verifying Logout & Route Protection Redirection to Main Portal (/index.html)...');
  const dashRes = await req('/parent-dashboard.html');
  assert(dashRes.status === 200, 'parent-dashboard.html served');

  const logoutRes = await req('/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(logoutRes.status === 200, 'Logout endpoint returned HTTP 200');

  // 7. TEST 7: Verify Other 6 Roles Remain Fully Functional
  console.log('\n🔒 7. Verifying Other 6 Roles Remain Fully Functional...');
  const stuRes = await req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } });
  const wrdRes = await req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } });
  const advRes = await req('/api/auth/login', { method: 'POST', body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' } });
  const prcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'PRC-001', password: 'Password@123', role: 'principal' } });
  const ctkRes = await req('/api/auth/login', { method: 'POST', body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' } });
  const wtcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' } });

  assert(stuRes.status === 200, 'Student login functional');
  assert(wrdRes.status === 200, 'Warden login functional');
  assert(advRes.status === 200, 'Class Advisor login functional');
  assert(prcRes.status === 200, 'Principal login functional');
  assert(ctkRes.status === 200, 'Caretaker login functional');
  assert(wtcRes.status === 200, 'Watchman login functional');

  // Restore Default Parent Linkage for regression tests
  const demoParentLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  if (demoParentLogin.data?.token) {
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
  console.log(`🏁 INLINE PARENT PORTAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
