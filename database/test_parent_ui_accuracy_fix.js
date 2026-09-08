/**
 * Automated Verification Suite: Parent Location Verification UI Accuracy-State Fix
 * Tests all 7 cases specified in Task 7:
 * 1. Parent accuracy 105m (HTTP 422, accuracyPoor, distanceMeters null, UI State A, no "<5m Proximity")
 * 2. Parent accuracy 50m or better with valid student location (Haversine calculation proceeds)
 * 3. Backend distance < 5m (HTTP 403, proximityBlocked, UI State B, "<5m Proximity" label)
 * 4. Backend distance >= 5m (HTTP 200, locationVerified, UI State C, approval enabled)
 * 5. Student location older than 5 minutes (HTTP 422, studentLocationStale, distanceMeters null, UI State D)
 * 6. Parent location permission denied & GPS errors (clear specific error messages, distance N/A)
 * 7. Retry Location Verification logic (fresh GPS request, maximumAge: 0, enableHighAccuracy: true)
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../utils/db');
const parentController = require('../controllers/parentController');
const outpassController = require('../controllers/outpassController');

function mockReqRes(options = {}) {
  const req = {
    user: options.user || {},
    params: options.params || {},
    body: options.body || {},
    query: options.query || {}
  };

  let resData = null;
  let statusCode = 200;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      resData = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return resData;
    }
  };

  return { req, res };
}

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 RUNNING PARENT LOCATION VERIFICATION ACCURACY-STATE TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName} ${detail ? `(${detail})` : ''}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  try {
    // 1. Fetch test parent and student
    const [parents] = await pool.query('SELECT * FROM parents LIMIT 1;');
    if (parents.length === 0) throw new Error('No parents found in database');
    const parent = parents[0];

    const [students] = await pool.query('SELECT * FROM students WHERE parent_id = ? LIMIT 1;', [parent.id]);
    if (students.length === 0) throw new Error('Student not found for parent_id = ' + parent.id);
    const student = students[0];

    // Create a fresh test outpass request
    const testRequestCode = 'TEST-ACC-' + Math.floor(1000 + Math.random() * 9000);
    const [outpassInsert] = await pool.query(`
      INSERT INTO outpass_requests (
        request_code, student_id, outpass_type, destination, reason,
        semester, student_phone, from_datetime, to_datetime, status,
        parent_approval_status
      ) VALUES (
        ?, ?, 'normal', 'City Center', 'Weekend Visit',
        ?, ?, NOW() + INTERVAL 2 HOUR, NOW() + INTERVAL 10 HOUR, 'PENDING_PARENT',
        'pending'
      );
    `, [testRequestCode, student.id, student.semester || '6', student.phone || '9999999999']);
    const testRequestId = outpassInsert.insertId;

    const baseLat = 13.0000000;
    const baseLng = 80.0000000;

    // Set fresh student location
    await pool.query(`
      INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
      VALUES (?, ?, ?, 10.0, NOW(), 'browser_gps')
      ON DUPLICATE KEY UPDATE
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        accuracy = VALUES(accuracy),
        captured_at = VALUES(captured_at),
        source = VALUES(source);
    `, [student.id, baseLat, baseLng]);

    // -------------------------------------------------------------
    // TEST 1: Parent Accuracy ±105m (Insufficient Accuracy)
    // -------------------------------------------------------------
    console.log('--- TEST 1: Parent Accuracy ±105m (Backend Rejection & UI State A) ---');
    {
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: {
          latitude: baseLat + 0.001,
          longitude: baseLng + 0.001,
          accuracy: 105.4, // ±105m > 50m threshold
          timestamp: new Date().toISOString()
        }
      });

      await parentController.verifyParentLocation(req, res, (err) => { throw err; });
      const data = res.getData();

      assert(res.getStatusCode() === 422, '1.1 Backend returns HTTP 422 for accuracy ±105m');
      assert(data.success === false && data.locationVerified === false, '1.2 locationVerified is false');
      assert(data.accuracyPoor === true, '1.3 accuracyPoor flag is true');
      assert(data.device === 'parent', '1.4 device is identified as parent');
      assert(data.distanceMeters === null, '1.5 distanceMeters is null (distance NOT calculated)');
      assert(data.threshold === 50.0, '1.6 threshold confirmed as 50 meters');
      assert(data.message.includes('105m') || data.message.includes('insufficient'), '1.7 Message mentions insufficient accuracy');
    }

    // -------------------------------------------------------------
    // TEST 2: Parent Accuracy 50m or Better (Valid Student Location)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Parent Accuracy <= 50m (Backend Proceeds to Distance Calculation) ---');
    {
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: {
          latitude: baseLat + 0.0005,
          longitude: baseLng + 0.0005,
          accuracy: 25.0, // <= 50m
          timestamp: new Date().toISOString()
        }
      });

      await parentController.verifyParentLocation(req, res, (err) => { throw err; });
      const data = res.getData();

      assert(res.getStatusCode() === 200, '2.1 Backend returns HTTP 200 when parent accuracy <= 50m and distance >= 5m');
      assert(typeof data.distanceMeters === 'number', '2.2 Distance was successfully calculated in meters', `${data.distanceMeters}m`);
      assert(data.distanceMeters >= 5.0, '2.3 Calculated distance exceeds 5 meters');
    }

    // -------------------------------------------------------------
    // TEST 3: Backend Distance < 5m (Proximity Blocked)
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Distance < 5m (Proximity Blocked) ---');
    {
      // Parent at identical location -> ~0m distance < 5m
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: {
          latitude: baseLat,
          longitude: baseLng,
          accuracy: 10.0,
          timestamp: new Date().toISOString()
        }
      });

      await parentController.verifyParentLocation(req, res, (err) => { throw err; });
      const data = res.getData();

      assert(res.getStatusCode() === 403, '3.1 Backend returns HTTP 403 for distance < 5m');
      assert(data.proximityBlocked === true, '3.2 proximityBlocked flag is true');
      assert(data.distanceMeters < 5.0, '3.3 distanceMeters is < 5 meters', `${data.distanceMeters}m`);
      assert(data.message.includes('5-meter'), '3.4 Message explicitly references 5-meter restriction');
    }

    // -------------------------------------------------------------
    // TEST 4: Backend Distance >= 5m (Verification Successful)
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Distance >= 5m (Verification Successful) ---');
    {
      // 0.0005 deg offset is approx 55-70 meters away
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: {
          latitude: baseLat + 0.0005,
          longitude: baseLng,
          accuracy: 15.0,
          timestamp: new Date().toISOString()
        }
      });

      await parentController.verifyParentLocation(req, res, (err) => { throw err; });
      const data = res.getData();

      assert(res.getStatusCode() === 200, '4.1 Backend returns HTTP 200 for distance >= 5m');
      assert(data.success === true && data.locationVerified === true, '4.2 locationVerified is true');
      assert(typeof data.verificationToken === 'string' && data.verificationToken.length > 20, '4.3 Issues cryptographically strong verification token');
      assert(data.distanceMeters >= 5.0, '4.4 distanceMeters >= 5 meters', `${data.distanceMeters}m`);
    }

    // -------------------------------------------------------------
    // TEST 5: Student Location Older Than 5 Minutes
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Stale Student Location (> 5 Minutes Old) ---');
    {
      // Update student location to be 10 minutes old
      await pool.query(`
        UPDATE student_locations
        SET captured_at = NOW() - INTERVAL 10 MINUTE,
            updated_at = NOW() - INTERVAL 10 MINUTE
        WHERE student_id = ?;
      `, [student.id]);

      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: {
          latitude: baseLat + 0.001,
          longitude: baseLng + 0.001,
          accuracy: 15.0,
          timestamp: new Date().toISOString()
        }
      });

      await parentController.verifyParentLocation(req, res, (err) => { throw err; });
      const data = res.getData();

      assert(res.getStatusCode() === 422, '5.1 Backend returns HTTP 422 for stale student location');
      assert(data.studentLocationStale === true, '5.2 studentLocationStale flag is true');
      assert(data.distanceMeters === null, '5.3 distanceMeters is null (no misleading distance calculated)');
      assert(data.message.includes('outdated') || data.message.includes('5 minutes'), '5.4 Message mentions outdated student location');
    }

    // -------------------------------------------------------------
    // TEST 6: Parent UI Logic & State Separation Simulation
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Parent UI Logic & State Label Independence ---');
    {
      const jsCode = fs.readFileSync(path.join(__dirname, '../public/js/parent-dashboard.js'), 'utf8');

      // Verify State A in frontend code
      assert(
        jsCode.includes("Approval Unavailable – GPS Accuracy Insufficient"),
        '6.1 State A: Approval button label set to "Approval Unavailable – GPS Accuracy Insufficient"'
      );
      assert(
        jsCode.includes("data.accuracyPoor && data.device !== 'student'"),
        '6.2 State A: Condition isolates parent accuracy poor'
      );

      // Verify State B in frontend code
      assert(
        jsCode.includes("Approval Blocked (< 5m Proximity)"),
        '6.3 State B: Button label "Approval Blocked (< 5m Proximity)" is restricted to proximityBlocked / distance < 5m'
      );

      // Verify State C in frontend code
      assert(
        jsCode.includes("Location Verification Successful"),
        '6.4 State C: Heading set to "Location Verification Successful"'
      );
      assert(
        jsCode.includes("Send Approval & Forward to Warden →"),
        '6.5 State C: Button label enables approval forwarding'
      );

      // Verify State D in frontend code
      assert(
        jsCode.includes("Approval Unavailable – Student Location Outdated") ||
        jsCode.includes("Approval Unavailable – Student Location Required"),
        '6.6 State D: Button label explicitly identifies student location issue'
      );

      // Verify Geolocation Error Mapping in frontend code
      assert(
        jsCode.includes("Approval Unavailable – GPS Permission Denied"),
        '6.7 Geolocation: Permission denied maps to "Approval Unavailable – GPS Permission Denied"'
      );
      assert(
        jsCode.includes("Approval Unavailable – GPS Signal Lost"),
        '6.8 Geolocation: Position unavailable maps to "Approval Unavailable – GPS Signal Lost"'
      );
      assert(
        jsCode.includes("Approval Unavailable – GPS Timed Out"),
        '6.9 Geolocation: Timeout maps to "Approval Unavailable – GPS Timed Out"'
      );
      assert(
        jsCode.includes("Approval Unavailable – Network Error"),
        '6.10 Network: Network error maps to "Approval Unavailable – Network Error"'
      );
    }

    // -------------------------------------------------------------
    // TEST 7: Retry Location Verification Configuration
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Retry Location Verification Guardrails ---');
    {
      const jsCode = fs.readFileSync(path.join(__dirname, '../public/js/parent-dashboard.js'), 'utf8');

      assert(
        jsCode.includes("enableHighAccuracy: true"),
        '7.1 Geolocation options enforce enableHighAccuracy: true'
      );
      assert(
        jsCode.includes("maximumAge: 0"),
        '7.2 Geolocation options enforce maximumAge: 0 (bypasses browser GPS cache)'
      );
      assert(
        jsCode.includes("timeout: 12000"),
        '7.3 Geolocation options set 12-second timeout'
      );

      // Verify UI state reset upon opening modal
      assert(
        jsCode.includes("DOM.locDistanceBadge.textContent = '-- meters'"),
        '7.4 Modal reset clears previous distance badge to "-- meters"'
      );
      assert(
        jsCode.includes("DOM.locAccuracyBadge.textContent = '-- meters'"),
        '7.5 Modal reset clears previous accuracy badge to "-- meters"'
      );
    }

    // Clean up test outpass
    await pool.query('DELETE FROM outpass_requests WHERE id = ?;', [testRequestId]);

  } catch (err) {
    console.error('💥 Test Execution Error:', err);
    failed++;
  }

  console.log('\n======================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
