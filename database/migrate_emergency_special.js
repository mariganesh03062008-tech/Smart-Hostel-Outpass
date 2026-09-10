/**
 * Database Migration: Emergency Outpass + Special Outpass Modules
 * 1. Adds emergency and special outpass metadata columns to `outpass_requests`.
 * 2. Creates `outpass_approval_history` table for complete multi-tier audit logging.
 */

const { pool } = require('../utils/db');

async function migrateEmergencySpecial() {
  console.log('🔄 Running Emergency & Special Outpass Database Migration...');

  try {
    // 1. Check existing columns in outpass_requests
    const [outpassCols] = await pool.query('SHOW COLUMNS FROM outpass_requests;');
    const outpassColNames = outpassCols.map(c => c.Field);

    if (!outpassColNames.includes('emergency_type')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN emergency_type VARCHAR(100) NULL AFTER outpass_type;');
      console.log('  ✅ Added `emergency_type` column to `outpass_requests`.');
    }

    if (!outpassColNames.includes('special_type')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN special_type VARCHAR(100) NULL AFTER emergency_type;');
      console.log('  ✅ Added `special_type` column to `outpass_requests`.');
    }

    if (!outpassColNames.includes('emergency_contact')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN emergency_contact VARCHAR(30) NULL AFTER student_phone;');
      console.log('  ✅ Added `emergency_contact` column to `outpass_requests`.');
    }

    if (!outpassColNames.includes('additional_remarks')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN additional_remarks TEXT NULL AFTER emergency_contact;');
      console.log('  ✅ Added `additional_remarks` column to `outpass_requests`.');
    }

    if (!outpassColNames.includes('attachment_url')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN attachment_url VARCHAR(500) NULL AFTER additional_remarks;');
      console.log('  ✅ Added `attachment_url` column to `outpass_requests`.');
    }

    // 2. Create outpass_approval_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS outpass_approval_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        outpass_id INT NOT NULL,
        student_id INT NOT NULL,
        parent_id INT NULL,
        advisor_id INT NULL,
        principal_id INT NULL,
        warden_id INT NULL,
        role VARCHAR(50) NOT NULL,
        user_id INT NULL,
        action VARCHAR(50) NOT NULL,
        message TEXT NULL,
        previous_status VARCHAR(50) NULL,
        new_status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_history_outpass (outpass_id),
        INDEX idx_history_student (student_id),
        CONSTRAINT fk_history_outpass FOREIGN KEY (outpass_id) REFERENCES outpass_requests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `outpass_approval_history` verified / created.');

    // 3. Ensure warden_approval_status ENUM includes 'not_required'
    await pool.query("ALTER TABLE outpass_requests MODIFY COLUMN warden_approval_status ENUM('pending','approved','rejected','not_required') DEFAULT 'pending';");
    console.log('  ✅ Updated `warden_approval_status` ENUM to include not_required.');

    console.log('✨ Emergency & Special Outpass Database Migration Completed Successfully!\n');
    return true;

  } catch (error) {
    console.error('❌ Migration Failed:', error);
    throw error;
  }
}

if (require.main === module) {
  migrateEmergencySpecial()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrateEmergencySpecial;
