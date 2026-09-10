# Smart Hostel Outpass – Parent Face Biometric Verification System

## Executive Summary
We have successfully implemented the **Parent Face Biometric Verification System** for the Smart Hostel Outpass Management System. This release completely eliminates legacy location/geofencing-based authentication (student/parent GPS coordinates, 5-meter proximity guard, Leaflet maps) and replaces it with a secure, authoritative, server-side biometric face verification mechanism using 128-dimensional facial embedding vectors.

All existing role-based workflows (Student, Class Advisor, Principal, Warden, Caretaker, and Watchman) and QR movement checkpoints remain fully functional and validated.

---

## 1. Architectural & Database Implementations

### A. Centralized Biometric Configuration
- Created [`utils/faceConfig.js`](file:///c:/Out-Pass%20Management/utils/faceConfig.js):
  - **Threshold**: Strict Euclidean distance cutoff $D \le 0.45$ (configured via `PARENT_FACE_MATCH_THRESHOLD=0.45`).
  - **Vector Dimension**: Authoritative 128-dimensional float array (`FACE_DESCRIPTOR_LENGTH = 128`).
  - **Validation Engine**: Strict checking that rejects empty, non-array, wrong-length, `NaN`, `null`, `undefined`, or boolean values.
  - **Distance Math**: Pure Euclidean distance $\sqrt{\sum_{i=0}^{127} (A_i - B_i)^2}$ and Cosine Similarity helper.

### B. Database Schema Enhancements
Executed [`database/migrate_parent_face.js`](file:///c:/Out-Pass%20Management/database/migrate_parent_face.js):
- **`parent_face_templates`**: Stores authoritative 128D facial descriptor vectors (JSON), optional photo template, and registration timestamp for each parent.
- **`parent_face_verifications`**: Stores single-use verification session tokens with 10-minute TTL, status (`ACTIVE` / `CONSUMED` / `EXPIRED`), Euclidean distance, and match result.
- **`outpass_requests`**: Dropped legacy location columns (`student_loc_lat`, `student_loc_lng`, `parent_approval_lat`, `parent_approval_lng`, `distance_meters`, etc.) and added `parent_face_verified TINYINT(1) DEFAULT 0` and `parent_face_verified_at DATETIME NULL`.

---

## 2. Authoritative Backend Endpoints & Security Controls

### Endpoints in [`routes/parent.js`](file:///c:/Out-Pass%20Management/routes/parent.js) & [`controllers/parentController.js`](file:///c:/Out-Pass%20Management/controllers/parentController.js):
1. **`GET /api/parent/face/status`**:
   - Returns whether the authenticated parent has registered a face biometric template.
2. **`POST /api/parent/face/register`**:
   - Accepts `{ faceDescriptor, photoData }`. Validates descriptor format and single face presence; stores the 128D float array in `parent_face_templates`.
3. **`POST /api/parent/outpass/:id/face-verify`**:
   - Compares live face descriptor from the parent dashboard webcam against the stored template.
   - Computes Euclidean distance $D$:
     - If $D \le 0.45$: Issues a cryptographically secure, single-use verification token valid for 10 minutes.
     - If $D > 0.45$: Rejects with HTTP 422 (`Biometric face mismatch: live capture does not match registered profile`).
4. **`PATCH /api/parent/outpass/:id/approve`**:
   - Authoritatively requires a valid, active face verification token or descriptor matching $D \le 0.45$.
   - Immediately marks the token as `CONSUMED` (preventing replay attacks).
   - Sets `parent_face_verified = 1`, records `parent_face_verified_at = NOW()`, and transitions outpass status to `PENDING_WARDEN`.

---

## 3. Frontend Portals Modernization

### A. Student Portal ([`public/student-dashboard.html`](file:///c:/Out-Pass%20Management/public/student-dashboard.html) & [`public/js/student-dashboard.js`](file:///c:/Out-Pass%20Management/public/js/student-dashboard.js))
- Removed legacy `#studentGpsBar` banner, location notice alerts, and GPS permission prompts.
- Removed browser geolocation tracking, proximity guards, and location payload submission from outpass requests.
- Student outpass submission now proceeds smoothly without requiring GPS access.

### B. Parent Portal ([`public/parent-dashboard.html`](file:///c:/Out-Pass%20Management/public/parent-dashboard.html) & [`public/js/parent-dashboard.js`](file:///c:/Out-Pass%20Management/public/js/parent-dashboard.js))
- Purged orphaned Leaflet map scripts, markers, polylines, and GPS watching logic.
- Integrated webcam face biometric capture with `face-api.js`:
  - **Enrollment Modal**: Guides parent to register face profile with live video preview and face detection bounding box.
  - **Approval Modal**: Live biometric scanner verifies face in real-time ($D \le 0.45$), unlocks consent textarea, passes verification token, and completes approval.

### C. Warden Portal ([`public/js/warden-dashboard.js`](file:///c:/Out-Pass%20Management/public/js/warden-dashboard.js))
- Replaced legacy GPS coordinates and distance indicators with:
  - **Face Verified Badge**: Distinctive green `Face Verified ✓` badge on pending cards and details modal.
  - **Biometric Audit Details**: Displays parent verification status, timestamp, and mobile confirmation.

---

## 4. Verification Results & Regression Testing

### A. Comprehensive Parent Face Biometric Verification Suite
**File**: [`database/test_parent_face_verification.js`](file:///c:/Out-Pass%20Management/database/test_parent_face_verification.js)
```
🧪 ====================================================================
🚀 RUNNING PARENT FACE BIOMETRIC VERIFICATION AUTOMATED TEST SUITE
====================================================================

  ✅ [PASS] 0. Parent Dashboard HTML serves HTTP 200
  ✅ [PASS] Auth: Parent (9876543210) JWT login
  ✅ [PASS] Auth: Student (21CS042) JWT login
  ✅ [PASS] Auth: Warden (WRD-101) JWT login

--- Test A: Face Registration Status Check ---
  ✅ [PASS] Test A1: GET /api/parent/face/status reports faceRegistered = false when un-enrolled
  ✅ [PASS] Test A2: Match threshold returns authoritative 0.45

--- Test B: Face Template Registration ---
  ✅ [PASS] Test B1: POST /api/parent/face/register succeeds with valid 128D descriptor
  ✅ [PASS] Test B2: GET /api/parent/face/status immediately reflects faceRegistered = true
  ✅ [PASS] Test B3: Database parent_face_templates stores exact 128-element float array

--- Test C: Invalid Descriptor Format Validations ---
  ✅ [PASS] Test C1: Rejects empty descriptor with HTTP 400
  ✅ [PASS] Test C2: Rejects 64-dimensional descriptor (must be 128) with HTTP 400
  ✅ [PASS] Test C3: Rejects NaN floats in descriptor with HTTP 400
  ✅ [PASS] Test C4: Rejects singleFace = false (multiple faces in frame) with HTTP 400

--- Setting up Test Outpass Request ---
  ✅ [PASS] Setup: Student successfully submits normal outpass request without GPS dependency

--- Test D: Face Matching Verification (D <= 0.45) ---
  ✅ [PASS] Test D1: Live face matches registered template (HTTP 200, faceVerified = true)
  ✅ [PASS] Test D2: Verified distance 0.0115 <= 0.45 threshold
  ✅ [PASS] Test D3: Server issued single-use session verification token
  ✅ [PASS] Test D4: parent_face_verifications stores token with ACTIVE status

--- Test E: Face Mismatch Rejection (D > 0.45) ---
  ✅ [PASS] Test E1: Server authoritatively rejects mismatch with HTTP 422 (Distance: 1.4274)
  ✅ [PASS] Test E2: No verification token is issued on mismatch

--- Test F: Missing Descriptor Rejection ---
  ✅ [PASS] Test F1: Rejects missing face descriptor with HTTP 400

--- Test H: Server-Side Approval Security ---
  ✅ [PASS] Test H1: Reject approval without face verification token or descriptor (HTTP 403)

--- Test I: Forged & Expired Token Rejection ---
  ✅ [PASS] Test I1: Rejects forged/fabricated verification token (HTTP 403)

--- Test J: Complete Outpass Approval & Token Consumption ---
  ✅ [PASS] Test J1: Parent approves outpass successfully using valid face verification token
  ✅ [PASS] Test J2: Reused token rejected immediately (single-use token consumed)
  ✅ [PASS] Test J3: Outpass transitioned to PENDING_WARDEN
  ✅ [PASS] Test J4: parent_face_verified = 1 and timestamp recorded in outpass_requests

--- Test J (cont): Warden Review & QR Generation ---
  ✅ [PASS] Test J5: Warden receives outpass in pending queue
  ✅ [PASS] Test J6: Warden pending query authoritatively reports parentFaceVerified = 1 and biometricVerificationResult = VERIFIED
  ✅ [PASS] Test J7: Warden successfully approves outpass
  ✅ [PASS] Test J8: Gate QR code generated successfully upon Warden approval

--- Test K: Scan Codebase for Zero Location Auth Dependencies ---
  ✅ [PASS] Test K1: Zero remaining legacy location authentication dependencies in student and parent portals

====================================================================
📊 TEST SUITE SUMMARY: 32 PASSED | 0 FAILED
====================================================================
```

### B. System-Wide Regression Test Results
- [`database/test_advisor.js`](file:///c:/Out-Pass%20Management/database/test_advisor.js): **21 PASSED, 0 FAILED**
- [`database/test_warden.js`](file:///c:/Out-Pass%20Management/database/test_warden.js): **32 PASSED, 0 FAILED**
- [`database/test_dual_approval_workflow.js`](file:///c:/Out-Pass%20Management/database/test_dual_approval_workflow.js): **54 PASSED, 0 FAILED**

**Total Verified Test Cases**: **139 PASSED, 0 FAILED**.

---

## 5. Parent-Student Linking Fix – Strict Lookup & Removal of Demo Auto-Linking

### Problem
Previously, during new Parent account creation (`POST /api/auth/register-parent`), the registration form and endpoint did not accept or validate the student's roll number or name. Furthermore, `controllers/parentController.js` contained a fallback path that inserted phantom students, and `public/parent-dashboard.html` displayed hardcoded demo student values (`John Doe`, `21CS042`).

### Root Causes
1. **Frontend Registration**: `#parentRegisterForm` in [`public/index.html`](file:///c:/Out-Pass%20Management/public/index.html) and `handleParentInlineRegisterSubmit` in [`public/js/app.js`](file:///c:/Out-Pass%20Management/public/js/app.js) only collected parent name, mobile, and password.
2. **Backend Registration**: [`controllers/authController.js`](file:///c:/Out-Pass%20Management/controllers/authController.js) created a parent record without requiring or querying the student by roll number, leaving the parent without a linked student.
3. **Phantom Student Creation**: In [`controllers/parentController.js`](file:///c:/Out-Pass%20Management/controllers/parentController.js) `updateParentProfile`, missing roll numbers resulted in phantom student rows being inserted into `students` table (`INSERT INTO students ... VALUES (?, ?, ?, ?, ?, 'CSE', 3, true)`).
4. **Dashboard Fallback**: `public/parent-dashboard.html` had static text defaults `"John Doe"` and `"21CS042"`.

### Solutions Implemented
1. **Registration Form & Submission**:
   - Added `Relationship with Student` (`#parentRegRelationship`), `Student Name` (`#parentRegStudentName`), and `Student Roll Number` (`#parentRegStudentRoll`) to [`public/index.html`](file:///c:/Out-Pass%20Management/public/index.html).
   - Updated `handleParentInlineRegisterSubmit` in [`public/js/app.js`](file:///c:/Out-Pass%20Management/public/js/app.js) to validate and send these fields to `/api/auth/register-parent`.
2. **Strict Backend Student Lookup & Linking**:
   - Updated `registerParent` in [`controllers/authController.js`](file:///c:/Out-Pass%20Management/controllers/authController.js) to:
     - Require `student_roll_number`.
     - Perform exact query: `SELECT id, reg_no, name, parent_id ... FROM students WHERE UPPER(TRIM(reg_no)) = ? AND is_active = true`.
     - Reject missing roll number with: `"Student Roll Number not found. Please enter a valid registered student Roll Number."` (HTTP 400).
     - Validate that entered `student_name` matches the student's registered name. If mismatched, reject with: `"Student Roll Number and Student Name do not match."` (HTTP 400).
     - Link the student strictly: `UPDATE students SET parent_id = ? WHERE id = ?`.
     - Prevent duplicate parent registration (HTTP 409).
3. **Removal of Phantom Student Insertion**:
   - Refactored `updateParentProfile` in [`controllers/parentController.js`](file:///c:/Out-Pass%20Management/controllers/parentController.js) to require exact student roll number lookup and student name validation. Completely removed `INSERT INTO students ...`.
4. **Dashboard & UI Cleanup**:
   - Replaced demo student static text (`John Doe`, `21CS042`) in [`public/parent-dashboard.html`](file:///c:/Out-Pass%20Management/public/parent-dashboard.html) with dynamic placeholders.
   - Updated DOM element mappings in [`public/js/parent-dashboard.js`](file:///c:/Out-Pass%20Management/public/js/parent-dashboard.js) to dynamically bind `#profStudentName`, `#profStudentReg`, `#profStudentDept`, `#profStudentRoom`.
5. **Authorization & Security**:
   - Confirmed `parentController.getPendingRequests` filters by `WHERE o.student_id = linkedStudent.id`.
   - Confirmed `parentController.approveOutpass`, `rejectOutpass`, and `verifyFace` enforce strict server-side ownership (`request.parent_id === parentId`), returning HTTP 403 Forbidden on unauthorized access attempts.

### Automated Test Results
Test suite executed: [`database/test_parent_student_linking.js`](file:///c:/Out-Pass%20Management/database/test_parent_student_linking.js)
```
====================================================
PARENT-STUDENT LINKING FIX - AUTOMATED VERIFICATION
====================================================

Setup: Preparing test students...
  Created Student A (ID: 87, Roll: TEST_STU_A_1788933663542, Name: Karthik Raja)
  Created Student B (ID: 88, Roll: TEST_STU_B_1788933663542, Name: Priya Sridhar)

TEST 1: Create Parent A with Student A Roll Number
  [PASS] Parent A registration HTTP 201 created (got 201)
  [PASS] Parent A response reports success: true
  [PASS] Parent A received valid JWT auth token
  [PASS] Student A parent_id strictly linked to Parent A (ID: 98)

TEST 2: Create Parent B with Student B Roll Number
  [PASS] Parent B registration HTTP 201 created (got 201)
  [PASS] Parent B response reports success: true
  [PASS] Parent B received valid JWT auth token
  [PASS] Student B parent_id strictly linked to Parent B (ID: 99)
  [PASS] Parent B and Parent A are isolated (not cross-linked)

TEST 3: Create Parent with invalid Roll Number
  [PASS] Registration rejected with HTTP 400 (got 400)
  [PASS] Response indicates failure
  [PASS] Exact validation message returned: "Student Roll Number not found. Please enter a valid registered student Roll Number."

TEST 4: Enter valid Roll Number + wrong Student Name
  [PASS] Registration rejected with HTTP 400 (got 400)
  [PASS] Response indicates failure
  [PASS] Exact mismatch error message returned: "Student Roll Number and Student Name do not match."

TEST 5: Create Parent with a different student from demo student
  [PASS] Parent C registered with student B (got 201)
  [PASS] Student reg_no is TEST_STU_B_1788933663542 (NOT demo 21CS042)
  [PASS] Parent C is linked to student B (ID: 100)

TEST 6: Parent Dashboard - Linked Student Display
  [PASS] Parent A overview status 200 (got 200)
  [PASS] Parent A linkedStudent regNo is TEST_STU_A_1788933663542 (NOT demo 21CS042)
  [PASS] Parent A linkedStudent name is Karthik Raja (NOT John Doe)
  [PASS] Parent C overview status 200 (got 200)
  [PASS] Parent C linkedStudent regNo is TEST_STU_B_1788933663542 (NOT demo 21CS042)
  [PASS] Parent C linkedStudent name is Priya Sridhar (NOT John Doe)

TEST 7: Parent pending outpasses - Isolation check
  [PASS] Parent A pending requests fetched successfully (got 200)
  [PASS] Parent A sees their linked student's request (OP_TESTA_1788933663542)
  [PASS] Parent A does NOT see Student B's request (OP_TESTB_1788933663542)
  [PASS] Parent C pending requests fetched successfully (got 200)
  [PASS] Parent C sees their linked student's request (OP_TESTB_1788933663542)
  [PASS] Parent C does NOT see Student A's request (OP_TESTA_1788933663542)

TEST 8: Security - Attempt to approve another student request
  [PASS] Unauthorized approval blocked with HTTP 403 (got 403)
  [PASS] Security error message returned: "Authorization Error: You are not authorized to approve outpass requests for another student."
  [PASS] Unauthorized rejection blocked with HTTP 403 (got 403)

TEST 9: Repeated registration & duplicate link protection
  [PASS] Duplicate mobile registration rejected with HTTP 409 (got 409)
  [PASS] Clear duplicate notice returned: "An account with this mobile number already exists and is already linked to this student. Please sign in."
  [PASS] Invalid roll in profile update rejected with HTTP 400 (got 400)
  [PASS] Exact roll not found error returned on profile update: "Student Roll Number not found. Please enter a valid registered student Roll Number."

TEST 10: Codebase search for hardcoded/demo student fallback in parent registration
  [PASS] No hardcoded/demo student fallback found in registerParent
  [PASS] No phantom student insertion found in parentController
  [PASS] No static "John Doe" default in profStudentName

====================================================
TEST SUMMARY: 40 PASSED, 0 FAILED
====================================================
```

---

## 5. Student Request Data Isolation & Workflow Audit/Fix

### A. Audit Objectives & System Integrity Rules
The core objective of this audit was to ensure absolute mathematical and relational data isolation across all actors and outpass types:
1. **Strict 1-to-1 Student Resource Ownership**: Every request is linked exclusively to the authenticated student's database identity (`req.user.id`). Never trusts client-supplied `student_id`, demo IDs, or fallbacks.
2. **Dedicated Parent Linkage**: Parents only access outpass requests created by their own ward (`WHERE s.parent_id = ?`). Cross-parent access is blocked server-side with HTTP 403 Forbidden.
3. **Class Advisor Scoping**: Requests for an assigned student are routed strictly to that student's designated advisor (`class_advisor_id = ?`). Zero leakage across advisors within the same department.
4. **Principal Separation**: Clear distinction between One-Day Duty OD permissions and Special Multi-Day permissions.
5. **Warden Type Partitioning**: Normal, Emergency, and Special outpasses are partitioned into dedicated queues with correct prerequisite clearances.
6. **Zero Dummy/Fallback Data**: Under no circumstances does the system fall back to hardcoded demo records (`21CS042`, `Robert Doe`, `John Doe`, etc.) when real data is queried.

---

### B. Identified Vulnerabilities & Implemented Solutions

| Component | Identified Vulnerability / Gap | Technical Solution & Fix | Resulting Security Level |
|---|---|---|---|
| `controllers/authController.js` | `registerStudent` fell back to `SELECT id FROM parents ORDER BY id ASC LIMIT 1` when parent phone was not provided. | Removed fallback query. If parent mobile is omitted, automatically creates a dedicated, unique parent account for that student. | Strict 1-to-1 Parent-Student isolation; zero shared parent accounts. |
| `controllers/outpassController.js` | Advisor queues used `(s.department = ? OR s.class_advisor_id = ?)`, causing students assigned to Advisor B to be visible to Advisor A if in the same department. | Replaced with `((s.class_advisor_id IS NOT NULL AND s.class_advisor_id = ?) OR (s.class_advisor_id IS NULL AND s.department = ?))`. | Strict Advisor isolation; student assigned to Advisor 1 is hidden from Advisor 2. |
| `controllers/outpassController.js` | `advisorApprove` & `advisorReject` lacked ownership verification on the student's assigned advisor. | Enforced strict identity verification (`Number(request.class_advisor_id) === Number(advisorId)`), returning `HTTP 403 Forbidden` on mismatch. | Complete protection against advisor ID tampering and cross-advisor approvals. |
| `controllers/outpassController.js` | Missing secure direct lookup endpoint `GET /api/outpass/:id`. | Implemented `getOutpassById` with strict role-based access checks (Student, Parent, Advisor, Principal, Warden, Watchman). Unauthorized requests yield `HTTP 403 Forbidden`. | Direct URL/API ID access strictly constrained to legitimate stakeholders. |
| `controllers/parentController.js` | Missing secure parent single outpass lookup `GET /api/parent/outpass/:id`. | Implemented `getSingleOutpass` verifying `request.parent_id === parentId` with `HTTP 403 Forbidden` guard. | Parent cannot inspect or tamper with requests belonging to another parent's ward. |
| `controllers/parentController.js` | `getPendingRequests` lacked explicit student metadata projection. | Refactored query to strictly match `WHERE s.parent_id = ?` and return comprehensive student metadata (`studentId`, `reg_no`, `student_name`, `department`, `room_no`). | Eliminates ambiguous parent dashboard query joins and isolates ward queues. |
| `public/student-dashboard.html` & `public/parent-dashboard.html` | Hardcoded demo text ("Roll: 21CS042", "CSE", "Robert Doe", "9876543210") in static HTML cards. | Replaced all static mock text with neutral indicators (`--`). Profile data is populated strictly from authenticated JWT/session API. | Clean, dynamic UI with zero demo leakage. |
| `public/js/student-dashboard.js` | Fallback parent name `'Robert Doe'` and `'9876543210'` in frontend rendering. | Replaced with neutral placeholders `'Not Provided'` and `'N/A'`. | Eliminates misleading mock information in student view. |

---

### C. Multi-Workflow Routing Matrix

| Outpass Type | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | Final Gate Access |
|---|---|---|---|---|---|---|
| **Normal Outpass** | Student Submit | Parent Face Approval (`PENDING_PARENT`) | Warden Approval (`PENDING_WARDEN`) | — | — | QR Generated for Guard Scan |
| **One-Day Duty (OD)** | Student Submit | Class Advisor Approval (`PENDING_ADVISOR`) | Principal Approval (`PENDING_PRINCIPAL`) | — | — | QR Generated for Guard Scan |
| **Emergency Outpass** | Student Submit | Warden Immediate Review (`PENDING_WARDEN`) | — | — | — | QR Generated for Guard Scan |
| **Special Outpass** | Student Submit | Parent Face Approval (`PENDING_PARENT`) | Class Advisor Approval (`PENDING_ADVISOR`) | Principal Approval (`PENDING_PRINCIPAL`) | Warden Approval (`PENDING_WARDEN`) | QR Generated for Guard Scan |

---

### D. Comprehensive Verification Test Matrix

```
========================================================================================
Test Suite                                            Tests Run   Passed   Failed   Rate
========================================================================================
1. test_student_data_isolation_audit.js               20          20       0        100%
2. test_multi_student_end_to_end.js                   91          91       0        100%
3. test_parent_student_linking.js                     40          40       0        100%
4. test_parent_inline_portal_flow.js                  33          33       0        100%
5. test_warden_navigation_isolation.js                34          34       0        100%
6. test_principal_navigation_isolation.js             37          37       0        100%
========================================================================================
TOTAL AUDIT & REGRESSION SUITE                        255         255      0        100%
========================================================================================
```

All 255 test cases passed with zero errors, confirming that:
- Every outpass request belongs to exactly one student.
- Each outpass request transitions through only its authorized approval workflow.
- No cross-student, cross-parent, or cross-advisor leakage occurs at any layer.
- Tampering attempts at endpoints return HTTP 403 Forbidden.
- The system is completely free of hardcoded mock/fallback dependencies.

---

## 7. Parent Face Authentication Lifecycle – Controlled Registration, Verification & Warden Revocation

### A. Lifecycle Architecture & Requirements Fulfilled
1. **Mandatory First-Time Registration**:
   - When a parent account is created, `face_status` defaults to `'NOT_REGISTERED'` and `face_registered` to `0`.
   - The user cannot access the parent dashboard to approve requests until their face is enrolled.
   - An interactive modal (`#parentFirstTimeFaceModal`) opens with live camera preview, real-time face tracking oval, and neural model loading via `face-api.js`.
   - Upon capture, the 128D descriptor is submitted to `/api/parent/face/register`. The server stores the active template, sets `face_status = 'ACTIVE'`, logs `FACE_REGISTERED`, and unlocks the dashboard.

2. **Subsequent Actions (Verification Only)**:
   - Returning parents log in directly to their dashboard without repeating face registration.
   - When approving an outpass, the parent enters the verification flow:
     - The camera scans the live face.
     - Live descriptor is compared server-side against the stored template with Euclidean threshold $D \le 0.45$.
     - On match, a single-use cryptographically secure verification token is issued and logged (`FACE_VERIFIED`).
     - On mismatch ($D > 0.45$), verification is rejected with HTTP 422 and logged (`FACE_FAILED`).
     - Face registration is **never** repeated during outpass approval.

3. **Warden Revocation Workflow**:
   - In the Warden Dashboard under **Parent Face Management** (`#tab-parent-face-management`):
     - Warden searches parents by primary mobile number via `/api/warden/parents/search?mobile=...`.
     - Displays parent name, mobile number, linked student name/roll number/department/room, and current face status badge (`ACTIVE`, `REVOKED`, or `NOT_REGISTERED`).
     - For active parents, a red `REVOKE FACE` button opens a confirmation modal (`#wardenRevokeFaceModal`).
     - On confirmation, POST to `/api/warden/parents/revoke-face` executes:
       - Updates `parents.face_status = 'REVOKED'`, `parents.face_registered = 0`, records `face_revoked_at = NOW()`, `face_revoked_by`, and revocation reason.
       - Marks `parent_face_templates.status = 'REVOKED'`.
       - Writes an audit log entry: `action = 'FACE_REVOKED'`, `role = 'warden'`.
       - **Preserves** the parent account, credentials, and parent-student relationship intact.

4. **Post-Revocation Parent Recovery**:
   - Revoked parents can still log into their portal.
   - When viewing an outpass and clicking "Approve Outpass", the UI detects `faceStatus === 'REVOKED'` and presents a clear notice:
     *"Face registration is required before you can approve this outpass. Your previous registration was revoked by the Warden."*
   - Includes a direct button: **"Start Face Registration"**, which opens the registration modal.
   - Once a new face template is registered, status resets to `ACTIVE`, clearing the revocation timestamp.
   - The parent immediately returns to the outpass approval flow where their new face is verified, and the outpass is approved and transferred to the Warden.

---

### B. Comprehensive 18-Scenario Lifecycle Test Suite Verification

**Suite**: [`database/test_parent_face_lifecycle.js`](file:///c:/Out-Pass%20Management/database/test_parent_face_lifecycle.js)  
**Execution Command**: `node database/test_parent_face_lifecycle.js`

```
===============================================================
🧪 PARENT FACE AUTHENTICATION LIFECYCLE: 18 COMPREHENSIVE TESTS
===============================================================

📋 Test Parameters: Mobile: 9834964912 | Roll: 21CS042 | Student: John Doe
  ✅ PASS: Warden authentication succeeded

--- TEST 1: First-Time Parent Registration (face_status = NOT_REGISTERED) ---
  ✅ PASS: Registration HTTP status is 201 (Got: 201)
  ✅ PASS: Response requiresFaceRegistration is true
  ✅ PASS: Response faceStatus is NOT_REGISTERED
  ✅ PASS: User payload has faceStatus = NOT_REGISTERED
  ✅ PASS: Database parents.face_status is NOT_REGISTERED (Got: NOT_REGISTERED)
  ✅ PASS: Database parents.face_registered is 0 (false)

--- TEST 2: Dashboard Access Gate for NOT_REGISTERED Face ---
  ✅ PASS: Parent overview marks accessBlocked: true
  ✅ PASS: Parent overview returns faceStatus: NOT_REGISTERED
  ✅ PASS: Pending outpasses endpoint returns 403 Forbidden (Got: 403)
  ✅ PASS: Pending response indicates face_registration_required: true

--- TEST 3: Submitting 128D Face Embedding ---
  ✅ PASS: Register face HTTP status is 200 (Got: 200)
  ✅ PASS: Register face success is true
  ✅ PASS: Register face returns faceStatus: ACTIVE
  ✅ PASS: Database parents.face_status updated to ACTIVE
  ✅ PASS: Database parents.face_registered updated to 1
  ✅ PASS: parent_face_templates has active template
  ✅ PASS: Audit log records FACE_REGISTERED action

--- TEST 4: Parent Dashboard Unlocked After Face Registration ---
  ✅ PASS: Overview returns 200 OK
  ✅ PASS: Overview accessBlocked is false/undefined
  ✅ PASS: Overview returns parent.faceStatus: ACTIVE
  ✅ PASS: Face status endpoint returns ACTIVE
  ✅ PASS: Face status endpoint returns faceRegistered: true

--- TEST 5: Face Verification Match (D <= 0.45) ---
  ℹ️ Computed client synthetic Euclidean distance: 0.3088 (Threshold: <= 0.45)
  ✅ PASS: Verify face HTTP status is 200 (Got: 200)
  ✅ PASS: verifySuccess returns faceVerified: true
  ✅ PASS: Reported distance <= 0.45 (Got: 0.3088)
  ✅ PASS: Verification token issued

--- TEST 6: Face Verification Mismatch (D > 0.45) ---
  ℹ️ Computed client synthetic mismatch distance: 1.4159 (Threshold: > 0.45)
  ✅ PASS: Mismatch HTTP status is 422/401 (Got: 422)
  ✅ PASS: verifyMismatch returns faceVerified: false
  ✅ PASS: Reported distance > 0.45 (Got: 1.4159)

--- TEST 7: Mandatory Non-Empty Approval Comment Enforcement ---
  ✅ PASS: Empty comment HTTP status is 400 Bad Request (Got: 400)
  ✅ PASS: Approval with empty message rejected

--- TEST 8: Successful Outpass Approval with Face Token & Comment ---
  ✅ PASS: Approve HTTP status is 200 OK (Got: 200)
  ✅ PASS: Outpass approved successfully
  ✅ PASS: Outpass status transitioned to PENDING_WARDEN (Got: PENDING_WARDEN)
  ✅ PASS: Parent message recorded in database

--- TEST 9: Verification Token Single-Use Consumption ---
  ✅ PASS: Replaying used token rejected with HTTP 400

--- TEST 10: Non-Warden Search Authorization Guard ---
  ✅ PASS: Non-warden search returns 403 Forbidden (Got: 403)

--- TEST 11: Warden Parent Search by Mobile ---
  ✅ PASS: Warden search returns 200 OK
  ✅ PASS: Search returns parent record (Count: 1)
  ✅ PASS: Searched parent faceStatus is ACTIVE (Got: ACTIVE)
  ✅ PASS: Linked student roll number matches: 21CS042
  ✅ PASS: isActive flag is true

--- TEST 12: Non-Warden Revocation Authorization Guard ---
  ✅ PASS: Non-warden revocation returns 403 Forbidden (Got: 403)

--- TEST 13: Warden Executes Face Revocation ---
  ✅ PASS: Revocation HTTP status is 200 OK (Got: 200)
  ✅ PASS: Revocation success is true
  ✅ PASS: Revocation returns faceStatus: REVOKED
  ✅ PASS: Database parents.face_status set to REVOKED
  ✅ PASS: Database parents.face_registered set to 0
  ✅ PASS: Database parents.face_revoked_at is populated
  ✅ PASS: Revocation reason saved in DB
  ✅ PASS: parent_face_templates.status set to REVOKED
  ✅ PASS: Audit log records FACE_REVOKED action

--- TEST 14: Relational Data Integrity (Account & Student Intact) ---
  ✅ PASS: Parent account record exists in database
  ✅ PASS: Parent-Student relationship preserved intact
  ✅ PASS: Revoked parent can still login with credentials
  ✅ PASS: Login payload reflects faceStatus: REVOKED

--- TEST 15: Revoked Parent Verification & Approval Blocked ---
  ✅ PASS: Revoked face verification returns 403 Forbidden (Got: 403)
  ✅ PASS: Response specifies requiresRegistration: true

--- TEST 16: Post-Revocation Recovery Registration ---
  ✅ PASS: Re-registration HTTP status is 200 OK (Got: 200)
  ✅ PASS: Re-registration returns faceStatus: ACTIVE
  ✅ PASS: Database parents.face_status recovered to ACTIVE
  ✅ PASS: Database parents.face_registered restored to 1
  ✅ PASS: Revocation timestamp cleared upon recovery
  ✅ PASS: New FACE_REGISTERED audit log entry recorded

--- TEST 17: Post-Recovery Immediate Verification & Approval ---
  ✅ PASS: Previous descriptor rejected against new recovered template (Got: 422)
  ✅ PASS: New descriptor verifies successfully
  ✅ PASS: Outpass approved successfully after face recovery

--- TEST 18: Zero Workflow Regression Across Roles ---
  ✅ PASS: System health endpoint 200 OK
  ✅ PASS: Emergency outpass directly approved by Warden without parent involvement
  ✅ PASS: One-Day Duty outpass route preserved intact

===============================================================
🏁 TEST RESULTS: 71 PASSED | 0 FAILED
===============================================================
```

---

## 8. Multi-Student + Multi-Parent Request Routing & Data Isolation Audit & Fix

### A. Audit Objectives & Invariants Checked
1. **Permanent Request-To-Actor Binding**:
   - Every request is identified by `outpass_requests.id` and linked to `outpass_requests.student_id`.
   - `outpass_requests.student_id` $\to$ `students.id` $\to$ `students.user_id`.
   - `students.parent_id` $\to$ `parents.id`.
   - `students.class_advisor_id` $\to$ `staff.id`.
   - Outpass ownership and workflow progression are strictly validated against these relational keys, never by names, phone numbers alone, first matching rows, or client-supplied bodies.
2. **Canonical Workflow Routing Preserved**:
   - **Normal**: Student $\to$ Parent Face Verification $\to$ Parent Approval + Message $\to$ Warden $\to$ QR.
   - **One-Day Duty**: Student $\to$ Class Advisor $\to$ Principal $\to$ QR.
   - **Emergency**: Student $\to$ Warden $\to$ QR (bypassing Parent & Advisor).
   - **Special**: Student $\to$ Parent Face Verification $\to$ Class Advisor $\to$ Principal $\to$ Warden $\to$ QR.
3. **Data Isolation & Anti-Leakage Verified**:
   - Parent A sees ONLY Student A's applicable requests; cannot see Student B or C requests.
   - Parent B sees ONLY Student B's requests; cannot see Student A or C requests.
   - Duty and Emergency requests are completely excluded from Parent queues.
   - Cross-Parent approval attempts return `HTTP 403 Forbidden`.
   - Advisor A sees ONLY assigned students (Student A Duty); cannot see Student B Duty (assigned to Advisor B).
   - Cross-Advisor approval attempts return `HTTP 403 Forbidden`.
   - Principal receives One-Day Duty and Special Outpasses only when approved by Advisor; cannot see unapproved or Normal/Emergency requests.
   - Warden receives Normal (post-Parent), Emergency (direct), and Special (post-Principal); One-Day Duty never appears in Warden queue.
   - Student A direct API access to Student B request returns `HTTP 403 Forbidden`.
   - All database updates use strict `WHERE id = requestId` parameterization.

### B. Identified Issue & Applied Targeted Fix
- **Identified Issue**: In `controllers/parentController.js`, `verifyFace`, `approveOutpass`, and `rejectOutpass` compared `request.parent_id !== parentId`. If `parentId` from the JWT token had string type while MySQL returned an integer, strict inequality could cause false mismatches.
- **Targeted Fix Applied**: Standardized lines 303, 460, and 790 to use `Number(request.parent_id) !== Number(parentId)`, ensuring type-safe numeric validation matching `getSingleOutpass` (line 1341) and `outpassController.js` (line 2860).
- **No Speculative Changes**: No unrelated modules were altered. The canonical workflows, 10h/6h advance rules, and face biometrics remained untouched.

### C. Test Matrix Results
Suite: [`database/test_multi_student_routing_audit.js`](file:///c:/Out-Pass%20Management/database/test_multi_student_routing_audit.js)  
Execution: `node database/test_multi_student_routing_audit.js`

| Test Description | Expected | Actual | Result |
|---|---|---|---|
| Parent A sees Student A | YES | YES | PASS |
| Parent A sees Student B | NO | NO | PASS |
| Parent B sees Student A | NO | NO | PASS |
| Parent B approves Student A | 403 | 403 | PASS |
| Parent A approves Student A | SUCCESS | SUCCESS | PASS |
| Advisor A sees Student A OD | YES | YES | PASS |
| Advisor A sees Student B OD | NO | NO | PASS |
| Advisor B approves Student A | 403 | 403 | PASS |
| Principal sees correct OD | YES | YES | PASS |
| Principal sees unrelated Normal | NO | NO | PASS |
| Warden receives approved Normal A | YES | YES | PASS |
| Warden receives approved Normal B | YES | YES | PASS |
| Student A sees Student B request | NO | NO | PASS |
| Notification Parent A | YES | YES | PASS |
| Notification Parent B | NO | NO | PASS |
| Concurrent request isolation | PASS | PASS | PASS |

**Total Suite Assertions**: **70 PASSED, 0 FAILED**.

---

## 9. Exact Canonical Workflow Routing: Verification, Documentation & UI Alignment

### A. The 4 Canonical Workflows
We verified that all 4 outpass workflows operate with strict relational routing and role gatekeeping across the backend controllers (`outpassController.js`, `parentController.js`, `qrController.js`, `principalController.js`), frontend dashboards, and documentation:

1. **Normal Outpass**:
   `Student → Parent Face Verification → Parent Approval + Message → Warden → QR`
   - Initial status: `PENDING_PARENT`.
   - Parent completes live 128D face verification ($D \le 0.45$) and submits a non-empty message.
   - Transitions to `PENDING_WARDEN`.
   - Warden grants final approval (`APPROVED`).
   - Warden issues the dynamic cryptographic QR gate pass.

2. **One-Day Duty / OD**:
   `Student → Parent Face Verification → Parent Approval + Message → Class Advisor → Principal → QR`
   - Initial status: `PENDING_PARENT`.
   - Parent completes 128D face verification and submits a non-empty message.
   - Transitions to `PENDING_ADVISOR` (Class Advisor of student's department).
   - Class Advisor verifies academic credentials and grants clearance $\to$ `PENDING_PRINCIPAL`.
   - Principal grants final institutional approval (`APPROVED`).
   - Principal issues dynamic cryptographic QR gate pass.
   - **Critical Rule**: Warden is **NEVER** involved in One-Day Duty passes (Warden approval and QR generation are blocked with HTTP 403 Forbidden).

3. **Emergency Outpass**:
   `Student → Warden → QR`
   - Initial status: `PENDING_WARDEN` (Parent, Advisor, and Principal are bypassed).
   - Exempt from standard advance application locks.
   - Warden conducts direct review and grants approval (`APPROVED`).
   - Warden issues the dynamic cryptographic QR gate pass.

4. **Special Outpass**:
   `Student → Parent Face Verification → Parent Approval + Message → Class Advisor → Principal → Warden → QR`
   - Initial status: `PENDING_PARENT`.
   - Parent completes 128D face verification and submits a non-empty message.
   - Transitions through all 4 clearance stages in strict sequence: Parent $\to$ Class Advisor $\to$ Principal $\to$ Warden.
   - Warden grants final approval (`APPROVED`) and issues the dynamic cryptographic QR gate pass.

---

### B. UI Banners & Guidance Flow Alignment
1. **Advisor Dashboard ([`public/advisor-dashboard.html`](file:///c:/Out-Pass%20Management/public/advisor-dashboard.html))**:
   - Updated top workflow guidance banner to display the 5-step flow:
     `Step 1: Student Submission → Step 2: Parent Face Verification → Step 3: Advisor Clearance (You) → Step 4: Principal Clearance → Step 5: QR Gate Pass`.
2. **Student Dashboard ([`public/student-dashboard.html`](file:///c:/Out-Pass%20Management/public/student-dashboard.html) & [`public/js/student-dashboard.js`](file:///c:/Out-Pass%20Management/public/js/student-dashboard.js))**:
   - Updated workflow titles and node step labels in dynamic switcher:
     - Normal Outpass: `Student → Parent Face Verification → Warden → QR`
     - One-Day Duty: `Student → Parent Face Verification → Class Advisor → Principal → QR`
     - Emergency Outpass: `Student → Warden → QR`
     - Special Outpass: `Student → Parent Face Verification → Class Advisor → Principal → Warden → QR`
3. **Documentation ([`README.md`](file:///c:/Out-Pass%20Management/README.md))**:
   - Fully revised lines 220-350 to replace legacy references with the 4 canonical workflows.
   - Removed references to legacy fingerprint hardware and replaced with 128D Face Biometric Verification ($D \le 0.45$) + Parent Approval Message.
   - Documented role-segregated QR generation (Principal for OD, Warden for Normal/Emergency/Special).

---

### C. Automated Test Verification Summary

| Test Suite | File | Tests Run | Result |
|---|---|:---:|:---:|
| Exact Workflow Routing & Role Isolation | [`database/test_exact_workflow_routing.js`](file:///c:/Out-Pass%20Management/database/test_exact_workflow_routing.js) | 53 | **53 / 53 PASSED (100%)** |
| QR Generation & Validity Engine | [`database/test_qr.js`](file:///c:/Out-Pass%20Management/database/test_qr.js) | 23 | **23 / 23 PASSED (100%)** |
| Emergency & Special Outpass | [`database/test_emergency_special_workflow.js`](file:///c:/Out-Pass%20Management/database/test_emergency_special_workflow.js) | 43 | **43 / 43 PASSED (100%)** |
| Parent Face Biometric Lifecycle | [`database/test_parent_face_lifecycle.js`](file:///c:/Out-Pass%20Management/database/test_parent_face_lifecycle.js) | 71 | **71 / 71 PASSED (100%)** |
| Advance Time Constraints & Duration | [`database/test_advance_time_constraints.js`](file:///c:/Out-Pass%20Management/database/test_advance_time_constraints.js) | 26 | **26 / 26 PASSED (100%)** |
| **Total Passing Tests** | | **216** | **216 / 216 PASSED (100%)** |



