/**
 * Smart Hostel Outpass Management System
 * Frontend Client Controller
 */

// Role metadata configuration
const ROLES_CONFIG = {
  student: {
    title: 'Student Login',
    badge: 'Student Portal',
    identifierLabel: 'Username',
    placeholder: 'Enter username / roll number (e.g. 21CS042)',
    btnText: 'Login',
    iconType: 'user',
    dashboardUrl: '/student-dashboard.html'
  },
  parent: {
    title: 'Parent Portal',
    badge: 'Parent Portal',
    identifierLabel: 'Mobile Number',
    placeholder: 'Enter registered mobile number',
    btnText: 'Sign In as Parent',
    iconType: 'users',
    dashboardUrl: '/parent-dashboard.html'
  },
  warden: {
    title: 'Warden Portal',
    badge: 'Warden Portal',
    identifierLabel: 'Warden Staff ID / Email',
    placeholder: 'e.g. WRD-101 or warden@hostel.edu',
    btnText: 'Sign In as Warden',
    iconType: 'shield',
    dashboardUrl: '/warden-dashboard.html'
  },
  principal: {
    title: 'Principal Portal',
    badge: 'Principal Portal',
    identifierLabel: 'Principal ID / Email',
    placeholder: 'e.g. PRC-001 or principal@college.edu',
    btnText: 'Sign In as Principal',
    iconType: 'award',
    dashboardUrl: '/principal-dashboard.html'
  },
  class_advisor: {
    title: 'Class Advisor Portal',
    badge: 'Class Advisor Portal',
    identifierLabel: 'Faculty ID / Employee Code',
    placeholder: 'e.g. ADV-204 or advisor@college.edu',
    btnText: 'Sign In as Class Advisor',
    iconType: 'briefcase',
    dashboardUrl: '/advisor-dashboard.html'
  },
  caretaker: {
    title: 'Caretaker Portal',
    badge: 'Caretaker Portal',
    identifierLabel: 'Caretaker ID / Email',
    placeholder: 'e.g. CTK-305 or caretaker@hostel.edu',
    btnText: 'Sign In as Caretaker',
    iconType: 'home',
    dashboardUrl: '/caretaker-dashboard.html'
  },
  watchman: {
    title: 'Gate Security Portal',
    badge: 'Gate Security / Watchman',
    identifierLabel: 'Security Guard ID / Gate Code',
    placeholder: 'e.g. SEC-001 or security@college.edu',
    btnText: 'Sign In as Gate Guard',
    iconType: 'key',
    dashboardUrl: '/watchman-dashboard.html'
  }
};

/**
 * Normalizes role string safely to prevent redirect bugs
 */
function normalizeRole(role) {
  if (!role || typeof role !== 'string') return 'student';
  const clean = role.toLowerCase().trim().replace(/[- ]/g, '_');
  if (clean === 'advisor' || clean === 'classadvisor') return 'class_advisor';
  if (clean === 'security' || clean === 'guard') return 'watchman';
  return clean;
}

/**
 * Resolves exact dashboard URL for role
 */
function getDashboardUrl(role) {
  const norm = normalizeRole(role);
  const map = {
    student: '/student-dashboard.html',
    parent: '/parent-dashboard.html',
    warden: '/warden-dashboard.html',
    principal: '/principal-dashboard.html',
    class_advisor: '/advisor-dashboard.html',
    caretaker: '/caretaker-dashboard.html',
    watchman: '/watchman-dashboard.html'
  };
  return map[norm] || '/student-dashboard.html';
}

// DOM Elements
const elements = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeIconDark: document.getElementById('themeIconDark'),
  themeIconLight: document.getElementById('themeIconLight'),
  systemStatusChip: document.getElementById('systemStatusChip'),
  statusDot: document.getElementById('statusDot'),
  statusLabel: document.getElementById('statusLabel'),
  dbBadge: document.getElementById('dbBadge'),
  diagHealth: document.getElementById('diagHealth'),
  diagDb: document.getElementById('diagDb'),
  diagSocket: document.getElementById('diagSocket'),
  btnTestApi: document.getElementById('btnTestApi'),
  roleBadge: document.getElementById('roleBadge'),
  authTitle: document.getElementById('authTitle'),
  authSubtitle: document.getElementById('authSubtitle'),
  roleTabs: document.getElementById('roleTabs'),
  loginForm: document.getElementById('loginForm'),
  selectedRoleInput: document.getElementById('selectedRole'),
  identifierLabel: document.getElementById('identifierLabel'),
  identifierInput: document.getElementById('identifierInput'),
  passwordInput: document.getElementById('passwordInput'),
  togglePasswordBtn: document.getElementById('togglePasswordBtn'),
  rememberMe: document.getElementById('rememberMe'),
  submitBtn: document.getElementById('submitBtn'),
  btnText: document.getElementById('btnText'),
  btnSpinner: document.getElementById('btnSpinner'),
  formAlert: document.getElementById('formAlert'),

  // Inline Parent Auth Elements
  parentCreateAccountBox: document.getElementById('parentCreateAccountBox'),
  parentRegisterForm: document.getElementById('parentRegisterForm'),
  parentRegName: document.getElementById('parentRegName'),
  parentRegMobile: document.getElementById('parentRegMobile'),
  parentRegPassword: document.getElementById('parentRegPassword'),
  parentRegConfirmPassword: document.getElementById('parentRegConfirmPassword'),
  btnParentRegisterSubmit: document.getElementById('btnParentRegisterSubmit'),

  // Inline Student Auth Elements
  studentCreateAccountBox: document.getElementById('studentCreateAccountBox'),
  studentRegisterForm: document.getElementById('studentRegisterForm'),
  studentRegName: document.getElementById('studentRegName'),
  studentRegUsername: document.getElementById('studentRegUsername'),
  studentRegEmail: document.getElementById('studentRegEmail'),
  studentRegPhone: document.getElementById('studentRegPhone'),
  studentRegDept: document.getElementById('studentRegDept'),
  studentRegYear: document.getElementById('studentRegYear'),
  studentRegBlock: document.getElementById('studentRegBlock'),
  studentRegRoom: document.getElementById('studentRegRoom'),
  studentRegParentName: document.getElementById('studentRegParentName'),
  studentRegParentPhone: document.getElementById('studentRegParentPhone'),
  studentRegPassword: document.getElementById('studentRegPassword'),
  studentRegConfirmPassword: document.getElementById('studentRegConfirmPassword'),
  btnStudentRegisterSubmit: document.getElementById('btnStudentRegisterSubmit')
};

// State
let currentRole = 'student';
let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initRoleTabs();
  initPasswordToggle();
  initFormHandler();
  initDiagnostics();
  initSocketIO();
  checkSavedSession();

  // Check URL parameters for pre-selected role
  const urlParams = new URLSearchParams(window.location.search);
  const requestedRole = urlParams.get('role');
  if (requestedRole && ROLES_CONFIG[requestedRole]) {
    switchRole(requestedRole);
  }
});

/* ==========================================================
   1. AUTO SESSION CHECK
   ========================================================== */
async function checkSavedSession() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      const targetDashboard = getDashboardUrl(data.user.role);
      showAlert(`You are already logged in as ${data.user.name}. Redirecting to dashboard...`, 'success');
      setTimeout(() => {
        window.location.href = targetDashboard;
      }, 500);
    }
  } catch (err) {
    // Silent fail if token expired
  }
}

/* ==========================================================
   2. THEME CONTROLLER
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

/* ==========================================================
   3. ROLE SWITCHER (UNIFIED STRUCTURAL LAYOUT FOR ALL ROLES)
   ========================================================== */
function initRoleTabs() {
  if (!elements.roleTabs) return;

  elements.roleTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.role-tab');
    if (!tab) return;

    const role = tab.dataset.role;
    if (role && ROLES_CONFIG[role]) {
      switchRole(role);
    }
  });
}

function switchRole(role) {
  currentRole = role;
  const config = ROLES_CONFIG[role];
  if (!config) return;

  // Update tabs UI
  document.querySelectorAll('.role-tab').forEach((tab) => {
    if (tab.dataset.role === role) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Ensure standard loginForm is visible and registration forms are hidden
  if (elements.loginForm) elements.loginForm.classList.remove('hidden');
  if (elements.parentRegisterForm) elements.parentRegisterForm.classList.add('hidden');
  if (elements.studentRegisterForm) elements.studentRegisterForm.classList.add('hidden');

  // Update standard form inputs and labels matching the exact Student layout
  if (elements.selectedRoleInput) elements.selectedRoleInput.value = role;
  if (elements.roleBadge) elements.roleBadge.textContent = config.badge;
  if (elements.authTitle) elements.authTitle.textContent = role === 'student' ? 'Student Login' : 'Sign In to Outpass System';
  if (elements.authSubtitle) elements.authSubtitle.textContent = role === 'student' ? 'Enter your credentials to access your dashboard.' : 'Select your role to access your dedicated dashboard.';
  if (elements.identifierLabel) elements.identifierLabel.textContent = config.identifierLabel;
  if (elements.identifierInput) {
    elements.identifierInput.placeholder = config.placeholder;
  }
  if (elements.btnText) elements.btnText.textContent = config.btnText;

  // Conditionally show "Don't have an account? [ Create Account ]" for Student & Parent
  if (elements.studentCreateAccountBox) {
    if (role === 'student') {
      elements.studentCreateAccountBox.classList.remove('hidden');
    } else {
      elements.studentCreateAccountBox.classList.add('hidden');
    }
  }

  if (elements.parentCreateAccountBox) {
    if (role === 'parent') {
      elements.parentCreateAccountBox.classList.remove('hidden');
    } else {
      elements.parentCreateAccountBox.classList.add('hidden');
    }
  }

  // Hide existing alerts
  hideAlert();
}

/* ==========================================================
   3.1 INLINE PARENT REGISTRATION VIEW TOGGLES & HANDLER
   ========================================================== */
function showParentRegisterForm() {
  hideAlert();
  if (elements.loginForm) elements.loginForm.classList.add('hidden');
  if (elements.parentRegisterForm) elements.parentRegisterForm.classList.remove('hidden');
  if (elements.authTitle) elements.authTitle.textContent = 'Sign In to Outpass System';
  if (elements.authSubtitle) elements.authSubtitle.textContent = 'Register using your mobile number to manage student outpass.';
  if (elements.parentRegName) elements.parentRegName.focus();
}

function showParentLoginForm() {
  hideAlert();
  if (elements.parentRegisterForm) elements.parentRegisterForm.classList.add('hidden');
  if (elements.loginForm) elements.loginForm.classList.remove('hidden');
  if (elements.authTitle) elements.authTitle.textContent = 'Sign In to Outpass System';
  if (elements.authSubtitle) elements.authSubtitle.textContent = 'Select your role to access your dedicated dashboard.';
  if (elements.identifierInput) elements.identifierInput.focus();
}

async function handleParentInlineRegisterSubmit(event) {
  event.preventDefault();
  const parent_name = elements.parentRegName ? elements.parentRegName.value.trim() : '';
  const mobile = elements.parentRegMobile ? elements.parentRegMobile.value.trim() : '';
  const password = elements.parentRegPassword ? elements.parentRegPassword.value.trim() : '';
  const confirm_password = elements.parentRegConfirmPassword ? elements.parentRegConfirmPassword.value.trim() : '';

  if (!parent_name) {
    showAlert('Please enter your full name.', 'error');
    elements.parentRegName?.focus();
    return;
  }
  if (!mobile) {
    showAlert('Please enter your mobile number.', 'error');
    elements.parentRegMobile?.focus();
    return;
  }

  const cleanMobile = mobile.replace(/\D/g, '');
  if (cleanMobile.length < 10) {
    showAlert('Please enter a valid 10-digit mobile number.', 'error');
    elements.parentRegMobile?.focus();
    return;
  }
  if (!password) {
    showAlert('Please enter a password.', 'error');
    elements.parentRegPassword?.focus();
    return;
  }
  if (password.length < 6) {
    showAlert('Password must be at least 6 characters long.', 'error');
    elements.parentRegPassword?.focus();
    return;
  }
  if (password !== confirm_password) {
    showAlert('Passwords do not match. Please re-enter.', 'error');
    elements.parentRegConfirmPassword?.focus();
    return;
  }

  const btn = elements.btnParentRegisterSubmit;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/auth/register-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_name,
        mobile: cleanMobile,
        password,
        confirm_password
      })
    });

    const data = await res.json();

    if (res.ok && data.success && data.token) {
      localStorage.setItem('sh_token', data.token);
      localStorage.setItem('sh_user', JSON.stringify(data.user));
      sessionStorage.setItem('sh_token', data.token);
      sessionStorage.setItem('sh_user', JSON.stringify(data.user));

      showAlert('Account Created Successfully! Redirecting to Parent Dashboard...', 'success');
      setTimeout(() => {
        window.location.replace('/parent-dashboard.html');
      }, 400);
    } else {
      showAlert(data.message || 'Registration failed.', 'error');
    }
  } catch (err) {
    showAlert('Network error during registration: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Global Window Exports for Inline UI Triggers
window.showParentRegisterForm = showParentRegisterForm;
window.showParentLoginForm = showParentLoginForm;
window.showParentInlineRegisterView = showParentRegisterForm;
window.showParentInlineLoginView = showParentLoginForm;
window.handleParentInlineRegisterSubmit = handleParentInlineRegisterSubmit;

/* ==========================================================
   3.2 INLINE STUDENT REGISTRATION VIEW TOGGLES & HANDLER
   ========================================================== */
function showStudentRegisterForm() {
  hideAlert();
  if (elements.loginForm) elements.loginForm.classList.add('hidden');
  if (elements.parentRegisterForm) elements.parentRegisterForm.classList.add('hidden');
  if (elements.studentRegisterForm) elements.studentRegisterForm.classList.remove('hidden');
  if (elements.authTitle) elements.authTitle.textContent = 'Student Registration';
  if (elements.authSubtitle) elements.authSubtitle.textContent = 'Create your student account to submit and track outpass requests.';
  if (elements.studentRegName) elements.studentRegName.focus();
}

function showStudentLoginForm() {
  hideAlert();
  if (elements.studentRegisterForm) elements.studentRegisterForm.classList.add('hidden');
  if (elements.parentRegisterForm) elements.parentRegisterForm.classList.add('hidden');
  if (elements.loginForm) elements.loginForm.classList.remove('hidden');
  if (elements.authTitle) elements.authTitle.textContent = 'Student Login';
  if (elements.authSubtitle) elements.authSubtitle.textContent = 'Enter your credentials to access your dashboard.';
  if (elements.identifierInput) elements.identifierInput.focus();
}

async function handleStudentInlineRegisterSubmit(event) {
  event.preventDefault();

  const name = elements.studentRegName ? elements.studentRegName.value.trim() : '';
  const username = elements.studentRegUsername ? elements.studentRegUsername.value.trim() : '';
  const email = elements.studentRegEmail ? elements.studentRegEmail.value.trim() : '';
  const phone = elements.studentRegPhone ? elements.studentRegPhone.value.trim() : '';
  const department = elements.studentRegDept ? elements.studentRegDept.value.trim() : '';
  const year_of_study = elements.studentRegYear ? elements.studentRegYear.value : '3';
  const hostel_block = elements.studentRegBlock ? elements.studentRegBlock.value : 'Block A';
  const room_no = elements.studentRegRoom ? elements.studentRegRoom.value.trim() : '';
  const parent_name = elements.studentRegParentName ? elements.studentRegParentName.value.trim() : '';
  const parent_phone = elements.studentRegParentPhone ? elements.studentRegParentPhone.value.trim() : '';
  const password = elements.studentRegPassword ? elements.studentRegPassword.value.trim() : '';
  const confirm_password = elements.studentRegConfirmPassword ? elements.studentRegConfirmPassword.value.trim() : '';

  if (!name) {
    showAlert('Please enter your full name.', 'error');
    elements.studentRegName?.focus();
    return;
  }
  if (!username) {
    showAlert('Please enter your username / roll number.', 'error');
    elements.studentRegUsername?.focus();
    return;
  }
  if (username.length < 3) {
    showAlert('Username / roll number must be at least 3 characters long.', 'error');
    elements.studentRegUsername?.focus();
    return;
  }
  if (!email) {
    showAlert('Please enter your college email address.', 'error');
    elements.studentRegEmail?.focus();
    return;
  }
  if (!phone) {
    showAlert('Please enter your mobile number.', 'error');
    elements.studentRegPhone?.focus();
    return;
  }
  if (!room_no) {
    showAlert('Please enter your hostel room number.', 'error');
    elements.studentRegRoom?.focus();
    return;
  }
  if (!parent_name) {
    showAlert('Please enter your parent or guardian name.', 'error');
    elements.studentRegParentName?.focus();
    return;
  }
  if (!parent_phone) {
    showAlert('Please enter your parent mobile number.', 'error');
    elements.studentRegParentPhone?.focus();
    return;
  }
  if (!password) {
    showAlert('Please enter a password.', 'error');
    elements.studentRegPassword?.focus();
    return;
  }
  if (password.length < 6) {
    showAlert('Password must be at least 6 characters long.', 'error');
    elements.studentRegPassword?.focus();
    return;
  }
  if (password !== confirm_password) {
    showAlert('Passwords do not match. Please re-enter.', 'error');
    elements.studentRegConfirmPassword?.focus();
    return;
  }

  const btn = elements.btnStudentRegisterSubmit;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/auth/register-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        username,
        reg_no: username,
        email,
        phone,
        department,
        year_of_study,
        hostel_block,
        room_no,
        parent_name,
        parent_phone,
        password,
        confirm_password
      })
    });

    const data = await res.json();

    if (res.ok && data.success && data.token) {
      localStorage.setItem('sh_token', data.token);
      localStorage.setItem('sh_user', JSON.stringify(data.user));
      sessionStorage.setItem('sh_token', data.token);
      sessionStorage.setItem('sh_user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
      sessionStorage.setItem('token', data.token);

      showAlert('Student Account Created Successfully! Redirecting to Student Dashboard...', 'success');
      setTimeout(() => {
        window.location.replace('/student-dashboard.html');
      }, 400);
    } else {
      showAlert(data.message || 'Registration failed. Please check your inputs.', 'error');
    }
  } catch (err) {
    showAlert('Network error during registration: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Global Window Exports for Student Inline UI Triggers
window.showStudentRegisterForm = showStudentRegisterForm;
window.showStudentLoginForm = showStudentLoginForm;
window.handleStudentInlineRegisterSubmit = handleStudentInlineRegisterSubmit;

/* ==========================================================
   4. PASSWORD VISIBILITY TOGGLE
   ========================================================== */
function initPasswordToggle() {
  if (!elements.togglePasswordBtn || !elements.passwordInput) return;

  elements.togglePasswordBtn.addEventListener('click', () => {
    const isPassword = elements.passwordInput.getAttribute('type') === 'password';
    elements.passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    elements.togglePasswordBtn.style.opacity = isPassword ? '1' : '0.6';
  });
}

/* ==========================================================
   5. FORM SUBMISSION (LOGIN & REDIRECT)
   ========================================================== */
function initFormHandler() {
  if (!elements.loginForm) return;

  elements.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = elements.identifierInput.value.trim();
    const password = elements.passwordInput.value.trim();
    const role = elements.selectedRoleInput.value;
    const remember = elements.rememberMe ? elements.rememberMe.checked : false;

    if (!username || !password) {
      showAlert('Please enter both your identifier/username and password.', 'error');
      return;
    }

    setLoading(true);
    hideAlert();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          identifier: username,
          password,
          role
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Save auth token & user under all standard keys for complete cross-dashboard interoperability
        const userStr = JSON.stringify(data.user);
        localStorage.setItem('sh_token', data.token);
        localStorage.setItem('token', data.token);
        localStorage.setItem('sh_user', userStr);
        localStorage.setItem('user', userStr);
        sessionStorage.setItem('sh_token', data.token);
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('sh_user', userStr);
        sessionStorage.setItem('user', userStr);

        // Determine destination dashboard
        const returnedRole = (data.user && data.user.role) ? data.user.role : role;
        const targetDashboardUrl = data.redirectTo || getDashboardUrl(returnedRole);

        showAlert(`🎉 ${data.message} Redirecting to your dashboard...`, 'success');

        // Immediate smooth redirect to the correct dashboard
        setTimeout(() => {
          window.location.href = targetDashboardUrl;
        }, 350);

      } else {
        showAlert(data.message || 'Authentication failed. Please verify your credentials and role.', 'error');
      }
    } catch (err) {
      showAlert('Connection error: Unable to reach backend server. (' + err.message + ')', 'error');
    } finally {
      setLoading(false);
    }
  });
}

function setLoading(isLoading) {
  if (!elements.submitBtn) return;
  elements.submitBtn.disabled = isLoading;
  if (isLoading) {
    if (elements.btnSpinner) elements.btnSpinner.classList.remove('hidden');
    if (elements.btnText) elements.btnText.textContent = 'Verifying Credentials...';
  } else {
    if (elements.btnSpinner) elements.btnSpinner.classList.add('hidden');
    const config = ROLES_CONFIG[currentRole];
    if (elements.btnText) elements.btnText.textContent = config ? config.btnText : 'Sign In';
  }
}

function showAlert(message, type = 'info') {
  if (!elements.formAlert) return;
  elements.formAlert.className = `form-alert ${type}`;
  elements.formAlert.textContent = message;
  elements.formAlert.classList.remove('hidden');
}

function hideAlert() {
  if (!elements.formAlert) return;
  elements.formAlert.classList.add('hidden');
}

/* ==========================================================
   6. AUTOFILL CHIPS (FOR QUICK ROLE TESTING)
   ========================================================== */
function initAutofillChips() {
  document.querySelectorAll('.demo-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const role = chip.dataset.fillRole;
      const id = chip.dataset.fillId;

      if (role && ROLES_CONFIG[role]) {
        switchRole(role);
        if (elements.identifierInput) elements.identifierInput.value = id;
        if (elements.passwordInput) elements.passwordInput.value = 'Password@123';
        showAlert(`Filled demo credentials for ${ROLES_CONFIG[role].badge} (Password: Password@123)`, 'info');
      }
    });
  });
}

/* ==========================================================
   7. REAL-TIME DIAGNOSTICS & SYSTEM STATUS
   ========================================================== */
function initDiagnostics() {
  checkBackendStatus();

  if (elements.btnTestApi) {
    elements.btnTestApi.addEventListener('click', checkBackendStatus);
  }
  if (elements.systemStatusChip) {
    elements.systemStatusChip.addEventListener('click', checkBackendStatus);
  }
}

async function checkBackendStatus() {
  // Test Health
  try {
    const startTime = performance.now();
    const healthRes = await fetch('/api/health');
    const latency = Math.round(performance.now() - startTime);
    const healthData = await healthRes.json();

    if (healthRes.ok && healthData.success) {
      if (elements.statusDot) elements.statusDot.className = 'status-dot online';
      if (elements.statusLabel) elements.statusLabel.textContent = `Server Online (${latency}ms)`;
      if (elements.diagHealth) {
        elements.diagHealth.textContent = `Active (${latency}ms)`;
        elements.diagHealth.className = 'diag-val ok';
      }
    } else {
      throw new Error('Health check returned false');
    }
  } catch (err) {
    if (elements.statusDot) elements.statusDot.className = 'status-dot offline';
    if (elements.statusLabel) elements.statusLabel.textContent = 'Server Offline';
    if (elements.diagHealth) {
      elements.diagHealth.textContent = 'Offline / Error';
      elements.diagHealth.className = 'diag-val err';
    }
  }

  // Test DB
  try {
    const dbRes = await fetch('/api/db-test');
    const dbData = await dbRes.json();

    if (dbRes.ok && dbData.success) {
      if (elements.dbBadge) {
        elements.dbBadge.className = 'db-badge connected';
        elements.dbBadge.textContent = 'DB: Connected';
      }
      if (elements.diagDb) {
        elements.diagDb.textContent = 'Connected (MySQL)';
        elements.diagDb.className = 'diag-val ok';
      }
    } else {
      if (elements.dbBadge) {
        elements.dbBadge.className = 'db-badge failed';
        elements.dbBadge.textContent = 'DB: Disconnected';
      }
      if (elements.diagDb) {
        elements.diagDb.textContent = dbData.errorCode ? `Failed (${dbData.errorCode})` : 'Connection Failed';
        elements.diagDb.className = 'diag-val warn';
      }
    }
  } catch (err) {
    if (elements.dbBadge) {
      elements.dbBadge.className = 'db-badge failed';
      elements.dbBadge.textContent = 'DB: Error';
    }
    if (elements.diagDb) {
      elements.diagDb.textContent = 'Request Error';
      elements.diagDb.className = 'diag-val err';
    }
  }
}

/* ==========================================================
   8. SOCKET.IO REAL-TIME CONNECTION
   ========================================================== */
function initSocketIO() {
  try {
    if (typeof io !== 'undefined') {
      socket = io();

      socket.on('connect', () => {
        if (elements.diagSocket) {
          elements.diagSocket.textContent = `Connected (${socket.id.slice(0, 6)}...)`;
          elements.diagSocket.className = 'diag-val ok';
        }
      });

      socket.on('disconnect', () => {
        if (elements.diagSocket) {
          elements.diagSocket.textContent = 'Disconnected';
          elements.diagSocket.className = 'diag-val warn';
        }
      });
    }
  } catch (err) {
    console.error('[Socket.IO client error]:', err);
  }
}
