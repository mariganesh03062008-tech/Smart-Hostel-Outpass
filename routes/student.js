const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All routes here require student authentication
router.use(authenticateToken, authorizeRoles('student'));

// Profile endpoints
router.get('/profile', studentController.getStudentProfile);
router.put('/profile', studentController.updateStudentProfile);
router.post('/profile', studentController.updateStudentProfile); // Alias for compatibility

module.exports = router;
