const { pool } = require('../utils/db');

async function migrateParentMessages() {
  console.log('🔄 Checking parent_messages table schema...');
  try {
    const [cols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'parent_messages' 
        AND COLUMN_NAME = 'parent_mobile';
    `);

    if (cols.length === 0) {
      console.log('➕ Adding parent_mobile column to parent_messages...');
      await pool.query(`
        ALTER TABLE parent_messages 
        ADD COLUMN parent_mobile VARCHAR(20) NULL AFTER parent_id;
      `);
      console.log('✅ Added parent_mobile column successfully.');
    } else {
      console.log('ℹ️ parent_mobile column already exists in parent_messages.');
    }

    console.log('✅ Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrateParentMessages();
