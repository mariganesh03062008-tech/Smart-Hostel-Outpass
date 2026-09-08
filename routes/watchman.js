const express = require('express');
const router = express.Router();
const watchmanController = require('../controllers/watchmanController');
const gateController = require('../controllers/gateController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All watchman endpoints are strictly protected for authenticated Watchman staff
// Caretaker and other roles are strictly FORBIDDEN with HTTP 403
router.use(authenticateToken, authorizeRoles('watchman'));

// 1. Dashboard Overview & Statistics
router.get('/overview', watchmanController.getWatchmanOverview);

// 2. Student Return Scanning & Atomic Transaction (Check-In ONLY)
router.post('/return', watchmanController.recordStudentReturn);
router.post('/checkin', watchmanController.recordStudentReturn);

// 3. Students Currently Outside
router.get('/students-outside', watchmanController.getStudentsOutside);

// 4. Return History & Check-In List with Date Filters
router.get('/return-history', watchmanController.getReturnHistory);
router.get('/checkin-list', gateController.getCheckinList);

// 5. Daily Movement Summary
router.get('/daily-summary', gateController.getDailyMovementSummary);

module.exports = router;
