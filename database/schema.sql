-- ==========================================================
-- SMART HOSTEL OUTPASS MANAGEMENT SYSTEM
-- Database Schema: smart_hostel_outpass
-- ==========================================================

CREATE DATABASE IF NOT EXISTS smart_hostel_outpass;
USE smart_hostel_outpass;

-- ----------------------------------------------------------
-- 1. PARENTS TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS parents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    father_name VARCHAR(100) NOT NULL,
    mother_name VARCHAR(100),
    primary_phone VARCHAR(20) NOT NULL UNIQUE,
    secondary_phone VARCHAR(20),
    email VARCHAR(120) UNIQUE,
    address TEXT,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 2. STAFF TABLE
-- Roles: warden, principal, class_advisor, caretaker, watchman
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    role ENUM('warden', 'principal', 'class_advisor', 'caretaker', 'watchman') NOT NULL,
    department VARCHAR(100),
    hostel_block VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 3. STUDENTS TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reg_no VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    department VARCHAR(100) NOT NULL,
    year_of_study INT NOT NULL,
    section VARCHAR(10),
    room_no VARCHAR(20) NOT NULL,
    hostel_block VARCHAR(50) NOT NULL,
    parent_id INT NOT NULL,
    class_advisor_id INT NULL,
    password_hash VARCHAR(255) NOT NULL,
    fingerprint_template_id VARCHAR(100) UNIQUE NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_parent FOREIGN KEY (parent_id) 
        REFERENCES parents(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_advisor FOREIGN KEY (class_advisor_id) 
        REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 4. OUTPASS REQUESTS TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS outpass_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_code VARCHAR(50) NOT NULL UNIQUE,
    student_id INT NOT NULL,
    outpass_type VARCHAR(50) NOT NULL DEFAULT 'normal', -- 'normal', 'one_day_duty', 'emergency', 'vacation'
    reason TEXT NOT NULL,
    destination VARCHAR(255) NOT NULL,
    semester VARCHAR(20) NULL,
    student_phone VARCHAR(20) NULL,
    event_name VARCHAR(200) NULL,
    event_location VARCHAR(255) NULL,
    duty_date DATE NULL,
    duty_description TEXT NULL,
    from_datetime DATETIME NOT NULL,
    to_datetime DATETIME NOT NULL,
    parent_approval_status ENUM('pending', 'approved', 'rejected', 'not_required') DEFAULT 'pending',
    parent_approved_by_id INT NULL,
    parent_approved_at DATETIME NULL,
    parent_rejected_by_id INT NULL,
    parent_rejected_at DATETIME NULL,
    parent_rejection_reason TEXT NULL,
    parent_biometric_verified TINYINT(1) DEFAULT 0,
    advisor_approval_status ENUM('pending', 'approved', 'rejected', 'not_required') DEFAULT 'pending',
    warden_approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    principal_approval_status ENUM('pending', 'approved', 'rejected', 'not_required') DEFAULT 'not_required',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_PARENT', -- 'PENDING_PARENT', 'PENDING_WARDEN', 'PENDING_ADVISOR', 'APPROVED', 'REJECTED', 'EXPIRED', 'COMPLETED'
    overall_status ENUM('pending', 'approved', 'rejected', 'cancelled', 'active', 'completed', 'expired') DEFAULT 'pending',
    rejection_reason TEXT NULL,
    approved_by_warden_id INT NULL,
    approved_at DATETIME NULL,
    rejected_by_warden_id INT NULL,
    rejected_at DATETIME NULL,
    advisor_approved_by_id INT NULL,
    advisor_approved_at DATETIME NULL,
    advisor_rejected_by_id INT NULL,
    advisor_rejected_at DATETIME NULL,
    advisor_rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_outpass_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_outpass_parent_appr FOREIGN KEY (parent_approved_by_id) 
        REFERENCES parents(id) ON DELETE SET NULL,
    CONSTRAINT fk_outpass_parent_rej FOREIGN KEY (parent_rejected_by_id) 
        REFERENCES parents(id) ON DELETE SET NULL,
    CONSTRAINT fk_outpass_warden FOREIGN KEY (approved_by_warden_id) 
        REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT fk_outpass_rejected_warden FOREIGN KEY (rejected_by_warden_id) 
        REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT fk_outpass_advisor_staff FOREIGN KEY (advisor_approved_by_id) 
        REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT fk_outpass_advisor_rej_staff FOREIGN KEY (advisor_rejected_by_id) 
        REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 5. ONE DAY DUTY REQUESTS (OD) TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS one_day_duty_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_code VARCHAR(50) NOT NULL UNIQUE,
    student_id INT NOT NULL,
    event_name VARCHAR(200) NOT NULL,
    organization_venue VARCHAR(255) NOT NULL,
    duty_date DATE NOT NULL,
    departure_time TIME NOT NULL,
    expected_return_time TIME NOT NULL,
    proof_document_url VARCHAR(500) NULL,
    advisor_approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    warden_approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    overall_status ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_duty_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 6. PARENT MESSAGES & CONSENT LOGS TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NOT NULL,
    student_id INT NOT NULL,
    outpass_request_id INT NULL,
    message_type ENUM('sms', 'whatsapp', 'system_notice', 'consent_request') NOT NULL,
    message_body TEXT NOT NULL,
    status ENUM('sent', 'delivered', 'read', 'failed', 'responded') DEFAULT 'sent',
    parent_response ENUM('approved', 'rejected', 'acknowledged', 'none') DEFAULT 'none',
    responded_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_msg_parent FOREIGN KEY (parent_id) 
        REFERENCES parents(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_outpass FOREIGN KEY (outpass_request_id) 
        REFERENCES outpass_requests(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 7. QR CODES TABLE
-- QR Codes Table (Pass token storage for security scanning)
CREATE TABLE IF NOT EXISTS qr_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    outpass_request_id INT NOT NULL UNIQUE,
    token VARCHAR(255) NOT NULL UNIQUE,
    qr_data TEXT NOT NULL,
    qr_image_data LONGTEXT NULL,
    valid_from DATETIME NOT NULL,
    valid_until DATETIME NOT NULL,
    status ENUM('ACTIVE', 'REVOKED', 'EXPIRED', 'USED') DEFAULT 'ACTIVE',
    generated_by_warden_id INT NULL,
    scanned_exit_at DATETIME NULL,
    scanned_return_at DATETIME NULL,
    revoked_by_warden_id INT NULL,
    revoked_at DATETIME NULL,
    revocation_reason TEXT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_count INT DEFAULT 0,
    max_uses INT DEFAULT 2, -- 1 for exit, 1 for return
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_qr_outpass FOREIGN KEY (outpass_request_id) 
        REFERENCES outpass_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_qr_warden_gen FOREIGN KEY (generated_by_warden_id) 
        REFERENCES staff(id) ON DELETE SET NULL,
    CONSTRAINT fk_qr_warden_rev FOREIGN KEY (revoked_by_warden_id) 
        REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 8. EXIT LOGS TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS exit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    outpass_request_id INT NOT NULL,
    student_id INT NOT NULL,
    guard_staff_id INT NULL,
    verification_method ENUM('qr_scan', 'fingerprint', 'manual_override') NOT NULL DEFAULT 'qr_scan',
    exit_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_exit_outpass FOREIGN KEY (outpass_request_id) 
        REFERENCES outpass_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_exit_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_exit_guard FOREIGN KEY (guard_staff_id) 
        REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 9. RETURN LOGS TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS return_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    outpass_request_id INT NOT NULL,
    student_id INT NOT NULL,
    guard_staff_id INT NULL,
    verification_method ENUM('qr_scan', 'fingerprint', 'manual_override') NOT NULL DEFAULT 'qr_scan',
    return_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_late BOOLEAN DEFAULT FALSE,
    late_duration_minutes INT DEFAULT 0,
    remarks TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_return_outpass FOREIGN KEY (outpass_request_id) 
        REFERENCES outpass_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_return_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_return_guard FOREIGN KEY (guard_staff_id) 
        REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 10. EXTENSION REQUESTS TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS extension_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    outpass_request_id INT NOT NULL,
    student_id INT NOT NULL,
    extended_to_datetime DATETIME NOT NULL,
    reason TEXT NOT NULL,
    parent_consent BOOLEAN DEFAULT FALSE,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    reviewed_by_staff_id INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ext_outpass FOREIGN KEY (outpass_request_id) 
        REFERENCES outpass_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_ext_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_ext_reviewer FOREIGN KEY (reviewed_by_staff_id) 
        REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 11. NOTIFICATIONS TABLE
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_type ENUM('student', 'parent', 'staff') NOT NULL,
    student_id INT NULL,
    parent_id INT NULL,
    staff_id INT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'approval', 'alert', 'emergency', 'reminder') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    link_url VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_student FOREIGN KEY (student_id) 
        REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_parent FOREIGN KEY (parent_id) 
        REFERENCES parents(id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_staff FOREIGN KEY (staff_id) 
        REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- INDEXES FOR PERFORMANCE
-- ----------------------------------------------------------
-- Note: UNIQUE columns (reg_no, staff_id, token) already have indexes created automatically.

