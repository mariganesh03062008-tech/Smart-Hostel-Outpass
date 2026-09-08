/**
 * Smart Hostel Outpass Management System
 * Test Suite: Advance Request Time Validation
 *
 * Rules:
 *   Normal Outpass: >= 18 hours advance notice required
 *   One-Day Outpass / Duty: >= 12 hours advance notice required
 *
 * Test Scenarios:
 *   Normal:
 *     1. Exactly 18 hours before departure -> ALLOW (HTTP 201)
 *     2. More than 18 hours before departure (24h) -> ALLOW (HTTP 201)
 *     3. 17h 59m before departure -> BLOCK (HTTP 400, ADVANCE_TIME_LIMIT)
 *     4. 10 minutes before departure -> BLOCK (HTTP 400, ADVANCE_TIME_LIMIT)
 *     5. Same time as departure -> BLOCK (HTTP 400, ADVANCE_TIME_LIMIT)
 *     6. Past departure time -> BLOCK (HTTP 400, ADVANCE_TIME_LIMIT)
 *   One-Day Duty:
 *     7. Exactly 12 hours before departure -> ALLOW (HTTP 201)
 *     8. More than 12 hours before departure (16h) -> ALLOW (HTTP 201)
 *     9. 11h 59m before departure -> BLOCK (HTTP 400, ADVANCE_TIME_LIMIT)
 *     10. 10 minutes before departure -> BLOCK (HTTP 400, ADVANCE_TIME_LIMIT)
 *     11. Same time as departure -> BLOCK (HTTP 400, ADVANCE_TIME_LIMIT)
 *     12. Past departure time -> BLOCK (HTTP 400, ADVANCE_TIME_LIMIT)
 *   Invariants:
 *     - Blocked requests are NOT inserted into MySQL outpass_requests
 *     - Exact response format validation
 *     - Frontend DOM and script verification
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pool } = require('../utils/db');
const { validateAdvanceSubmissionTime, parseDateTime } = require('../utils/timeValidator');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
  }
}

function request(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const postData = options.body ? JSON.stringify(options.body) : null;
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 5001,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    if (postData) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function runTests() {
  console.log('======================================================================');
  console.log('⏰ RUNNING ADVANCE REQUEST TIME VALIDATION TEST SUITE');
  console.log('======================================================================\n');

  try {
    // ------------------------------------------------------------------
    // SECTION 1: Unit Tests on validateAdvanceSubmissionTime helper
    // ------------------------------------------------------------------
    console.log('--- Section 1: Helper Unit Tests (Mathematical Boundary Checks) ---');
    const fixedNow = new Date('2026-09-10T12:00:00.000Z');

    // Normal Outpass: 18h
    const norm18hExact = new Date(fixedNow.getTime() + 18 * 3600 * 1000);
    const resNorm18h = validateAdvanceSubmissionTime('normal', norm18hExact, fixedNow);
    assert(resNorm18h.allowed === true, 'Helper Unit: Normal exactly 18h allowed');
    assert(resNorm18h.required_hours === 18, 'Helper Unit: Normal required_hours is 18');

    const norm18hPlus = new Date(fixedNow.getTime() + 24 * 3600 * 1000);
    const resNormPlus = validateAdvanceSubmissionTime('normal', norm18hPlus, fixedNow);
    assert(resNormPlus.allowed === true, 'Helper Unit: Normal >18h allowed');

    const norm17h59m = new Date(fixedNow.getTime() + (18 * 3600 - 60) * 1000);
    const resNorm17h59 = validateAdvanceSubmissionTime('normal', norm17h59m, fixedNow);
    assert(resNorm17h59.allowed === false, 'Helper Unit: Normal 17h 59m blocked');
    assert(resNorm17h59.code === 'ADVANCE_TIME_LIMIT', 'Helper Unit: Code is ADVANCE_TIME_LIMIT');
    assert(resNorm17h59.message.includes('18 hours'), 'Helper Unit: Message mentions 18 hours');

    const norm10m = new Date(fixedNow.getTime() + 10 * 60 * 1000);
    const resNorm10m = validateAdvanceSubmissionTime('normal', norm10m, fixedNow);
    assert(resNorm10m.allowed === false, 'Helper Unit: Normal 10 mins blocked');

    const normSame = new Date(fixedNow.getTime());
    const resNormSame = validateAdvanceSubmissionTime('normal', normSame, fixedNow);
    assert(resNormSame.allowed === false, 'Helper Unit: Normal same time as departure blocked');

    const normPast = new Date(fixedNow.getTime() - 3600 * 1000);
    const resNormPast = validateAdvanceSubmissionTime('normal', normPast, fixedNow);
    assert(resNormPast.allowed === false, 'Helper Unit: Normal past departure blocked');

    // One-Day Duty: 12h
    const duty12hExact = new Date(fixedNow.getTime() + 12 * 3600 * 1000);
    const resDuty12h = validateAdvanceSubmissionTime('one_day_duty', duty12hExact, fixedNow);
    assert(resDuty12h.allowed === true, 'Helper Unit: One-Day exactly 12h allowed');
    assert(resDuty12h.required_hours === 12, 'Helper Unit: One-Day required_hours is 12');

    const duty16h = new Date(fixedNow.getTime() + 16 * 3600 * 1000);
    const resDuty16h = validateAdvanceSubmissionTime('one_day_duty', duty16h, fixedNow);
    assert(resDuty16h.allowed === true, 'Helper Unit: One-Day >12h allowed');

    const duty11h59m = new Date(fixedNow.getTime() + (12 * 3600 - 60) * 1000);
    const resDuty11h59 = validateAdvanceSubmissionTime('one_day_duty', duty11h59m, fixedNow);
    assert(resDuty11h59.allowed === false, 'Helper Unit: One-Day 11h 59m blocked');
    assert(resDuty11h59.code === 'ADVANCE_TIME_LIMIT', 'Helper Unit: Duty code is ADVANCE_TIME_LIMIT');
    assert(resDuty11h59.message.includes('12 hours'), 'Helper Unit: Duty message mentions 12 hours');

    const duty10m = new Date(fixedNow.getTime() + 10 * 60 * 1000);
    const resDuty10m = validateAdvanceSubmissionTime('one_day_duty', duty10m, fixedNow);
    assert(resDuty10m.allowed === false, 'Helper Unit: One-Day 10 mins blocked');

    const dutySame = new Date(fixedNow.getTime());
    const resDutySame = validateAdvanceSubmissionTime('one_day_duty', dutySame, fixedNow);
    assert(resDutySame.allowed === false, 'Helper Unit: One-Day same time blocked');

    const dutyPast = new Date(fixedNow.getTime() - 1000);
    const resDutyPast = validateAdvanceSubmissionTime('one_day_duty', dutyPast, fixedNow);
    assert(resDutyPast.allowed === false, 'Helper Unit: One-Day past departure blocked');

    // ------------------------------------------------------------------
    // SECTION 2: Student Authentication & Setup
    // ------------------------------------------------------------------
    console.log('\n--- Section 2: Student Authentication & Baseline Setup ---');
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: '21CS042', password: 'Password@123', role: 'student' }
    });
    assert(loginRes.status === 200 && Boolean(loginRes.data?.token), 'Student 21CS042 logged in successfully');
    const studentToken = loginRes.data?.token;

    // Set valid student location for outpass tests (mandated by location security guard)
    const locRes = await request('/api/outpass/student/location', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        latitude: 13.0827,
        longitude: 80.2707,
        accuracy: 10,
        captured_at: new Date().toISOString(),
        source: 'browser_gps'
      }
    });
    assert(locRes.status === 200 && locRes.data?.success, 'Student live location recorded successfully for advance time test');

    // Count initial outpass requests in DB
    const [initialRows] = await pool.query('SELECT COUNT(*) AS total FROM outpass_requests');
    const initialDbCount = Number(initialRows[0].total);
    const [maxIdRows] = await pool.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM outpass_requests');
    const maxIdBefore = Number(maxIdRows[0].maxId);

    // ------------------------------------------------------------------
    // SECTION 3: Rule 1 – Normal Outpass (18-Hour Rule) Integration Tests
    // ------------------------------------------------------------------
    console.log('\n--- Section 3: Normal Outpass (18-Hour Rule) API Tests ---');

    // Test 1: Exactly 18 hours before departure -> ALLOW
    // Add small 2-second buffer to guarantee server time doesn't tick into 17h 59m 59s during HTTP transit
    const dep18hServer = new Date(Date.now() + 18 * 3600 * 1000 + 3000);
    const ret18hServer = new Date(dep18hServer.getTime() + 6 * 3600 * 1000);
    const resCase1 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Home Town',
        reason: 'Weekend Visit',
        leaving_date: formatDate(dep18hServer),
        leaving_time: formatTime(dep18hServer),
        expected_return_date: formatDate(ret18hServer),
        expected_return_time: formatTime(ret18hServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase1.status === 201 && resCase1.data.success === true, 'Case 1: Exactly 18 hours before -> ALLOW (HTTP 201)');

    // Test 2: More than 18 hours before departure (24 hours) -> ALLOW
    const dep24hServer = new Date(Date.now() + 24 * 3600 * 1000);
    const ret24hServer = new Date(dep24hServer.getTime() + 6 * 3600 * 1000);
    const resCase2 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Parent House',
        reason: 'Family Event',
        leaving_date: formatDate(dep24hServer),
        leaving_time: formatTime(dep24hServer),
        expected_return_date: formatDate(ret24hServer),
        expected_return_time: formatTime(ret24hServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase2.status === 201 && resCase2.data.success === true, 'Case 2: More than 18 hours before (24h) -> ALLOW (HTTP 201)');

    // Record count of valid inserts so far (+2)
    const [afterAllowRows] = await pool.query('SELECT COUNT(*) AS total FROM outpass_requests');
    assert(Number(afterAllowRows[0].total) === initialDbCount + 2, 'Allowed requests successfully inserted into MySQL');

    // Test 3: 17h 59m before departure -> BLOCK
    const dep17h59mServer = new Date(Date.now() + (18 * 3600 - 60) * 1000);
    const ret17h59mServer = new Date(dep17h59mServer.getTime() + 4 * 3600 * 1000);
    const resCase3 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Market',
        reason: 'Shopping',
        leaving_date: formatDate(dep17h59mServer),
        leaving_time: formatTime(dep17h59mServer),
        expected_return_date: formatDate(ret17h59mServer),
        expected_return_time: formatTime(ret17h59mServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase3.status === 400, 'Case 3: 17h 59m before departure -> BLOCK (HTTP 400)');
    assert(resCase3.data?.code === 'ADVANCE_TIME_LIMIT', 'Case 3 Error code matches ADVANCE_TIME_LIMIT');
    assert(resCase3.data?.required_hours === 18, 'Case 3 required_hours is 18');
    assert(Boolean(resCase3.data?.departure_time), 'Case 3 returns departure_time');
    assert(Boolean(resCase3.data?.latest_submission_time), 'Case 3 returns latest_submission_time');
    assert(resCase3.data?.message === 'Normal outpass requests must be submitted at least 18 hours before the departure time.', 'Case 3 message matches specification');

    // Test 4: 10 minutes before departure -> BLOCK
    const dep10mServer = new Date(Date.now() + 10 * 60 * 1000);
    const ret10mServer = new Date(dep10mServer.getTime() + 2 * 3600 * 1000);
    const resCase4 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Bus Stand',
        reason: 'Personal',
        leaving_date: formatDate(dep10mServer),
        leaving_time: formatTime(dep10mServer),
        expected_return_date: formatDate(ret10mServer),
        expected_return_time: formatTime(ret10mServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase4.status === 400, 'Case 4: 10 minutes before departure -> BLOCK (HTTP 400)');
    assert(resCase4.data?.code === 'ADVANCE_TIME_LIMIT', 'Case 4 Error code matches ADVANCE_TIME_LIMIT');

    // Test 5: Same time as departure -> BLOCK
    const depSameServer = new Date(Date.now());
    const retSameServer = new Date(depSameServer.getTime() + 2 * 3600 * 1000);
    const resCase5 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Hospital',
        reason: 'Emergency Checkup',
        leaving_date: formatDate(depSameServer),
        leaving_time: formatTime(depSameServer),
        expected_return_date: formatDate(retSameServer),
        expected_return_time: formatTime(retSameServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase5.status === 400, 'Case 5: Same time as departure -> BLOCK (HTTP 400)');
    assert(resCase5.data?.code === 'ADVANCE_TIME_LIMIT', 'Case 5 Error code matches ADVANCE_TIME_LIMIT');

    // Test 6: Past departure time -> BLOCK
    const depPastServer = new Date(Date.now() - 3600 * 1000);
    const retPastServer = new Date(Date.now() + 3600 * 1000);
    const resCase6 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'normal',
        destination: 'Library',
        reason: 'Book Return',
        leaving_date: formatDate(depPastServer),
        leaving_time: formatTime(depPastServer),
        expected_return_date: formatDate(retPastServer),
        expected_return_time: formatTime(retPastServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase6.status === 400, 'Case 6: Past departure time -> BLOCK (HTTP 400)');
    assert(resCase6.data?.code === 'ADVANCE_TIME_LIMIT', 'Case 6 Error code matches ADVANCE_TIME_LIMIT');

    // ------------------------------------------------------------------
    // SECTION 4: Rule 2 – One-Day Outpass / Duty (12-Hour Rule) API Tests
    // ------------------------------------------------------------------
    console.log('\n--- Section 4: One-Day Outpass / Duty (12-Hour Rule) API Tests ---');

    // Test 7: Exactly 12 hours before departure -> ALLOW
    const dep12hServer = new Date(Date.now() + 12 * 3600 * 1000 + 3000);
    const ret12hServer = new Date(dep12hServer.getTime() + 4 * 3600 * 1000);
    const resCase7 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'one_day_duty',
        destination: 'Anna University, Chennai',
        reason: 'National Symposium Presentation',
        event_name: 'TechFest 2026',
        event_location: 'Main Auditorium',
        duty_date: formatDate(dep12hServer),
        leaving_date: formatDate(dep12hServer),
        leaving_time: formatTime(dep12hServer),
        expected_return_date: formatDate(ret12hServer),
        expected_return_time: formatTime(ret12hServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase7.status === 201 && resCase7.data.success === true, 'Case 7: Exactly 12 hours before -> ALLOW (HTTP 201)');

    // Test 8: More than 12 hours before departure (16 hours) -> ALLOW
    const dep16hServer = new Date(Date.now() + 16 * 3600 * 1000);
    const ret16hServer = new Date(dep16hServer.getTime() + 5 * 3600 * 1000);
    const resCase8 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'one_day_duty',
        destination: 'PSG Tech, Coimbatore',
        reason: 'Robotics Workshop',
        event_name: 'RoboQuest 2026',
        event_location: 'Mechanical Block Lab',
        duty_date: formatDate(dep16hServer),
        leaving_date: formatDate(dep16hServer),
        leaving_time: formatTime(dep16hServer),
        expected_return_date: formatDate(ret16hServer),
        expected_return_time: formatTime(ret16hServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase8.status === 201 && resCase8.data.success === true, 'Case 8: More than 12 hours before (16h) -> ALLOW (HTTP 201)');

    // Test 9: 11h 59m before departure -> BLOCK
    const dep11h59mServer = new Date(Date.now() + (12 * 3600 - 60) * 1000);
    const ret11h59mServer = new Date(dep11h59mServer.getTime() + 3 * 3600 * 1000);
    const resCase9 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'one_day_duty',
        destination: 'IIT Madras, Chennai',
        reason: 'Hackathon',
        event_name: 'CodeHack 2026',
        event_location: 'Research Park',
        duty_date: formatDate(dep11h59mServer),
        leaving_date: formatDate(dep11h59mServer),
        leaving_time: formatTime(dep11h59mServer),
        expected_return_date: formatDate(ret11h59mServer),
        expected_return_time: formatTime(ret11h59mServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase9.status === 400, 'Case 9: 11h 59m before departure -> BLOCK (HTTP 400)');
    assert(resCase9.data?.code === 'ADVANCE_TIME_LIMIT', 'Case 9 Error code matches ADVANCE_TIME_LIMIT');
    assert(resCase9.data?.required_hours === 12, 'Case 9 required_hours is 12');
    assert(resCase9.data?.message === 'One-Day outpass requests must be submitted at least 12 hours before the departure time.', 'Case 9 message matches specification');

    // Test 10: 10 minutes before departure -> BLOCK
    const depDuty10mServer = new Date(Date.now() + 10 * 60 * 1000);
    const retDuty10mServer = new Date(depDuty10mServer.getTime() + 2 * 3600 * 1000);
    const resCase10 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'one_day_duty',
        destination: 'Local College',
        reason: 'Symposium',
        event_name: 'Symposium',
        event_location: 'Seminar Hall',
        duty_date: formatDate(depDuty10mServer),
        leaving_date: formatDate(depDuty10mServer),
        leaving_time: formatTime(depDuty10mServer),
        expected_return_date: formatDate(retDuty10mServer),
        expected_return_time: formatTime(retDuty10mServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase10.status === 400, 'Case 10: 10 minutes before departure -> BLOCK (HTTP 400)');
    assert(resCase10.data?.code === 'ADVANCE_TIME_LIMIT', 'Case 10 Error code matches ADVANCE_TIME_LIMIT');

    // Test 11: Same time as departure -> BLOCK
    const depDutySameServer = new Date(Date.now());
    const retDutySameServer = new Date(depDutySameServer.getTime() + 2 * 3600 * 1000);
    const resCase11 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'one_day_duty',
        destination: 'Auditorium',
        reason: 'Cultural Rehearsal',
        event_name: 'Culturals',
        event_location: 'Auditorium',
        duty_date: formatDate(depDutySameServer),
        leaving_date: formatDate(depDutySameServer),
        leaving_time: formatTime(depDutySameServer),
        expected_return_date: formatDate(retDutySameServer),
        expected_return_time: formatTime(retDutySameServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase11.status === 400, 'Case 11: Same time as departure -> BLOCK (HTTP 400)');
    assert(resCase11.data?.code === 'ADVANCE_TIME_LIMIT', 'Case 11 Error code matches ADVANCE_TIME_LIMIT');

    // Test 12: Past departure time -> BLOCK
    const depDutyPastServer = new Date(Date.now() - 3600 * 1000);
    const retDutyPastServer = new Date(Date.now() + 3600 * 1000);
    const resCase12 = await request('/api/outpass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {
        request_type: 'one_day_duty',
        destination: 'Auditorium',
        reason: 'Past Event',
        event_name: 'Past Event',
        event_location: 'Hall',
        duty_date: formatDate(depDutyPastServer),
        leaving_date: formatDate(depDutyPastServer),
        leaving_time: formatTime(depDutyPastServer),
        expected_return_date: formatDate(retDutyPastServer),
        expected_return_time: formatTime(retDutyPastServer),
        student_phone: '9876543210'
      }
    });
    assert(resCase12.status === 400, 'Case 12: Past departure time -> BLOCK (HTTP 400)');
    assert(resCase12.data?.code === 'ADVANCE_TIME_LIMIT', 'Case 12 Error code matches ADVANCE_TIME_LIMIT');

    // ------------------------------------------------------------------
    // SECTION 5: Database Persistence & Invariant Verification
    // ------------------------------------------------------------------
    console.log('\n--- Section 5: Database Invariant & Security Verification ---');
    const [finalRows] = await pool.query('SELECT COUNT(*) AS total FROM outpass_requests');
    const finalDbCount = Number(finalRows[0].total);

    // Exactly 4 valid requests (Case 1, Case 2, Case 7, Case 8) should have been inserted into MySQL
    assert(finalDbCount === initialDbCount + 4, `DB Invariant: Exactly 4 valid passes inserted (${finalDbCount} = ${initialDbCount} + 4). Zero blocked requests in DB.`);

    // Confirm that no additional records exist beyond the 4 allowed passes
    const allowedIds = [
      resCase1.data?.data?.id,
      resCase2.data?.data?.id,
      resCase7.data?.data?.id,
      resCase8.data?.data?.id
    ].filter(Boolean);

    const [unexpectedRows] = await pool.query(
      'SELECT id FROM outpass_requests WHERE id > ? AND id NOT IN (?)',
      [maxIdBefore, allowedIds]
    );
    assert(unexpectedRows.length === 0, 'Security: Confirmed 0 blocked outpass records were inserted into MySQL');

    // ------------------------------------------------------------------
    // SECTION 6: Frontend File Integrity & DOM Structure
    // ------------------------------------------------------------------
    console.log('\n--- Section 6: Frontend UX Elements & Script Integrity ---');
    const htmlContent = fs.readFileSync(path.join(__dirname, '../public/student-dashboard.html'), 'utf8');
    const jsContent = fs.readFileSync(path.join(__dirname, '../public/js/student-dashboard.js'), 'utf8');

    assert(htmlContent.includes('id="advanceTimeNoticeBox"'), 'Frontend: advanceTimeNoticeBox exists in student-dashboard.html');
    assert(htmlContent.includes('id="advanceNoticeTitle"'), 'Frontend: advanceNoticeTitle exists in student-dashboard.html');
    assert(htmlContent.includes('id="advanceNoticeText"'), 'Frontend: advanceNoticeText exists in student-dashboard.html');
    assert(jsContent.includes('function checkAdvanceTimeValidity()'), 'Frontend: checkAdvanceTimeValidity function exists in student-dashboard.js');
    assert(jsContent.includes('Submission time expired'), 'Frontend: Expiration warning string exists in student-dashboard.js');
    assert(jsContent.includes('DOM.btnSubmitOutpass.disabled = true'), 'Frontend: Disables submit button when advance time window expired');
    assert(jsContent.includes('DOM.btnSubmitOutpass.disabled = false'), 'Frontend: Enables submit button when advance time window valid');

  } catch (err) {
    console.error('Unhandled test exception:', err);
    failedCount++;
  } finally {
    console.log('\n======================================================================');
    console.log(`🏁 ADVANCE TIME VALIDATION TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('======================================================================\n');
    await pool.end();
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runTests();
