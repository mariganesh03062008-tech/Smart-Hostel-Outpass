const http = require('http');

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

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

async function runTests() {
  console.log('🧪 ========================================================');
  console.log(`🚀 RUNNING COMPREHENSIVE AUTHENTICATION & REDIRECT TESTS ON PORT ${PORT}`);
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  // TEST 1: Health Check
  const health = await request('/api/health');
  assert(health.ok && health.data.success === true, '1. Health Check Endpoint (/api/health)');

  // TEST 2: DB Connection Test
  const dbTest = await request('/api/db-test');
  assert(dbTest.ok && dbTest.data.success === true, '2. Database Test Endpoint (/api/db-test)');

  // TEST 3: Invalid Login - Wrong Password
  const wrongPass = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'WrongPassword999', role: 'student' }
  });
  assert(wrongPass.status === 401 && wrongPass.data.success === false, '3. Reject Invalid Password (HTTP 401)');

  // TEST 4: Invalid Login - Non-existent User
  const wrongUser = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'NONEXISTENT_USER', password: 'Password@123', role: 'student' }
  });
  assert(wrongUser.status === 401 && wrongUser.data.success === false, '4. Reject Non-Existent User (HTTP 401)');

  // TEST 5: Invalid Login - Missing Fields
  const missingField = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', role: 'student' }
  });
  assert(missingField.status === 400 && missingField.data.success === false, '5. Reject Missing Password Field (HTTP 400)');

  // TEST 6: Invalid Login - Mismatched Role
  const wrongRole = await request('/api/auth/login', {
    method: 'POST',
    body: { username: '21CS042', password: 'Password@123', role: 'warden' }
  });
  assert(wrongRole.status === 401 && wrongRole.data.success === false, '6. Reject User When Role Mismatched (HTTP 401)');

  console.log('\n--- Testing All 7 Role-Based Logins and Specific Dashboard Redirects ---');

  const demoRoles = [
    { role: 'student', username: '21CS042', expectedName: 'John Doe', expectedRedirect: '/student-dashboard.html' },
    { role: 'parent', username: '9876543210', expectedName: 'Robert Doe', expectedRedirect: '/parent-dashboard.html' },
    { role: 'warden', username: 'WRD-101', expectedName: 'Dr. Ramesh Kumar', expectedRedirect: '/warden-dashboard.html' },
    { role: 'principal', username: 'PRC-001', expectedName: 'Dr. A. Sharma', expectedRedirect: '/principal-dashboard.html' },
    { role: 'class_advisor', username: 'ADV-204', expectedName: 'Prof. S. Venkatesh', expectedRedirect: '/advisor-dashboard.html' },
    { role: 'caretaker', username: 'CTK-305', expectedName: 'Mr. Murugan', expectedRedirect: '/caretaker-dashboard.html' },
    { role: 'watchman', username: 'SEC-001', expectedName: 'Mr. K. Selvam', expectedRedirect: '/watchman-dashboard.html' }
  ];

  let sampleToken = null;

  for (const item of demoRoles) {
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: item.username, password: 'Password@123', role: item.role }
    });

    const isOk = loginRes.ok && 
                 loginRes.data.success === true && 
                 loginRes.data.token && 
                 loginRes.data.user && 
                 loginRes.data.user.name === item.expectedName &&
                 loginRes.data.user.role === item.role &&
                 loginRes.data.redirectTo === item.expectedRedirect &&
                 !loginRes.data.user.password_hash; // Security check

    assert(isOk, `7.${demoRoles.indexOf(item) + 1} Login for [${item.role.toUpperCase()}] → Redirects to: ${item.expectedRedirect}`, JSON.stringify(loginRes.data));

    if (item.role === 'student' && loginRes.data.token) {
      sampleToken = loginRes.data.token;
    }
  }

  console.log('\n--- Testing Case Normalization in Role Input ---');

  // Case normalization tests
  const caseTests = [
    { role: 'Student', username: '21CS042', expectedRedirect: '/student-dashboard.html' },
    { role: 'STUDENT', username: '21CS042', expectedRedirect: '/student-dashboard.html' },
    { role: 'Class Advisor', username: 'ADV-204', expectedRedirect: '/advisor-dashboard.html' },
    { role: 'CLASS_ADVISOR', username: 'ADV-204', expectedRedirect: '/advisor-dashboard.html' }
  ];

  for (const ct of caseTests) {
    const caseRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: ct.username, password: 'Password@123', role: ct.role }
    });
    assert(caseRes.ok && caseRes.data.redirectTo === ct.expectedRedirect, `8.${caseTests.indexOf(ct) + 1} Normalize '${ct.role}' → ${ct.expectedRedirect}`);
  }

  console.log('\n--- Testing Protected Routes & Profile Verification ---');

  // TEST 9: Protected Route WITHOUT Token
  const unauthMe = await request('/api/auth/me');
  assert(unauthMe.status === 401 && unauthMe.data.success === false, '9. Block Protected Route Without Token (HTTP 401)');

  // TEST 10: Protected Route WITH Invalid Token
  const invalidTokenMe = await request('/api/auth/me', {
    headers: { 'Authorization': 'Bearer invalid.token.payload' }
  });
  assert(invalidTokenMe.status === 403 || invalidTokenMe.status === 401, '10. Block Protected Route With Invalid Token');

  // TEST 11: Protected Route WITH Valid Token
  const validMe = await request('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${sampleToken}` }
  });
  assert(validMe.ok && validMe.data.success === true && validMe.data.user.name === 'John Doe', '11. Allow Protected Profile (/api/auth/me) with Valid JWT');

  // TEST 12: Logout Endpoint
  const logoutRes = await request('/api/auth/logout', { method: 'POST' });
  assert(logoutRes.ok && logoutRes.data.success === true, '12. Logout Endpoint (/api/auth/logout)');

  console.log('\n--- Verifying All 7 Dedicated Dashboard Pages (HTTP 200) ---');

  const dashboardUrls = [
    '/student-dashboard.html',
    '/parent-dashboard.html',
    '/warden-dashboard.html',
    '/principal-dashboard.html',
    '/advisor-dashboard.html',
    '/caretaker-dashboard.html',
    '/watchman-dashboard.html'
  ];

  for (const dUrl of dashboardUrls) {
    const dRes = await fetch(`${BASE_URL}${dUrl}`);
    assert(dRes.status === 200, `13.${dashboardUrls.indexOf(dUrl) + 1} Dedicated Page Exists: ${dUrl} (HTTP 200)`);
  }

  console.log('\n========================================================');
  console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');
}

runTests();
