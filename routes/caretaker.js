const express = require('express');
const router = express.Router();
const caretakerController = require('../controllers/caretakerController');
const gateController = require('../controllers/gateController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All caretaker endpoints are strictly protected for authenticated Caretaker staff
// Watchman and other roles are strictly FORBIDDEN with HTTP 403
router.use(authenticateToken, authorizeRoles('caretaker'));

// 1. Dashboard Overview & Statistics
router.get('/overview', caretakerController.getCaretakerOverview);

// 2. Student Exit Scanning & Atomic Transaction (Check-Out ONLY)
router.post('/exit', caretakerController.recordStudentExit);
router.post('/checkout', caretakerController.recordStudentExit);

// 3. Students Currently Outside Grouped by Academic Year
router.get('/students-outside', caretakerController.getStudentsOutside);

// 4. Historical Exit Records & Check-Out List
router.get('/exit-history', caretakerController.getExitHistory);
router.get('/checkout-list', gateController.getCheckoutList);

// 5. Daily Movement Summary
router.get('/daily-summary', gateController.getDailyMovementSummary);

module.exports = router;
