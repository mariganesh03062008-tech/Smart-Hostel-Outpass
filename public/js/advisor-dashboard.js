/**
 * Smart Hostel Outpass Management System
 * Class Advisor Dashboard Controller & OD Clearance System
 */

// State
let currentAdvisor = null;
let activeTab = 'overview';
let pendingDutyList = [];
let approvedList = [];
let rejectedList = [];
let selectedRequestForAction = null;

// DOM Elements cache
let DOM = {};

function initDOM() {
  DOM = {
    advisorName: document.getElementById('advisorName'),
    advisorAvatar: document.getElementById('advisorAvatar'),
    advisorStaffId: document.getElementById('advisorStaffId'),
    advisorDept: document.getElementById('advisorDept'),

    // Metric Counters
    statPendingDuty: document.getElementById('statPendingDuty'),
    statApprovedToday: document.getElementById('statApprovedToday'),
    statRejectedToday: document.getElementById('statRejectedToday'),
    statTotalApproved: document.getElementById('statTotalApproved'),
    navBadgeDuty: document.getElementById('navBadgeDuty'),

    // Queues & Tables
    dutyQueueContainer: document.getElementById('dutyQueueContainer'),
    approvedTableBody: document.getElementById('approvedTableBody'),
    rejectedTableBody: document.getElementById('rejectedTableBody'),
    recentActivityTableBody: document.getElementById('recentActivityTableBody'),

    // Modals
    detailsModal: document.getElementById('detailsModal'),
    detailsModalBody: document.getElementById('detailsModalBody'),
    approveModal: document.getElementById('approveModal'),
    approveModalBody: document.getElementById('approveModalBody'),
    btnConfirmApprove: document.getElementById('btnConfirmApprove'),
    rejectModal: document.getElementById('rejectModal'),
    rejectReasonInput: document.getElementById('rejectReasonInput'),
    btnConfirmReject: document.getElementById('btnConfirmReject'),

    // Toast
    toastContainer: document.getElementById('toastContainer'),

    // Navigation & Buttons
    navButtons: document.querySelectorAll('.advisor-nav-btn'),
    tabSections: document.querySelectorAll('.tab-section'),
    logoutBtn: document.getElementById('logoutBtn')
  };
}

function getStoredToken() {
  return localStorage.getItem('sh_token') || 
         localStorage.getItem('token') || 
         sessionStorage.getItem('sh_token') || 
         sessionStorage.getItem('token');
}

function getStoredUser() {
  const raw = localStorage.getItem('sh_user') || 
              localStorage.getItem('user') || 
              sessionStorage.getItem('sh_user') || 
              sessionStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// Initialize on Page Load
document.addEventListener('DOMContentLoaded', async () => {
  initDOM();
  initTheme();
  initNavigation();
  initModals();
  initLogout();

  await verifyAdvisorSession();
});

/* ==========================================================
   1. SESSION VERIFICATION & DATA LOADING
   ========================================================== */
async function verifyAdvisorSession() {
  const token = getStoredToken();

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

    const role = String(data.user.role || '').toLowerCase().trim().replace(/[- ]/g, '_');
    if (role !== 'class_advisor' && role !== 'advisor') {
      console.warn(`Role mismatch: Expected class_advisor, got ${role}. Redirecting.`);
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

    currentAdvisor = data.user;
    populateAdvisorHeader(currentAdvisor);

    await refreshAdvisorData();

  } catch (err) {
    console.error('[Advisor Dash Error]:', err);
    showToast('Failed to load dashboard data. Please check your connection.', 'error');
  }
}

function populateAdvisorHeader(advisor) {
  const name = advisor.name || 'Prof. S. Venkatesh';
  const staffId = advisor.staff_id || advisor.staffId || 'ADV-204';
  const dept = advisor.department || 'Computer Science & Engineering';

  if (DOM.advisorName) DOM.advisorName.textContent = name;
  if (DOM.advisorAvatar) DOM.advisorAvatar.textContent = name.charAt(0).toUpperCase();
  if (DOM.advisorStaffId) DOM.advisorStaffId.textContent = `Faculty ID: ${staffId}`;
  if (DOM.advisorDept) DOM.advisorDept.textContent = `Department: ${dept}`;

  // Header user profile chip
  const navUser = document.getElementById('navUserName');
  const navAvatar = document.getElementById('navUserAvatar');
  if (navUser) navUser.textContent = name.split(' ')[0] || 'Advisor';
  if (navAvatar) navAvatar.textContent = name.charAt(0).toUpperCase();

  // Profile Section
  const pName = document.getElementById('profAdvName');
  const pId = document.getElementById('profAdvId');
  const pDept = document.getElementById('profAdvDept');
  const pEmail = document.getElementById('profAdvEmail');
  const pPhone = document.getElementById('profAdvPhone');

  if (pName) pName.textContent = name;
  if (pId) pId.textContent = staffId;
  if (pDept) pDept.textContent = dept;
  if (pEmail) pEmail.textContent = advisor.email || 'advisor@college.edu';
  if (pPhone) pPhone.textContent = advisor.phone || '9842112233';
}

async function refreshAdvisorData() {
  await Promise.all([
    loadAdvisorOverview(),
    loadAdvisorPending(),
    loadAdvisorApproved(),
    loadAdvisorRejected()
  ]);
}

/* ==========================================================
   2. DATA FETCHING METHODS
   ========================================================== */
async function loadAdvisorOverview() {
  const token = getStoredToken();
  if (!token) return;

  try {
    let res = await fetch('/api/advisor/overview', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      res = await fetch('/api/outpass/advisor/overview', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }

    const data = await res.json();

    if (res.ok && data.success) {
      const stats = data.stats || {};
      if (DOM.statPendingDuty) DOM.statPendingDuty.textContent = stats.pendingCount || 0;
      if (DOM.statApprovedToday) DOM.statApprovedToday.textContent = stats.approvedTodayCount || 0;
      if (DOM.statRejectedToday) DOM.statRejectedToday.textContent = stats.rejectedTodayCount || 0;
      if (DOM.statTotalApproved) DOM.statTotalApproved.textContent = stats.totalApprovedCount || 0;

      if (DOM.navBadgeDuty) {
        DOM.navBadgeDuty.textContent = stats.pendingCount || 0;
        DOM.navBadgeDuty.style.display = stats.pendingCount > 0 ? 'inline-block' : 'none';
      }

      renderRecentActivity(data.recentActivity || []);
    }
  } catch (err) {
    console.error('Error loading advisor overview:', err);
  }
}

async function loadAdvisorPending() {
  const token = getStoredToken();
  if (!token) return;

  try {
    let res = await fetch('/api/advisor/one-day/pending', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      res = await fetch('/api/outpass/advisor/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }

    const data = await res.json();

    if (res.ok && data.success) {
      pendingDutyList = data.pendingDutyRequests || [];
      renderPendingDutyQueue(pendingDutyList);
    } else {
      if (DOM.dutyQueueContainer) {
        DOM.dutyQueueContainer.innerHTML = `
          <div class="empty-state-card" style="padding:2rem; text-align:center;">
            <p style="color:#ef4444;">Unable to load pending requests from server.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('Error loading pending duty queue:', err);
    if (DOM.dutyQueueContainer) {
      DOM.dutyQueueContainer.innerHTML = `
        <div class="empty-state-card" style="padding:2rem; text-align:center;">
          <p style="color:#ef4444;">Connection error: Unable to load pending requests.</p>
        </div>
      `;
    }
  }
}

async function loadAdvisorApproved() {
  const token = getStoredToken();
  if (!token) return;

  try {
    let res = await fetch('/api/advisor/one-day/approved', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      res = await fetch('/api/outpass/advisor/approved', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }

    const data = await res.json();

    if (res.ok && data.success) {
      approvedList = data.approvedRequests || [];
      renderApprovedTable(approvedList);
    }
  } catch (err) {
    console.error('Error loading approved requests:', err);
  }
}

async function loadAdvisorRejected() {
  const token = getStoredToken();
  if (!token) return;

  try {
    let res = await fetch('/api/advisor/one-day/rejected', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      res = await fetch('/api/outpass/advisor/rejected', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }

    const data = await res.json();

    if (res.ok && data.success) {
      rejectedList = data.rejectedRequests || [];
      renderRejectedTable(rejectedList);
    }
  } catch (err) {
    console.error('Error loading rejected requests:', err);
  }
}

/* ==========================================================
   3. RENDERING METHODS
   ========================================================== */
function renderPendingDutyQueue(requests) {
  if (!DOM.dutyQueueContainer) return;

  if (!requests || requests.length === 0) {
    DOM.dutyQueueContainer.innerHTML = `
      <div class="empty-state-card" style="background:var(--bg-card); border:1px dashed var(--border-color); border-radius:var(--radius-md); padding:3rem; text-align:center;">
        <div style="font-size:2.5rem; margin-bottom:0.75rem;">🎉</div>
        <h3 style="font-size:1.15rem; font-weight:700; color:var(--text-primary);">All Clear! No Pending Requests</h3>
        <p style="color:var(--text-muted); font-size:0.875rem; margin-top:0.35rem;">There are no One-Day Duty requests awaiting your clearance right now.</p>
      </div>
    `;
    return;
  }

  DOM.dutyQueueContainer.innerHTML = requests.map(req => {
    const isCSE = (req.studentDept || '').toLowerCase().includes('computer');
    const deptPillClass = isCSE ? 'cse' : 'mech';

    return `
      <div class="advisor-request-card" id="advisor-req-card-${req.id}">
        
        <!-- Card Header -->
        <div class="req-card-header">
          <div class="req-student-profile">
            <div class="req-student-avatar">
              ${(req.studentName || 'S').charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="req-student-name">${escapeHtml(req.studentName)}</div>
              <div class="req-student-meta">
                <span class="meta-tag reg-no">${req.studentRegNo}</span>
                <span class="dept-badge ${deptPillClass}">${escapeHtml(req.studentDept || 'CSE')}</span>
                <span class="meta-tag">Year ${req.studentYear || 3}</span>
              </div>
            </div>
          </div>

          <div class="req-status-pill">
            <span class="pulse-dot"></span>
            Awaiting Clearance
          </div>
        </div>

        <!-- Event / Duty Details Box -->
        <div class="req-duty-box">
          <div class="duty-field-row">
            <span class="field-label">Event / Activity:</span>
            <span class="field-val highlight">${escapeHtml(req.eventName || 'Technical Symposium / Project Work')}</span>
          </div>

          <div class="duty-field-row">
            <span class="field-label">Organization / Venue:</span>
            <span class="field-val">${escapeHtml(req.eventLocation || req.destination || 'External Campus')}</span>
          </div>

          <div class="duty-field-row">
            <span class="field-label">Duty Date:</span>
            <span class="field-val" style="color:#c084fc; font-weight:700;">${req.dutyDate ? req.dutyDate.slice(0, 10) : 'Today'}</span>
          </div>

          <div class="duty-field-row">
            <span class="field-label">Duty Description:</span>
            <span class="field-val" style="color:var(--text-secondary); font-style:italic;">${escapeHtml(req.dutyDescription || req.purpose || 'Official college representation')}</span>
          </div>
        </div>

        <!-- Time & Room Details -->
        <div class="req-grid-info">
          <div class="info-block">
            <span class="lbl">Departure Time</span>
            <span class="val">${formatDateTime(req.leavingDatetime)}</span>
          </div>
          <div class="info-block">
            <span class="lbl">Expected Return</span>
            <span class="val">${formatDateTime(req.returnDatetime)}</span>
          </div>
          <div class="info-block">
            <span class="lbl">Hostel Room</span>
            <span class="val">${escapeHtml(req.studentBlock || 'Block A')} - ${escapeHtml(req.studentRoom || '304')}</span>
          </div>
          <div class="info-block">
            <span class="lbl">Student Contact</span>
            <span class="val">${escapeHtml(req.contactPhone || req.studentRegisteredPhone || 'N/A')}</span>
          </div>
        </div>

        <!-- Actions Toolbar -->
        <div class="req-action-bar">
          <button class="action-btn view-btn" onclick="openDetailsModal(${req.id})">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span>View Full Details</span>
          </button>

          <div style="display:flex; gap:0.5rem;">
            <button class="action-btn reject-btn" onclick="openRejectModal(${req.id})">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              <span>Reject Request</span>
            </button>

            <button class="action-btn approve-btn" onclick="openApproveModal(${req.id})">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>Approve & Forward to Principal</span>
            </button>
          </div>
        </div>

      </div>
    `;
  }).join('');
}

function renderApprovedTable(requests) {
  if (!DOM.approvedTableBody) return;

  if (!requests || requests.length === 0) {
    DOM.approvedTableBody.innerHTML = `
      <tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No approved One-Day Duty records found.</td></tr>
    `;
    return;
  }

  DOM.approvedTableBody.innerHTML = requests.map((req, idx) => `
    <tr>
      <td style="font-family:monospace; color:var(--text-muted);">${idx + 1}</td>
      <td>
        <strong style="color:var(--text-primary);">${escapeHtml(req.studentName)}</strong><br>
        <small style="font-family:monospace; color:var(--text-muted);">${req.studentRegNo}</small>
      </td>
      <td>
        <strong style="color:#c084fc;">${escapeHtml(req.eventName || 'Technical Duty')}</strong><br>
        <small style="color:var(--text-muted);">${escapeHtml(req.eventLocation || 'External')}</small>
      </td>
      <td>${req.dutyDate ? req.dutyDate.slice(0, 10) : '-'}</td>
      <td style="font-size:0.8rem; font-family:monospace;">${formatDateTime(req.leavingDatetime)} → ${formatDateTime(req.returnDatetime)}</td>
      <td style="font-size:0.8rem; color:var(--text-muted);">${formatDateTime(req.approvedAt)}</td>
      <td><span class="badge-approved">✓ Cleared</span></td>
    </tr>
  `).join('');
}

function renderRejectedTable(requests) {
  if (!DOM.rejectedTableBody) return;

  if (!requests || requests.length === 0) {
    DOM.rejectedTableBody.innerHTML = `
      <tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No rejected One-Day Duty records found.</td></tr>
    `;
    return;
  }

  DOM.rejectedTableBody.innerHTML = requests.map((req, idx) => `
    <tr>
      <td style="font-family:monospace; color:var(--text-muted);">${idx + 1}</td>
      <td>
        <strong style="color:var(--text-primary);">${escapeHtml(req.studentName)}</strong><br>
        <small style="font-family:monospace; color:var(--text-muted);">${req.studentRegNo}</small>
      </td>
      <td>
        <strong>${escapeHtml(req.eventName || 'Duty Request')}</strong><br>
        <small style="color:var(--text-muted);">${escapeHtml(req.eventLocation || '-')}</small>
      </td>
      <td>${req.dutyDate ? req.dutyDate.slice(0, 10) : '-'}</td>
      <td style="color:#ef4444; font-size:0.85rem; max-width:240px;">${escapeHtml(req.rejectionReason || 'Declined by Faculty Advisor')}</td>
      <td style="font-size:0.8rem; color:var(--text-muted);">${formatDateTime(req.rejectedAt)}</td>
      <td><span class="badge-rejected">✕ Rejected</span></td>
    </tr>
  `).join('');
}

function renderRecentActivity(activities) {
  if (!DOM.recentActivityTableBody) return;

  if (!activities || activities.length === 0) {
    DOM.recentActivityTableBody.innerHTML = `
      <tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No recent activity in your department.</td></tr>
    `;
    return;
  }

  DOM.recentActivityTableBody.innerHTML = activities.slice(0, 5).map(act => {
    const isApprove = act.status === 'APPROVED' || act.status === 'PENDING_WARDEN' || act.status === 'PENDING_PRINCIPAL';
    const badge = isApprove
      ? '<span class="badge-approved">Approved</span>'
      : '<span class="badge-rejected">Rejected</span>';

    return `
      <tr>
        <td style="font-family:monospace; color:#c084fc;">${act.requestCode}</td>
        <td>${escapeHtml(act.studentName)}</td>
        <td>${escapeHtml(act.eventName || 'Duty Event')}</td>
        <td>${badge}</td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${formatDateTime(act.updatedAt || act.createdAt)}</td>
      </tr>
    `;
  }).join('');
}

/* ==========================================================
   4. MODAL DIALOGS & USER INTERACTIONS
   ========================================================== */
function initModals() {
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.advisor-modal');
      if (modal) modal.classList.remove('active');
    });
  });

  if (DOM.btnConfirmApprove) {
    DOM.btnConfirmApprove.addEventListener('click', () => {
      if (selectedRequestForAction) {
        executeAdvisorApprove(selectedRequestForAction);
      }
    });
  }

  if (DOM.btnConfirmReject) {
    DOM.btnConfirmReject.addEventListener('click', () => {
      if (selectedRequestForAction) {
        const reason = DOM.rejectReasonInput ? DOM.rejectReasonInput.value.trim() : '';
        if (!reason) {
          showToast('Please provide a specific rejection reason for the student.', 'error');
          return;
        }
        executeAdvisorReject(selectedRequestForAction, reason);
      }
    });
  }
}

function openDetailsModal(requestId) {
  const req = pendingDutyList.find(r => r.id === requestId);
  if (!req || !DOM.detailsModalBody) return;

  DOM.detailsModalBody.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.85rem; font-size:0.875rem;">
      <div><span style="color:var(--text-muted);">Request Code:</span> <strong style="font-family:monospace; color:#c084fc;">${req.requestCode}</strong></div>
      <div><span style="color:var(--text-muted);">Student Name:</span> <strong>${escapeHtml(req.studentName)}</strong></div>
      <div><span style="color:var(--text-muted);">Register No:</span> <strong style="font-family:monospace;">${req.studentRegNo}</strong></div>
      <div><span style="color:var(--text-muted);">Department:</span> <strong>${escapeHtml(req.studentDept)} (Year ${req.studentYear})</strong></div>
      <div><span style="color:var(--text-muted);">Hostel Room:</span> <strong>${escapeHtml(req.studentBlock)} - ${escapeHtml(req.studentRoom)}</strong></div>
      <div><span style="color:var(--text-muted);">Contact Phone:</span> <strong>${escapeHtml(req.contactPhone || req.studentRegisteredPhone || '-')}</strong></div>
      
      <div style="grid-column: span 2; border-top:1px solid var(--border-color); padding-top:0.75rem; margin-top:0.25rem;">
        <span style="color:var(--text-muted);">Event / Activity:</span><br>
        <strong style="color:var(--text-primary); font-size:0.95rem;">${escapeHtml(req.eventName)}</strong>
      </div>

      <div style="grid-column: span 2;">
        <span style="color:var(--text-muted);">Venue / Organization:</span><br>
        <strong>${escapeHtml(req.eventLocation || req.destination)}</strong>
      </div>

      <div><span style="color:var(--text-muted);">Duty Date:</span> <strong>${req.dutyDate ? req.dutyDate.slice(0, 10) : 'Today'}</strong></div>
      <div><span style="color:var(--text-muted);">Submitted On:</span> <strong>${formatDateTime(req.submittedDate)}</strong></div>

      <div style="grid-column: span 2; background:rgba(255,255,255,0.03); padding:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
        <span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; font-weight:700;">Academic Representation Purpose:</span><br>
        <p style="color:var(--text-secondary); margin-top:0.25rem; font-style:italic;">${escapeHtml(req.dutyDescription || req.purpose || 'Official college participation')}</p>
      </div>

      <div><span style="color:var(--text-muted);">Scheduled Departure:</span><br><strong>${formatDateTime(req.leavingDatetime)}</strong></div>
      <div><span style="color:var(--text-muted);">Expected Return:</span><br><strong>${formatDateTime(req.returnDatetime)}</strong></div>
    </div>
  `;

  openModal('detailsModal');
}

function openApproveModal(requestId) {
  selectedRequestForAction = requestId;
  const req = pendingDutyList.find(r => r.id === requestId);
  if (!req || !DOM.approveModalBody) return;

  DOM.approveModalBody.innerHTML = `
    <p>Are you sure you want to grant academic clearance for One-Day Duty request <strong>${req.requestCode}</strong> for <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})?</p>
    <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:0.5rem;">
      Event: <strong>${escapeHtml(req.eventName)}</strong><br>
      Once cleared, this request will be automatically forwarded to the <strong>Principal</strong> for final executive authorization.
    </p>
  `;

  openModal('approveModal');
}

function openRejectModal(requestId) {
  selectedRequestForAction = requestId;
  if (DOM.rejectReasonInput) DOM.rejectReasonInput.value = '';
  openModal('rejectModal');
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
  selectedRequestForAction = null;
}

/* ==========================================================
   5. EXECUTE APPROVAL & REJECTION CALLS
   ========================================================== */
async function executeAdvisorApprove(requestId) {
  const token = getStoredToken();
  if (!token) return;

  if (DOM.btnConfirmApprove) DOM.btnConfirmApprove.disabled = true;

  try {
    let res = await fetch(`/api/advisor/one-day/${requestId}/approve`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      res = await fetch(`/api/outpass/${requestId}/advisor-approve`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    }

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('approveModal');
      showToast(`🎉 OD request ${data.data?.requestCode || ''} approved and forwarded to Principal for final authorization.`, 'success');

      const card = document.getElementById(`advisor-req-card-${requestId}`);
      if (card) card.remove();

      await refreshAdvisorData();
    } else {
      showToast(data.message || 'Failed to approve OD request.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (DOM.btnConfirmApprove) DOM.btnConfirmApprove.disabled = false;
  }
}

async function executeAdvisorReject(requestId, rejectionReason) {
  const token = getStoredToken();
  if (!token) return;

  if (DOM.btnConfirmReject) DOM.btnConfirmReject.disabled = true;

  try {
    let res = await fetch(`/api/advisor/one-day/${requestId}/reject`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rejection_reason: rejectionReason })
    });

    if (!res.ok) {
      res = await fetch(`/api/outpass/${requestId}/advisor-reject`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rejection_reason: rejectionReason })
      });
    }

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('rejectModal');
      showToast(`OD request ${data.data?.requestCode || ''} rejected.`, 'info');

      const card = document.getElementById(`advisor-req-card-${requestId}`);
      if (card) card.remove();

      await refreshAdvisorData();
    } else {
      showToast(data.message || 'Failed to reject OD request.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (DOM.btnConfirmReject) DOM.btnConfirmReject.disabled = false;
  }
}

/* ==========================================================
   6. NAVIGATION & TOASTS
   ========================================================== */
function initNavigation() {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.querySelector('.advisor-sidebar') || document.querySelector('.dash-sidebar');
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

  const buttons = document.querySelectorAll('.advisor-nav-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.dataset.tab;
      if (tabId) switchTab(tabId);
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    });
  });

  // Real-time notification hook to auto-refresh all feeds and stats
  window.addEventListener('sh:notification:new', async () => {
    await refreshAdvisorData();
  });

  // Support direct hash navigation and browser back/forward buttons
  window.addEventListener('hashchange', () => {
    const rawHash = window.location.hash.replace(/^#/, '');
    if (rawHash && rawHash !== activeTab) {
      switchTab(rawHash, false);
    }
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

  const navButtons = document.querySelectorAll('.advisor-nav-btn');
  const tabSections = document.querySelectorAll('.tab-section');

  navButtons.forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  tabSections.forEach(sec => {
    if (sec.id === `tab-${tabId}`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  const sidebar = document.querySelector('.advisor-sidebar') || document.querySelector('.dash-sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');

  if (pushHash && window.location.hash !== `#${tabId}`) {
    history.pushState(null, '', `#${tabId}`);
  }

  if (tabId === 'duty-queue') loadAdvisorPending();
  if (tabId === 'approved-list') loadAdvisorApproved();
  if (tabId === 'rejected-list') loadAdvisorRejected();
}

window.switchTab = switchTab;

// Aliases for backwards compatibility
const loadPendingDutyQueue = loadAdvisorPending;
const loadApprovedHistory = loadAdvisorApproved;
const loadRejectedHistory = loadAdvisorRejected;

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer') || DOM.toastContainer;
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `warden-toast ${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function formatDateTime(dtStr) {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
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
   7. AUTH & THEME MANAGEMENT
   ========================================================== */
function initLogout() {
  const logoutBtn = document.getElementById('logoutBtn') || DOM.logoutBtn;
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const token = getStoredToken();
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
  localStorage.removeItem('token');
  localStorage.removeItem('sh_user');
  localStorage.removeItem('user');
  sessionStorage.removeItem('sh_token');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('sh_user');
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

// Attach functions to global window object
window.switchTab = switchTab;
window.openDetailsModal = openDetailsModal;
window.openApproveModal = openApproveModal;
window.openRejectModal = openRejectModal;
window.closeModal = closeModal;
window.refreshAdvisorData = refreshAdvisorData;
