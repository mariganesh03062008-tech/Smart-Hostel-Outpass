const { pool } = require('../utils/db');

async function migrateAdvisorColumns() {
  console.log('🔄 Checking and applying schema enhancements for Class Advisor workflows...');

  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM outpass_requests;');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('advisor_rejected_by_id')) {
      console.log('Adding advisor_rejected_by_id column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN advisor_rejected_by_id INT NULL AFTER advisor_approved_at;');
      await pool.query('ALTER TABLE outpass_requests ADD CONSTRAINT fk_outpass_advisor_rej_staff FOREIGN KEY (advisor_rejected_by_id) REFERENCES staff(id) ON DELETE SET NULL;');
    }

    if (!colNames.includes('advisor_rejected_at')) {
      console.log('Adding advisor_rejected_at column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN advisor_rejected_at DATETIME NULL AFTER advisor_rejected_by_id;');
    }

    if (!colNames.includes('advisor_rejection_reason')) {
      console.log('Adding advisor_rejection_reason column to outpass_requests...');
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN advisor_rejection_reason TEXT NULL AFTER advisor_rejected_at;');
    }

    console.log('✅ Class Advisor workflow schema migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateAdvisorColumns();
}

module.exports = { migrateAdvisorColumns };
