const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const db = require('./utils/db');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const outpassRoutes = require('./routes/outpass');
const parentRoutes = require('./routes/parent');
const qrRoutes = require('./routes/qr');
const caretakerRoutes = require('./routes/caretaker');
const watchmanRoutes = require('./routes/watchman');
const extensionRoutes = require('./routes/extension');
const principalRoutes = require('./routes/principal');
const advisorRoutes = require('./routes/advisor');
const notificationRoutes = require('./routes/notifications');
const gateRoutes = require('./routes/gate');
const qrController = require('./controllers/qrController');
const notificationService = require('./services/notificationService');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, authenticateToken, authorizeRoles } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

// Initialize express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Set global Socket.IO instance for notificationService
notificationService.setSocketIoInstance(io);

const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO event handling & Room management
io.on('connection', (socket) => {
  // Helper to join rooms for authenticated user
  const joinUserRooms = (user) => {
    if (!user || !user.role) return;
    const role = String(user.role).toLowerCase().trim().replace(/[- ]/g, '_');
    const userId = user.id;

    const userRoom = `user_${role}_${userId}`;
    const roleRoom = `role_${role}`;

    socket.join(userRoom);
    socket.join(roleRoom);

    // Also join recipient type rooms
    if (role === 'student') socket.join(`user_student_${userId}`);
    if (role === 'parent') socket.join(`user_parent_${userId}`);
    if (['class_advisor', 'warden', 'principal', 'caretaker', 'watchman'].includes(role)) {
      socket.join(`user_staff_${userId}`);
    }

    console.log(`[Socket.IO] Socket ${socket.id} joined rooms: ${userRoom}, ${roleRoom}`);
  };

  // 1. Check token in handshake query or auth
  const token = (socket.handshake.auth && socket.handshake.auth.token) ||
                (socket.handshake.query && socket.handshake.query.token);

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      joinUserRooms(decoded);
    } catch (e) {
      console.warn(`[Socket.IO] Handshake token verification failed: ${e.message}`);
    }
  }

  // 2. Allow client to emit 'authenticate' or 'join' dynamically
  socket.on('authenticate', (authToken) => {
    if (!authToken) return;
    try {
      const decoded = jwt.verify(authToken, JWT_SECRET);
      socket.user = decoded;
      joinUserRooms(decoded);
      socket.emit('authenticated', { success: true, user: decoded });
    } catch (err) {
      socket.emit('authenticated', { success: false, message: 'Invalid token' });
    }
  });

  socket.on('disconnect', () => {
    // disconnected
  });
});

// Attach io instance to request for route handlers if needed
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/outpass', outpassRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/caretaker', caretakerRoutes);
app.use('/api/watchman', watchmanRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api/extension-requests', extensionRoutes);
app.use('/api/principal', principalRoutes);
app.use('/api/advisor', advisorRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/gate', gateRoutes);
const studentRoutes = require('./routes/student');
app.use('/api/student', studentRoutes);
const outpassController = require('./controllers/outpassController');
app.get('/api/student/active-outpass', authenticateToken, authorizeRoles('student'), qrController.getStudentActiveOutpass);
app.get('/api/warden/students/search', authenticateToken, authorizeRoles('warden'), outpassController.searchWardenStudents);
app.get('/api/warden/parent-messages', authenticateToken, authorizeRoles('warden'), outpassController.getWardenParentMessages);
app.get('/api/warden/registered-students/stats', authenticateToken, authorizeRoles('warden'), outpassController.getWardenRegisteredStudentsStats);
app.get('/api/warden/registered-students', authenticateToken, authorizeRoles('warden'), outpassController.getWardenRegisteredStudents);
app.get('/api/warden/parents/search', authenticateToken, authorizeRoles('warden'), outpassController.searchWardenParentByMobile);
app.post('/api/warden/parents/revoke-face', authenticateToken, authorizeRoles('warden'), outpassController.revokeParentFace);

// Dedicated clean dashboard page routes (supporting both with and without .html)
const dashboardPages = [
  'student-dashboard',
  'parent-dashboard',
  'advisor-dashboard',
  'warden-dashboard',
  'principal-dashboard',
  'caretaker-dashboard',
  'watchman-dashboard'
];

dashboardPages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// Explicit client page routes for welcome screen and login portal
app.get(['/login', '/welcome'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route ${req.originalUrl} not found`
  });
});

// Fallback to index.html for client routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handler
app.use(errorHandler);

// Handle server startup errors (e.g. port already in use)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another running process.`);
    console.error(`👉 Please terminate the other process using port ${PORT} or update PORT in .env.\n`);
  } else {
    console.error('\n❌ Server Startup Error:', err.message);
  }
  process.exit(1);
});

// Start server
server.listen(PORT, async () => {
  console.log('====================================================');
  console.log(`🚀 Smart Hostel Outpass System Server Started`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🗄️  DB Test: http://localhost:${PORT}/api/db-test`);
  console.log('====================================================');

  // Test MySQL connection on startup
  const dbStatus = await db.testConnection();
  if (dbStatus.connected) {
    console.log(`✅ Database Connected successfully to [${process.env.DB_NAME || 'smart_hostel_outpass'}] on ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
  } else {
    console.warn(`⚠️  Database Warning: ${dbStatus.message}`);
    console.warn(`👉 Please check MySQL status and update credentials in .env file if needed.`);
  }
});

module.exports = { app, server, io };
