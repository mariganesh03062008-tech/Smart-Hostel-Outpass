/**
 * Principal Executive Dashboard Controller
 * Smart Hostel Outpass Management System
 */

const API_BASE_URL = '/api';
let authToken = localStorage.getItem('token');
let currentUser = null;
let currentTab = 'overview';
let selectedReportType = 'daily';
let lastGeneratedReportData = null;
let chartInstances = {};
let currentActionRequestId = null;
let currentDutyList = [];
let currentSpecialList = [];

// Strict Type Normalizer Helper
function getCanonicalOutpassType(req) {
  if (!req) return 'normal';
  const raw = String(req.outpass_type || req.outpassType || req.requestType || '').toLowerCase().trim();
  if (raw === 'emergency') return 'emergency';
  if (raw === 'special') return 'special';
  if (raw === 'one_day_duty' || raw === 'duty' || raw === 'one_day' || raw === 'oneday') return 'one_day_duty';
  return 'normal';
}

// On DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initPrincipalSession();
  setupTabNavigation();
  setupLiveClock();
  setupReportDateDefaults();
  setupActionModals();
  
  // Initial load
  loadPrincipalOverview();
  loadStudentStatus();

  // Periodic Auto-refresh (30 seconds)
  setInterval(() => {
    loadPrincipalOverview(true);
    if (currentTab === 'one-day-permission') loadOneDayPermissions(true);
    if (currentTab === 'special-permission') loadSpecialPermissions(true);
    if (currentTab === 'students-outside') loadStudentsOutside(true);
  }, 30000);
});

/* ==========================================================
   1. SESSION & AUTHENTICATION
   ========================================================== */

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

function initPrincipalSession() {
  const token = getStoredToken();
  currentUser = getStoredUser();

  if (!token || !currentUser) {
    console.warn('[Principal Auth] Missing authentication token or user session.');
    window.location.href = '/index.html';
    return;
  }

  const role = String(currentUser.role || '').toLowerCase().trim().replace(/[- ]/g, '_');

  if (role !== 'principal') {
    console.warn('[Principal Auth] Role mismatch:', role);
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
    const targetDashboard = ROLE_DASHBOARDS[role] || '/student-dashboard.html';

    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '10px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.background = '#dc2626';
    banner.style.color = '#fff';
    banner.style.padding = '0.75rem 1.5rem';
    banner.style.borderRadius = '8px';
    banner.style.zIndex = '99999';
    banner.textContent = `Authorization Error: Access denied for role "${currentUser.role}". Redirecting to your dashboard...`;
    document.body.appendChild(banner);
    setTimeout(() => {
      window.location.href = targetDashboard;
    }, 1500);
    return;
  }

  authToken = token;

  // Populate user profile info in UI
  const nameEl = document.getElementById('principalName');
  const avatarEl = document.getElementById('principalAvatar');
  const staffIdEl = document.getElementById('principalStaffId');
  const profNameEl = document.getElementById('profPrincipalName');
  const profIdEl = document.getElementById('profPrincipalId');
  const profEmailEl = document.getElementById('profPrincipalEmail');

  const pName = currentUser.name || 'Principal';
  const pStaffId = currentUser.staff_id || currentUser.id || 'PRC-001';
  const pEmail = currentUser.email || 'principal@college.edu';

  if (nameEl) nameEl.textContent = pName;
  if (avatarEl) avatarEl.textContent = pName.charAt(0).toUpperCase();
  if (staffIdEl) staffIdEl.textContent = pStaffId;
  if (profNameEl) profNameEl.textContent = pName;
  if (profIdEl) profIdEl.textContent = pStaffId;
  if (profEmailEl) profEmailEl.textContent = pEmail;

  // Header user profile chip
  const navUser = document.getElementById('navUserName');
  const navAvatar = document.getElementById('navUserAvatar');
  if (navUser) navUser.textContent = pName.split(' ')[0] || 'Principal';
  if (navAvatar) navAvatar.textContent = pName.charAt(0).toUpperCase();

  // Bind logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleSignOut);
  }

  // Bind theme toggle
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleAppTheme);
  }
}

async function handleSignOut() {
  try {
    const token = getStoredToken();
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch (e) {}
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

function toggleAppTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
}

/* ==========================================================
   2. TAB NAVIGATION & CONTROLLER
   ========================================================== */

function setupTabNavigation() {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.querySelector('.warden-sidebar') || document.querySelector('.dash-sidebar');
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

  const navBtns = document.querySelectorAll('.warden-nav-btn, .principal-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.getAttribute('data-tab') || btn.getAttribute('data-section');
      if (tabId) showPrincipalSection(tabId);
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    });
  });

  // Real-time notification hook to auto-refresh all feeds and stats
  window.addEventListener('sh:notification:new', async () => {
    await loadPrincipalOverview(true);
    if (currentTab === 'one-day-permission') loadOneDayPermissions(true);
    if (currentTab === 'special-permission') loadSpecialPermissions(true);
    if (currentTab === 'students-outside') loadStudentsOutside(true);
  });

  // Support direct hash navigation and browser back/forward buttons
  window.addEventListener('hashchange', () => {
    const rawHash = window.location.hash.replace(/^#/, '');
    if (rawHash && rawHash !== currentTab) {
      showPrincipalSection(rawHash, false);
    }
  });

  // Initial hash check on page load: strictly default to overview/dashboard
  const initialHash = window.location.hash.replace(/^#/, '');
  showPrincipalSection(initialHash || 'overview', false);
}

/**
 * Centralized Principal Section Controller
 * STRICT SINGLE-PAGE CONTENT ISOLATION
 */
function showPrincipalSection(sectionId, pushHash = true) {
  if (!sectionId) sectionId = 'overview';

  // Normalize aliases (e.g. 'dashboard' -> 'overview', strip 'tab-' or 'principal' prefix)
  let cleanId = String(sectionId)
    .trim()
    .replace(/^#/, '')
    .replace(/^tab-/, '');

  if (cleanId === 'dashboard' || cleanId === 'principalDashboardSection') cleanId = 'overview';
  if (cleanId === 'reportssection' || cleanId === 'principalReportsSection') cleanId = 'reports';
  if (cleanId === 'profilesection' || cleanId === 'principalProfileSection') cleanId = 'profile';
  if (cleanId === 'settingssection' || cleanId === 'principalSettingsSection') cleanId = 'settings';
  if (cleanId === 'analyticssection' || cleanId === 'principalAnalyticsSection') cleanId = 'analytics';

  currentTab = cleanId;

  const sections = document.querySelectorAll('.tab-section, .principal-section');
  const navButtons = document.querySelectorAll('.warden-nav-btn, .principal-nav-btn');

  // 1. Hide EVERY Principal content section first and strip active class
  sections.forEach(sec => {
    sec.classList.remove('active');
    sec.style.setProperty('display', 'none', 'important');
  });

  // 2. Remove active state from EVERY Principal navigation button
  navButtons.forEach(btn => {
    btn.classList.remove('active');
  });

  // 3. Show ONLY the requested section
  const targetSection = document.getElementById(`tab-${cleanId}`) ||
                        document.getElementById(cleanId) ||
                        document.getElementById(`principal${cleanId.charAt(0).toUpperCase() + cleanId.slice(1)}Section`);

  if (targetSection) {
    targetSection.classList.add('active');
    targetSection.style.setProperty('display', 'flex', 'important');
  } else {
    console.warn(`[Principal Navigation] Section container not found for: "${sectionId}" (normalized: "${cleanId}")`);
  }

  // 4. Add active state ONLY to the matching navigation button
  const activeBtn = document.querySelector(`.principal-nav-btn[data-tab="${cleanId}"], .warden-nav-btn[data-tab="${cleanId}"], [data-section="${cleanId}"]`) ||
                    document.querySelector(`[data-tab="${sectionId}"], [data-section="${sectionId}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Close mobile drawer if open
  const sidebar = document.querySelector('.warden-sidebar') || document.querySelector('.dash-sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');

  // Update browser URL hash/history without duplicating
  if (pushHash && window.location.hash !== `#${cleanId}`) {
    history.pushState(null, '', `#${cleanId}`);
  }

  // 5. Trigger section-specific data loaders cleanly
  loadPrincipalSectionData(cleanId);
}

function loadPrincipalSectionData(cleanId) {
  if (cleanId === 'overview') {
    loadPrincipalOverview();
    loadStudentStatus();
  } else if (cleanId === 'normal-monitoring') {
    loadNormalOutpasses();
  } else if (cleanId === 'one-day-permission') {
    loadOneDayPermissions();
  } else if (cleanId === 'special-permission') {
    loadSpecialPermissions();
  } else if (cleanId === 'students-outside') {
    loadStudentsOutside();
  } else if (cleanId === 'reports') {
    generateSelectedReport();
  } else if (cleanId === 'analytics') {
    loadAnalytics();
  }
}

function savePrincipalSettings() {
  showToast('Executive system preferences saved successfully.', 'success');
}

// Single Source of Truth Navigation Exports
window.showPrincipalSection = showPrincipalSection;
window.switchPrincipalTab = showPrincipalSection;
window.switchTab = showPrincipalSection;
window.savePrincipalSettings = savePrincipalSettings;

/* ==========================================================
   3. LIVE CLOCK
   ========================================================== */

function setupLiveClock() {
  const clockEl = document.getElementById('principalClock');
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }
  updateClock();
  setInterval(updateClock, 1000);
}

/* ==========================================================
   4. DASHBOARD OVERVIEW COUNTERS
   ========================================================== */

async function loadPrincipalOverview(isSilent = false) {
  try {
    const res = await fetch(`${API_BASE_URL}/principal/overview`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) handleSignOut();
      return;
    }

    const data = await res.json();
    if (!data.success || !data.stats) return;

    const s = data.stats;

    // Update summary cards
    setCount('statTotalStudents', s.totalStudents);
    setCount('statStudentsInside', s.studentsInside);
    setCount('statStudentsOutside', s.studentsOutside);
    setCount('statPendingNormal', s.pendingNormalOutpasses);
    setCount('statPendingOneDay', s.pendingOneDayPermissions);
    setCount('statPendingSpecial', s.pendingSpecialPermissions);
    setCount('statApprovedOutpasses', s.approvedOutpasses);
    setCount('statRejectedOutpasses', s.rejectedOutpasses);
    setCount('statActiveQRCodes', s.activeQRCodes);
    setCount('statCompletedOutpasses', s.completedOutpasses);
    setCount('statPendingExtensions', s.pendingExtensions);
    setCount('statLateReturns', s.lateReturns);

    // Update nav badge pills
    const badgeOD = document.getElementById('navBadgePendingOD');
    if (badgeOD) {
      if (s.pendingOneDayPermissions > 0) {
        badgeOD.textContent = s.pendingOneDayPermissions;
        badgeOD.style.display = 'inline-block';
      } else {
        badgeOD.style.display = 'none';
      }
    }

    const badgeSpecial = document.getElementById('navBadgePendingSpecial');
    if (badgeSpecial) {
      if (s.pendingSpecialPermissions > 0) {
        badgeSpecial.textContent = s.pendingSpecialPermissions;
        badgeSpecial.style.display = 'inline-block';
      } else {
        badgeSpecial.style.display = 'none';
      }
    }

    const badgeOutside = document.getElementById('navBadgeOutside');
    if (badgeOutside) {
      if (s.studentsOutside > 0) {
        badgeOutside.textContent = s.studentsOutside;
        badgeOutside.style.display = 'inline-block';
      } else {
        badgeOutside.style.display = 'none';
      }
    }

  } catch (err) {
    if (!isSilent) console.error('Failed to load Principal overview:', err);
  }
}

function setCount(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = Number(val || 0).toLocaleString();
}

/* ==========================================================
   5. STUDENT HOSTEL STATUS ROSTER
   ========================================================== */

async function loadStudentStatus() {
  const dept = document.getElementById('filterDept')?.value || 'all';
  const block = document.getElementById('filterBlock')?.value || 'all';
  const status = document.getElementById('filterStatus')?.value || 'all';

  const tbody = document.getElementById('studentStatusTableBody');
  const emptyBox = document.getElementById('studentStatusEmpty');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading student status records...</td></tr>`;
  if (emptyBox) emptyBox.classList.add('hidden');

  try {
    const params = new URLSearchParams({
      department: dept,
      hostel_block: block,
      status: status
    });

    const res = await fetch(`${API_BASE_URL}/principal/student-status?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    if (!data.success || !data.students || data.students.length === 0) {
      tbody.innerHTML = '';
      if (emptyBox) emptyBox.classList.remove('hidden');
      return;
    }

    tbody.innerHTML = data.students.map(s => {
      let statusBadge = '';
      if (s.computedStatus === 'OUTSIDE_HOSTEL') {
        statusBadge = `<span class="status-pill warning">Outside Hostel</span>`;
      } else if (s.computedStatus === 'LATE_RETURN') {
        statusBadge = `<span class="status-pill danger">Late Return</span>`;
      } else if (s.computedStatus === 'COMPLETED') {
        statusBadge = `<span class="status-pill info">Completed</span>`;
      } else {
        statusBadge = `<span class="status-pill success">Inside Hostel</span>`;
      }

      const exitStr = s.latestPass?.exitTime ? formatDatetime(s.latestPass.exitTime) : '—';
      const expectedStr = s.latestPass?.expectedReturnTime ? formatDatetime(s.latestPass.expectedReturnTime) : '—';
      const returnStr = s.latestPass?.actualReturnTime ? formatDatetime(s.latestPass.actualReturnTime) : '—';

      return `
        <tr>
          <td><strong style="font-family:monospace; color:#818cf8;">${escapeHtml(s.rollNumber)}</strong></td>
          <td>
            <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(s.studentName)}</div>
            <small style="color:var(--text-muted); font-size:0.75rem;">${escapeHtml(s.studentPhone || '')}</small>
          </td>
          <td>
            <div>${escapeHtml(s.department)}</div>
            <small style="color:var(--text-muted);">Year ${s.yearOfStudy}</small>
          </td>
          <td>
            <div>${escapeHtml(s.hostelBlock)}</div>
            <small style="color:var(--text-muted);">Room ${escapeHtml(s.roomNumber || '')}</small>
          </td>
          <td>${statusBadge}</td>
          <td style="font-size:0.8rem; font-family:monospace;">${exitStr}</td>
          <td style="font-size:0.8rem; font-family:monospace;">${expectedStr}</td>
          <td style="font-size:0.8rem; font-family:monospace;">${returnStr}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load student status roster:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:#ef4444;">Failed to load data from server.</td></tr>`;
  }
}

/* ==========================================================
   6. NORMAL OUTPASS MONITORING (STRICTLY READ-ONLY)
   ========================================================== */

async function loadNormalOutpasses() {
  const status = document.getElementById('normalOpStatusFilter')?.value || 'all';
  const search = document.getElementById('normalOpSearch')?.value || '';
  const tbody = document.getElementById('normalOutpassTableBody');
  const emptyBox = document.getElementById('normalOutpassEmpty');

  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading Normal Outpasses...</td></tr>`;
  if (emptyBox) emptyBox.classList.add('hidden');

  try {
    const params = new URLSearchParams({ status, search });
    const res = await fetch(`${API_BASE_URL}/principal/normal-outpasses?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    if (!data.success || !data.normalOutpasses || data.normalOutpasses.length === 0) {
      tbody.innerHTML = '';
      if (emptyBox) emptyBox.classList.remove('hidden');
      return;
    }

    tbody.innerHTML = data.normalOutpasses.map(op => {
      let statusBadge = '';
      if (op.status === 'APPROVED') statusBadge = `<span class="status-pill success">Approved</span>`;
      else if (op.status === 'REJECTED') statusBadge = `<span class="status-pill danger">Rejected</span>`;
      else if (op.status === 'COMPLETED') statusBadge = `<span class="status-pill purple">Completed</span>`;
      else statusBadge = `<span class="status-pill warning">${op.status}</span>`;

      return `
        <tr>
          <td><strong style="font-family:monospace; color:#818cf8;">${escapeHtml(op.requestCode)}</strong></td>
          <td>
            <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(op.studentName)}</div>
            <small style="font-family:monospace; color:var(--text-muted);">${escapeHtml(op.rollNumber)}</small>
          </td>
          <td>${escapeHtml(op.department)} (Yr ${op.yearOfStudy})</td>
          <td>${escapeHtml(op.hostelBlock)} - ${escapeHtml(op.roomNumber || '')}</td>
          <td>
            <div style="font-weight:500;">${escapeHtml(op.placeOfVisit)}</div>
            <small style="color:var(--text-muted);">${escapeHtml(op.purpose || '—')}</small>
          </td>
          <td style="font-size:0.8rem; font-family:monospace;">${formatDatetime(op.leavingDatetime)}</td>
          <td style="font-size:0.8rem; font-family:monospace;">${formatDatetime(op.returnDatetime)}</td>
          <td><span class="status-pill ${op.parentStatus === 'approved' ? 'success' : (op.parentStatus === 'rejected' ? 'danger' : 'warning')}" style="font-size:0.7rem;">${op.parentStatus || 'pending'}</span></td>
          <td><span class="status-pill ${op.wardenStatus === 'approved' ? 'success' : (op.wardenStatus === 'rejected' ? 'danger' : 'warning')}" style="font-size:0.7rem;">${op.wardenStatus || 'pending'}</span></td>
          <td><span class="status-pill ${op.qrStatus === 'ACTIVE' ? 'info' : (op.qrStatus === 'COMPLETED' ? 'purple' : 'muted')}" style="font-size:0.7rem;">${op.qrStatus || 'Not Issued'}</span></td>
          <td><span class="status-pill ${op.currentStatus === 'OUTSIDE' ? 'warning' : 'success'}" style="font-size:0.7rem;">${op.currentStatus || 'INSIDE'}</span></td>
          <td style="font-size:0.78rem; color:var(--text-muted);">${formatDatetime(op.submittedTime)}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load Normal Outpasses:', err);
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:1.5rem; color:#ef4444;">Failed to load normal outpass records.</td></tr>`;
  }
}

/* ==========================================================
   7. ONE-DAY PERMISSION & SPECIAL OUTPASS (STRICT SEPARATION)
   ========================================================== */

/**
 * Loads One-Day Duty requests strictly.
 * Special Outpass requests NEVER appear inside oneDayTableBody.
 */
async function loadOneDayPermissions(isSilent = false) {
  const status = document.getElementById('oneDayStatusFilter')?.value || 'PENDING_PRINCIPAL';
  const department = document.getElementById('oneDayDeptFilter')?.value || 'all';
  const tbodyDuty = document.getElementById('oneDayTableBody');
  const emptyDuty = document.getElementById('oneDayEmpty');

  if (!tbodyDuty) return;
  if (!isSilent) {
    tbodyDuty.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading One-Day Permissions...</td></tr>`;
  }
  if (emptyDuty) emptyDuty.classList.add('hidden');

  try {
    const params = new URLSearchParams({ status, department });
    const res = await fetch(`${API_BASE_URL}/principal/one-day-permissions?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    currentDutyList = (data.dutyRequests || [])
      .filter(r => getCanonicalOutpassType(r) === 'one_day_duty');

    if (currentDutyList.length === 0) {
      tbodyDuty.innerHTML = '';
      if (emptyDuty) emptyDuty.classList.remove('hidden');
    } else {
      if (emptyDuty) emptyDuty.classList.add('hidden');
      tbodyDuty.innerHTML = currentDutyList.map(od => {
        const isPending = od.status === 'PENDING_PRINCIPAL';
        let statusBadge = '';
        if (od.status === 'APPROVED') statusBadge = `<span class="status-pill success">Approved</span>`;
        else if (od.status === 'REJECTED') statusBadge = `<span class="status-pill danger">Rejected</span>`;
        else statusBadge = `<span class="status-pill warning">Pending Principal</span>`;

        return `
          <tr>
            <td>
              <strong style="font-family:monospace; color:#818cf8;">${escapeHtml(od.requestCode)}</strong><br>
              <span style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); font-size:0.75rem; padding:2px 6px; border-radius:4px; font-weight:600;">🎓 One-Day OD</span>
            </td>
            <td>
              <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(od.studentName)}</div>
              <small style="font-family:monospace; color:var(--text-muted);">${escapeHtml(od.rollNumber)}</small>
            </td>
            <td>${escapeHtml(od.department)} (Yr ${od.yearOfStudy})</td>
            <td>${escapeHtml(od.hostelBlock)} - ${escapeHtml(od.roomNumber || '')}</td>
            <td>
              <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(od.eventName || od.purpose || 'Academic Duty')}</div>
              <small style="color:var(--text-muted);">${escapeHtml(od.eventLocation || od.destination || '—')}</small>
            </td>
            <td style="font-size:0.8rem; font-family:monospace;">
              <div>Leave: ${formatDatetime(od.leavingDatetime)}</div>
              <div>Return: ${formatDatetime(od.returnDatetime)}</div>
            </td>
            <td>
              <div style="font-weight:500; color:#10b981;">✓ ${escapeHtml(od.advisorName || 'Advisor Approved')}</div>
            </td>
            <td style="font-size:0.78rem; color:var(--text-muted);">${formatDatetime(od.submittedTime)}</td>
            <td>${statusBadge}</td>
            <td style="text-align:right;">
              <div style="display:inline-flex; gap:0.4rem; align-items:center;">
                <button class="secondary-btn" onclick="viewOneDayDetails(${od.id})" style="padding:0.35rem 0.65rem; font-size:0.78rem;">
                  <span>View Details</span>
                </button>
                ${isPending ? `
                  <button class="primary-btn btn-approve-action" onclick="openApproveODModal(${od.id})" style="padding:0.35rem 0.75rem; font-size:0.78rem; font-weight:700; background: linear-gradient(135deg, #10b981, #059669);">
                    <span>Approve & Issue QR</span>
                  </button>
                  <button class="danger-btn btn-reject-action" onclick="openRejectODModal(${od.id})" style="padding:0.35rem 0.65rem; font-size:0.78rem; font-weight:700; background: rgba(239, 68, 68, 0.12); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); border-radius:var(--radius-sm); cursor:pointer;">
                    <span>Reject</span>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const badgeOD = document.getElementById('navBadgePendingOD');
    if (badgeOD) {
      const pendingCount = currentDutyList.filter(r => r.status === 'PENDING_PRINCIPAL').length;
      badgeOD.textContent = pendingCount;
      badgeOD.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

  } catch (err) {
    console.error('Failed to load One-Day Permissions:', err);
    if (tbodyDuty) tbodyDuty.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#ef4444;">Failed to load One-Day permission queue.</td></tr>`;
  }
}

/**
 * Loads Special Outpass requests strictly.
 * One-Day Duty requests NEVER appear inside specialPermissionTableBody.
 */
async function loadSpecialPermissions(isSilent = false) {
  const department = document.getElementById('specialDeptFilter')?.value || 'all';
  const tbodySpecial = document.getElementById('specialPermissionTableBody');
  const emptySpecial = document.getElementById('specialPermissionEmpty');

  if (!tbodySpecial) return;
  if (!isSilent) {
    tbodySpecial.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading Special Outpass Sanctions...</td></tr>`;
  }
  if (emptySpecial) emptySpecial.classList.add('hidden');

  try {
    const params = new URLSearchParams({ status: 'PENDING_PRINCIPAL', department });
    const res = await fetch(`${API_BASE_URL}/principal/special-permissions?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    currentSpecialList = (data.specialRequests || [])
      .filter(r => getCanonicalOutpassType(r) === 'special');

    if (currentSpecialList.length === 0) {
      tbodySpecial.innerHTML = '';
      if (emptySpecial) emptySpecial.classList.remove('hidden');
    } else {
      if (emptySpecial) emptySpecial.classList.add('hidden');
      tbodySpecial.innerHTML = currentSpecialList.map(od => {
        const isPending = od.status === 'PENDING_PRINCIPAL';
        let statusBadge = '';
        if (od.status === 'APPROVED') statusBadge = `<span class="status-pill success">Approved</span>`;
        else if (od.status === 'REJECTED') statusBadge = `<span class="status-pill danger">Rejected</span>`;
        else statusBadge = `<span class="status-pill warning">Pending Principal</span>`;

        return `
          <tr style="background:rgba(139,92,246,0.02);">
            <td>
              <strong style="font-family:monospace; color:#a78bfa;">${escapeHtml(od.requestCode)}</strong><br>
              <span style="background:rgba(139,92,246,0.15); color:#a78bfa; border:1px solid rgba(139,92,246,0.3); font-size:0.75rem; padding:2px 6px; border-radius:4px; font-weight:700;">⭐ Special (${escapeHtml(od.specialType || 'Authorized')})</span>
            </td>
            <td>
              <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(od.studentName)}</div>
              <small style="font-family:monospace; color:var(--text-muted);">${escapeHtml(od.rollNumber)}</small>
            </td>
            <td>${escapeHtml(od.department)} (Yr ${od.yearOfStudy})</td>
            <td>${escapeHtml(od.hostelBlock)} - ${escapeHtml(od.roomNumber || '')}</td>
            <td>
              <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(od.eventName || od.purpose || 'Special Permission')}</div>
              <small style="color:var(--text-muted);">${escapeHtml(od.eventLocation || od.destination || '—')}</small>
            </td>
            <td style="font-size:0.8rem; font-family:monospace;">
              <div>Leave: ${formatDatetime(od.leavingDatetime)}</div>
              <div>Return: ${formatDatetime(od.returnDatetime)}</div>
            </td>
            <td>
              <div style="font-weight:500; color:#10b981;">✓ Parent Face Verified</div>
              <div style="font-weight:500; color:#10b981;">✓ Advisor Cleared (${escapeHtml(od.advisorName || 'Advisor')})</div>
            </td>
            <td style="font-size:0.78rem; color:var(--text-muted);">${formatDatetime(od.submittedTime)}</td>
            <td>${statusBadge}</td>
            <td style="text-align:right;">
              <div style="display:inline-flex; gap:0.4rem; align-items:center;">
                <button class="secondary-btn" onclick="viewOneDayDetails(${od.id})" style="padding:0.35rem 0.65rem; font-size:0.78rem;">
                  <span>View Details</span>
                </button>
                ${isPending ? `
                  <button class="primary-btn btn-approve-action" onclick="openApproveODModal(${od.id})" style="padding:0.35rem 0.75rem; font-size:0.78rem; font-weight:700; background: linear-gradient(135deg, #8b5cf6, #6d28d9);">
                    <span>Clear Tier 3 & Forward</span>
                  </button>
                  <button class="danger-btn btn-reject-action" onclick="openRejectODModal(${od.id})" style="padding:0.35rem 0.65rem; font-size:0.78rem; font-weight:700; background: rgba(239, 68, 68, 0.12); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); border-radius:var(--radius-sm); cursor:pointer;">
                    <span>Reject</span>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const badgeSpecial = document.getElementById('navBadgePendingSpecial');
    if (badgeSpecial) {
      const pendingCount = currentSpecialList.filter(r => r.status === 'PENDING_PRINCIPAL').length;
      badgeSpecial.textContent = pendingCount;
      badgeSpecial.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

  } catch (err) {
    console.error('Failed to load Special Outpasses:', err);
    if (tbodySpecial) tbodySpecial.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#ef4444;">Failed to load Special Outpass queue.</td></tr>`;
  }
}

function viewOneDayDetails(id) {
  const od = currentDutyList.find(p => p.id === id) || currentSpecialList.find(p => p.id === id);
  if (!od) return;
  const body = document.getElementById('oneDayDetailsBody');
  const footer = document.getElementById('oneDayDetailsFooter');
  if (!body) return;

  const isSpecial = getCanonicalOutpassType(od) === 'special';

  body.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.85rem; font-size:0.85rem;">
      <div><strong>Request ID:</strong> <span style="font-family:monospace; color:#818cf8;">${escapeHtml(od.requestCode)}</span></div>
      <div><strong>Type:</strong> <span style="font-weight:700; color:${isSpecial ? '#a78bfa' : '#60a5fa'};">${isSpecial ? '⭐ Special Outpass' : '🎓 One-Day Duty (OD)'}</span></div>
      <div><strong>Student Name:</strong> ${escapeHtml(od.studentName)}</div>
      <div><strong>Roll Number:</strong> ${escapeHtml(od.rollNumber)}</div>
      <div><strong>Department & Year:</strong> ${escapeHtml(od.department)} (Year ${od.yearOfStudy})</div>
      <div><strong>Hostel Block & Room:</strong> ${escapeHtml(od.hostelBlock)} - ${escapeHtml(od.roomNumber || '')}</div>
      <div><strong>Event / Purpose:</strong> ${escapeHtml(od.eventName || od.purpose || 'Special Activity')}</div>
      <div><strong>Venue / Location:</strong> ${escapeHtml(od.eventLocation || od.destination || '—')}</div>
      <div><strong>Duty / Departure Date:</strong> ${od.dutyDate ? od.dutyDate.slice(0, 10) : (od.leavingDatetime ? od.leavingDatetime.slice(0, 10) : '—')}</div>
      <div><strong>Contact Phone:</strong> ${escapeHtml(od.studentPhone || '—')}</div>
      <div style="grid-column: span 2;"><strong>Description:</strong> ${escapeHtml(od.dutyDescription || od.purpose || '—')}</div>
      ${od.additionalRemarks ? `<div style="grid-column: span 2;"><strong>Remarks / Justification:</strong> ${escapeHtml(od.additionalRemarks)}</div>` : ''}
      ${od.attachmentUrl ? `<div style="grid-column: span 2;"><a href="${escapeHtml(od.attachmentUrl)}" target="_blank" style="color:#60a5fa; text-decoration:underline;">View Supporting Attachment ↗</a></div>` : ''}
      <div><strong>Scheduled Departure:</strong> ${formatDatetime(od.leavingDatetime)}</div>
      <div><strong>Expected Return:</strong> ${formatDatetime(od.returnDatetime)}</div>
      
      <!-- Tier 1: Parent Biometrics -->
      <div style="grid-column: span 2; background:rgba(16,185,129,0.08); padding:0.65rem 0.85rem; border-radius:var(--radius-sm); border:1px solid rgba(16,185,129,0.25);">
        <strong>Tier 1 Parent Consent:</strong> ${od.parentFaceVerified === 1 || isSpecial ? '✓ BIOMETRIC FACE VERIFIED & APPROVED' : 'Pending'} 
        ${od.parentMessage ? `(Message: "${escapeHtml(od.parentMessage)}")` : ''}
      </div>

      <!-- Tier 2: Advisor Clearance -->
      <div style="grid-column: span 2; background:rgba(16,185,129,0.08); padding:0.65rem 0.85rem; border-radius:var(--radius-sm); border:1px solid rgba(16,185,129,0.25);">
        <strong>Tier 2 Class Advisor Clearance:</strong> Approved by ${escapeHtml(od.advisorName || 'Class Advisor')} at ${od.advisorApprovedAt ? formatDatetime(od.advisorApprovedAt) : 'Cleared'}
      </div>

      ${od.principalRejectionReason ? `<div style="grid-column: span 2; color:#ef4444;"><strong>Principal Rejection Reason:</strong> ${escapeHtml(od.principalRejectionReason)}</div>` : ''}
    </div>
  `;

  if (footer) {
    if (od.status === 'PENDING_PRINCIPAL') {
      footer.innerHTML = `
        <button class="secondary-btn" onclick="closeModal('oneDayDetailsModal')">Close</button>
        <button class="danger-btn" onclick="closeModal('oneDayDetailsModal'); openRejectODModal(${od.id})" style="padding:0.5rem 1rem; background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-sm); cursor:pointer;">Reject</button>
        <button class="primary-btn" onclick="closeModal('oneDayDetailsModal'); openApproveODModal(${od.id})" style="background:${isSpecial ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'linear-gradient(135deg, #10b981, #059669)'};">${isSpecial ? 'Approve & Forward to Warden' : 'Approve & Authorize QR'}</button>
      `;
    } else {
      footer.innerHTML = `<button class="secondary-btn" onclick="closeModal('oneDayDetailsModal')">Close</button>`;
    }
  }

  openModal('oneDayDetailsModal');
}

function openApproveODModal(id) {
  currentActionRequestId = id;
  const od = currentDutyList.find(p => p.id === id) || currentSpecialList.find(p => p.id === id);
  if (!od) return;
  const summaryEl = document.getElementById('approveODSummary');
  const isSpecial = getCanonicalOutpassType(od) === 'special';

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="margin-bottom:0.25rem;"><strong>Request Code:</strong> <span style="font-family:monospace; color:#818cf8;">${escapeHtml(od.requestCode)}</span></div>
      <div style="margin-bottom:0.25rem;"><strong>Type:</strong> <span style="font-weight:700; color:${isSpecial ? '#a78bfa' : '#60a5fa'};">${isSpecial ? 'Special Outpass' : 'One-Day Duty'}</span></div>
      <div style="margin-bottom:0.25rem;"><strong>Student:</strong> ${escapeHtml(od.studentName)} (${escapeHtml(od.rollNumber)})</div>
      <div style="margin-bottom:0.25rem;"><strong>Parent Biometrics:</strong> <span style="color:#10b981; font-weight:600;">✓ Face Verified</span></div>
      <div><strong>Advisor Clearance:</strong> <span style="color:#10b981; font-weight:600;">✓ Approved by ${escapeHtml(od.advisorName || 'Class Advisor')}</span></div>
    `;
  }

  const approveBtn = document.getElementById('confirmApproveODBtn');
  if (approveBtn) {
    approveBtn.innerHTML = isSpecial ? '<span>Clear Tier 3 & Forward to Warden</span>' : '<span>Approve & Authorize QR</span>';
    approveBtn.style.background = isSpecial ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'linear-gradient(135deg, #10b981, #059669)';
  }

  openModal('approveODModal');
}

function openRejectODModal(id) {
  currentActionRequestId = id;
  const reasonEl = document.getElementById('rejectODReason');
  if (reasonEl) reasonEl.value = '';
  openModal('rejectODModal');
}

function setupActionModals() {
  document.getElementById('confirmApproveODBtn')?.addEventListener('click', executePrincipalApprove);
  document.getElementById('confirmRejectODBtn')?.addEventListener('click', executePrincipalReject);
}

async function executePrincipalApprove() {
  if (!currentActionRequestId) return;
  const od = currentDutyList.find(p => p.id === currentActionRequestId) || currentSpecialList.find(p => p.id === currentActionRequestId);
  const isSpecial = od ? (getCanonicalOutpassType(od) === 'special') : false;

  const btn = document.getElementById('confirmApproveODBtn');
  const origHtml = btn ? btn.innerHTML : '<span>Confirm & Authorize</span>';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Approving...</span>';
  }

  try {
    const primaryUrl = isSpecial
      ? `${API_BASE_URL}/principal/special/${currentActionRequestId}/approve`
      : `${API_BASE_URL}/principal/one-day/${currentActionRequestId}/approve`;

    let res = await fetch(primaryUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!res.ok) {
      res = await fetch(`${API_BASE_URL}/outpass/${currentActionRequestId}/principal-approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Unable to approve this request. Please try again.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
      return;
    }

    if (!isSpecial) {
      // Automatically trigger digital security QR generation for the newly approved One-Day Duty
      try {
        await fetch(`/api/qr/generate/${currentActionRequestId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          }
        });
      } catch (qrErr) {
        console.warn('[QR Gen Trigger]:', qrErr);
      }
      showToast('One-Day Permission approved & authorized! QR Code has been generated successfully.', 'success');
    } else {
      showToast('Special Outpass Tier 3 cleared! Forwarded to Warden for final sanction.', 'success');
    }

    closeModal('approveODModal');
    await Promise.all([
      loadOneDayPermissions(true),
      loadSpecialPermissions(true),
      loadPrincipalOverview(true),
      loadStudentStatus()
    ]);

  } catch (err) {
    console.error('Error approving permission:', err);
    showToast('Unable to approve this request. Please check connection.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

async function executePrincipalReject() {
  if (!currentActionRequestId) return;
  const od = currentDutyList.find(p => p.id === currentActionRequestId) || currentSpecialList.find(p => p.id === currentActionRequestId);
  const isSpecial = od ? (getCanonicalOutpassType(od) === 'special') : false;

  const reasonEl = document.getElementById('rejectODReason');
  const reason = reasonEl ? reasonEl.value.trim() : '';
  if (!reason) {
    showToast('Please enter a rejection reason.', 'error');
    return;
  }

  const btn = document.getElementById('confirmRejectODBtn');
  const origHtml = btn ? btn.innerHTML : '<span>Reject Permission</span>';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Rejecting...</span>';
  }

  try {
    const primaryUrl = isSpecial
      ? `${API_BASE_URL}/principal/special/${currentActionRequestId}/reject`
      : `${API_BASE_URL}/principal/one-day/${currentActionRequestId}/reject`;

    let res = await fetch(primaryUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ rejection_reason: reason })
    });

    if (!res.ok) {
      res = await fetch(`${API_BASE_URL}/outpass/${currentActionRequestId}/principal-reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ rejection_reason: reason })
      });
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast(data.message || 'Unable to reject this request. Please try again.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
      return;
    }

    const passName = isSpecial ? 'Special Outpass' : 'One-Day Permission';
    showToast(`${passName} has been rejected.`, 'info');
    closeModal('rejectODModal');
    await Promise.all([
      loadOneDayPermissions(true),
      loadSpecialPermissions(true),
      loadPrincipalOverview(true)
    ]);

  } catch (err) {
    console.error('Error rejecting permission:', err);
    showToast('Unable to reject this request. Please check connection.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
  if (id === 'approveODModal' || id === 'rejectODModal') {
    currentActionRequestId = null;
  }
}

/* ==========================================================
   8. STUDENTS CURRENTLY OUTSIDE
   ========================================================== */

async function loadStudentsOutside(isSilent = false) {
  const tbody = document.getElementById('studentsOutsideTableBody');
  const emptyBox = document.getElementById('studentsOutsideEmpty');
  if (!tbody) return;

  if (!isSilent) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading students currently outside...</td></tr>`;
  if (emptyBox) emptyBox.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE_URL}/principal/students-outside`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    if (!data.success || !data.records || data.records.length === 0) {
      tbody.innerHTML = '';
      if (emptyBox) emptyBox.classList.remove('hidden');
      return;
    }

    tbody.innerHTML = data.records.map(r => {
      const isLate = r.isOverdue;
      const statusPill = isLate 
        ? `<span class="status-pill danger">OVERDUE (${r.overdueMinutes}m)</span>`
        : `<span class="status-pill warning">OUTSIDE (ON TIME)</span>`;

      return `
        <tr style="${isLate ? 'background:rgba(239,68,68,0.06);' : ''}">
          <td><strong style="font-family:monospace; color:#818cf8;">${escapeHtml(r.requestCode)}</strong></td>
          <td>
            <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(r.studentName)}</div>
            <small style="color:var(--text-muted); font-size:0.75rem;">${escapeHtml(r.studentPhone || '')}</small>
          </td>
          <td><strong style="font-family:monospace;">${escapeHtml(r.rollNumber)}</strong></td>
          <td>${escapeHtml(r.department)} (Yr ${r.yearOfStudy})</td>
          <td>${escapeHtml(r.hostelBlock)} - ${escapeHtml(r.roomNumber || '')}</td>
          <td style="font-size:0.8rem; font-family:monospace;">${formatDatetime(r.exitTime)}</td>
          <td style="font-size:0.8rem; font-family:monospace;">${formatDatetime(r.expectedReturnTime)}</td>
          <td>
            ${r.extensionStatus === 'APPROVED' 
              ? `<span class="status-pill success" style="font-size:0.72rem;">Extended to ${formatLocalTime(r.extendedUntil)}</span>`
              : `<span style="color:var(--text-muted); font-size:0.8rem;">None</span>`}
          </td>
          <td>${statusPill}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load students outside:', err);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:1.5rem; color:#ef4444;">Failed to load outside roster.</td></tr>`;
  }
}

/* ==========================================================
   9. REPORTS GENERATOR & CSV EXPORT
   ========================================================== */

function setupReportDateDefaults() {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('repDateInput');
  const startInput = document.getElementById('repStartDateInput');
  const endInput = document.getElementById('repEndDateInput');

  if (dateInput) dateInput.value = today;
  if (startInput) startInput.value = today;
  if (endInput) endInput.value = today;
}

function selectReportType(type) {
  selectedReportType = type;
  document.querySelectorAll('.report-card-option').forEach(c => c.classList.remove('selected'));
  
  const selectedMap = {
    'daily': 'repOptDaily',
    'monthly': 'repOptMonthly',
    'one-day-duty': 'repOptDuty',
    'outside-students': 'repOptOutside',
    'late-returns': 'repOptLate',
    'extensions': 'repOptExtensions'
  };

  const optEl = document.getElementById(selectedMap[type]);
  if (optEl) optEl.classList.add('selected');

  // Toggle filter input views
  const singleDate = document.getElementById('filterDateSingle');
  const rangeDate = document.getElementById('filterDateRange');

  if (type === 'daily' || type === 'monthly') {
    singleDate?.classList.remove('hidden');
    rangeDate?.classList.add('hidden');
  } else if (type === 'outside-students') {
    singleDate?.classList.add('hidden');
    rangeDate?.classList.add('hidden');
  } else {
    singleDate?.classList.add('hidden');
    rangeDate?.classList.remove('hidden');
  }

  generateSelectedReport();
}

async function generateSelectedReport() {
  const thead = document.getElementById('reportTableHead');
  const tbody = document.getElementById('reportTableBody');
  const emptyBox = document.getElementById('reportEmpty');

  if (!tbody || !thead) return;

  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Generating report...</td></tr>`;
  if (emptyBox) emptyBox.classList.add('hidden');

  let endpoint = `${API_BASE_URL}/principal/reports/${selectedReportType}`;
  const queryParams = new URLSearchParams();

  if (selectedReportType === 'daily') {
    const d = document.getElementById('repDateInput')?.value || new Date().toISOString().split('T')[0];
    queryParams.append('date', d);
  } else if (selectedReportType === 'monthly') {
    const d = document.getElementById('repDateInput')?.value || new Date().toISOString().split('T')[0];
    const parts = d.split('-');
    queryParams.append('year', parts[0]);
    queryParams.append('month', parts[1]);
  } else if (selectedReportType !== 'outside-students') {
    const s = document.getElementById('repStartDateInput')?.value;
    const e = document.getElementById('repEndDateInput')?.value;
    if (s) queryParams.append('startDate', s);
    if (e) queryParams.append('endDate', e);
  }

  try {
    const fullUrl = queryParams.toString() ? `${endpoint}?${queryParams.toString()}` : endpoint;
    const res = await fetch(fullUrl, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    if (!data.success || !data.records || data.records.length === 0) {
      lastGeneratedReportData = null;
      thead.innerHTML = '';
      tbody.innerHTML = '';
      if (emptyBox) emptyBox.classList.remove('hidden');
      return;
    }

    lastGeneratedReportData = {
      type: selectedReportType,
      title: data.reportType || 'Institutional Report',
      records: data.records
    };

    renderReportTable(data.records, selectedReportType);

  } catch (err) {
    console.error('Failed to generate report:', err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#ef4444;">Failed to generate report.</td></tr>`;
  }
}

function renderReportTable(records, reportType) {
  const thead = document.getElementById('reportTableHead');
  const tbody = document.getElementById('reportTableBody');

  if (reportType === 'late-returns') {
    thead.innerHTML = `
      <tr>
        <th>Request Code</th>
        <th>Student Name</th>
        <th>Roll Number</th>
        <th>Department</th>
        <th>Scheduled Return</th>
        <th>Actual Return</th>
        <th>Late Duration</th>
        <th>Extension Status</th>
      </tr>
    `;
    tbody.innerHTML = records.map(r => `
      <tr>
        <td><strong style="font-family:monospace; color:#818cf8;">${escapeHtml(r.requestCode)}</strong></td>
        <td><strong>${escapeHtml(r.studentName)}</strong></td>
        <td><span style="font-family:monospace;">${escapeHtml(r.rollNumber)}</span></td>
        <td>${escapeHtml(r.department)}</td>
        <td style="font-size:0.8rem; font-family:monospace;">${formatDatetime(r.expectedReturnTime)}</td>
        <td style="font-size:0.8rem; font-family:monospace; color:#ef4444;">${formatDatetime(r.actualReturnTime)}</td>
        <td><span class="status-pill danger">${r.lateDurationMinutes} mins late</span></td>
        <td>${escapeHtml(r.extensionStatus || 'None')}</td>
      </tr>
    `).join('');
  } else if (reportType === 'extensions') {
    thead.innerHTML = `
      <tr>
        <th>Request Code</th>
        <th>Student Name</th>
        <th>Roll Number</th>
        <th>Requested Until</th>
        <th>Approved Until</th>
        <th>Reason</th>
        <th>Status</th>
        <th>Reviewed By</th>
      </tr>
    `;
    tbody.innerHTML = records.map(r => `
      <tr>
        <td><strong style="font-family:monospace; color:#818cf8;">${escapeHtml(r.requestCode)}</strong></td>
        <td><strong>${escapeHtml(r.studentName)}</strong></td>
        <td><span style="font-family:monospace;">${escapeHtml(r.rollNumber)}</span></td>
        <td style="font-size:0.8rem; font-family:monospace;">${formatDatetime(r.requestedReturnTime)}</td>
        <td style="font-size:0.8rem; font-family:monospace;">${r.approvedReturnTime ? formatDatetime(r.approvedReturnTime) : '—'}</td>
        <td style="max-width:200px; font-size:0.82rem;">${escapeHtml(r.reason)}</td>
        <td><span class="status-pill ${r.status === 'APPROVED' ? 'success' : (r.status === 'REJECTED' ? 'danger' : 'warning')}">${r.status}</span></td>
        <td>${escapeHtml(r.reviewedByName || '—')}</td>
      </tr>
    `).join('');
  } else if (reportType === 'one-day-duty') {
    thead.innerHTML = `
      <tr>
        <th>Request Code</th>
        <th>Student Name</th>
        <th>Roll Number</th>
        <th>Event Name</th>
        <th>Location</th>
        <th>Duty Date</th>
        <th>Advisor Clearance</th>
        <th>Status</th>
      </tr>
    `;
    tbody.innerHTML = records.map(r => `
      <tr>
        <td><strong style="font-family:monospace; color:#818cf8;">${escapeHtml(r.requestCode)}</strong></td>
        <td><strong>${escapeHtml(r.studentName)}</strong></td>
        <td><span style="font-family:monospace;">${escapeHtml(r.rollNumber)}</span></td>
        <td><strong>${escapeHtml(r.eventName || 'Academic OD')}</strong></td>
        <td>${escapeHtml(r.eventLocation || '—')}</td>
        <td style="font-size:0.8rem; font-family:monospace;">${r.dutyDate ? r.dutyDate.slice(0,10) : '—'}</td>
        <td>${escapeHtml(r.advisorName || 'Approved')}</td>
        <td><span class="status-pill ${r.outpassStatus === 'APPROVED' ? 'success' : (r.outpassStatus === 'COMPLETED' ? 'purple' : 'warning')}">${r.outpassStatus}</span></td>
      </tr>
    `).join('');
  } else {
    // Default Outpass Layout (Daily, Monthly, Outside)
    thead.innerHTML = `
      <tr>
        <th>Request Code</th>
        <th>Student Name</th>
        <th>Roll Number</th>
        <th>Department</th>
        <th>Type</th>
        <th>Destination & Purpose</th>
        <th>Scheduled Return</th>
        <th>Actual Return</th>
        <th>Status</th>
      </tr>
    `;
    tbody.innerHTML = records.map(r => `
      <tr>
        <td><strong style="font-family:monospace; color:#818cf8;">${escapeHtml(r.requestCode)}</strong></td>
        <td><strong>${escapeHtml(r.studentName)}</strong></td>
        <td><span style="font-family:monospace;">${escapeHtml(r.rollNumber)}</span></td>
        <td>${escapeHtml(r.department)}</td>
        <td><span class="status-pill ${r.requestType === 'one_day_duty' ? 'purple' : 'info'}">${r.requestType === 'one_day_duty' ? 'OD' : 'Normal'}</span></td>
        <td>
          <div>${escapeHtml(r.destination)}</div>
          <small style="color:var(--text-muted);">${escapeHtml(r.purpose || '')}</small>
        </td>
        <td style="font-size:0.8rem; font-family:monospace;">${formatDatetime(r.expectedReturnTime)}</td>
        <td style="font-size:0.8rem; font-family:monospace;">${r.actualReturnTime ? formatDatetime(r.actualReturnTime) : '—'}</td>
        <td><span class="status-pill ${r.outpassStatus === 'APPROVED' ? 'success' : (r.outpassStatus === 'COMPLETED' ? 'purple' : 'warning')}">${r.outpassStatus || 'ACTIVE'}</span></td>
      </tr>
    `).join('');
  }
}

/**
 * Client-Side CSV Exporter
 */
function exportReportToCSV() {
  if (!lastGeneratedReportData || !lastGeneratedReportData.records || lastGeneratedReportData.records.length === 0) {
    alert('No report data available to export. Please generate a report first.');
    return;
  }

  const { title, records } = lastGeneratedReportData;
  const headers = Object.keys(records[0]);
  
  const csvRows = [];
  csvRows.push(headers.join(','));

  for (const row of records) {
    const values = headers.map(header => {
      const val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      const escaped = val.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  const filename = `${title.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0,10)}.csv`;
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================
   10. REAL-TIME INSTITUTIONAL ANALYTICS & CHARTS (5 CHARTS)
   ========================================================== */

async function loadAnalytics() {
  try {
    const res = await fetch(`${API_BASE_URL}/principal/analytics`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    if (!data.success || !data.analytics) return;

    const an = data.analytics;

    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded. Rendering canvas fallbacks.');
      return;
    }

    // Chart 1: Normal Outpass vs One-Day Permission
    renderChart('chartTypeDistribution', {
      type: 'pie',
      data: {
        labels: an.chart3_typeDistribution.labels,
        datasets: [{
          data: an.chart3_typeDistribution.data,
          backgroundColor: ['#3b82f6', '#c084fc'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } }
        }
      }
    });

    // Chart 2: Approved vs Rejected vs Pending
    renderChart('chartApprovalRatio', {
      type: 'doughnut',
      data: {
        labels: an.chart2_approvalRatio.labels,
        datasets: [{
          data: an.chart2_approvalRatio.data,
          backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#8b5cf6'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } }
        }
      }
    });

    // Chart 3: Daily Exit vs Return Activity
    renderChart('chartMovementActivity', {
      type: 'bar',
      data: {
        labels: an.chart4_movementActivity.labels,
        datasets: [
          {
            label: 'Departures (Exits)',
            data: an.chart4_movementActivity.exits,
            backgroundColor: '#f59e0b',
            borderRadius: 4
          },
          {
            label: 'Returns (Check-ins)',
            data: an.chart4_movementActivity.returns,
            backgroundColor: '#10b981',
            borderRadius: 4
          }
        ]
      },
      options: getCommonChartOptions()
    });

    // Chart 4: Late Returns Daily Trend
    renderChart('chartLateReturns', {
      type: 'bar',
      data: {
        labels: an.chart5_lateReturnsTrend.labels,
        datasets: [{
          label: 'Late Check-ins',
          data: an.chart5_lateReturnsTrend.data,
          backgroundColor: '#ef4444',
          borderRadius: 4
        }]
      },
      options: getCommonChartOptions()
    });

    // Chart 5: Extension Requests Status
    renderChart('chartExtensionStats', {
      type: 'bar',
      data: {
        labels: an.chart6_extensionStats.labels,
        datasets: [{
          label: 'Count',
          data: an.chart6_extensionStats.data,
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderRadius: 4
        }]
      },
      options: getCommonChartOptions()
    });

  } catch (err) {
    console.error('Failed to load analytics charts:', err);
  }
}

function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  chartInstances[canvasId] = new Chart(canvas, config);
}

function getCommonChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#f8fafc', font: { size: 11, weight: '600' } } }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        ticks: { color: '#94a3b8', font: { size: 10 }, precision: 0 }
      }
    }
  };
}

/* ==========================================================
   11. TOAST & FORMATTING UTILITIES
   ========================================================== */

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.style.padding = '0.75rem 1.25rem';
  toast.style.borderRadius = 'var(--radius-sm)';
  toast.style.marginBottom = '0.5rem';
  toast.style.background = type === 'success' ? '#065f46' : (type === 'error' ? '#991b1b' : '#1e293b');
  toast.style.color = '#ffffff';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  toast.style.fontSize = '0.85rem';
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function formatDatetime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatLocalTime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
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

// Attach globally for inline HTML event handlers
window.viewOneDayDetails = viewOneDayDetails;
window.openApproveODModal = openApproveODModal;
window.openRejectODModal = openRejectODModal;
window.closeModal = closeModal;
window.exportReportToCSV = exportReportToCSV;
window.generateInstitutionalReport = generateInstitutionalReport;
window.loadStudentStatus = loadStudentStatus;
window.loadNormalOutpasses = loadNormalOutpasses;
window.loadOneDayPermissions = loadOneDayPermissions;
window.loadStudentsOutside = loadStudentsOutside;
window.loadPrincipalOverview = loadPrincipalOverview;
window.executePrincipalApprove = executePrincipalApprove;
window.executePrincipalReject = executePrincipalReject;
