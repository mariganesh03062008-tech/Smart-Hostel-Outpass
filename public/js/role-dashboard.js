/**
 * Smart Hostel Outpass Management System
 * Unified Role Dashboard Controller
 */

// Mapping of normalized roles to dashboard files
const ROLE_TO_DASHBOARD = {
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

function normalizeRole(role) {
  if (!role || typeof role !== 'string') return '';
  const clean = role.toLowerCase().trim().replace(/[- ]/g, '_');
  if (clean === 'advisor' || clean === 'classadvisor') return 'class_advisor';
  if (clean === 'security' || clean === 'guard') return 'watchman';
  return clean;
}

/**
 * Initializes a role-protected dashboard page
 * @param {string} expectedRole - Expected role for this specific dashboard
 */
async function initRoleDashboard(expectedRole) {
  initTheme();
  initLogout();

  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');

  if (!token) {
    console.warn('[Auth] No token found. Redirecting to login.');
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
      console.warn('[Auth] Token invalid or expired.');
      clearAuthAndRedirect();
      return;
    }

    const data = await response.json();

    if (!data.success || !data.user) {
      clearAuthAndRedirect();
      return;
    }

    const user = data.user;
    const userRole = normalizeRole(user.role);
    const requiredRole = normalizeRole(expectedRole);

    // Strict Role Authorization Check:
    // If user's authenticated role does not match this page, redirect to user's own dashboard
    if (requiredRole && userRole !== requiredRole) {
      console.warn(`[Auth] Role mismatch! User is '${userRole}' but dashboard requires '${requiredRole}'. Redirecting...`);
      const correctDashboard = ROLE_TO_DASHBOARD[userRole] || '/student-dashboard.html';
      window.location.href = correctDashboard;
      return;
    }

    // Populate user profile info in DOM
    populateDashboardUI(user);

  } catch (error) {
    console.error('[Auth] Error verifying session:', error);
  }
}

function populateDashboardUI(user) {
  const displayName = user.name || user.father_name || user.mother_name || 'User';
  const role = user.role || 'student';
  const identifier = user.reg_no || user.staff_id || user.primary_phone || user.email || 'N/A';
  const email = user.email || 'Not Provided';
  const dept = user.department || (role === 'student' ? `${user.department || 'N/A'} (Year ${user.year_of_study || '-'})` : 'N/A');
  const block = user.hostel_block ? `${user.hostel_block} ${user.room_no ? '(Room ' + user.room_no + ')' : ''}` : (user.address || 'Campus');

  const el = {
    userName: document.getElementById('userName'),
    userAvatar: document.getElementById('userAvatar'),
    userMetaDetails: document.getElementById('userMetaDetails'),
    fieldFullName: document.getElementById('fieldFullName'),
    fieldRole: document.getElementById('fieldRole'),
    fieldIdentifier: document.getElementById('fieldIdentifier'),
    fieldEmail: document.getElementById('fieldEmail'),
    fieldDept: document.getElementById('fieldDept'),
    fieldBlock: document.getElementById('fieldBlock')
  };

  if (el.userName) el.userName.textContent = displayName;
  if (el.userAvatar) el.userAvatar.textContent = displayName.charAt(0).toUpperCase();
  if (el.userMetaDetails) el.userMetaDetails.textContent = `ID: ${identifier} • Email: ${email}`;
  if (el.fieldFullName) el.fieldFullName.textContent = displayName;
  if (el.fieldRole) el.fieldRole.textContent = role.toUpperCase().replace('_', ' ');
  if (el.fieldIdentifier) el.fieldIdentifier.textContent = identifier;
  if (el.fieldEmail) el.fieldEmail.textContent = email;
  if (el.fieldDept) el.fieldDept.textContent = dept;
  if (el.fieldBlock) el.fieldBlock.textContent = block;
}

function initLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
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

function initTheme() {
  const savedTheme = localStorage.getItem('sh_theme') || 'dark';
  applyTheme(savedTheme);

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sh_theme', theme);

  const darkIcon = document.getElementById('themeIconDark');
  const lightIcon = document.getElementById('themeIconLight');

  if (theme === 'light') {
    if (darkIcon) darkIcon.classList.add('hidden');
    if (lightIcon) lightIcon.classList.remove('hidden');
  } else {
    if (darkIcon) darkIcon.classList.remove('hidden');
    if (lightIcon) lightIcon.classList.add('hidden');
  }
}
