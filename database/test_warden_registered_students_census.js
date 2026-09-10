/**
 * Automated Verification: Warden Registered Students Directory & Year Census
 */
const http = require('http');
const mysql = require('mysql2/promise');
require('dotenv').config();

const BASE_URL = 'http://localhost:5001';

function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('===============================================================');
  console.log('🧪 TESTING WARDEN REGISTERED STUDENTS & YEAR CENSUS MODULE');
  console.log('===============================================================\n');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_hostel_outpass',
    waitForConnections: true,
    connectionLimit: 5
  });

  try {
    // 1. Ensure students with Year 1, 2, 3, 4 exist for comprehensive verification
    console.log('1. Setting up students with distinct years (1, 2, 3, 4)...');
    const [students] = await pool.execute('SELECT id, name, reg_no, year_of_study FROM students ORDER BY id ASC LIMIT 8');
    console.log(`Found ${students.length} existing students in DB.`);

    if (students.length >= 4) {
      // Set distinct years across first 4 students
      await pool.execute('UPDATE students SET year_of_study = 1 WHERE id = ?', [students[0].id]);
      await pool.execute('UPDATE students SET year_of_study = 2 WHERE id = ?', [students[1].id]);
      await pool.execute('UPDATE students SET year_of_study = 3 WHERE id = ?', [students[2].id]);
      await pool.execute('UPDATE students SET year_of_study = 4 WHERE id = ?', [students[3].id]);
      console.log('Assigned Years 1, 2, 3, 4 to test students successfully.');
    }

    // 2. Login as Warden
    console.log('\n2. Logging in as Warden...');
    const wardenLogin = await makeRequest('POST', '/api/auth/login', {
      username: 'warden@hostel.edu',
      password: 'Password@123',
      role: 'warden'
    });

    if (wardenLogin.status !== 200 || !wardenLogin.body.token) {
      throw new Error(`Warden login failed: ${JSON.stringify(wardenLogin.body)}`);
    }
    const wardenToken = wardenLogin.body.token;
    console.log('✅ Warden logged in successfully.');

    // 3. Test GET /api/outpass/warden/registered-students/stats
    console.log('\n3. Testing GET /api/outpass/warden/registered-students/stats...');
    const statsRes = await makeRequest('GET', '/api/outpass/warden/registered-students/stats', null, wardenToken);
    console.log('Status:', statsRes.status);
    console.log('Total students:', statsRes.body.stats?.totalStudents);
    console.log('Year counts:', JSON.stringify(statsRes.body.stats?.yearCounts));
    console.log('Departments:', statsRes.body.stats?.departments);

    if (statsRes.status !== 200 || !statsRes.body.success) {
      throw new Error('Stats endpoint returned failure');
    }
    if (typeof statsRes.body.stats?.yearCounts?.year1 !== 'number' ||
        typeof statsRes.body.stats?.yearCounts?.year2 !== 'number' ||
        typeof statsRes.body.stats?.yearCounts?.year3 !== 'number' ||
        typeof statsRes.body.stats?.yearCounts?.year4 !== 'number') {
      throw new Error('Stats missing yearCounts fields');
    }
    console.log('✅ Census stats endpoint verified with 1st, 2nd, 3rd, 4th year counts!');

    // 4. Test GET /api/outpass/warden/registered-students (unfiltered)
    console.log('\n4. Testing GET /api/outpass/warden/registered-students...');
    const listRes = await makeRequest('GET', '/api/outpass/warden/registered-students?page=1&limit=10', null, wardenToken);
    console.log('Status:', listRes.status);
    console.log('Retrieved students count:', listRes.body.students?.length);
    console.log('Pagination info:', JSON.stringify(listRes.body.pagination));

    if (listRes.status !== 200 || !listRes.body.success || !Array.isArray(listRes.body.students)) {
      throw new Error('Students listing failed');
    }
    console.log('✅ Student listing verified with pagination!');

    // 5. Test Filtering by Year 1
    console.log('\n5. Testing GET /api/outpass/warden/registered-students?year=1...');
    const year1Res = await makeRequest('GET', '/api/outpass/warden/registered-students?year=1', null, wardenToken);
    console.log('Status:', year1Res.status);
    console.log('Year 1 results:', year1Res.body.students?.length);
    const nonYear1 = year1Res.body.students.filter(s => s.yearOfStudy !== 1);
    if (nonYear1.length > 0) {
      throw new Error(`Year filter failed: found non-year 1 students: ${JSON.stringify(nonYear1)}`);
    }
    console.log('✅ Year 1 filter returned ONLY 1st year students!');

    // 6. Test Filtering by Year 2, 3, 4
    for (let yr = 2; yr <= 4; yr++) {
      const yrRes = await makeRequest('GET', `/api/outpass/warden/registered-students?year=${yr}`, null, wardenToken);
      const invalid = yrRes.body.students.filter(s => s.yearOfStudy !== yr);
      if (invalid.length > 0) {
        throw new Error(`Year filter failed for year ${yr}`);
      }
      console.log(`✅ Year ${yr} filter returned ONLY year ${yr} students (${yrRes.body.students.length} found).`);
    }

    // 7. Test Search Query
    console.log('\n7. Testing student search by registration number...');
    const firstStudent = listRes.body.students[0];
    const searchRes = await makeRequest('GET', `/api/outpass/warden/registered-students?search=${encodeURIComponent(firstStudent.regNo)}`, null, wardenToken);
    console.log(`Search for regNo "${firstStudent.regNo}": found ${searchRes.body.students?.length} students.`);
    if (searchRes.body.students.length === 0 || searchRes.body.students[0].regNo !== firstStudent.regNo) {
      throw new Error('Search by registration number failed');
    }
    console.log('✅ Search by registration number verified!');

    // 8. Test Role Authorization (Student cannot access warden registered students endpoint)
    console.log('\n8. Testing Role Authorization (Student token on Warden endpoints)...');
    const [dbStudent] = await pool.execute('SELECT reg_no FROM students LIMIT 1');
    const studentLogin = await makeRequest('POST', '/api/auth/login', {
      username: dbStudent[0].reg_no,
      password: 'Password@123',
      role: 'student'
    });

    if (studentLogin.status === 200 && studentLogin.body.token) {
      const studentToken = studentLogin.body.token;
      const unauthRes = await makeRequest('GET', '/api/outpass/warden/registered-students', null, studentToken);
      console.log('Student access response status:', unauthRes.status);
      if (unauthRes.status === 403) {
        console.log('✅ Access denied with HTTP 403 Forbidden for unauthorized student token!');
      } else {
        throw new Error(`Expected 403 Forbidden, received: ${unauthRes.status}`);
      }
    }

    console.log('\n===============================================================');
    console.log('🎉 ALL REGISTERED STUDENTS & CENSUS TESTS PASSED WITH 100% SUCCESS!');
    console.log('===============================================================');

  } catch (err) {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
