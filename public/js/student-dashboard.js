/**
 * Smart Hostel Outpass Management System
 * Student Dashboard & Outpass Request Controller
 */

// State
let currentStudent = null;
let activeTab = 'new-outpass';

// DOM Elements cache
const DOM = {
  studentName: document.getElementById('studentName'),
  studentAvatar: document.getElementById('studentAvatar'),
  studentRegNo: document.getElementById('studentRegNo'),
  studentDept: document.getElementById('studentDept'),
  studentYearSem: document.getElementById('studentYearSem'),
  studentBlockRoom: document.getElementById('studentBlockRoom'),
  hostelStatusBadge: document.getElementById('hostelStatusBadge'),
  hostelStatusText: document.getElementById('hostelStatusText'),

  // Autofill context in form
  afName: document.getElementById('afName'),
  afRegNo: document.getElementById('afRegNo'),
  afDept: document.getElementById('afDept'),
  afYearSem: document.getElementById('afYearSem'),
  afRoom: document.getElementById('afRoom'),
  afPhone: document.getElementById('afPhone'),

  // Outpass Form
  outpassForm: document.getElementById('outpassForm'),
  radioNormal: document.getElementById('typeNormal'),
  radioDuty: document.getElementById('typeDuty'),
  typeOptionNormal: document.getElementById('typeOptionNormal'),
  typeOptionDuty: document.getElementById('typeOptionDuty'),
  dutyFieldsBox: document.getElementById('dutyFieldsBox'),
  
  inputDestination: document.getElementById('destinationInput'),
  inputReason: document.getElementById('reasonInput'),
  inputPhone: document.getElementById('phoneInput'),
  inputLeavingDate: document.getElementById('leavingDateInput'),
  inputLeavingTime: document.getElementById('leavingTimeInput'),
  inputReturnDate: document.getElementById('returnDateInput'),
  inputReturnTime: document.getElementById('returnTimeInput'),
  
  // Duty fields
  inputEventName: document.getElementById('eventNameInput'),
  inputEventLocation: document.getElementById('eventLocationInput'),
  inputDutyDate: document.getElementById('dutyDateInput'),
  inputDutyDesc: document.getElementById('dutyDescInput'),

  btnSubmitOutpass: document.getElementById('btnSubmitOutpass'),
  submitBtnText: document.getElementById('submitBtnText'),
  submitSpinner: document.getElementById('submitSpinner'),
  formMessage: document.getElementById('formMessage'),
  submitLocationNotice: document.getElementById('submitLocationNotice'),
  submitLocationNoticeText: document.getElementById('submitLocationNoticeText'),

  // Advance notice elements
  advanceTimeNoticeBox: document.getElementById('advanceTimeNoticeBox'),
  advanceNoticeIcon: document.getElementById('advanceNoticeIcon'),
  advanceNoticeTitle: document.getElementById('advanceNoticeTitle'),
  advanceNoticeText: document.getElementById('advanceNoticeText'),

  // Stats Counters
  statTotal: document.getElementById('statTotal'),
  statPending: document.getElementById('statPending'),
  statApproved: document.getElementById('statApproved'),
  statRejected: document.getElementById('statRejected'),
  statCompleted: document.getElementById('statCompleted'),
  navPendingCount: document.getElementById('navPendingCount'),

  // Tables & Feeds
  requestsTableBody: document.getElementById('requestsTableBody'),
  requestsEmptyState: document.getElementById('requestsEmptyState'),
  activePassContainer: document.getElementById('activePassContainer'),
  btnRefreshRequests: document.getElementById('btnRefreshRequests'),

  // Sidebar Buttons
  navButtons: document.querySelectorAll('.sidebar-nav-btn'),
  tabSections: document.querySelectorAll('.tab-section'),
  logoutBtn: document.getElementById('logoutBtn'),

  toastContainer: document.getElementById('toastContainer')
};

function getAuthToken() {
  return localStorage.getItem('sh_token') ||
         sessionStorage.getItem('sh_token') ||
         localStorage.getItem('token') ||
         sessionStorage.getItem('token') ||
         '';
}

// Initialize Student Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNavigation();
  initTypeSelector();
  initFormHandler();
  initLogout();
  setDefaultDates();
  updateSubmitButtonState();

  await verifyStudentSession();
});

/* ==========================================================
   1. SESSION VERIFICATION & DATA LOADING
   ========================================================== */
async function verifyStudentSession() {
  const token = getAuthToken();

  if (!token) {
    window.location.href = '/index.html';
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      clearAuthAndRedirect();
      return;
    }

    const data = await res.json();
    if (!data.success || !data.user) {
      clearAuthAndRedirect();
      return;
    }

    // Role Enforcement
    const role = (data.user.role || '').toLowerCase().trim();
    if (role !== 'student') {
      console.warn(`Role mismatch: Expected student, got ${role}. Redirecting.`);
      const ROLE_DASHBOARDS = {
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
      window.location.href = ROLE_DASHBOARDS[role] || '/student-dashboard.html';
      return;
    }

    currentStudent = data.user;
    populateStudentHeader(currentStudent);

    // Check Profile Completion Status from DB
    const isProfileCompleted = Boolean(currentStudent.profile_completed || currentStudent.profileCompleted);
    if (!isProfileCompleted) {
      openFirstTimeProfileModal(currentStudent);
    } else {
      closeFirstTimeProfileModal();
    }

    await Promise.all([loadStatusSummary(), loadMyRequests(), loadActiveOutpass()]);

  } catch (err) {
    console.error('[Student Dash Error]:', err);
  }
}

function populateStudentHeader(student) {
  const name = student.name || 'Student';
  const regNo = student.reg_no || student.identifier || 'N/A';
  const dept = student.department || 'N/A';
  const year = student.year_of_study ? `Year ${student.year_of_study}` : 'Year 3';
  const sem = student.semester || `Semester ${student.year_of_study ? student.year_of_study * 2 : 6}`;
  const block = student.hostel_block || 'Hostel Block';
  const room = student.room_no ? `Room ${student.room_no}` : 'Room -';
  const phone = student.phone || '';
  const isProfileCompleted = Boolean(student.profile_completed || student.profileCompleted);

  if (DOM.studentName) DOM.studentName.textContent = name;
  if (DOM.studentAvatar) DOM.studentAvatar.textContent = name.charAt(0).toUpperCase();
  if (DOM.studentRegNo) DOM.studentRegNo.textContent = regNo;
  if (DOM.studentDept) DOM.studentDept.textContent = dept;
  if (DOM.studentYearSem) DOM.studentYearSem.textContent = `${year} • ${sem}`;
  if (DOM.studentBlockRoom) DOM.studentBlockRoom.textContent = `${block} • ${room}`;

  // Header Nav user chip
  const navUser = document.getElementById('navUserName');
  const navAvatar = document.getElementById('navUserAvatar');
  if (navUser) navUser.textContent = name.split(' ')[0] || 'Student';
  if (navAvatar) navAvatar.textContent = name.charAt(0).toUpperCase();

  // Autofill form context
  if (DOM.afName) DOM.afName.textContent = name;
  if (DOM.afRegNo) DOM.afRegNo.textContent = regNo;
  if (DOM.afDept) DOM.afDept.textContent = dept;
  if (DOM.afYearSem) DOM.afYearSem.textContent = `${year} (${sem})`;
  if (DOM.afRoom) DOM.afRoom.textContent = `${block} - ${room}`;
  if (DOM.afPhone) DOM.afPhone.textContent = phone;
  if (DOM.inputPhone && !DOM.inputPhone.value) DOM.inputPhone.value = phone;

  // Profile section fields in View Mode
  const pName = document.getElementById('profName');
  const pReg = document.getElementById('profReg');
  const pDept = document.getElementById('profDept');
  const pYearSem = document.getElementById('profYearSem');
  const pBlockName = document.getElementById('profBlockName');
  const pRoomNo = document.getElementById('profRoomNo');
  const pEmail = document.getElementById('profEmail');
  const pPhone = document.getElementById('profPhone');
  const pParent = document.getElementById('profParent');
  const pParentPhone = document.getElementById('profParentPhone');
  const pRelationship = document.getElementById('profRelationship');
  const pStatusBadge = document.getElementById('profStatusBadge');

  if (pName) pName.textContent = name;
  if (pReg) pReg.textContent = regNo;
  if (pDept) pDept.textContent = dept;
  if (pYearSem) pYearSem.textContent = `${year} • ${sem}`;
  if (pBlockName) pBlockName.textContent = block;
  if (pRoomNo) pRoomNo.textContent = room;
  if (pEmail) pEmail.textContent = student.email || 'N/A';
  if (pPhone) pPhone.textContent = phone || 'N/A';
  if (pParent) pParent.textContent = student.parent_name || 'Robert Doe';
  if (pParentPhone) pParentPhone.textContent = student.parent_phone || '9876543210';
  if (pRelationship) pRelationship.textContent = student.parent_relationship || 'Father';
  if (pStatusBadge) {
    pStatusBadge.textContent = isProfileCompleted ? '✓ Completed' : '⚠ Incomplete';
    pStatusBadge.style.color = isProfileCompleted ? '#10b981' : '#f59e0b';
  }
}

/* ==========================================================
   2. LOAD STATUS SUMMARY & HOSTEL STATUS
   ========================================================== */
async function loadStatusSummary() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch('/api/outpass/status-summary', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const stats = data.stats || {};
      if (DOM.statTotal) DOM.statTotal.textContent = stats.total || 0;
      if (DOM.statPending) DOM.statPending.textContent = stats.pending || 0;
      if (DOM.statApproved) DOM.statApproved.textContent = stats.approved || 0;
      if (DOM.statRejected) DOM.statRejected.textContent = stats.rejected || 0;
      if (DOM.statCompleted) DOM.statCompleted.textContent = stats.completed || 0;

      if (DOM.navPendingCount) {
        DOM.navPendingCount.textContent = stats.pending || 0;
        DOM.navPendingCount.style.display = stats.pending > 0 ? 'inline-block' : 'none';
      }

      // Update Hostel Status Pill
      const status = data.hostelStatus || 'Inside Hostel';
      if (DOM.hostelStatusText) DOM.hostelStatusText.textContent = status;
      if (DOM.hostelStatusBadge) {
        if (status === 'Outside Hostel') {
          DOM.hostelStatusBadge.className = 'hostel-status-pill outside';
        } else {
          DOM.hostelStatusBadge.className = 'hostel-status-pill inside';
        }
      }

      // Render Active Outpass card
      renderActivePass(data.activeOutpass);
    }
  } catch (err) {
    console.error('Error fetching summary:', err);
  }
}

/* ==========================================================
   3. LOAD MY REQUESTS
   ========================================================== */
async function loadMyRequests() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch('/api/outpass/my-requests', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      renderRequestsTable(data.requests || []);
    }
  } catch (err) {
    console.error('Error fetching requests:', err);
  }
}

function renderRequestsTable(requests) {
  if (!DOM.requestsTableBody) return;
  DOM.requestsTableBody.innerHTML = '';

  if (!requests || requests.length === 0) {
    if (DOM.requestsEmptyState) DOM.requestsEmptyState.classList.remove('hidden');
    return;
  }

  if (DOM.requestsEmptyState) DOM.requestsEmptyState.classList.add('hidden');

  requests.forEach(req => {
    const tr = document.createElement('tr');

    const formattedLeave = formatDateTime(req.leavingDatetime);
    const formattedReturn = formatDateTime(req.returnDatetime);
    const formattedSub = formatDateTime(req.submittedDate);

    tr.innerHTML = `
      <td><strong>${req.requestCode}</strong></td>
      <td>
        <span class="student-tag">${req.displayType}</span>
        ${req.eventName ? `<br><small style="color:var(--text-muted);">${escapeHtml(req.eventName)}</small>` : ''}
      </td>
      <td>
        <div><strong>${escapeHtml(req.destination)}</strong></div>
        <small style="color:var(--text-secondary);">${escapeHtml(req.purpose)}</small>
      </td>
      <td>${formattedLeave}</td>
      <td>${formattedReturn}</td>
      <td>
        <span class="status-badge ${req.badgeClass}">
          ${req.displayStatus}
        </span>
        ${req.effectiveRejectionReason ? `<br><small style="color:#ef4444; font-weight:600; display:inline-block; margin-top:0.25rem;">Reason: ${escapeHtml(req.effectiveRejectionReason)}</small>` : ''}
      </td>
      <td><small style="color:var(--text-muted);">${formattedSub}</small></td>
    `;
    DOM.requestsTableBody.appendChild(tr);
  });
}

// Live countdown timer reference
let activeCountdownInterval = null;

/* ==========================================================
   3. LOAD ACTIVE OUTPASS & QR CODE
   ========================================================== */
async function loadActiveOutpass() {
  const token = getAuthToken();
  if (!token || !DOM.activePassContainer) return;

  try {
    const res = await fetch('/api/student/active-outpass', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      renderActivePass(data.hasActiveOutpass ? data.activeOutpass : null);
    } else {
      renderActivePassError(data.message || 'Unable to load active outpass.');
    }
  } catch (err) {
    console.error('Error fetching active outpass QR:', err);
    renderActivePassError('Unable to load active outpass.');
  }
}

function renderActivePassError(msg) {
  if (!DOM.activePassContainer) return;
  DOM.activePassContainer.innerHTML = `
    <div class="empty-state-box">
      <div class="empty-icon" style="background:rgba(239,68,68,0.15); color:#ef4444;">
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      </div>
      <h3 class="empty-title">Unable to load active outpass.</h3>
      <p class="empty-desc">${escapeHtml(msg)}</p>
      <button class="primary-btn" onclick="loadActiveOutpass()" style="margin-top:0.75rem;">
        <span>Retry</span>
      </button>
    </div>
  `;
}

function renderActivePass(pass) {
  if (!DOM.activePassContainer) return;

  if (activeCountdownInterval) {
    clearInterval(activeCountdownInterval);
    activeCountdownInterval = null;
  }

  if (!pass) {
    DOM.activePassContainer.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-icon" style="background:rgba(59,130,246,0.12); color:#3b82f6;">
          <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        </div>
        <h3 class="empty-title">No Active Outpass</h3>
        <p class="empty-desc">You do not have any active outpass at this time. Once your request is approved and the gate QR code is generated, it will be displayed here.</p>
        <button class="primary-btn" onclick="switchTab('new-outpass')" style="margin-top:0.75rem;">
          <span>Create New Outpass</span>
        </button>
      </div>
    `;
    return;
  }

  if (pass.computedStatus === 'COMPLETED' || pass.outpassStatus === 'COMPLETED' || pass.qrStatus === 'COMPLETED') {
    DOM.activePassContainer.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-icon" style="background:rgba(16,185,129,0.15); color:#10b981;">
          <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <h3 class="empty-title">Outpass Completed</h3>
        <p class="empty-desc">You are currently inside the hostel. Your previous gate checkout and check-in return has been officially verified by security and completed. You can view it in your request history.</p>
        <button class="primary-btn" onclick="switchTab('new-outpass')" style="margin-top:0.75rem;">
          <span>Submit New Request</span>
        </button>
      </div>
    `;
    return;
  }

  const computed = pass.computedStatus || pass.qrStatus || 'ACTIVE';
  let badgeClass = 'status-approved';
  let statusBadgeText = 'QR Active';
  let statusBannerColor = '#10b981';

  if (computed === 'NOT_YET_VALID') {
    badgeClass = 'status-pending-warden';
    statusBadgeText = 'Not Yet Valid';
    statusBannerColor = '#f59e0b';
  } else if (computed === 'EXPIRED') {
    badgeClass = 'status-expired';
    statusBadgeText = 'Expired';
    statusBannerColor = '#ef4444';
  } else if (computed === 'REVOKED') {
    badgeClass = 'status-rejected';
    statusBadgeText = 'Revoked';
    statusBannerColor = '#ef4444';
  } else if (computed === 'COMPLETED') {
    badgeClass = 'status-completed';
    statusBadgeText = 'Completed';
    statusBannerColor = '#3b82f6';
  } else {
    badgeClass = 'status-approved';
    statusBadgeText = 'QR Active';
    statusBannerColor = '#10b981';
  }

  DOM.activePassContainer.innerHTML = `
    <div class="form-card" style="border: 2px solid ${statusBannerColor}; max-width: 800px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.35);">
      
      <!-- Card Top Bar -->
      <div class="table-header-bar" style="border:none; padding:0 0 1.25rem 0; border-bottom: 1px solid var(--border-color);">
        <div>
          <span class="portal-badge" style="background:rgba(59,130,246,0.15); color:#60a5fa; font-weight:700;">
            ${pass.requestType === 'one_day_duty' || pass.requestType === 'One-Day Duty' ? '🎓 ONE-DAY DUTY' : '🏠 NORMAL OUTPASS'}
          </span>
          <h2 style="font-family:'Outfit'; font-size:1.5rem; margin-top:0.35rem; letter-spacing:0.02em;">
            DIGITAL GATE PASS: ${escapeHtml(pass.requestCode)}
          </h2>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Pass Status</div>
          <span class="status-badge ${badgeClass}" id="passStatusBadge" style="font-size:0.85rem; padding:0.25rem 0.75rem; margin-top:0.2rem; display:inline-block;">
            ${statusBadgeText}
          </span>
        </div>
      </div>

      <!-- Main Layout: QR Ticket + Live Countdown -->
      <div class="active-pass-grid">
        
        <!-- Left: QR Code Display Card -->
        <div class="qr-presentation-card">
          <div class="qr-white-frame">
            <img src="${pass.qrImageData}" alt="Outpass QR Code" />
          </div>

          <div style="margin-top:1.25rem; width:100%;">
            <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:0.25rem;">
              Security Token
            </div>
            <div style="font-family:monospace; font-size:0.72rem; color:var(--text-main); word-break:break-all; background:var(--bg-card); padding:0.4rem 0.5rem; border-radius:var(--radius-sm); border:1px solid var(--border-main);">
              ${escapeHtml(pass.qrData || pass.qrToken || 'HOSTEL-QR')}
            </div>
            <small style="color:var(--text-muted); display:block; margin-top:0.5rem; font-size:0.75rem;">
              Present this QR to Security Guard at Main Gate Checkpoint
            </small>
          </div>
        </div>

        <!-- Right: Countdown & Pass Details -->
        <div>
          <!-- Countdown Timer Display Box -->
          <div style="background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1.25rem 1.5rem; margin-bottom:1.5rem; text-align:center;">
            <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.08em;" id="timerLabel">
              REMAINING TIME
            </div>
            <div id="liveCountdownDisplay" style="font-family:'Outfit', monospace; font-size:2.4rem; font-weight:800; color:#10b981; letter-spacing:0.08em; margin:0.35rem 0;">
              00 : 00 : 00
            </div>
            <div style="font-size:0.82rem; color:var(--text-secondary);" id="timerSubtext">
              Valid Until: <strong>${formatDateTime(pass.validUntil || pass.returnDatetime)}</strong>
            </div>
          </div>

          <!-- Outpass Metadata Details Grid -->
          <div class="autofill-context-grid" style="grid-template-columns: 1fr 1fr; gap:0.75rem;">
            <div class="autofill-item">
              <span class="autofill-label">Student Name</span>
              <span class="autofill-val">${escapeHtml(pass.studentName)}</span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">Roll Number</span>
              <span class="autofill-val">${escapeHtml(pass.rollNumber || pass.studentRegNo)}</span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">Department</span>
              <span class="autofill-val">${escapeHtml(pass.department || pass.studentDept)}</span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">Room & Block</span>
              <span class="autofill-val">${escapeHtml(pass.hostelBlock || pass.studentBlock)} - ${escapeHtml(pass.roomNo || pass.studentRoom)}</span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">Place of Visit</span>
              <span class="autofill-val">${escapeHtml(pass.destination)}</span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">Purpose / Reason</span>
              <span class="autofill-val">${escapeHtml(pass.purpose)}</span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">Exit Time</span>
              <span class="autofill-val" style="color:${pass.exitTime ? '#10b981' : 'var(--text-secondary)'}; font-weight:700;">
                ${pass.exitTime ? formatDateTime(pass.exitTime) : 'Not Checked Out Yet'}
              </span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">Expected Return</span>
              <span class="autofill-val" style="font-weight:700;">${formatDateTime(pass.validUntil || pass.returnDatetime)}</span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">Current Hostel Status</span>
              <span class="autofill-val" style="color:${(pass.studentHostelStatus === 'OUTSIDE' || pass.exitTime) ? '#f59e0b' : '#10b981'}; font-weight:700;">
                ${(pass.studentHostelStatus === 'OUTSIDE' || pass.exitTime) ? 'OUTSIDE HOSTEL' : 'INSIDE HOSTEL'}
              </span>
            </div>
            <div class="autofill-item">
              <span class="autofill-label">QR Security Status</span>
              <span class="autofill-val" style="color:#60a5fa; font-weight:700;">${escapeHtml(pass.qrStatus || 'ACTIVE')}</span>
            </div>
          </div>

          <!-- Emergency Extension Section -->
          ${(() => {
            const isOutside = pass.studentHostelStatus === 'OUTSIDE' || Boolean(pass.exitTime);
            const isNotCompleted = pass.outpassStatus !== 'COMPLETED' && !pass.returnTime;
            const isRevoked = pass.qrStatus === 'REVOKED';

            if (!isOutside || !isNotCompleted || isRevoked) {
              return '';
            }

            const ext = pass.latestExtension;
            if (ext && ext.status === 'PENDING') {
              return `
                <div style="background:rgba(245,158,11,0.12); border:1px solid #f59e0b; border-radius:var(--radius-sm); padding:0.85rem 1rem; margin-top:1.25rem; display:flex; align-items:center; gap:0.75rem;">
                  <span style="font-size:1.3rem;">⏳</span>
                  <div style="flex:1;">
                    <div style="color:#f59e0b; font-weight:700; font-size:0.9rem;">Extension Request Pending Warden Review</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">
                      Requested New Return: <strong>${formatDateTime(ext.requestedUntil)}</strong><br>
                      Reason: <em>${escapeHtml(ext.reason)}</em>
                    </div>
                  </div>
                </div>
              `;
            } else if (ext && ext.status === 'APPROVED') {
              return `
                <div style="background:rgba(16,185,129,0.12); border:1px solid #10b981; border-radius:var(--radius-sm); padding:0.85rem 1rem; margin-top:1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem;">
                  <div style="display:flex; align-items:center; gap:0.75rem;">
                    <span style="font-size:1.3rem;">✅</span>
                    <div>
                      <div style="color:#10b981; font-weight:700; font-size:0.9rem;">Extension Approved by Warden</div>
                      <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">
                        New Return Deadline: <strong>${formatDateTime(pass.validUntil || pass.returnDatetime)}</strong> (Extended from ${formatDateTime(ext.previousReturnTime)})
                      </div>
                    </div>
                  </div>
                  <button class="secondary-btn" onclick="openExtensionModal('${pass.outpassId}', '${pass.validUntil || pass.returnDatetime}')" style="font-size:0.8rem; padding:0.4rem 0.85rem;">
                    <span>Request Further Extension</span>
                  </button>
                </div>
              `;
            } else if (ext && ext.status === 'REJECTED') {
              return `
                <div style="background:rgba(239,68,68,0.12); border:1px solid #ef4444; border-radius:var(--radius-sm); padding:0.85rem 1rem; margin-top:1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem;">
                  <div style="display:flex; align-items:center; gap:0.75rem;">
                    <span style="font-size:1.3rem;">❌</span>
                    <div>
                      <div style="color:#ef4444; font-weight:700; font-size:0.9rem;">Extension Request Rejected</div>
                      <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">
                        Reason: <em>${escapeHtml(ext.rejectionReason || 'Declined by Warden')}</em>
                      </div>
                    </div>
                  </div>
                  <button class="primary-btn" onclick="openExtensionModal('${pass.outpassId}', '${pass.validUntil || pass.returnDatetime}')" style="background:linear-gradient(135deg, #f59e0b, #d97706); font-size:0.8rem; padding:0.4rem 0.85rem;">
                    <span>Re-apply Extension</span>
                  </button>
                </div>
              `;
            } else {
              return `
                <div style="margin-top:1.25rem; display:flex; justify-content:flex-end;">
                  <button class="primary-btn" onclick="openExtensionModal('${pass.outpassId}', '${pass.validUntil || pass.returnDatetime}')" style="background:linear-gradient(135deg, #f59e0b, #d97706); padding:0.6rem 1.25rem; font-size:0.88rem; display:inline-flex; align-items:center; gap:0.5rem;">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span>Request Time Extension</span>
                  </button>
                </div>
              `;
            }
          })()}

        </div>

      </div>
    </div>
  `;

  // Start live tick countdown
  startCountdown(pass);
}

function startCountdown(pass) {
  const targetUntil = new Date(pass.validUntil || pass.returnDatetime).getTime();
  const targetFrom = new Date(pass.validFrom || pass.leavingDatetime).getTime();

  // Offset between client time and server time to ensure accurate server-referenced countdown
  const clientNow = Date.now();
  const serverNow = pass.serverTimestamp || clientNow;
  const timeOffset = serverNow - clientNow;

  function updateTimer() {
    const now = Date.now() + timeOffset;
    const timerElem = document.getElementById('liveCountdownDisplay');
    const labelElem = document.getElementById('timerLabel');
    const badgeElem = document.getElementById('passStatusBadge');
    if (!timerElem) return;

    if (pass.qrStatus === 'REVOKED') {
      if (labelElem) labelElem.textContent = 'SECURITY NOTICE';
      timerElem.innerHTML = `<span style="color:#ef4444; font-size:1.8rem;">QR Code Revoked</span>`;
      if (badgeElem) {
        badgeElem.textContent = 'Revoked';
        badgeElem.className = 'status-badge status-rejected';
      }
      if (activeCountdownInterval) clearInterval(activeCountdownInterval);
      return;
    }

    if (now < targetFrom) {
      if (labelElem) labelElem.textContent = 'STARTS IN (SCHEDULED DEPARTURE)';
      const diff = targetFrom - now;
      timerElem.innerHTML = `<span style="color:#f59e0b;">${formatHms(diff)}</span>`;
      if (badgeElem) {
        badgeElem.textContent = 'Not Yet Valid';
        badgeElem.className = 'status-badge status-pending-warden';
      }
    } else if (now >= targetFrom && now <= targetUntil) {
      if (labelElem) labelElem.textContent = 'REMAINING TIME';
      const diff = targetUntil - now;
      timerElem.innerHTML = `<span style="color:#10b981;">${formatHms(diff)}</span>`;
      if (badgeElem) {
        badgeElem.textContent = 'QR Active';
        badgeElem.className = 'status-badge status-approved';
      }
    } else {
      if (labelElem) labelElem.textContent = 'VALIDITY STATUS';
      timerElem.innerHTML = `<span style="color:#ef4444; font-size:1.8rem;">QR Code Expired</span>`;
      if (badgeElem) {
        badgeElem.textContent = 'Expired';
        badgeElem.className = 'status-badge status-expired';
      }
      if (activeCountdownInterval) clearInterval(activeCountdownInterval);
    }
  }

  updateTimer();
  activeCountdownInterval = setInterval(updateTimer, 1000);
}

function formatHms(ms) {
  if (ms <= 0) return '00 : 00 : 00';
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${pad(remHours)} : ${pad(mins)} : ${pad(secs)}`;
  }

  return `${pad(hours)} : ${pad(mins)} : ${pad(secs)}`;
}

/* ==========================================================
   4. NAVIGATION & TAB SWITCHING
   ========================================================== */
function initNavigation() {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.querySelector('.dash-sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('active');
    });
  }

  if (backdrop && sidebar) {
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('active');
    });
  }

  DOM.navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.dataset.tab;
      if (tabId) switchTab(tabId);
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    });
  });

  if (DOM.btnRefreshRequests) {
    DOM.btnRefreshRequests.addEventListener('click', async () => {
      await Promise.all([loadMyRequests(), loadStatusSummary(), loadActiveOutpass()]);
    });
  }

  // Support direct hash navigation and browser back/forward buttons
  window.addEventListener('hashchange', () => {
    const rawHash = window.location.hash.replace(/^#/, '');
    if (rawHash && rawHash !== activeTab) {
      switchTab(rawHash, false);
    }
  });

  // Listen for real-time notifications to auto-refresh active outpass & stats
  window.addEventListener('sh:notification:new', async () => {
    await Promise.all([loadActiveOutpass(), loadStatusSummary(), loadMyRequests()]);
  });

  // Initial hash check on page load
  const initialHash = window.location.hash.replace(/^#/, '');
  if (initialHash) {
    switchTab(initialHash, false);
  }
}

function switchTab(tabId, pushHash = true) {
  if (!tabId) return;
  const targetSection = document.getElementById(`tab-${tabId}`);
  if (!targetSection) return;

  activeTab = tabId;

  DOM.navButtons.forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  DOM.tabSections.forEach(sec => {
    if (sec.id === `tab-${tabId}`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  const sidebar = document.querySelector('.dash-sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');

  if (pushHash && window.location.hash !== `#${tabId}`) {
    history.pushState(null, '', `#${tabId}`);
  }

  // If navigating to Active Outpass, refresh active outpass data
  if (tabId === 'active-outpass') {
    loadActiveOutpass();
  } else if (tabId === 'my-requests' || tabId === 'request-status') {
    loadMyRequests();
    loadStatusSummary();
  }
}

window.switchTab = switchTab;

/* ==========================================================
   5. REQUEST TYPE SELECTOR (Normal vs One-Day Duty)
   ========================================================== */
function initTypeSelector() {
  if (DOM.typeOptionNormal) {
    DOM.typeOptionNormal.addEventListener('click', () => selectRequestType('normal'));
  }
  if (DOM.typeOptionDuty) {
    DOM.typeOptionDuty.addEventListener('click', () => selectRequestType('one_day_duty'));
  }
}

function selectRequestType(type) {
  const workflowTitle = document.getElementById('workflowTitle');
  const stepMiddleLabel = document.getElementById('stepMiddleLabel');
  const stepFinalLabel = document.getElementById('stepFinalLabel');

  if (type === 'one_day_duty') {
    if (DOM.radioDuty) DOM.radioDuty.checked = true;
    if (DOM.typeOptionDuty) DOM.typeOptionDuty.classList.add('selected');
    if (DOM.typeOptionNormal) DOM.typeOptionNormal.classList.remove('selected');
    if (DOM.dutyFieldsBox) DOM.dutyFieldsBox.classList.remove('hidden');

    if (workflowTitle) workflowTitle.textContent = 'Approval Workflow Routing (One-Day Duty: Student → Class Advisor → Principal → QR)';
    if (stepMiddleLabel) stepMiddleLabel.textContent = 'Class Advisor Verification';
    if (stepFinalLabel) stepFinalLabel.textContent = 'Principal Final Approval';
  } else {
    if (DOM.radioNormal) DOM.radioNormal.checked = true;
    if (DOM.typeOptionNormal) DOM.typeOptionNormal.classList.add('selected');
    if (DOM.typeOptionDuty) DOM.typeOptionDuty.classList.remove('selected');
    if (DOM.dutyFieldsBox) DOM.dutyFieldsBox.classList.add('hidden');

    if (workflowTitle) workflowTitle.textContent = 'Approval Workflow Routing (Normal Outpass: Student → Parent → Warden → QR)';
    if (stepMiddleLabel) stepMiddleLabel.textContent = 'Parent Consent';
    if (stepFinalLabel) stepFinalLabel.textContent = 'Warden Final Approval';
  }

  checkAdvanceTimeValidity();
}

/**
 * Validates whether the selected departure time satisfies advance-time rules:
 * - Normal Outpass: >= 18 hours in advance
 * - One-Day Outpass / Duty: >= 12 hours in advance
 * Updates the UX banner and enables/disables the Submit button accordingly.
 */
function checkAdvanceTimeValidity() {
  const shouldUpdateSubmitButton = arguments.length > 0 ? arguments[0] : true;
  const isDuty = DOM.radioDuty && DOM.radioDuty.checked;
  const requiredHours = isDuty ? 12 : 18;
  const typeLabel = isDuty ? 'One-Day' : 'Normal';

  const leavingDate = DOM.inputLeavingDate ? DOM.inputLeavingDate.value : '';
  const leavingTime = DOM.inputLeavingTime ? DOM.inputLeavingTime.value : '';

  if (!leavingDate || !leavingTime) {
    if (DOM.advanceTimeNoticeBox && DOM.advanceNoticeText) {
      DOM.advanceTimeNoticeBox.style.background = 'rgba(56, 189, 248, 0.08)';
      DOM.advanceTimeNoticeBox.style.borderColor = 'rgba(56, 189, 248, 0.35)';
      if (DOM.advanceNoticeIcon) DOM.advanceNoticeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="#38bdf8" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
      if (DOM.advanceNoticeTitle) {
        DOM.advanceNoticeTitle.textContent = 'Advance Notice Required';
        DOM.advanceNoticeTitle.style.color = 'var(--text-primary, #f8fafc)';
      }
      DOM.advanceNoticeText.textContent = `${typeLabel} outpass requests must be submitted at least ${requiredHours} hours before departure.`;
      DOM.advanceNoticeText.style.color = 'var(--text-secondary, #94a3b8)';
    }
    if (shouldUpdateSubmitButton) updateSubmitButtonState();
    return true;
  }

  const cleanTime = leavingTime.length === 5 ? `${leavingTime}:00` : leavingTime;
  const departureDate = new Date(`${leavingDate} ${cleanTime}`);
  if (isNaN(departureDate.getTime())) {
    if (shouldUpdateSubmitButton) updateSubmitButtonState();
    return true;
  }

  const now = new Date();
  const departureMs = departureDate.getTime();
  const currentMs = now.getTime();
  const requiredMs = requiredHours * 3600 * 1000;
  const latestSubmitMs = departureMs - requiredMs;
  const latestSubmitDate = new Date(latestSubmitMs);

  // Allowed ONLY when current_time <= required_submit_time
  const isExpired = currentMs > latestSubmitMs;

  if (isExpired) {
    if (DOM.advanceTimeNoticeBox) {
      DOM.advanceTimeNoticeBox.style.background = 'rgba(239, 68, 68, 0.12)';
      DOM.advanceTimeNoticeBox.style.borderColor = '#ef4444';
    }
    if (DOM.advanceNoticeIcon) {
      DOM.advanceNoticeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="#ef4444" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    }
    if (DOM.advanceNoticeTitle) {
      DOM.advanceNoticeTitle.textContent = 'Submission Time Expired';
      DOM.advanceNoticeTitle.style.color = '#ef4444';
    }
    if (DOM.advanceNoticeText) {
      DOM.advanceNoticeText.textContent = `Submission time expired. ${typeLabel} outpass requests must be submitted at least ${requiredHours} hours before departure.`;
      DOM.advanceNoticeText.style.color = '#fca5a5';
    }
    if (shouldUpdateSubmitButton) updateSubmitButtonState();
    return false;
  } else {
    if (DOM.advanceTimeNoticeBox) {
      DOM.advanceTimeNoticeBox.style.background = 'rgba(16, 185, 129, 0.08)';
      DOM.advanceTimeNoticeBox.style.borderColor = 'rgba(16, 185, 129, 0.35)';
    }
    if (DOM.advanceNoticeIcon) {
      DOM.advanceNoticeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="#10b981" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    }
    if (DOM.advanceNoticeTitle) {
      DOM.advanceNoticeTitle.textContent = 'Advance Notice Requirement Met';
      DOM.advanceNoticeTitle.style.color = 'var(--text-primary, #f8fafc)';
    }
    if (DOM.advanceNoticeText) {
      const formattedLatest = latestSubmitDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' + latestSubmitDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      DOM.advanceNoticeText.textContent = `Request must be submitted at least ${requiredHours} hours before departure. (Latest allowed submission: ${formattedLatest})`;
      DOM.advanceNoticeText.style.color = 'var(--text-secondary, #94a3b8)';
    }
    if (shouldUpdateSubmitButton) updateSubmitButtonState();
    return true;
  }
}

/**
 * Synchronizes the submit button state with both:
 * 1. Mandatory Student GPS location readiness (currentStudentLocationState === 'ready')
 * 2. Advance time rules (Normal: >=18h, One-Day: >=12h)
 *
 * When location is NOT READY:
 * - Button is disabled, visually muted (opacity: 0.6), non-clickable (cursor: not-allowed)
 * - #submitLocationNotice is displayed with informative status
 *
 * When location IS READY and advance time is met:
 * - Button is enabled, opacity: 1, cursor: pointer
 * - #submitLocationNotice is hidden
 */
function updateSubmitButtonState() {
  if (!DOM.btnSubmitOutpass) return;

  const isAdvanceValid = checkAdvanceTimeValidity(false);

  if (!isAdvanceValid) {
    DOM.btnSubmitOutpass.disabled = true;
    DOM.btnSubmitOutpass.style.opacity = '0.6';
    DOM.btnSubmitOutpass.style.cursor = 'not-allowed';
  } else {
    DOM.btnSubmitOutpass.disabled = false;
    DOM.btnSubmitOutpass.style.opacity = '1';
    DOM.btnSubmitOutpass.style.cursor = 'pointer';
  }
}

/* ==========================================================
   6. OUTPASS FORM SUBMISSION & VALIDATION
   ========================================================== */
function initFormHandler() {
  if (!DOM.outpassForm) return;

  DOM.outpassForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isDuty = DOM.radioDuty && DOM.radioDuty.checked;
    const request_type = isDuty ? 'one_day_duty' : 'normal';

    const destination = DOM.inputDestination.value.trim();
    const reason = DOM.inputReason.value.trim();
    const student_phone = DOM.inputPhone.value.trim();
    const leaving_date = DOM.inputLeavingDate.value;
    const leaving_time = DOM.inputLeavingTime.value;
    const expected_return_date = DOM.inputReturnDate.value;
    const expected_return_time = DOM.inputReturnTime.value;

    const event_name = DOM.inputEventName ? DOM.inputEventName.value.trim() : '';
    const event_location = DOM.inputEventLocation ? DOM.inputEventLocation.value.trim() : '';
    const duty_date = DOM.inputDutyDate ? DOM.inputDutyDate.value : '';
    const duty_description = DOM.inputDutyDesc ? DOM.inputDutyDesc.value.trim() : '';

    // Validation
    if (!destination) {
      showFormMessage('Please enter the destination / place of visit.', 'error');
      DOM.inputDestination.focus();
      return;
    }

    if (!reason) {
      showFormMessage('Please provide the purpose of your visit.', 'error');
      DOM.inputReason.focus();
      return;
    }

    if (!leaving_date || !leaving_time) {
      showFormMessage('Please specify the leaving date and leaving time.', 'error');
      return;
    }

    if (!expected_return_date || !expected_return_time) {
      showFormMessage('Please specify the expected return date and return time.', 'error');
      return;
    }

    // Time validation: Return must be later than Leaving
    const fromDate = new Date(`${leaving_date} ${leaving_time}`);
    const toDate = new Date(`${expected_return_date} ${expected_return_time}`);

    if (toDate <= fromDate) {
      showFormMessage('Expected return date & time must be strictly later than leaving date & time.', 'error');
      DOM.inputReturnTime.focus();
      return;
    }

    // Advance-time validation (18h for normal, 12h for duty)
    if (!checkAdvanceTimeValidity(false)) {
      const requiredHours = isDuty ? 12 : 18;
      const typeLabel = isDuty ? 'One-Day' : 'Normal';
      showFormMessage(`Submission time expired. ${typeLabel} outpass requests must be submitted at least ${requiredHours} hours before departure.`, 'error');
      return;
    }

    // One-Day Duty specific validation
    if (isDuty) {
      if (!event_name) {
        showFormMessage('Please select or specify the Event / Duty Name.', 'error');
        if (DOM.inputEventName) DOM.inputEventName.focus();
        return;
      }
      if (!event_location) {
        showFormMessage('Please specify the Event Location / Venue.', 'error');
        if (DOM.inputEventLocation) DOM.inputEventLocation.focus();
        return;
      }
      if (!duty_date) {
        showFormMessage('Please select the Duty Date.', 'error');
        return;
      }
    }

    setFormLoading(true);
    hideFormMessage();

    const payload = {
      request_type,
      destination,
      reason,
      student_phone,
      leaving_date,
      leaving_time,
      expected_return_date,
      expected_return_time,
      event_name: isDuty ? event_name : undefined,
      event_location: isDuty ? event_location : undefined,
      duty_date: isDuty ? duty_date : undefined,
      duty_description: isDuty ? duty_description : undefined
    };

    const token = getAuthToken();

    try {
      const res = await fetch('/api/outpass', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showFormMessage(`🎉 ${data.message} Request Code: ${data.data.requestCode} (${data.data.status})`, 'success');
        DOM.outpassForm.reset();
        selectRequestType('normal');
        setDefaultDates();

        // Refresh stats & list
        await Promise.all([loadStatusSummary(), loadMyRequests()]);

        // Auto switch to My Requests tab after 1.2s
        setTimeout(() => {
          switchTab('my-requests');
          hideFormMessage();
        }, 1200);

      } else {
        if (data && data.code === 'ADVANCE_TIME_LIMIT') {
          checkAdvanceTimeValidity();
        }
        showFormMessage(data.message || 'Failed to submit outpass request. Please check your inputs.', 'error');
      }
    } catch (err) {
      showFormMessage('Server connection error: ' + err.message, 'error');
    } finally {
      setFormLoading(false);
    }
  });

  // Attach live validation on departure date & time changes
  if (DOM.inputLeavingDate) {
    DOM.inputLeavingDate.addEventListener('change', checkAdvanceTimeValidity);
    DOM.inputLeavingDate.addEventListener('input', checkAdvanceTimeValidity);
  }
  if (DOM.inputLeavingTime) {
    DOM.inputLeavingTime.addEventListener('change', checkAdvanceTimeValidity);
    DOM.inputLeavingTime.addEventListener('input', checkAdvanceTimeValidity);
  }
}

function setFormLoading(isLoading) {
  if (!DOM.btnSubmitOutpass) return;
  DOM.btnSubmitOutpass.disabled = isLoading;
  if (isLoading) {
    if (DOM.submitSpinner) DOM.submitSpinner.classList.remove('hidden');
    if (DOM.submitBtnText) DOM.submitBtnText.textContent = 'Submitting Request...';
  } else {
    if (DOM.submitSpinner) DOM.submitSpinner.classList.add('hidden');
    if (DOM.submitBtnText) DOM.submitBtnText.textContent = 'Submit Outpass Request';
    updateSubmitButtonState();
  }
}

function showFormMessage(msg, type = 'info') {
  if (!DOM.formMessage) return;
  DOM.formMessage.className = `form-alert ${type}`;
  DOM.formMessage.textContent = msg;
  DOM.formMessage.classList.remove('hidden');
}

function hideFormMessage() {
  if (!DOM.formMessage) return;
  DOM.formMessage.classList.add('hidden');
}

/* ==========================================================
   7. DATE & TIME UTILITIES
   ========================================================== */
function setDefaultDates() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');

  // Normal outpass requires 18 hours in advance, One-Day requires 12 hours.
  // Default leaving time: tomorrow (current time + 24 hours), rounded to hour
  const defaultLeave = new Date(now.getTime() + 24 * 3600 * 1000);
  const leaveDateStr = `${defaultLeave.getFullYear()}-${pad(defaultLeave.getMonth() + 1)}-${pad(defaultLeave.getDate())}`;
  const leaveTimeStr = `${pad(defaultLeave.getHours())}:00`;

  // Default return time: 8 hours after departure
  const defaultReturn = new Date(defaultLeave.getTime() + 8 * 3600 * 1000);
  const returnDateStr = `${defaultReturn.getFullYear()}-${pad(defaultReturn.getMonth() + 1)}-${pad(defaultReturn.getDate())}`;
  const returnTimeStr = `${pad(defaultReturn.getHours())}:00`;

  if (DOM.inputLeavingDate) DOM.inputLeavingDate.value = leaveDateStr;
  if (DOM.inputLeavingTime) DOM.inputLeavingTime.value = leaveTimeStr;
  if (DOM.inputReturnDate) DOM.inputReturnDate.value = returnDateStr;
  if (DOM.inputReturnTime) DOM.inputReturnTime.value = returnTimeStr;
  if (DOM.inputDutyDate) DOM.inputDutyDate.value = leaveDateStr;

  // Set minimum date to today
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (DOM.inputLeavingDate) DOM.inputLeavingDate.min = todayStr;
  if (DOM.inputReturnDate) DOM.inputReturnDate.min = todayStr;
  if (DOM.inputDutyDate) DOM.inputDutyDate.min = todayStr;

  checkAdvanceTimeValidity();
}

function formatDateTime(dtStr) {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return dtStr;

  const options = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  };
  return d.toLocaleString('en-US', options);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================================
   8. AUTH & THEME MANAGEMENT
   ========================================================== */
function initLogout() {
  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', async () => {
      const token = getAuthToken();
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      }
      clearAuthAndRedirect();
    });
  }
}

function clearAuthAndRedirect() {
  localStorage.removeItem('sh_token');
  localStorage.removeItem('sh_user');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('sh_token');
  sessionStorage.removeItem('sh_user');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  window.location.href = '/index.html';
}

function initTheme() {
  const savedTheme = localStorage.getItem('sh_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('sh_theme', next);
    });
  }
}

/* ==========================================================
   9. EMERGENCY TIME EXTENSION MODAL CONTROLLER
   ========================================================== */
let activeExtensionPassId = null;
let currentPassReturnDatetime = null;

window.openExtensionModal = function(outpassId, currentReturnTime) {
  activeExtensionPassId = outpassId;
  currentPassReturnDatetime = new Date(currentReturnTime);

  const modal = document.getElementById('extensionModal');
  const curDisplay = document.getElementById('extCurrentReturnDisplay');
  const dateInput = document.getElementById('extNewReturnDate');
  const timeInput = document.getElementById('extNewReturnTime');
  const alertBox = document.getElementById('extModalAlert');

  if (curDisplay) {
    curDisplay.textContent = formatDateTime(currentReturnTime);
  }

  // Pre-fill target date/time as current return + 2 hours
  const target = new Date(currentPassReturnDatetime.getTime() + 2 * 3600 * 1000);
  if (dateInput) {
    dateInput.value = target.toISOString().split('T')[0];
    dateInput.min = currentPassReturnDatetime.toISOString().split('T')[0];
  }
  if (timeInput) {
    timeInput.value = target.toTimeString().slice(0, 5);
  }

  if (alertBox) {
    alertBox.className = 'form-alert hidden';
    alertBox.textContent = '';
  }

  if (modal) {
    modal.style.display = 'flex';
  }
};

window.closeExtensionModal = function() {
  const modal = document.getElementById('extensionModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

window.addQuickExtensionHours = function(hours) {
  if (!currentPassReturnDatetime) return;
  const target = new Date(currentPassReturnDatetime.getTime() + hours * 3600 * 1000);
  const dateInput = document.getElementById('extNewReturnDate');
  const timeInput = document.getElementById('extNewReturnTime');

  if (dateInput) dateInput.value = target.toISOString().split('T')[0];
  if (timeInput) timeInput.value = target.toTimeString().slice(0, 5);
};

window.handleExtReasonChange = function(val) {
  const reasonText = document.getElementById('extReasonText');
  if (!reasonText) return;
  if (val !== 'custom') {
    reasonText.value = val;
  } else {
    reasonText.value = '';
    reasonText.focus();
  }
};

window.handleExtensionFormSubmit = async function(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return clearAuthAndRedirect();

  const dateInput = document.getElementById('extNewReturnDate');
  const timeInput = document.getElementById('extNewReturnTime');
  const reasonText = document.getElementById('extReasonText');
  const alertBox = document.getElementById('extModalAlert');
  const submitBtn = document.getElementById('btnSubmitExtension');

  const dateVal = dateInput ? dateInput.value : '';
  const timeVal = timeInput ? timeInput.value : '';
  const reasonVal = reasonText ? reasonText.value.trim() : '';

  if (!dateVal || !timeVal) {
    showExtAlert('Please specify a valid return date and time.', 'error');
    return;
  }

  const requestedUntil = new Date(`${dateVal}T${timeVal}:00`);
  if (isNaN(requestedUntil.getTime())) {
    showExtAlert('Invalid date or time format selected.', 'error');
    return;
  }

  if (currentPassReturnDatetime && requestedUntil.getTime() <= currentPassReturnDatetime.getTime()) {
    showExtAlert('Requested new return time must be strictly later than your current scheduled return time.', 'error');
    return;
  }

  if (!reasonVal) {
    showExtAlert('Please provide a reason explaining the extension requirement.', 'error');
    return;
  }

  try {
    if (submitBtn) submitBtn.disabled = true;
    showExtAlert('Submitting extension request to Warden...', 'info');

    const res = await fetch('/api/extension/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        requested_until: requestedUntil.toISOString().slice(0, 19).replace('T', ' '),
        reason: reasonVal
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showExtAlert(data.message || 'Failed to submit extension request.', 'error');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    showExtAlert('✅ Emergency extension requested successfully! Awaiting Warden approval.', 'success');
    
    setTimeout(() => {
      closeExtensionModal();
      if (submitBtn) submitBtn.disabled = false;
      loadActiveOutpass();
      loadRequests();
    }, 1200);

  } catch (err) {
    showExtAlert('Network error submitting extension request. Please retry.', 'error');
    if (submitBtn) submitBtn.disabled = false;
  }
};

function showExtAlert(msg, type) {
  const alertBox = document.getElementById('extModalAlert');
  if (!alertBox) return;
  alertBox.className = `form-alert ${type}`;
  alertBox.textContent = msg;
}



function formatTime(dtStr) {
  if (!dtStr) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return String(dtStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function showToast(message, type = 'success') {
  let container = DOM.toastContainer || document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-title">${type === 'error' ? 'Notice' : type === 'warning' ? 'Alert' : 'Success'}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}
window.showToast = showToast;

/* ==========================================================
   EMERGENCY TIME EXTENSION MODAL CONTROLLER
   ========================================================== */
let currentExtOutpassId = null;
let currentExtReturnTime = null;

function openExtensionModal(outpassId, currentReturnTime) {
  currentExtOutpassId = outpassId;
  currentExtReturnTime = currentReturnTime;

  const modal = document.getElementById('extensionModal');
  const currentReturnDisplay = document.getElementById('extCurrentReturnDisplay');
  const dateInput = document.getElementById('extNewReturnDate');
  const timeInput = document.getElementById('extNewReturnTime');
  const reasonSelect = document.getElementById('extReasonSelect');
  const reasonText = document.getElementById('extReasonText');
  const alertBox = document.getElementById('extModalAlert');

  if (alertBox) {
    alertBox.className = 'form-alert hidden';
    alertBox.textContent = '';
  }

  if (currentReturnDisplay) {
    currentReturnDisplay.textContent = formatDateTime(currentReturnTime);
  }

  const baseDate = new Date(currentReturnTime);
  const validBase = isNaN(baseDate.getTime()) ? new Date() : baseDate;
  // Default suggested time: 2 hours after scheduled return
  const suggested = new Date(validBase.getTime() + 2 * 3600 * 1000);

  if (dateInput) {
    dateInput.value = formatLocalDate(suggested);
    dateInput.min = formatLocalDate(validBase);
  }

  if (timeInput) {
    timeInput.value = formatLocalTime(suggested);
  }

  if (reasonSelect) reasonSelect.value = '';
  if (reasonText) reasonText.value = '';

  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeExtensionModal() {
  const modal = document.getElementById('extensionModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function addQuickExtensionHours(hours) {
  const dateInput = document.getElementById('extNewReturnDate');
  const timeInput = document.getElementById('extNewReturnTime');
  if (!dateInput || !timeInput || !currentExtReturnTime) return;

  const base = new Date(currentExtReturnTime);
  const validBase = isNaN(base.getTime()) ? new Date() : base;
  const newDate = new Date(validBase.getTime() + hours * 3600 * 1000);

  dateInput.value = formatLocalDate(newDate);
  timeInput.value = formatLocalTime(newDate);
}

function handleExtReasonChange(value) {
  const reasonText = document.getElementById('extReasonText');
  if (!reasonText) return;

  if (value === 'custom') {
    reasonText.value = '';
    reasonText.focus();
  } else if (value) {
    reasonText.value = value;
  }
}

async function handleExtensionFormSubmit(event) {
  if (event) event.preventDefault();

  const alertBox = document.getElementById('extModalAlert');
  const dateInput = document.getElementById('extNewReturnDate');
  const timeInput = document.getElementById('extNewReturnTime');
  const reasonText = document.getElementById('extReasonText');
  const submitBtn = document.getElementById('btnSubmitExtension');

  if (!dateInput || !timeInput || !reasonText) return;

  const dateVal = dateInput.value.trim();
  const timeVal = timeInput.value.trim();
  const reasonVal = reasonText.value.trim();

  if (!dateVal || !timeVal) {
    showExtAlert('Please choose a valid new return date and time.', 'error');
    return;
  }

  if (!reasonVal) {
    showExtAlert('Please provide a reason for the extension request.', 'error');
    return;
  }

  const requestedTarget = new Date(`${dateVal}T${timeVal}`);
  if (isNaN(requestedTarget.getTime())) {
    showExtAlert('Invalid date/time format.', 'error');
    return;
  }

  const currentReturnDate = new Date(currentExtReturnTime);
  if (requestedTarget.getTime() <= currentReturnDate.getTime()) {
    showExtAlert('Requested return time must be later than your current scheduled return time.', 'error');
    return;
  }

  const token = getAuthToken();
  if (!token) {
    showExtAlert('Authentication required. Please log in.', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  try {
    const res = await fetch('/api/extension-requests', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        outpass_id: currentExtOutpassId,
        requested_extension_until: requestedTarget.toISOString(),
        reason: reasonVal
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeExtensionModal();
      showToast('Extension request submitted successfully. Awaiting Warden approval.', 'success');
      await loadActiveOutpass();
    } else {
      showExtAlert(data.message || 'Failed to submit extension request.', 'error');
    }
  } catch (err) {
    console.error('Error submitting extension request:', err);
    showExtAlert('Network error submitting request. Please try again.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Extension Request';
    }
  }
}

function showExtAlert(msg, type = 'error') {
  const alertBox = document.getElementById('extModalAlert');
  if (!alertBox) return;
  alertBox.className = `form-alert ${type}`;
  alertBox.textContent = msg;
  alertBox.classList.remove('hidden');
}

// Attach to window for inline HTML onclick/onsubmit access
window.openExtensionModal = openExtensionModal;
window.closeExtensionModal = closeExtensionModal;
window.addQuickExtensionHours = addQuickExtensionHours;
window.handleExtReasonChange = handleExtReasonChange;
window.handleExtensionFormSubmit = handleExtensionFormSubmit;

// Real-time listener for notification events on the student dashboard
window.addEventListener('sh:notification:new', (e) => {
  const notif = e.detail;
  if (notif && (notif.type === 'EXTENSION_APPROVED' || notif.type === 'EXTENSION_REJECTED' || notif.type === 'EXIT_RECORDED')) {
    loadActiveOutpass();
    loadStudentRequests();
  }
});

/* ==========================================================
   STUDENT PROFILE: FIRST-TIME SETUP & PROFILE EDIT
   ========================================================== */

function openFirstTimeProfileModal(student) {
  const modal = document.getElementById('firstTimeProfileModal');
  if (!modal) return;
  modal.style.display = 'flex';

  if (student) {
    const elName = document.getElementById('firstSetupName');
    const elReg = document.getElementById('firstSetupRegNo');
    const elDept = document.getElementById('firstSetupDept');
    const elYear = document.getElementById('firstSetupYear');
    const elSem = document.getElementById('firstSetupSem');
    const elBlock = document.getElementById('firstSetupBlock');
    const elRoom = document.getElementById('firstSetupRoom');
    const elPhone = document.getElementById('firstSetupPhone');
    const elParentName = document.getElementById('firstSetupParentName');
    const elParentPhone = document.getElementById('firstSetupParentPhone');
    const elRel = document.getElementById('firstSetupRelationship');

    if (elName && !elName.value) elName.value = student.name || '';
    if (elReg) elReg.value = student.reg_no || student.identifier || '';
    if (elDept && student.department) elDept.value = student.department;
    if (elYear && student.year_of_study) elYear.value = String(student.year_of_study);
    if (elSem && student.semester) elSem.value = student.semester;
    if (elBlock && student.hostel_block) elBlock.value = student.hostel_block;
    if (elRoom && !elRoom.value) elRoom.value = student.room_no || '';
    if (elPhone && !elPhone.value) elPhone.value = student.phone || '';
    if (elParentName && !elParentName.value) elParentName.value = student.parent_name || '';
    if (elParentPhone && !elParentPhone.value) elParentPhone.value = student.parent_phone || '';
    if (elRel && student.parent_relationship) elRel.value = student.parent_relationship;
  }
}

function closeFirstTimeProfileModal() {
  const modal = document.getElementById('firstTimeProfileModal');
  if (modal) modal.style.display = 'none';
}

function autoPopulateSemester(yearVal, semSelectId) {
  const semSelect = document.getElementById(semSelectId);
  if (!semSelect) return;
  const y = parseInt(yearVal, 10);
  if (y >= 1 && y <= 4) {
    semSelect.value = `Semester ${y * 2}`;
  }
}

async function handleFirstTimeProfileSubmit(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const alertBox = document.getElementById('firstSetupAlert');
  const submitBtn = document.getElementById('btnSaveFirstSetup');

  const name = document.getElementById('firstSetupName')?.value?.trim();
  const department = document.getElementById('firstSetupDept')?.value?.trim();
  const year_of_study = document.getElementById('firstSetupYear')?.value;
  const semester = document.getElementById('firstSetupSem')?.value?.trim();
  const hostel_block = document.getElementById('firstSetupBlock')?.value?.trim();
  const room_no = document.getElementById('firstSetupRoom')?.value?.trim();
  const phone = document.getElementById('firstSetupPhone')?.value?.trim();
  const parent_name = document.getElementById('firstSetupParentName')?.value?.trim();
  const parent_phone = document.getElementById('firstSetupParentPhone')?.value?.trim();
  const relationship = document.getElementById('firstSetupRelationship')?.value?.trim();

  if (!name || !department || !year_of_study || !semester || !hostel_block || !room_no || !parent_name || !parent_phone || !relationship) {
    if (alertBox) {
      alertBox.className = 'form-alert error';
      alertBox.textContent = 'Please complete all required fields.';
      alertBox.classList.remove('hidden');
    }
    return;
  }

  const cleanParentPhone = parent_phone.replace(/\D/g, '');
  if (cleanParentPhone.length < 10) {
    if (alertBox) {
      alertBox.className = 'form-alert error';
      alertBox.textContent = 'Please enter a valid 10-digit parent mobile number.';
      alertBox.classList.remove('hidden');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Saving Profile...</span>';
  }

  try {
    const res = await fetch('/api/student/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        department,
        year_of_study: parseInt(year_of_study, 10),
        semester,
        hostel_block,
        room_no,
        phone,
        parent_name,
        parent_phone: cleanParentPhone,
        relationship
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (data.student) {
        currentStudent = {
          ...currentStudent,
          ...data.student,
          parent_name: data.parent?.name,
          parent_phone: data.parent?.mobile || data.parent?.phone,
          parent_relationship: data.parent?.relationship,
          profile_completed: true,
          profileCompleted: true
        };
      }
      populateStudentHeader(currentStudent);
      closeFirstTimeProfileModal();
      showToast('✓ Profile updated successfully! Welcome to your dashboard.', 'success');
    } else {
      if (alertBox) {
        alertBox.className = 'form-alert error';
        alertBox.textContent = data.message || 'Failed to update profile.';
        alertBox.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Error saving profile:', err);
    if (alertBox) {
      alertBox.className = 'form-alert error';
      alertBox.textContent = 'Network error. Please try again.';
      alertBox.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Save Profile & Enter Dashboard</span>';
    }
  }
}

function toggleProfileEditMode(isEditing) {
  const viewContainer = document.getElementById('profileViewContainer');
  const editContainer = document.getElementById('profileEditContainer');
  const alertBox = document.getElementById('profileEditAlert');
  if (alertBox) alertBox.classList.add('hidden');

  if (isEditing) {
    if (viewContainer) viewContainer.classList.add('hidden');
    if (editContainer) editContainer.classList.remove('hidden');

    if (currentStudent) {
      const elName = document.getElementById('editProfName');
      const elReg = document.getElementById('editProfReg');
      const elDept = document.getElementById('editProfDept');
      const elYear = document.getElementById('editProfYear');
      const elSem = document.getElementById('editProfSem');
      const elBlock = document.getElementById('editProfBlock');
      const elRoom = document.getElementById('editProfRoom');
      const elPhone = document.getElementById('editProfPhone');
      const elParentName = document.getElementById('editProfParentName');
      const elParentPhone = document.getElementById('editProfParentPhone');
      const elRel = document.getElementById('editProfRelationship');

      if (elName) elName.value = currentStudent.name || '';
      if (elReg) elReg.value = currentStudent.reg_no || currentStudent.identifier || '';
      if (elDept && currentStudent.department) elDept.value = currentStudent.department;
      if (elYear && currentStudent.year_of_study) elYear.value = String(currentStudent.year_of_study);
      if (elSem && currentStudent.semester) elSem.value = currentStudent.semester;
      if (elBlock && currentStudent.hostel_block) elBlock.value = currentStudent.hostel_block;
      if (elRoom) elRoom.value = currentStudent.room_no || '';
      if (elPhone) elPhone.value = currentStudent.phone || '';
      if (elParentName) elParentName.value = currentStudent.parent_name || '';
      if (elParentPhone) elParentPhone.value = currentStudent.parent_phone || '';
      if (elRel && currentStudent.parent_relationship) elRel.value = currentStudent.parent_relationship;

      // Lock identity fields once profile has been completed
      const isLocked = Boolean(currentStudent.profile_completed || currentStudent.profileCompleted);

      const applyLock = (inputEl) => {
        if (!inputEl) return;
        if (isLocked) {
          inputEl.readOnly = true;
          if (inputEl.tagName === 'SELECT') {
            inputEl.disabled = true;
          }
          inputEl.style.opacity = '0.75';
          inputEl.style.cursor = 'not-allowed';
          inputEl.style.background = 'var(--bg-surface)';
        } else {
          inputEl.readOnly = false;
          inputEl.disabled = false;
          inputEl.style.opacity = '1';
          inputEl.style.cursor = 'auto';
          inputEl.style.background = 'var(--bg-input)';
        }
      };

      applyLock(elName);
      applyLock(elDept);
      applyLock(elPhone);
      applyLock(elParentName);
      applyLock(elParentPhone);
    }
  } else {
    if (editContainer) editContainer.classList.add('hidden');
    if (viewContainer) viewContainer.classList.remove('hidden');
  }
}

async function handleProfileEditSubmit(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const alertBox = document.getElementById('profileEditAlert');
  const submitBtn = document.getElementById('btnSaveProfileEdit');

  const isLocked = Boolean(currentStudent?.profile_completed || currentStudent?.profileCompleted);

  const name = isLocked ? (currentStudent.name || '').trim() : document.getElementById('editProfName')?.value?.trim();
  const department = isLocked ? (currentStudent.department || '').trim() : document.getElementById('editProfDept')?.value?.trim();
  const phone = isLocked ? (currentStudent.phone || '').trim() : document.getElementById('editProfPhone')?.value?.trim();
  const parent_name = isLocked ? (currentStudent.parent_name || '').trim() : document.getElementById('editProfParentName')?.value?.trim();
  const parent_phone = isLocked ? (currentStudent.parent_phone || '').trim() : document.getElementById('editProfParentPhone')?.value?.trim();

  const year_of_study = document.getElementById('editProfYear')?.value;
  const semester = document.getElementById('editProfSem')?.value?.trim();
  const hostel_block = document.getElementById('editProfBlock')?.value?.trim();
  const room_no = document.getElementById('editProfRoom')?.value?.trim();
  const relationship = document.getElementById('editProfRelationship')?.value?.trim();

  if (!name || !department || !year_of_study || !semester || !hostel_block || !room_no || !parent_name || !parent_phone || !relationship) {
    if (alertBox) {
      alertBox.className = 'form-alert error';
      alertBox.textContent = 'Please complete all required fields.';
      alertBox.classList.remove('hidden');
    }
    return;
  }

  const cleanParentPhone = parent_phone.replace(/\D/g, '');
  if (cleanParentPhone.length < 10) {
    if (alertBox) {
      alertBox.className = 'form-alert error';
      alertBox.textContent = 'Please enter a valid 10-digit parent mobile number.';
      alertBox.classList.remove('hidden');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Saving Changes...</span>';
  }

  try {
    const res = await fetch('/api/student/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        department,
        year_of_study: parseInt(year_of_study, 10),
        semester,
        hostel_block,
        room_no,
        phone,
        parent_name,
        parent_phone: cleanParentPhone,
        relationship
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (data.student) {
        currentStudent = {
          ...currentStudent,
          ...data.student,
          parent_name: data.parent?.name,
          parent_phone: data.parent?.mobile || data.parent?.phone,
          parent_relationship: data.parent?.relationship,
          profile_completed: true,
          profileCompleted: true
        };
      }
      populateStudentHeader(currentStudent);
      toggleProfileEditMode(false);
      showToast('✓ Profile updated successfully', 'success');
    } else {
      if (alertBox) {
        alertBox.className = 'form-alert error';
        alertBox.textContent = data.message || 'Failed to update profile.';
        alertBox.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Error updating profile:', err);
    if (alertBox) {
      alertBox.className = 'form-alert error';
      alertBox.textContent = 'Network error. Please try again.';
      alertBox.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Save Changes</span>';
    }
  }
}

// Attach to window for inline HTML onclick/onsubmit access
window.clearAuthAndRedirect = clearAuthAndRedirect;
window.openFirstTimeProfileModal = openFirstTimeProfileModal;
window.closeFirstTimeProfileModal = closeFirstTimeProfileModal;
window.autoPopulateSemester = autoPopulateSemester;
window.handleFirstTimeProfileSubmit = handleFirstTimeProfileSubmit;
window.toggleProfileEditMode = toggleProfileEditMode;
window.handleProfileEditSubmit = handleProfileEditSubmit;

