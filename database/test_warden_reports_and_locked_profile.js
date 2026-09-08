/**
 * ============================================================================
 * TEST SUITE: WARDEN REPORTS, NAMED PLACE LOCATION & LOCKED PROFILE IDENTITY
 * ============================================================================
 * Tests:
 * 1. Feature 1: Warden Parent Location: Named Place
 *    - Validates resolveHumanReadableLocation and reverseGeoCache in warden-dashboard.js
 *    - Validates place display in renderNormalQueue, openDetailsModal, and openApproveModal
 *    - Tests coordinate resolution with real GPS coordinates (Erode)
 *    - Tests fallback to "Location name unavailable" for missing/offline coordinates
 * 2. Feature 2: Warden Reports & Movement Analytics
 *    - Authentication & Role Authorization (Requires Warden, rejects Student with 403)
 *    - Today filter: Real MySQL summary metrics, department census, late returns, outside students
 *    - Yesterday filter: Parameterized date range
 *    - Custom filter: User-specified date bounds
 *    - Data privacy: Sensitive parent GPS coordinates excluded from general report list
 * 3. Feature 3: Student Profile Locked Identity Fields
 *    - First-time setup requires all 5 identity fields (Name, Dept, Phone, Parent Name, Parent Mobile)
 *    - Profile setup persists profile_completed = 1
 *    - Backend strictly rejects modifying Student Name with HTTP 400
 *    - Backend strictly rejects modifying Department with HTTP 400
 *    - Backend strictly rejects modifying Student Phone with HTTP 400
 *    - Backend strictly rejects modifying Parent Name with HTTP 400
 *    - Backend strictly rejects modifying Parent Phone with HTTP 400
 *    - Rejection message confirms: "Identity fields can only be set during initial profile setup."
 *    - Academic/hostel fields (Year, Semester, Block, Room) remain fully editable
 *    - MySQL database integrity verified
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'smart_hostel_outpass_super_secret_jwt_key_2026';

function req(pathName, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 5001,
      path: pathName,
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
  console.log('======================================================================');
  console.log('🧪 RUNNING WARDEN REPORTS, NAMED PLACE & LOCKED PROFILE IDENTITY TESTS');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, msg = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${msg ? '(' + msg + ')' : ''}`);
      failed++;
    }
  }

  const stamp = Date.now().toString().slice(-6);

  try {
    // ==================================================================
    // SECTION 1: Feature 1 – Warden Parent Location: Named Place
    // ==================================================================
    console.log('--- Section 1: Warden Parent Location – Named Place ---');

    const wardenJsPath = path.join(__dirname, '../public/js/warden-dashboard.js');
    const wardenJs = fs.readFileSync(wardenJsPath, 'utf8');

    assert(wardenJs.includes('resolveHumanReadableLocation'), 'resolveHumanReadableLocation function exists in warden-dashboard.js');
    assert(wardenJs.includes('reverseGeoCache'), 'reverseGeoCache Map exists in warden-dashboard.js');
    assert(wardenJs.includes('Location name unavailable'), 'Graceful fallback text "Location name unavailable" exists');
    assert(wardenJs.includes('parent-place-${req.id}'), 'Place display element in renderNormalQueue exists');
    assert(wardenJs.includes('details-parent-place'), 'Place display element in openDetailsModal exists');
    assert(wardenJs.includes('approve-parent-place'), 'Place display element in openApproveModal exists');
    assert(wardenJs.includes('Coordinates:'), 'Coordinates label is preserved in parent location card');

    // Test reverse geocoding API with real coordinates
    try {
      const erodeUrl = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=11.3410&longitude=77.7172&localityLanguage=en';
      const geoRes = await fetch(erodeUrl);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const place = [geoData.locality || geoData.city, geoData.principalSubdivision].filter(Boolean).join(', ');
        assert(place.toLowerCase().includes('erode'), 'Real GPS coords (11.3410, 77.7172) resolve place name including Erode');
      }
    } catch (e) {
      console.warn('  ⚠️ External reverse geocode network notice (graceful fallback applies):', e.message);
    }

    // ==================================================================
    // SECTION 2: Feature 2 – Make Warden Reports Fully Functional
    // ==================================================================
    console.log('\n--- Section 2: Warden Reports & Movement Analytics ---');

    // 2.1 Test Unauthenticated access -> 401
    const unauthReportsRes = await req('/api/outpass/warden/reports');
    assert(unauthReportsRes.status === 401, 'Unauthenticated report request rejected with HTTP 401');

    // 2.2 Test Student role access -> 403 Forbidden
    const studentToken = jwt.sign(
      { id: 9999, role: 'student', identifier: 'STU_TEST', name: 'Test Student' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const studentReportRes = await req('/api/outpass/warden/reports', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert(studentReportRes.status === 403, 'Student access to Warden Reports rejected with HTTP 403');

    // 2.3 Test Warden role access -> 200 OK with 'today' filter
    const wardenToken = jwt.sign(
      { id: 1, role: 'warden', identifier: 'WARDEN01', name: 'Hostel Warden' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const todayReportsRes = await req('/api/outpass/warden/reports?filter=today', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(todayReportsRes.status === 200 && todayReportsRes.data.success === true, 'Warden retrieves today report with HTTP 200');
    assert(todayReportsRes.data?.filter === 'today', 'Response confirms filter=today');
    assert(typeof todayReportsRes.data?.summary?.totalOutpasses === 'number', 'Summary contains numeric totalOutpasses');
    assert(typeof todayReportsRes.data?.summary?.pendingRequests === 'number', 'Summary contains numeric pendingRequests');
    assert(typeof todayReportsRes.data?.summary?.approvedRequests === 'number', 'Summary contains numeric approvedRequests');
    assert(typeof todayReportsRes.data?.summary?.rejectedRequests === 'number', 'Summary contains numeric rejectedRequests');
    assert(typeof todayReportsRes.data?.summary?.currentlyOutside === 'number', 'Summary contains numeric currentlyOutside');
    assert(typeof todayReportsRes.data?.summary?.returnedStudents === 'number', 'Summary contains numeric returnedStudents');
    assert(typeof todayReportsRes.data?.summary?.lateReturns === 'number', 'Summary contains numeric lateReturns');
    assert(typeof todayReportsRes.data?.summary?.emergencyExtensions === 'number', 'Summary contains numeric emergencyExtensions');

    assert(Array.isArray(todayReportsRes.data?.departments), 'Department-wise summary is an array');
    assert(Array.isArray(todayReportsRes.data?.outpassStatusReport), 'Outpass status report is an array');
    assert(Array.isArray(todayReportsRes.data?.lateReturnReport), 'Late return report is an array');
    assert(Array.isArray(todayReportsRes.data?.currentlyOutsideReport), 'Currently outside report is an array');

    // 2.4 Verify Sensitive GPS coordinates are not leaked in general reports
    if (todayReportsRes.data.outpassStatusReport.length > 0) {
      const sample = todayReportsRes.data.outpassStatusReport[0];
      assert(!sample.parentApprovalLat && !sample.parentApprovalLng, 'Sensitive parent GPS coordinates not exposed in general reports table');
    }

    // 2.5 Test Yesterday filter
    const yestReportsRes = await req('/api/outpass/warden/reports?filter=yesterday', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(yestReportsRes.status === 200 && yestReportsRes.data.success === true, 'Warden retrieves yesterday report with HTTP 200');
    assert(yestReportsRes.data?.filter === 'yesterday', 'Response confirms filter=yesterday');

    // 2.6 Test Custom Date Range filter
    const customReportsRes = await req('/api/outpass/warden/reports?filter=custom&startDate=2026-01-01&endDate=2026-12-31', {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    assert(customReportsRes.status === 200 && customReportsRes.data.success === true, 'Warden retrieves custom date range report with HTTP 200');
    assert(customReportsRes.data?.dateRange?.startDate === '2026-01-01', 'Start date matches 2026-01-01');
    assert(customReportsRes.data?.dateRange?.endDate === '2026-12-31', 'End date matches 2026-12-31');

    // 2.7 Verify UI Elements in warden-dashboard.html & functions in warden-dashboard.js
    const wardenHtmlPath = path.join(__dirname, '../public/warden-dashboard.html');
    const wardenHtml = fs.readFileSync(wardenHtmlPath, 'utf8');

    assert(wardenHtml.includes('id="repTotalOutpasses"'), 'repTotalOutpasses element exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repPendingRequests"'), 'repPendingRequests element exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repApprovedRequests"'), 'repApprovedRequests element exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repRejectedRequests"'), 'repRejectedRequests element exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repCurrentlyOutside"'), 'repCurrentlyOutside element exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repReturnedStudents"'), 'repReturnedStudents element exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repLateReturns"'), 'repLateReturns element exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repEmergencyExtensions"'), 'repEmergencyExtensions element exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repDeptSummaryTableBody"'), 'repDeptSummaryTableBody exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repOutpassStatusTableBody"'), 'repOutpassStatusTableBody exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repLateReturnTableBody"'), 'repLateReturnTableBody exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="repCurrentlyOutsideTableBody"'), 'repCurrentlyOutsideTableBody exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="btnPrintReport"'), 'btnPrintReport button exists in warden-dashboard.html');
    assert(wardenHtml.includes('id="btnExportCsv"'), 'btnExportCsv button exists in warden-dashboard.html');
    assert(wardenJs.includes('exportWardenReportsCsv'), 'exportWardenReportsCsv function exists in warden-dashboard.js');
    assert(wardenJs.includes('printWardenReport'), 'printWardenReport function exists in warden-dashboard.js');

    // ==================================================================
    // SECTION 3: Feature 3 – Student Profile: Lock Identity Fields
    // ==================================================================
    console.log('\n--- Section 3: Student Profile: Lock Identity Fields ---');

    const testReg = `STU_LCK_${stamp}`;
    const testPass = 'Student@Pass123';
    const testParentMobile = `97${stamp}33`;

    // 3.1 Register fresh student
    const regRes = await req('/api/auth/register-student', {
      method: 'POST',
      body: {
        username: testReg,
        password: testPass,
        confirm_password: testPass,
        name: 'Initial Student Name',
        email: `lock_${stamp}@student.edu`
      }
    });

    assert(regRes.status === 201 && regRes.data.success === true, 'Fresh student registered successfully');
    const token = regRes.data?.token;

    // Check initial state: profile_completed = 0
    const [freshStudentRows] = await pool.query('SELECT profile_completed FROM students WHERE reg_no = ?', [testReg]);
    assert(freshStudentRows[0].profile_completed === 0, 'Initial student profile_completed is 0');

    // 3.2 First-time setup: Missing identity field (empty parent mobile) -> Rejected
    const missingFieldRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: {
        name: 'Initial Student Name',
        department: 'Information Technology',
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-101',
        phone: '9876543210',
        parent_name: 'Parent Name',
        parent_phone: '', // missing
        relationship: 'Father'
      }
    });
    assert(missingFieldRes.status === 400, 'First-time setup with missing parent phone rejected with HTTP 400');

    // 3.3 First-time setup: Valid submission with all 5 identity fields -> 200 OK & profile_completed = 1
    const firstSetupRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: {
        name: 'Verified Student Name',
        department: 'Information Technology',
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-101',
        phone: '9876543210',
        parent_name: 'Verified Parent Name',
        parent_phone: testParentMobile,
        relationship: 'Father'
      }
    });

    assert(firstSetupRes.status === 200 && firstSetupRes.data.success === true, 'First-time profile setup saved with HTTP 200');
    assert(firstSetupRes.data?.profile_completed === true, 'Response confirms profile_completed = true');

    const [afterSetupRows] = await pool.query('SELECT profile_completed, name, department, phone FROM students WHERE reg_no = ?', [testReg]);
    assert(afterSetupRows[0].profile_completed === 1, 'MySQL confirms profile_completed = 1');
    assert(afterSetupRows[0].name === 'Verified Student Name', 'MySQL confirms student name is "Verified Student Name"');
    assert(afterSetupRows[0].department === 'Information Technology', 'MySQL confirms department is "Information Technology"');

    // 3.4 Attempt Backend Modification of Locked Student Name -> HTTP 400 Rejection
    const alterNameRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: {
        name: 'Hacked Student Name',
        department: 'Information Technology',
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-101',
        phone: '9876543210',
        parent_name: 'Verified Parent Name',
        parent_phone: testParentMobile,
        relationship: 'Father'
      }
    });
    assert(alterNameRes.status === 400, 'Attempt to alter locked Student Name rejected with HTTP 400');
    assert(alterNameRes.data?.message === 'Identity fields can only be set during initial profile setup.', 'Rejection message matches expected restriction notice');

    // 3.5 Attempt Backend Modification of Locked Department -> HTTP 400 Rejection
    const alterDeptRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: {
        name: 'Verified Student Name',
        department: 'Mechanical Engineering', // modified
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-101',
        phone: '9876543210',
        parent_name: 'Verified Parent Name',
        parent_phone: testParentMobile,
        relationship: 'Father'
      }
    });
    assert(alterDeptRes.status === 400, 'Attempt to alter locked Department rejected with HTTP 400');
    assert(alterDeptRes.data?.message === 'Identity fields can only be set during initial profile setup.', 'Rejection message matches expected restriction notice');

    // 3.6 Attempt Backend Modification of Locked Student Mobile -> HTTP 400 Rejection
    const alterPhoneRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: {
        name: 'Verified Student Name',
        department: 'Information Technology',
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-101',
        phone: '9111111111', // modified
        parent_name: 'Verified Parent Name',
        parent_phone: testParentMobile,
        relationship: 'Father'
      }
    });
    assert(alterPhoneRes.status === 400, 'Attempt to alter locked Student Mobile rejected with HTTP 400');
    assert(alterPhoneRes.data?.message === 'Identity fields can only be set during initial profile setup.', 'Rejection message matches expected restriction notice');

    // 3.7 Attempt Backend Modification of Locked Parent Name -> HTTP 400 Rejection
    const alterParentNameRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: {
        name: 'Verified Student Name',
        department: 'Information Technology',
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-101',
        phone: '9876543210',
        parent_name: 'New Imposter Parent', // modified
        parent_phone: testParentMobile,
        relationship: 'Father'
      }
    });
    assert(alterParentNameRes.status === 400, 'Attempt to alter locked Parent Name rejected with HTTP 400');
    assert(alterParentNameRes.data?.message === 'Identity fields can only be set during initial profile setup.', 'Rejection message matches expected restriction notice');

    // 3.8 Attempt Backend Modification of Locked Parent Mobile -> HTTP 400 Rejection
    const alterParentPhoneRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: {
        name: 'Verified Student Name',
        department: 'Information Technology',
        year_of_study: 3,
        semester: 'Semester 6',
        hostel_block: 'Block A',
        room_no: 'A-101',
        phone: '9876543210',
        parent_name: 'Verified Parent Name',
        parent_phone: '9222222222', // modified
        relationship: 'Father'
      }
    });
    assert(alterParentPhoneRes.status === 400, 'Attempt to alter locked Parent Mobile rejected with HTTP 400');
    assert(alterParentPhoneRes.data?.message === 'Identity fields can only be set during initial profile setup.', 'Rejection message matches expected restriction notice');

    // 3.9 Update Allowed Academic / Hostel Details -> HTTP 200 OK
    const updateAllowedRes = await req('/api/student/profile', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: {
        name: 'Verified Student Name',
        department: 'Information Technology',
        phone: '9876543210',
        parent_name: 'Verified Parent Name',
        parent_phone: testParentMobile,
        year_of_study: 4,
        semester: 'Semester 7',
        hostel_block: 'Block C',
        room_no: 'C-404',
        relationship: 'Guardian'
      }
    });

    assert(updateAllowedRes.status === 200 && updateAllowedRes.data.success === true, 'Updating allowed fields (Year, Sem, Block, Room) succeeds with HTTP 200');
    assert(updateAllowedRes.data?.student?.year_of_study === 4, 'Updated year_of_study is 4');
    assert(updateAllowedRes.data?.student?.room_no === 'C-404', 'Updated room_no is C-404');
    assert(updateAllowedRes.data?.student?.hostel_block === 'Block C', 'Updated hostel_block is Block C');

    // 3.10 Verify Database values remain protected
    const [finalDbRows] = await pool.query(
      'SELECT s.name, s.department, s.phone, s.year_of_study, s.hostel_block, s.room_no, p.father_name, p.primary_phone FROM students s LEFT JOIN parents p ON s.parent_id = p.id WHERE s.reg_no = ?',
      [testReg]
    );
    assert(finalDbRows[0].name === 'Verified Student Name', 'MySQL confirms student name remained completely unchanged');
    assert(finalDbRows[0].department === 'Information Technology', 'MySQL confirms department remained completely unchanged');
    assert(finalDbRows[0].phone === '9876543210', 'MySQL confirms student phone remained completely unchanged');
    assert(finalDbRows[0].father_name === 'Verified Parent Name', 'MySQL confirms parent name remained completely unchanged');
    assert(finalDbRows[0].primary_phone === testParentMobile, 'MySQL confirms parent phone remained completely unchanged');
    assert(finalDbRows[0].room_no === 'C-404', 'MySQL confirms room_no was successfully updated');

    // 3.11 Verify Student Portal UI Markup
    const studentHtmlPath = path.join(__dirname, '../public/student-dashboard.html');
    const studentHtml = fs.readFileSync(studentHtmlPath, 'utf8');

    assert(studentHtml.includes('Identity Fields Locked'), 'Identity Fields Locked notice exists in student-dashboard.html');
    assert(studentHtml.includes('identity-lock-badge'), 'identity-lock-badge class exists in student-dashboard.html');
    assert(studentHtml.includes('id="firstSetupPhone" placeholder="10-digit mobile" required'), 'firstSetupPhone is required in student-dashboard.html');

  } catch (err) {
    console.error('❌ Test execution error:', err);
    failed++;
  } finally {
    console.log('\n======================================================================');
    console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================\n');
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
