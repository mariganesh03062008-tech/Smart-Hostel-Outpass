/**
 * Smart Hostel Outpass Management System
 * Comprehensive Advance Application Time Constraints & Duration Independence Test Suite
 *
 * Requirements:
 * 1. NORMAL OUTPASS:
 *    - Student must submit at least 10 HOURS BEFORE selected DEPARTURE TIME.
 *    - submissionTime <= departureTime - 10 hours => ALLOW
 *    - submissionTime > departureTime - 10 hours  => BLOCK
 *      ("Normal outpass must be applied at least 10 hours before the departure time.")
 * 2. ONE-DAY DUTY OUTPASS:
 *    - Student must submit at least 6 HOURS BEFORE selected DEPARTURE TIME.
 *    - submissionTime <= departureTime - 6 hours => ALLOW
 *    - submissionTime > departureTime - 6 hours  => BLOCK
 *      ("One-Day Duty outpass must be applied at least 6 hours before the departure time.")
 * 3. DURATION INDEPENDENCE:
 *    - Outpass duration (departure -> return) is completely independent of advance notice.
 *    - Normal Outpass with 18h, 20h, 24h duration must PASS if applied >= 10h in advance.
 *    - One-Day Duty Outpass with 12h, 18h duration must PASS if applied >= 6h in advance.
 * 4. MIDNIGHT CROSSINGS:
 *    - Dates crossing midnight boundary (e.g. 10:00 PM to 8:00 AM / 4:00 AM) handled accurately.
 * 5. EMERGENCY & SPECIAL:
 *    - Emergency (0h immediate) & Special exempt from advance notice restriction.
 */

const http = require('http');
const assert = require('assert');
const { pool } = require('../utils/db');
const {
  validateAdvanceSubmissionTime,
  NORMAL_ADVANCE_HOURS,
  ONE_DAY_DUTY_ADVANCE_HOURS
} = require('../utils/timeValidator');

const BASE_URL = 'http://localhost:5001';

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

const pad = n => String(n).padStart(2, '0');

function formatYMD(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatHM(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('🚀 ADVANCE APPLICATION TIME & DURATION INDEPENDENCE TEST SUITE');
  console.log('======================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function recordPass(name) {
    passedTests++;
    totalTests++;
    console.log(`  ✅ [PASS] ${name}`);
  }

  function recordFail(name, err) {
    totalTests++;
    console.error(`  ❌ [FAIL] ${name}:`, err.message || err);
  }

  try {
    // ------------------------------------------------------------------
    // SECTION 1: Pure Mathematical & Boundary Unit Tests
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 1: Pure Unit Tests on validateAdvanceSubmissionTime ---');

    // Verify constants
    assert.strictEqual(NORMAL_ADVANCE_HOURS, 10, 'Constant NORMAL_ADVANCE_HOURS must be 10');
    assert.strictEqual(ONE_DAY_DUTY_ADVANCE_HOURS, 6, 'Constant ONE_DAY_DUTY_ADVANCE_HOURS must be 6');
    recordPass('Constants: NORMAL_ADVANCE_HOURS === 10 and ONE_DAY_DUTY_ADVANCE_HOURS === 6');

    const fixedBase = new Date('2026-09-15T12:00:00.000Z');

    // NORMAL OUTPASS (Boundary = 10 hours)
    // 1. Exactly 10 hours before departure -> ALLOW
    const norm10hExact = new Date(fixedBase.getTime() + 10 * 3600 * 1000);
    const r1 = validateAdvanceSubmissionTime('normal', norm10hExact, fixedBase);
    assert.strictEqual(r1.allowed, true, 'Normal exactly 10 hours before departure must be ALLOWED');
    assert.strictEqual(r1.required_hours, 10, 'Normal required_hours must be 10');
    recordPass('Normal Unit: Exactly 10 hours before departure => ALLOW');

    // 2. 10 hours + 1 minute before departure -> ALLOW
    const norm10h01m = new Date(fixedBase.getTime() + (10 * 3600 + 60) * 1000);
    const r2 = validateAdvanceSubmissionTime('normal', norm10h01m, fixedBase);
    assert.strictEqual(r2.allowed, true, 'Normal 10h + 1m before departure must be ALLOWED');
    recordPass('Normal Unit: 10 hours + 1 minute before departure => ALLOW');

    // 3. 9 hours 59 minutes before departure -> BLOCK
    const norm9h59m = new Date(fixedBase.getTime() + (10 * 3600 - 60) * 1000);
    const r3 = validateAdvanceSubmissionTime('normal', norm9h59m, fixedBase);
    assert.strictEqual(r3.allowed, false, 'Normal 9h 59m before departure must be BLOCKED');
    assert.strictEqual(r3.code, 'ADVANCE_TIME_LIMIT', 'Error code must be ADVANCE_TIME_LIMIT');
    assert.strictEqual(
      r3.message,
      'Normal outpass must be applied at least 10 hours before the departure time.',
      'Exact error message on 9h 59m block'
    );
    recordPass('Normal Unit: 9 hours 59 minutes before departure => BLOCK with exact message');

    // 4. 10 hours 1 second before departure -> ALLOW
    const norm10h01s = new Date(fixedBase.getTime() + (10 * 3600 + 1) * 1000);
    const r4 = validateAdvanceSubmissionTime('normal', norm10h01s, fixedBase);
    assert.strictEqual(r4.allowed, true, 'Normal 10h + 1s before departure must be ALLOWED');
    recordPass('Normal Unit: 10 hours + 1 second before departure => ALLOW');

    // 5. 9 hours 59 minutes 59 seconds before departure -> BLOCK
    const norm9h59m59s = new Date(fixedBase.getTime() + (10 * 3600 - 1) * 1000);
    const r5 = validateAdvanceSubmissionTime('normal', norm9h59m59s, fixedBase);
    assert.strictEqual(r5.allowed, false, 'Normal 9h 59m 59s before departure must be BLOCKED');
    recordPass('Normal Unit: 09:59:59 before departure => BLOCK');

    // ONE-DAY DUTY OUTPASS (Boundary = 6 hours)
    // 1. Exactly 6 hours before departure -> ALLOW
    const duty6hExact = new Date(fixedBase.getTime() + 6 * 3600 * 1000);
    const rd1 = validateAdvanceSubmissionTime('one_day_duty', duty6hExact, fixedBase);
    assert.strictEqual(rd1.allowed, true, 'Duty exactly 6 hours before departure must be ALLOWED');
    assert.strictEqual(rd1.required_hours, 6, 'Duty required_hours must be 6');
    recordPass('One-Day Duty Unit: Exactly 6 hours before departure => ALLOW');

    // 2. 6 hours + 1 minute before departure -> ALLOW
    const duty6h01m = new Date(fixedBase.getTime() + (6 * 3600 + 60) * 1000);
    const rd2 = validateAdvanceSubmissionTime('one_day_duty', duty6h01m, fixedBase);
    assert.strictEqual(rd2.allowed, true, 'Duty 6h + 1m before departure must be ALLOWED');
    recordPass('One-Day Duty Unit: 6 hours + 1 minute before departure => ALLOW');

    // 3. 5 hours 59 minutes before departure -> BLOCK
    const duty5h59m = new Date(fixedBase.getTime() + (6 * 3600 - 60) * 1000);
    const rd3 = validateAdvanceSubmissionTime('one_day_duty', duty5h59m, fixedBase);
    assert.strictEqual(rd3.allowed, false, 'Duty 5h 59m before departure must be BLOCKED');
    assert.strictEqual(rd3.code, 'ADVANCE_TIME_LIMIT', 'Error code must be ADVANCE_TIME_LIMIT');
    assert.strictEqual(
      rd3.message,
      'One-Day Duty outpass must be applied at least 6 hours before the departure time.',
      'Exact error message on 5h 59m block'
    );
    recordPass('One-Day Duty Unit: 5 hours 59 minutes before departure => BLOCK with exact message');

    // 4. 6 hours + 1 second before departure -> ALLOW
    const duty6h01s = new Date(fixedBase.getTime() + (6 * 3600 + 1) * 1000);
    const rd4 = validateAdvanceSubmissionTime('duty', duty6h01s, fixedBase);
    assert.strictEqual(rd4.allowed, true, 'Duty 6h + 1s before departure must be ALLOWED');
    recordPass('One-Day Duty Unit: 6 hours + 1 second before departure => ALLOW');

    // 5. 5 hours 59 minutes 59 seconds before departure -> BLOCK
    const duty5h59m59s = new Date(fixedBase.getTime() + (6 * 3600 - 1) * 1000);
    const rd5 = validateAdvanceSubmissionTime('one_day_duty', duty5h59m59s, fixedBase);
    assert.strictEqual(rd5.allowed, false, 'Duty 5h 59m 59s before departure must be BLOCKED');
    recordPass('One-Day Duty Unit: 05:59:59 before departure => BLOCK');

    // EMERGENCY & SPECIAL (Exempt)
    const emgImm = validateAdvanceSubmissionTime('emergency', new Date(fixedBase.getTime() + 1000), fixedBase);
    assert.strictEqual(emgImm.allowed, true, 'Emergency exempt from advance notice');
    recordPass('Emergency Unit: Immediate departure => ALLOW (Exempt)');

    const specImm = validateAdvanceSubmissionTime('special', new Date(fixedBase.getTime() + 1000), fixedBase);
    assert.strictEqual(specImm.allowed, true, 'Special exempt from advance notice');
    recordPass('Special Unit: Immediate departure => ALLOW (Exempt)');

    // ------------------------------------------------------------------
    // SECTION 2: Midnight / Date Edge Cases (Pure Unit)
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 2: Midnight & Date Edge Cases ---');

    // Current: Monday 10:00 PM (2026-09-14 22:00:00)
    const mondayNight = new Date('2026-09-14T22:00:00.000Z');

    // Normal departure: Tuesday 8:00 AM (2026-09-15 08:00:00) -> 10 hours => ALLOW
    const tuesday8am = new Date('2026-09-15T08:00:00.000Z');
    const rMidNormAllow = validateAdvanceSubmissionTime('normal', tuesday8am, mondayNight);
    assert.strictEqual(rMidNormAllow.allowed, true, 'Midnight: Monday 22:00 to Tuesday 08:00 (10h) must be ALLOWED');
    recordPass('Midnight Edge Case: Normal Monday 10:00 PM -> Tuesday 8:00 AM (10h) => ALLOW');

    // Normal departure: Tuesday 7:59 AM (2026-09-15 07:59:00) -> 9h 59m => BLOCK
    const tuesday759am = new Date('2026-09-15T07:59:00.000Z');
    const rMidNormBlock = validateAdvanceSubmissionTime('normal', tuesday759am, mondayNight);
    assert.strictEqual(rMidNormBlock.allowed, false, 'Midnight: Monday 22:00 to Tuesday 07:59 (9h 59m) must be BLOCKED');
    assert.strictEqual(rMidNormBlock.message, 'Normal outpass must be applied at least 10 hours before the departure time.');
    recordPass('Midnight Edge Case: Normal Monday 10:00 PM -> Tuesday 7:59 AM (9h 59m) => BLOCK');

    // One-Day Duty: Monday 10:00 PM -> Tuesday 4:00 AM (6 hours) => ALLOW
    const tuesday4am = new Date('2026-09-15T04:00:00.000Z');
    const rMidDutyAllow = validateAdvanceSubmissionTime('one_day_duty', tuesday4am, mondayNight);
    assert.strictEqual(rMidDutyAllow.allowed, true, 'Midnight: Monday 22:00 to Tuesday 04:00 (6h) must be ALLOWED');
    recordPass('Midnight Edge Case: One-Day Duty Monday 10:00 PM -> Tuesday 4:00 AM (6h) => ALLOW');

    // One-Day Duty: Monday 10:00 PM -> Tuesday 3:59 AM (5h 59m) => BLOCK
    const tuesday359am = new Date('2026-09-15T03:59:00.000Z');
    const rMidDutyBlock = validateAdvanceSubmissionTime('one_day_duty', tuesday359am, mondayNight);
    assert.strictEqual(rMidDutyBlock.allowed, false, 'Midnight: Monday 22:00 to Tuesday 03:59 (5h 59m) must be BLOCKED');
    assert.strictEqual(rMidDutyBlock.message, 'One-Day Duty outpass must be applied at least 6 hours before the departure time.');
    recordPass('Midnight Edge Case: One-Day Duty Monday 10:00 PM -> Tuesday 3:59 AM (5h 59m) => BLOCK');

    // ------------------------------------------------------------------
    // SECTION 3: HTTP API Live Integration Tests on Running Server
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 3: HTTP API Live Submission & Boundary Tests (Port 5001) ---');

    // Login student to get auth token
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { username: '21CS042', password: 'Password@123', role: 'student' }
    });
    assert.strictEqual(loginRes.status, 200, 'Student login should succeed');
    const studentToken = (loginRes.data && loginRes.data.data && loginRes.data.data.token) || (loginRes.data && loginRes.data.token);
    assert(studentToken, 'Student JWT token must be returned');
    recordPass('Student Authentication via HTTP (21CS042)');

    const authHeaders = { 'Authorization': `Bearer ${studentToken}` };

    // --- NORMAL OUTPASS HTTP TESTS ---
    // Test N1: Advance = 10h + 5m (ALLOW) with Return = departure + 18 hours (Duration Independence!)
    const now = new Date();
    const depN1 = new Date(now.getTime() + (10 * 3600 + 300) * 1000); // 10h 5m advance
    const retN1 = new Date(depN1.getTime() + 18 * 3600 * 1000);       // 18h duration!
    const resN1 = await makeRequest('/api/outpass', {
      method: 'POST',
      headers: authHeaders,
      body: {
        request_type: 'normal',
        destination: 'Home City',
        reason: 'Weekend leave with duration test',
        student_phone: '9876543210',
        leaving_date: formatYMD(depN1),
        leaving_time: formatHM(depN1),
        expected_return_date: formatYMD(retN1),
        expected_return_time: formatHM(retN1)
      }
    });
    assert.strictEqual(resN1.status, 201, 'Normal outpass submitted >10h in advance must SUCCEED (HTTP 201)');
    assert.strictEqual(resN1.data.success, true);
    recordPass('HTTP Normal: Advance >= 10h with 18h duration => PASS (HTTP 201)');

    // Test N2: Advance = 10h + 24h with Return = departure + 24 hours (Duration Independence!)
    const depN2 = new Date(now.getTime() + 34 * 3600 * 1000); // 34h advance
    const retN2 = new Date(depN2.getTime() + 24 * 3600 * 1000); // 24h duration!
    const resN2 = await makeRequest('/api/outpass', {
      method: 'POST',
      headers: authHeaders,
      body: {
        request_type: 'normal',
        destination: 'Outstation Family Event',
        reason: 'Family wedding leave multi-day',
        student_phone: '9876543210',
        leaving_date: formatYMD(depN2),
        leaving_time: formatHM(depN2),
        expected_return_date: formatYMD(retN2),
        expected_return_time: formatHM(retN2)
      }
    });
    assert.strictEqual(resN2.status, 201, 'Normal outpass with 24h duration must SUCCEED (HTTP 201)');
    recordPass('HTTP Normal: Advance >= 10h with 24h duration => PASS (HTTP 201)');

    // Test N3: Advance = 9h 50m (BLOCK - less than 10 hours)
    const depN3 = new Date(now.getTime() + (10 * 3600 - 600) * 1000); // 9h 50m advance
    const retN3 = new Date(depN3.getTime() + 4 * 3600 * 1000);
    const resN3 = await makeRequest('/api/outpass', {
      method: 'POST',
      headers: authHeaders,
      body: {
        request_type: 'normal',
        destination: 'Local Market',
        reason: 'Errands',
        student_phone: '9876543210',
        leaving_date: formatYMD(depN3),
        leaving_time: formatHM(depN3),
        expected_return_date: formatYMD(retN3),
        expected_return_time: formatHM(retN3)
      }
    });
    assert.strictEqual(resN3.status, 400, 'Normal outpass submitted <10h in advance must FAIL (HTTP 400)');
    assert.strictEqual(resN3.data.code, 'ADVANCE_TIME_LIMIT');
    assert.strictEqual(
      resN3.data.message,
      'Normal outpass must be applied at least 10 hours before the departure time.'
    );
    recordPass('HTTP Normal: Advance < 10 hours => BLOCK (HTTP 400) with exact message');

    // --- ONE-DAY DUTY OUTPASS HTTP TESTS ---
    // Test D1: Advance = 6h + 5m (ALLOW) with Return = departure + 12 hours (Duration Independence!)
    const depD1 = new Date(now.getTime() + (6 * 3600 + 300) * 1000); // 6h 5m advance
    const retD1 = new Date(depD1.getTime() + 12 * 3600 * 1000);      // 12h duration!
    const resD1 = await makeRequest('/api/outpass', {
      method: 'POST',
      headers: authHeaders,
      body: {
        request_type: 'one_day_duty',
        destination: 'Engineering College',
        reason: 'Robotics Competition',
        student_phone: '9876543210',
        leaving_date: formatYMD(depD1),
        leaving_time: formatHM(depD1),
        expected_return_date: formatYMD(retD1),
        expected_return_time: formatHM(retD1),
        event_name: 'National Robotics Expo',
        event_location: 'Auditorium Hall',
        duty_date: formatYMD(depD1)
      }
    });
    assert.strictEqual(resD1.status, 201, 'Duty outpass submitted >= 6h in advance must SUCCEED (HTTP 201)');
    recordPass('HTTP One-Day Duty: Advance >= 6h with 12h duration => PASS (HTTP 201)');

    // Test D2: Advance = 6h + 10m (ALLOW) with Return = departure + 18 hours (Duration Independence!)
    const depD2 = new Date(now.getTime() + (6 * 3600 + 600) * 1000);
    const retD2 = new Date(depD2.getTime() + 18 * 3600 * 1000);      // 18h duration!
    const resD2 = await makeRequest('/api/outpass', {
      method: 'POST',
      headers: authHeaders,
      body: {
        request_type: 'one_day_duty',
        destination: 'Tech University',
        reason: '24-hour Hackathon',
        student_phone: '9876543210',
        leaving_date: formatYMD(depD2),
        leaving_time: formatHM(depD2),
        expected_return_date: formatYMD(retD2),
        expected_return_time: formatHM(retD2),
        event_name: 'HackAI 2026',
        event_location: 'Main Campus',
        duty_date: formatYMD(depD2)
      }
    });
    assert.strictEqual(resD2.status, 201, 'Duty outpass with 18h duration must SUCCEED (HTTP 201)');
    recordPass('HTTP One-Day Duty: Advance >= 6h with 18h duration => PASS (HTTP 201)');

    // Test D3: Advance = 5h 50m (BLOCK - less than 6 hours)
    const depD3 = new Date(now.getTime() + (6 * 3600 - 600) * 1000); // 5h 50m advance
    const retD3 = new Date(depD3.getTime() + 3 * 3600 * 1000);
    const resD3 = await makeRequest('/api/outpass', {
      method: 'POST',
      headers: authHeaders,
      body: {
        request_type: 'one_day_duty',
        destination: 'Seminar Hall',
        reason: 'Guest Lecture',
        student_phone: '9876543210',
        leaving_date: formatYMD(depD3),
        leaving_time: formatHM(depD3),
        expected_return_date: formatYMD(retD3),
        expected_return_time: formatHM(retD3),
        event_name: 'AI Seminar',
        event_location: 'Seminar Hall B',
        duty_date: formatYMD(depD3)
      }
    });
    assert.strictEqual(resD3.status, 400, 'Duty outpass submitted <6h in advance must FAIL (HTTP 400)');
    assert.strictEqual(resD3.data.code, 'ADVANCE_TIME_LIMIT');
    assert.strictEqual(
      resD3.data.message,
      'One-Day Duty outpass must be applied at least 6 hours before the departure time.'
    );
    recordPass('HTTP One-Day Duty: Advance < 6 hours => BLOCK (HTTP 400) with exact message');

    // Test Return <= Departure Guardrail (Still properly enforced)
    const depGuard = new Date(now.getTime() + 24 * 3600 * 1000);
    const retGuard = new Date(depGuard.getTime() - 3600 * 1000); // Return earlier than departure
    const resGuard = await makeRequest('/api/outpass', {
      method: 'POST',
      headers: authHeaders,
      body: {
        request_type: 'normal',
        destination: 'Home',
        reason: 'Chronology test',
        student_phone: '9876543210',
        leaving_date: formatYMD(depGuard),
        leaving_time: formatHM(depGuard),
        expected_return_date: formatYMD(retGuard),
        expected_return_time: formatHM(retGuard)
      }
    });
    assert.strictEqual(resGuard.status, 400, 'Return before departure must be rejected');
    assert.strictEqual(resGuard.data.message, 'Expected return date & time must be later than leaving date & time.');
    recordPass('HTTP Guardrail: Return time earlier than departure => REJECT (HTTP 400)');

    // ------------------------------------------------------------------
    // SECTION 4: Confirmation that 10h/6h are NOT Duration Limits
    // ------------------------------------------------------------------
    console.log('\n--- SECTION 4: Proof of Duration Independence ---');
    console.log('  Confirmed: Normal Outpass duration can be 18 hours (PASS)');
    console.log('  Confirmed: Normal Outpass duration can be 24 hours (PASS)');
    console.log('  Confirmed: One-Day Duty duration can be 12 hours (PASS)');
    console.log('  Confirmed: One-Day Duty duration can be 18 hours (PASS)');
    console.log('  Confirmed: 10h & 6h are strictly advance-application windows.');
    recordPass('Duration Independence: No 10-hour or 6-hour duration caps');

    console.log('\n======================================================================');
    console.log(`🏁 TEST SUITE FINISHED: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('======================================================================\n');

  } catch (err) {
    console.error('\n❌ UNEXPECTED TEST SUITE ERROR:', err);
    process.exit(1);
  } finally {
    pool.end();
  }
}

runTestSuite();
