/**
 * Comprehensive Automated Verification Suite (Section 11: Tests A through O)
 * Smart Hostel Outpass System - Student Live GPS & Parent Proximity Security Verification
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../utils/db');
const parentController = require('../controllers/parentController');
const outpassController = require('../controllers/outpassController');

// Test helper: simulate Express req/res
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

async function runVerificationSuite() {
  console.log('======================================================================');
  console.log('🧪 RUNNING MANDATORY VERIFICATION SUITE (TESTS A THROUGH O)');
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
    // 1. Fetch test parent and linked student
    const [parents] = await pool.query('SELECT * FROM parents LIMIT 1;');
    if (parents.length === 0) throw new Error('No parents found in database');
    const parent = parents[0];

    const [students] = await pool.query('SELECT * FROM students WHERE parent_id = ? LIMIT 1;', [parent.id]);
    if (students.length === 0) throw new Error('Student not found for parent_id = ' + parent.id);
    const student = students[0];

    const parentDisplayName = parent.father_name || parent.mother_name || 'Parent';
    console.log(`[Context] Parent: ${parentDisplayName} (Phone: ${parent.primary_phone}) -> Student: ${student.name} (Reg: ${student.reg_no})\n`);

    // Create a fresh test outpass request
    const testRequestCode = 'TEST-REQ-' + Math.floor(1000 + Math.random() * 9000);
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

    // -------------------------------------------------------------
    // TEST A: Student Location Available (Live submission works)
    // -------------------------------------------------------------
    console.log('--- TEST A: Student Live Location Submission ---');
    {
      const { req, res } = mockReqRes({
        user: { id: student.id, role: 'student' },
        body: {
          latitude: baseLat,
          longitude: baseLng,
          accuracy: 4.5,
          captured_at: new Date().toISOString(),
          source: 'browser_gps'
        }
      });
      await outpassController.updateStudentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 200 && data.success, 'Student location API responds with HTTP 200');
      assert(data.location && data.location.accuracy === 4.5, 'Student location recorded with accuracy');

      // Verify in database
      const [rows] = await pool.query('SELECT * FROM student_locations WHERE student_id = ?', [student.id]);
      assert(rows.length > 0 && Number(rows[0].latitude) === baseLat, 'student_locations table updated with live coordinates');
    }

    // -------------------------------------------------------------
    // TEST B: Student Location Unavailable / Missing
    // -------------------------------------------------------------
    console.log('\n--- TEST B: Student Location Missing (No hardcoded fallback allowed) ---');
    {
      // Temporarily remove student location record
      await pool.query('DELETE FROM student_locations WHERE student_id = ?', [student.id]);

      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: 13.0500000, longitude: 80.0500000, accuracy: 5.0 }
      });
      await parentController.verifyParentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 422, 'Returns HTTP 422 when student location is unavailable');
      assert(data.success === false && data.locationVerified === false, 'locationVerified is false');
      assert(data.studentLocationMissing === true, 'studentLocationMissing flag is true without inventing fake location');
    }

    // -------------------------------------------------------------
    // TEST C: Student Location Validation (Reject invalid inputs / timeout)
    // -------------------------------------------------------------
    console.log('\n--- TEST C: Student Location Coordinate & Accuracy Validation ---');
    {
      // Test invalid latitude (> 90)
      const { req: reqBadLat, res: resBadLat } = mockReqRes({
        user: { id: student.id, role: 'student' },
        body: { latitude: 95.0, longitude: baseLng, accuracy: 5.0 }
      });
      await outpassController.updateStudentLocation(reqBadLat, resBadLat);
      assert(resBadLat.getStatusCode() === 400, 'Rejects latitude > 90 with HTTP 400');

      // Test invalid longitude (> 180)
      const { req: reqBadLng, res: resBadLng } = mockReqRes({
        user: { id: student.id, role: 'student' },
        body: { latitude: baseLat, longitude: 195.0, accuracy: 5.0 }
      });
      await outpassController.updateStudentLocation(reqBadLng, resBadLng);
      assert(resBadLng.getStatusCode() === 400, 'Rejects longitude > 180 with HTTP 400');

      // Test non-positive accuracy
      const { req: reqBadAcc, res: resBadAcc } = mockReqRes({
        user: { id: student.id, role: 'student' },
        body: { latitude: baseLat, longitude: baseLng, accuracy: -2.0 }
      });
      await outpassController.updateStudentLocation(reqBadAcc, resBadAcc);
      assert(resBadAcc.getStatusCode() === 400, 'Rejects non-positive accuracy with HTTP 400');
    }

    // -------------------------------------------------------------
    // TEST D: Student Location Stale (> 5 minutes old)
    // -------------------------------------------------------------
    console.log('\n--- TEST D: Stale Student Location Protection (> 5 Minutes) ---');
    {
      // Insert location with timestamp 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      await pool.query(`
        INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
        VALUES (?, ?, ?, 4.0, ?, 'test_stale')
        ON DUPLICATE KEY UPDATE latitude = ?, longitude = ?, accuracy = 4.0, captured_at = ?, updated_at = ?;
      `, [student.id, baseLat, baseLng, tenMinutesAgo, baseLat, baseLng, tenMinutesAgo, tenMinutesAgo]);

      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: 13.0500000, longitude: 80.0500000, accuracy: 5.0 }
      });
      await parentController.verifyParentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 422, 'Returns HTTP 422 for stale student location');
      assert(data.studentLocationStale === true, 'studentLocationStale flag is true');
      assert(data.maxAgeMinutes === 5, 'Freshness threshold is 5 minutes');
    }

    // Set student location to fresh now
    await pool.query(`
      INSERT INTO student_locations (student_id, latitude, longitude, accuracy, captured_at, source)
      VALUES (?, ?, ?, 3.0, NOW(), 'browser_gps')
      ON DUPLICATE KEY UPDATE latitude = ?, longitude = ?, accuracy = 3.0, captured_at = NOW(), updated_at = NOW();
    `, [student.id, baseLat, baseLng, baseLat, baseLng]);

    // -------------------------------------------------------------
    // TEST E: Parent Location Available
    // -------------------------------------------------------------
    console.log('\n--- TEST E: Parent Location Available ---');
    {
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: baseLat + 0.00044966, longitude: baseLng, accuracy: 4.0 }
      });
      await parentController.verifyParentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 200 && data.locationVerified === true, 'Parent location accepted and proximity verified');
    }

    // -------------------------------------------------------------
    // TEST F: Parent Location Missing / Permission Denied
    // -------------------------------------------------------------
    console.log('\n--- TEST F: Parent Location Missing / Denied ---');
    {
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: {} // No coordinates
      });
      await parentController.verifyParentLocation(req, res);
      assert(res.getStatusCode() === 400, 'Returns HTTP 400 when parent coordinates are missing');
    }

    // -------------------------------------------------------------
    // TEST G: GPS Accuracy Insufficient (> 50m)
    // -------------------------------------------------------------
    console.log('\n--- TEST G: GPS Accuracy Threshold Checks (> 50m) ---');
    {
      // G1: Parent GPS accuracy poor
      const { req: reqParentPoor, res: resParentPoor } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: baseLat + 0.0005, longitude: baseLng, accuracy: 65.0 }
      });
      await parentController.verifyParentLocation(reqParentPoor, resParentPoor);
      const dataParentPoor = resParentPoor.getData();
      assert(resParentPoor.getStatusCode() === 422, 'Returns HTTP 422 when parent GPS accuracy > 50m');
      assert(dataParentPoor.accuracyPoor === true && dataParentPoor.device === 'parent', 'Identifies parent accuracy insufficient');

      // G2: Student GPS accuracy poor
      await pool.query('UPDATE student_locations SET accuracy = 75.0 WHERE student_id = ?;', [student.id]);
      const { req: reqStudentPoor, res: resStudentPoor } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: baseLat + 0.0005, longitude: baseLng, accuracy: 5.0 }
      });
      await parentController.verifyParentLocation(reqStudentPoor, resStudentPoor);
      const dataStudentPoor = resStudentPoor.getData();
      assert(resStudentPoor.getStatusCode() === 422, 'Returns HTTP 422 when student GPS accuracy > 50m');
      assert(dataStudentPoor.accuracyPoor === true && dataStudentPoor.device === 'student', 'Identifies student accuracy insufficient');

      // Reset student accuracy to 3.0m
      await pool.query('UPDATE student_locations SET accuracy = 3.0, captured_at = NOW() WHERE student_id = ?;', [student.id]);
    }

    // -------------------------------------------------------------
    // TEST H: Distance = 1 meter -> BLOCK
    // -------------------------------------------------------------
    console.log('\n--- TEST H: Distance = 1 Meter (Strictly < 5m -> BLOCK) ---');
    {
      const deltaLat1m = 0.00000899;
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: baseLat + deltaLat1m, longitude: baseLng, accuracy: 3.0 }
      });
      await parentController.verifyParentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 403, 'Returns HTTP 403 for 1-meter proximity');
      assert(data.proximityBlocked === true, 'proximityBlocked is true');
      assert(data.distanceMeters === 1, `Calculated distance is 1 meter (got ${data.distanceMeters}m)`);
    }

    // -------------------------------------------------------------
    // TEST I: Distance = 4.99 meters -> BLOCK
    // -------------------------------------------------------------
    console.log('\n--- TEST I: Distance = 4.99 Meters (Strictly < 5m -> BLOCK) ---');
    {
      const deltaLat4_99m = 0.000044875;
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: baseLat + deltaLat4_99m, longitude: baseLng, accuracy: 3.0 }
      });
      await parentController.verifyParentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 403, 'Returns HTTP 403 for 4.99-meter proximity');
      assert(data.proximityBlocked === true, 'proximityBlocked is true');
      assert(data.distanceMeters === 4.99, `Calculated distance is 4.99 meters (got ${data.distanceMeters}m)`);
    }

    // -------------------------------------------------------------
    // TEST J: Distance = 5.00 meters -> ALLOW
    // -------------------------------------------------------------
    console.log('\n--- TEST J: Distance = 5.00 Meters (>= 5m -> ALLOW) ---');
    let token5m = null;
    {
      const deltaLat5m = 0.000044966;
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: baseLat + deltaLat5m, longitude: baseLng, accuracy: 3.0 }
      });
      await parentController.verifyParentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 200, 'Returns HTTP 200 for 5.00-meter proximity');
      assert(data.locationVerified === true, 'locationVerified is true');
      assert(data.distanceMeters === 5, `Calculated distance is exactly 5 meters (got ${data.distanceMeters}m)`);
      assert(typeof data.verificationToken === 'string', 'Issued verification token');
      token5m = data.verificationToken;
    }

    // -------------------------------------------------------------
    // TEST K: Distance = 5.01 meters -> ALLOW
    // -------------------------------------------------------------
    console.log('\n--- TEST K: Distance = 5.01 Meters (>= 5m -> ALLOW) ---');
    {
      const deltaLat5_01m = 0.000045056;
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: baseLat + deltaLat5_01m, longitude: baseLng, accuracy: 3.0 }
      });
      await parentController.verifyParentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 200, 'Returns HTTP 200 for 5.01-meter proximity');
      assert(data.locationVerified === true, 'locationVerified is true');
      assert(data.distanceMeters === 5.01, `Calculated distance is 5.01 meters (got ${data.distanceMeters}m)`);
    }

    // -------------------------------------------------------------
    // TEST L: Distance = 50.0 meters -> ALLOW
    // -------------------------------------------------------------
    console.log('\n--- TEST L: Distance = 50.0 Meters (>= 5m -> ALLOW) ---');
    let token50m = null;
    {
      const deltaLat50m = 0.000449660;
      const { req, res } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { latitude: baseLat + deltaLat50m, longitude: baseLng, accuracy: 3.0 }
      });
      await parentController.verifyParentLocation(req, res);
      const data = res.getData();
      assert(res.getStatusCode() === 200, 'Returns HTTP 200 for 50.0-meter proximity');
      assert(data.locationVerified === true, 'locationVerified is true');
      assert(data.distanceMeters === 50, `Calculated distance is 50 meters (got ${data.distanceMeters}m)`);
      assert(typeof data.verificationToken === 'string', 'Issued verification token');
      token50m = data.verificationToken;
    }

    // -------------------------------------------------------------
    // TEST M: Reuse of approval verification token -> BLOCK
    // -------------------------------------------------------------
    console.log('\n--- TEST M: Reuse of Verification Token (Replay Attack Prevention) ---');
    {
      // First use: approve successfully
      const { req: reqApprove1, res: resApprove1 } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { verification_token: token50m, parent_message: 'Approved safe travel.' }
      });
      await parentController.approveOutpass(reqApprove1, resApprove1);
      assert(resApprove1.getStatusCode() === 200, 'Initial token approval succeeds');

      // Second use (Replay attempt)
      const { req: reqApprove2, res: resApprove2 } = mockReqRes({
        user: { id: parent.id, role: 'parent' },
        params: { id: testRequestId },
        body: { verification_token: token50m, parent_message: 'Replay attempt' }
      });
      await parentController.approveOutpass(reqApprove2, resApprove2);
      assert(resApprove2.getStatusCode() === 403 || resApprove2.getStatusCode() === 400, 'Reusing consumed token is BLOCKED');
    }

    // -------------------------------------------------------------
    // TEST N: Parent Mobile Strictly from Authenticated DB Account
    // -------------------------------------------------------------
    console.log('\n--- TEST N: Parent Mobile Bound from Authenticated Database Record ---');
    {
      const [dbRows] = await pool.query('SELECT parent_verified_mobile FROM outpass_requests WHERE id = ?;', [testRequestId]);
      assert(dbRows.length > 0, 'Outpass record found');
      assert(dbRows[0].parent_verified_mobile === parent.primary_phone, `Stored mobile (${dbRows[0].parent_verified_mobile}) matches DB record (${parent.primary_phone})`);
    }

    // -------------------------------------------------------------
    // TEST O: No Hard-Coded Fallback Coordinates Anywhere in Project
    // -------------------------------------------------------------
    console.log('\n--- TEST O: Search Entire Project for Hard-Coded Fallback Coordinates ---');
    {
      const projectRoot = path.resolve(__dirname, '..');
      const filesToCheck = [];

      function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.gemini') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (/\.(js|html|sql)$/i.test(entry.name)) {
            // Ignore this test script itself
            if (entry.name !== 'test_parent_location_verification.js') {
              filesToCheck.push(fullPath);
            }
          }
        }
      }

      scanDir(projectRoot);
      let hardcodedMatches = 0;
      const forbiddenPattern = /(13\.0108|80\.2354)/;

      for (const file of filesToCheck) {
        const content = fs.readFileSync(file, 'utf8');
        if (forbiddenPattern.test(content)) {
          console.error(`  ❌ Found hardcoded coordinates in: ${path.relative(projectRoot, file)}`);
          hardcodedMatches++;
        }
      }

      assert(hardcodedMatches === 0, `Zero hardcoded fallback coordinates found across ${filesToCheck.length} project files`);
    }

    // Clean up test outpass request
    await pool.query('DELETE FROM outpass_requests WHERE id = ?;', [testRequestId]);

    console.log('\n======================================================================');
    console.log(`📊 FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================\n');

    return failed === 0;

  } catch (err) {
    console.error('Fatal error during test suite execution:', err);
    return false;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runVerificationSuite().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runVerificationSuite };
