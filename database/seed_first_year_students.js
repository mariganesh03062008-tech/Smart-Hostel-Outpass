const { pool } = require('../utils/db');
const bcrypt = require('bcrypt');

async function seedFirstYear() {
  console.log('Seeding 1st Year students for census...');
  const defaultPassword = 'Password@123';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // Ensure parent exists
  let [parents] = await pool.query('SELECT id FROM parents WHERE primary_phone = ?', ['9876543210']);
  let parentId;
  if (parents.length > 0) {
    parentId = parents[0].id;
  } else {
    const [res] = await pool.query(`
      INSERT INTO parents (father_name, mother_name, primary_phone, email, password_hash)
      VALUES ('Sundaram K', 'Lakshmi S', '9876543299', 'sundaram@example.com', ?)
    `, [passwordHash]);
    parentId = res.insertId;
  }

  // Ensure an advisor
  const [advisors] = await pool.query('SELECT id FROM staff WHERE role = "class_advisor" LIMIT 1');
  const advisorId = advisors.length > 0 ? advisors[0].id : null;

  const firstYearStudents = [
    { reg: '24CS001', name: 'Aakash Kumar', dept: 'Computer Science & Engineering', room: 'A-101', block: 'Block A' },
    { reg: '24CS015', name: 'Bhavani Shankar', dept: 'Computer Science & Engineering', room: 'A-102', block: 'Block A' },
    { reg: '24EC004', name: 'Chandran Mohan', dept: 'Electronics & Communication', room: 'A-103', block: 'Block A' },
    { reg: '24EC022', name: 'Divya Bharathi', dept: 'Electronics & Communication', room: 'C-101', block: 'Block C' },
    { reg: '24IT008', name: 'Eashwar Prasad', dept: 'Information Technology', room: 'A-104', block: 'Block A' },
    { reg: '24ME012', name: 'Farhan Akhtar', dept: 'Mechanical Engineering', room: 'B-101', block: 'Block B' },
    { reg: '24CE003', name: 'Gokul Nath', dept: 'Civil Engineering', room: 'B-102', block: 'Block B' },
    { reg: '24EE009', name: 'Hariharan S', dept: 'Electrical & Electronics', room: 'B-103', block: 'Block B' }
  ];

  for (const s of firstYearStudents) {
    await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active, profile_completed)
      VALUES (?, ?, ?, ?, ?, 1, 'A', ?, ?, ?, ?, ?, 1, 1)
      ON DUPLICATE KEY UPDATE 
        year_of_study = 1,
        name = VALUES(name),
        department = VALUES(department);
    `, [
      s.reg,
      s.name,
      `${s.reg.toLowerCase()}@gce.edu`,
      `98765${Math.floor(10000 + Math.random() * 90000)}`,
      s.dept,
      s.room,
      s.block,
      parentId,
      advisorId,
      passwordHash
    ]);
  }

  const [count] = await pool.query('SELECT year_of_study, COUNT(*) as count FROM students GROUP BY year_of_study ORDER BY year_of_study');
  console.log('Updated student counts by year:', count);
  process.exit(0);
}

seedFirstYear().catch(err => {
  console.error(err);
  process.exit(1);
});
