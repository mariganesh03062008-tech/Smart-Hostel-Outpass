/**
 * Comprehensive Automated Security Test Suite
 * Smart Hostel Outpass Management System
 * Uses Node.js native fetch
 */

require('dotenv').config();
const { pool } = require('../utils/db');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5001';

const credentials = {
  student: { username: '21CS042', password: 'Password@123', role: 'student' },
  student2: { username: '21ME018', password: 'Password@123', role: 'student' },
  parent: { username: '9876543210', password: 'Password@123', role: 'parent' },
  advisor: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' },
  warden: { username: 'WRD-101', password: 'Password@123', role: 'warden' },
  principal: { username: 'PRC-001', password: 'Password@123', role: 'principal' },
  caretaker: { username: 'CTK-305', password: 'Password@123', role: 'caretaker' },
  watchman: { username: 'GAT-401', password: 'Password@123', role: 'watchman' }
};

const tokens = {};
let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS]: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL]: ${message}`);
    failedCount++;
  }
}

async function request(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  return {
    status: res.status,
    ok: res.ok,
    data
  };
}

async function login(roleKey) {
  const cred = credentials[roleKey];
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: cred.username,
      password: cred.password,
      role: cred.role
    })
  });
  if (res.data && res.data.token) {
    tokens[roleKey] = res.data.token;
  }
  return res;
}

function authHeaders(roleKey) {
  return {
    headers: { Authorization: `Bearer ${tokens[roleKey]}` }
  };
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

async function runSecurityTests() {
  console.log('\n🔒 ========================================================');
  console.log('🛡️  SMART HOSTEL OUTPASS SYSTEM - COMPREHENSIVE SECURITY AUDIT');
  console.log('🔒 ========================================================\n');

  try {
    // ----------------------------------------------------
    // TEST 1: AUTHENTICATION & CREDENTIAL SECURITY (ALL 7 ROLES)
    // ----------------------------------------------------
    console.log('🔑 TEST 1: Authentication & Credential Security (All 7 Roles)');

    // 1.1 Login for all 7 roles
    const mainRoles = ['student', 'parent', 'advisor', 'warden', 'principal', 'caretaker', 'watchman'];
    for (const key of mainRoles) {
      const res = await login(key);
      assert(res.status === 200 && res.data.token, `Role [${key.toUpperCase()}] authenticated successfully with JWT (HTTP 200)`);
      assert(res.data.user && !res.data.user.password_hash && !res.data.user.password, `Role [${key.toUpperCase()}] response NEVER leaks password_hash`);
    }
    // Also login student2
    await login('student2');

    // 1.2 Reject invalid password
    const badPassRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: credentials.student.username,
        password: 'WrongPassword999!',
        role: 'student'
      })
    });
    assert(badPassRes.status === 401, 'Invalid password rejected with HTTP 401');

    // 1.3 Reject wrong role
    const badRoleRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: credentials.student.username,
        password: credentials.student.password,
        role: 'warden' // student trying to login as warden
      })
    });
    assert(badRoleRes.status === 401, 'Role mismatch rejected with HTTP 401');

    // 1.4 Reject missing credentials
    const emptyCredRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '', password: '', role: 'student' })
    });
    assert(emptyCredRes.status === 400, 'Missing credentials rejected with HTTP 400');

    // 1.5 Reject tampered JWT token
    const tamperedRes = await request('/api/student/active-outpass', {
      headers: { Authorization: `Bearer ${tokens.student}_tampered_signature` }
    });
    assert(tamperedRes.status === 403 || tamperedRes.status === 401, 'Tampered token rejected with HTTP 403/401');

    // 1.6 Reject missing token on protected route
    const unauthRes = await request('/api/outpass/warden/overview');
    assert(unauthRes.status === 401, 'Unauthenticated request rejected with HTTP 401');

    // ----------------------------------------------------
    // TEST 2: ROLE-BASED ROUTE PROTECTION (RBAC)
    // ----------------------------------------------------
    console.log('\n🚫 TEST 2: Role-Based Route Protection (RBAC Matrix)');

    // 2.1 Student blocked from Staff endpoints
    const s1Wrd = await request('/api/outpass/warden/overview', authHeaders('student'));
    assert(s1Wrd.status === 403, 'Student blocked from Warden API (HTTP 403)');

    const s1Prc = await request('/api/principal/overview', authHeaders('student'));
    assert(s1Prc.status === 403, 'Student blocked from Principal API (HTTP 403)');

    const s1Adv = await request('/api/advisor/overview', authHeaders('student'));
    assert(s1Adv.status === 403, 'Student blocked from Advisor API (HTTP 403)');

    const s1Ctk = await request('/api/caretaker/overview', authHeaders('student'));
    assert(s1Ctk.status === 403, 'Student blocked from Caretaker API (HTTP 403)');

    const s1Wat = await request('/api/watchman/overview', authHeaders('student'));
    assert(s1Wat.status === 403, 'Student blocked from Watchman API (HTTP 403)');

    const s1Par = await request('/api/parent/overview', authHeaders('student'));
    assert(s1Par.status === 403, 'Student blocked from Parent API (HTTP 403)');

    // 2.2 Parent blocked from Staff and Student endpoints
    const p1Wrd = await request('/api/outpass/warden/overview', authHeaders('parent'));
    assert(p1Wrd.status === 403, 'Parent blocked from Warden API (HTTP 403)');

    const p1Out = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({ reason: 'test', destination: 'test' }),
      ...authHeaders('parent')
    });
    assert(p1Out.status === 403, 'Parent blocked from Student Outpass Creation API (HTTP 403)');

    // 2.3 Gate staff (Caretaker & Watchman) blocked from Outpass Approval
    const ctkApp = await request('/api/outpass/1/approve', {
      method: 'PATCH',
      ...authHeaders('caretaker')
    });
    assert(ctkApp.status === 403, 'Caretaker blocked from Approval API (HTTP 403)');

    const watApp = await request('/api/outpass/1/approve', {
      method: 'PATCH',
      ...authHeaders('watchman')
    });
    assert(watApp.status === 403, 'Watchman blocked from Approval API (HTTP 403)');

    // ----------------------------------------------------
    // TEST 3: APPROVAL PERMISSION BOUNDARIES (DUAL WORKFLOWS)
    // ----------------------------------------------------
    console.log('\n⚖️ TEST 3: Approval Permission Boundaries (Dual Workflows)');

    // Ensure student location is recorded for proximity check
    await pool.query(`
      INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
      VALUES (1, 13.0000000, 80.0000000, 10.0, NOW(), 'browser_gps')
      ON DUPLICATE KEY UPDATE
        latitude = 13.0000000,
        longitude = 80.0000000,
        accuracy = 10.0,
        captured_at = NOW(),
        source = 'browser_gps';
    `);

    const now = new Date();
    const futureLeave = new Date(now.getTime() + 24 * 3600 * 1000);
    const futureReturn = new Date(now.getTime() + 30 * 3600 * 1000);
    const odLeave = new Date(now.getTime() + 14 * 3600 * 1000);
    const odReturn = new Date(now.getTime() + 18 * 3600 * 1000);
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const fourHoursLater = new Date(now.getTime() + 4 * 3600 * 1000);

    // 3.1 Submit Normal Outpass (at least 18h advance)
    const normalReq = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'normal',
        reason: 'Home visit for festival',
        destination: 'Chennai, Tamil Nadu',
        leaving_date: formatLocalDate(futureLeave),
        leaving_time: formatLocalTime(futureLeave),
        expected_return_date: formatLocalDate(futureReturn),
        expected_return_time: formatLocalTime(futureReturn),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    const normalId = normalReq.data && normalReq.data.data ? normalReq.data.data.id : null;
    assert(normalReq.status === 201 && normalReq.data.data.status === 'PENDING_PARENT', 'Normal Outpass initial status is PENDING_PARENT (HTTP 201)');

    // 3.2 Principal CANNOT approve Normal Outpass
    const prcNormApp = await request(`/api/principal/one-day/${normalId}/approve`, {
      method: 'PATCH',
      ...authHeaders('principal')
    });
    assert(prcNormApp.status === 400 || prcNormApp.status === 403, 'Principal blocked from approving Normal Outpass (HTTP 400/403)');

    // 3.3 Submit One-Day Duty (at least 12h advance)
    const odReq = await request('/api/outpass', {
      method: 'POST',
      body: JSON.stringify({
        request_type: 'duty',
        reason: 'Paper Presentation at Tech Symposium',
        destination: 'PSG Tech, Coimbatore',
        leaving_date: formatLocalDate(odLeave),
        leaving_time: formatLocalTime(odLeave),
        expected_return_date: formatLocalDate(odReturn),
        expected_return_time: formatLocalTime(odReturn),
        event_name: 'INVENTO 2026',
        event_location: 'PSG Tech, Coimbatore',
        duty_date: formatLocalDate(odLeave),
        student_phone: '9876500010'
      }),
      ...authHeaders('student')
    });
    const odId = odReq.data && odReq.data.data ? odReq.data.data.id : null;
    assert(odReq.status === 201 && odReq.data.data.status === 'PENDING_ADVISOR', 'One-Day Duty initial status is PENDING_ADVISOR (HTTP 201)');

    // 3.4 Warden CANNOT approve One-Day Duty
    const wrdOdApp = await request(`/api/outpass/${odId}/approve`, {
      method: 'PATCH',
      ...authHeaders('warden')
    });
    assert(wrdOdApp.status === 403, 'Warden strictly forbidden from approving One-Day Duty (HTTP 403)');

    // 3.5 Class Advisor approves One-Day Duty -> transitions to PENDING_PRINCIPAL
    const advApproveRes = await request(`/api/advisor/one-day/${odId}/approve`, {
      method: 'PATCH',
      ...authHeaders('advisor')
    });
    assert(advApproveRes.status === 200 && advApproveRes.data.data.status === 'PENDING_PRINCIPAL', 'Advisor approved OD -> status is PENDING_PRINCIPAL (HTTP 200)');

    // 3.6 QR generation BLOCKED while PENDING_PRINCIPAL
    const prematureQr = await request(`/api/qr/generate/${odId}`, {
      method: 'POST',
      ...authHeaders('principal')
    });
    assert(prematureQr.status === 400, 'QR generation blocked while PENDING_PRINCIPAL (HTTP 400)');

    // 3.7 Principal approves One-Day Duty -> status APPROVED
    const princApproveRes = await request(`/api/principal/one-day/${odId}/approve`, {
      method: 'PATCH',
      ...authHeaders('principal')
    });
    assert(princApproveRes.status === 200 && princApproveRes.data.data.status === 'APPROVED', 'Principal final approval successful (HTTP 200 -> APPROVED)');

    // ----------------------------------------------------
    // TEST 4: STUDENT OWNERSHIP & IDOR PROTECTION
    // ----------------------------------------------------
    console.log('\n👤 TEST 4: Student Ownership & IDOR Protection');

    // 4.1 Student 2 cannot see Student 1's active outpass
    const s2ActiveRes = await request('/api/student/active-outpass', authHeaders('student2'));
    assert(s2ActiveRes.status === 200, 'Student 2 requests active outpass');
    if (s2ActiveRes.data.hasActiveOutpass) {
      assert(s2ActiveRes.data.activeOutpass.studentRegNo === '21ME018', 'Student 2 only receives their own active outpass');
    } else {
      assert(s2ActiveRes.data.hasActiveOutpass === false, 'Student 2 has no active outpass and receives 0 records of Student 1');
    }

    // 4.2 Cross-user notification modification blocked
    const s1Notifs = await request('/api/notifications', authHeaders('student'));
    if (s1Notifs.data.notifications && s1Notifs.data.notifications.length > 0) {
      const targetNotifId = s1Notifs.data.notifications[0].id;
      const idorNotifRes = await request(`/api/notifications/${targetNotifId}/read`, {
        method: 'PATCH',
        ...authHeaders('student2')
      });
      assert(idorNotifRes.status === 403 || idorNotifRes.status === 404, 'IDOR blocked on notifications (HTTP 403/404)');
    }

    // ----------------------------------------------------
    // TEST 5: PARENT WARD AUTHORIZATION & BIOMETRIC GATE
    // ----------------------------------------------------
    console.log('\n👨‍👩‍👧 TEST 5: Parent Ward Authorization & Biometric Gate');

    // 5.1 Parent approving without location verification is blocked
    const p1NoBioApp = await request(`/api/parent/outpass/${normalId}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ parent_message: 'Approved for leave' }),
      ...authHeaders('parent')
    });
    assert(p1NoBioApp.status === 403, 'Biometric Gate: Approval blocked without biometric verification (HTTP 403)');

    // 5.2 Location verification succeeds and allows Parent approval
    const locRes = await request(`/api/parent/outpass/${normalId}/location-verify`, {
      method: 'POST',
      body: JSON.stringify({ latitude: 13.0010000, longitude: 80.0010000, accuracy: 15.0 }),
      ...authHeaders('parent')
    });
    const verToken = locRes.data.verificationToken || locRes.data.verification_token;
    const parentApproveRes = await request(`/api/parent/outpass/${normalId}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ verification_token: verToken, parent_message: 'Approved for leave' }),
      ...authHeaders('parent')
    });
    assert(parentApproveRes.status === 200 && parentApproveRes.data.data.status === 'PENDING_WARDEN', 'Parent approved outpass with biometric consent -> PENDING_WARDEN');

    // ----------------------------------------------------
    // TEST 6: QR CODE SECURITY & CHECKPOINT VALIDATION
    // ----------------------------------------------------
    console.log('\n📱 TEST 6: QR Code Security & Checkpoint Validation');

    // 6.1 Warden approves Normal Outpass -> APPROVED
    const wardenApproveRes = await request(`/api/outpass/${normalId}/approve`, {
      method: 'PATCH',
      ...authHeaders('warden')
    });
    assert(wardenApproveRes.status === 200 && wardenApproveRes.data.data.status === 'APPROVED', 'Warden approved Normal Outpass (Status: APPROVED)');

    // 6.2 Generate QR for Normal Outpass
    const qrGenRes = await request(`/api/qr/generate/${normalId}`, {
      method: 'POST',
      ...authHeaders('warden')
    });
    assert(qrGenRes.status === 201 || qrGenRes.status === 200, 'QR Code generated with HOSTEL-QR encoding (HTTP 201/200)');
    const qrToken = qrGenRes.data.data.qrToken;
    const qrId = qrGenRes.data.data.qrId;

    // Activate for departure window
    await pool.query('UPDATE qr_codes SET valid_from = ? WHERE id = ?', [tenMinsAgo, qrId]);
    await pool.query('UPDATE outpass_requests SET from_datetime = ? WHERE id = ?', [tenMinsAgo, normalId]);

    // 6.3 Student retrieves their active QR pass
    const s1ActiveRes = await request('/api/student/active-outpass', authHeaders('student'));
    assert(s1ActiveRes.data.hasActiveOutpass && s1ActiveRes.data.activeOutpass.qrToken === qrToken, 'Student receives their own secure QR token');

    // 6.4 Student cannot generate QR
    const studentGenQr = await request(`/api/qr/generate/${normalId}`, {
      method: 'POST',
      ...authHeaders('student')
    });
    assert(studentGenQr.status === 403, 'Student blocked from QR generation API (HTTP 403)');

    // 6.5 Fake / Tampered QR token is rejected
    const fakeTokenRes = await request('/api/qr/validate', {
      method: 'POST',
      body: JSON.stringify({ qr_token: 'fake_malicious_qr_token_999' })
    });
    assert(fakeTokenRes.status === 404 && fakeTokenRes.data.validity === 'INVALID', 'Fake QR token rejected with HTTP 404 INVALID validity');

    // ----------------------------------------------------
    // TEST 7: GATE CHECKPOINT ENFORCEMENT
    // ----------------------------------------------------
    console.log('\n🚪 TEST 7: Gate Checkpoint Enforcement (Caretaker vs Watchman)');

    // 7.1 Student who has NOT exited cannot be returned by Watchman
    const prematureReturn = await request('/api/watchman/return', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
      ...authHeaders('watchman')
    });
    assert(prematureReturn.status === 400, 'Watchman return blocked for non-exited student (HTTP 400 NOT_EXITED)');

    // 7.2 Non-Caretaker (Watchman/Student) blocked from Exit API
    const watExit = await request('/api/caretaker/exit', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
      ...authHeaders('watchman')
    });
    assert(watExit.status === 403, 'Watchman blocked from Caretaker Exit API (HTTP 403)');

    // 7.3 Caretaker records Exit
    const exitRes = await request('/api/caretaker/exit', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
      ...authHeaders('caretaker')
    });
    assert(exitRes.status === 200 && exitRes.data.status === 'EXIT_VERIFIED', 'Caretaker recorded Student Exit successfully');

    // 7.4 Prevent Duplicate Exit
    const dupExit = await request('/api/caretaker/exit', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
      ...authHeaders('caretaker')
    });
    assert(dupExit.status === 409, 'Duplicate Exit prevented (HTTP 409 ALREADY_EXITED)');

    // 7.5 Non-Watchman (Caretaker/Student) blocked from Return API
    const ctkReturn = await request('/api/watchman/return', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
      ...authHeaders('caretaker')
    });
    assert(ctkReturn.status === 403, 'Caretaker blocked from Watchman Return API (HTTP 403)');

    // 7.6 Watchman records Return
    const returnRes = await request('/api/watchman/return', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
      ...authHeaders('watchman')
    });
    assert(returnRes.status === 200 && returnRes.data.status === 'RETURN_VERIFIED', 'Watchman recorded Student Return successfully');

    // 7.7 Prevent Duplicate Return
    const dupReturn = await request('/api/watchman/return', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
      ...authHeaders('watchman')
    });
    assert(dupReturn.status === 409, 'Duplicate Return prevented (HTTP 409 ALREADY_RETURNED)');

    // ----------------------------------------------------
    // TEST 8: EMERGENCY TIME EXTENSION SECURITY
    // ----------------------------------------------------
    console.log('\n⏱️ TEST 8: Emergency Time Extension Security');

    // 8.1 Student cannot approve extension
    const stuAppExt = await request('/api/extension/1/approve', {
      method: 'PATCH',
      ...authHeaders('student')
    });
    assert(stuAppExt.status === 403, 'Student blocked from Extension Approval API (HTTP 403)');

    // ----------------------------------------------------
    // TEST 9: SQL INJECTION RESISTANCE
    // ----------------------------------------------------
    console.log('\n💉 TEST 9: SQL Injection Resistance');

    const sqlInjections = [
      "' OR '1'='1",
      "admin'--",
      "' UNION SELECT 1, 'admin', 'hash', 'admin'--",
      "1; DROP TABLE outpass_requests;--"
    ];

    for (const payload of sqlInjections) {
      const sqliRes = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: payload,
          password: 'Password@123',
          role: 'student'
        })
      });
      assert(sqliRes.status === 401 || sqliRes.status === 400, `SQL injection payload [${payload}] safely rejected with HTTP ${sqliRes.status}`);
    }

    // ----------------------------------------------------
    // TEST 10: INFORMATION LEAKAGE & 404/500 INTEGRITY
    // ----------------------------------------------------
    console.log('\n🛡️ TEST 10: Information Leakage & Error Integrity');

    const notFoundRes = await request('/api/non_existent_endpoint_xyz');
    assert(notFoundRes.status === 404, '404 endpoint returns clean JSON response');
    assert(notFoundRes.data && !notFoundRes.data.stack, 'No internal stack trace leaked on 404');

    // ====================================================
    // SUMMARY
    // ====================================================
    console.log('\n========================================================');
    console.log(`🏁 SECURITY AUDIT RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================\n');

    if (failedCount === 0) {
      console.log('🎉 SECURITY TEST: PASSED\n');
      process.exit(0);
    } else {
      console.error('⚠️ SECURITY TEST: FAILED (Review failed assertions above)\n');
      process.exit(1);
    }

  } catch (globalErr) {
    console.error('💥 Global Test Error:', globalErr.message);
    process.exit(1);
  }
}

runSecurityTests();
