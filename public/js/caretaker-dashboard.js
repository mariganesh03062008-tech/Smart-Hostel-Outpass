/* ==========================================================
   SMART HOSTEL OUTPASS - CARETAKER DASHBOARD & QR SCANNER JS
   ========================================================== */

let currentCaretaker = null;
let html5QrScannerInstance = null;
let isScannerActive = false;
let isProcessingScan = false;
let currentCameraFacing = 'environment'; // 'environment' (back) or 'user' (front)
let cachedStudentsOutside = [];
let activeYearFilter = 'all';
let currentHistoryFilter = 'today';
let activeTab = 'overview';

// DOM Element Cache
const DOM = {
  caretakerName: document.getElementById('caretakerName'),
  caretakerStaffId: document.getElementById('caretakerStaffId'),
  caretakerAvatar: document.getElementById('caretakerAvatar'),
  navOutsideCount: document.getElementById('navOutsideCount'),
  navUserName: document.getElementById('navUserName'),
  navUserAvatar: document.getElementById('navUserAvatar'),
  liveClockTime: document.getElementById('liveClockTime'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  dashboardSidebar: document.getElementById('dashboardSidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  
  // Metrics
  statStudentsInside: document.getElementById('statStudentsInside'),
  statStudentsOutside: document.getElementById('statStudentsOutside'),
  statTodayExits: document.getElementById('statTodayExits'),
  statTodayReturns: document.getElementById('statTodayReturns'),
  recentExitsTableBody: document.getElementById('recentExitsTableBody'),

  // Scanner
  qrScannerReader: document.getElementById('qrScannerReader'),
  cameraStoppedState: document.getElementById('cameraStoppedState'),
  scanLaserLine: document.getElementById('scanLaserLine'),
  btnStartCamera: document.getElementById('btnStartCamera'),
  btnStopCamera: document.getElementById('btnStopCamera'),
  btnSwitchCamera: document.getElementById('btnSwitchCamera'),
  qrManualTokenInput: document.getElementById('qrManualTokenInput'),
  scanResultContainer: document.getElementById('scanResultContainer'),

  // Students Outside
  studentsOutsideTableBody: document.getElementById('studentsOutsideTableBody'),
  pillCountAll: document.getElementById('pillCountAll'),
  pillCount1: document.getElementById('pillCount1'),
  pillCount2: document.getElementById('pillCount2'),
  pillCount3: document.getElementById('pillCount3'),
  pillCount4: document.getElementById('pillCount4'),

  // Check-Out List & History
  checkoutListTableBody: document.getElementById('checkoutListTableBody') || document.getElementById('exitHistoryTableBody'),
  exitHistoryTableBody: document.getElementById('checkoutListTableBody') || document.getElementById('exitHistoryTableBody'),
  btnFilterToday: document.getElementById('btnFilterToday'),
  btnFilterYesterday: document.getElementById('btnFilterYesterday'),
  btnFilterAll: document.getElementById('btnFilterAll'),
  checkoutDateInput: document.getElementById('checkoutDateInput') || document.getElementById('historyDateInput'),
  historyDateInput: document.getElementById('checkoutDateInput') || document.getElementById('historyDateInput'),

  // Daily Movement Summary
  dailySummaryDateInput: document.getElementById('dailySummaryDateInput'),
  sumTotalCheckedOut: document.getElementById('sumTotalCheckedOut'),
  sumTotalCheckedIn: document.getElementById('sumTotalCheckedIn'),
  sumCurrentlyOutside: document.getElementById('sumCurrentlyOutside'),
  sumOverallOutside: document.getElementById('sumOverallOutside'),
  badgeStillOutsideCount: document.getElementById('badgeStillOutsideCount'),
  summaryStillOutsideTableBody: document.getElementById('summaryStillOutsideTableBody'),

  // Profile
  profAvatarLarge: document.getElementById('profAvatarLarge'),
  profStaffName: document.getElementById('profStaffName'),
  profStaffIdTag: document.getElementById('profStaffIdTag'),
  profStaffEmail: document.getElementById('profStaffEmail'),
  profStaffDept: document.getElementById('profStaffDept'),
  profStaffPhone: document.getElementById('profStaffPhone'),

  // Navigation
  navButtons: document.querySelectorAll('.dashboard-nav .nav-item'),
  tabSections: document.querySelectorAll('.tab-section'),
  logoutBtn: document.getElementById('logoutBtn'),
  toastContainer: document.getElementById('toastContainer')
};

function getAuthToken() {
  return localStorage.getItem('sh_token') ||
         sessionStorage.getItem('sh_token') ||
         localStorage.getItem('token') ||
         sessionStorage.getItem('token');
}

/* ==========================================================
   1. INITIALIZATION & SESSION AUTHENTICATION
   ========================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupLiveClock();
  setupMobileDrawer();
  initNavigation();
  initLogout();
  setupRealtimeListeners();
  await verifyCaretakerSession();
});

function setupLiveClock() {
  const updateClock = () => {
    if (DOM.liveClockTime) {
      const now = new Date();
      DOM.liveClockTime.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }
  };
  updateClock();
  setInterval(updateClock, 1000);
}

function setupMobileDrawer() {
  if (DOM.mobileMenuBtn && DOM.dashboardSidebar) {
    DOM.mobileMenuBtn.addEventListener('click', () => {
      DOM.dashboardSidebar.classList.toggle('open');
      if (DOM.sidebarBackdrop) DOM.sidebarBackdrop.classList.toggle('active');
    });
  }

  if (DOM.sidebarBackdrop && DOM.dashboardSidebar) {
    DOM.sidebarBackdrop.addEventListener('click', () => {
      DOM.dashboardSidebar.classList.remove('open');
      DOM.sidebarBackdrop.classList.remove('active');
    });
  }
}

function setupRealtimeListeners() {
  window.addEventListener('sh:notification:new', () => {
    refreshCaretakerData();
  });
}

async function verifyCaretakerSession() {
  const token = getAuthToken();
  if (!token) {
    clearAuthAndRedirect();
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

    const role = (data.user.role || '').toLowerCase().trim();
    if (role !== 'caretaker') {
      console.warn(`Role mismatch: Expected caretaker, got ${role}. Redirecting.`);
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

    currentCaretaker = data.user;
    populateCaretakerProfile(currentCaretaker);
    await refreshCaretakerData();

  } catch (err) {
    console.error('[Caretaker Session Error]:', err);
    clearAuthAndRedirect();
  }
}

function populateCaretakerProfile(user) {
  const name = user.name || 'Caretaker Staff';
  const staffId = user.staff_id || user.username || 'CTK-305';
  const email = user.email || 'caretaker@hostel.edu';
  const phone = user.phone || '9876543215';
  const dept = user.department || 'Hostel Floor Administration';

  if (DOM.caretakerName) DOM.caretakerName.textContent = name;
  if (DOM.caretakerStaffId) DOM.caretakerStaffId.textContent = staffId;
  if (DOM.caretakerAvatar) DOM.caretakerAvatar.textContent = name.charAt(0).toUpperCase();

  if (DOM.navUserName) DOM.navUserName.textContent = name;
  if (DOM.navUserAvatar) DOM.navUserAvatar.textContent = name.charAt(0).toUpperCase();

  if (DOM.profStaffName) DOM.profStaffName.textContent = name;
  if (DOM.profStaffIdTag) DOM.profStaffIdTag.textContent = `Staff ID: ${staffId}`;
  if (DOM.profAvatarLarge) DOM.profAvatarLarge.textContent = name.charAt(0).toUpperCase();
  if (DOM.profStaffEmail) DOM.profStaffEmail.textContent = email;
  if (DOM.profStaffDept) DOM.profStaffDept.textContent = dept;
  if (DOM.profStaffPhone) DOM.profStaffPhone.textContent = phone;
}

/* ==========================================================
   2. DATA REFRESH & METRICS
   ========================================================== */
async function refreshCaretakerData() {
  await Promise.all([
    loadCaretakerOverview(),
    loadStudentsOutside(),
    loadCheckoutList(),
    loadDailySummary()
  ]);
}

async function loadCaretakerOverview() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch('/api/caretaker/overview', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const stats = data.stats || {};
      if (DOM.statStudentsInside) DOM.statStudentsInside.textContent = stats.studentsInside || 0;
      if (DOM.statStudentsOutside) DOM.statStudentsOutside.textContent = stats.studentsOutside || 0;
      if (DOM.statTodayExits) DOM.statTodayExits.textContent = stats.todayExits || 0;
      if (DOM.statTodayReturns) DOM.statTodayReturns.textContent = stats.todayReturns || 0;

      if (DOM.navOutsideCount) {
        DOM.navOutsideCount.textContent = stats.studentsOutside || 0;
        DOM.navOutsideCount.style.display = stats.studentsOutside > 0 ? 'inline-block' : 'none';
      }

      renderRecentExits(data.recentExits || []);
    }
  } catch (err) {
    console.error('Error loading caretaker overview:', err);
  }
}

function renderRecentExits(list) {
  if (!DOM.recentExitsTableBody) return;
  DOM.recentExitsTableBody.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.recentExitsTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No gate checkout records logged yet.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${formatDateTime(item.exitTime)}</strong></td>
      <td>
        <strong>${escapeHtml(item.studentName)}</strong>
        <br><small style="color:var(--text-muted);">${escapeHtml(item.rollNumber)} • ${escapeHtml(item.department)}</small>
      </td>
      <td>${escapeHtml(item.hostelBlock)} - ${escapeHtml(item.roomNumber)}</td>
      <td><span class="portal-badge" style="background:rgba(59,130,246,0.15); color:#60a5fa;">${escapeHtml(item.requestCode)}</span></td>
      <td>${escapeHtml(item.destination)}</td>
      <td>${formatDateTime(item.expectedReturnTime)}</td>
    `;
    DOM.recentExitsTableBody.appendChild(tr);
  });
}

/* ==========================================================
   3. QR CAMERA SCANNER ENGINE (HTML5-QRCODE)
   ========================================================== */
async function startQrScanner() {
  if (isScannerActive) return;

  const qrReaderElem = document.getElementById('qrScannerReader');
  if (!qrReaderElem) return;

  if (DOM.cameraStoppedState) DOM.cameraStoppedState.style.display = 'none';
  if (DOM.btnStartCamera) DOM.btnStartCamera.style.display = 'none';
  if (DOM.btnStopCamera) DOM.btnStopCamera.style.display = 'inline-flex';
  if (DOM.btnSwitchCamera) DOM.btnSwitchCamera.style.display = 'inline-flex';
  if (DOM.scanLaserLine) DOM.scanLaserLine.style.display = 'block';

  try {
    if (typeof Html5Qrcode === 'undefined') {
      showToast('QR Scanner library not loaded. Use manual token input below.', 'error');
      return;
    }

    html5QrScannerInstance = new Html5Qrcode('qrScannerReader');
    
    const config = {
      fps: 15,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    await html5QrScannerInstance.start(
      { facingMode: currentCameraFacing },
      config,
      onScanSuccess,
      onScanFailure
    );

    isScannerActive = true;
    showToast('Camera active. Point at student outpass QR.', 'success');

  } catch (err) {
    console.error('Camera start error:', err);
    showToast('Unable to access camera: ' + err.message + '. Please use manual token input.', 'error');
    stopQrScanner();
  }
}

async function stopQrScanner() {
  if (html5QrScannerInstance && isScannerActive) {
    try {
      await html5QrScannerInstance.stop();
      html5QrScannerInstance.clear();
    } catch (e) {
      console.warn('Scanner stop error:', e);
    }
  }

  isScannerActive = false;
  isProcessingScan = false;

  if (DOM.cameraStoppedState) DOM.cameraStoppedState.style.display = 'block';
  if (DOM.btnStartCamera) DOM.btnStartCamera.style.display = 'inline-flex';
  if (DOM.btnStopCamera) DOM.btnStopCamera.style.display = 'none';
  if (DOM.btnSwitchCamera) DOM.btnSwitchCamera.style.display = 'none';
  if (DOM.scanLaserLine) DOM.scanLaserLine.style.display = 'none';
}

async function switchCameraFacing() {
  currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
  if (isScannerActive) {
    await stopQrScanner();
    await startQrScanner();
  }
}

function onScanSuccess(decodedText) {
  if (isProcessingScan) return;
  isProcessingScan = true;

  // Process the scanned QR Token
  handleScannedQrToken(decodedText);
}

function onScanFailure(error) {
  // Continuous scanning frame failures are expected when no QR is in view
}

function handleManualTokenSubmit() {
  if (!DOM.qrManualTokenInput) return;
  const token = DOM.qrManualTokenInput.value.trim();
  if (!token) {
    showToast('Please enter a QR token.', 'error');
    DOM.qrManualTokenInput.focus();
    return;
  }
  handleScannedQrToken(token);
}

/* ==========================================================
   4. ATOMIC EXIT API CALL & SCAN RESULTS UI
   ========================================================== */
async function handleScannedQrToken(qrToken) {
  const token = getAuthToken();
  if (!token) return;

  if (DOM.scanResultContainer) {
    DOM.scanResultContainer.innerHTML = `
      <div class="form-card" style="text-align:center; padding:2rem;">
        <div style="font-size:1.1rem; color:var(--text-primary); font-weight:700;">Verifying Token Against Server...</div>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.25rem;">Validating timestamps, student status, and gate authorization.</p>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/caretaker/exit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qr_token: qrToken })
    });

    const data = await res.json();

    if (res.ok && data.success && data.status === 'EXIT_VERIFIED') {
      renderSuccessScanResult(data.data);
      showToast('EXIT VERIFIED: Student checked out.', 'success');
      if (DOM.qrManualTokenInput) DOM.qrManualTokenInput.value = '';
      await refreshCaretakerData();
    } else {
      renderInvalidScanResult(data.validity || 'INVALID', data.message || 'QR Verification failed.', data.details);
      showToast(data.message || 'QR Verification Failed', 'error');
    }

  } catch (err) {
    renderInvalidScanResult('ERROR', 'Network error: ' + err.message);
  } finally {
    setTimeout(() => {
      isProcessingScan = false;
    }, 1500);
  }
}

function renderSuccessScanResult(student) {
  if (!DOM.scanResultContainer) return;

  DOM.scanResultContainer.innerHTML = `
    <div class="scan-result-card scan-result-success">
      <div class="result-header">
        <div style="background:#10b981; color:#ffffff; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.2rem;">
          ✓
        </div>
        <div>
          <h3 style="color:#10b981; font-family:'Outfit';">EXIT VERIFIED</h3>
          <p style="font-size:0.8rem; color:var(--text-secondary); margin:0;">Student gate exit has been officially recorded in MySQL.</p>
        </div>
      </div>

      <div class="result-details-grid">
        <div class="result-detail-item">
          <span class="result-detail-label">Student Name</span>
          <span class="result-detail-value">${escapeHtml(student.studentName)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Roll Number</span>
          <span class="result-detail-value">${escapeHtml(student.rollNumber)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Department</span>
          <span class="result-detail-value">${escapeHtml(student.department)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Hostel Block</span>
          <span class="result-detail-value">${escapeHtml(student.hostelBlock)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Room Number</span>
          <span class="result-detail-value">${escapeHtml(student.roomNumber)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Exit Time</span>
          <span class="result-detail-value" style="color:#10b981;">${formatDateTime(student.exitTime)}</span>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; padding-top:0.5rem;">
        <div>
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Current Student Status:</span>
          <span class="status-badge" style="background:rgba(245,158,11,0.15); color:#f59e0b; margin-left:0.5rem; font-weight:700;">
            OUTSIDE HOSTEL
          </span>
        </div>

        <button class="primary-btn" onclick="resetScannerForNext()" style="padding:0.5rem 1.25rem;">
          <span>Scan Next Student</span>
        </button>
      </div>
    </div>
  `;
}

function renderInvalidScanResult(validity, message, details) {
  if (!DOM.scanResultContainer) return;

  let title = 'INVALID QR CODE';
  let badgeColor = '#ef4444';
  let cardClass = 'scan-result-error';

  if (validity === 'EXPIRED') {
    title = 'QR CODE EXPIRED';
    badgeColor = '#ef4444';
  } else if (validity === 'REVOKED') {
    title = 'QR CODE REVOKED';
    badgeColor = '#ef4444';
  } else if (validity === 'ALREADY_EXITED') {
    title = 'EXIT ALREADY RECORDED';
    badgeColor = '#f59e0b';
    cardClass = 'scan-result-warning';
  } else if (validity === 'NOT_YET_VALID') {
    title = 'QR CODE IS NOT YET VALID';
    badgeColor = '#f59e0b';
    cardClass = 'scan-result-warning';
  }

  DOM.scanResultContainer.innerHTML = `
    <div class="scan-result-card ${cardClass}">
      <div class="result-header">
        <div style="background:${badgeColor}; color:#ffffff; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.2rem;">
          !
        </div>
        <div>
          <h3 style="color:${badgeColor}; font-family:'Outfit';">${title}</h3>
          <p style="font-size:0.85rem; color:var(--text-primary); margin:0.2rem 0;">${escapeHtml(message)}</p>
        </div>
      </div>

      ${details ? `
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:0.75rem; font-size:0.82rem; color:var(--text-secondary); margin-bottom:1rem;">
          ${details.studentName ? `Student: <strong>${escapeHtml(details.studentName)}</strong> (${escapeHtml(details.rollNumber || '')})<br>` : ''}
          ${details.requestCode ? `Pass Code: <strong>${escapeHtml(details.requestCode)}</strong><br>` : ''}
          ${details.exitTime ? `Exit Scanned At: <strong>${escapeHtml(details.exitTime)}</strong>` : ''}
        </div>
      ` : ''}

      <div style="text-align:right;">
        <button class="secondary-btn" onclick="resetScannerForNext()" style="padding:0.45rem 1rem;">
          <span>Scan Again</span>
        </button>
      </div>
    </div>
  `;
}

function resetScannerForNext() {
  if (DOM.scanResultContainer) DOM.scanResultContainer.innerHTML = '';
  if (DOM.qrManualTokenInput) {
    DOM.qrManualTokenInput.value = '';
    DOM.qrManualTokenInput.focus();
  }
  isProcessingScan = false;
}

/* ==========================================================
   5. STUDENTS OUTSIDE ROSTER & YEAR GROUPING
   ========================================================== */
async function loadStudentsOutside() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch('/api/caretaker/students-outside', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      cachedStudentsOutside = data.allStudents || [];
      const grp = data.grouped || {};

      if (DOM.pillCountAll) DOM.pillCountAll.textContent = data.totalOutside || 0;
      if (DOM.pillCount1) DOM.pillCount1.textContent = grp.firstYear ? grp.firstYear.count : 0;
      if (DOM.pillCount2) DOM.pillCount2.textContent = grp.secondYear ? grp.secondYear.count : 0;
      if (DOM.pillCount3) DOM.pillCount3.textContent = grp.thirdYear ? grp.thirdYear.count : 0;
      if (DOM.pillCount4) DOM.pillCount4.textContent = grp.fourthYear ? grp.fourthYear.count : 0;

      filterStudentsByYear(activeYearFilter);
    }
  } catch (err) {
    console.error('Error loading students outside:', err);
  }
}

function filterStudentsByYear(year) {
  activeYearFilter = year;

  // Update active pill button UI
  document.querySelectorAll('.year-pill-btn').forEach(btn => {
    if (String(btn.dataset.yearFilter) === String(year)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  let filtered = cachedStudentsOutside;
  if (year !== 'all') {
    filtered = cachedStudentsOutside.filter(s => Number(s.yearOfStudy) === Number(year));
  }

  renderStudentsOutsideTable(filtered);
}

function renderStudentsOutsideTable(list) {
  if (!DOM.studentsOutsideTableBody) return;
  DOM.studentsOutsideTableBody.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.studentsOutsideTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No students currently outside for the selected filter.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(s => {
    const tr = document.createElement('tr');
    const isOverdue = s.isOverdue === 1;

    tr.innerHTML = `
      <td><strong>${escapeHtml(s.rollNumber)}</strong></td>
      <td><strong>${escapeHtml(s.studentName)}</strong></td>
      <td>${escapeHtml(s.department)} • Yr ${s.yearOfStudy}</td>
      <td>${escapeHtml(s.hostelBlock)} - ${escapeHtml(s.roomNumber)}</td>
      <td>${formatDateTime(s.exitTime)}</td>
      <td>${formatDateTime(s.expectedReturnTime)}</td>
      <td>
        <span class="status-badge ${isOverdue ? 'status-expired' : 'status-pending-warden'}">
          ${isOverdue ? '⚠️ Overdue' : 'Outside (On Time)'}
        </span>
      </td>
      <td>
        <span class="portal-badge" style="font-size:0.75rem;">
          ${s.requestType === 'one_day_duty' ? 'One-Day Duty' : 'Normal Outpass'}
        </span>
      </td>
    `;
    DOM.studentsOutsideTableBody.appendChild(tr);
  });
}

/* ==========================================================
   6. CHECK-OUT LIST & DATE FILTERING
   ========================================================== */
async function loadCheckoutList(filter = currentHistoryFilter, customDate = null) {
  const token = getAuthToken();
  if (!token) return;

  try {
    let url = `/api/gate/checkout-list?filter=${filter}`;
    if (filter === 'date' && customDate) {
      url += `&date=${customDate}`;
    }

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      renderCheckoutListTable(data.checkoutList || []);
    }
  } catch (err) {
    console.error('Error loading checkout list:', err);
  }
}

function renderCheckoutListTable(list) {
  const tbody = DOM.checkoutListTableBody;
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No check-out records found for the selected date filter.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(item => {
    const tr = document.createElement('tr');
    const isReturned = item.status === 'RETURNED';

    tr.innerHTML = `
      <td><strong>${formatDateTime(item.exitTime)}</strong></td>
      <td><strong>${escapeHtml(item.studentName)}</strong></td>
      <td>${escapeHtml(item.rollNumber)}</td>
      <td><span class="portal-badge" style="font-size:0.75rem;">${escapeHtml(item.outpassType === 'one_day_duty' ? 'One-Day Duty' : 'Normal Outpass')}</span></td>
      <td>${escapeHtml(item.destination || '-')}</td>
      <td>${escapeHtml(item.purpose || '-')}</td>
      <td>${formatDateTime(item.expectedReturnTime)}</td>
      <td>
        <span class="status-badge ${isReturned ? 'status-approved' : 'status-pending-warden'}">
          ${isReturned ? 'Returned' : 'Currently Outside'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

const loadExitHistory = loadCheckoutList;
const renderExitHistoryTable = renderCheckoutListTable;

function setCheckoutFilter(filter) {
  currentHistoryFilter = filter;

  if (DOM.btnFilterToday) DOM.btnFilterToday.classList.toggle('active', filter === 'today');
  if (DOM.btnFilterYesterday) DOM.btnFilterYesterday.classList.toggle('active', filter === 'yesterday');
  if (DOM.btnFilterAll) DOM.btnFilterAll.classList.toggle('active', filter === 'all');
  if (DOM.checkoutDateInput) DOM.checkoutDateInput.value = '';

  loadCheckoutList(filter);
}
const setHistoryFilter = setCheckoutFilter;

function setCheckoutCustomDate(dateStr) {
  if (!dateStr) return;
  currentHistoryFilter = 'date';

  if (DOM.btnFilterToday) DOM.btnFilterToday.classList.remove('active');
  if (DOM.btnFilterYesterday) DOM.btnFilterYesterday.classList.remove('active');
  if (DOM.btnFilterAll) DOM.btnFilterAll.classList.remove('active');

  loadCheckoutList('date', dateStr);
}
const setHistoryCustomDate = setCheckoutCustomDate;

/* ==========================================================
   6B. DAILY MOVEMENT SUMMARY & AUDIT
   ========================================================== */
async function loadDailySummary(dateStr = null) {
  const token = getAuthToken();
  if (!token) return;

  const today = new Date().toISOString().split('T')[0];
  const targetDate = dateStr || (DOM.dailySummaryDateInput ? DOM.dailySummaryDateInput.value : '') || today;
  if (DOM.dailySummaryDateInput && !DOM.dailySummaryDateInput.value) {
    DOM.dailySummaryDateInput.value = targetDate;
  }

  try {
    const res = await fetch(`/api/gate/daily-summary?date=${targetDate}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const summary = data.summary || {};
      if (DOM.sumTotalCheckedOut) DOM.sumTotalCheckedOut.textContent = summary.totalCheckedOut || 0;
      if (DOM.sumTotalCheckedIn) DOM.sumTotalCheckedIn.textContent = summary.totalCheckedIn || 0;
      if (DOM.sumCurrentlyOutside) DOM.sumCurrentlyOutside.textContent = summary.currentlyOutsideOnDate || 0;
      if (DOM.sumOverallOutside) DOM.sumOverallOutside.textContent = summary.overallCurrentlyOutside || 0;

      const stillOutside = data.stillOutsideList || [];
      if (DOM.badgeStillOutsideCount) DOM.badgeStillOutsideCount.textContent = stillOutside.length;

      if (DOM.summaryStillOutsideTableBody) {
        DOM.summaryStillOutsideTableBody.innerHTML = '';
        if (stillOutside.length === 0) {
          DOM.summaryStillOutsideTableBody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">
                All students checked out on ${escapeHtml(targetDate)} have checked in successfully.
              </td>
            </tr>
          `;
        } else {
          stillOutside.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${escapeHtml(s.rollNumber)}</strong></td>
              <td><strong>${escapeHtml(s.studentName)}</strong></td>
              <td>${escapeHtml(s.hostelBlock)} - ${escapeHtml(s.roomNumber)}</td>
              <td>${formatDateTime(s.exitTime)}</td>
              <td>${formatDateTime(s.expectedReturnTime)}</td>
              <td>${escapeHtml(s.destination || '-')}</td>
              <td><small>${escapeHtml(s.studentPhone || '-')}</small></td>
            `;
            DOM.summaryStillOutsideTableBody.appendChild(tr);
          });
        }
      }
    }
  } catch (err) {
    console.error('Error loading daily summary:', err);
  }
}

/* ==========================================================
   7. NAVIGATION & TAB SWITCHING
   ========================================================== */
function initNavigation() {
  DOM.navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.dataset.tab;
      if (tabId) switchTab(tabId);
    });
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

  // Manage camera on tab switch
  if (tabId === 'scan-qr') {
    startQrScanner();
  } else if (isScannerActive) {
    stopQrScanner();
  }

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

  if (pushHash && window.location.hash !== `#${tabId}`) {
    history.pushState(null, '', `#${tabId}`);
  }

  if (tabId === 'overview') loadCaretakerOverview();
  if (tabId === 'students-outside') loadStudentsOutside();
  if (tabId === 'checkout-list' || tabId === 'exit-history') loadCheckoutList();
  if (tabId === 'daily-summary') loadDailySummary();
}

/* ==========================================================
   8. UTILITIES, TOASTS & THEME
   ========================================================== */
function showToast(message, type = 'success') {
  if (!DOM.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `student-toast ${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  DOM.toastContainer.appendChild(toast);

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
  stopQrScanner();
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

// Global Window Exports
window.switchTab = switchTab;
window.startQrScanner = startQrScanner;
window.stopQrScanner = stopQrScanner;
window.switchCameraFacing = switchCameraFacing;
window.handleManualTokenSubmit = handleManualTokenSubmit;
window.resetScannerForNext = resetScannerForNext;
window.filterStudentsByYear = filterStudentsByYear;
window.setHistoryFilter = setHistoryFilter;
window.setHistoryCustomDate = setHistoryCustomDate;
window.loadCheckoutList = loadCheckoutList;
window.setCheckoutFilter = setCheckoutFilter;
window.setCheckoutCustomDate = setCheckoutCustomDate;
window.loadDailySummary = loadDailySummary;
window.refreshCaretakerData = refreshCaretakerData;
window.loadStudentsOutside = loadStudentsOutside;
