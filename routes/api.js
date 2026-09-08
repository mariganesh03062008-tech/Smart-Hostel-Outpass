const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// Health Check Endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Smart Hostel Outpass API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Database Connection Test Endpoint
router.get('/db-test', async (req, res) => {
  try {
    const dbStatus = await db.testConnection();

    if (dbStatus.connected) {
      return res.status(200).json({
        success: true,
        message: 'MySQL Database connection successful',
        database: process.env.DB_NAME || 'smart_hostel_outpass',
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(503).json({
        success: false,
        message: 'MySQL Database connection failed',
        error: dbStatus.message,
        errorCode: dbStatus.code,
        hint: 'Please ensure MySQL service is running and credentials in .env are correct.',
        database: process.env.DB_NAME || 'smart_hostel_outpass',
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error while testing database connection',
      error: error.message
    });
  }
});

// Roles info endpoint (useful for frontend login dynamically)
router.get('/roles', (req, res) => {
  const roles = [
    { id: 'student', title: 'Student', identifierLabel: 'Registration / Roll Number', placeholder: 'e.g. 21CS042', icon: 'graduation-cap' },
    { id: 'parent', title: 'Parent', identifierLabel: 'Registered Mobile Number or Email', placeholder: 'e.g. +91 9876543210', icon: 'users' },
    { id: 'warden', title: 'Warden', identifierLabel: 'Staff ID / Employee Code', placeholder: 'e.g. WRD-101', icon: 'shield' },
    { id: 'principal', title: 'Principal', identifierLabel: 'Admin ID / Email', placeholder: 'e.g. PRC-001', icon: 'award' },
    { id: 'class_advisor', title: 'Class Advisor', identifierLabel: 'Faculty ID', placeholder: 'e.g. ADV-204', icon: 'briefcase' },
    { id: 'caretaker', title: 'Caretaker', identifierLabel: 'Staff ID', placeholder: 'e.g. CTK-305', icon: 'home' },
    { id: 'watchman', title: 'Watchman (Gate Security)', identifierLabel: 'Security ID / Gate Code', placeholder: 'e.g. SEC-012', icon: 'key' }
  ];

  res.status(200).json({
    success: true,
    roles
  });
});

module.exports = router;
