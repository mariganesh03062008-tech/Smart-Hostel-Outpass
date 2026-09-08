const { pool } = require('../utils/db');

async function migrateOutpassSchema() {
  console.log('🔄 Checking and applying safe schema migrations for Outpass module...');

  try {
    // 1. Add semester and student_phone to students table if missing
    const [studentCols] = await pool.query('SHOW COLUMNS FROM students;');
    const studentColNames = studentCols.map(c => c.Field);

    if (!studentColNames.includes('semester')) {
      console.log('Adding semester column to students...');
      await pool.query('ALTER TABLE students ADD COLUMN semester VARCHAR(20) DEFAULT "Semester 6" AFTER year_of_study;');
    }

    // 2. Check outpass_requests columns
    const [outpassCols] = await pool.query('SHOW COLUMNS FROM outpass_requests;');
    const outpassColNames = outpassCols.map(c => c.Field);

    // Modify outpass_type to VARCHAR(50) to support 'normal', 'one_day_duty', etc.
    console.log('Modifying outpass_requests columns for flexibility...');
    await pool.query('ALTER TABLE outpass_requests MODIFY COLUMN outpass_type VARCHAR(50) NOT NULL DEFAULT "normal";');

    // Add duty specific columns if not present
    if (!outpassColNames.includes('semester')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN semester VARCHAR(20) NULL AFTER destination;');
    }
    if (!outpassColNames.includes('student_phone')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN student_phone VARCHAR(20) NULL AFTER semester;');
    }
    if (!outpassColNames.includes('event_name')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN event_name VARCHAR(200) NULL AFTER student_phone;');
    }
    if (!outpassColNames.includes('event_location')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN event_location VARCHAR(255) NULL AFTER event_name;');
    }
    if (!outpassColNames.includes('duty_date')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN duty_date DATE NULL AFTER event_location;');
    }
    if (!outpassColNames.includes('duty_description')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN duty_description TEXT NULL AFTER duty_date;');
    }
    if (!outpassColNames.includes('status')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT "PENDING_WARDEN" AFTER principal_approval_status;');
    } else {
      await pool.query('ALTER TABLE outpass_requests MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT "PENDING_WARDEN";');
    }

    // Check if index exists before creating
    const [indexes] = await pool.query("SHOW INDEX FROM outpass_requests WHERE Key_name = 'idx_outpass_req_status';");
    if (indexes.length === 0) {
      await pool.query('CREATE INDEX idx_outpass_req_status ON outpass_requests(status);');
    }

    console.log('✅ Schema migration completed safely without data loss.');
    return { success: true };
  } catch (error) {
    console.error('❌ Schema migration error:', error.message);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateOutpassSchema();
}

module.exports = { migrateOutpassSchema };
