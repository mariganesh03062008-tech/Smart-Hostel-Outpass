const { pool } = require('../utils/db');

async function migrateExtensionSchema() {
  console.log('🔄 Checking and applying schema enhancements for Emergency Extension module...');

  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM extension_requests;');
    const colNames = cols.map(c => c.Field);

    // 1. Add rejection_reason
    if (!colNames.includes('rejection_reason')) {
      console.log('Adding rejection_reason column to extension_requests...');
      await pool.query('ALTER TABLE extension_requests ADD COLUMN rejection_reason TEXT NULL AFTER reviewed_at;');
    }

    // 2. Add previous_valid_until
    if (!colNames.includes('previous_valid_until')) {
      console.log('Adding previous_valid_until column to extension_requests...');
      await pool.query('ALTER TABLE extension_requests ADD COLUMN previous_valid_until DATETIME NULL AFTER rejection_reason;');
    }

    // 3. Add approved_valid_until
    if (!colNames.includes('approved_valid_until')) {
      console.log('Adding approved_valid_until column to extension_requests...');
      await pool.query('ALTER TABLE extension_requests ADD COLUMN approved_valid_until DATETIME NULL AFTER previous_valid_until;');
    }

    // 4. Expand status column
    console.log('Updating extension_requests status column to VARCHAR(50)...');
    await pool.query("ALTER TABLE extension_requests MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'PENDING';");

    console.log('✅ Emergency Extension Module schema migration completed successfully.');
    return { success: true };
  } catch (err) {
    console.error('❌ Extension migration error:', err.message);
    return { success: false, error: err.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateExtensionSchema();
}

module.exports = { migrateExtensionSchema };
