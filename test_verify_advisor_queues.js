const jwt = require('jsonwebtoken');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const JWT_SECRET = process.env.JWT_SECRET || 'smart_hostel_outpass_secure_jwt_secret_key_2026';

async function testAdvisorQueue() {
  console.log('Testing Advisor Queue API for Advisor 3 (ADV-204)...');
  
  // Create valid JWT for Advisor 3
  const token = jwt.sign(
    { id: 3, role: 'class_advisor', department: 'Computer Science & Engineering', staffId: 'ADV-204' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const headers = { Authorization: `Bearer ${token}` };

  // 1. Advisor Overview
  const ovRes = await fetch(`${BASE_URL}/api/outpass/advisor/overview`, { headers }).then(r => r.json());
  console.log('Overview Stats:', ovRes.stats);

  // 2. Advisor Duty Pending
  const dutyRes = await fetch(`${BASE_URL}/api/advisor/duty/pending`, { headers }).then(r => r.json());
  console.log(`Duty Pending Count: ${dutyRes.count}`);
  const duty1804 = dutyRes.requests?.find(r => r.id === 1804);
  console.log('Request 1804 found in Duty Pending:', duty1804 ? 'YES' : 'NO', duty1804?.requestCode);

  // 3. Advisor Special Pending
  const specialRes = await fetch(`${BASE_URL}/api/advisor/special/pending`, { headers }).then(r => r.json());
  console.log(`Special Pending Count: ${specialRes.count}`);
  const spc1805 = specialRes.requests?.find(r => r.id === 1805);
  console.log('Request 1805 found in Special Pending:', spc1805 ? 'YES' : 'NO', spc1805?.requestCode);

  // 4. Combined Advisor Pending
  const combRes = await fetch(`${BASE_URL}/api/outpass/advisor/pending`, { headers }).then(r => r.json());
  console.log(`Combined Pending Count: ${combRes.count}`);
  console.log(`Pending Duty: ${combRes.pendingDutyRequests?.length}, Pending Special: ${combRes.pendingSpecialRequests?.length}`);

  if (duty1804 && spc1805) {
    console.log(' SUCCESS: Both One-Day Duty and Special Outpass requests appear in Advisor Dashboard queues!');
  } else {
    console.error(' FAILED: Requests missing from Advisor queues');
    process.exit(1);
  }
}

testAdvisorQueue().catch(err => {
  console.error('Test error:', err.response?.data || err.message);
  process.exit(1);
});
