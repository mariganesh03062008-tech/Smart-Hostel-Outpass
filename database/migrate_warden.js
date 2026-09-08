const { pool } = require('../utils/db');

async function migrateWardenColumns() {
  console.log('🔄 Checking and applying schema enhancements for Warden approval workflows...');

  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM outpass_requests;');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('approved_at')) {
      console.log('Adding approved_at column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN approved_at DATETIME NULL AFTER approved_by_warden_id;');
    }

    if (!colNames.includes('rejected_by_warden_id')) {
      console.log('Adding rejected_by_warden_id column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN rejected_by_warden_id INT NULL AFTER approved_at;');
      await pool.query('ALTER TABLE outpass_requests ADD CONSTRAINT fk_outpass_rejected_warden FOREIGN KEY (rejected_by_warden_id) REFERENCES staff(id) ON DELETE SET NULL;');
    }

    if (!colNames.includes('rejected_at')) {
      console.log('Adding rejected_at column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by_warden_id;');
    }

    if (!colNames.includes('advisor_approved_by_id')) {
      console.log('Adding advisor_approved_by_id column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN advisor_approved_by_id INT NULL AFTER rejected_at;');
      await pool.query('ALTER TABLE outpass_requests ADD CONSTRAINT fk_outpass_advisor_staff FOREIGN KEY (advisor_approved_by_id) REFERENCES staff(id) ON DELETE SET NULL;');
    }

    if (!colNames.includes('advisor_approved_at')) {
      console.log('Adding advisor_approved_at column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN advisor_approved_at DATETIME NULL AFTER advisor_approved_by_id;');
    }

    console.log('✅ Warden workflow schema migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateWardenColumns();
}

module.exports = { migrateWardenColumns };
