const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
  console.log('🔄 Initializing MySQL Database for Smart Hostel Outpass System...');
  console.log(`Connecting to MySQL host: ${process.env.DB_HOST}:${process.env.DB_PORT} as user: ${process.env.DB_USER}`);

  let connection;
  try {
    // 1. Connect without database selected first (to create database if not exists)
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      multipleStatements: true
    });

    console.log('✅ Connected to MySQL server successfully.');

    const dbName = process.env.DB_NAME || 'smart_hostel_outpass';
    console.log(`🔨 Creating database \`${dbName}\` if not exists...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`✅ Database \`${dbName}\` is ready.`);

    // Switch to database
    await connection.query(`USE \`${dbName}\`;`);

    // 2. Read and execute schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📜 Executing schema.sql to create relational tables...');
    await connection.query(schemaSql);
    console.log('✅ Schema executed successfully. All tables created.');

    // 3. Verify created tables
    const [tables] = await connection.query('SHOW TABLES;');
    console.log('\n📋 Created tables in database:');
    tables.forEach(row => {
      console.log(`   - ${Object.values(row)[0]}`);
    });

    console.log('\n🎉 Database initialization completed successfully!\n');
    return { success: true };
  } catch (error) {
    console.error('❌ Database initialization error:', error.message || error.sqlMessage || error.code || error);
    if (error.code === 'ECONNREFUSED') {
      console.error('👉 Error detail: Unable to connect to MySQL on localhost:3306. Is the MySQL Windows service (e.g., MySQL80 or XAMPP/WAMP MySQL) running?');
    }
    return { success: false, error: error.message || error.code };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
