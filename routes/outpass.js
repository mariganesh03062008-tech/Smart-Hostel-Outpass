const express = require('express');
const router = express.Router();
const outpassController = require('../controllers/outpassController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// ==========================================
// 1. Student Outpass Routes
// ==========================================

// POST /api/outpass - Submit new outpass request (Normal Outpass or One-Day Duty)
router.post('/', authenticateToken, authorizeRoles('student'), outpassController.createOutpass);

// GET /api/outpass/my-requests - Get list of submitted outpass requests for student
router.get('/my-requests', authenticateToken, authorizeRoles('student'), outpassController.getMyRequests);

// GET /api/outpass/status-summary - Get dashboard stats & inside/outside hostel status
router.get('/status-summary', authenticateToken, authorizeRoles('student'), outpassController.getStatusSummary);

// POST /api/outpass/student/location & /location - Student live GPS location update
router.post('/student/location', authenticateToken, authorizeRoles('student'), outpassController.updateStudentLocation);
router.post('/location', authenticateToken, authorizeRoles('student'), outpassController.updateStudentLocation);

// GET /api/outpass/student/location & /location - Get student location & freshness status
router.get('/student/location', authenticateToken, authorizeRoles('student'), outpassController.getStudentLocation);
router.get('/location', authenticateToken, authorizeRoles('student'), outpassController.getStudentLocation);

// ==========================================
// 2. Warden Authorization & Oversight Routes
// ==========================================

// GET /api/outpass/warden/overview - Overview stats for Warden Dashboard
router.get('/warden/overview', authenticateToken, authorizeRoles('warden'), outpassController.getWardenOverview);

// GET /api/outpass/warden/pending - Pending Normal outpass requests awaiting Warden
router.get('/warden/pending', authenticateToken, authorizeRoles('warden'), outpassController.getWardenPending);

// GET /api/outpass/warden/pending-duty - Pending One-Day Duty requests approved by Advisor awaiting Warden
router.get('/warden/pending-duty', authenticateToken, authorizeRoles('warden'), outpassController.getWardenPendingDuty);

// GET /api/outpass/warden/active - Active / Approved outpasses list
router.get('/warden/active', authenticateToken, authorizeRoles('warden'), outpassController.getWardenActive);

// GET /api/outpass/warden/students/search - Student search for Warden (scoped parent response & verification)
router.get('/warden/students/search', authenticateToken, authorizeRoles('warden'), outpassController.searchWardenStudents);

// GET /api/outpass/warden/parent-messages - Parent messages log for Warden
router.get('/warden/parent-messages', authenticateToken, authorizeRoles('warden'), outpassController.getWardenParentMessages);

// GET /api/outpass/warden/reports - Hostel outpass analytics & reports for Warden
router.get('/warden/reports', authenticateToken, authorizeRoles('warden'), outpassController.getWardenReports);

// PATCH /api/outpass/:id/approve - Warden final approval
router.patch('/:id/approve', authenticateToken, authorizeRoles('warden'), outpassController.approveOutpass);

// PATCH /api/outpass/:id/reject - Warden rejection with reason
router.patch('/:id/reject', authenticateToken, authorizeRoles('warden'), outpassController.rejectOutpass);

// ==========================================
// 3. Class Advisor Workflow Routes
// ==========================================

// GET /api/outpass/advisor/overview - Advisor Dashboard metrics & department activity
router.get('/advisor/overview', authenticateToken, authorizeRoles('class_advisor'), outpassController.getAdvisorOverview);

// GET /api/outpass/advisor/pending - Get pending OD requests awaiting Advisor clearance
router.get('/advisor/pending', authenticateToken, authorizeRoles('class_advisor'), outpassController.getAdvisorPending);

// GET /api/outpass/advisor/approved - Get OD requests approved by this Advisor
router.get('/advisor/approved', authenticateToken, authorizeRoles('class_advisor'), outpassController.getAdvisorApproved);

// GET /api/outpass/advisor/rejected - Get OD requests rejected by this Advisor
router.get('/advisor/rejected', authenticateToken, authorizeRoles('class_advisor'), outpassController.getAdvisorRejected);

// PATCH /api/outpass/:id/advisor-approve - Advisor approval -> forwards to Principal
router.patch('/:id/advisor-approve', authenticateToken, authorizeRoles('class_advisor'), outpassController.advisorApprove);

// PATCH /api/outpass/:id/advisor-reject - Advisor rejection
router.patch('/:id/advisor-reject', authenticateToken, authorizeRoles('class_advisor'), outpassController.advisorReject);

// ==========================================
// 4. Principal One-Day Permission Authorization
// ==========================================

// PATCH /api/outpass/:id/principal-approve - Principal final approval for One-Day Permission
router.patch('/:id/principal-approve', authenticateToken, authorizeRoles('principal'), outpassController.principalApprove);

// PATCH /api/outpass/:id/principal-reject - Principal rejection for One-Day Permission
router.patch('/:id/principal-reject', authenticateToken, authorizeRoles('principal'), outpassController.principalReject);

module.exports = router;
