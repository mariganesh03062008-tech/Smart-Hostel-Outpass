/**
 * Database Migration: Add profile_completed to students table
 * Safe migration: verifies column existence before adding,
 * and initializes existing seeded students to profile_completed = 1.
 */

const { pool } = require('../utils/db');

async function migrate() {
  console.log('--- Starting Student Profile Migration ---');
  try {
    const [cols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'students' 
        AND COLUMN_NAME = 'profile_completed'
    `);

    if (cols.length === 0) {
      console.log('Adding column profile_completed to students table...');
      await pool.query(`
        ALTER TABLE students 
        ADD COLUMN profile_completed TINYINT(1) DEFAULT 0 AFTER is_active;
      `);
      console.log('✅ Added profile_completed column to students.');
    } else {
      console.log('ℹ️  Column profile_completed already exists in students.');
    }

    // Initialize existing active seeded students (e.g. 21CS042, 21ME018) as complete
    const [updateResult] = await pool.query(`
      UPDATE students 
      SET profile_completed = 1 
      WHERE is_active = 1 AND reg_no IN ('21CS042', '21ME018', '21IT005');
    `);
    console.log(`✅ Marked ${updateResult.affectedRows} existing seeded student(s) as profile_completed = 1.`);

    console.log('--- Migration Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
