/**
 * Student Controller
 * Handles Student Profile retrieval, first-time setup, and profile updates.
 * Strictly scopes updates to the authenticated student (req.user.id).
 * Preserves parent relational integrity without exposing sensitive credentials.
 */

const bcrypt = require('bcrypt');
const { pool } = require('../utils/db');

/**
 * GET /api/student/profile
 * Retrieves current student's profile along with linked parent contact details
 */
exports.getStudentProfile = async (req, res, next) => {
  try {
    const studentId = req.user?.id;

    if (!studentId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

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
      LIMIT 1
    `, [studentId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student record not found.'
      });
    }

    const row = rows[0];
    const isCompleted = Boolean(row.profile_completed);

    return res.status(200).json({
      success: true,
      profile_completed: isCompleted,
      student: {
        id: row.id,
        name: row.name,
        reg_no: row.reg_no,
        email: row.email,
        phone: row.phone || '',
        department: row.department,
        year_of_study: row.year_of_study,
        semester: row.semester || (row.year_of_study ? `Semester ${row.year_of_study * 2}` : 'Semester 6'),
        section: row.section || 'A',
        room_no: row.room_no,
        hostel_block: row.hostel_block,
        current_hostel_status: row.current_hostel_status || 'INSIDE',
        profile_completed: isCompleted
      },
      parent: {
        id: row.parent_id || null,
        name: row.parent_name || '',
        mobile: row.parent_phone || '',
        phone: row.parent_phone || '',
        relationship: row.parent_relationship || 'Father'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/student/profile (and POST /api/student/profile)
 * Updates student academic/hostel info and parental contact details.
 * Strictly scopes by req.user.id. Never trusts client-supplied student_id.
 * Protects reg_no, role, id, and password_hash from alteration.
 */
exports.updateStudentProfile = async (req, res, next) => {
  try {
    const studentId = req.user?.id;

    if (!studentId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // 1. Fetch current student record along with linked parent contact details
    const [currStudents] = await pool.query(`
      SELECT 
        s.id, s.reg_no, s.name, s.parent_id, s.department, s.phone, s.year_of_study,
        s.semester, s.hostel_block, s.room_no, s.profile_completed, s.is_active,
        p.father_name AS parent_name, p.primary_phone AS parent_phone, p.relationship AS parent_relationship
      FROM students s
      LEFT JOIN parents p ON s.parent_id = p.id
      WHERE s.id = ? AND s.is_active = true 
      LIMIT 1
    `, [studentId]);

    if (currStudents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student record not found.'
      });
    }

    const currentStudent = currStudents[0];
    const isAlreadyCompleted = Boolean(currentStudent.profile_completed);

    // 2. Extract & sanitize input fields
    const {
      name,
      department,
      year_of_study,
      year,
      semester,
      hostel_block,
      block,
      room_no,
      room,
      phone,
      student_phone,
      parent_name,
      parent_phone,
      parent_mobile,
      relationship,
      parent_relationship
    } = req.body || {};

    const rawStudentPhone = (phone !== undefined ? phone : (student_phone !== undefined ? student_phone : ''));
    const cleanStudentPhone = String(rawStudentPhone || '').replace(/\D/g, '');

    const rawParentPhone = (parent_phone !== undefined ? parent_phone : (parent_mobile !== undefined ? parent_mobile : ''));
    const cleanParentPhone = String(rawParentPhone || '').replace(/\D/g, '');

    const cleanParentName = String(parent_name !== undefined ? parent_name : '').trim();
    const cleanRelationship = String(relationship || parent_relationship || 'Father').trim();

    // 3. IDENTITY FIELD LOCK RESTRICTION (Backend Enforcement)
    // The 5 Identity Fields: Student Name, Parent Name, Student Mobile, Parent Mobile, Department
    if (isAlreadyCompleted) {
      const currentStoredName = String(currentStudent.name || '').trim();
      const currentStoredDept = String(currentStudent.department || '').trim();
      const currentStoredPhone = String(currentStudent.phone || '').replace(/\D/g, '');
      const currentStoredParentName = String(currentStudent.parent_name || '').trim();
      const currentStoredParentPhone = String(currentStudent.parent_phone || '').replace(/\D/g, '');

      const isNameAttempted = name !== undefined && name !== null && String(name).trim() !== '' && String(name).trim() !== currentStoredName;
      const isDeptAttempted = department !== undefined && department !== null && String(department).trim() !== '' && String(department).trim() !== currentStoredDept;
      const isPhoneAttempted = (phone !== undefined || student_phone !== undefined) && cleanStudentPhone !== '' && cleanStudentPhone !== currentStoredPhone;
      const isParentNameAttempted = parent_name !== undefined && parent_name !== null && cleanParentName !== '' && cleanParentName !== currentStoredParentName;
      const isParentPhoneAttempted = (parent_phone !== undefined || parent_mobile !== undefined) && cleanParentPhone !== '' && cleanParentPhone !== currentStoredParentPhone;

      if (isNameAttempted || isDeptAttempted || isPhoneAttempted || isParentNameAttempted || isParentPhoneAttempted) {
        return res.status(400).json({
          success: false,
          message: 'Identity fields can only be set during initial profile setup.'
        });
      }
    } else {
      // FIRST-TIME PROFILE SETUP: Enforce that all 5 identity fields are provided and valid
      const cleanName = String(name || '').trim();
      const cleanDept = String(department || '').trim();

      if (!cleanName) {
        return res.status(400).json({
          success: false,
          message: 'Student name is required.'
        });
      }

      if (!cleanDept) {
        return res.status(400).json({
          success: false,
          message: 'Department is required.'
        });
      }

      if (!cleanStudentPhone || cleanStudentPhone.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 10-digit student mobile number.'
        });
      }

      if (!cleanParentName) {
        return res.status(400).json({
          success: false,
          message: 'Parent / Guardian name is required.'
        });
      }

      if (!cleanParentPhone || cleanParentPhone.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 10-digit parent mobile number.'
        });
      }
    }

    // Validate academic/hostel editable fields
    const rawYear = year_of_study !== undefined ? year_of_study : (year !== undefined ? year : currentStudent.year_of_study);
    const cleanYear = rawYear ? parseInt(rawYear, 10) : NaN;
    const cleanSem = String(semester !== undefined ? semester : (currentStudent.semester || '')).trim();
    const cleanBlock = String(hostel_block !== undefined ? hostel_block : (block !== undefined ? block : (currentStudent.hostel_block || ''))).trim();
    const cleanRoom = String(room_no !== undefined ? room_no : (room !== undefined ? room : (currentStudent.room_no || ''))).trim();

    if (isNaN(cleanYear) || cleanYear < 1 || cleanYear > 5) {
      return res.status(400).json({
        success: false,
        message: 'Year of study must be a valid number between 1 and 5.'
      });
    }

    if (!cleanSem) {
      return res.status(400).json({
        success: false,
        message: 'Semester is required.'
      });
    }

    if (!cleanBlock) {
      return res.status(400).json({
        success: false,
        message: 'Hostel block is required.'
      });
    }

    if (!cleanRoom) {
      return res.status(400).json({
        success: false,
        message: 'Room number is required.'
      });
    }

    if (!cleanRelationship) {
      return res.status(400).json({
        success: false,
        message: 'Relationship with student is required.'
      });
    }

    // 4. Relational Parent Handling & Database Persistence
    let targetParentId = currentStudent.parent_id;

    if (isAlreadyCompleted) {
      // Identity fields are locked: retain original values
      if (targetParentId && cleanRelationship) {
        await pool.query(`
          UPDATE parents 
          SET relationship = COALESCE(NULLIF(?, ''), relationship)
          WHERE id = ?
        `, [cleanRelationship, targetParentId]);
      }

      // Update ONLY academic & room assignment fields
      await pool.query(`
        UPDATE students 
        SET 
          year_of_study = ?,
          semester = ?,
          hostel_block = ?,
          room_no = ?,
          updated_at = NOW()
        WHERE id = ?
      `, [
        cleanYear,
        cleanSem,
        cleanBlock,
        cleanRoom,
        studentId
      ]);

    } else {
      // First-time setup: establish parent relational record
      const cleanName = String(name || '').trim();
      const cleanDept = String(department || '').trim();

      // Check if a parent record already exists with this primary_phone
      const [existingParents] = await pool.query(`
        SELECT id, father_name, relationship 
        FROM parents 
        WHERE primary_phone = ? 
        LIMIT 1
      `, [cleanParentPhone]);

      if (existingParents.length > 0) {
        targetParentId = existingParents[0].id;
        if (currentStudent.parent_id === targetParentId) {
          await pool.query(`
            UPDATE parents 
            SET father_name = ?, relationship = ?
            WHERE id = ?
          `, [cleanParentName, cleanRelationship, targetParentId]);
        } else {
          await pool.query(`
            UPDATE parents 
            SET relationship = COALESCE(NULLIF(?, ''), relationship)
            WHERE id = ?
          `, [cleanRelationship, targetParentId]);
        }
      } else {
        let canReuseCurrentParent = false;
        if (currentStudent.parent_id) {
          const [linkCountRows] = await pool.query(`
            SELECT COUNT(*) as count 
            FROM students 
            WHERE parent_id = ?
          `, [currentStudent.parent_id]);

          if (linkCountRows[0].count === 1) {
            canReuseCurrentParent = true;
          }
        }

        if (canReuseCurrentParent) {
          targetParentId = currentStudent.parent_id;
          await pool.query(`
            UPDATE parents 
            SET father_name = ?, primary_phone = ?, relationship = ?
            WHERE id = ?
          `, [cleanParentName, cleanParentPhone, cleanRelationship, targetParentId]);
        } else {
          const defaultParentPass = await bcrypt.hash('Password@123', 10);
          const [newParentRes] = await pool.query(`
            INSERT INTO parents (father_name, primary_phone, relationship, password_hash)
            VALUES (?, ?, ?, ?)
          `, [cleanParentName, cleanParentPhone, cleanRelationship, defaultParentPass]);
          targetParentId = newParentRes.insertId;
        }
      }

      // Update Student Record in MySQL with complete initial identity & academic profile
      await pool.query(`
        UPDATE students 
        SET 
          name = ?,
          department = ?,
          year_of_study = ?,
          semester = ?,
          hostel_block = ?,
          room_no = ?,
          phone = COALESCE(NULLIF(?, ''), phone),
          parent_id = ?,
          profile_completed = 1,
          updated_at = NOW()
        WHERE id = ?
      `, [
        cleanName,
        cleanDept,
        cleanYear,
        cleanSem,
        cleanBlock,
        cleanRoom,
        cleanStudentPhone || null,
        targetParentId,
        studentId
      ]);
    }

    // 5. Fetch updated student & parent record for response
    const [updatedRows] = await pool.query(`
      SELECT 
        s.id, s.reg_no, s.name, s.email, s.phone, s.department, s.year_of_study, 
        s.semester, s.section, s.room_no, s.hostel_block, s.profile_completed,
        s.current_hostel_status, s.updated_at,
        p.id AS parent_id, p.father_name AS parent_name, p.primary_phone AS parent_phone,
        p.relationship AS parent_relationship
      FROM students s
      LEFT JOIN parents p ON s.parent_id = p.id
      WHERE s.id = ?
      LIMIT 1
    `, [studentId]);

    const updated = updatedRows[0];

    return res.status(200).json({
      success: true,
      message: 'Student profile updated successfully.',
      profile_completed: true,
      student: {
        id: updated.id,
        name: updated.name,
        reg_no: updated.reg_no,
        email: updated.email,
        phone: updated.phone,
        department: updated.department,
        year_of_study: updated.year_of_study,
        semester: updated.semester,
        section: updated.section,
        room_no: updated.room_no,
        hostel_block: updated.hostel_block,
        current_hostel_status: updated.current_hostel_status,
        profile_completed: true
      },
      parent: {
        id: updated.parent_id,
        name: updated.parent_name,
        mobile: updated.parent_phone,
        phone: updated.parent_phone,
        relationship: updated.parent_relationship || 'Father'
      }
    });

  } catch (error) {
    next(error);
  }
};
