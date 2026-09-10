/* ==========================================================
   SMART HOSTEL OUTPASS - WATCHMAN DASHBOARD & RETURN SCANNER JS
   ========================================================== */

let currentWatchman = null;
let returnHtml5QrScannerInstance = null;
let isReturnScannerActive = false;
let isProcessingReturnScan = false;
let currentReturnCameraFacing = 'environment';
let cachedWatchmanStudentsOutside = [];
let currentReturnHistoryFilter = 'today';
let activeWatchmanTab = 'overview';

// DOM Element Cache
const DOM = {
  watchmanName: document.getElementById('watchmanName'),
  watchmanStaffId: document.getElementById('watchmanStaffId'),
  watchmanAvatar: document.getElementById('watchmanAvatar'),
  navOutsideCount: document.getElementById('navOutsideCount'),
  navUserName: document.getElementById('navUserName'),
  navUserAvatar: document.getElementById('navUserAvatar'),
  liveClockTime: document.getElementById('liveClockTime'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  dashboardSidebar: document.getElementById('dashboardSidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),

  // Metrics
  statStudentsOutside: document.getElementById('statStudentsOutside'),
  statTodayReturns: document.getElementById('statTodayReturns'),
  statLateReturns: document.getElementById('statLateReturns'),
  statOnTimeReturns: document.getElementById('statOnTimeReturns'),
  recentReturnsTableBody: document.getElementById('recentReturnsTableBody'),

  // Scanner
  returnQrScannerReader: document.getElementById('returnQrScannerReader'),
  returnCameraStoppedState: document.getElementById('returnCameraStoppedState'),
  returnScanLaserLine: document.getElementById('returnScanLaserLine'),
  btnStartReturnCamera: document.getElementById('btnStartReturnCamera'),
  btnStopReturnCamera: document.getElementById('btnStopReturnCamera'),
  btnSwitchReturnCamera: document.getElementById('btnSwitchReturnCamera'),
  qrReturnManualTokenInput: document.getElementById('qrReturnManualTokenInput'),
  returnScanResultContainer: document.getElementById('returnScanResultContainer'),

  // Students Outside
  watchmanStudentsOutsideTableBody: document.getElementById('watchmanStudentsOutsideTableBody'),

  // Check-In List & History
  checkinListTableBody: document.getElementById('checkinListTableBody') || document.getElementById('returnHistoryTableBody'),
  returnHistoryTableBody: document.getElementById('checkinListTableBody') || document.getElementById('returnHistoryTableBody'),
  btnReturnFilterToday: document.getElementById('btnReturnFilterToday'),
  btnReturnFilterYesterday: document.getElementById('btnReturnFilterYesterday'),
  btnReturnFilterAll: document.getElementById('btnReturnFilterAll'),
  checkinDateInput: document.getElementById('checkinDateInput') || document.getElementById('returnHistoryDateInput'),
  returnHistoryDateInput: document.getElementById('checkinDateInput') || document.getElementById('returnHistoryDateInput'),

  // Daily Movement Summary
  watchmanDailySummaryDateInput: document.getElementById('watchmanDailySummaryDateInput'),
  wSumTotalCheckedOut: document.getElementById('wSumTotalCheckedOut'),
  wSumTotalCheckedIn: document.getElementById('wSumTotalCheckedIn'),
  wSumCurrentlyOutside: document.getElementById('wSumCurrentlyOutside'),
  wSumOverallOutside: document.getElementById('wSumOverallOutside'),
  wBadgeStillOutsideCount: document.getElementById('wBadgeStillOutsideCount'),
  wSummaryStillOutsideTableBody: document.getElementById('wSummaryStillOutsideTableBody'),

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
  await verifyWatchmanSession();
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
    refreshWatchmanData();
  });
}

async function verifyWatchmanSession() {
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
    if (role !== 'watchman') {
      console.warn(`Role mismatch: Expected watchman, got ${role}. Redirecting.`);
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

    currentWatchman = data.user;
    populateWatchmanProfile(currentWatchman);
    await refreshWatchmanData();

  } catch (err) {
    console.error('[Watchman Session Error]:', err);
    clearAuthAndRedirect();
  }
}

function populateWatchmanProfile(user) {
  const name = user.name || 'Watchman Security';
  const staffId = user.staff_id || user.username || 'GAT-401';
  const email = user.email || 'watchman@hostel.edu';
  const phone = user.phone || '9876543216';
  const dept = user.department || 'Hostel Main Gate Security Post';

  if (DOM.watchmanName) DOM.watchmanName.textContent = name;
  if (DOM.watchmanStaffId) DOM.watchmanStaffId.textContent = staffId;
  if (DOM.watchmanAvatar) DOM.watchmanAvatar.textContent = name.charAt(0).toUpperCase();

  if (DOM.navUserName) DOM.navUserName.textContent = name;
  if (DOM.navUserAvatar) DOM.navUserAvatar.textContent = name.charAt(0).toUpperCase();

  if (DOM.profStaffName) DOM.profStaffName.textContent = name;
  if (DOM.profStaffIdTag) DOM.profStaffIdTag.textContent = `Security ID: ${staffId}`;
  if (DOM.profAvatarLarge) DOM.profAvatarLarge.textContent = name.charAt(0).toUpperCase();
  if (DOM.profStaffEmail) DOM.profStaffEmail.textContent = email;
  if (DOM.profStaffDept) DOM.profStaffDept.textContent = dept;
  if (DOM.profStaffPhone) DOM.profStaffPhone.textContent = phone;
}

/* ==========================================================
   2. DATA REFRESH & METRICS
   ========================================================== */
async function refreshWatchmanData() {
  await Promise.all([
    loadWatchmanOverview(),
    loadWatchmanStudentsOutside(),
    loadCheckinList(),
    loadWatchmanDailySummary()
  ]);
}

async function loadWatchmanOverview() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch('/api/watchman/overview', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const stats = data.stats || {};
      if (DOM.statStudentsOutside) DOM.statStudentsOutside.textContent = stats.studentsOutside || 0;
      if (DOM.statTodayReturns) DOM.statTodayReturns.textContent = stats.todayReturns || 0;
      if (DOM.statLateReturns) DOM.statLateReturns.textContent = stats.lateReturns || 0;
      if (DOM.statOnTimeReturns) DOM.statOnTimeReturns.textContent = stats.onTimeReturns || 0;

      if (DOM.navOutsideCount) {
        DOM.navOutsideCount.textContent = stats.studentsOutside || 0;
        DOM.navOutsideCount.style.display = stats.studentsOutside > 0 ? 'inline-block' : 'none';
      }

      renderRecentReturns(data.recentReturns || []);
    }
  } catch (err) {
    console.error('Error loading watchman overview:', err);
  }
}

function renderRecentReturns(list) {
  if (!DOM.recentReturnsTableBody) return;
  DOM.recentReturnsTableBody.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.recentReturnsTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No gate return records logged today yet.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(item => {
    const tr = document.createElement('tr');
    const isLate = item.isLate === 1;

    tr.innerHTML = `
      <td><strong>${formatDateTime(item.returnTime)}</strong></td>
      <td>
        <strong>${escapeHtml(item.studentName)}</strong>
        <br><small style="color:var(--text-muted);">${escapeHtml(item.rollNumber)} • ${escapeHtml(item.department)}</small>
      </td>
      <td>${escapeHtml(item.hostelBlock)} - ${escapeHtml(item.roomNumber)}</td>
      <td><span class="portal-badge" style="font-size:0.75rem;">${escapeHtml(item.requestCode)}</span></td>
      <td>${formatDateTime(item.expectedReturnTime)}</td>
      <td>
        <span class="classification-badge ${isLate ? 'badge-late' : 'badge-ontime'}">
          ${isLate ? '⚠️ Late Return' : '✓ On Time'}
        </span>
      </td>
    `;
    DOM.recentReturnsTableBody.appendChild(tr);
  });
}

/* ==========================================================
   3. QR SCANNER CONTROLLER (CAMERA & CONTINUOUS FRAME DECODER)
   ========================================================== */
function startReturnQrScanner() {
  if (isReturnScannerActive) return;

  if (DOM.returnCameraStoppedState) DOM.returnCameraStoppedState.style.display = 'none';
  if (DOM.btnStartReturnCamera) DOM.btnStartReturnCamera.style.display = 'none';
  if (DOM.btnStopReturnCamera) DOM.btnStopReturnCamera.style.display = 'inline-flex';
  if (DOM.btnSwitchReturnCamera) DOM.btnSwitchReturnCamera.style.display = 'inline-flex';
  if (DOM.returnScanLaserLine) DOM.returnScanLaserLine.style.display = 'block';

  try {
    if (!returnHtml5QrScannerInstance) {
      returnHtml5QrScannerInstance = new Html5Qrcode('returnQrScannerReader');
    }

    const config = {
      fps: 15,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.0
    };

    returnHtml5QrScannerInstance.start(
      { facingMode: currentReturnCameraFacing },
      config,
      onReturnScanSuccess,
      onReturnScanFailure
    ).then(() => {
      isReturnScannerActive = true;
    }).catch(err => {
      console.error('Camera activation error:', err);
      showToast('Camera access denied or device not found. Please use manual token input.', 'error');
      stopReturnQrScanner();
    });

  } catch (err) {
    console.error('QR Scanner init exception:', err);
    stopReturnQrScanner();
  }
}

function stopReturnQrScanner() {
  if (returnHtml5QrScannerInstance && isReturnScannerActive) {
    returnHtml5QrScannerInstance.stop().then(() => {
      isReturnScannerActive = false;
      if (DOM.returnCameraStoppedState) DOM.returnCameraStoppedState.style.display = 'block';
      if (DOM.btnStartReturnCamera) DOM.btnStartReturnCamera.style.display = 'inline-flex';
      if (DOM.btnStopReturnCamera) DOM.btnStopReturnCamera.style.display = 'none';
      if (DOM.btnSwitchReturnCamera) DOM.btnSwitchReturnCamera.style.display = 'none';
      if (DOM.returnScanLaserLine) DOM.returnScanLaserLine.style.display = 'none';
    }).catch(err => {
      console.warn('Error stopping scanner:', err);
      isReturnScannerActive = false;
    });
  } else {
    isReturnScannerActive = false;
    if (DOM.returnCameraStoppedState) DOM.returnCameraStoppedState.style.display = 'block';
    if (DOM.btnStartReturnCamera) DOM.btnStartReturnCamera.style.display = 'inline-flex';
    if (DOM.btnStopReturnCamera) DOM.btnStopReturnCamera.style.display = 'none';
    if (DOM.btnSwitchReturnCamera) DOM.btnSwitchReturnCamera.style.display = 'none';
    if (DOM.returnScanLaserLine) DOM.returnScanLaserLine.style.display = 'none';
  }
}

function switchReturnCameraFacing() {
  currentReturnCameraFacing = currentReturnCameraFacing === 'environment' ? 'user' : 'environment';
  if (isReturnScannerActive) {
    stopReturnQrScanner();
    setTimeout(() => {
      startReturnQrScanner();
    }, 400);
  }
}

function onReturnScanSuccess(decodedText, decodedResult) {
  if (isProcessingReturnScan) return;
  isProcessingReturnScan = true;

  if (navigator.vibrate) {
    navigator.vibrate(100);
  }

  handleScannedReturnToken(decodedText);
}

function onReturnScanFailure(error) {
  // Continuous scanning frame failures are expected when no QR is in view
}

function handleManualReturnTokenSubmit() {
  if (!DOM.qrReturnManualTokenInput) return;
  const token = DOM.qrReturnManualTokenInput.value.trim();
  if (!token) {
    showToast('Please enter a QR token.', 'error');
    DOM.qrReturnManualTokenInput.focus();
    return;
  }
  handleScannedReturnToken(token);
}

/* ==========================================================
   4. ATOMIC RETURN API CALL & RESULTS UI
   ========================================================== */
async function handleScannedReturnToken(qrToken) {
  const token = getAuthToken();
  if (!token) return;

  if (DOM.returnScanResultContainer) {
    DOM.returnScanResultContainer.innerHTML = `
      <div class="form-card" style="text-align:center; padding:2rem;">
        <div style="font-size:1.1rem; color:var(--text-primary); font-weight:700;">Verifying Return & Calculating Timeliness...</div>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.25rem;">Validating checkout exit logs and recording check-in in MySQL.</p>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/watchman/return', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ qr_token: qrToken })
    });

    const data = await res.json();

    if (res.ok && data.success && data.status === 'RETURN_VERIFIED') {
      renderSuccessReturnResult(data);
      showToast(data.message || 'RETURN VERIFIED: Student checked in.', 'success');
      if (DOM.qrReturnManualTokenInput) DOM.qrReturnManualTokenInput.value = '';
      await refreshWatchmanData();
    } else {
      renderInvalidReturnResult(data.validity || 'INVALID_QR', data.message || 'Return Verification failed.', data.details);
      showToast(data.message || 'Return Verification Failed', 'error');
    }

  } catch (err) {
    renderInvalidReturnResult('ERROR', 'Network error: ' + err.message);
  } finally {
    setTimeout(() => {
      isProcessingReturnScan = false;
    }, 1500);
  }
}

function renderSuccessReturnResult(response) {
  if (!DOM.returnScanResultContainer) return;
  const s = response.data;
  const isLate = response.isLate;

  DOM.returnScanResultContainer.innerHTML = `
    <div class="return-result-card ${isLate ? 'return-result-late' : 'return-result-success'}">
      <div class="result-header">
        <div style="background:${isLate ? '#f59e0b' : '#10b981'}; color:#ffffff; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.2rem;">
          ✓
        </div>
        <div>
          <h3 style="color:${isLate ? '#f59e0b' : '#10b981'}; font-family:'Outfit';">RETURN VERIFIED</h3>
          <p style="font-size:0.8rem; color:var(--text-secondary); margin:0;">Student gate check-in recorded & outpass marked as COMPLETED.</p>
        </div>
      </div>

      <div class="result-details-grid" style="grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));">
        <div class="result-detail-item">
          <span class="result-detail-label">Student Name</span>
          <span class="result-detail-value">${escapeHtml(s.studentName)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Roll Number</span>
          <span class="result-detail-value">${escapeHtml(s.rollNumber)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Department</span>
          <span class="result-detail-value">${escapeHtml(s.department)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Room & Block</span>
          <span class="result-detail-value">${escapeHtml(s.hostelBlock)} - ${escapeHtml(s.roomNumber)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Exit Time</span>
          <span class="result-detail-value">${formatDateTime(s.exitTime)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Expected Return</span>
          <span class="result-detail-value">${formatDateTime(s.expectedReturnTime)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Actual Return Time</span>
          <span class="result-detail-value" style="color:#10b981; font-weight:700;">${formatDateTime(s.actualReturnTime)}</span>
        </div>
        <div class="result-detail-item">
          <span class="result-detail-label">Current Status</span>
          <span class="result-detail-value" style="color:#10b981; font-weight:700;">INSIDE HOSTEL</span>
        </div>
      </div>

      <!-- Timeliness Banner -->
      <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:0.85rem 1rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
        <div>
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">Arrival Timeliness:</span>
          <span class="classification-badge ${isLate ? 'badge-late' : 'badge-ontime'}" style="margin-left:0.5rem;">
            ${isLate ? `⚠️ LATE RETURN` : `✓ ON TIME`}
          </span>
        </div>
        ${isLate ? `
          <div style="font-size:0.85rem; font-weight:700; color:#ef4444;">
            Late by: ${escapeHtml(response.lateDurationFormatted || response.lateDurationMinutes + ' mins')}
          </div>
        ` : `
          <div style="font-size:0.85rem; font-weight:700; color:#10b981;">
            Returned within valid schedule
          </div>
        `}
      </div>

      <div style="text-align:right;">
        <button class="primary-btn" onclick="resetReturnScannerForNext()" style="background:linear-gradient(135deg, #10b981, #059669); padding:0.5rem 1.25rem;">
          <span>Scan Next Student</span>
        </button>
      </div>
    </div>
  `;
}

function renderInvalidReturnResult(validity, message, details) {
  if (!DOM.returnScanResultContainer) return;

  let title = 'INVALID QR CODE';
  let badgeColor = '#ef4444';
  let cardClass = 'return-result-error';

  if (validity === 'NOT_EXITED') {
    title = 'STUDENT HAS NOT EXITED';
    badgeColor = '#f59e0b';
    cardClass = 'return-result-warning';
  } else if (validity === 'ALREADY_RETURNED') {
    title = 'RETURN ALREADY RECORDED';
    badgeColor = '#f59e0b';
    cardClass = 'return-result-warning';
  } else if (validity === 'REVOKED_QR') {
    title = 'QR CODE REVOKED';
    badgeColor = '#ef4444';
  }

  DOM.returnScanResultContainer.innerHTML = `
    <div class="return-result-card ${cardClass}">
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
          ${details.returnTime ? `Return Scanned At: <strong>${escapeHtml(details.returnTime)}</strong>` : ''}
        </div>
      ` : ''}

      <div style="text-align:right;">
        <button class="secondary-btn" onclick="resetReturnScannerForNext()" style="padding:0.45rem 1rem;">
          <span>Scan Again</span>
        </button>
      </div>
    </div>
  `;
}

function resetReturnScannerForNext() {
  if (DOM.returnScanResultContainer) DOM.returnScanResultContainer.innerHTML = '';
  if (DOM.qrReturnManualTokenInput) {
    DOM.qrReturnManualTokenInput.value = '';
    DOM.qrReturnManualTokenInput.focus();
  }
  isProcessingReturnScan = false;
}

/* ==========================================================
   5. STUDENTS OUTSIDE ROSTER
   ========================================================== */
async function loadWatchmanStudentsOutside() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch('/api/watchman/students-outside', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      cachedWatchmanStudentsOutside = data.students || [];
      renderWatchmanStudentsOutsideTable(cachedWatchmanStudentsOutside);
      if (DOM.statStudentsOutside) DOM.statStudentsOutside.textContent = data.totalOutside || 0;
      if (DOM.navOutsideCount) {
        DOM.navOutsideCount.textContent = data.totalOutside || 0;
        DOM.navOutsideCount.style.display = data.totalOutside > 0 ? 'inline-block' : 'none';
      }
    }
  } catch (err) {
    console.error('Error loading watchman students outside:', err);
  }
}

function renderWatchmanStudentsOutsideTable(list) {
  if (!DOM.watchmanStudentsOutsideTableBody) return;
  DOM.watchmanStudentsOutsideTableBody.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.watchmanStudentsOutsideTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No students currently outside the hostel.
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
          ${isOverdue ? `⚠️ Overdue (+${s.overdueDurationMinutes}m)` : 'Outside (On Time)'}
        </span>
      </td>
      <td>
        <span class="portal-badge" style="font-size:0.75rem;">
          ${s.requestType === 'one_day_duty' ? 'One-Day Duty' : 'Normal Outpass'}
        </span>
      </td>
    `;
    DOM.watchmanStudentsOutsideTableBody.appendChild(tr);
  });
}

/* ==========================================================
   6. CHECK-IN / RETURN LIST & DATE FILTERING
   ========================================================== */
async function loadCheckinList(filter = currentReturnHistoryFilter, customDate = null) {
  const token = getAuthToken();
  if (!token) return;

  try {
    let url = `/api/gate/checkin-list?filter=${filter}`;
    if (filter === 'date' && customDate) {
      url += `&date=${customDate}`;
    }

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      renderCheckinListTable(data.checkinList || []);
    }
  } catch (err) {
    console.error('Error loading check-in list:', err);
  }
}

function renderCheckinListTable(list) {
  const tbody = DOM.checkinListTableBody;
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No check-in return records found for the selected date filter.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(item => {
    const tr = document.createElement('tr');
    const isLate = item.isLate === 1;

    tr.innerHTML = `
      <td><strong>${formatDateTime(item.actualReturnTime)}</strong></td>
      <td><strong>${escapeHtml(item.studentName)}</strong></td>
      <td>${escapeHtml(item.rollNumber)}</td>
      <td>${escapeHtml(item.destination || '-')}</td>
      <td>${formatDateTime(item.exitTime)}</td>
      <td>${formatDateTime(item.expectedReturnTime)}</td>
      <td>
        <span class="classification-badge ${isLate ? 'badge-late' : 'badge-ontime'}">
          ${isLate ? `⚠️ Late (+${item.lateDurationMinutes}m)` : '✓ On Time'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

const loadReturnHistory = loadCheckinList;
const renderReturnHistoryTable = renderCheckinListTable;

function setCheckinFilter(filter) {
  currentReturnHistoryFilter = filter;

  if (DOM.btnReturnFilterToday) DOM.btnReturnFilterToday.classList.toggle('active', filter === 'today');
  if (DOM.btnReturnFilterYesterday) DOM.btnReturnFilterYesterday.classList.toggle('active', filter === 'yesterday');
  if (DOM.btnReturnFilterAll) DOM.btnReturnFilterAll.classList.toggle('active', filter === 'all');
  if (DOM.checkinDateInput) DOM.checkinDateInput.value = '';

  loadCheckinList(filter);
}
const setReturnHistoryFilter = setCheckinFilter;

function setCheckinCustomDate(dateStr) {
  if (!dateStr) return;
  currentReturnHistoryFilter = 'date';

  if (DOM.btnReturnFilterToday) DOM.btnReturnFilterToday.classList.remove('active');
  if (DOM.btnReturnFilterYesterday) DOM.btnReturnFilterYesterday.classList.remove('active');
  if (DOM.btnReturnFilterAll) DOM.btnReturnFilterAll.classList.remove('active');

  loadCheckinList('date', dateStr);
}
const setReturnHistoryCustomDate = setCheckinCustomDate;

/* ==========================================================
   6B. DAILY MOVEMENT SUMMARY & RETURN AUDIT
   ========================================================== */
async function loadWatchmanDailySummary(dateStr = null) {
  const token = getAuthToken();
  if (!token) return;

  const today = new Date().toISOString().split('T')[0];
  const targetDate = dateStr || (DOM.watchmanDailySummaryDateInput ? DOM.watchmanDailySummaryDateInput.value : '') || today;
  if (DOM.watchmanDailySummaryDateInput && !DOM.watchmanDailySummaryDateInput.value) {
    DOM.watchmanDailySummaryDateInput.value = targetDate;
  }

  try {
    const res = await fetch(`/api/gate/daily-summary?date=${targetDate}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const summary = data.summary || {};
      if (DOM.wSumTotalCheckedOut) DOM.wSumTotalCheckedOut.textContent = summary.totalCheckedOut || 0;
      if (DOM.wSumTotalCheckedIn) DOM.wSumTotalCheckedIn.textContent = summary.totalCheckedIn || 0;
      if (DOM.wSumCurrentlyOutside) DOM.wSumCurrentlyOutside.textContent = summary.currentlyOutsideOnDate || 0;
      if (DOM.wSumOverallOutside) DOM.wSumOverallOutside.textContent = summary.overallCurrentlyOutside || 0;

      const stillOutside = data.stillOutsideList || [];
      if (DOM.wBadgeStillOutsideCount) DOM.wBadgeStillOutsideCount.textContent = stillOutside.length;

      if (DOM.wSummaryStillOutsideTableBody) {
        DOM.wSummaryStillOutsideTableBody.innerHTML = '';
        if (stillOutside.length === 0) {
          DOM.wSummaryStillOutsideTableBody.innerHTML = `
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
            DOM.wSummaryStillOutsideTableBody.appendChild(tr);
          });
        }
      }
    }
  } catch (err) {
    console.error('Error loading watchman daily summary:', err);
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
    if (rawHash && rawHash !== activeWatchmanTab) {
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

  activeWatchmanTab = tabId;

  // Manage camera on tab switch
  if (tabId === 'scan-return') {
    startReturnQrScanner();
  } else if (isReturnScannerActive) {
    stopReturnQrScanner();
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

  if (tabId === 'overview') loadWatchmanOverview();
  if (tabId === 'students-outside') loadWatchmanStudentsOutside();
  if (tabId === 'checkin-list' || tabId === 'return-history') loadCheckinList();
  if (tabId === 'daily-summary') loadWatchmanDailySummary();
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
  stopReturnQrScanner();
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
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('sh_theme', 'dark');
}

// Global Window Exports
window.switchTab = switchTab;
window.startReturnQrScanner = startReturnQrScanner;
window.stopReturnQrScanner = stopReturnQrScanner;
window.switchReturnCameraFacing = switchReturnCameraFacing;
window.handleManualReturnTokenSubmit = handleManualReturnTokenSubmit;
window.resetReturnScannerForNext = resetReturnScannerForNext;
window.loadWatchmanStudentsOutside = loadWatchmanStudentsOutside;
window.setReturnHistoryFilter = setReturnHistoryFilter;
window.setReturnHistoryCustomDate = setReturnHistoryCustomDate;
window.loadCheckinList = loadCheckinList;
window.setCheckinFilter = setCheckinFilter;
window.setCheckinCustomDate = setCheckinCustomDate;
window.loadWatchmanDailySummary = loadWatchmanDailySummary;
window.refreshWatchmanData = refreshWatchmanData;
