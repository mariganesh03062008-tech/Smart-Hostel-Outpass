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
* **Workflow Status Routing:**
  * **Normal Outpass:** Initial status is `PENDING_WARDEN` (Student → Warden).
  * **One-Day Duty:** Initial status is `PENDING_ADVISOR` (Student → Class Advisor → Warden).

### 2. My Outpass Requests
* **URL:** `GET /api/outpass/my-requests`
* **Access:** Authenticated Students only
* **Response:** Returns all submitted outpass applications with real-time status badges (`PENDING_WARDEN`, `PENDING_ADVISOR`, `APPROVED`, `REJECTED`, `COMPLETED`).

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
* **Response:** Returns metrics for pending normal outpasses, pending duty passes, approved total, rejected total, active outpasses, and students currently outside.

* **URL:** `GET /api/outpass/warden/pending`
* **Access:** Authenticated Warden staff only
* **Response:** Returns list of pending Normal Outpass requests awaiting Warden review (`status = 'PENDING_WARDEN'`).

* **URL:** `GET /api/outpass/warden/pending-duty`
* **Access:** Authenticated Warden staff only
* **Response:** Returns list of One-Day Duty requests that have ALREADY received Class Advisor approval.

### 5. Warden Outpass Approval & Rejection
* **Approve Outpass:** `PATCH /api/outpass/:id/approve`
  * **Access:** Authenticated Warden staff only
  * **Behavior:** Verifies pending status, sets status to `APPROVED`, records `approved_by_warden_id` and timestamp `approved_at`.
* **Reject Outpass:** `PATCH /api/outpass/:id/reject`
  * **Access:** Authenticated Warden staff only
  * **Body:** `{ "rejection_reason": "Explanation required" }`
  * **Behavior:** Verifies pending status, requires non-empty reason, sets status to `REJECTED`, records `rejected_by_warden_id` and timestamp `rejected_at`.

### 6. Class Advisor Dashboard & Academic Clearance Workflow
* **URL:** `GET /api/outpass/advisor/overview`
  * **Access:** Authenticated Class Advisors only (`Authorization: Bearer <token>`)
  * **Response:** Returns metrics for department-specific pending OD requests, approved today, rejected today, and lifetime total.
* **URL:** `GET /api/outpass/advisor/pending`
  * **Access:** Authenticated Class Advisors only
  * **Behavior:** Returns ONLY requests where `outpass_type = ONE_DAY_DUTY` AND `status = PENDING_ADVISOR` for students in the advisor's assigned department.
* **URL:** `GET /api/outpass/advisor/approved`
  * **Response:** History of One-Day Duty requests granted academic clearance by this advisor.
* **URL:** `GET /api/outpass/advisor/rejected`
  * **Response:** History of One-Day Duty requests rejected by this advisor with stated reasons.
* **Approve OD Pass:** `PATCH /api/outpass/:id/advisor-approve`
  * **Access:** Authenticated Class Advisors only
  * **Security (Rule 5):** Enforces department-level authorization. Advisor cannot approve requests from unrelated departments.
  * **Workflow:** Sets `advisor_approval_status = 'approved'`, records `advisor_approved_by_id` and timestamp, and transitions status from `PENDING_ADVISOR` to `PENDING_WARDEN` (making it immediately visible in Warden's One-Day Duty queue).
* **Reject OD Pass:** `PATCH /api/outpass/:id/advisor-reject`
  * **Access:** Authenticated Class Advisors only
  * **Body:** `{ "rejection_reason": "Academic reason required" }`
  * **Workflow:** Sets `status = 'REJECTED'`, records `advisor_rejection_reason`. The rejected request is **NEVER** sent to the Warden.

### 7. Parent Dashboard & Biometric Consent Workflow
* **URL:** `GET /api/parent/overview`
  * **Access:** Authenticated Parents only (`Authorization: Bearer <token>`)
  * **Response:** Returns linked student details (`name`, `regNo`, `department`, `room`, `block`), pending outpasses, approved/rejected counts, unread messages, and biometric session status.
* **URL:** `POST /api/parent/biometric-verify`
  * **Access:** Authenticated Parents only
  * **Body:** `{ simulation_mode: true }`
  * **Note:** Software biometric validation module (clearly marked `DEVELOPMENT ONLY`). Structured for direct drop-in integration with physical Arduino/Serial fingerprint hardware.
* **URL:** `GET /api/parent/outpass/pending`
  * **Access:** Authenticated Parents only
  * **Behavior:** Returns ONLY pending outpasses for the parent's linked student (`o.status = 'PENDING_PARENT'`).
* **URL:** `GET /api/parent/outpass/approved`
  * **Response:** History of outpasses approved by the parent.
* **URL:** `GET /api/parent/outpass/rejected`
  * **Response:** History of outpasses rejected by the parent with reasons.
* **Parent Approve Outpass:** `PATCH /api/parent/outpass/:id/approve`
  * **Access:** Authenticated Parents only
  * **Requirements:** Requires verified biometric fingerprint session + ownership validation.
  * **Workflow:** Sets `parent_approval_status = 'approved'`, `parent_biometric_verified = 1`, records parent ID and timestamp, and transitions status from `PENDING_PARENT` to `PENDING_WARDEN` (forwarding to Warden).
* **Parent Reject Outpass:** `PATCH /api/parent/outpass/:id/reject`
  * **Access:** Authenticated Parents only
  * **Body:** `{ "rejection_reason": "Explanation required" }`
  * **Workflow:** Sets `status = 'REJECTED'`, `parent_approval_status = 'rejected'`. The rejected request is **NEVER** sent to the Warden.
* **Parent Multilingual Messaging:**
  * **URL:** `GET /api/parent/messages` - Retrieve message history
  * **URL:** `POST /api/parent/messages` - Send English and தமிழ் (Tamil) messages (`utf8mb4` encoding) to hostel authorities.

### 8. QR Code Generation, Active Outpass & Validity Engine
* **Generate QR Code (Warden Only):** `POST /api/qr/generate/:outpassId`
  * **Access:** Authenticated Warden staff only (`Authorization: Bearer <token>`)
  * **Behavior:** Validates outpass is final `APPROVED` by Warden. Generates a cryptographically secure random token (`crypto.randomBytes(24)` -> `qr_sec_...`) and high-density PNG Data URL via `qrcode`.
  * **Security:** Does **NOT** store plaintext passwords or biometric data in QR payload. QR contains only the secure token, request code, and system signature.
* **Student Active Outpass & Countdown:** `GET /api/student/active-outpass`
  * **Access:** Authenticated Students only
  * **Behavior:** Retrieves the student's latest approved outpass with active QR code. Computes real-time validity status based on server timestamps (`ACTIVE`, `NOT_YET_VALID`, `EXPIRED`, `REVOKED`, `COMPLETED`).
  * **UI:** Renders live Days/Hours/Minutes/Seconds countdown timer and high-contrast digital gate pass card on Student Dashboard.
* **Server-Authoritative QR Validation Engine:** `POST /api/qr/validate`
  * **Access:** Public / Gate Scanner Checkpoint Endpoint
  * **Body:** `{ "qr_token": "qr_sec_..." }`
  * **Validation Rules:**
    1. Returns `INVALID` (HTTP 404) if token is unknown.
    2. Returns `REVOKED` (HTTP 403) if pass has been revoked by Warden.
    3. Returns `ALREADY_USED` (HTTP 409) if pass has completed all allowable checkpoint scans (`max_uses`).
    4. Returns `NOT_YET_VALID` (HTTP 400) if current server time < scheduled leaving time.
    5. Returns `EXPIRED` (HTTP 410) if current server time > scheduled return time.
    6. Returns `VALID` (HTTP 200) with sanitized student metadata, departure/return window, and pass type.
* **Revoke QR Code (Warden Only):** `PATCH /api/qr/revoke/:qrId`
  * **Access:** Authenticated Warden staff only
  * **Body:** `{ "revocation_reason": "Reason for revocation" }`
  * **Behavior:** Sets QR status to `REVOKED`, records `revoked_by_warden_id`, timestamp `revoked_at`, and reason. Immediately prevents validation at gate checkpoints.
* **Regenerate QR Code (Warden Only):** `POST /api/qr/regenerate/:outpassId`
  * **Access:** Authenticated Warden staff only
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
# 1. QR Code Generation, Validity Engine & Student Active Pass (18 Tests)
node database/test_qr.js

# 2. Parent Biometric Consent & Multilingual Messaging (22 Tests)
node database/test_parent.js

# 3. Class Advisor OD Clearance & Department Isolation (20 Tests)
node database/test_advisor.js

# 4. Warden Dashboard & Approval Queue (20 Tests)
node database/test_warden.js

# 5. Student Outpass Submission & Status Summary (16 Tests)
node database/test_outpass.js

# 6. Authentication & 7-Role Redirection (28 Tests)
node database/test_auth.js
```
**Total Passing Automated Tests:** 124 Tests (0 Failures).

---

## 💻 Frontend UI Features

* **7 Dedicated Portal Views**: Dynamic form fields, labels, and placeholders customized for Students, Parents, Wardens, Principals, Class Advisors, Caretakers, and Gate Security.
* **Role-Based Dynamic Dashboards**: Authenticated dashboard (`dashboard.html`) showing verified user info, avatar, role badge, upcoming capability cards, and logout controls.
* **Real-Time Backend Diagnostics**: Live status chip displaying API uptime, MySQL connection status, and Socket.IO heartbeat.
* **Dark & Light Mode**: Built-in theme switcher persisted in browser `localStorage`.
* **Quick Demo Autofill**: One-click autofill chips for all 7 roles for instant testing.

---

## 🔒 Roadmap & Next Phases

* [x] **Phase 1:** Project foundation, Express server, MySQL connection pool, relational schema, responsive multi-role UI.
* [x] **Phase 2:** Complete JWT & bcrypt authentication, 7-role login portal, session protection, and dashboard routing.
* [x] **Phase 3:** Outpass request lifecycle & multi-tier approval workflow (Parent -> Advisor -> Warden).
* [x] **Phase 4:** Dynamic QR Code token generation, cryptographic tokens, server validity engine, live countdown timer, and Warden QR management.
* [ ] **Phase 5:** Gate check-in/check-out scanner interface (Watchman/Caretaker) and real-time audit logging.
* [ ] **Phase 6:** Hardware integration (Arduino UNO & physical fingerprint sensor at the very end).
