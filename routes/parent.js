const express = require('express');
const router = express.Router();
const parentController = require('../controllers/parentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All Parent endpoints require valid JWT authentication and role = 'parent'
router.use(authenticateToken, authorizeRoles('parent'));

// 1. Overview & Linked Student Info
router.get('/overview', parentController.getParentOverview);

// 2. Parent Face Biometric Verification Endpoints
router.get('/face/status', parentController.getFaceStatus);
router.post('/face/register', parentController.registerFace);
router.post('/outpass/:id/face-verify', parentController.verifyFace);

// 3. Outpass Approval Workflow for Linked Student (Face Verification Protected)
router.get('/outpass/pending', parentController.getPendingRequests);
router.get('/outpass/approved', parentController.getApprovedRequests);
router.get('/outpass/rejected', parentController.getRejectedRequests);
router.get('/outpass/:id', parentController.getSingleOutpass);
router.patch('/outpass/:id/approve', parentController.approveOutpass);
router.patch('/outpass/:id/reject', parentController.rejectOutpass);

// 4. Parent Messaging (Supports English & Tamil Unicode)
router.get('/messages', parentController.getMessages);
router.post('/messages', parentController.sendMessage);

// 5. Parent Profile Update
router.put('/profile', parentController.updateParentProfile);

module.exports = router;
