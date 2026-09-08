const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/db');
const { JWT_SECRET } = require('../middleware/auth');

// Allowed system roles
const VALID_ROLES = ['student', 'parent', 'warden', 'principal', 'class_advisor', 'caretaker', 'watchman'];

/**
 * POST /api/auth/login
 * Authenticates users for all 7 roles with bcrypt & JWT
 */
exports.login = async (req, res, next) => {
  try {
    const rawUsername = req.body.username || req.body.identifier;
    const rawPassword = req.body.password;
    const rawRole = req.body.role;

    // 1. Input Validation
    if (!rawUsername || typeof rawUsername !== 'string' || !rawUsername.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Username / Identifier is required.'
      });
    }

    if (!rawPassword || typeof rawPassword !== 'string' || !rawPassword.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Password is required.'
      });
    }

    function normalizeRoleInput(r) {
      if (!r || typeof r !== 'string') return '';
      const clean = r.toLowerCase().trim().replace(/[- ]/g, '_');
      if (clean === 'advisor' || clean === 'classadvisor') return 'class_advisor';
      if (clean === 'security' || clean === 'guard') return 'watchman';
      return clean;
    }

    // Role defaults to 'student' if omitted from request payload
    const role = (rawRole !== undefined && rawRole !== null && String(rawRole).trim() !== '')
      ? normalizeRoleInput(rawRole)
      : 'student';

    const username = rawUsername.trim();
    const password = rawPassword.trim();

    // 2. Validate Role
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role selected. Valid roles are: ${VALID_ROLES.join(', ')}`
      });
    }

    let user = null;
    let identifier = '';
    let displayName = '';
    let email = '';
    let extraDetails = {};

    // 3. Database Query Based on Role
    if (role === 'student') {
      const [rows] = await pool.query(`
        SELECT 
          s.id, s.reg_no, s.name, s.email, s.phone, s.department, s.year_of_study, 
          s.semester, s.section, s.room_no, s.hostel_block, s.parent_id, s.class_advisor_id, 
          s.password_hash, s.is_active, s.profile_completed,
          p.father_name AS parent_name, p.primary_phone AS parent_phone, p.relationship AS parent_relationship
        FROM students s
        LEFT JOIN parents p ON s.parent_id = p.id
        WHERE (s.reg_no = ? OR s.email = ?) AND s.is_active = true
        LIMIT 1
      `, [username, username]);

      if (rows.length > 0) {
        user = rows[0];
        identifier = user.reg_no;
        displayName = user.name;
        email = user.email;
        extraDetails = {
          regNo: user.reg_no,
          department: user.department,
          yearOfStudy: user.year_of_study,
          semester: user.semester || (user.year_of_study ? `Semester ${user.year_of_study * 2}` : 'Semester 6'),
          roomNo: user.room_no,
          hostelBlock: user.hostel_block,
          parentName: user.parent_name,
          parentPhone: user.parent_phone,
          parentRelationship: user.parent_relationship || 'Father',
          profile_completed: Boolean(user.profile_completed),
          profileCompleted: Boolean(user.profile_completed)
        };
      }
    } else if (role === 'parent') {
      const [rows] = await pool.query(`
        SELECT id, father_name, mother_name, primary_phone, secondary_phone, email, address, password_hash
        FROM parents
        WHERE (primary_phone = ? OR email = ?)
        LIMIT 1
      `, [username, username]);

      if (rows.length > 0) {
        user = rows[0];
        identifier = user.primary_phone;
        displayName = user.father_name || user.mother_name || 'Parent';
        email = user.email || '';
        extraDetails = {
          phone: user.primary_phone,
          secondaryPhone: user.secondary_phone,
          address: user.address
        };
      }
    } else {
      // Staff roles: warden, principal, class_advisor, caretaker, watchman
      const [rows] = await pool.query(`
        SELECT id, staff_id, name, email, phone, role, department, hostel_block, password_hash, is_active
        FROM staff
        WHERE (staff_id = ? OR email = ?) AND role = ? AND is_active = true
        LIMIT 1
      `, [username, username, role]);

      if (rows.length > 0) {
        user = rows[0];
        identifier = user.staff_id;
        displayName = user.name;
        email = user.email;
        extraDetails = {
          staffId: user.staff_id,
          department: user.department,
          hostelBlock: user.hostel_block,
          phone: user.phone
        };
      }
    }

    // 4. User Not Found
    if (!user) {
      if (role === 'parent') {
        return res.status(404).json({
          success: false,
          message: 'No parent account found. Please create an account.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid username/identifier, password, or role selected.'
      });
    }

    // 5. Verify Password with bcrypt
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordMatch) {
      if (role === 'parent') {
        return res.status(401).json({
          success: false,
          message: 'Invalid mobile number or password.'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid username/identifier, password, or role selected.'
      });
    }

    // 6. Generate JWT Token
    const tokenPayload = {
      id: user.id,
      role,
      identifier,
      name: displayName,
      email
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });

    // 7. Determine Role-based Redirect Path
    function getDashboardRedirect(userRole) {
      const normalized = String(userRole || '').toLowerCase().trim().replace(/[- ]/g, '_');
      const redirectMap = {
        student: '/student-dashboard.html',
        parent: '/parent-dashboard.html',
        warden: '/warden-dashboard.html',
        principal: '/principal-dashboard.html',
        class_advisor: '/advisor-dashboard.html',
        advisor: '/advisor-dashboard.html',
        caretaker: '/caretaker-dashboard.html',
        watchman: '/watchman-dashboard.html',
        guard: '/watchman-dashboard.html',
        security: '/watchman-dashboard.html'
      };
      return redirectMap[normalized] || '/student-dashboard.html';
    }

    const redirectTo = getDashboardRedirect(role);

    // 8. Safe Response (Never send password_hash)
    return res.status(200).json({
      success: true,
      message: `Welcome, ${displayName}! Login successful.`,
      token,
      user: {
        id: user.id,
        name: displayName,
        role,
        identifier,
        email,
        ...extraDetails
      },
      redirectTo
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Returns current authenticated user profile
 */
exports.getMe = async (req, res, next) => {
  try {
    const { id, role } = req.user;

    let user = null;

    if (role === 'student') {
      const [rows] = await pool.query(`
        SELECT 
          s.id, s.reg_no, s.name, s.email, s.phone, s.department, s.year_of_study, 
          s.semester, s.section, s.room_no, s.hostel_block, s.profile_completed,
          s.current_hostel_status, s.created_at,
          p.id AS parent_id, p.father_name AS parent_name, p.primary_phone AS parent_phone,
          p.relationship AS parent_relationship
        FROM students s
        LEFT JOIN parents p ON s.parent_id = p.id
        WHERE s.id = ? AND s.is_active = true
      `, [id]);
      user = rows[0];
    } else if (role === 'parent') {
      const [rows] = await pool.query(`
        SELECT id, father_name, mother_name, primary_phone, secondary_phone, email, address, created_at
        FROM parents
        WHERE id = ?
      `, [id]);
      user = rows[0];
    } else {
      const [rows] = await pool.query(`
        SELECT id, staff_id, name, email, phone, role, department, hostel_block, created_at
        FROM staff
        WHERE id = ? AND role = ? AND is_active = true
      `, [id, role]);
      user = rows[0];
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.'
      });
    }

    const isProfileCompleted = role === 'student' ? Boolean(user.profile_completed) : true;

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        profile_completed: isProfileCompleted,
        profileCompleted: isProfileCompleted,
        role
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/register-parent
 * Registers a new parent account using mobile number & password
 */
exports.registerParent = async (req, res, next) => {
  try {
    const { mobile, phone, password, confirm_password, parent_name } = req.body;
    const rawMobile = (mobile || phone || '').trim();
    const rawPassword = (password || '').trim();
    const rawConfirm = (confirm_password || '').trim();

    // 1. Validation
    if (!rawMobile) {
      return res.status(400).json({ success: false, message: 'Mobile number is required.' });
    }
    const cleanMobile = rawMobile.replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number.' });
    }

    if (!rawPassword) {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }
    if (rawPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }
    if (rawConfirm && rawPassword !== rawConfirm) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    // 2. Check duplicate mobile
    const [existing] = await pool.query('SELECT id FROM parents WHERE primary_phone = ? LIMIT 1', [cleanMobile]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this mobile number already exists.' });
    }

    // 3. Hash password & insert
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const displayName = (parent_name || 'Parent Guardian').trim();

    const [insertResult] = await pool.query(`
      INSERT INTO parents (father_name, primary_phone, password_hash)
      VALUES (?, ?, ?)
    `, [displayName, cleanMobile, passwordHash]);

    const newParentId = insertResult.insertId;

    // 4. Auto-generate JWT token for immediate auto-login
    const token = jwt.sign(
      {
        id: newParentId,
        role: 'parent',
        identifier: cleanMobile,
        name: displayName
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      success: true,
      message: 'Parent account created successfully.',
      token,
      user: {
        id: newParentId,
        name: displayName,
        role: 'parent',
        identifier: cleanMobile,
        phone: cleanMobile,
        isNewProfile: true
      },
      redirectTo: '/parent-dashboard.html'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/register-student
 * Registers a new student account in the MySQL students table
 * Hashes password with bcrypt, establishes parent linkage,
 * and automatically returns an authenticated JWT token for auto-login
 */
exports.registerStudent = async (req, res, next) => {
  try {
    const {
      username,
      reg_no,
      password,
      confirm_password,
      name,
      email,
      phone,
      department,
      year_of_study,
      semester,
      section,
      room_no,
      hostel_block,
      parent_name,
      parent_phone
    } = req.body || {};

    const rawUsername = (username || reg_no || '').trim();
    const rawPassword = (password || '').trim();
    const rawConfirm = (confirm_password || '').trim();
    const rawName = (name || rawUsername).trim();
    const rawEmail = (email || `${rawUsername.toLowerCase()}@student.edu`).trim();
    const rawPhone = (phone || '').trim();

    // 1. Mandatory Validations
    if (!rawUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username / Roll Number is required.'
      });
    }

    if (rawUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username / Roll Number must be at least 3 characters long.'
      });
    }

    if (!rawPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password is required.'
      });
    }

    if (rawPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    if (rawConfirm && rawPassword !== rawConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.'
      });
    }

    if (!rawName) {
      return res.status(400).json({
        success: false,
        message: 'Student full name is required.'
      });
    }

    // 2. Uniqueness Checks
    const [existingUser] = await pool.query(
      'SELECT id FROM students WHERE reg_no = ? LIMIT 1',
      [rawUsername]
    );
    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: `An account with username / roll number "${rawUsername}" already exists. Please sign in instead.`
      });
    }

    const [existingEmail] = await pool.query(
      'SELECT id FROM students WHERE email = ? LIMIT 1',
      [rawEmail]
    );
    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        message: `An account with email "${rawEmail}" already exists.`
      });
    }

    // 3. Securely hash password with bcrypt
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    // 4. Resolve Parent Relationship
    let resolvedParentId = null;
    const cleanParentPhone = (parent_phone || '').replace(/\D/g, '');
    const cleanParentName = (parent_name || 'Parent Guardian').trim();

    if (cleanParentPhone && cleanParentPhone.length >= 10) {
      const [pRows] = await pool.query(
        'SELECT id FROM parents WHERE primary_phone = ? LIMIT 1',
        [cleanParentPhone]
      );
      if (pRows.length > 0) {
        resolvedParentId = pRows[0].id;
      } else {
        // Create parent record so foreign key constraint is satisfied and linked
        const defaultParentPass = await bcrypt.hash('Password@123', 10);
        const [newParentRes] = await pool.query(`
          INSERT INTO parents (father_name, primary_phone, password_hash)
          VALUES (?, ?, ?)
        `, [cleanParentName, cleanParentPhone, defaultParentPass]);
        resolvedParentId = newParentRes.insertId;
      }
    }

    if (!resolvedParentId) {
      // Fall back to first parent in DB or default demo parent
      const [fallbackParents] = await pool.query('SELECT id FROM parents ORDER BY id ASC LIMIT 1');
      if (fallbackParents.length > 0) {
        resolvedParentId = fallbackParents[0].id;
      } else {
        const defaultParentPass = await bcrypt.hash('Password@123', 10);
        const [createdParent] = await pool.query(`
          INSERT INTO parents (father_name, primary_phone, password_hash)
          VALUES ('Default Guardian', '9876543210', ?)
        `, [defaultParentPass]);
        resolvedParentId = createdParent.insertId;
      }
    }

    // 5. Resolve Class Advisor (optional lookup by department)
    const studentDept = (department || 'Computer Science & Engineering').trim();
    let advisorId = null;
    const [advRows] = await pool.query(
      'SELECT id FROM staff WHERE role = "class_advisor" AND (department = ? OR department LIKE ?) LIMIT 1',
      [studentDept, `%${studentDept.split(' ')[0]}%`]
    );
    if (advRows.length > 0) {
      advisorId = advRows[0].id;
    }

    // 6. Sensible defaults for optional student profile fields
    const parsedYear = year_of_study ? parseInt(year_of_study, 10) : 1;
    const validYear = (parsedYear >= 1 && parsedYear <= 5) ? parsedYear : 1;
    const studentSem = semester || `Semester ${validYear * 2}`;
    const studentSec = (section || 'A').trim();
    const studentRoom = (room_no || '101').trim();
    const studentBlock = (hostel_block || 'Block A').trim();
    const studentPhone = rawPhone && rawPhone.length >= 8 ? rawPhone : '9876500000';

    // 7. Insert Student Record into MySQL (profile_completed initialized to 0 for first-time profile setup)
    const [insertResult] = await pool.query(`
      INSERT INTO students (
        reg_no,
        name,
        email,
        phone,
        department,
        year_of_study,
        semester,
        section,
        room_no,
        hostel_block,
        parent_id,
        class_advisor_id,
        password_hash,
        is_active,
        profile_completed,
        current_hostel_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, 0, 'INSIDE');
    `, [
      rawUsername,
      rawName,
      rawEmail,
      studentPhone,
      studentDept,
      validYear,
      studentSem,
      studentSec,
      studentRoom,
      studentBlock,
      resolvedParentId,
      advisorId,
      passwordHash
    ]);

    const newStudentId = insertResult.insertId;

    // 8. Generate JWT Token for Immediate Automatic Login
    const token = jwt.sign(
      {
        id: newStudentId,
        role: 'student',
        identifier: rawUsername,
        name: rawName,
        email: rawEmail
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // 9. Return safe response (NEVER return password or password_hash)
    return res.status(201).json({
      success: true,
      message: `Welcome, ${rawName}! Your student account has been created successfully.`,
      token,
      user: {
        id: newStudentId,
        name: rawName,
        reg_no: rawUsername,
        identifier: rawUsername,
        role: 'student',
        email: rawEmail,
        phone: studentPhone,
        department: studentDept,
        yearOfStudy: validYear,
        year_of_study: validYear,
        roomNo: studentRoom,
        room_no: studentRoom,
        hostelBlock: studentBlock,
        hostel_block: studentBlock,
        current_hostel_status: 'INSIDE',
        profile_completed: false,
        profileCompleted: false,
        isNewProfile: true
      },
      redirectTo: '/student-dashboard.html'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Client-side token invalidation / acknowledgment
 */
exports.logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
};
