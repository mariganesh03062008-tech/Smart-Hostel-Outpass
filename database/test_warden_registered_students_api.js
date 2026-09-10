const assert = require('assert');

const BASE_URL = 'http://localhost:5001';

async function run() {
  console.log('🧪 ========================================================');
  console.log('🏛️ TESTING WARDEN REGISTERED STUDENTS & YEAR CENSUS API');
  console.log('========================================================\n');

  // 1. Authenticate as Warden
  console.log('1. Authenticating as Warden WRD-101...');
  const wardenLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'warden',
      identifier: 'WRD-101',
      password: 'Password@123'
    })
  });
  const wardenLoginData = await wardenLoginRes.json();
  assert(wardenLoginRes.ok && wardenLoginData.success, 'Warden login failed');
  const wardenToken = wardenLoginData.token;
  console.log('  ✅ [PASS]: Warden logged in successfully.');

  // 2. Test Overview stats contains registeredTotal and registeredByYear
  console.log('\n2. Testing GET /api/outpass/warden/overview...');
  const overviewRes = await fetch(`${BASE_URL}/api/outpass/warden/overview`, {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const overviewData = await overviewRes.json();
  assert(overviewRes.ok && overviewData.success, 'Overview request failed');
  assert(overviewData.stats.registeredTotal > 0, `registeredTotal must be > 0: ${overviewData.stats.registeredTotal}`);
  assert(overviewData.stats.registeredByYear, 'registeredByYear must exist');
  console.log(`  ✅ [PASS]: Overview stats contains registeredTotal = ${overviewData.stats.registeredTotal}`);
  console.log(`  ✅ [PASS]: Overview stats year breakdown:`, overviewData.stats.registeredByYear);

  // 3. Test GET /api/outpass/warden/registered-students/stats
  console.log('\n3. Testing GET /api/outpass/warden/registered-students/stats...');
  const statsRes = await fetch(`${BASE_URL}/api/outpass/warden/registered-students/stats`, {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const statsData = await statsRes.json();
  assert(statsRes.ok && statsData.success, 'Census stats request failed');
  const stats = statsData.stats;
  assert(stats.totalStudents > 0, 'Total students must be > 0');
  assert(stats.yearCounts.year1 > 0, `Year 1 students must be > 0 (found ${stats.yearCounts.year1})`);
  assert(stats.yearCounts.year2 > 0, `Year 2 students must be > 0 (found ${stats.yearCounts.year2})`);
  assert(stats.yearCounts.year3 > 0, `Year 3 students must be > 0 (found ${stats.yearCounts.year3})`);
  assert(stats.yearCounts.year4 > 0, `Year 4 students must be > 0 (found ${stats.yearCounts.year4})`);
  console.log(`  ✅ [PASS]: Total registered students: ${stats.totalStudents}`);
  console.log(`  ✅ [PASS]: Year 1 (Freshmen): ${stats.yearCounts.year1}`);
  console.log(`  ✅ [PASS]: Year 2 (Sophomores): ${stats.yearCounts.year2}`);
  console.log(`  ✅ [PASS]: Year 3 (Pre-Final): ${stats.yearCounts.year3}`);
  console.log(`  ✅ [PASS]: Year 4 (Final Year): ${stats.yearCounts.year4}`);
  console.log(`  ✅ [PASS]: Departments listed (${stats.departments.length}):`, stats.departments);

  // 4. Test GET /api/outpass/warden/registered-students (All)
  console.log('\n4. Testing GET /api/outpass/warden/registered-students (All Students)...');
  const allRes = await fetch(`${BASE_URL}/api/outpass/warden/registered-students`, {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const allData = await allRes.json();
  assert(allRes.ok && allData.success, 'Registered students list request failed');
  assert(allData.students.length > 0, 'Students array must not be empty');
  const s0 = allData.students[0];
  assert(s0.regNo, 'Student must have regNo');
  assert(s0.name, 'Student must have name');
  assert(s0.yearOfStudy, 'Student must have yearOfStudy');
  assert(s0.department, 'Student must have department');
  console.log(`  ✅ [PASS]: Retrieved ${allData.students.length} students (Page 1). Sample student: ${s0.name} (${s0.regNo}) - Year ${s0.yearOfStudy}`);

  // 5. Test Year Filtering (year=1, year=2, year=3, year=4)
  console.log('\n5. Testing Filter by Year of Study...');
  for (let y = 1; y <= 4; y++) {
    const yRes = await fetch(`${BASE_URL}/api/outpass/warden/registered-students?year=${y}`, {
      headers: { 'Authorization': `Bearer ${wardenToken}` }
    });
    const yData = await yRes.json();
    assert(yRes.ok && yData.success, `Year ${y} filter request failed`);
    assert(yData.students.length > 0, `Year ${y} should have students`);
    const allMatch = yData.students.every(s => Number(s.yearOfStudy) === y);
    assert(allMatch, `All students in year=${y} query must strictly have yearOfStudy === ${y}`);
    console.log(`  ✅ [PASS]: Year ${y} Filter returned ${yData.students.length} students. Strict year check passed.`);
  }

  // 6. Test Search Query
  console.log('\n6. Testing Search Query (?search=21CS042)...');
  const searchRes = await fetch(`${BASE_URL}/api/outpass/warden/registered-students?search=21CS042`, {
    headers: { 'Authorization': `Bearer ${wardenToken}` }
  });
  const searchData = await searchRes.json();
  assert(searchRes.ok && searchData.success, 'Search request failed');
  assert(searchData.students.some(s => s.regNo === '21CS042'), 'Should find 21CS042');
  console.log(`  ✅ [PASS]: Search found student 21CS042 correctly.`);

  // 7. Security & Authorization: Non-Warden access should be rejected with 403 Forbidden
  console.log('\n7. Testing Security & Role Authorization Guardrails...');
  const studentLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'student',
      identifier: '21CS042',
      password: 'Password@123'
    })
  });
  const studentLoginData = await studentLoginRes.json();
  const studentToken = studentLoginData.token;

  const forbiddenRes = await fetch(`${BASE_URL}/api/outpass/warden/registered-students`, {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(forbiddenRes.status === 403, `Expected 403 Forbidden for Student accessing Warden module, got ${forbiddenRes.status}`);
  console.log(`  ✅ [PASS]: Unauthorized role access strictly blocked with HTTP 403 Forbidden.`);

  console.log('\n========================================================');
  console.log('🏁 ALL WARDEN REGISTERED STUDENTS API TESTS PASSED! (100%)');
  console.log('========================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
