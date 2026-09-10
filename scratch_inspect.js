const { pool } = require('./utils/db');

async function inspect() {
  const [students] = await pool.query(`
    SELECT s.id, s.reg_no, s.name, s.department, s.parent_id, s.class_advisor_id, 
           p.primary_phone, adv.id AS adv_id, adv.staff_id AS adv_staff_id, adv.name AS adv_name
    FROM students s
    LEFT JOIN parents p ON s.parent_id = p.id
    LEFT JOIN staff adv ON s.class_advisor_id = adv.id
    ORDER BY s.id ASC LIMIT 10
  `);
  console.log('STUDENTS:', JSON.stringify(students, null, 2));

  const [advisors] = await pool.query(`
    SELECT id, staff_id, name, role, department 
    FROM staff 
    WHERE role = 'class_advisor'
  `);
  console.log('ALL ADVISORS:', JSON.stringify(advisors, null, 2));

  const [principals] = await pool.query(`
    SELECT id, staff_id, name, role, department 
    FROM staff 
    WHERE role = 'principal' OR staff_id = 'PRC-001'
    LIMIT 5
  `);
  console.log('PRINCIPALS:', JSON.stringify(principals, null, 2));

  // Check recent outpass requests
  const [recentOutpasses] = await pool.query(`
    SELECT id, request_code, student_id, outpass_type, status, 
           parent_approval_status, parent_face_verified, advisor_approval_status, 
           principal_approval_status, created_at
    FROM outpass_requests
    ORDER BY id DESC LIMIT 10
  `);
  console.log('RECENT OUTPASSES:', JSON.stringify(recentOutpasses, null, 2));

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
