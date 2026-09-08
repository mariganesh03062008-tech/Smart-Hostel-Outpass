const express = require('express');
const router = express.Router();
const gateController = require('../controllers/gateController');
const caretakerController = require('../controllers/caretakerController');
const watchmanController = require('../controllers/watchmanController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// =========================================================================
// 1. CARETAKER CHECK-OUT ONLY (Watchman is strictly FORBIDDEN with HTTP 403)
// =========================================================================
router.post('/checkout', authenticateToken, authorizeRoles('caretaker'), caretakerController.recordStudentExit);

// =========================================================================
// 2. WATCHMAN CHECK-IN ONLY (Caretaker is strictly FORBIDDEN with HTTP 403)
// =========================================================================
router.post('/checkin', authenticateToken, authorizeRoles('watchman'), watchmanController.recordStudentReturn);

// =========================================================================
// 3. DAILY MOVEMENT SUMMARY & DAY-END AGGREGATION
// =========================================================================
router.get('/daily-summary', authenticateToken, authorizeRoles('caretaker', 'watchman', 'warden', 'principal'), gateController.getDailyMovementSummary);

// =========================================================================
// 4. CHECK-OUT LIST (Live & Historical)
// =========================================================================
router.get('/checkout-list', authenticateToken, authorizeRoles('caretaker', 'watchman', 'warden', 'principal'), gateController.getCheckoutList);

// =========================================================================
// 5. CHECK-IN / RETURN LIST (Live & Historical)
// =========================================================================
router.get('/checkin-list', authenticateToken, authorizeRoles('caretaker', 'watchman', 'warden', 'principal'), gateController.getCheckinList);

module.exports = router;
