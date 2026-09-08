/**
 * Smart Hostel Outpass Management System
 * Dashboard Client Controller
 */

// Role metadata configuration for dashboards
const ROLE_DASHBOARDS = {
  student: {
    badge: 'Student Portal',
    title: 'Student Dashboard',
    description: 'Manage hostel outpasses, on-duty approvals, and view digital gate pass tokens.',
    modules: [
      { title: 'Apply for Outpass', desc: 'Request regular, emergency, or vacation outpasses with parent consent routing.', icon: 'file-text', status: 'Upcoming' },
      { title: 'One Day Duty (OD)', desc: 'Submit on-duty pass requests for symposiums, events, and college activities.', icon: 'award', status: 'Upcoming' },
      { title: 'Active QR Gate Pass', desc: 'View your cryptographic QR pass token for scanning at the security gate.', icon: 'qr-code', status: 'Upcoming' },
      { title: 'Request Time Extension', desc: 'Request warden permission to extend your scheduled return time.', icon: 'clock', status: 'Upcoming' }
    ]
  },
  parent: {
    badge: 'Parent Portal',
    title: 'Parent Dashboard',
    description: 'Review outpass applications, grant digital consent, and track gate movement.',
    modules: [
      { title: 'Consent Requests', desc: 'Approve or reject outpass requests initiated by your ward.', icon: 'check-circle', status: 'Upcoming' },
      { title: 'Gate Movement Logs', desc: 'Real-time timestamps when your ward departs and returns through the gate.', icon: 'activity', status: 'Upcoming' },
      { title: 'Warden Communication', desc: 'Direct secure messaging channel with the hostel warden.', icon: 'message-square', status: 'Upcoming' }
    ]
  },
  warden: {
    badge: 'Warden Portal',
    title: 'Warden Dashboard',
    description: 'Hostel outpass authorization, emergency overrides, and hostel block oversight.',
    modules: [
      { title: 'Pending Authorizations', desc: 'Review outpasses cleared by parents and class advisors.', icon: 'shield', status: 'Upcoming' },
      { title: 'Active Students Outside', desc: 'Live census of students currently out of hostel premises.', icon: 'users', status: 'Upcoming' },
      { title: 'Overstay & Late Alerts', desc: 'Automated warnings for students exceeding approved return deadlines.', icon: 'alert-triangle', status: 'Upcoming' },
      { title: 'Extension Approvals', desc: 'Review student extension requests and parent verification.', icon: 'clock', status: 'Upcoming' }
    ]
  },
  principal: {
    badge: 'Principal Administration',
    title: 'Principal Dashboard',
    description: 'Institutional hostel analytics, high-level escalations, and administrative reports.',
    modules: [
      { title: 'Campus Movement Overview', desc: 'Institutional analytics of outpass trends across departments.', icon: 'bar-chart', status: 'Upcoming' },
      { title: 'Special Event Clearance', desc: 'Mass outpass authorizations for college-wide events.', icon: 'award', status: 'Upcoming' },
      { title: 'Security Audit Logs', desc: 'Comprehensive gate entry and exit verification logs.', icon: 'file-text', status: 'Upcoming' }
    ]
  },
  class_advisor: {
    badge: 'Class Advisor Portal',
    title: 'Class Advisor Dashboard',
    description: 'Academic clearance, On-Duty pass verifications, and department student tracking.',
    modules: [
      { title: 'Advisor Clearance Queue', desc: 'Verify academic schedule before recommending outpasses to Warden.', icon: 'check-square', status: 'Upcoming' },
      { title: 'OD Pass Approvals', desc: 'Validate symposium and paper presentation certificates.', icon: 'award', status: 'Upcoming' },
      { title: 'Department Attendance Logs', desc: 'Monitor hostel departure impact on classroom attendance.', icon: 'calendar', status: 'Upcoming' }
    ]
  },
  caretaker: {
    badge: 'Hostel Caretaker',
    title: 'Caretaker Dashboard',
    description: 'Room occupancy audit, floor night roll-call, and hostel maintenance status.',
    modules: [
      { title: 'Room Occupancy Audit', desc: 'Check present vs absent students per room and floor block.', icon: 'home', status: 'Upcoming' },
      { title: 'Night Attendance Verification', desc: 'Confirm physical presence for hostel night roll calls.', icon: 'list', status: 'Upcoming' },
      { title: 'Facility Issues', desc: 'Log room maintenance requests and hostel status reports.', icon: 'tool', status: 'Upcoming' }
    ]
  },
  watchman: {
    badge: 'Gate Security Staff',
    title: 'Gate Security Dashboard',
    description: 'Instant QR code gate scanning, manual verification, and timestamped exit/return audit.',
    modules: [
      { title: 'Scan Student QR Pass', desc: 'Verify cryptographic gate pass token using gate camera scanner.', icon: 'camera', status: 'Upcoming' },
      { title: 'Manual Search & Verify', desc: 'Lookup student by roll number in case of emergency verification.', icon: 'search', status: 'Upcoming' },
      { title: 'Gate Exit & Return Log', desc: 'Live feed of students passing through the security checkpoint.', icon: 'log-in', status: 'Upcoming' }
    ]
  }
};

// DOM Elements
const elements = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeIconDark: document.getElementById('themeIconDark'),
  themeIconLight: document.getElementById('themeIconLight'),
  logoutBtn: document.getElementById('logoutBtn'),
  btnRefreshProfile: document.getElementById('btnRefreshProfile'),
  dashBrandRole: document.getElementById('dashBrandRole'),
  dashRoleBadge: document.getElementById('dashRoleBadge'),
  noticeRoleName: document.getElementById('noticeRoleName'),
  userName: document.getElementById('userName'),
  userAvatar: document.getElementById('userAvatar'),
  userMetaDetails: document.getElementById('userMetaDetails'),
  roleModuleDescription: document.getElementById('roleModuleDescription'),
  modulesGrid: document.getElementById('modulesGrid'),
  fieldFullName: document.getElementById('fieldFullName'),
  fieldRole: document.getElementById('fieldRole'),
  fieldIdentifier: document.getElementById('fieldIdentifier'),
  fieldEmail: document.getElementById('fieldEmail'),
  fieldDept: document.getElementById('fieldDept'),
  fieldBlock: document.getElementById('fieldBlock')
};

// Global state
let currentUser = null;

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initLogout();
  await verifyAndLoadProfile();

  if (elements.btnRefreshProfile) {
    elements.btnRefreshProfile.addEventListener('click', verifyAndLoadProfile);
  }
});

/* ==========================================================
   1. AUTHENTICATION & PROFILE VERIFICATION
   ========================================================== */
async function verifyAndLoadProfile() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');

  if (!token) {
    console.warn('No authentication token found. Redirecting to login.');
    redirectToLogin();
    return;
  }

  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn('Auth token verification failed:', errorData.message || response.statusText);
      clearAuthAndRedirect();
      return;
    }

    const data = await response.json();
    if (data.success && data.user) {
      currentUser = data.user;
      renderDashboard(currentUser);
    } else {
      clearAuthAndRedirect();
    }
  } catch (err) {
    console.error('Error verifying profile:', err);
    // If backend connection fails temporarily, we notify the user
    if (elements.userName) {
      elements.userName.textContent = 'Session Connected';
    }
  }
}

/* ==========================================================
   2. RENDER DASHBOARD FOR ROLE
   ========================================================== */
function renderDashboard(user) {
  const role = (user.role || 'student').toLowerCase();
  const config = ROLE_DASHBOARDS[role] || ROLE_DASHBOARDS.student;

  const displayName = user.name || user.father_name || user.mother_name || 'User';
  const identifier = user.reg_no || user.staff_id || user.primary_phone || user.email || 'N/A';
  const email = user.email || 'Not Provided';
  const dept = user.department || (role === 'student' ? `${user.department || 'N/A'} (Yr ${user.year_of_study || '-'})` : 'N/A');
  const block = user.hostel_block ? `${user.hostel_block} ${user.room_no ? '(Room ' + user.room_no + ')' : ''}` : (user.address || 'Campus');

  // Update Header & Banner
  if (elements.dashBrandRole) elements.dashBrandRole.textContent = config.badge;
  if (elements.dashRoleBadge) elements.dashRoleBadge.textContent = config.badge;
  if (elements.noticeRoleName) elements.noticeRoleName.textContent = config.title;
  if (elements.userName) elements.userName.textContent = displayName;
  if (elements.userAvatar) elements.userAvatar.textContent = displayName.charAt(0).toUpperCase();
  if (elements.userMetaDetails) elements.userMetaDetails.textContent = `ID: ${identifier} • Email: ${email}`;
  if (elements.roleModuleDescription) elements.roleModuleDescription.textContent = config.description;

  // Update Profile Grid
  if (elements.fieldFullName) elements.fieldFullName.textContent = displayName;
  if (elements.fieldRole) elements.fieldRole.textContent = role.toUpperCase().replace('_', ' ');
  if (elements.fieldIdentifier) elements.fieldIdentifier.textContent = identifier;
  if (elements.fieldEmail) elements.fieldEmail.textContent = email;
  if (elements.fieldDept) elements.fieldDept.textContent = dept;
  if (elements.fieldBlock) elements.fieldBlock.textContent = block;

  // Render Modules Grid
  if (elements.modulesGrid) {
    elements.modulesGrid.innerHTML = '';
    config.modules.forEach((mod) => {
      const card = document.createElement('div');
      card.className = 'module-card';
      card.innerHTML = `
        <div class="module-card-top">
          <div class="module-icon-wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <span class="module-status-badge">${mod.status}</span>
        </div>
        <h3 class="module-title">${mod.title}</h3>
        <p class="module-desc">${mod.desc}</p>
      `;
      elements.modulesGrid.appendChild(card);
    });
  }

  document.title = `${config.title} - Smart Hostel Outpass`;
}

/* ==========================================================
   3. LOGOUT & REDIRECTS
   ========================================================== */
function initLogout() {
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', async () => {
      try {
        const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
        if (token) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => {});
        }
      } finally {
        clearAuthAndRedirect();
      }
    });
  }
}

function clearAuthAndRedirect() {
  localStorage.removeItem('sh_token');
  localStorage.removeItem('sh_user');
  sessionStorage.removeItem('sh_token');
  sessionStorage.removeItem('sh_user');
  redirectToLogin();
}

function redirectToLogin() {
  window.location.href = '/index.html';
}

/* ==========================================================
   4. THEME MANAGEMENT
   ========================================================== */
function initTheme() {
  const savedTheme = localStorage.getItem('sh_theme') || 'dark';
  applyTheme(savedTheme);

  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sh_theme', theme);

  if (theme === 'light') {
    if (elements.themeIconDark) elements.themeIconDark.classList.add('hidden');
    if (elements.themeIconLight) elements.themeIconLight.classList.remove('hidden');
  } else {
    if (elements.themeIconDark) elements.themeIconDark.classList.remove('hidden');
    if (elements.themeIconLight) elements.themeIconLight.classList.add('hidden');
  }
}
