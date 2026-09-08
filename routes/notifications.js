/**
 * Notifications Router
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');

// All notification endpoints require authenticated session
router.use(authenticateToken);

// 1. Get user notifications & unread count
router.get('/', notificationController.getUserNotifications);

// 2. Mark all as read
router.patch('/read-all', notificationController.markAllAsRead);

// 3. Mark single notification as read
router.patch('/:id/read', notificationController.markNotificationAsRead);

module.exports = router;
