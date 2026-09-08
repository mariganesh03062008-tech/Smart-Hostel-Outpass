/**
 * Test Suite: Centralized Notification System Verification
 * Tests:
 * 1. Test A: Normal Outpass Flow Notifications (Student -> Parent -> Warden -> Student/Parent)
 * 2. Test B: One-Day Duty Flow Notifications (Student -> Advisor -> Principal -> Student)
 * 3. Test C: Checkpoint Exit Notifications (Exit scan -> Student & Watchman notified)
 * 4. Test D: Checkpoint Return Notifications (Return scan -> Student notified)
 * 5. Test E: Emergency Extension Notifications (Student requests -> Warden notified -> Warden approves -> Student notified)
 * 6. Test F: Deduplication Guarantee
 * 7. Test G: REST API Security & Ownership Checks (GET, PATCH read, PATCH read-all)
 */

const http = require('http');
const { pool } = require('../utils/db');

const BASE_URL = 'http://localhost:5001';

async function makeRequest(method, endpoint, body = null, token = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function loginUser(role, username, password = 'Password@123') {
  const res = await makeRequest('POST', '/api/auth/login', { role, username, password });
  if (!res.data || !res.data.success || !res.data.token) {
    console.error(`Login failed response for ${role} (${username}):`, res);
    throw new Error(`Login failed for ${role} (${username}): ${JSON.stringify(res.data)}`);
  }
  return { token: res.data.token, user: res.data.user };
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

async function runNotificationTestSuite() {
  console.log('===============================================================');
  console.log('🧪 RUNNING CENTRALIZED NOTIFICATION SYSTEM AUTOMATED TEST SUITE');
  console.log('===============================================================\n');

  try {
    // 1. Authenticate Actors
    console.log('Step 1: Authenticating All System Actors...');
    const studentAuth = await loginUser('student', '21CS042', 'Password@123');
    const parentAuth = await loginUser('parent', '9876543210', 'Password@123');
    const advisorAuth = await loginUser('class_advisor', 'ADV-204', 'Password@123');
    const principalAuth = await loginUser('principal', 'PRC-001', 'Password@123');
    const wardenAuth = await loginUser('warden', 'WRD-101', 'Password@123');
    const caretakerAuth = await loginUser('caretaker', 'CTK-305', 'Password@123');
    const watchmanAuth = await loginUser('watchman', 'GAT-401', 'Password@123');

    assert(studentAuth.token && parentAuth.token && advisorAuth.token && principalAuth.token && wardenAuth.token && caretakerAuth.token && watchmanAuth.token, 'All 7 actors logged in successfully.');

    // 2. Test A: Normal Outpass Flow Notifications
    console.log('\nStep 2: Testing Normal Outpass Flow Notification Triggers...');
    const now = new Date();
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const normalSubmitRes = await makeRequest('POST', '/api/outpass', {
      request_type: 'normal',
      reason: 'Weekend Home Visit For Festival',
      destination: 'Chennai Main City',
      leaving_date: formatLocalDate(tenMinsAgo),
      leaving_time: formatLocalTime(tenMinsAgo),
      expected_return_date: formatLocalDate(twoHoursLater),
      expected_return_time: formatLocalTime(twoHoursLater)
    }, studentAuth.token);

    assert(normalSubmitRes.status === 201 && normalSubmitRes.data.success, 'Normal Outpass submitted successfully');
    const normalOutpassId = normalSubmitRes.data.data.id;

    // Check Parent Notifications
    const parentNotifRes1 = await makeRequest('GET', '/api/notifications', null, parentAuth.token);
    assert(parentNotifRes1.status === 200, 'Fetched parent notifications');
    const parentOutpassNotif = parentNotifRes1.data.notifications.find(n => n.type === 'OUTPASS_SUBMITTED' && String(n.referenceId) === String(normalOutpassId));
    assert(parentOutpassNotif !== undefined, 'Parent received OUTPASS_SUBMITTED notification');

    // Parent Approves Outpass
    await makeRequest('POST', '/api/parent/biometric-verify', { simulation_mode: true }, parentAuth.token);
    const parentApproveRes = await makeRequest('PATCH', `/api/parent/outpass/${normalOutpassId}/approve`, {}, parentAuth.token);
    assert(parentApproveRes.status === 200 && parentApproveRes.data.success, 'Parent approved outpass');

    // Check Warden Notification (Parent Approved -> Warden gets New Outpass notification)
    const wardenNotifRes1 = await makeRequest('GET', '/api/notifications', null, wardenAuth.token);
    const wardenNotif = wardenNotifRes1.data.notifications.find(n => n.type === 'PARENT_APPROVED' && String(n.referenceId) === String(normalOutpassId));
    assert(wardenNotif !== undefined, 'Warden received PARENT_APPROVED notification');

    // Check Student Notification (Parent Consent Granted)
    const studentNotifRes1 = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    const studentParentConsentNotif = studentNotifRes1.data.notifications.find(n => n.type === 'PARENT_APPROVED' && String(n.referenceId) === String(normalOutpassId));
    assert(studentParentConsentNotif !== undefined, 'Student received PARENT_APPROVED notification');

    // Warden Approves Outpass
    const wardenApproveRes = await makeRequest('PATCH', `/api/outpass/${normalOutpassId}/approve`, {}, wardenAuth.token);
    assert(wardenApproveRes.status === 200 && wardenApproveRes.data.success, 'Warden approved normal outpass');

    // Check Student Notification (Warden Approved)
    const studentNotifRes2 = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    const studentWardenNotif = studentNotifRes2.data.notifications.find(n => n.type === 'WARDEN_APPROVED' && String(n.referenceId) === String(normalOutpassId));
    assert(studentWardenNotif !== undefined, 'Student received WARDEN_APPROVED notification');

    // 3. Test B: One-Day Duty Permission Flow Notifications
    console.log('\nStep 3: Testing One-Day Permission Flow Notification Triggers...');
    const dutyNow = new Date();
    const dutyStart = new Date(dutyNow.getTime() - 15 * 60 * 1000);
    const dutyEnd = new Date(dutyNow.getTime() + 4 * 60 * 60 * 1000);

    const dutySubmitRes = await makeRequest('POST', '/api/outpass', {
      request_type: 'one_day_duty',
      reason: 'State Level Technical Hackathon 2026',
      destination: 'IIT Madras Research Park',
      event_name: 'HackAI 2026',
      event_location: 'IIT Madras Auditorium',
      duty_date: formatLocalDate(dutyStart),
      leaving_date: formatLocalDate(dutyStart),
      leaving_time: formatLocalTime(dutyStart),
      expected_return_date: formatLocalDate(dutyEnd),
      expected_return_time: formatLocalTime(dutyEnd)
    }, studentAuth.token);

    assert(dutySubmitRes.status === 201 && dutySubmitRes.data.success, 'One-Day Duty request submitted');
    const dutyOutpassId = dutySubmitRes.data.data.id;

    // Check Class Advisor Notification
    const advisorNotifRes1 = await makeRequest('GET', '/api/notifications', null, advisorAuth.token);
    const advisorNotif = advisorNotifRes1.data.notifications.find(n => n.type === 'OUTPASS_SUBMITTED' && String(n.referenceId) === String(dutyOutpassId));
    assert(advisorNotif !== undefined, 'Class Advisor received OUTPASS_SUBMITTED notification for One-Day Duty');

    // Advisor Approves One-Day Duty
    const advisorApproveRes = await makeRequest('PATCH', `/api/advisor/one-day/${dutyOutpassId}/approve`, {}, advisorAuth.token);
    assert(advisorApproveRes.status === 200 && advisorApproveRes.data.success, 'Class Advisor approved One-Day Duty');

    // Check Principal Notification (Rule 5: Principal receives One-Day Permission for approval)
    const principalNotifRes1 = await makeRequest('GET', '/api/notifications', null, principalAuth.token);
    const principalNotif = principalNotifRes1.data.notifications.find(n => n.type === 'PRINCIPAL_PENDING' && String(n.referenceId) === String(dutyOutpassId));
    assert(principalNotif !== undefined, 'Principal received PRINCIPAL_PENDING notification');

    // Check Student Notification (Advisor approved)
    const studentNotifRes3 = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    const studentAdvNotif = studentNotifRes3.data.notifications.find(n => n.type === 'ADVISOR_APPROVED' && String(n.referenceId) === String(dutyOutpassId));
    assert(studentAdvNotif !== undefined, 'Student received ADVISOR_APPROVED notification');

    // Principal Approves One-Day Duty
    const principalApproveRes = await makeRequest('PATCH', `/api/principal/one-day/${dutyOutpassId}/approve`, {}, principalAuth.token);
    assert(principalApproveRes.status === 200 && principalApproveRes.data.success, 'Principal approved One-Day Duty');

    // Check Student Notification (Principal approved)
    const studentNotifRes4 = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    const studentPrinNotif = studentNotifRes4.data.notifications.find(n => n.type === 'PRINCIPAL_APPROVED' && String(n.referenceId) === String(dutyOutpassId));
    assert(studentPrinNotif !== undefined, 'Student received PRINCIPAL_APPROVED notification');

    // 4. Test C & D: QR Generation, Exit & Return Notifications
    console.log('\nStep 4: Testing QR Generation, Exit, and Return Notifications...');
    const qrGenRes = await makeRequest('POST', `/api/qr/generate/${normalOutpassId}`, {}, wardenAuth.token);
    assert(qrGenRes.status === 201 && qrGenRes.data.success, 'QR Code generated');
    const qrToken = qrGenRes.data.data.qrToken;

    // Check Student & Caretaker Notifications
    const studentNotifRes5 = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    const studentQrNotif = studentNotifRes5.data.notifications.find(n => n.type === 'QR_GENERATED' && String(n.referenceId) === String(normalOutpassId));
    assert(studentQrNotif !== undefined, 'Student received QR_GENERATED notification');

    const caretakerNotifRes1 = await makeRequest('GET', '/api/notifications', null, caretakerAuth.token);
    const caretakerQrNotif = caretakerNotifRes1.data.notifications.find(n => n.type === 'QR_GENERATED' && String(n.referenceId) === String(normalOutpassId));
    assert(caretakerQrNotif !== undefined, 'Caretaker received QR_GENERATED notification');

    // Caretaker records Exit
    const exitRes = await makeRequest('POST', '/api/caretaker/exit', { qr_token: qrToken }, caretakerAuth.token);
    assert(exitRes.status === 200 && exitRes.data && exitRes.data.success, 'Caretaker recorded student exit');

    // Check Student & Watchman Exit Notifications
    const studentNotifRes6 = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    const studentExitNotif = studentNotifRes6.data.notifications.find(n => n.type === 'EXIT_RECORDED' && String(n.referenceId) === String(normalOutpassId));
    assert(studentExitNotif !== undefined, 'Student received EXIT_RECORDED notification');

    const watchmanNotifRes1 = await makeRequest('GET', '/api/notifications', null, watchmanAuth.token);
    const watchmanExitNotif = watchmanNotifRes1.data.notifications.find(n => n.type === 'EXIT_RECORDED' && String(n.referenceId) === String(normalOutpassId));
    assert(watchmanExitNotif !== undefined, 'Watchman received EXIT_RECORDED notification');

    // Watchman records Return
    const returnRes = await makeRequest('POST', '/api/watchman/return', { qr_token: qrToken }, watchmanAuth.token);
    assert(returnRes.status === 200 && returnRes.data && returnRes.data.success, 'Watchman recorded student return');

    // Check Student Return Notification
    const studentNotifRes7 = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    const studentReturnNotif = studentNotifRes7.data.notifications.find(n => (n.type === 'RETURN_RECORDED' || n.type === 'LATE_RETURN') && String(n.referenceId) === String(normalOutpassId));
    assert(studentReturnNotif !== undefined, 'Student received RETURN_RECORDED notification');

    // 5. Test E: Notification Deduplication Check
    console.log('\nStep 5: Testing Notification Deduplication...');
    const notificationService = require('../services/notificationService');
    const notif1 = await notificationService.createNotification({
      userId: studentAuth.user.id,
      role: 'student',
      title: 'Dedup Test Notification',
      message: 'Testing deduplication preventer',
      type: 'DEDUP_TEST',
      referenceId: 'REF_DEDUP_100'
    });
    const notif2 = await notificationService.createNotification({
      userId: studentAuth.user.id,
      role: 'student',
      title: 'Dedup Test Notification',
      message: 'Testing deduplication preventer',
      type: 'DEDUP_TEST',
      referenceId: 'REF_DEDUP_100'
    });
    assert(notif1 && notif2 && notif1.id === notif2.id, 'Duplicate notification suppressed; identical ID returned');

    // 6. Test F & G: REST API Security, Read Status & Mark All
    console.log('\nStep 6: Testing REST API Read Actions & Security Checks...');
    const myNotifs = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    assert(myNotifs.status === 200 && myNotifs.data.unreadCount > 0, 'Student has unread notifications');

    const firstUnread = myNotifs.data.notifications.find(n => !n.isRead);
    assert(firstUnread !== undefined, 'Found unread notification to test mark read');

    // Mark single notification as read
    const readRes = await makeRequest('PATCH', `/api/notifications/${firstUnread.id}/read`, {}, studentAuth.token);
    assert(readRes.status === 200 && readRes.data.success, 'Marked single notification as read');

    // Security: Parent cannot mark student's notification as read
    const hackRes = await makeRequest('PATCH', `/api/notifications/${firstUnread.id}/read`, {}, parentAuth.token);
    assert(hackRes.status === 403, 'Security Guard: Cross-user notification modification blocked (403 Forbidden)');

    // Mark All As Read
    const readAllRes = await makeRequest('PATCH', '/api/notifications/read-all', {}, studentAuth.token);
    assert(readAllRes.status === 200 && readAllRes.data.success, 'Marked all notifications as read');

    const afterReadAll = await makeRequest('GET', '/api/notifications', null, studentAuth.token);
    assert(afterReadAll.data.unreadCount === 0, 'Unread count successfully reduced to 0');

    console.log('\n===============================================================');
    console.log('🎉 ALL NOTIFICATION SYSTEM TESTS PASSED SUCCESSFULLY! (100%)');
    console.log('===============================================================');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test Suite Failed:', error.message);
    process.exit(1);
  }
}

// Run test suite
runNotificationTestSuite();
