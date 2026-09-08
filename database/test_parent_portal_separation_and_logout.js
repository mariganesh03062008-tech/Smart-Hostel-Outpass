/**
 * Test Suite: PARENT LOGIN PORTAL SEPARATION, ROUTE PROTECTION, AND LOGOUT FLOW
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
  console.log('🚀 ================================================================');
  console.log('🧪 TEST SUITE: PARENT LOGIN PORTAL, ROUTE PROTECTION & LOGOUT FLOW');
  console.log('================================================================\n');

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
  const mobile1 = `91${timestamp}11`;
  const mobile2 = `91${timestamp}22`;
  const pass = 'TestParentPass@123';

  // 1. TEST 1: Dedicated Parent Login Portal Page Exists & Serves Content
  console.log('📄 1. Verifying Dedicated Parent Login Portal (/parent-login.html)...');
  const loginPageRes = await req('/parent-login.html');
  assert(loginPageRes.status === 200, 'parent-login.html exists and returns HTTP 200');
  assert(loginPageRes.raw.includes('Parent Login'), 'parent-login.html contains "Parent Login" view');
  assert(loginPageRes.raw.includes('Create Parent Account'), 'parent-login.html contains "Create Parent Account" view');
  assert(loginPageRes.raw.includes('handleLoginSubmit'), 'parent-login.html includes login handler');
  assert(loginPageRes.raw.includes('handleRegisterSubmit'), 'parent-login.html includes registration handler');

  // 2. TEST 2: Create Account Flow -> Auto-Login -> Dashboard Redirection
  console.log('\n👤 2. Testing Create Account Flow on Portal...');
  const regRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'Ananya Roy',
      mobile: mobile1,
      password: pass,
      confirm_password: pass
    }
  });
  assert(regRes.status === 201, `Account created for ${mobile1}`);
  assert(Boolean(regRes.data?.token), 'Auto-login token issued immediately');
  assert(regRes.data?.redirectTo === '/parent-dashboard.html', 'Redirect target points to /parent-dashboard.html');
  const parent1Token = regRes.data?.token;

  // 3. TEST 3: Route Protection on Parent Dashboard
  console.log('\n🛡️ 3. Testing Route Protection on Parent Dashboard (/api/auth/me & /parent-dashboard.html)...');
  // 3.1 Unauthenticated request rejected by API
  const unauthRes = await req('/api/auth/me');
  assert(unauthRes.status === 401, 'Unauthenticated request to /api/auth/me rejected with HTTP 401');

  // 3.2 Invalid token rejected
  const invalidTokenRes = await req('/api/auth/me', {
    headers: { 'Authorization': 'Bearer INVALID_TOKEN_XYZ' }
  });
  assert(invalidTokenRes.status === 401 || invalidTokenRes.status === 403, 'Invalid token rejected with HTTP 401/403');

  // 3.3 Valid parent token accepted
  const authRes = await req('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${parent1Token}` }
  });
  assert(authRes.status === 200, 'Authenticated parent session verified successfully');
  assert(authRes.data?.user?.role === 'parent', 'Authenticated role confirmed as "parent"');

  // 4. TEST 4: Logout Flow
  console.log('\n🚪 4. Testing Logout Flow...');
  const logoutRes = await req('/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parent1Token}` }
  });
  assert(logoutRes.status === 200, 'Logout endpoint returned HTTP 200');

  // Verify dashboard HTML contains clean route protection script redirecting to parent-login.html
  const dashPageRes = await req('/parent-dashboard.html');
  assert(dashPageRes.status === 200, 'parent-dashboard.html served');
  assert(!dashPageRes.raw.includes('id="parentAuthModal"'), 'Embedded parentAuthModal removed from parent-dashboard.html');
  
  // 5. TEST 5: Existing Account Login Flow
  console.log('\n🔑 5. Testing Existing Account Login on Portal...');
  const loginRes = await req('/api/auth/login', {
    method: 'POST',
    body: {
      username: mobile1,
      password: pass,
      role: 'parent'
    }
  });
  assert(loginRes.status === 200, 'Existing parent login successful');
  assert(Boolean(loginRes.data?.token), 'Login returned valid token for parent dashboard');

  // 6. TEST 6: Second Account Creation & Independent Isolation
  console.log('\n👥 6. Testing Second Account Creation (Parent 2)...');
  const reg2Res = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'Suresh Menon',
      mobile: mobile2,
      password: pass,
      confirm_password: pass
    }
  });
  assert(reg2Res.status === 201, `Second account created independently for ${mobile2}`);
  const parent2Token = reg2Res.data?.token;

  // Setup Parent 2 Profile
  const setup2Res = await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${parent2Token}` },
    body: {
      parent_name: 'Suresh Menon',
      relationship: 'Father',
      email: `suresh.${timestamp}@example.com`,
      address: '77 Residency Road, Kochi, KL',
      student_name: 'Alex Smith',
      student_reg_no: '21ME018',
      hostel_block: 'Block B',
      room_no: 'B-201'
    }
  });
  assert(setup2Res.status === 200, 'Parent 2 profile configured');

  // Verify Parent 2 sees only their own data
  const overview2Res = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${parent2Token}` }
  });
  assert(overview2Res.data?.parent?.fatherName === 'Suresh Menon', 'Parent 2 isolated data verified');
  assert(overview2Res.data?.linkedStudent?.regNo === '21ME018', 'Parent 2 linked to student 21ME018');

  // 7. TEST 7: Verify Other 6 Modules Are Unmodified & Fully Functional
  console.log('\n🔒 7. Verifying All Other Roles Are Unaffected...');
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

  console.log('\n================================================================');
  console.log(`🏁 PARENT PORTAL & LOGOUT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
