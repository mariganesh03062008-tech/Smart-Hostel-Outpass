const express = require('express');
const router = express.Router();
const principalController = require('../controllers/principalController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const outpassController = require('../controllers/outpassController');

// All Principal routes are restricted to Principal role
router.use(authenticateToken, authorizeRoles('principal'));

// 1. Dashboard Overview Counters
router.get('/overview', principalController.getPrincipalOverview);

// 2. Normal Outpass Monitoring (Read-Only)
router.get('/normal-outpasses', principalController.getNormalOutpasses);

// 3. One-Day Permission Queue (For Principal Decision)
router.get('/one-day-permissions', principalController.getPendingOneDayPermissions);
router.get('/one-day/pending', principalController.getPendingOneDayPermissions);
router.patch('/one-day/:id/approve', outpassController.principalApprove);
router.patch('/one-day/:id/reject', outpassController.principalReject);
router.patch('/:id/approve', outpassController.principalApprove);
router.patch('/:id/reject', outpassController.principalReject);

// 4. Student Residency Roster & Status Monitoring
router.get('/student-status', principalController.getStudentStatus);
router.get('/students', principalController.getStudentStatus);
router.get('/students-outside', principalController.getOutsideStudentsReport);

// 5. Outpass Overview & Master Records
router.get('/outpass-overview', principalController.getOutpassOverview);

// 6. Today's Unified Activity Timeline
router.get('/today-activity', principalController.getTodayActivity);

// 7. Real-Time Institutional Analytics & Chart Data
router.get('/analytics', principalController.getAnalytics);

// 6. Dedicated Report Endpoints
router.get('/reports/daily', principalController.getDailyReport);
router.get('/reports/monthly', principalController.getMonthlyReport);
router.get('/reports/outside-students', principalController.getOutsideStudentsReport);
router.get('/reports/late-returns', principalController.getLateReturnsReport);
router.get('/reports/extensions', principalController.getExtensionsReport);
router.get('/reports/one-day-duty', principalController.getOneDayDutyReport);
router.get('/reports/normal', principalController.getNormalOutpassReport);

module.exports = router;
