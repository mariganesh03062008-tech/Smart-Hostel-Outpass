const { pool } = require('../utils/db');

async function migratePrincipalApprovalColumns() {
  console.log('🔄 Checking and applying Principal approval schema columns to outpass_requests...');

  try {
    const [columns] = await pool.query('DESCRIBE outpass_requests');
    const columnNames = columns.map(c => c.Field);

    async function addColIfNotExists(colName, defSql) {
      if (!columnNames.includes(colName)) {
        console.log(`Adding column ${colName}...`);
        await pool.query(`ALTER TABLE outpass_requests ADD COLUMN ${colName} ${defSql}`);
      }
    }

    await addColIfNotExists('principal_approved_by_id', 'INT NULL AFTER principal_approval_status');
    await addColIfNotExists('principal_approved_at', 'DATETIME NULL AFTER principal_approved_by_id');
    await addColIfNotExists('principal_rejected_by_id', 'INT NULL AFTER principal_approved_at');
    await addColIfNotExists('principal_rejected_at', 'DATETIME NULL AFTER principal_rejected_by_id');
    await addColIfNotExists('principal_rejection_reason', 'TEXT NULL AFTER principal_rejected_at');

    // Add index on status and principal_approval_status
    const [indexes] = await pool.query("SHOW INDEX FROM outpass_requests WHERE Key_name = 'idx_outpass_princ_status'");
    if (indexes.length === 0) {
      await pool.query("ALTER TABLE outpass_requests ADD INDEX idx_outpass_princ_status (status, principal_approval_status)");
    }

    console.log('✅ Principal approval columns and indexes verified successfully.');
    return { success: true };
  } catch (err) {
    console.error('❌ Error during Principal approval column migration:', err.message);
    return { success: false, error: err.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migratePrincipalApprovalColumns();
}

module.exports = { migratePrincipalApprovalColumns };
