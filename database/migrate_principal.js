const { pool } = require('../utils/db');

async function migratePrincipalIndexes() {
  console.log('🔄 Checking and applying performance indexes for Principal Analytics & Reports module...');

  try {
    // Helper to safely add index if not exists
    async function safeAddIndex(table, indexName, columnsSql) {
      const [indexes] = await pool.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [indexName]);
      if (indexes.length === 0) {
        console.log(`Adding index ${indexName} on ${table}(${columnsSql})...`);
        await pool.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (${columnsSql})`);
      }
    }

    await safeAddIndex('students', 'idx_stu_dept_status', 'department, current_hostel_status');
    await safeAddIndex('students', 'idx_stu_hostel_block', 'hostel_block');
    await safeAddIndex('outpass_requests', 'idx_outpass_created', 'created_at');
    await safeAddIndex('outpass_requests', 'idx_outpass_type_status', 'outpass_type, status');
    await safeAddIndex('exit_logs', 'idx_exit_time', 'exit_time');
    await safeAddIndex('return_logs', 'idx_return_time_late', 'return_time, is_late');
    await safeAddIndex('extension_requests', 'idx_ext_status_created', 'status, created_at');

    console.log('✅ Principal Analytics & Reporting indexes verified and ready.');
    return { success: true };
  } catch (err) {
    console.error('❌ Error during index migration:', err.message);
    return { success: false, error: err.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migratePrincipalIndexes();
}

module.exports = { migratePrincipalIndexes };
