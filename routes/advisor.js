const express = require('express');
const router = express.Router();
const outpassController = require('../controllers/outpassController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All Class Advisor endpoints require valid JWT authentication and role = 'class_advisor'
router.use(authenticateToken, authorizeRoles('class_advisor'));

// 1. Advisor Dashboard Overview & Statistics
router.get('/overview', outpassController.getAdvisorOverview);

// 2. Pending One-Day Duty Requests Queue
router.get('/one-day/pending', outpassController.getAdvisorPending);
router.get('/pending', outpassController.getAdvisorPending);

// 3. Class Advisor Approval & Rejection for One-Day Permission
router.patch('/one-day/:id/approve', outpassController.advisorApprove);
router.patch('/one-day/:id/reject', outpassController.advisorReject);
router.patch('/:id/approve', outpassController.advisorApprove);
router.patch('/:id/reject', outpassController.advisorReject);

// 4. Approved & Rejected Lists
router.get('/one-day/approved', outpassController.getAdvisorApproved);
router.get('/approved', outpassController.getAdvisorApproved);
router.get('/one-day/rejected', outpassController.getAdvisorRejected);
router.get('/rejected', outpassController.getAdvisorRejected);

module.exports = router;
