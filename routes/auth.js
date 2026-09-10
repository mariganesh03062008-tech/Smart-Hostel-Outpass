const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Public route: User Login
router.post('/login', authController.login);

// Public route: Parent Account Registration
router.post('/register-parent', authController.registerParent);

// Public route: Pre-submit Student Roll Verification
router.get('/check-student-roll', authController.checkStudentRoll);

// Public route: Student Account Registration
router.post('/register-student', authController.registerStudent);
router.post('/register', authController.registerStudent);

// Protected route: Get Current Authenticated Profile
router.get('/me', authenticateToken, authController.getMe);

// Student profile aliases
const studentController = require('../controllers/studentController');
const { authorizeRoles } = require('../middleware/auth');
router.get('/student-profile', authenticateToken, authorizeRoles('student'), studentController.getStudentProfile);
router.put('/student-profile', authenticateToken, authorizeRoles('student'), studentController.updateStudentProfile);
router.post('/student-profile', authenticateToken, authorizeRoles('student'), studentController.updateStudentProfile);

// Public/Protected route: Logout acknowledgment
router.post('/logout', authController.logout);

module.exports = router;

