/**
 * Centralized Notification Service
 * Handles notification creation, MySQL persistence, deduplication, and Socket.IO real-time emission
 */

const { pool } = require('../utils/db');

// Global reference to Socket.IO instance
let socketIoInstance = null;

function setSocketIoInstance(io) {
  socketIoInstance = io;
}

function getSocketIoInstance() {
  return socketIoInstance;
}

/**
 * Create and dispatch a targeted notification
 */
async function createNotification({
  userId = null,
  role = null,
  title,
  message,
  type,
  referenceId = null,
  linkUrl = null,
  studentId = null,
  parentId = null,
  staffId = null,
  recipientType = null,
  io = null
}) {
  try {
    if (!title || !message || !type) {
      console.warn('[NotificationService] Missing required notification fields:', { title, message, type });
      return null;
    }

    const normalizedRole = role ? String(role).toLowerCase().trim().replace(/[- ]/g, '_') : null;
    const recType = recipientType || (studentId ? 'student' : (parentId ? 'parent' : (staffId ? 'staff' : (normalizedRole === 'student' ? 'student' : (normalizedRole === 'parent' ? 'parent' : 'staff')))));

    // 1. Deduplication check: prevent creating identical notifications for the same event
    if (referenceId && type) {
      const [existing] = await pool.query(`
        SELECT id, is_read, created_at 
        FROM notifications 
        WHERE type = ? 
          AND reference_id = ? 
          AND (
            (role = ? AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))) 
            OR (student_id IS NOT NULL AND student_id = ?) 
            OR (parent_id IS NOT NULL AND parent_id = ?) 
            OR (staff_id IS NOT NULL AND staff_id = ?)
          )
        LIMIT 1;
      `, [type, String(referenceId), normalizedRole, userId, userId, studentId, parentId, staffId]);

      if (existing.length > 0) {
        // Notification already recorded for this reference and user
        return existing[0];
      }
    }

    // 2. Insert into MySQL notifications table
    const [result] = await pool.query(`
      INSERT INTO notifications (
        user_id, role, title, message, type, reference_id, is_read,
        recipient_type, student_id, parent_id, staff_id, link_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NOW());
    `, [
      userId,
      normalizedRole,
      title,
      message,
      type,
      referenceId ? String(referenceId) : null,
      recType,
      studentId,
      parentId,
      staffId,
      linkUrl
    ]);

    const notificationId = result.insertId;

    const notifData = {
      id: notificationId,
      user_id: userId,
      role: normalizedRole,
      title,
      message,
      type,
      reference_id: referenceId ? String(referenceId) : null,
      link_url: linkUrl,
      is_read: 0,
      created_at: new Date().toISOString()
    };

    // 3. Emit real-time Socket.IO event to targeted rooms
    const activeIo = io || socketIoInstance;
    if (activeIo) {
      // Direct user room emission
      if (userId && normalizedRole) {
        activeIo.to(`user_${normalizedRole}_${userId}`).emit('notification:new', notifData);
      }
      if (studentId) {
        activeIo.to(`user_student_${studentId}`).emit('notification:new', notifData);
      }
      if (parentId) {
        activeIo.to(`user_parent_${parentId}`).emit('notification:new', notifData);
      }
      if (staffId) {
        activeIo.to(`user_staff_${staffId}`).emit('notification:new', notifData);
      }

      // Role broadcast room emission (if targeted to all staff of a role, e.g. all wardens, all caretakers, all watchmen, or principal)
      if (normalizedRole && !userId && !studentId && !parentId && !staffId) {
        activeIo.to(`role_${normalizedRole}`).emit('notification:new', notifData);
      }
    }

    return notifData;
  } catch (error) {
    console.error('[NotificationService Error]:', error.message);
    return null;
  }
}

/**
 * Workflow Notification Helpers
 */

async function notifyStudent({ studentId, title, message, type, referenceId = null, linkUrl = null, io = null }) {
  return createNotification({
    userId: studentId,
    studentId,
    role: 'student',
    recipientType: 'student',
    title,
    message,
    type,
    referenceId,
    linkUrl: linkUrl || '/student-dashboard.html',
    io
  });
}

async function notifyParent({ parentId, title, message, type, referenceId = null, linkUrl = null, io = null }) {
  return createNotification({
    userId: parentId,
    parentId,
    role: 'parent',
    recipientType: 'parent',
    title,
    message,
    type,
    referenceId,
    linkUrl: linkUrl || '/parent-dashboard.html',
    io
  });
}

async function notifyAdvisor({ advisorId, department = null, title, message, type, referenceId = null, linkUrl = null, io = null }) {
  return createNotification({
    userId: advisorId,
    staffId: advisorId,
    role: 'class_advisor',
    recipientType: 'staff',
    title,
    message,
    type,
    referenceId,
    linkUrl: linkUrl || '/advisor-dashboard.html',
    io
  });
}

async function notifyPrincipal({ title, message, type, referenceId = null, linkUrl = null, io = null }) {
  return createNotification({
    userId: null,
    staffId: null,
    role: 'principal',
    recipientType: 'staff',
    title,
    message,
    type,
    referenceId,
    linkUrl: linkUrl || '/principal-dashboard.html',
    io
  });
}

async function notifyWarden({ wardenId = null, title, message, type, referenceId = null, linkUrl = null, io = null }) {
  return createNotification({
    userId: wardenId,
    staffId: wardenId,
    role: 'warden',
    recipientType: 'staff',
    title,
    message,
    type,
    referenceId,
    linkUrl: linkUrl || '/warden-dashboard.html',
    io
  });
}

async function notifyCaretaker({ caretakerId = null, title, message, type, referenceId = null, linkUrl = null, io = null }) {
  return createNotification({
    userId: caretakerId,
    staffId: caretakerId,
    role: 'caretaker',
    recipientType: 'staff',
    title,
    message,
    type,
    referenceId,
    linkUrl: linkUrl || '/caretaker-dashboard.html',
    io
  });
}

async function notifyWatchman({ watchmanId = null, title, message, type, referenceId = null, linkUrl = null, io = null }) {
  return createNotification({
    userId: watchmanId,
    staffId: watchmanId,
    role: 'watchman',
    recipientType: 'staff',
    title,
    message,
    type,
    referenceId,
    linkUrl: linkUrl || '/watchman-dashboard.html',
    io
  });
}

module.exports = {
  setSocketIoInstance,
  getSocketIoInstance,
  createNotification,
  notifyStudent,
  notifyParent,
  notifyAdvisor,
  notifyPrincipal,
  notifyWarden,
  notifyCaretaker,
  notifyWatchman
};
