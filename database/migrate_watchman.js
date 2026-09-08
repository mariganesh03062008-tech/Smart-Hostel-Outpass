const { pool } = require('../utils/db');

async function migrateWatchmanSchema() {
  console.log('🔄 Checking and applying schema enhancements for Watchman Return module...');

  try {
    // 1. Check return_logs table for qr_id
    const [returnCols] = await pool.query('SHOW COLUMNS FROM return_logs;');
    const returnColNames = returnCols.map(c => c.Field);

    if (!returnColNames.includes('qr_id')) {
      console.log('Adding qr_id column to return_logs...');
      await pool.query('ALTER TABLE return_logs ADD COLUMN qr_id INT NULL AFTER id;');
      try {
        await pool.query('ALTER TABLE return_logs ADD CONSTRAINT fk_return_qr FOREIGN KEY (qr_id) REFERENCES qr_codes(id) ON DELETE SET NULL;');
      } catch (e) {}
    }

    // 2. Expand qr_codes status column to accept 'COMPLETED'
    console.log('Updating qr_codes status column definition...');
    await pool.query("ALTER TABLE qr_codes MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';");

    // 3. Ensure GAT-401 and SEC-001 demo watchman staff exist
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash('Password@123', 10);
    await pool.query(`
      INSERT INTO staff (staff_id, name, email, phone, role, department, hostel_block, password_hash, is_active)
      VALUES ('GAT-401', 'Mr. K. Selvam', 'watchman@hostel.edu', '9876543216', 'watchman', 'Hostel Main Gate', 'Main Gate', ?, true)
      ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), password_hash = VALUES(password_hash), is_active = true;
    `, [passwordHash]);

    console.log('✅ Watchman Return Module schema migration completed successfully.');
    return { success: true };
  } catch (err) {
    console.error('❌ Watchman migration error:', err.message);
    return { success: false, error: err.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateWatchmanSchema();
}

module.exports = { migrateWatchmanSchema };
