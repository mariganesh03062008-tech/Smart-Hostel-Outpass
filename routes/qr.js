const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qrController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// ==========================================
// 1. QR Validation Engine (Public / Scanner)
// ==========================================
router.post('/validate', qrController.validateQrToken);

// ==========================================
// 2. Student Active Outpass & QR Retrieval
// ==========================================
router.get('/my-active', authenticateToken, authorizeRoles('student'), qrController.getStudentActiveOutpass);

// ==========================================
// 3. QR Code Generation & Management
// ==========================================
router.post('/generate/:outpassId', authenticateToken, authorizeRoles('warden', 'principal'), qrController.generateQrForOutpass);
router.post('/regenerate/:outpassId', authenticateToken, authorizeRoles('warden'), qrController.regenerateQr);
router.patch('/revoke/:qrId', authenticateToken, authorizeRoles('warden'), qrController.revokeQr);
router.get('/warden/active-qrs', authenticateToken, authorizeRoles('warden'), qrController.getWardenActiveQrs);

module.exports = router;
