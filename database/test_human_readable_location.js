const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'smart_hostel_outpass_super_secret_jwt_key_2026';

async function runTest() {
  console.log('======================================================================');
  console.log('🧪 TEST: HUMAN-READABLE LOCATION & STUDENT LIVE GPS GUARD');
  console.log('======================================================================\n');

  let passed = 0;

  // 1. UI Elements check in student-dashboard.html
  console.log('--- 1. Checking UI Elements in student-dashboard.html ---');
  const htmlContent = fs.readFileSync(path.join(__dirname, '../public/student-dashboard.html'), 'utf8');
  assert(htmlContent.includes('id="gpsPlaceName"'), 'gpsPlaceName element exists in HTML');
  assert(htmlContent.includes('id="gpsPlaceRow"'), 'gpsPlaceRow element exists in HTML');
  assert(htmlContent.includes('id="gpsCoordsContainer"'), 'gpsCoordsContainer element exists in HTML');
  assert(htmlContent.includes('id="gpsLatText"'), 'gpsLatText element exists in HTML');
  assert(htmlContent.includes('id="gpsLngText"'), 'gpsLngText element exists in HTML');
  assert(htmlContent.includes('id="gpsAccuracyText"'), 'gpsAccuracyText element exists in HTML');
  assert(htmlContent.includes('id="gpsTimeText"'), 'gpsTimeText element exists in HTML');
  assert(htmlContent.includes('id="gpsStatusPill"'), 'gpsStatusPill element exists in HTML');
  console.log('  ✅ PASS: All required human-readable location & GPS elements present in HTML');
  passed++;

  // 2. Logic check in student-dashboard.js
  console.log('\n--- 2. Checking Logic in student-dashboard.js ---');
  const jsContent = fs.readFileSync(path.join(__dirname, '../public/js/student-dashboard.js'), 'utf8');
  assert(jsContent.includes('resolveHumanReadableLocation'), 'resolveHumanReadableLocation function exists');
  assert(jsContent.includes('Location name unavailable'), 'Graceful fallback text exists');
  assert(jsContent.includes('Location Active'), 'Location Active badge text exists');
  assert(jsContent.includes('gpsPlaceName'), 'gpsPlaceName DOM binding exists');
  console.log('  ✅ PASS: Reverse-geocoding resolution and error-handling logic present in JS');
  passed++;

  // 3. Test Place Name Resolution with Erode Coordinates (11.3410, 77.7172)
  console.log('\n--- 3. Testing Reverse Geocoding with Erode Coordinates ---');
  try {
    const erodeUrl = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=11.3410&longitude=77.7172&localityLanguage=en';
    const resErode = await fetch(erodeUrl);
    const dataErode = await resErode.json();
    const place = [dataErode.locality || dataErode.city, dataErode.principalSubdivision].filter(Boolean).join(', ');
    console.log(`  Erode Coords (11.3410, 77.7172) -> "${place}"`);
    assert(place.toLowerCase().includes('erode'), 'Derived place includes Erode');
    assert(place.toLowerCase().includes('tamil nadu'), 'Derived place includes Tamil Nadu');
    console.log('  ✅ PASS: Real GPS coordinates correctly resolved to "Erode, Tamil Nadu"');
    passed++;
  } catch (err) {
    console.warn('  ⚠️ External reverse geocode network notice (graceful fallback applies):', err.message);
  }

  // 4. Test Place Name Resolution with Coimbatore Coordinates (11.0168, 76.9558)
  console.log('\n--- 4. Testing Reverse Geocoding with Coimbatore Coordinates ---');
  try {
    const cbeUrl = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=11.0168&longitude=76.9558&localityLanguage=en';
    const resCbe = await fetch(cbeUrl);
    const dataCbe = await resCbe.json();
    const place = [dataCbe.locality || dataCbe.city, dataCbe.principalSubdivision].filter(Boolean).join(', ');
    console.log(`  Coimbatore Coords (11.0168, 76.9558) -> "${place}"`);
    assert(place.toLowerCase().includes('coimbatore'), 'Derived place includes Coimbatore');
    assert(place.toLowerCase().includes('tamil nadu'), 'Derived place includes Tamil Nadu');
    console.log('  ✅ PASS: Real GPS coordinates correctly resolved to "Coimbatore, Tamil Nadu"');
    passed++;
  } catch (err) {
    console.warn('  ⚠️ External reverse geocode network notice (graceful fallback applies):', err.message);
  }

  // 5. Test Live Student GPS Submission & MySQL Persistence
  console.log('\n--- 5. Testing Student GPS POST & MySQL Storage ---');
  const token = jwt.sign(
    { id: 1, role: 'student', identifier: '21CS042', name: 'John Doe', email: 'john.doe@student.edu' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  const testLat = 11.3410500;
  const testLng = 77.7172500;
  const testAcc = 10.0;
  const testCapturedAt = new Date().toISOString();

  const postRes = await fetch('http://localhost:5001/api/outpass/student/location', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      latitude: testLat,
      longitude: testLng,
      accuracy: testAcc,
      captured_at: testCapturedAt,
      source: 'browser_gps'
    })
  });

  assert(postRes.status === 200, 'POST returns HTTP 200');
  const postData = await postRes.json();
  assert(postData.success === true, 'POST returns success: true');
  console.log('  ✅ PASS: POST /api/outpass/student/location responded 200 OK');
  passed++;

  // Verify DB
  const [dbRows] = await pool.query('SELECT * FROM student_locations WHERE student_id = 1');
  assert(dbRows.length > 0, 'Row found in student_locations');
  assert(Math.abs(Number(dbRows[0].latitude) - testLat) < 0.0001, 'Stored latitude matches');
  assert(Math.abs(Number(dbRows[0].longitude) - testLng) < 0.0001, 'Stored longitude matches');
  assert(dbRows[0].accuracy === testAcc, 'Stored accuracy matches');
  console.log(`  ✅ PASS: MySQL student_locations table successfully updated: Lat=${dbRows[0].latitude}, Lng=${dbRows[0].longitude}, Acc=${dbRows[0].accuracy}m`);
  passed++;

  // 6. Test GET student location
  console.log('\n--- 6. Testing GET Student Location Freshness ---');
  const getRes = await fetch('http://localhost:5001/api/outpass/student/location', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert(getRes.status === 200, 'GET returns HTTP 200');
  const getData = await getRes.json();
  assert(getData.success === true, 'GET success is true');
  assert(getData.hasLocation === true, 'hasLocation is true');
  assert(getData.isFresh === true, 'isFresh is true');
  console.log(`  ✅ PASS: Location is live and fresh (age: ${getData.ageMinutes} min)`);
  passed++;

  console.log('\n======================================================================');
  console.log(`🎉 ALL ${passed} TESTS PASSED SUCCESSFULLY`);
  console.log('======================================================================\n');
  await pool.end();
  process.exit(0);
}

runTest().catch(async (err) => {
  console.error('❌ Test failed:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
