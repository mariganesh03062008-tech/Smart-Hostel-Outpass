/**
 * Migration Script: Centralized Notification System Schema Migration
 * Safe and non-destructive: ensures all required notification columns and indexes exist
 */

const { pool } = require('../utils/db');

async function migrateNotificationsTable() {
  let connection;
  try {
    console.log('🚀 [Migration] Verifying notifications table schema...');
    connection = await pool.getConnection();

    // 1. Create table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        role VARCHAR(50) NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(100) NOT NULL,
        reference_id VARCHAR(100) NULL,
        is_read BOOLEAN DEFAULT FALSE,
        recipient_type ENUM('student', 'parent', 'staff') NULL,
        student_id INT NULL,
        parent_id INT NULL,
        staff_id INT NULL,
        link_url VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Inspect existing columns
    const [columns] = await connection.query('DESCRIBE notifications');
    const colNames = columns.map(c => c.Field);

    // 3. Add missing columns safely
    if (!colNames.includes('user_id')) {
      console.log('  Adding column user_id...');
      await connection.query('ALTER TABLE notifications ADD COLUMN user_id INT NULL AFTER id;');
    }
    if (!colNames.includes('role')) {
      console.log('  Adding column role...');
      await connection.query('ALTER TABLE notifications ADD COLUMN role VARCHAR(50) NULL AFTER user_id;');
    }
    if (!colNames.includes('reference_id')) {
      console.log('  Adding column reference_id...');
      await connection.query('ALTER TABLE notifications ADD COLUMN reference_id VARCHAR(100) NULL AFTER type;');
    }

    // 4. Modify type column to VARCHAR(100) to support all notification types
    const typeCol = columns.find(c => c.Field === 'type');
    if (typeCol && typeCol.Type.startsWith('enum')) {
      console.log('  Expanding type column to VARCHAR(100)...');
      await connection.query('ALTER TABLE notifications MODIFY COLUMN type VARCHAR(100) NOT NULL;');
    }

    // 5. Add index for fast querying & deduplication
    try {
      await connection.query('ALTER TABLE notifications ADD INDEX idx_notif_user_role_read (user_id, role, is_read);');
    } catch (e) {
      // index may already exist
    }

    try {
      await connection.query('ALTER TABLE notifications ADD INDEX idx_notif_dedup (type, reference_id, user_id, role);');
    } catch (e) {
      // index may already exist
    }

    console.log('✅ [Migration] Notifications table schema verified successfully!');
  } catch (error) {
    console.error('❌ [Migration Error]:', error.message);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateNotificationsTable().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrateNotificationsTable;
