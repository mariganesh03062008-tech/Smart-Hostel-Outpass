const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'smart_hostel_outpass_super_secret_jwt_key_2026';

/**
 * Authentication Middleware
 * Validates JWT token from Authorization header (Bearer <token>)
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : (req.query && req.query.token);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: No authentication token provided. Please log in.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session Expired: Authentication token has expired. Please log in again.'
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Access Denied: Invalid or corrupted authentication token.'
    });
  }
}

function normalizeRoleString(r) {
  if (!r || typeof r !== 'string') return '';
  const clean = r.toLowerCase().trim().replace(/[- ]/g, '_');
  if (clean === 'advisor' || clean === 'classadvisor') return 'class_advisor';
  if (clean === 'security' || clean === 'guard') return 'watchman';
  return clean;
}

/**
 * Role Authorization Middleware
 * Ensures user has one of the allowed roles (case-insensitive & formatted)
 */
function authorizeRoles(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map(normalizeRoleString);

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User role not identified.'
      });
    }

    const userRole = normalizeRoleString(req.user.role);

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted. Role '${req.user.role}' does not have permission.`
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  JWT_SECRET
};
