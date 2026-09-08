/**
 * Database Migration: Parent Face Verification
 * 1. Creates `parent_face_templates` table for storing 128D biometric face vectors.
 * 2. Adds `face_registered` flags to `parents`.
 * 3. Adds `parent_face_verified` & `parent_face_verified_at` to `outpass_requests`.
 * 4. Cleans up obsolete GPS location authentication columns from `outpass_requests`.
 */

const { pool } = require('../utils/db');

async function migrateParentFace() {
  console.log('🔄 Running Parent Face Verification Database Migration...');

  try {
    // 1. Create parent_face_templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS parent_face_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parent_id INT NOT NULL UNIQUE,
        face_descriptor LONGTEXT NOT NULL,
        face_landmarks_summary JSON NULL,
        quality_score FLOAT DEFAULT 1.0,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_face_parent FOREIGN KEY (parent_id) 
            REFERENCES parents(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `parent_face_templates` verified / created.');

    // 1b. Create parent_face_verifications table for verification session tokens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS parent_face_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        verification_token VARCHAR(128) NOT NULL UNIQUE,
        outpass_request_id INT NOT NULL,
        parent_id INT NOT NULL,
        distance_score FLOAT NOT NULL,
        similarity_score FLOAT NOT NULL,
        status ENUM('ACTIVE', 'CONSUMED', 'EXPIRED') DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        INDEX idx_token (verification_token),
        INDEX idx_parent_outpass (parent_id, outpass_request_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Table `parent_face_verifications` verified / created.');

    // 2. Add face_registered to parents table if missing
    const [parentsCols] = await pool.query("SHOW COLUMNS FROM parents;");
    const parentColNames = parentsCols.map(c => c.Field);

    if (!parentColNames.includes('face_registered')) {
      await pool.query("ALTER TABLE parents ADD COLUMN face_registered TINYINT(1) DEFAULT 0 AFTER profile_completed;");
      console.log('  ✅ Added `face_registered` column to `parents`.');
    }
    if (!parentColNames.includes('face_registered_at')) {
      await pool.query("ALTER TABLE parents ADD COLUMN face_registered_at DATETIME NULL AFTER face_registered;");
      console.log('  ✅ Added `face_registered_at` column to `parents`.');
    }

    // 3. Add parent_face_verified to outpass_requests table if missing
    const [outpassCols] = await pool.query("SHOW COLUMNS FROM outpass_requests;");
    const outpassColNames = outpassCols.map(c => c.Field);

    if (!outpassColNames.includes('parent_face_verified')) {
      await pool.query("ALTER TABLE outpass_requests ADD COLUMN parent_face_verified TINYINT(1) DEFAULT 0 AFTER parent_biometric_verified;");
      console.log('  ✅ Added `parent_face_verified` column to `outpass_requests`.');
    }
    if (!outpassColNames.includes('parent_face_verified_at')) {
      await pool.query("ALTER TABLE outpass_requests ADD COLUMN parent_face_verified_at DATETIME NULL AFTER parent_face_verified;");
      console.log('  ✅ Added `parent_face_verified_at` column to `outpass_requests`.');
    }

    // 4. Drop obsolete location columns from outpass_requests
    const obsoleteLocationCols = [
      'student_loc_lat',
      'student_loc_lng',
      'student_loc_accuracy',
      'student_loc_timestamp',
      'parent_approval_lat',
      'parent_approval_lng',
      'parent_approval_accuracy',
      'parent_loc_timestamp',
      'distance_meters',
      'parent_location_verified'
    ];

    for (const col of obsoleteLocationCols) {
      if (outpassColNames.includes(col)) {
        await pool.query(`ALTER TABLE outpass_requests DROP COLUMN \`${col}\`;`);
        console.log(`  🗑️ Dropped obsolete location column: \`${col}\``);
      }
    }

    console.log('🎉 Parent Face Verification Migration Completed Successfully!\n');
    return { success: true };
  } catch (err) {
    console.error('❌ Migration Error:', err);
    throw err;
  }
}

if (require.main === module) {
  migrateParentFace().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { migrateParentFace };
