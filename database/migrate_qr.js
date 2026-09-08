const { pool } = require('../utils/db');

async function migrateQrSchema() {
  console.log('🔄 Checking and applying schema enhancements for QR Code & Active Outpass module...');

  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM qr_codes;');
    const colNames = cols.map(c => c.Field);

    // 1. Add status column if missing
    if (!colNames.includes('status')) {
      console.log('Adding status column to qr_codes...');
      await pool.query("ALTER TABLE qr_codes ADD COLUMN status ENUM('ACTIVE', 'REVOKED', 'EXPIRED', 'USED') DEFAULT 'ACTIVE' AFTER valid_until;");
    }

    // 2. Add qr_image_data if missing
    if (!colNames.includes('qr_image_data')) {
      console.log('Adding qr_image_data column to qr_codes...');
      await pool.query('ALTER TABLE qr_codes ADD COLUMN qr_image_data LONGTEXT NULL AFTER qr_data;');
    }

    // 3. Add generated_by_warden_id
    if (!colNames.includes('generated_by_warden_id')) {
      console.log('Adding generated_by_warden_id column to qr_codes...');
      await pool.query('ALTER TABLE qr_codes ADD COLUMN generated_by_warden_id INT NULL AFTER status;');
      await pool.query('ALTER TABLE qr_codes ADD CONSTRAINT fk_qr_warden_gen FOREIGN KEY (generated_by_warden_id) REFERENCES staff(id) ON DELETE SET NULL;');
    }

    // 4. Add scanned_exit_at and scanned_return_at
    if (!colNames.includes('scanned_exit_at')) {
      console.log('Adding scanned_exit_at column to qr_codes...');
      await pool.query('ALTER TABLE qr_codes ADD COLUMN scanned_exit_at DATETIME NULL AFTER generated_by_warden_id;');
    }

    if (!colNames.includes('scanned_return_at')) {
      console.log('Adding scanned_return_at column to qr_codes...');
      await pool.query('ALTER TABLE qr_codes ADD COLUMN scanned_return_at DATETIME NULL AFTER scanned_exit_at;');
    }

    // 5. Add revoked_by_warden_id, revoked_at, revocation_reason
    if (!colNames.includes('revoked_by_warden_id')) {
      console.log('Adding revoked_by_warden_id column to qr_codes...');
      await pool.query('ALTER TABLE qr_codes ADD COLUMN revoked_by_warden_id INT NULL AFTER scanned_return_at;');
      await pool.query('ALTER TABLE qr_codes ADD CONSTRAINT fk_qr_warden_rev FOREIGN KEY (revoked_by_warden_id) REFERENCES staff(id) ON DELETE SET NULL;');
    }

    if (!colNames.includes('revoked_at')) {
      console.log('Adding revoked_at column to qr_codes...');
      await pool.query('ALTER TABLE qr_codes ADD COLUMN revoked_at DATETIME NULL AFTER revoked_by_warden_id;');
    }

    if (!colNames.includes('revocation_reason')) {
      console.log('Adding revocation_reason column to qr_codes...');
      await pool.query('ALTER TABLE qr_codes ADD COLUMN revocation_reason TEXT NULL AFTER revoked_at;');
    }

    // 6. Adjust unique index on outpass_request_id to support historical audit records on regeneration
    try {
      await pool.query('ALTER TABLE qr_codes DROP FOREIGN KEY fk_qr_outpass;');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE qr_codes DROP INDEX outpass_request_id;');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE qr_codes ADD CONSTRAINT fk_qr_outpass FOREIGN KEY (outpass_request_id) REFERENCES outpass_requests(id) ON DELETE CASCADE;');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE qr_codes ADD INDEX idx_qr_outpass_id (outpass_request_id);');
    } catch (e) {}

    console.log('✅ QR Code schema migration completed successfully without data loss.');
    return { success: true };
  } catch (err) {
    console.error('❌ QR migration error:', err.message);
    return { success: false, error: err.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateQrSchema();
}

module.exports = { migrateQrSchema };
