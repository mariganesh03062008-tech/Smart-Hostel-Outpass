const bcrypt = require('bcrypt');
const { pool } = require('../utils/db');

async function seedDatabase() {
  console.log('🌱 Seeding database with demo users for all 7 roles...');

  try {
    const defaultPassword = 'Password@123';
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

    // 1. Seed Parent
    console.log('Inserting demo Parent...');
    const [parentResult] = await pool.query(`
      INSERT INTO parents (father_name, mother_name, primary_phone, secondary_phone, email, address, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        father_name = VALUES(father_name),
        password_hash = VALUES(password_hash);
    `, ['Robert Doe', 'Mary Doe', '9876543210', '9876543211', 'parent@example.com', '42 Palm Avenue, Chennai, TN', passwordHash]);

    // Fetch parent ID
    const [parentRows] = await pool.query('SELECT id FROM parents WHERE primary_phone = ?', ['9876543210']);
    const parentId = parentRows[0].id;

    // 2. Seed Staff (Warden, Principal, Class Advisor, Caretaker, Watchman)
    const staffMembers = [
      {
        staff_id: 'WRD-101',
        name: 'Dr. Ramesh Kumar',
        email: 'warden@hostel.edu',
        phone: '9876500001',
        role: 'warden',
        department: 'Hostel Administration',
        hostel_block: 'Block A & B'
      },
      {
        staff_id: 'PRC-001',
        name: 'Dr. A. Sharma',
        email: 'principal@college.edu',
        phone: '9876500002',
        role: 'principal',
        department: 'College Administration',
        hostel_block: 'All Blocks'
      },
      {
        staff_id: 'ADV-204',
        name: 'Prof. S. Venkatesh',
        email: 'advisor@college.edu',
        phone: '9876500003',
        role: 'class_advisor',
        department: 'Computer Science & Engineering',
        hostel_block: 'Block A'
      },
      {
        staff_id: 'CTK-305',
        name: 'Mr. Murugan',
        email: 'caretaker@hostel.edu',
        phone: '9876500004',
        role: 'caretaker',
        department: 'Hostel Maintenance',
        hostel_block: 'Block A'
      },
      {
        staff_id: 'SEC-001',
        name: 'Mr. K. Selvam',
        email: 'security@college.edu',
        phone: '9876500005',
        role: 'watchman',
        department: 'Campus Security',
        hostel_block: 'Main Gate'
      }
    ];

    let advisorId = null;

    for (const staff of staffMembers) {
      console.log(`Inserting demo Staff (${staff.role}): ${staff.name} [${staff.staff_id}]...`);
      await pool.query(`
        INSERT INTO staff (staff_id, name, email, phone, role, department, hostel_block, password_hash, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, true)
        ON DUPLICATE KEY UPDATE 
          name = VALUES(name),
          role = VALUES(role),
          department = VALUES(department),
          password_hash = VALUES(password_hash),
          is_active = true;
      `, [staff.staff_id, staff.name, staff.email, staff.phone, staff.role, staff.department, staff.hostel_block, passwordHash]);

      if (staff.role === 'class_advisor') {
        const [advisorRows] = await pool.query('SELECT id FROM staff WHERE staff_id = ?', [staff.staff_id]);
        advisorId = advisorRows[0].id;
      }
    }

    // 3. Seed Students (CSE and Mech)
    console.log('Inserting demo Student 1 (CSE): John Doe [21CS042]...');
    await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        department = VALUES(department),
        year_of_study = VALUES(year_of_study),
        password_hash = VALUES(password_hash),
        parent_id = VALUES(parent_id),
        class_advisor_id = VALUES(class_advisor_id),
        is_active = true;
    `, ['21CS042', 'John Doe', 'john.doe@student.edu', '9876500010', 'Computer Science & Engineering', 3, 'A', 'A-304', 'Block A', parentId, advisorId, passwordHash]);

    console.log('Inserting demo Student 2 (Mech): Alex Smith [21ME018]...');
    await pool.query(`
      INSERT INTO students (reg_no, name, email, phone, department, year_of_study, section, room_no, hostel_block, parent_id, class_advisor_id, password_hash, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, true)
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        department = VALUES(department),
        year_of_study = VALUES(year_of_study),
        password_hash = VALUES(password_hash),
        parent_id = VALUES(parent_id),
        is_active = true;
    `, ['21ME018', 'Alex Smith', 'alex.smith@student.edu', '9876500018', 'Mechanical Engineering', 3, 'B', 'B-201', 'Block B', parentId, passwordHash]);

    console.log('\n=============================================================');
    console.log('🎉 Database seeded successfully with demo users!');
    console.log('🔑 Default Password for all demo accounts: Password@123');
    console.log('-------------------------------------------------------------');
    console.log('1. Student:       21CS042          | john.doe@student.edu');
    console.log('2. Parent:        9876543210       | parent@example.com');
    console.log('3. Warden:        WRD-101          | warden@hostel.edu');
    console.log('4. Principal:     PRC-001          | principal@college.edu');
    console.log('5. Class Advisor: ADV-204          | advisor@college.edu');
    console.log('6. Caretaker:     CTK-305          | caretaker@hostel.edu');
    console.log('7. Watchman:      SEC-001          | security@college.edu');
    console.log('=============================================================\n');

    return { success: true };
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
