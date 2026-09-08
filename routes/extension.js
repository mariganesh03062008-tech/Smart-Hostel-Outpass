const express = require('express');
const router = express.Router();
const extensionController = require('../controllers/extensionController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// ==========================================
// 1. Student Extension Routes
// ==========================================

// POST /api/extension-requests OR /api/extension - Submit extension request
router.post('/', authenticateToken, authorizeRoles('student'), extensionController.createExtensionRequest);

// POST /api/extension/request - Legacy alias
router.post('/request', authenticateToken, authorizeRoles('student'), extensionController.requestExtension);

// GET /api/extension/student/history - Student's extension request history
router.get('/student/history', authenticateToken, authorizeRoles('student'), extensionController.getStudentExtensionHistory);
router.get('/history', authenticateToken, authorizeRoles('student'), extensionController.getStudentExtensionHistory);

// ==========================================
// 2. Warden Extension Authorization Routes
// ==========================================

// GET /api/extension-requests OR /api/extension - Pending extension requests for Warden
router.get('/', authenticateToken, authorizeRoles('warden'), extensionController.getPendingExtensionRequests);

// GET /api/extension/warden/pending - Legacy alias
router.get('/warden/pending', authenticateToken, authorizeRoles('warden'), extensionController.getWardenPendingExtensions);

// PATCH /api/extension-requests/:id/review - Unified Warden review endpoint
router.patch('/:id/review', authenticateToken, authorizeRoles('warden'), extensionController.reviewExtensionRequest);

// PATCH /api/extension/:id/approve - Direct approve alias
router.patch('/:id/approve', authenticateToken, authorizeRoles('warden'), extensionController.approveExtension);

// PATCH /api/extension/:id/reject - Direct reject alias
router.patch('/:id/reject', authenticateToken, authorizeRoles('warden'), extensionController.rejectExtension);

// GET /api/extension/warden/history - Warden extension history & audit trail
router.get('/warden/history', authenticateToken, authorizeRoles('warden'), extensionController.getWardenExtensionHistory);

module.exports = router;
