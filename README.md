# Smart Hostel Outpass Management System

A multi-tier, relational **Smart Hostel Outpass & Gate Management System** built with Node.js, Express, MySQL, Socket.IO, and Vanilla JavaScript.

---

## 📌 Project Overview

The **Smart Hostel Outpass Management System** streamlines, automates, and audits the complete lifecycle of hostel outpasses and gate security. It connects seven distinct stakeholders:

1. **Student** – Submits regular, emergency, vacation, or one-day duty (OD) requests and tracks approval statuses.
2. **Parent** – Receives automated notices and grants/denies digital consent.
3. **Class Advisor** – Reviews academic and department-level clearance.
4. **Warden** – Authorized approving authority for hostel exit permits and extension reviews.
5. **Principal** – High-level oversight and administrative escalation approval.
6. **Caretaker** – Hostel floor and room status monitoring.
7. **Watchman / Gate Guard** – Verifies gate passes via dynamic QR verification and logs exact exit/return timestamps.

---

## 🛠️ Technology Stack

* **Frontend**: HTML5, CSS3 (Modern Glassmorphic Design System with Dark/Light mode), Vanilla JavaScript
* **Backend**: Node.js & Express.js (`^5.2.1`)
* **Database**: MySQL 8.x (Relational Schema with `mysql2/promise` connection pool)
* **Real-Time Engine**: Socket.IO (`^4.8.3`)
* **Security & Tokens**: `bcrypt`, `jsonwebtoken`, `qrcode`

---

## 📁 Project Directory Structure

```text
Out-Pass Management/
├── .env                                # Environment configurations (Host, DB, Port)
├── .gitignore                          # Excludes node_modules, .env, and logs
├── package.json                        # Node dependencies & npm scripts
├── server.js                           # Express application & Socket.IO server
├── README.md                           # Project documentation
│
├── database/
│   ├── schema.sql                      # Complete MySQL DDL with 11 relational tables
│   └── setup.js                        # Automated database & table initialization script
│
├── utils/
│   └── db.js                           # Reusable MySQL connection pool using mysql2
│
├── routes/
│   ├── api.js                          # Health check, DB test, and role metadata routes
│   └── auth.js                         # Authentication routing
│
├── controllers/
│   └── authController.js               # Authentication request controllers
│
├── middleware/
│   └── errorHandler.js                 # Centralized error and 404 handlers
│
└── public/
    ├── index.html                      # Multi-role login UI & diagnostic dashboard
    ├── css/
    │   └── style.css                   # Custom CSS variables, responsive design, animations
    └── js/
        └── app.js                      # Role switcher, real-time status checker & Socket.IO client
```

---

## 🗄️ Database Relational Schema (`smart_hostel_outpass`)

The MySQL database schema in `database/schema.sql` defines 11 relational tables with strict foreign keys, constraints, and timestamps:

| # | Table Name | Purpose / Function | Key Constraints |
| :--- | :--- | :--- | :--- |
| 1 | `parents` | Parent/guardian records & contact details | Primary Phone (UNIQUE), Email |
| 2 | `staff` | Staff members across roles (`warden`, `principal`, `class_advisor`, `caretaker`, `watchman`) | `staff_id` (UNIQUE), `email` (UNIQUE), `role` ENUM |
| 3 | `students` | Student details, room, hostel block, department | `reg_no` (UNIQUE), FK to `parents`, FK to `staff` |
| 4 | `outpass_requests` | Outpass requests with multi-tier approval states | `request_code` (UNIQUE), FK to `students`, status ENUMs |
| 5 | `one_day_duty_requests` | On-Duty (OD) passes for college symposiums/events | `request_code` (UNIQUE), FK to `students` |
| 6 | `parent_messages` | Parent consent tracking and dispatch logs | FK to `parents`, FK to `students`, FK to `outpass_requests` |
| 7 | `qr_codes` | Cryptographic gate pass tokens with validity windows | `token` (UNIQUE), FK to `outpass_requests`, `max_uses` |
| 8 | `exit_logs` | Real-time exit records logged by security at the gate | FK to `outpass_requests`, FK to `students`, FK to `staff` |
| 9 | `return_logs` | Return records with automated late duration calculation | FK to `outpass_requests`, `is_late` flag, FK to `staff` |
| 10 | `extension_requests` | Outpass return extension requests & warden review | FK to `outpass_requests`, FK to `students` |
| 11 | `notifications` | Real-time system notifications for all roles | FKs to `students`, `parents`, `staff` |

---

## ⚙️ Configuration (`.env`)

Configure your MySQL and server parameters in `.env`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=smart_hostel_outpass
DB_PORT=3306
PORT=5001
```

> **Security Note:** `.env` is listed in `.gitignore` and is never committed to source control.

---

## 🚀 How to Run the Project

### 1. Install Dependencies
```bash
npm install
```

### 2. Initialize the MySQL Database
Ensure your MySQL server is running (e.g. MySQL Service, MySQL Workbench, or XAMPP), then run:
```bash
npm run db:init
```
*(This automatically creates the `smart_hostel_outpass` database and all 11 relational tables).*

### 3. Start the Server
* **Production / Normal mode:**
  ```bash
  npm start
  ```
* **Development mode (with auto-reload):**
  ```bash
  npm run dev
  ```

The application will be accessible at:
👉 **`http://localhost:5001`**

---

## 📡 API Endpoints

### 1. System Health
* **URL:** `GET /api/health`
* **Response:**
  ```json
  {
    "success": true,
    "message": "Smart Hostel Outpass API is running",
    "timestamp": "2026-08-26T17:51:53.488Z",
    "environment": "development"
  }
  ```

### 2. Database Connection Test
* **URL:** `GET /api/db-test`
* **Response (Connected):**
  ```json
  {
    "success": true,
    "message": "MySQL Database connection successful",
    "database": "smart_hostel_outpass",
    "host": "localhost",
    "port": 3306
  }
  ```

### 3. Roles Information
* **URL:** `GET /api/roles`
* **Response:** Returns metadata and input requirements for all 7 portal roles.

### 4. User Authentication (Login)
* **URL:** `POST /api/auth/login`
* **Body:**
  ```json
  {
    "role": "student",
    "username": "21CS042",
    "password": "Password@123"
  }
  ```
* **Response (Success):** Returns JWT token, sanitized user profile, and `redirectTo` route.

### 5. Get Authenticated Profile
* **URL:** `GET /api/auth/me`
* **Header:** `Authorization: Bearer <token>`
* **Response:** Returns verified user profile based on role.

### 6. User Logout
* **URL:** `POST /api/auth/logout`
* **Header:** `Authorization: Bearer <token>`

---

## 📝 Outpass Request & Workflow APIs

### 1. Submit Outpass Request
* **URL:** `POST /api/outpass`
* **Access:** Authenticated Students only (`Authorization: Bearer <token>`)
* **Body (Normal Outpass):**
  ```json
  {
    "request_type": "normal",
    "destination": "Gandhipuram, Coimbatore",
    "reason": "Weekend Home Visit",
    "leaving_date": "2026-08-30",
    "leaving_time": "16:00",
    "expected_return_date": "2026-08-31",
    "expected_return_time": "20:00",
    "student_phone": "9876543210"
  }
  ```
* **Body (One-Day Duty):**
  ```json
  {
    "request_type": "one_day_duty",
    "destination": "Anna University, Chennai",
    "reason": "Paper Presentation & Project Expo",
    "event_name": "TechExpo 2026",
    "event_location": "ECE Dept, CEG Campus",
    "duty_date": "2026-09-05",
    "duty_description": "Representing college in national symposium",
    "leaving_date": "2026-09-05",
    "leaving_time": "07:30",
    "expected_return_date": "2026-09-05",
    "expected_return_time": "21:00",
    "student_phone": "9876543210"
  }
  ```
* **Exact Canonical Workflow Routing (4 Types):**
  1. **Normal Outpass:**
     `Student → Parent Face Verification → Parent Approval + Message → Warden → QR`
     * Initial status: `PENDING_PARENT`
     * Parent completes 128D face biometric verification ($D \le 0.45$) and submits a mandatory consent message.
     * Transitions to `PENDING_WARDEN`.
     * Warden reviews and approves (`APPROVED`).
     * Warden generates cryptographic dynamic QR gate pass.
  2. **One-Day Duty / OD:**
     `Student → Parent Face Verification → Parent Approval + Message → Class Advisor → Principal → QR`
     * Initial status: `PENDING_PARENT`
     * Parent completes 128D face biometric verification and submits a mandatory consent message.
     * Transitions to `PENDING_ADVISOR` (Class Advisor of student's department; strictly bypasses Warden).
     * Class Advisor conducts academic verification and approves.
     * Transitions to `PENDING_PRINCIPAL`.
     * Principal grants final institutional approval (`APPROVED`).
     * Principal generates cryptographic dynamic QR gate pass. *(Warden is strictly excluded from One-Day Duty)*.
  3. **Emergency Outpass:**
     `Student → Warden → QR`
     * Initial status: `PENDING_WARDEN` (Parent, Advisor, and Principal bypassed).
     * Immediate priority processing; exempt from advance submission locks.
     * Warden conducts direct review and approves (`APPROVED`).
     * Warden generates cryptographic dynamic QR gate pass.
  4. **Special Outpass:**
     `Student → Parent Face Verification → Parent Approval + Message → Class Advisor → Principal → Warden → QR`
     * Initial status: `PENDING_PARENT`
     * Parent completes 128D face biometric verification and submits a mandatory consent message.
     * Transitions to `PENDING_ADVISOR` for academic clearance.
     * Transitions to `PENDING_PRINCIPAL` for administrative review.
     * Transitions to `PENDING_WARDEN` for hostel exit authorization.
     * Warden grants final approval (`APPROVED`).
     * Warden generates cryptographic dynamic QR gate pass.

### 2. My Outpass Requests
* **URL:** `GET /api/outpass/my-requests`
* **Access:** Authenticated Students only
* **Response:** Returns all submitted outpass applications with real-time status badges (`PENDING_PARENT`, `PENDING_ADVISOR`, `PENDING_PRINCIPAL`, `PENDING_WARDEN`, `APPROVED`, `REJECTED`, `COMPLETED`).

### 3. Student Dashboard Metrics & Hostel Status
* **URL:** `GET /api/outpass/status-summary`
* **Access:** Authenticated Students only
* **Response:**
  ```json
  {
    "success": true,
    "stats": {
      "total": 4,
      "pending": 2,
      "approved": 1,
      "rejected": 0,
      "completed": 1
    },
    "hostelStatus": "Inside Hostel",
    "activeOutpass": null
  }
  ```

### 4. Warden Dashboard Overview & Pending Queues
* **URL:** `GET /api/outpass/warden/overview`
* **Access:** Authenticated Warden staff only (`Authorization: Bearer <token>`)
* **Response:** Returns metrics for pending normal outpasses, pending emergency requests, pending special requests, approved total, rejected total, active outpasses, and students currently outside.

* **URL:** `GET /api/outpass/warden/pending`
* **Access:** Authenticated Warden staff only
* **Response:** Returns list of pending Normal, Emergency, and Special Outpass requests awaiting Warden review (`status = 'PENDING_WARDEN'`). *(One-Day Duty is handled exclusively by Class Advisor and Principal; never routed to Warden)*.

### 5. Warden Outpass Approval & Rejection
* **Approve Outpass:** `PATCH /api/outpass/:id/approve`
  * **Access:** Authenticated Warden staff only
  * **Role Restriction:** Warden can approve Normal, Emergency, and Special passes, but is strictly blocked from One-Day Duty passes (HTTP 403 Forbidden).
  * **Behavior:** Verifies pending status, sets status to `APPROVED`, records `approved_by_warden_id` and timestamp `approved_at`.
* **Reject Outpass:** `PATCH /api/outpass/:id/reject`
  * **Access:** Authenticated Warden staff only
  * **Body:** `{ "rejection_reason": "Explanation required" }`
  * **Behavior:** Verifies pending status, requires non-empty reason, sets status to `REJECTED`, records `rejected_by_warden_id` and timestamp `rejected_at`.

### 6. Class Advisor Dashboard & Academic Clearance Workflow
* **URL:** `GET /api/outpass/advisor/overview`
  * **Access:** Authenticated Class Advisors only (`Authorization: Bearer <token>`)
  * **Response:** Returns metrics for department-specific pending OD requests, pending special passes, approved today, rejected today, and lifetime total.
* **URL:** `GET /api/outpass/advisor/pending`
  * **Access:** Authenticated Class Advisors only
  * **Behavior:** Returns requests where `status = 'PENDING_ADVISOR'` (`outpass_type` in `one_day_duty`, `special`) for students in the advisor's assigned department whose parents have completed face verification.
* **Approve OD / Special Pass:** `PATCH /api/outpass/:id/advisor-approve`
  * **Access:** Authenticated Class Advisors only
  * **Security:** Enforces department-level authorization and verified parent face verification check. Advisor cannot approve requests from unrelated departments.
  * **Workflow:** Sets `advisor_approval_status = 'approved'`, records `advisor_approved_by_id` and timestamp, and transitions status from `PENDING_ADVISOR` to `PENDING_PRINCIPAL` (forwarding directly to Principal).
* **Reject OD / Special Pass:** `PATCH /api/outpass/:id/advisor-reject`
  * **Access:** Authenticated Class Advisors only
  * **Body:** `{ "rejection_reason": "Academic reason required" }`
  * **Workflow:** Sets `status = 'REJECTED'`, records `advisor_rejection_reason`.

### 7. Principal Clearance Workflow
* **URL:** `GET /api/principal/overview`
  * **Access:** Authenticated Principal only
  * **Response:** Returns institutional metrics for pending OD clearances, pending special clearances, approved today, rejected today, and gate census.
* **URL:** `GET /api/principal/pending`
  * **Access:** Authenticated Principal only
  * **Behavior:** Returns requests awaiting executive clearance (`status = 'PENDING_PRINCIPAL'`).
* **Principal Approve Outpass:** `PATCH /api/principal/outpass/:id/approve`
  * **Access:** Authenticated Principal only
  * **Workflow:**
    * **One-Day Duty:** Transitions directly to final `APPROVED`, recording `principal_approval_status = 'approved'`. Enables QR generation by Principal.
    * **Special Outpass:** Transitions to `PENDING_WARDEN` for final campus exit authorization by Warden.
* **Principal Reject Outpass:** `PATCH /api/principal/outpass/:id/reject`
  * **Access:** Authenticated Principal only
  * **Body:** `{ "rejection_reason": "Administrative reason required" }`
  * **Workflow:** Sets `status = 'REJECTED'`, recording `principal_rejection_reason`.

### 8. Parent Dashboard & 128D Face Biometric Consent Workflow
* **URL:** `GET /api/parent/overview`
  * **Access:** Authenticated Parents only (`Authorization: Bearer <token>`)
  * **Response:** Returns linked student details (`name`, `regNo`, `department`, `room`, `block`), pending outpasses (Normal, One-Day Duty, Special), face registration status, approved/rejected counts, and message history.
* **URL:** `POST /api/parent/face-verify`
  * **Access:** Authenticated Parents only
  * **Body:** `{ "descriptor": [128-float array] }`
  * **Behavior:** Authoritative server-side vector comparison against enrolled 128D facial template (`parent_face_templates`) enforcing strict Euclidean distance threshold ($D \le 0.45$). On match, issues a cryptographically secure single-use verification token valid for 10 minutes.
* **Parent Approve Outpass:** `PATCH /api/parent/outpass/:id/approve`
  * **Access:** Authenticated Parents only
  * **Body:** `{ "verification_token": "face_ver_...", "message": "Mandatory parent message" }`
  * **Requirements:** Requires verified face session token + non-empty message + parent-student ownership validation.
  * **Workflow:**
    * Sets `parent_approval_status = 'approved'`, `parent_face_verified = 1`, and logs consent message in `parent_messages`.
    * **Normal Outpass:** Transitions to `PENDING_WARDEN` (notifies Warden).
    * **One-Day Duty / OD:** Transitions to `PENDING_ADVISOR` (notifies linked Class Advisor; strictly bypasses Warden).
    * **Special Outpass:** Transitions to `PENDING_ADVISOR`.
* **Parent Reject Outpass:** `PATCH /api/parent/outpass/:id/reject`
  * **Access:** Authenticated Parents only
  * **Body:** `{ "rejection_reason": "Explanation required" }`
  * **Workflow:** Sets `status = 'REJECTED'`, `parent_approval_status = 'rejected'`. The rejected request terminates immediately.
* **Parent Multilingual Messaging:**
  * **URL:** `GET /api/parent/messages` - Retrieve message history
  * **URL:** `POST /api/parent/messages` - Send English and தமிழ் (Tamil) messages (`utf8mb4` encoding) to hostel authorities.

### 9. QR Code Generation, Active Outpass & Validity Engine
* **Role-Segregated QR Code Generation:** `POST /api/qr/generate/:outpassId`
  * **Access:** Authenticated Staff (Role-based gatekeeping)
  * **One-Day Duty Pass:** Generated strictly by **Principal** (`role = 'principal'`). Warden access is blocked with HTTP 403 Forbidden.
  * **Normal, Emergency & Special Pass:** Generated strictly by **Warden** (`role = 'warden'`). Principal access is blocked with HTTP 403 Forbidden.
  * **Security Check:** Validates outpass is in `APPROVED` status, and verifies that Parent Face Verification was completed for Normal and OD passes.
  * **Payload:** Generates a cryptographically secure random token (`crypto.randomBytes(24)` -> `qr_sec_...`) and high-density PNG Data URL via `qrcode`. Biometric vectors and passwords are never exposed.
* **Student Active Outpass & Countdown:** `GET /api/student/active-outpass`
  * **Access:** Authenticated Students only
  * **Behavior:** Retrieves the student's latest approved outpass with active QR code. Computes real-time validity status based on server timestamps (`ACTIVE`, `NOT_YET_VALID`, `EXPIRED`, `REVOKED`, `COMPLETED`).
  * **UI:** Renders live Days/Hours/Minutes/Seconds countdown timer and high-contrast digital gate pass card on Student Dashboard.
* **Server-Authoritative QR Validation Engine:** `POST /api/qr/validate`
  * **Access:** Public / Gate Scanner Checkpoint Endpoint
  * **Body:** `{ "qr_token": "qr_sec_..." }`
  * **Validation Rules:**
    1. Returns `INVALID` (HTTP 404) if token is unknown.
    2. Returns `REVOKED` (HTTP 403) if pass has been revoked by authorized staff.
    3. Returns `ALREADY_USED` (HTTP 409) if pass has completed all allowable checkpoint scans (`max_uses`).
    4. Returns `NOT_YET_VALID` (HTTP 400) if current server time < scheduled leaving time.
    5. Returns `EXPIRED` (HTTP 410) if current server time > scheduled return time.
    6. Returns `VALID` (HTTP 200) with sanitized student metadata, departure/return window, and pass type.
* **Revoke QR Code:** `PATCH /api/qr/revoke/:qrId`
  * **Access:** Authorized staff (Principal for OD; Warden for Normal/Emergency/Special)
  * **Body:** `{ "revocation_reason": "Reason for revocation" }`
  * **Behavior:** Sets QR status to `REVOKED`, records revoker ID, timestamp, and reason. Immediately prevents validation at gate checkpoints.
* **Regenerate QR Code:** `POST /api/qr/regenerate/:outpassId`
  * **Access:** Authorized staff (Principal for OD; Warden for Normal/Emergency/Special)
  * **Behavior:** Invalidates previous QR code with audit log and generates a brand-new cryptographic token for the student.

---

## 🔑 Demo Login Credentials (All 7 Roles)

| Role | Identifier / Username | Default Password | Target Dedicated Dashboard |
| :--- | :--- | :--- | :--- |
| **🎓 Student** | `21CS042` | `Password@123` | `/student-dashboard.html` |
| **👨‍👩‍👧 Parent** | `9876543210` | `Password@123` | `/parent-dashboard.html` |
| **🛡️ Warden** | `WRD-101` | `Password@123` | `/warden-dashboard.html` |
| **🏛️ Principal** | `PRC-001` | `Password@123` | `/principal-dashboard.html` |
| **📚 Class Advisor** | `ADV-204` | `Password@123` | `/advisor-dashboard.html` |
| **🏠 Caretaker** | `CTK-305` | `Password@123` | `/caretaker-dashboard.html` |
| **👮 Watchman** | `SEC-001` | `Password@123` | `/watchman-dashboard.html` |

---

## 🧪 Automated Test Suites

Run any of the comprehensive test suites:

```bash
# 1. Exact Workflow-Based Request Routing & Role Isolation Suite (53 Tests)
node database/test_exact_workflow_routing.js

# 2. QR Code Generation, Role Gatekeeping & Validity Engine Suite (23 Tests)
node database/test_qr.js

# 3. Emergency & Special Outpass Workflow Suite (43 Tests)
node database/test_emergency_special_workflow.js

# 4. Parent Face Biometric Verification Lifecycle Suite (71 Tests)
node database/test_parent_face_lifecycle.js

# 5. Advance Time Constraints Suite (26 Tests)
node database/test_advance_time_constraints.js
```
**Total Passing Automated Tests:** 216+ Tests (0 Failures, 100% Passing).

---

## 💻 Frontend UI Features

* **7 Dedicated Portal Views**: Dynamic form fields, labels, and placeholders customized for Students, Parents, Wardens, Principals, Class Advisors, Caretakers, and Gate Security.
* **Role-Based Dynamic Dashboards**: Authenticated dashboard showing verified user info, avatar, role badge, upcoming capability cards, and logout controls.
* **Real-Time Backend Diagnostics**: Live status chip displaying API uptime, MySQL connection status, and Socket.IO heartbeat.
* **Dark & Light Mode**: Built-in theme switcher persisted in browser `localStorage`.
* **Quick Demo Autofill**: One-click autofill chips for all 7 roles for instant testing.

---

## 🔒 Roadmap & Next Phases

* [x] **Phase 1:** Project foundation, Express server, MySQL connection pool, relational schema, responsive multi-role UI.
* [x] **Phase 2:** Complete JWT & bcrypt authentication, 7-role login portal, session protection, and dashboard routing.
* [x] **Phase 3:** Exact canonical 4-tier workflow routing (Normal, One-Day Duty, Emergency, Special) with 128D Parent Face Biometrics.
* [x] **Phase 4:** Role-segregated dynamic QR Code token generation (Principal for OD; Warden for Normal/Emergency/Special), cryptographic tokens, server validity engine, live countdown timer.
* [ ] **Phase 5:** Gate check-in/check-out scanner interface (Watchman/Caretaker) and real-time audit logging.
* [ ] **Phase 6:** Hardware integration (Arduino UNO & physical fingerprint sensor at the very end).
