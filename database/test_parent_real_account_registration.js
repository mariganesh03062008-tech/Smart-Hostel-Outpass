/**
 * Comprehensive Test Suite for REAL PARENT ACCOUNT REGISTRATION & DATA ISOLATION
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
  console.log('🧪 REAL PARENT ACCOUNT REGISTRATION & ISOLATION TEST SUITE');
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

  const timestamp = Date.now().toString().slice(-6);
  const mobileA = `91${timestamp}01`;
  const mobileB = `91${timestamp}02`;
  const passA = 'SecurePassA@123';
  const passB = 'SecurePassB@123';

  // 1. Validation Tests
  console.log('🛡️ 1. Testing Registration & Login Input Validations...');
  
  // 1.1 Unregistered mobile login
  const unregLoginRes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '9000000000', password: 'AnyPassword@123', role: 'parent' }
  });
  assert(unregLoginRes.status === 404, 'Unregistered mobile returns HTTP 404');
  assert(unregLoginRes.data?.message === 'No parent account found. Please create an account.', 
    `Message matches exact string: "${unregLoginRes.data?.message}"`);

  // 1.2 Invalid mobile registration (< 10 digits)
  const invalidMobileRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: { parent_name: 'Test Parent', mobile: '12345', password: 'Password@123', confirm_password: 'Password@123' }
  });
  assert(invalidMobileRes.status === 400, 'Invalid short mobile registration rejected with HTTP 400');

  // 1.3 Short password registration (< 6 chars)
  const shortPassRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: { parent_name: 'Test Parent', mobile: mobileA, password: '123', confirm_password: '123' }
  });
  assert(shortPassRes.status === 400, 'Short password (<6 chars) registration rejected with HTTP 400');

  // 1.4 Password mismatch
  const mismatchRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: { parent_name: 'Test Parent', mobile: mobileA, password: 'PasswordA@123', confirm_password: 'PasswordB@123' }
  });
  assert(mismatchRes.status === 400, 'Password mismatch registration rejected with HTTP 400');

  // 2. Parent A: Real Account Creation & Auto-Login
  console.log('\n👤 2. Testing Parent A: Real Account Registration...');
  const regARes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'Priya Sharma',
      mobile: mobileA,
      password: passA,
      confirm_password: passA
    }
  });
  assert(regARes.status === 201, `Parent A account created successfully in MySQL (Mobile: ${mobileA})`);
  assert(Boolean(regARes.data?.token), 'Parent A auto-login issued valid JWT token');
  const tokenA = regARes.data?.token;

  // 2.1 Duplicate Mobile Registration Guardrail
  const dupRegRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'Duplicate Sharma',
      mobile: mobileA,
      password: passA,
      confirm_password: passA
    }
  });
  assert(dupRegRes.status === 409, 'Duplicate mobile number registration rejected with HTTP 409');
  assert(dupRegRes.data?.message === 'An account with this mobile number already exists.',
    `Duplicate message matches exact string: "${dupRegRes.data?.message}"`);

  // 3. Parent A: Profile Setup ("Complete Your Profile")
  console.log('\n📝 3. Testing Parent A: Profile Setup & Linked Student...');
  const setupARes = await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokenA}` },
    body: {
      parent_name: 'Priya Sharma',
      relationship: 'Mother',
      email: `priya.${timestamp}@example.com`,
      address: '15 Gandhi Nagar, Coimbatore, TN',
      student_name: 'John Doe',
      student_reg_no: '21CS042',
      hostel_block: 'Block A',
      room_no: 'A-304'
    }
  });
  assert(setupARes.status === 200, 'Parent A profile saved to database via PUT /api/parent/profile');

  // Verify Parent A Overview
  const overviewARes = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(overviewARes.status === 200, 'Parent A overview loaded successfully');
  assert(overviewARes.data?.parent?.fatherName === 'Priya Sharma', 'Parent A name verified in MySQL: Priya Sharma');
  assert(overviewARes.data?.parent?.phone === mobileA, `Parent A phone verified: ${mobileA}`);
  assert(overviewARes.data?.linkedStudent?.name === 'John Doe', 'Parent A ward linked: John Doe');
  assert(overviewARes.data?.linkedStudent?.regNo === '21CS042', 'Parent A ward roll no: 21CS042');

  // 4. Parent A: Logout & Next-Time Login
  console.log('\n🔄 4. Testing Parent A: Logout and Next-Time Login...');
  // 4.1 Wrong password test
  const wrongPassLoginRes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: mobileA, password: 'WrongPassword@999', role: 'parent' }
  });
  assert(wrongPassLoginRes.status === 401, 'Wrong password rejected with HTTP 401');
  assert(wrongPassLoginRes.data?.message === 'Invalid mobile number or password.',
    `Wrong password message: "${wrongPassLoginRes.data?.message}"`);

  // 4.2 Correct credentials login
  const loginARes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: mobileA, password: passA, role: 'parent' }
  });
  assert(loginARes.status === 200, 'Parent A next-time login successful');
  assert(Boolean(loginARes.data?.token), 'Parent A received authenticated JWT token');
  const tokenA2 = loginARes.data?.token;

  const overviewA2Res = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${tokenA2}` }
  });
  assert(overviewA2Res.data?.parent?.fatherName === 'Priya Sharma', 'Existing Parent A dashboard loads correctly on re-login');

  // 5. Parent B: Separate Real Account Registration & Data Isolation
  console.log('\n👥 5. Testing Parent B: Second Real Account & Data Isolation...');
  const regBRes = await req('/api/auth/register-parent', {
    method: 'POST',
    body: {
      parent_name: 'David Wilson',
      mobile: mobileB,
      password: passB,
      confirm_password: passB
    }
  });
  assert(regBRes.status === 201, `Parent B registered with distinct mobile (${mobileB})`);
  const tokenB = regBRes.data?.token;

  // Setup Parent B Profile for Alex Smith (21ME018)
  const setupBRes = await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokenB}` },
    body: {
      parent_name: 'David Wilson',
      relationship: 'Father',
      email: `david.${timestamp}@example.com`,
      address: '88 Lake View Road, Bangalore, KA',
      student_name: 'Alex Smith',
      student_reg_no: '21ME018',
      hostel_block: 'Block B',
      room_no: 'B-201'
    }
  });
  assert(setupBRes.status === 200, 'Parent B profile saved to database');

  // Verify Parent B Data Isolation
  const overviewBRes = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert(overviewBRes.data?.parent?.fatherName === 'David Wilson', 'Parent B sees only Parent B name: David Wilson');
  assert(overviewBRes.data?.parent?.phone === mobileB, `Parent B sees only Parent B phone: ${mobileB}`);
  assert(overviewBRes.data?.linkedStudent?.name === 'Alex Smith', 'Parent B sees only Parent B ward: Alex Smith');
  assert(overviewBRes.data?.linkedStudent?.regNo === '21ME018', 'Parent B sees only Parent B roll no: 21ME018');

  // Verify Parent A still sees only Parent A's data (strictly isolated)
  const overviewARecheck = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(overviewARecheck.data?.parent?.fatherName === 'Priya Sharma', 'Parent A data remains isolated: Priya Sharma');
  assert(overviewARecheck.data?.linkedStudent?.name === 'John Doe', 'Parent A ward remains isolated: John Doe');

  // 6. Verify Other Roles Are 100% Unaffected
  console.log('\n🔒 6. Verifying Other 6 Roles Remain Fully Functional...');
  const stuRes = await req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } });
  const wrdRes = await req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } });
  const advRes = await req('/api/auth/login', { method: 'POST', body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' } });
  const prcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'PRC-001', password: 'Password@123', role: 'principal' } });
  const ctkRes = await req('/api/auth/login', { method: 'POST', body: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' } });
  const wtcRes = await req('/api/auth/login', { method: 'POST', body: { username: 'GAT-401', password: 'Password@123', role: 'watchman' } });

  assert(stuRes.status === 200, 'Student login intact (21CS042)');
  assert(wrdRes.status === 200, 'Warden login intact (WRD-101)');
  assert(advRes.status === 200, 'Class Advisor login intact (ADV-204)');
  assert(prcRes.status === 200, 'Principal login intact (PRC-001)');
  assert(ctkRes.status === 200, 'Caretaker login intact (CTK-305)');
  assert(wtcRes.status === 200, 'Watchman login intact (GAT-401)');

  // 7. Cleanup / Restore Default Demo Parent (9876543210) Linkage
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

  console.log('\n========================================================');
  console.log(`🏁 REAL PARENT REGISTRATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
