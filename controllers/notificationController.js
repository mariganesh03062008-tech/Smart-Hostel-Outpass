/**
 * Notification Controller
 * Manages user notifications, unread counts, and read status updates
 */

const { pool } = require('../utils/db');

function normalizeRole(r) {
  if (!r || typeof r !== 'string') return '';
  const clean = r.toLowerCase().trim().replace(/[- ]/g, '_');
  if (clean === 'advisor' || clean === 'classadvisor') return 'class_advisor';
  if (clean === 'security' || clean === 'guard') return 'watchman';
  return clean;
}

/**
 * GET /api/notifications
 * Retrieve notifications for the authenticated user
 */
exports.getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = normalizeRole(req.user.role);

    // Fetch user-specific notifications or role-wide notifications
    const [rows] = await pool.query(`
      SELECT 
        id,
        user_id AS userId,
        role,
        title,
        message,
        type,
        reference_id AS referenceId,
        is_read AS isRead,
        link_url AS linkUrl,
        created_at AS createdAt
      FROM notifications
      WHERE (user_id = ? AND (role = ? OR role IS NULL))
         OR (role = 'student' AND student_id = ?)
         OR (role = 'parent' AND parent_id = ?)
         OR (role = ? AND (staff_id = ? OR staff_id IS NULL OR user_id IS NULL OR role IN ('watchman', 'caretaker', 'warden', 'principal')))
      ORDER BY created_at DESC
      LIMIT 50;
    `, [userId, role, userId, userId, role, userId]);

    // Count unread
    const [countRows] = await pool.query(`
      SELECT COUNT(*) AS unreadCount
      FROM notifications
      WHERE is_read = 0 AND (
        (user_id = ? AND (role = ? OR role IS NULL))
        OR (role = 'student' AND student_id = ?)
        OR (role = 'parent' AND parent_id = ?)
        OR (role = ? AND (staff_id = ? OR staff_id IS NULL OR user_id IS NULL OR role IN ('watchman', 'caretaker', 'warden', 'principal')))
      );
    `, [userId, role, userId, userId, role, userId]);

    const unreadCount = countRows.length > 0 ? Number(countRows[0].unreadCount) : 0;

    return res.status(200).json({
      success: true,
      count: rows.length,
      unreadCount,
      notifications: rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read (with ownership verification)
 */
exports.markNotificationAsRead = async (req, res, next) => {
  try {
    const notifId = req.params.id;
    const userId = req.user.id;
    const role = normalizeRole(req.user.role);

    // Verify ownership
    const [rows] = await pool.query(`
      SELECT id, user_id, role, student_id, parent_id, staff_id 
      FROM notifications 
      WHERE id = ?;
    `, [notifId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    const notif = rows[0];
    let isOwner = false;
    if (notif.role && notif.role !== role) {
      isOwner = false;
    } else if (notif.user_id) {
      isOwner = (notif.user_id === userId && (!notif.role || notif.role === role));
    } else if (role === 'student' && notif.student_id) {
      isOwner = (notif.student_id === userId);
    } else if (role === 'parent' && notif.parent_id) {
      isOwner = (notif.parent_id === userId);
    } else if (notif.staff_id) {
      isOwner = (notif.staff_id === userId && notif.role === role);
    } else if (notif.role && !notif.student_id && !notif.parent_id && !notif.user_id && !notif.staff_id) {
      isOwner = (notif.role === role);
    }

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only modify your own notifications.'
      });
    }

    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ?;', [notifId]);

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: { id: parseInt(notifId, 10), isRead: 1 }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications for the authenticated user as read
 */
exports.markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = normalizeRole(req.user.role);

    await pool.query(`
      UPDATE notifications
      SET is_read = 1
      WHERE is_read = 0 AND (
        (user_id = ? AND (role = ? OR role IS NULL))
        OR (role = 'student' AND student_id = ?)
        OR (role = 'parent' AND parent_id = ?)
        OR (role = ? AND (staff_id = ? OR staff_id IS NULL OR user_id IS NULL OR role IN ('watchman', 'caretaker', 'warden', 'principal')))
      );
    `, [userId, role, userId, userId, role, userId]);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.'
    });

  } catch (error) {
    next(error);
  }
};
