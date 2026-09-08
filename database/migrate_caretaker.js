const { pool } = require('../utils/db');

async function migrateCaretakerSchema() {
  console.log('🔄 Checking and applying schema enhancements for Caretaker Exit Scanner module...');

  try {
    // 1. Check students table for current_hostel_status
    const [stuCols] = await pool.query('SHOW COLUMNS FROM students;');
    const stuColNames = stuCols.map(c => c.Field);

    if (!stuColNames.includes('current_hostel_status')) {
      console.log('Adding current_hostel_status column to students...');
      await pool.query("ALTER TABLE students ADD COLUMN current_hostel_status ENUM('INSIDE', 'OUTSIDE') DEFAULT 'INSIDE' AFTER is_active;");
    }

    // 2. Check exit_logs table for qr_id
    const [exitCols] = await pool.query('SHOW COLUMNS FROM exit_logs;');
    const exitColNames = exitCols.map(c => c.Field);

    if (!exitColNames.includes('qr_id')) {
      console.log('Adding qr_id column to exit_logs...');
      await pool.query('ALTER TABLE exit_logs ADD COLUMN qr_id INT NULL AFTER id;');
      try {
        await pool.query('ALTER TABLE exit_logs ADD CONSTRAINT fk_exit_qr FOREIGN KEY (qr_id) REFERENCES qr_codes(id) ON DELETE SET NULL;');
      } catch (e) {}
    }

    // 3. Check outpass_requests for exit_time, return_time, checkpoint status
    const [outCols] = await pool.query('SHOW COLUMNS FROM outpass_requests;');
    const outColNames = outCols.map(c => c.Field);

    if (!outColNames.includes('exit_time')) {
      console.log('Adding exit_time column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN exit_time DATETIME NULL AFTER approved_at;');
    }

    if (!outColNames.includes('return_time')) {
      console.log('Adding return_time column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN return_time DATETIME NULL AFTER exit_time;');
    }

    if (!outColNames.includes('current_checkpoint_status')) {
      console.log('Adding current_checkpoint_status column to outpass_requests...');
      await pool.query("ALTER TABLE outpass_requests ADD COLUMN current_checkpoint_status ENUM('inside', 'outside', 'returned') DEFAULT 'inside' AFTER return_time;");
    }

    console.log('✅ Caretaker & Exit Scanner schema migration completed successfully.');
    return { success: true };
  } catch (err) {
    console.error('❌ Caretaker migration error:', err.message);
    return { success: false, error: err.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateCaretakerSchema();
}

module.exports = { migrateCaretakerSchema };
