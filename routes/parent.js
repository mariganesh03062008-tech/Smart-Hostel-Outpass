const express = require('express');
const router = express.Router();
const parentController = require('../controllers/parentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All Parent endpoints require valid JWT authentication and role = 'parent'
router.use(authenticateToken, authorizeRoles('parent'));

// 1. Overview & Linked Student Info
router.get('/overview', parentController.getParentOverview);

// 2. Hardware-Independent Fingerprint Scanner Service Endpoints
router.get('/fingerprint/status', parentController.getFingerprintStatus);
router.post('/fingerprint/register', parentController.registerFingerprint);
router.post('/fingerprint/verify', parentController.verifyBiometric);

// Backwards-compatible aliases
router.post('/biometric-verify', parentController.verifyBiometric);
router.post('/register-fingerprint', parentController.registerFingerprint);

// 3. Outpass Approval Workflow for Linked Student (GPS 5-Meter Proximity Verification)
router.get('/outpass/pending', parentController.getPendingRequests);
router.get('/outpass/approved', parentController.getApprovedRequests);
router.get('/outpass/rejected', parentController.getRejectedRequests);
router.post('/outpass/:id/location-verify', parentController.verifyParentLocation);
router.patch('/outpass/:id/approve', parentController.approveOutpass);
router.patch('/outpass/:id/reject', parentController.rejectOutpass);

// 4. Parent Messaging (Supports English & Tamil Unicode)
router.get('/messages', parentController.getMessages);
router.post('/messages', parentController.sendMessage);

// 5. Parent Profile Update
router.put('/profile', parentController.updateParentProfile);

module.exports = router;
