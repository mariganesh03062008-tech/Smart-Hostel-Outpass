const { pool } = require('../utils/db');

async function migrateParentLocationSchema() {
  console.log('🔄 Starting migration for Parent Verified Mobile & GPS Location Proximity Verification...');

  try {
    // 1. Create student_locations table if not exists
    console.log('Checking / creating student_locations table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL UNIQUE,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        accuracy FLOAT NOT NULL DEFAULT 5.0,
        captured_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(50) DEFAULT 'browser_gps',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_student_loc_student FOREIGN KEY (student_id)
          REFERENCES students(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure captured_at exists if table was already created
    const [slCols] = await pool.query('SHOW COLUMNS FROM student_locations;');
    if (!slCols.map(c => c.Field).includes('captured_at')) {
      await pool.query('ALTER TABLE student_locations ADD COLUMN captured_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER accuracy;');
    }

    // 2. Create parent_location_verifications table for short-lived verification sessions & snapshots
    console.log('Checking / creating parent_location_verifications table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS parent_location_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        verification_token VARCHAR(64) NOT NULL UNIQUE,
        outpass_request_id INT NOT NULL,
        parent_id INT NOT NULL,
        student_id INT NOT NULL,
        parent_mobile VARCHAR(20) NOT NULL,
        parent_lat DECIMAL(10, 7) NOT NULL,
        parent_lng DECIMAL(10, 7) NOT NULL,
        parent_accuracy FLOAT NOT NULL,
        parent_timestamp DATETIME NOT NULL,
        student_lat DECIMAL(10, 7) NOT NULL,
        student_lng DECIMAL(10, 7) NOT NULL,
        student_accuracy FLOAT NOT NULL,
        student_timestamp DATETIME NOT NULL,
        distance_meters DECIMAL(10, 2) NOT NULL,
        verification_result ENUM('VERIFIED', 'BLOCKED', 'ACCURACY_POOR') NOT NULL,
        status ENUM('ACTIVE', 'CONSUMED', 'EXPIRED') DEFAULT 'ACTIVE',
        rejection_reason VARCHAR(255) NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_plv_outpass FOREIGN KEY (outpass_request_id)
          REFERENCES outpass_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_plv_parent FOREIGN KEY (parent_id)
          REFERENCES parents(id) ON DELETE CASCADE,
        CONSTRAINT fk_plv_student FOREIGN KEY (student_id)
          REFERENCES students(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Enhance outpass_requests table with snapshot columns for Warden inspection
    console.log('Enhancing outpass_requests table with location snapshot columns...');
    const [outpassCols] = await pool.query('SHOW COLUMNS FROM outpass_requests;');
    const outpassColNames = outpassCols.map(c => c.Field);

    if (!outpassColNames.includes('parent_verified_mobile')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_verified_mobile VARCHAR(20) NULL AFTER parent_approved_at;');
    }
    if (!outpassColNames.includes('parent_approval_lat')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_approval_lat DECIMAL(10, 7) NULL AFTER parent_verified_mobile;');
    }
    if (!outpassColNames.includes('parent_approval_lng')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_approval_lng DECIMAL(10, 7) NULL AFTER parent_approval_lat;');
    }
    if (!outpassColNames.includes('parent_approval_accuracy')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_approval_accuracy FLOAT NULL AFTER parent_approval_lng;');
    }
    if (!outpassColNames.includes('student_loc_lat')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN student_loc_lat DECIMAL(10, 7) NULL AFTER parent_approval_accuracy;');
    }
    if (!outpassColNames.includes('student_loc_lng')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN student_loc_lng DECIMAL(10, 7) NULL AFTER student_loc_lat;');
    }
    if (!outpassColNames.includes('distance_meters')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN distance_meters DECIMAL(10, 2) NULL AFTER student_loc_lng;');
    }
    if (!outpassColNames.includes('parent_location_verified')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_location_verified TINYINT(1) DEFAULT 0 AFTER distance_meters;');
    }
    if (!outpassColNames.includes('parent_approval_message')) {
      await pool.query('ALTER TABLE outpass_requests ADD COLUMN parent_approval_message TEXT NULL AFTER parent_location_verified;');
    }

    // Note: Live student GPS location is captured on-demand in the Student Portal.
    // No hard-coded fallback coordinates are seeded or permitted.
    console.log('✅ Migration completed successfully!');
    return { success: true };
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateParentLocationSchema().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrateParentLocationSchema };
