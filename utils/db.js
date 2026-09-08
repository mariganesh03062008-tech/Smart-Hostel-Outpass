const mysql = require('mysql2/promise');
require('dotenv').config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_hostel_outpass',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Ensure required fingerprint columns exist in parents table
async function ensureSchema() {
  try {
    const [cols] = await pool.query('DESCRIBE parents');
    const colNames = cols.map(c => c.Field);
    if (!colNames.includes('profile_completed')) {
      await pool.query('ALTER TABLE parents ADD COLUMN profile_completed TINYINT(1) DEFAULT 0 AFTER password_hash');
    }
    if (!colNames.includes('relationship')) {
      await pool.query('ALTER TABLE parents ADD COLUMN relationship VARCHAR(50) DEFAULT "Father" AFTER father_name');
    }
    if (!colNames.includes('fingerprint_registered')) {
      await pool.query('ALTER TABLE parents ADD COLUMN fingerprint_registered TINYINT(1) DEFAULT 0 AFTER password_hash');
    }
    if (!colNames.includes('fingerprint_reference')) {
      await pool.query('ALTER TABLE parents ADD COLUMN fingerprint_reference VARCHAR(255) NULL AFTER fingerprint_registered');
    }
    if (!colNames.includes('fingerprint_registered_at')) {
      await pool.query('ALTER TABLE parents ADD COLUMN fingerprint_registered_at DATETIME NULL AFTER fingerprint_reference');
    }
  } catch (err) {
    console.warn('[DB Schema Init Warning]:', err.message);
  }
}

// Helper function to test database connectivity
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    const [result] = await connection.query('SELECT 1 + 1 AS solution');
    connection.release();
    await ensureSchema();
    return {
      connected: true,
      message: 'MySQL pool connected successfully',
      solution: result[0].solution
    };
  } catch (error) {
    return {
      connected: false,
      message: error.message || error.sqlMessage || `Database connection failed (${error.code})`,
      code: error.code || 'UNKNOWN_ERROR'
    };
  }
}

module.exports = {
  pool,
  query: (sql, params) => pool.query(sql, params),
  testConnection,
  ensureSchema
};
