/**
 * Database Migration: Parent Face Lifecycle & Warden Revocation
 * 1. Adds `face_status`, `face_revoked_at`, `face_revoked_by`, `face_revocation_reason` to `parents`.
 * 2. Adds `status` to `parent_face_templates`.
 * 3. Creates `parent_face_audit_logs` table.
 * 4. Backfills existing parents to 'ACTIVE' or 'NOT_REGISTERED'.
 */

const { pool } = require('../utils/db');

async function migrateParentFaceLifecycle() {
  console.log('🔄 Running Parent Face Lifecycle & Warden Revocation Migration...');

  try {
    // 1. Check & add columns to `parents`
    const [parentsCols] = await pool.query("SHOW COLUMNS FROM parents;");
    const parentColNames = parentsCols.map(c => c.Field);

    if (!parentColNames.includes('face_status')) {
      await pool.query(`
        ALTER TABLE parents 
        ADD COLUMN face_status ENUM('NOT_REGISTERED', 'ACTIVE', 'REVOKED') 
        DEFAULT 'NOT_REGISTERED' AFTER face_registered;
      `);
      console.log('  ✅ Added `face_status` column to `parents`.');
    }

    if (!parentColNames.includes('face_revoked_at')) {
      await pool.query(`
        ALTER TABLE parents 
        ADD COLUMN face_revoked_at DATETIME NULL AFTER face_registered_at;
      `);
      console.log('  ✅ Added `face_revoked_at` column to `parents`.');
    }

    if (!parentColNames.includes('face_revoked_by')) {
      await pool.query(`
        ALTER TABLE parents 
        ADD COLUMN face_revoked_by INT NULL AFTER face_revoked_at,
        ADD CONSTRAINT fk_parents_revoked_by FOREIGN KEY (face_revoked_by) REFERENCES staff(id) ON DELETE SET NULL;
      `);
      console.log('  ✅ Added `face_revoked_by` column & FK to `parents`.');
    }

    if (!parentColNames.includes('face_revocation_reason')) {
      await pool.query(`
        ALTER TABLE parents 
        ADD COLUMN face_revocation_reason TEXT NULL AFTER face_revoked_by;
      `);
      console.log('  ✅ Added `face_revocation_reason` column to `parents`.');
    }

    // 2. Check & add `status` column to `parent_face_templates`
    const [templateCols] = await pool.query("SHOW COLUMNS FROM parent_face_templates;");
    const templateColNames = templateCols.map(c => c.Field);

    if (!templateColNames.includes('status')) {
      await pool.query(`
        ALTER TABLE parent_face_templates 
        ADD COLUMN status ENUM('ACTIVE', 'REVOKED') DEFAULT 'ACTIVE' AFTER quality_score;
      `);
      console.log('  ✅ Added `status` column to `parent_face_templates`.');
    }

    // 3. Create `parent_face_audit_logs` table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS parent_face_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parent_id INT NOT NULL,
        warden_id INT NULL,
        action VARCHAR(50) NOT NULL,
        reason TEXT NULL,
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_parent (parent_id),
        INDEX idx_audit_warden (warden_id),
        CONSTRAINT fk_face_audit_parent FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE,
        CONSTRAINT fk_face_audit_warden FOREIGN KEY (warden_id) REFERENCES staff(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✅ Verified / created table `parent_face_audit_logs`.');

    // 4. Backfill existing parents based on face_registered flag & existing templates
    await pool.query(`
      UPDATE parents p
      INNER JOIN parent_face_templates t ON p.id = t.parent_id
      SET p.face_status = 'ACTIVE', p.face_registered = 1
      WHERE t.status = 'ACTIVE';
    `);

    await pool.query(`
      UPDATE parents
      SET face_status = 'NOT_REGISTERED'
      WHERE id NOT IN (SELECT parent_id FROM parent_face_templates WHERE status = 'ACTIVE')
        AND face_status != 'REVOKED';
    `);
    console.log('  ✅ Backfilled `face_status` for all existing parents.');

    console.log('🎉 Parent Face Lifecycle Migration completed successfully!\n');
    return { success: true };
  } catch (err) {
    console.error('❌ Migration error:', err);
    throw err;
  }
}

if (require.main === module) {
  migrateParentFaceLifecycle().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { migrateParentFaceLifecycle };
