const { pool } = require('../utils/db');

async function migrateParentSchema() {
  console.log('🔄 Checking and applying schema enhancements for Parent module & biometric workflows...');

  try {
    // 1. Enhance parents table
    const [parentCols] = await pool.query('SHOW COLUMNS FROM parents;');
    const parentColNames = parentCols.map(c => c.Field);

    if (!parentColNames.includes('fingerprint_template_id')) {
      console.log('Adding fingerprint_template_id to parents...');
      await pool.query('ALTER TABLE parents ADD COLUMN fingerprint_template_id VARCHAR(100) NULL UNIQUE AFTER password_hash;');
    }

    // Set default demo fingerprint template for parent
    await pool.query('UPDATE parents SET fingerprint_template_id = "FP-PAR-98765" WHERE primary_phone = "9876543210" AND fingerprint_template_id IS NULL;');

    // 2. Enhance outpass_requests table
    const [outpassCols] = await pool.query('SHOW COLUMNS FROM outpass_requests;');
    const outpassColNames = outpassCols.map(c => c.Field);

    if (!outpassColNames.includes('parent_approved_by_id')) {
      console.log('Adding parent_approved_by_id column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_approved_by_id INT NULL AFTER parent_approval_status;');
      await pool.query('ALTER TABLE outpass_requests ADD CONSTRAINT fk_outpass_parent_appr FOREIGN KEY (parent_approved_by_id) REFERENCES parents(id) ON DELETE SET NULL;');
    }

    if (!outpassColNames.includes('parent_approved_at')) {
      console.log('Adding parent_approved_at column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_approved_at DATETIME NULL AFTER parent_approved_by_id;');
    }

    if (!outpassColNames.includes('parent_rejected_by_id')) {
      console.log('Adding parent_rejected_by_id column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_rejected_by_id INT NULL AFTER parent_approved_at;');
      await pool.query('ALTER TABLE outpass_requests ADD CONSTRAINT fk_outpass_parent_rej FOREIGN KEY (parent_rejected_by_id) REFERENCES parents(id) ON DELETE SET NULL;');
    }

    if (!outpassColNames.includes('parent_rejected_at')) {
      console.log('Adding parent_rejected_at column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_rejected_at DATETIME NULL AFTER parent_rejected_by_id;');
    }

    if (!outpassColNames.includes('parent_rejection_reason')) {
      console.log('Adding parent_rejection_reason column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_rejection_reason TEXT NULL AFTER parent_rejected_at;');
    }

    if (!outpassColNames.includes('parent_biometric_verified')) {
      console.log('Adding parent_biometric_verified column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_biometric_verified TINYINT(1) DEFAULT 0 AFTER parent_rejection_reason;');
    }

    // 3. Enhance parent_messages table to support direct chat messages (utf8mb4 for Tamil/English)
    await pool.query(`ALTER TABLE parent_messages MODIFY COLUMN message_type ENUM('sms', 'whatsapp', 'system_notice', 'consent_request', 'message') NOT NULL DEFAULT 'message';`);
    await pool.query(`ALTER TABLE parent_messages CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);

    console.log('✅ Parent module schema migration completed successfully without data loss.');
    return { success: true };
  } catch (err) {
    console.error('❌ Parent migration error:', err.message);
    return { success: false, error: err.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateParentSchema();
}

module.exports = { migrateParentSchema };
