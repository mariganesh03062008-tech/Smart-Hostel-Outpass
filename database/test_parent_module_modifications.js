/**
 * Test Suite for Parent Module Modifications
 * Covers: Mobile Login, Biometric Registration, Profile Management, Multi-Step Approval with Message, and Guardrails
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

async function run() {
  console.log('🚀 ========================================================');
  console.log('🧪 PARENT MODULE MODIFICATION TEST SUITE');
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

  // 1. Parent Mobile Number Login / Account Verification
  console.log('📱 1. Testing Parent Mobile Account Login & Verification...');
  const parRes = await req('/api/auth/login', {
    method: 'POST',
    body: { username: '9876543210', password: 'Password@123', role: 'parent' }
  });
  assert(parRes.status === 200, 'Parent logged in with mobile number (9876543210)');
  const parentToken = parRes.data?.token;
  assert(Boolean(parentToken), 'JWT token issued for Parent');

  // Authenticate other actors for workflow verification
  const stuRes = await req('/api/auth/login', { method: 'POST', body: { username: '21CS042', password: 'Password@123', role: 'student' } });
  const wrdRes = await req('/api/auth/login', { method: 'POST', body: { username: 'WRD-101', password: 'Password@123', role: 'warden' } });
  const studentToken = stuRes.data?.token;
  const wardenToken = wrdRes.data?.token;

  // 2. Fingerprint Registration
  console.log('\n🔒 2. Testing Biometric Fingerprint Registration...');
  const newTemplateId = `FP-PAR-TEST-${Date.now()}`;
  const regFpRes = await req('/api/parent/register-fingerprint', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { template_id: newTemplateId }
  });
  assert(regFpRes.status === 200, 'Fingerprint enrolled successfully (Template: ' + newTemplateId + ')');

  // 3. Parent Profile Update
  console.log('\n👤 3. Testing Parent Profile Update...');
  const profUpdateRes = await req('/api/parent/profile', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: {
      father_name: 'Robert Doe Sr',
      email: 'robert.parent@example.com',
      address: '77 Ocean Drive, Chennai, TN',
      relationship: 'Father'
    }
  });
  assert(profUpdateRes.status === 200, 'Parent profile updated via PUT /api/parent/profile');

  // Verify Overview reflects profile
  const overviewRes = await req('/api/parent/overview', {
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(overviewRes.status === 200, 'GET /api/parent/overview returns HTTP 200');
  assert(overviewRes.data?.parent?.fatherName === 'Robert Doe Sr', 'Updated father_name persisted in database');
  assert(overviewRes.data?.linkedStudent?.name === 'John Doe', 'Linked student correctly identified as John Doe');

  // 4. Student Leave Request Submission & Queueing
  console.log('\n📝 4. Testing Student Leave Request Submission...');
  const now = new Date();
  const leave = new Date(now.getTime() - 5 * 60000);
  const ret = new Date(now.getTime() + 6 * 3600000);

  const createReqRes = await req('/api/outpass', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentToken}` },
    body: {
      request_type: 'normal',
      destination: 'Family Residence',
      reason: 'Weekend Home Visit',
      leaving_date: formatLocalDate(leave),
      leaving_time: formatLocalTime(leave),
      expected_return_date: formatLocalDate(ret),
      expected_return_time: formatLocalTime(ret),
      student_phone: '9876543210'
    }
  });
  const outpassId = createReqRes.data?.data?.id;
  assert(createReqRes.status === 201, 'Student created Normal Outpass (ID: ' + outpassId + ')');

  // 5. Parent Receives Request in Pending Queue
  console.log('\n📥 5. Testing Parent Pending Queue Retrieval...');
  const pendingRes = await req('/api/parent/outpass/pending', {
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(pendingRes.status === 200, 'GET /api/parent/outpass/pending returns HTTP 200');
  const foundReq = pendingRes.data?.pendingRequests?.find(r => r.id === outpassId);
  assert(Boolean(foundReq), 'Outpass request ' + outpassId + ' is present in Parent pending queue');

  // 6. Fingerprint Verification (Step 6)
  console.log('\n👆 6. Testing Fingerprint Verification for Approval...');
  const verifyRes = await req('/api/parent/biometric-verify', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { mock_fingerprint_id: newTemplateId }
  });
  assert(verifyRes.status === 200, 'Fingerprint biometric verification succeeded');

  // 7. Submit Approval with Parent Message (English / Tamil Unicode)
  console.log('\n💬 7. Testing Parent Approval with Multilingual Message...');
  const tamilMessage = 'அனுமதிக்கப்பட்டது. பத்திரமாக சென்று வரவும். (Approved with father consent)';
  const approveRes = await req(`/api/parent/outpass/${outpassId}/approve`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${parentToken}` },
    body: { parent_message: tamilMessage }
  });
  assert(approveRes.status === 200, 'Parent approved request with Tamil message');
  assert(approveRes.data?.data?.status === 'PENDING_WARDEN', 'Outpass status transitioned to PENDING_WARDEN');

  // Verify message recorded in parent_messages
  const msgRes = await req('/api/parent/messages', {
    headers: { 'Authorization': `Bearer ${parentToken}` }
  });
  assert(msgRes.status === 200, 'GET /api/parent/messages returns HTTP 200');
  const foundMsg = msgRes.data?.messages?.find(m => m.outpassRequestId === outpassId);
  assert(Boolean(foundMsg), 'Parent approval message was recorded in parent_messages table');

  // 8. Warden Receives Forwarded Outpass
  console.log('\n🛡️ 8. Testing Warden Queue for Forwarded Outpass...');
  const wardenQueueRes = await req('/api/outpass/warden/pending', {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  assert(wardenQueueRes.status === 200, 'GET /api/outpass/warden/pending returns HTTP 200 for Warden');
  const wardenReq = (wardenQueueRes.data?.data || wardenQueueRes.data?.pendingRequests || []).find(r => r.id === outpassId);
  assert(Boolean(wardenReq), 'Warden received parent-approved outpass in pending queue');

  console.log('\n========================================================');
  console.log(`🏁 PARENT MODULE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
