/**
 * Smart Hostel Outpass Management System
 * Warden Dashboard Controller & Approval System
 */

// State
let currentWarden = null;
let activeTab = 'overview';
let pendingNormalList = [];
let pendingDutyList = [];
let activeOutpassList = [];
let selectedRequestForAction = null;

function formatStatusBadgeText(status) {
  const s = String(status || '').toUpperCase().trim();
  switch (s) {
    case 'PENDING_PARENT': return 'Pending Parent';
    case 'PENDING_WARDEN': return 'Pending Warden';
    case 'PENDING_ADVISOR': return 'Pending Advisor';
    case 'PENDING_PRINCIPAL': return 'Pending Principal';
    case 'APPROVED': return 'Approved';
    case 'REJECTED': return 'Rejected';
    case 'ACTIVE':
    case 'QR_ACTIVE': return 'QR Active';
    case 'EXPIRED': return 'Expired';
    case 'NOT_YET_VALID': return 'Not Yet Valid';
    case 'REVOKED': return 'Revoked';
    case 'OUTSIDE':
    case 'OUTSIDE_HOSTEL': return 'Outside Hostel';
    case 'INSIDE':
    case 'INSIDE_HOSTEL': return 'Inside Hostel';
    case 'COMPLETED': return 'Completed';
    case 'LATE_RETURN': return 'Late Return';
    case 'PENDING': return 'Pending Review';
    default: return s.replace(/_/g, ' ');
  }
}

/**
 * Normalizes any variation of outpass_type to strict canonical values:
 * 'normal' | 'one_day_duty' | 'emergency' | 'special'
 */
function getCanonicalOutpassType(req) {
  if (!req) return 'normal';
  const raw = String(req.outpass_type || req.outpassType || req.requestType || '').toLowerCase().trim();
  if (raw === 'emergency') return 'emergency';
  if (raw === 'special') return 'special';
  if (raw === 'one_day_duty' || raw === 'duty' || raw === 'one_day' || raw === 'oneday') return 'one_day_duty';
  return 'normal';
}

// Lightweight reverse-geocoding cache to avoid redundant network lookups
const reverseGeoCache = new Map();

/**
 * Resolves human-readable place name derived from actual latitude & longitude.
 * Falls back gracefully to "Location name unavailable" if offline or unreachable.
 * Never throws or disrupts the live GPS security workflow.
 */
async function resolveHumanReadableLocation(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return 'Location name unavailable';
  }

  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) {
    return 'Location name unavailable';
  }

  // Cache key rounded to ~100m to reuse place name for nearby points
  const cacheKey = `${numLat.toFixed(3)},${numLng.toFixed(3)}`;
  if (reverseGeoCache.has(cacheKey)) {
    return reverseGeoCache.get(cacheKey);
  }

  // Primary: BigDataCloud Client-side Reverse Geocoding (Free, CORS-friendly, zero credentials)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(numLat)}&longitude=${encodeURIComponent(numLng)}&localityLanguage=en`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const placeParts = [];
      const locality = data.locality || data.city;
      const state = data.principalSubdivision;
      if (locality) placeParts.push(locality);
      if (state && state !== locality) placeParts.push(state);

      const placeName = placeParts.join(', ').trim();
      if (placeName) {
        reverseGeoCache.set(cacheKey, placeName);
        return placeName;
      }
    }
  } catch (err) {
    console.debug('[Warden Reverse Geocode Primary Notice]:', err.message);
  }

  // Secondary Fallback: OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(numLat)}&lon=${encodeURIComponent(numLng)}`;
    const res = await fetch(nomUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || addr.state_district;
      const state = addr.state;
      const placeParts = [];
      if (city) placeParts.push(city);
      if (state && state !== city) placeParts.push(state);

      const placeName = placeParts.join(', ').trim();
      if (placeName) {
        reverseGeoCache.set(cacheKey, placeName);
        return placeName;
      }
    }
  } catch (err) {
    console.debug('[Warden Reverse Geocode Fallback Notice]:', err.message);
  }

  return 'Location name unavailable';
}

// DOM Elements cache
const DOM = {
  wardenName: document.getElementById('wardenName'),
  wardenAvatar: document.getElementById('wardenAvatar'),
  wardenStaffId: document.getElementById('wardenStaffId'),
  wardenDept: document.getElementById('wardenDept'),
  wardenBlock: document.getElementById('wardenBlock'),

  // Metric Cards
  statPendingNormal: document.getElementById('statPendingNormal'),
  statPendingDuty: document.getElementById('statPendingDuty'),
  statApprovedTotal: document.getElementById('statApprovedTotal'),
  statRejectedTotal: document.getElementById('statRejectedTotal'),
  statActiveOutpasses: document.getElementById('statActiveOutpasses'),
  statStudentsOutside: document.getElementById('statStudentsOutside'),
  statRegisteredTotal: document.getElementById('statRegisteredTotal'),

  // Nav Badges
  navBadgeNormal: document.getElementById('navBadgeNormal'),
  navBadgeEmergency: document.getElementById('navBadgeEmergency'),
  navBadgeSpecial: document.getElementById('navBadgeSpecial'),
  navBadgeDuty: document.getElementById('navBadgeDuty'),
  navBadgeRegisteredStudents: document.getElementById('navBadgeRegisteredStudents'),

  // Queues & Containers
  normalQueueContainer: document.getElementById('normalQueueContainer'),
  emergencyQueueContainer: document.getElementById('emergencyQueueContainer'),
  specialQueueContainer: document.getElementById('specialQueueContainer'),
  dutyQueueContainer: document.getElementById('dutyQueueContainer'),
  activeOutpassTableBody: document.getElementById('activeOutpassTableBody'),
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

  // Buttons & Navigation
  navButtons: document.querySelectorAll('.warden-nav-btn'),
  tabSections: document.querySelectorAll('.tab-section'),
  logoutBtn: document.getElementById('logoutBtn')
};

// Initialize Warden Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNavigation();
  initModals();
  initLogout();

  await verifyWardenSession();
});

/* ==========================================================
   1. SESSION VERIFICATION & DATA LOADING
   ========================================================== */
async function verifyWardenSession() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');

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
    if (role !== 'warden') {
      console.warn(`Role mismatch: Expected warden, got ${role}. Redirecting.`);
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

    currentWarden = data.user;
    populateWardenHeader(currentWarden);

    // Initial Data Fetch
    await refreshAllData();

  } catch (err) {
    console.error('[Warden Dash Error]:', err);
  }
}

function populateWardenHeader(warden) {
  const name = warden.name || 'Dr. Ramesh Kumar';
  const staffId = warden.staff_id || 'WRD-101';
  const dept = warden.department || 'Hostel Administration';
  const block = warden.hostel_block || 'Blocks A, B, C';

  if (DOM.wardenName) DOM.wardenName.textContent = name;
  if (DOM.wardenAvatar) DOM.wardenAvatar.textContent = name.charAt(0).toUpperCase();
  if (DOM.wardenStaffId) DOM.wardenStaffId.textContent = `Staff ID: ${staffId}`;
  if (DOM.wardenDept) DOM.wardenDept.textContent = dept;
  if (DOM.wardenBlock) DOM.wardenBlock.textContent = `Assigned: ${block}`;

  // Header user profile chip
  const navUser = document.getElementById('navUserName');
  const navAvatar = document.getElementById('navUserAvatar');
  if (navUser) navUser.textContent = name.split(' ')[0] || 'Warden';
  if (navAvatar) navAvatar.textContent = name.charAt(0).toUpperCase();

  // Profile Section
  const pName = document.getElementById('profWardenName');
  const pId = document.getElementById('profWardenId');
  const pDept = document.getElementById('profWardenDept');
  const pBlock = document.getElementById('profWardenBlock');
  const pEmail = document.getElementById('profWardenEmail');
  const pPhone = document.getElementById('profWardenPhone');

  if (pName) pName.textContent = name;
  if (pId) pId.textContent = staffId;
  if (pDept) pDept.textContent = dept;
  if (pBlock) pBlock.textContent = block;
  if (pEmail) pEmail.textContent = warden.email || 'warden@hostel.edu';
  if (pPhone) pPhone.textContent = warden.phone || '9443322110';
}

async function refreshAllData() {
  await Promise.all([
    loadOverview(),
    loadPendingNormal(),
    loadPendingDuty(),
    loadActiveOutpasses(),
    loadWardenPendingExtensions(),
    loadWardenParentMessages()
  ]);
}

/* ==========================================================
   2. DATA FETCHING METHODS
   ========================================================== */
async function loadOverview() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  try {
    const res = await fetch('/api/outpass/warden/overview', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const stats = data.stats || {};
      if (DOM.statPendingNormal) DOM.statPendingNormal.textContent = stats.pendingNormal || 0;
      if (DOM.statPendingDuty) DOM.statPendingDuty.textContent = stats.pendingDuty || 0;
      if (DOM.statApprovedTotal) DOM.statApprovedTotal.textContent = stats.approvedTotal || 0;
      if (DOM.statRejectedTotal) DOM.statRejectedTotal.textContent = stats.rejectedTotal || 0;
      if (DOM.statActiveOutpasses) DOM.statActiveOutpasses.textContent = stats.activeOutpasses || 0;
      if (DOM.statStudentsOutside) DOM.statStudentsOutside.textContent = stats.studentsOutside || 0;
      if (DOM.statRegisteredTotal) DOM.statRegisteredTotal.textContent = stats.registeredTotal || 0;

      // Nav badges
      if (DOM.navBadgeNormal) {
        DOM.navBadgeNormal.textContent = stats.pendingNormal || 0;
        DOM.navBadgeNormal.style.display = stats.pendingNormal > 0 ? 'inline-block' : 'none';
      }
      if (DOM.navBadgeDuty) {
        DOM.navBadgeDuty.textContent = stats.pendingDuty || 0;
        DOM.navBadgeDuty.style.display = stats.pendingDuty > 0 ? 'inline-block' : 'none';
      }
      if (DOM.navBadgeRegisteredStudents) {
        DOM.navBadgeRegisteredStudents.textContent = stats.registeredTotal || 0;
        DOM.navBadgeRegisteredStudents.style.display = (stats.registeredTotal > 0) ? 'inline-block' : 'none';
      }

      // Overview Year Census Quick Chips
      if (stats.registeredByYear) {
        const y1El = document.getElementById('statOverviewYear1');
        const y2El = document.getElementById('statOverviewYear2');
        const y3El = document.getElementById('statOverviewYear3');
        const y4El = document.getElementById('statOverviewYear4');
        if (y1El) y1El.textContent = stats.registeredByYear.year1 || 0;
        if (y2El) y2El.textContent = stats.registeredByYear.year2 || 0;
        if (y3El) y3El.textContent = stats.registeredByYear.year3 || 0;
        if (y4El) y4El.textContent = stats.registeredByYear.year4 || 0;
      }

      // Render recent activity table
      renderRecentActivity(data.recentRequests || []);
    }
  } catch (err) {
    console.error('Error loading overview:', err);
  }
}

// Alias for backwards compatibility
const loadOverviewStats = loadOverview;

async function loadPendingNormal() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  try {
    const res = await fetch('/api/outpass/warden/pending', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      pendingNormalList = data.pendingRequests || [];
      const normalList = (data.normalRequests || pendingNormalList.filter(r => getCanonicalOutpassType(r) === 'normal'))
        .filter(r => getCanonicalOutpassType(r) === 'normal');
      const emergencyList = (data.emergencyRequests || pendingNormalList.filter(r => getCanonicalOutpassType(r) === 'emergency'))
        .filter(r => getCanonicalOutpassType(r) === 'emergency');
      const specialList = (data.specialRequests || pendingNormalList.filter(r => getCanonicalOutpassType(r) === 'special'))
        .filter(r => getCanonicalOutpassType(r) === 'special');

      renderNormalQueue(normalList);
      renderEmergencyQueue(emergencyList);
      renderSpecialQueue(specialList);

      // Nav badges
      if (DOM.navBadgeNormal) {
        DOM.navBadgeNormal.textContent = normalList.length;
        DOM.navBadgeNormal.style.display = normalList.length > 0 ? 'inline-block' : 'none';
      }
      if (DOM.navBadgeEmergency) {
        DOM.navBadgeEmergency.textContent = emergencyList.length;
        DOM.navBadgeEmergency.style.display = emergencyList.length > 0 ? 'inline-block' : 'none';
      }
      if (DOM.navBadgeSpecial) {
        DOM.navBadgeSpecial.textContent = specialList.length;
        DOM.navBadgeSpecial.style.display = specialList.length > 0 ? 'inline-block' : 'none';
      }
    }
  } catch (err) {
    console.error('Error loading pending normal:', err);
  }
}

async function loadPendingDuty() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  try {
    const res = await fetch('/api/outpass/warden/pending-duty', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      pendingDutyList = data.pendingDutyRequests || [];
      renderDutyQueue(pendingDutyList);
    }
  } catch (err) {
    console.error('Error loading pending duty:', err);
  }
}

async function loadActiveOutpasses() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  try {
    const res = await fetch('/api/outpass/warden/active', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      activeOutpassList = data.activeOutpasses || [];
      renderActiveTable(activeOutpassList);
    }
  } catch (err) {
    console.error('Error loading active passes:', err);
  }
}

/* ==========================================================
   3. RENDERING QUEUES & TABLES (STRICT TYPE SEGREGATION)
   ========================================================== */

/**
 * Renders ONLY canonical 'normal' outpass requests
 */
function renderNormalQueue(list) {
  if (!DOM.normalQueueContainer) return;
  DOM.normalQueueContainer.innerHTML = '';

  const normalList = (list || []).filter(r => getCanonicalOutpassType(r) === 'normal');

  if (normalList.length === 0) {
    DOM.normalQueueContainer.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <h4 class="empty-title">All Normal Outpasses Reviewed</h4>
        <p class="empty-desc">There are no pending normal outpass applications awaiting Warden authorization at this moment.</p>
      </div>
    `;
    return;
  }

  normalList.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.id = `req-card-${req.id}`;

    const isFaceVerified = (req.parentFaceVerified === 1 || req.faceVerificationResult === 'VERIFIED' || req.biometricVerificationResult === 'VERIFIED');
    const boxBg = isFaceVerified ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.06)';
    const boxBorder = isFaceVerified ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(239,68,68,0.2)';
    const iconColor = isFaceVerified ? '#10b981' : '#ef4444';
    const badgeHtml = isFaceVerified
      ? `<span class="status-badge status-approved" style="font-size:0.7rem; padding:2px 6px;">FACE VERIFIED ✓</span>`
      : `<span class="status-badge status-rejected" style="font-size:0.7rem; padding:2px 6px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">UNVERIFIED</span>`;

    card.innerHTML = `
      <div class="request-card-header">
        <div>
          <div class="student-tag-group">
            <span class="request-code-badge">${req.requestCode}</span>
            <span class="student-tag" style="background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.3);">Normal Outpass</span>
            <span class="student-tag">Student: <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})</span>
            <span class="student-tag">${req.studentDept} • Yr ${req.studentYear}</span>
            <span class="student-tag">${req.studentBlock} - ${req.studentRoom}</span>
          </div>
          <h3 style="font-family:'Outfit'; font-size:1.15rem; margin-top:0.4rem; color:var(--text-primary);">
            ${escapeHtml(req.purpose)}
          </h3>
        </div>
        <span class="status-badge status-pending-warden">Pending Warden</span>
      </div>

      <div class="request-details-grid">
        <div class="detail-item">
          <span class="detail-label">Destination</span>
          <span class="detail-value">${escapeHtml(req.destination)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Leaving Schedule</span>
          <span class="detail-value">${formatDateTime(req.leavingDatetime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Expected Return</span>
          <span class="detail-value">${formatDateTime(req.returnDatetime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Parent / Contact</span>
          <span class="detail-value">${escapeHtml(req.parentName || 'Parent')} (${req.parentVerifiedMobile || req.parentPhone || req.contactPhone || 'N/A'})</span>
        </div>
      </div>

      <div style="margin: 0.6rem 0; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); background: ${boxBg}; border: ${boxBorder}; font-size: 0.82rem;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem; flex-wrap:wrap; gap:0.35rem;">
          <span style="color: ${iconColor}; font-weight: 700; display: flex; align-items: center; gap: 0.35rem;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            Parent Biometric Consent: <span style="text-decoration:underline;">APPROVED</span>
          </span>
          <span>${badgeHtml}</span>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.78rem; color:var(--text-secondary); flex-wrap:wrap; gap:0.35rem; margin-bottom:0.35rem;">
          <span>Biometric Auth: <strong style="color:${isFaceVerified ? '#10b981' : '#ef4444'};">${isFaceVerified ? '128D Face Biometrics (Matched)' : 'Biometrics Pending'}</strong></span>
          <span>Parent Mobile: <strong style="font-family:monospace; color:var(--text-primary);">${escapeHtml(req.parentVerifiedMobile || req.parentPhone || 'N/A')}</strong></span>
        </div>
        <div style="margin-top:0.45rem; font-size:0.83rem; color:var(--text-primary); border-top:1px dashed ${isFaceVerified ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}; padding-top:0.35rem;">
          <strong style="color:var(--text-secondary); font-size:0.75rem; text-transform:uppercase;">Parent Message:</strong>
          <div style="margin-top:0.15rem; font-style:italic; word-break:break-word;">
            "${escapeHtml(req.parentMessage || 'Approved')}"
          </div>
        </div>
      </div>

      <div class="request-card-actions">
        <button class="btn-view-details" onclick="openDetailsModal(${req.id}, 'normal')">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>View Details</span>
        </button>
        <button class="btn-reject" onclick="openRejectModal(${req.id})">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          <span>Reject</span>
        </button>
        <button class="btn-approve" onclick="openApproveModal(${req.id})">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Approve Outpass</span>
        </button>
      </div>
    `;

    DOM.normalQueueContainer.appendChild(card);
  });
}

/**
 * Renders ONLY canonical 'emergency' outpass requests (Direct Warden authority)
 */
function renderEmergencyQueue(list) {
  if (!DOM.emergencyQueueContainer) return;
  DOM.emergencyQueueContainer.innerHTML = '';

  const emergencyList = (list || []).filter(r => getCanonicalOutpassType(r) === 'emergency');

  if (emergencyList.length === 0) {
    DOM.emergencyQueueContainer.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-icon" style="color:#ef4444; background:rgba(239,68,68,0.1);">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <h4 class="empty-title">No Pending Emergency Outpasses</h4>
        <p class="empty-desc">There are no urgent emergency outpasses requiring direct Warden authorization right now.</p>
      </div>
    `;
    return;
  }

  emergencyList.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.id = `req-card-${req.id}`;
    card.style.borderLeft = '4px solid #ef4444';
    card.style.background = 'rgba(239,68,68,0.03)';

    card.innerHTML = `
      <div class="request-card-header">
        <div>
          <div class="student-tag-group">
            <span class="request-code-badge" style="background:rgba(239,68,68,0.2); color:#ef4444; border-color:rgba(239,68,68,0.4);">${req.requestCode}</span>
            <span class="student-tag" style="background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid rgba(239,68,68,0.5); font-weight:700;">🚨 EMERGENCY (${escapeHtml(req.emergencyCategory || req.emergencyType || 'Urgent')})</span>
            <span class="student-tag">Student: <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})</span>
            <span class="student-tag">${req.studentDept} • Yr ${req.studentYear}</span>
            <span class="student-tag">${req.studentBlock} - ${req.studentRoom}</span>
          </div>
          <h3 style="font-family:'Outfit'; font-size:1.15rem; margin-top:0.4rem; color:var(--text-primary);">
            ${escapeHtml(req.purpose)}
          </h3>
        </div>
        <span class="status-badge" style="background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid #ef4444; font-weight:700;">🚨 DIRECT WARDEN APPROVAL</span>
      </div>

      <div class="request-details-grid">
        <div class="detail-item">
          <span class="detail-label">Destination</span>
          <span class="detail-value">${escapeHtml(req.destination)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Leaving Schedule</span>
          <span class="detail-value">${formatDateTime(req.leavingDatetime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Expected Return</span>
          <span class="detail-value">${formatDateTime(req.returnDatetime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Parent / Contact</span>
          <span class="detail-value">${escapeHtml(req.parentName || 'Parent')} (${req.parentVerifiedMobile || req.parentPhone || req.contactPhone || 'N/A'})</span>
        </div>
        <div class="detail-item" style="grid-column: 1 / -1; background:rgba(239,68,68,0.08); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid rgba(239,68,68,0.3); margin-top:0.3rem;">
          <div style="color:#ef4444; font-weight:700; font-size:0.8rem;">🚨 EMERGENCY CONTACT & DETAILS</div>
          <div style="font-size:0.85rem; color:var(--text-primary); margin-top:0.2rem;"><strong>Contact:</strong> ${escapeHtml(req.emergencyContact || 'N/A')}</div>
          ${req.additionalRemarks ? `<div style="font-size:0.85rem; color:var(--text-secondary); margin-top:0.2rem;"><strong>Details / Reason:</strong> ${escapeHtml(req.additionalRemarks)}</div>` : ''}
        </div>
      </div>

      <div style="margin: 0.6rem 0; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.25); font-size: 0.82rem;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.35rem; flex-wrap:wrap; gap:0.35rem;">
          <span style="color: #ef4444; font-weight: 700; display: flex; align-items: center; gap: 0.35rem;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            DIRECT WARDEN APPROVAL WORKFLOW
          </span>
          <span class="status-badge" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3); font-size:0.72rem; padding:2px 7px;">NO PARENT CONSENT REQUIRED</span>
        </div>
        <div style="font-size:0.8rem; color:var(--text-secondary);">
          Direct Warden authorization for urgent/unplanned circumstances. Approving will immediately generate the secure student QR Code.
        </div>
      </div>

      <div class="request-card-actions">
        <button class="btn-view-details" onclick="openDetailsModal(${req.id}, 'emergency')">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>View Details</span>
        </button>
        <button class="btn-reject" onclick="openRejectModal(${req.id})">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          <span>Reject</span>
        </button>
        <button class="btn-approve" onclick="openApproveModal(${req.id})" style="background:linear-gradient(135deg, #ef4444, #b91c1c);">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Approve Emergency & Issue QR</span>
        </button>
      </div>
    `;

    DOM.emergencyQueueContainer.appendChild(card);
  });
}

/**
 * Renders ONLY canonical 'special' outpass requests (Tier 4 Final Warden clearance)
 */
function renderSpecialQueue(list) {
  if (!DOM.specialQueueContainer) return;
  DOM.specialQueueContainer.innerHTML = '';

  const specialList = (list || []).filter(r => getCanonicalOutpassType(r) === 'special');

  if (specialList.length === 0) {
    DOM.specialQueueContainer.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-icon" style="color:#a78bfa; background:rgba(139,92,246,0.1);">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </div>
        <h4 class="empty-title">No Pending Special Outpasses</h4>
        <p class="empty-desc">Special outpasses will appear here only after completing Parent Biometrics, Advisor, and Principal authorizations.</p>
      </div>
    `;
    return;
  }

  specialList.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.id = `req-card-${req.id}`;
    card.style.borderLeft = '4px solid #8b5cf6';
    card.style.background = 'rgba(139,92,246,0.03)';

    card.innerHTML = `
      <div class="request-card-header">
        <div>
          <div class="student-tag-group">
            <span class="request-code-badge" style="background:rgba(139,92,246,0.2); color:#a78bfa; border-color:rgba(139,92,246,0.4);">${req.requestCode}</span>
            <span class="student-tag" style="background:rgba(139,92,246,0.2); color:#a78bfa; border:1px solid rgba(139,92,246,0.5); font-weight:700;">⭐ SPECIAL (${escapeHtml(req.specialType || 'Authorized')})</span>
            <span class="student-tag">Student: <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})</span>
            <span class="student-tag">${req.studentDept} • Yr ${req.studentYear}</span>
            <span class="student-tag">${req.studentBlock} - ${req.studentRoom}</span>
          </div>
          <h3 style="font-family:'Outfit'; font-size:1.15rem; margin-top:0.4rem; color:var(--text-primary);">
            ${escapeHtml(req.purpose)}
          </h3>
        </div>
        <span class="status-badge" style="background:rgba(139,92,246,0.2); color:#a78bfa; border:1px solid #8b5cf6; font-weight:700;">⭐ 4-Tier Final Clearance</span>
      </div>

      <div class="request-details-grid">
        <div class="detail-item">
          <span class="detail-label">Destination</span>
          <span class="detail-value">${escapeHtml(req.destination)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Leaving Schedule</span>
          <span class="detail-value">${formatDateTime(req.leavingDatetime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Expected Return</span>
          <span class="detail-value">${formatDateTime(req.returnDatetime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Parent / Contact</span>
          <span class="detail-value">${escapeHtml(req.parentName || 'Parent')} (${req.parentVerifiedMobile || req.parentPhone || req.contactPhone || 'N/A'})</span>
        </div>
        <div class="detail-item" style="grid-column: 1 / -1; background:rgba(139,92,246,0.08); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid rgba(139,92,246,0.3); margin-top:0.3rem;">
          <div style="color:#a78bfa; font-weight:700; font-size:0.8rem;">⭐ 4-TIER CLEARANCE SUMMARY (3 OF 4 TIERS AUTHORIZED)</div>
          <div style="font-size:0.83rem; color:var(--text-primary); margin-top:0.2rem;">
            <span style="color:#10b981;">✓ Tier 1: Parent Face Biometrics Verified</span> | 
            <span style="color:#10b981;">✓ Tier 2: Advisor Approved</span> | 
            <span style="color:#10b981;">✓ Tier 3: Principal Authorized</span>
          </div>
          ${req.additionalRemarks ? `<div style="font-size:0.83rem; color:var(--text-secondary); margin-top:0.2rem;"><strong>Justification:</strong> ${escapeHtml(req.additionalRemarks)}</div>` : ''}
          ${req.attachmentUrl ? `<div style="font-size:0.83rem; margin-top:0.2rem;"><a href="${escapeHtml(req.attachmentUrl)}" target="_blank" style="color:#60a5fa; text-decoration:underline;">View Supporting Attachment ↗</a></div>` : ''}
        </div>
      </div>

      <div class="request-card-actions">
        <button class="btn-view-details" onclick="openDetailsModal(${req.id}, 'special')">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>View Details</span>
        </button>
        <button class="btn-reject" onclick="openRejectModal(${req.id})">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          <span>Reject</span>
        </button>
        <button class="btn-approve" onclick="openApproveModal(${req.id})" style="background:linear-gradient(135deg, #8b5cf6, #6d28d9);">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Approve Special & Issue QR</span>
        </button>
      </div>
    `;

    DOM.specialQueueContainer.appendChild(card);
  });
}

function renderDutyQueue(list) {
  if (!DOM.dutyQueueContainer) return;
  DOM.dutyQueueContainer.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.dutyQueueContainer.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
        </div>
        <h4 class="empty-title">No Pending One-Day Duty Outpasses</h4>
        <p class="empty-desc">One-Day Duty passes appear here only after academic verification and approval by the Class Advisor.</p>
      </div>
    `;
    return;
  }

  list.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.id = `req-card-${req.id}`;
    card.style.borderLeft = '3.5px solid #a855f7';

    card.innerHTML = `
      <div class="request-card-header">
        <div>
          <div class="student-tag-group">
            <span class="request-code-badge">${req.requestCode}</span>
            <span class="student-tag" style="background:rgba(168,85,247,0.15); color:#c084fc;">One-Day Duty</span>
            <span class="student-tag">Student: <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})</span>
            <span class="student-tag">${req.studentDept} • Sec ${req.studentSection || 'A'}</span>
          </div>
          <h3 style="font-family:'Outfit'; font-size:1.15rem; margin-top:0.4rem; color:var(--text-primary);">
            Event: ${escapeHtml(req.eventName || req.purpose)}
          </h3>
        </div>
        <span class="status-badge" style="background:rgba(99,102,241,0.15); color:#818cf8; border:1px solid rgba(99,102,241,0.3);">Advisor Approved • Principal Authorization Queue</span>
      </div>

      <div class="request-details-grid">
        <div class="detail-item">
          <span class="detail-label">Venue / Organization</span>
          <span class="detail-value">${escapeHtml(req.eventLocation || req.destination)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Duty Date & Time</span>
          <span class="detail-value">${req.dutyDate ? req.dutyDate : formatDateTime(req.leavingDatetime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Advisor Clearance</span>
          <span class="detail-value" style="color:#10b981;">✓ Approved by ${escapeHtml(req.advisorName || 'Class Advisor')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Expected Return</span>
          <span class="detail-value">${formatDateTime(req.returnDatetime)}</span>
        </div>
      </div>

      <div class="request-card-actions" style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.78rem; color:var(--text-muted);">
          ℹ️ One-Day Permission is authorized exclusively by the Principal.
        </span>
        <button class="btn-view-details" onclick="openDetailsModal(${req.id}, 'duty')">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>View Details</span>
        </button>
      </div>
    `;

    DOM.dutyQueueContainer.appendChild(card);
  });
}

function renderActiveTable(list) {
  if (!DOM.activeOutpassTableBody) return;
  DOM.activeOutpassTableBody.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.activeOutpassTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No active approved outpasses found.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(req => {
    const tr = document.createElement('tr');
    const isOutside = req.exitTime && !req.returnTime;
    const hasActiveQr = req.qrId && req.qrStatus === 'ACTIVE';

    tr.innerHTML = `
      <td><strong>${req.requestCode}</strong></td>
      <td>
        <strong>${escapeHtml(req.studentName)}</strong>
        <br><small style="color:var(--text-muted);">${req.studentRegNo} • ${req.studentDept}</small>
      </td>
      <td>${req.studentBlock} - ${req.studentRoom}</td>
      <td>${escapeHtml(req.destination)}</td>
      <td>${formatDateTime(req.returnDatetime || req.to_datetime)}</td>
      <td>
        <span class="status-badge ${isOutside ? 'status-pending-warden' : 'status-approved'}">
          ${isOutside ? 'Outside Campus' : 'Approved (Inside)'}
        </span>
      </td>
      <td>
        ${!hasActiveQr ? `
          <button class="primary-btn" style="padding:0.4rem 0.8rem; font-size:0.78rem; font-weight:700; background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; border-radius:var(--radius-sm); color:#ffffff; cursor:pointer; display:inline-flex; align-items:center; gap:0.35rem; box-shadow:0 2px 8px rgba(37,99,235,0.3);" onclick="generateQrForApprovedPass(${req.id})">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            <span>Generate QR</span>
          </button>
        ` : `
          <div style="display:inline-flex; gap:0.35rem; align-items:center;">
            <button class="secondary-btn" style="padding:0.35rem 0.65rem; font-size:0.75rem; font-weight:600;" onclick="openQrPreviewModal('${req.requestCode}', '${escapeHtml(req.studentName)}', '${req.studentRegNo}', '${req.qrImageData}', '${req.qrToken}', '${req.leavingDatetime || req.from_datetime}', '${req.returnDatetime || req.to_datetime}', '${req.qrStatus}', ${req.qrId}, ${req.id})">
              🔍 View QR
            </button>
            <button class="btn-reject" style="padding:0.35rem 0.65rem; font-size:0.75rem; font-weight:600;" onclick="openRevokeQrModal(${req.qrId}, '${req.requestCode}')">
              Revoke QR
            </button>
          </div>
        `}
      </td>
      <td><small style="color:var(--text-muted);">${formatDateTime(req.approvedAt)}</small></td>
    `;

    DOM.activeOutpassTableBody.appendChild(tr);
  });
}

function renderRecentActivity(list) {
  if (!DOM.recentActivityTableBody) return;
  DOM.recentActivityTableBody.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.recentActivityTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No recent outpass activity recorded yet.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(req => {
    const tr = document.createElement('tr');
    let badgeClass = 'status-pending-warden';
    if (req.status === 'APPROVED') badgeClass = 'status-approved';
    if (req.status === 'REJECTED') badgeClass = 'status-rejected';

    tr.innerHTML = `
      <td><strong>${req.requestCode}</strong></td>
      <td>
        <strong>${escapeHtml(req.studentName)}</strong>
        <br><small style="color:var(--text-muted);">${req.studentRegNo}</small>
      </td>
      <td>${req.requestType === 'one_day_duty' ? 'One-Day Duty' : 'Normal Outpass'}</td>
      <td>${escapeHtml(req.destination)}</td>
      <td><span class="status-badge ${badgeClass}">${formatStatusBadgeText(req.status)}</span></td>
      <td><small style="color:var(--text-muted);">${formatDateTime(req.submittedDate)}</small></td>
    `;

    DOM.recentActivityTableBody.appendChild(tr);
  });
}

/* ==========================================================
   4. MODALS & APPROVE / REJECT ACTIONS
   ========================================================== */
function initModals() {
  // Confirm Approve Button
  if (DOM.btnConfirmApprove) {
    DOM.btnConfirmApprove.addEventListener('click', async () => {
      if (!selectedRequestForAction) return;
      await executeApprove(selectedRequestForAction);
    });
  }

  // Confirm Reject Button
  if (DOM.btnConfirmReject) {
    DOM.btnConfirmReject.addEventListener('click', async () => {
      if (!selectedRequestForAction) return;
      const reason = DOM.rejectReasonInput ? DOM.rejectReasonInput.value.trim() : '';
      if (!reason) {
        showToast('Please enter a rejection reason before rejecting.', 'error');
        if (DOM.rejectReasonInput) DOM.rejectReasonInput.focus();
        return;
      }
      await executeReject(selectedRequestForAction, reason);
    });
  }
}

function openDetailsModal(requestId, type) {
  const list = type === 'duty' ? pendingDutyList : pendingNormalList;
  const req = list.find(r => r.id === requestId);
  if (!req) return;

  if (DOM.detailsModalBody) {
    const isParentApproved = req.parentApprovalStatus === 'APPROVED' || req.parentApprovedAt || (type === 'normal');
    const isParentRejected = req.status === 'REJECTED' || req.parentApprovalStatus === 'REJECTED';

    let parentApprovalHtml = '';
    if (req.requestType === 'emergency') {
      parentApprovalHtml = `
        <div class="emergency-details-section" style="margin-top:1.25rem; padding:1.1rem; border-radius:var(--radius-sm); background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.25);">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; border-bottom:1px solid rgba(239,68,68,0.2); padding-bottom:0.5rem;">
            <h4 style="font-family:'Outfit'; font-size:1rem; font-weight:700; color:#ef4444; margin:0; display:flex; align-items:center; gap:0.5rem;">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              🚨 EMERGENCY OUTPASS — DIRECT WARDEN REVIEW
            </h4>
            <span class="status-badge" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3); font-size:0.75rem; padding:3px 8px;">
              NO PARENT APPROVAL REQUIRED
            </span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:0.65rem; font-size:0.86rem;">
            <div><strong style="color:var(--text-secondary);">Emergency Type:</strong> <span style="color:#ef4444; font-weight:700;">${escapeHtml(req.emergencyCategory || req.emergencyType || 'Medical / Emergency')}</span></div>
            <div><strong style="color:var(--text-secondary);">Emergency Contact:</strong> <span style="color:var(--text-primary); font-family:monospace; font-weight:600;">${escapeHtml(req.emergencyContact || 'N/A')}</span></div>
            <div><strong style="color:var(--text-secondary);">Workflow Routing:</strong> <span style="color:#10b981; font-weight:600;">Student → Warden → QR (Direct)</span></div>
            <div><strong style="color:var(--text-secondary);">Parent Involvement:</strong> <span style="color:var(--text-secondary);">None (Emergency Protocol)</span></div>
          </div>
          <div style="margin-top:0.85rem; padding-top:0.6rem; border-top:1px dashed rgba(239,68,68,0.25); font-size:0.86rem;">
            <strong style="color:var(--text-secondary);">Emergency Details / Reason:</strong>
            <div style="margin-top:0.3rem; color:var(--text-primary); background:var(--bg-card); padding:0.6rem 0.85rem; border-radius:4px; border-left:3.5px solid #ef4444; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              ${escapeHtml(req.additionalRemarks || req.purpose || 'None provided')}
            </div>
          </div>
        </div>
      `;
    } else if (isParentApproved) {
      const isFaceVerified = (req.parentFaceVerified === 1 || req.faceVerificationResult === 'VERIFIED' || req.biometricVerificationResult === 'VERIFIED');
      parentApprovalHtml = `
        <div class="parent-approval-section" style="margin-top:1.25rem; padding:1.1rem; border-radius:var(--radius-sm); background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.25);">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; border-bottom:1px solid rgba(16,185,129,0.2); padding-bottom:0.5rem;">
            <h4 style="font-family:'Outfit'; font-size:1rem; font-weight:700; color:#10b981; margin:0; display:flex; align-items:center; gap:0.5rem;">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              PARENT CONSENT & BIOMETRIC FACE VERIFICATION
            </h4>
            <span class="status-badge ${isFaceVerified ? 'status-approved' : 'status-rejected'}" style="font-size:0.75rem; padding:3px 8px; ${isFaceVerified ? '' : 'background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);'}">
              ${isFaceVerified ? 'FACE VERIFIED ✓' : 'UNVERIFIED'}
            </span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:0.65rem; font-size:0.86rem;">
            <div><strong style="color:var(--text-secondary);">Parent Name:</strong> <span style="color:var(--text-primary); font-weight:600;">${escapeHtml(req.parentName || 'Parent')}</span></div>
            <div><strong style="color:var(--text-secondary);">Verified Mobile:</strong> <span style="color:var(--text-primary); font-family:monospace; font-weight:600;">${escapeHtml(req.parentVerifiedMobile || req.parentPhone || 'N/A')}</span></div>
            <div><strong style="color:var(--text-secondary);">Parent Consent Status:</strong> <span style="color:#10b981; font-weight:700;">APPROVED</span></div>
            <div><strong style="color:var(--text-secondary);">Biometric Authentication:</strong> <span style="color:${isFaceVerified ? '#10b981' : '#ef4444'}; font-weight:700;">${isFaceVerified ? '128D Face Biometrics (Confirmed Match)' : 'Unverified'}</span></div>
            <div><strong style="color:var(--text-secondary);">Biometric Verification Time:</strong> <span style="color:var(--text-primary);">${formatDateTime(req.parentFaceVerifiedAt || req.parentApprovedAt)}</span></div>
            <div><strong style="color:var(--text-secondary);">Security Protocol:</strong> <span style="color:#10b981; font-weight:600;">AI Neural Vector Comparison (D ≤ 0.45)</span></div>
          </div>
          ${req.parentMessage ? `
            <div style="margin-top:0.85rem; padding-top:0.6rem; border-top:1px dashed rgba(16,185,129,0.25); font-size:0.86rem;">
              <strong style="color:var(--text-secondary);">Parent Message to Warden:</strong>
              <div style="margin-top:0.3rem; font-style:italic; color:var(--text-primary); background:var(--bg-card); padding:0.6rem 0.85rem; border-radius:4px; border-left:3.5px solid #10b981; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                "${escapeHtml(req.parentMessage)}"
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } else if (isParentRejected) {
      parentApprovalHtml = `
        <div class="parent-approval-section" style="margin-top:1.25rem; padding:1.1rem; border-radius:var(--radius-sm); background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.25);">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; border-bottom:1px solid rgba(239,68,68,0.2); padding-bottom:0.5rem;">
            <h4 style="font-family:'Outfit'; font-size:1rem; font-weight:700; color:#ef4444; margin:0;">
              PARENT CONSENT REJECTION
            </h4>
            <span class="status-badge status-rejected" style="font-size:0.75rem; padding:3px 8px;">REJECTED</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:0.6rem; font-size:0.86rem;">
            <div><strong style="color:var(--text-secondary);">Parent Name:</strong> <span style="color:var(--text-primary);">${escapeHtml(req.parentName || 'Parent')}</span></div>
            <div><strong style="color:var(--text-secondary);">Registered Mobile:</strong> <span style="color:var(--text-primary); font-family:monospace;">${escapeHtml(req.parentVerifiedMobile || req.parentPhone || 'N/A')}</span></div>
            <div><strong style="color:var(--text-secondary);">Student Name:</strong> <span style="color:var(--text-primary);">${escapeHtml(req.studentName)}</span></div>
            <div><strong style="color:var(--text-secondary);">Rejection Time:</strong> <span style="color:var(--text-primary);">${formatDateTime(req.rejectedAt || req.submittedDate)}</span></div>
            <div><strong style="color:var(--text-secondary);">Rejection Reason:</strong> <span style="color:#ef4444; font-weight:600;">${escapeHtml(req.rejectionReason || 'Denied by Parent')}</span></div>
            <div><strong style="color:var(--text-secondary);">Status:</strong> <span style="color:#ef4444; font-weight:700;">REJECTED</span></div>
          </div>
        </div>
      `;
    }

    DOM.detailsModalBody.innerHTML = `
      <div class="autofill-context-grid" style="margin-bottom:1rem;">
        <div class="autofill-item">
          <span class="autofill-label">Student Name</span>
          <span class="autofill-val">${escapeHtml(req.studentName)}</span>
        </div>
        <div class="autofill-item">
          <span class="autofill-label">Roll Number</span>
          <span class="autofill-val">${req.studentRegNo}</span>
        </div>
        <div class="autofill-item">
          <span class="autofill-label">Department</span>
          <span class="autofill-val">${req.studentDept} (${req.semester || 'Semester 6'})</span>
        </div>
        <div class="autofill-item">
          <span class="autofill-label">Hostel & Room</span>
          <span class="autofill-val">${req.studentBlock} - ${req.studentRoom}</span>
        </div>
        <div class="autofill-item">
          <span class="autofill-label">Student Mobile</span>
          <span class="autofill-val">${req.contactPhone || req.studentRegisteredPhone || 'N/A'}</span>
        </div>
        <div class="autofill-item">
          <span class="autofill-label">Parent Details</span>
          <span class="autofill-val">${escapeHtml(req.parentName || 'Parent')} (${req.parentVerifiedMobile || req.parentPhone || 'N/A'})</span>
        </div>
      </div>

      <div style="background:var(--bg-input); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:0.5rem;">
        <div><strong>Place of Visit:</strong> ${escapeHtml(req.destination)}</div>
        <div><strong>Purpose:</strong> ${escapeHtml(req.purpose)}</div>
        ${req.eventName ? `<div><strong>Event Name:</strong> ${escapeHtml(req.eventName)}</div>` : ''}
        ${req.eventLocation ? `<div><strong>Event Venue:</strong> ${escapeHtml(req.eventLocation)}</div>` : ''}
        ${req.dutyDescription ? `<div><strong>Duty Details:</strong> ${escapeHtml(req.dutyDescription)}</div>` : ''}
        <div><strong>Departure Schedule:</strong> ${formatDateTime(req.leavingDatetime)}</div>
        <div><strong>Expected Return:</strong> ${formatDateTime(req.returnDatetime)}</div>
      </div>

      ${parentApprovalHtml}
    `;
  }

  openModal('detailsModal');

  if (req.parentApprovalLat && req.parentApprovalLng) {
    resolveHumanReadableLocation(req.parentApprovalLat, req.parentApprovalLng).then(placeName => {
      const placeEl = document.getElementById('details-parent-place');
      if (placeEl) placeEl.textContent = placeName || 'Location name unavailable';
    }).catch(() => {
      const placeEl = document.getElementById('details-parent-place');
      if (placeEl) placeEl.textContent = 'Location name unavailable';
    });
  }
}

function openApproveModal(requestId) {
  selectedRequestForAction = requestId;
  const req = pendingNormalList.find(r => r.id === requestId) || pendingDutyList.find(r => r.id === requestId);
  if (!req) return;

  if (DOM.approveModalBody) {
    if (req.requestType === 'emergency') {
      DOM.approveModalBody.innerHTML = `
        <p>Are you sure you want to approve Emergency Outpass request <strong>${req.requestCode}</strong> for <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})?</p>
        <div style="margin:0.75rem 0; padding:0.75rem 0.9rem; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); border-radius:4px; font-size:0.84rem; display:flex; flex-direction:column; gap:0.35rem;">
          <div><strong>Workflow Routing:</strong> <span style="color:#ef4444; font-weight:700;">DIRECT WARDEN APPROVAL (NO PARENT REQUIRED)</span></div>
          <div><strong>Emergency Type:</strong> <span style="font-weight:600;">${escapeHtml(req.emergencyCategory || req.emergencyType || 'Emergency')}</span></div>
          <div><strong>Emergency Contact:</strong> <span style="font-family:monospace; font-weight:600;">${escapeHtml(req.emergencyContact || 'N/A')}</span></div>
          <div style="margin-top:0.25rem; padding-top:0.35rem; border-top:1px dashed rgba(239,68,68,0.25);">
            <strong>Emergency Details / Reason:</strong> <em style="color:var(--text-primary);">${escapeHtml(req.additionalRemarks || req.purpose || 'N/A')}</em>
          </div>
        </div>
        <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:0.5rem;">
          Destination: <strong>${escapeHtml(req.destination)}</strong><br>
          Leaving: <strong>${formatDateTime(req.leavingDatetime)}</strong><br>
          Expected Return: <strong>${formatDateTime(req.returnDatetime)}</strong><br>
          <span style="color:#10b981; font-weight:600;">Secure QR Code will be immediately generated upon your approval.</span>
        </p>
      `;
    } else if (req.requestType === 'special') {
      DOM.approveModalBody.innerHTML = `
        <p>Are you sure you want to approve Special Outpass request <strong>${req.requestCode}</strong> for <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})?</p>
        <div style="margin:0.75rem 0; padding:0.75rem 0.9rem; background:rgba(139,92,246,0.06); border:1px solid rgba(139,92,246,0.2); border-radius:4px; font-size:0.84rem; display:flex; flex-direction:column; gap:0.35rem;">
          <div><strong>Workflow Routing:</strong> <span style="color:#a78bfa; font-weight:700;">4-TIER FINAL APPROVAL (TIER 4 WARDEN SANCTION)</span></div>
          <div><strong>Pre-authorizations:</strong> <span style="color:#10b981; font-weight:600;">✓ Parent Biometrics &nbsp;|&nbsp; ✓ Advisor &nbsp;|&nbsp; ✓ Principal</span></div>
          <div><strong>Event / Purpose:</strong> <span style="font-weight:600;">${escapeHtml(req.purpose)}</span></div>
          ${req.additionalRemarks ? `<div style="margin-top:0.25rem; padding-top:0.35rem; border-top:1px dashed rgba(139,92,246,0.25);"><strong>Justification:</strong> <em>${escapeHtml(req.additionalRemarks)}</em></div>` : ''}
        </div>
        <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:0.5rem;">
          Destination: <strong>${escapeHtml(req.destination)}</strong><br>
          Leaving: <strong>${formatDateTime(req.leavingDatetime)}</strong><br>
          Expected Return: <strong>${formatDateTime(req.returnDatetime)}</strong><br>
          <span style="color:#10b981; font-weight:600;">Warden approval provides the final seal and activates the QR Code.</span>
        </p>
      `;
    } else {
      DOM.approveModalBody.innerHTML = `
        <p>Are you sure you want to approve outpass request <strong>${req.requestCode}</strong> for <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})?</p>
        <div style="margin:0.75rem 0; padding:0.75rem 0.9rem; background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-radius:4px; font-size:0.84rem; display:flex; flex-direction:column; gap:0.35rem;">
          <div><strong>Parent Decision:</strong> <span style="color:#10b981; font-weight:700;">APPROVED</span></div>
          <div><strong>Parent Mobile:</strong> <span style="font-family:monospace; font-weight:600;">${escapeHtml(req.parentVerifiedMobile || req.parentPhone || 'N/A')}</span></div>
          <div><strong>Parent Biometric Auth:</strong> <span style="color:#10b981; font-weight:700;">128D Face Biometrics Confirmed ✓</span></div>
          <div><strong>Biometric Security:</strong> <span style="color:#10b981; font-weight:600;">Matched registered parent profile</span></div>
          <div style="margin-top:0.25rem; padding-top:0.35rem; border-top:1px dashed rgba(16,185,129,0.25);">
            <strong>Parent Message:</strong> <em style="color:var(--text-primary);">"${escapeHtml(req.parentMessage || 'Approved')}"</em>
          </div>
        </div>
        <p style="font-size:0.84rem; color:var(--text-secondary); margin-top:0.5rem;">
          Destination: <strong>${escapeHtml(req.destination)}</strong><br>
          Expected Return: <strong>${formatDateTime(req.returnDatetime)}</strong>
        </p>
      `;
    }
  }

  openModal('approveModal');

  if (req.parentApprovalLat && req.parentApprovalLng) {
    resolveHumanReadableLocation(req.parentApprovalLat, req.parentApprovalLng).then(placeName => {
      const placeEl = document.getElementById('approve-parent-place');
      if (placeEl) placeEl.textContent = placeName || 'Location name unavailable';
    }).catch(() => {
      const placeEl = document.getElementById('approve-parent-place');
      if (placeEl) placeEl.textContent = 'Location name unavailable';
    });
  }
}

function openRejectModal(requestId) {
  selectedRequestForAction = requestId;
  const req = pendingNormalList.find(r => r.id === requestId) || pendingDutyList.find(r => r.id === requestId);
  if (!req) return;

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
async function executeApprove(requestId) {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  if (DOM.btnConfirmApprove) DOM.btnConfirmApprove.disabled = true;

  try {
    const res = await fetch(`/api/outpass/${requestId}/approve`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // Trigger existing QR generation workflow right after approval
      try {
        await fetch(`/api/qr/generate/${requestId}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (qrErr) {
        console.warn('Auto QR generation notice:', qrErr);
      }

      closeModal('approveModal');
      showToast(`🎉 Request ${data.data?.requestCode || ''} approved and Security QR generated.`, 'success');

      // Animate card removal
      const card = document.getElementById(`req-card-${requestId}`);
      if (card) card.remove();

      // Refresh overview counters
      await refreshAllData();
    } else {
      showToast(data.message || 'Failed to approve outpass request.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (DOM.btnConfirmApprove) DOM.btnConfirmApprove.disabled = false;
  }
}

async function executeReject(requestId, rejectionReason) {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  if (DOM.btnConfirmReject) DOM.btnConfirmReject.disabled = true;

  try {
    const res = await fetch(`/api/outpass/${requestId}/reject`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rejection_reason: rejectionReason })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('rejectModal');
      showToast(`Request ${data.data?.requestCode || ''} rejected successfully.`, 'success');

      // Animate card removal
      const card = document.getElementById(`req-card-${requestId}`);
      if (card) card.remove();

      // Refresh overview counters
      await refreshAllData();
    } else {
      showToast(data.message || 'Failed to reject outpass request.', 'error');
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

  // Bind all navigation buttons directly
  const navBtns = document.querySelectorAll('.warden-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.dataset.tab || btn.getAttribute('data-tab');
      if (tabId) showWardenSection(tabId);
    });
  });

  // Real-time notification hook to auto-refresh active section
  window.addEventListener('sh:notification:new', async () => {
    await refreshAllData();
    if (activeTab === 'extension-requests') {
      await loadWardenPendingExtensions();
      await loadWardenExtensionHistory('all');
    } else if (activeTab === 'reports') {
      await loadWardenReports();
    }
  });

  // Support direct hash navigation and browser back/forward buttons
  window.addEventListener('hashchange', () => {
    const rawHash = window.location.hash.replace(/^#/, '');
    if (rawHash && rawHash !== activeTab) {
      showWardenSection(rawHash, false);
    }
  });

  // Initial tab activation on load - default strictly to Dashboard (overview)
  const initialHash = window.location.hash.replace(/^#/, '');
  showWardenSection(initialHash || 'overview', false);
}

/**
 * Centralized Single-Source-of-Truth Navigation Controller
 * Enforces strict single-page content isolation: hides all other sections completely,
 * activates only the requested section and its matching button, and prevents cross-section leakage.
 */
function showWardenSection(sectionId, pushHash = true) {
  if (!sectionId) return;

  // 1. Normalize tab identifier
  let cleanId = String(sectionId).replace(/^tab-/, '').trim().toLowerCase();
  if (cleanId === 'extensions') cleanId = 'extension-requests';
  if (cleanId === 'dashboard') cleanId = 'overview';

  // 2. Fresh query of all content sections and navigation buttons
  const allSections = document.querySelectorAll('.tab-section, .warden-section, [id^="tab-"]');
  const allNavBtns = document.querySelectorAll('.warden-nav-btn, [data-tab]');

  // 3. FIRST: Strictly HIDE every Warden content section and remove active state
  allSections.forEach(sec => {
    sec.classList.remove('active');
    sec.style.setProperty('display', 'none', 'important');
  });

  // 4. SECOND: Remove active state from every navigation button
  allNavBtns.forEach(btn => {
    btn.classList.remove('active');
  });

  // 5. THIRD: Show ONLY the requested section
  const targetSection = document.getElementById(`tab-${cleanId}`) || document.getElementById(cleanId);
  if (targetSection) {
    targetSection.classList.add('active');
    targetSection.style.setProperty('display', 'flex', 'important');
  } else {
    console.warn(`[Warden Navigation]: Target section "#tab-${cleanId}" not found in DOM.`);
    const overviewSec = document.getElementById('tab-overview');
    if (overviewSec) {
      overviewSec.classList.add('active');
      overviewSec.style.setProperty('display', 'flex', 'important');
      cleanId = 'overview';
    }
  }

  // 6. FOURTH: Add active state ONLY to the clicked button
  allNavBtns.forEach(btn => {
    const btnTab = (btn.dataset.tab || btn.getAttribute('data-tab') || '').trim().toLowerCase();
    if (btnTab === cleanId) {
      btn.classList.add('active');
    }
  });

  // 7. Update active state variable
  activeTab = cleanId;

  // 8. Dismiss mobile sidebar & backdrop
  const sidebar = document.querySelector('.warden-sidebar') || document.querySelector('.dash-sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');

  // 9. Synchronize browser history / URL hash
  if (pushHash && window.location.hash !== `#${cleanId}`) {
    history.pushState(null, '', `#${cleanId}`);
  }

  // 10. Trigger section-specific data loaders strictly for the active section
  if (cleanId === 'overview') {
    loadOverview();
  } else if (cleanId === 'normal-requests' || cleanId === 'emergency-requests' || cleanId === 'special-requests') {
    loadPendingNormal();
  } else if (cleanId === 'duty-requests') {
    loadPendingDuty();
  } else if (cleanId === 'active-passes') {
    loadActiveOutpasses();
  } else if (cleanId === 'parent-messages') {
    loadWardenParentMessages();
  } else if (cleanId === 'extension-requests') {
    loadWardenPendingExtensions();
    loadWardenExtensionHistory('all');
  } else if (cleanId === 'reports') {
    loadWardenReports();
  } else if (cleanId === 'registered-students') {
    loadWardenRegisteredStudents(1);
  }
}

// Global aliases for complete compatibility across inline onclick handlers
const switchTab = showWardenSection;
window.showWardenSection = showWardenSection;
window.switchTab = showWardenSection;

function showToast(message, type = 'success') {
  if (!DOM.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `warden-toast ${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;
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

/* ==========================================================
   7. AUTH & THEME MANAGEMENT
   ========================================================== */
function initLogout() {
  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', async () => {
      const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
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
  sessionStorage.removeItem('sh_token');
  sessionStorage.removeItem('sh_user');
  window.location.href = '/index.html';
}

function initTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('sh_theme', 'dark');
}

/* ==========================================================
   8. QR CODE GENERATION, PREVIEW & REVOCATION (WARDEN)
   ========================================================== */
let selectedQrIdForRevoke = null;

async function generateQrForApprovedPass(outpassId) {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  try {
    const res = await fetch(`/api/qr/generate/${outpassId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showToast('QR Generated Successfully', 'success');
      await loadActiveOutpasses();
      await loadOverview();

      // Show immediate QR Preview
      const d = data.data;
      if (d && d.qrImageData) {
        openQrPreviewModal(
          d.requestCode,
          d.student ? d.student.name : 'Student',
          d.student ? d.student.regNo : '',
          d.qrImageData,
          d.qrToken,
          d.validFrom,
          d.validUntil,
          'ACTIVE',
          d.qrId,
          outpassId
        );
      }
    } else {
      showToast(data.message || 'Unable to generate QR.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  }
}

function openQrPreviewModal(reqCode, studentName, rollNo, qrImageData, qrToken, validFrom, validUntil, qrStatus, qrId, outpassId) {
  const body = document.getElementById('qrPreviewModalBody');
  if (body) {
    body.innerHTML = `
      <div style="background:#ffffff; padding:0.75rem; border-radius:var(--radius-sm); display:inline-block; box-shadow:0 4px 14px rgba(0,0,0,0.25);">
        <img src="${qrImageData}" alt="Outpass QR Code" style="width:220px; height:220px; display:block;" />
      </div>
      <div style="margin-top:1.25rem; text-align:left; background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
          <h4 style="font-family:'Outfit'; margin:0; color:var(--text-primary); font-size:1.15rem;">${escapeHtml(reqCode)}</h4>
          <span class="status-badge ${qrStatus === 'ACTIVE' ? 'status-approved' : 'status-rejected'}">${formatStatusBadgeText(qrStatus || 'ACTIVE')}</span>
        </div>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin:0.25rem 0;">
          Student: <strong style="color:var(--text-primary);">${escapeHtml(studentName)}</strong> ${rollNo ? `(${escapeHtml(rollNo)})` : ''}
        </p>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin:0.25rem 0;">
          Valid From: <strong style="color:var(--text-primary);">${formatDateTime(validFrom)}</strong>
        </p>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin:0.25rem 0;">
          Valid Until: <strong style="color:var(--text-primary);">${formatDateTime(validUntil)}</strong>
        </p>
        <div style="font-family:monospace; font-size:0.72rem; color:var(--text-muted); word-break:break-all; background:var(--bg-card); padding:0.35rem 0.5rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); margin-top:0.6rem;">
          TOKEN: ${qrToken || 'qr_sec_active'}
        </div>
      </div>
      ${qrStatus === 'ACTIVE' && qrId ? `
        <div style="margin-top:1rem; text-align:center;">
          <button class="btn-reject" style="padding:0.45rem 1rem; font-size:0.82rem;" onclick="closeModal('qrPreviewModal'); openRevokeQrModal(${qrId}, '${reqCode}');">
            Revoke This QR Pass
          </button>
        </div>
      ` : ''}
    `;
  }
  openModal('qrPreviewModal');
}

function openRevokeQrModal(qrId, reqCode) {
  selectedQrIdForRevoke = qrId;
  const input = document.getElementById('revokeReasonInput');
  if (input) input.value = '';
  openModal('revokeQrModal');
}

document.addEventListener('DOMContentLoaded', () => {
  const btnRevoke = document.getElementById('btnConfirmRevokeQr');
  if (btnRevoke) {
    btnRevoke.addEventListener('click', async () => {
      if (!selectedQrIdForRevoke) return;
      const input = document.getElementById('revokeReasonInput');
      const reason = input ? input.value.trim() : '';
      if (!reason) {
        showToast('Please enter a revocation reason.', 'error');
        if (input) input.focus();
        return;
      }
      await executeRevokeQr(selectedQrIdForRevoke, reason);
    });
  }
});

async function executeRevokeQr(qrId, reason) {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  const btnRevoke = document.getElementById('btnConfirmRevokeQr');
  if (btnRevoke) btnRevoke.disabled = true;

  try {
    const res = await fetch(`/api/qr/revoke/${qrId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ revocation_reason: reason })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('revokeQrModal');
      showToast('QR Code revoked successfully. Gate checkpoints will reject this token.', 'success');
      await loadActiveOutpasses();
      await loadOverview();
    } else {
      showToast(data.message || 'Failed to revoke QR', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (btnRevoke) btnRevoke.disabled = false;
  }
}

/* ==========================================================
   10. WARDEN EMERGENCY TIME EXTENSION CONTROLLER
   ========================================================== */
let selectedExtIdForAction = null;
let wardenPendingExtensionsList = [];

async function loadWardenPendingExtensions() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  const tbody = document.getElementById('extensionPendingTableBody');
  const emptyState = document.getElementById('extensionPendingEmpty');
  if (!tbody) return;

  try {
    const res = await fetch('/api/extension/warden/pending', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      wardenPendingExtensionsList = data.pendingExtensions || [];
      const badge = document.getElementById('navBadgeExtension');
      if (badge) {
        badge.textContent = wardenPendingExtensionsList.length;
        badge.style.display = wardenPendingExtensionsList.length > 0 ? 'inline-block' : 'none';
      }

      if (wardenPendingExtensionsList.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      tbody.innerHTML = wardenPendingExtensionsList.map(ext => `
        <tr id="ext-row-${ext.extensionId}">
          <td>
            <div style="font-family:'Outfit'; font-weight:700; color:var(--text-primary);">${escapeHtml(ext.requestCode)}</div>
            <small style="color:var(--text-muted); font-size:0.75rem;">ID: EXT-#${ext.extensionId}</small>
          </td>
          <td>
            <div style="font-weight:700; color:var(--text-primary);">${escapeHtml(ext.studentName)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(ext.rollNumber)} • ${escapeHtml(ext.department)}</div>
          </td>
          <td>
            <span class="location-tag" style="background:var(--bg-input); padding:0.2rem 0.5rem; border-radius:var(--radius-sm); font-size:0.8rem;">
              ${escapeHtml(ext.hostelBlock)} - ${escapeHtml(ext.roomNumber)}
            </span>
          </td>
          <td>
            <div style="font-size:0.85rem; color:var(--text-secondary);">${formatDateTime(ext.currentReturnTime)}</div>
          </td>
          <td>
            <div style="font-weight:700; color:#f59e0b; font-size:0.9rem;">${formatDateTime(ext.requestedUntil)}</div>
            <small style="color:#10b981; font-weight:600;">+${ext.extensionMinutes ? Math.round(ext.extensionMinutes / 60 * 10) / 10 : 2} hrs</small>
          </td>
          <td style="max-width:220px;">
            <div style="font-size:0.82rem; color:var(--text-primary); line-height:1.4; word-break:break-word;">
              ${escapeHtml(ext.reason)}
            </div>
          </td>
          <td>
            <small style="color:var(--text-muted); font-size:0.78rem;">${formatDateTime(ext.requestedAt)}</small>
          </td>
          <td>
            <div style="display:flex; gap:0.4rem; align-items:center;">
              <button class="btn-approve" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="openApproveExtModal(${ext.extensionId}, '${escapeHtml(ext.requestCode)}', '${escapeHtml(ext.studentName)}', '${escapeHtml(ext.rollNumber)}', '${ext.currentReturnTime}', '${ext.requestedUntil}', '${escapeHtml(ext.reason)}')">
                Approve
              </button>
              <button class="btn-reject" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="openRejectExtModal(${ext.extensionId}, '${escapeHtml(ext.requestCode)}', '${escapeHtml(ext.studentName)}')">
                Reject
              </button>
            </div>
          </td>
        </tr>
      `).join('');

    }
  } catch (err) {
    showToast('Failed to load pending extensions: ' + err.message, 'error');
  }
}

async function loadWardenExtensionHistory(filter = 'all') {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  const tbody = document.getElementById('extensionHistoryTableBody');
  const emptyState = document.getElementById('extensionHistoryEmpty');
  if (!tbody) return;

  try {
    const res = await fetch(`/api/extension/warden/history?filter=${filter}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const history = data.history || [];

      if (history.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      tbody.innerHTML = history.map(item => `
        <tr>
          <td>
            <div style="font-family:'Outfit'; font-weight:700;">${escapeHtml(item.requestCode)}</div>
            <small style="color:var(--text-muted); font-size:0.72rem;">EXT-#${item.extensionId}</small>
          </td>
          <td>
            <div style="font-weight:600;">${escapeHtml(item.studentName)}</div>
            <small style="color:var(--text-secondary);">${escapeHtml(item.rollNumber)}</small>
          </td>
          <td>
            <span style="font-size:0.82rem; color:var(--text-secondary);">${formatDateTime(item.requestedUntil)}</span>
          </td>
          <td>
            <span style="font-size:0.82rem; font-weight:700; color:${item.approvedReturnTime ? '#10b981' : 'var(--text-muted)'};">
              ${item.approvedReturnTime ? formatDateTime(item.approvedReturnTime) : '-'}
            </span>
          </td>
          <td style="max-width:200px;">
            <div style="font-size:0.8rem; line-height:1.4;">${escapeHtml(item.reason)}</div>
            ${item.rejectionReason ? `<div style="font-size:0.75rem; color:#ef4444; margin-top:0.2rem;">Reason: ${escapeHtml(item.rejectionReason)}</div>` : ''}
          </td>
          <td>
            <span class="status-badge ${item.status === 'APPROVED' ? 'status-approved' : (item.status === 'PENDING' ? 'status-pending-warden' : 'status-rejected')}">
              ${formatStatusBadgeText(item.status)}
            </span>
          </td>
          <td>
            <small style="color:var(--text-muted); font-size:0.78rem;">${formatDateTime(item.reviewedAt || item.requestedAt)}</small>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast('Failed to load extension history: ' + err.message, 'error');
  }
}

window.filterWardenExtensions = function(filter) {
  const chips = ['extFilterAll', 'extFilterApproved', 'extFilterRejected'];
  chips.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  if (filter === 'all' && document.getElementById('extFilterAll')) document.getElementById('extFilterAll').classList.add('active');
  if (filter === 'approved' && document.getElementById('extFilterApproved')) document.getElementById('extFilterApproved').classList.add('active');
  if (filter === 'rejected' && document.getElementById('extFilterRejected')) document.getElementById('extFilterRejected').classList.add('active');

  loadWardenExtensionHistory(filter);
};

window.openApproveExtModal = function(extId, reqCode, studentName, rollNo, curReturn, reqReturn, reason) {
  selectedExtIdForAction = extId;
  const body = document.getElementById('approveExtModalBody');
  if (body) {
    body.innerHTML = `
      <p style="margin-bottom:1rem; font-size:0.95rem;">
        Authorize emergency time extension for <strong>${escapeHtml(studentName)}</strong> (${escapeHtml(rollNo)}) on pass <strong>${escapeHtml(reqCode)}</strong>?
      </p>

      <div style="background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:1rem; display:flex; flex-direction:column; gap:0.6rem; font-size:0.88rem;">
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary);">Current Return Deadline:</span>
          <strong>${formatDateTime(curReturn)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; color:#10b981;">
          <span>New Approved Return:</span>
          <strong>${formatDateTime(reqReturn)}</strong>
        </div>
        <div style="border-top:1px solid var(--border-color); padding-top:0.5rem; color:var(--text-secondary);">
          <strong style="color:var(--text-primary);">Extension Reason:</strong> ${escapeHtml(reason)}
        </div>
      </div>

      <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.85rem;">
        ⚡ <em>Note: Approving this will immediately extend the student's active QR validity until the new return time.</em>
      </p>
    `;
  }
  openModal('approveExtModal');
};

window.openRejectExtModal = function(extId, reqCode, studentName) {
  selectedExtIdForAction = extId;
  const input = document.getElementById('rejectExtReasonInput');
  if (input) input.value = '';
  openModal('rejectExtModal');
};

document.addEventListener('DOMContentLoaded', () => {
  const btnApproveExt = document.getElementById('btnConfirmApproveExt');
  if (btnApproveExt) {
    btnApproveExt.addEventListener('click', async () => {
      if (!selectedExtIdForAction) return;
      const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
      if (!token) return;

      btnApproveExt.disabled = true;
      try {
        const res = await fetch(`/api/extension/${selectedExtIdForAction}/approve`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json();

        if (res.ok && data.success) {
          closeModal('approveExtModal');
          showToast(`🎉 Extension approved successfully. QR validity extended to ${formatDateTime(data.data?.approvedReturnTime)}.`, 'success');
          
          const row = document.getElementById(`ext-row-${selectedExtIdForAction}`);
          if (row) row.remove();

          await loadWardenPendingExtensions();
          await loadWardenExtensionHistory('all');
          await loadOverview();
        } else {
          showToast(data.message || 'Failed to approve extension.', 'error');
        }
      } catch (err) {
        showToast('Network error: ' + err.message, 'error');
      } finally {
        btnApproveExt.disabled = false;
      }
    });
  }

  const btnRejectExt = document.getElementById('btnConfirmRejectExt');
  if (btnRejectExt) {
    btnRejectExt.addEventListener('click', async () => {
      if (!selectedExtIdForAction) return;
      const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
      if (!token) return;

      const input = document.getElementById('rejectExtReasonInput');
      const reason = input ? input.value.trim() : '';

      if (!reason) {
        showToast('Please specify a rejection reason.', 'error');
        if (input) input.focus();
        return;
      }

      btnRejectExt.disabled = true;
      try {
        const res = await fetch(`/api/extension/${selectedExtIdForAction}/reject`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ rejection_reason: reason })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          closeModal('rejectExtModal');
          showToast('Extension request declined.', 'success');

          const row = document.getElementById(`ext-row-${selectedExtIdForAction}`);
          if (row) row.remove();

          await loadWardenPendingExtensions();
          await loadWardenExtensionHistory('all');
          await loadOverview();
        } else {
          showToast(data.message || 'Failed to decline extension.', 'error');
        }
      } catch (err) {
        showToast('Network error: ' + err.message, 'error');
      } finally {
        btnRejectExt.disabled = false;
      }
    });
  }
});

/* ==========================================================
   11. WARDEN STUDENT SEARCH & PARENT MESSAGES CONTROLLER
   ========================================================== */

let wardenParentMessagesList = [];

async function handleWardenStudentSearch() {
  const input = document.getElementById('wardenStudentSearchInput');
  const container = document.getElementById('wardenStudentSearchResults');
  const btn = document.getElementById('btnWardenStudentSearch');
  if (!input || !container) return;

  const query = input.value.trim();
  if (!query) {
    showToast('Please enter a student name or roll number to search.', 'warning');
    input.focus();
    return;
  }

  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  if (btn) btn.disabled = true;
  container.innerHTML = `
    <div class="empty-state-box" style="padding: 2rem 1rem;">
      <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⏳</div>
      <h4 class="empty-title">Searching Student Records...</h4>
      <p class="empty-desc">Querying verified student, parent consent, and location records for "${escapeHtml(query)}"...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/outpass/warden/students/search?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      renderWardenSearchResults(data.students || [], query);
    } else {
      container.innerHTML = `
        <div class="empty-state-box" style="padding: 2rem 1rem;">
          <h4 class="empty-title" style="color: #ef4444;">Search Failed</h4>
          <p class="empty-desc">${escapeHtml(data.message || 'Error occurred while searching.')}</p>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state-box" style="padding: 2rem 1rem;">
        <h4 class="empty-title" style="color: #ef4444;">Network Error</h4>
        <p class="empty-desc">${escapeHtml(err.message)}</p>
      </div>
    `;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderWardenSearchResults(students, query) {
  const container = document.getElementById('wardenStudentSearchResults');
  if (!container) return;

  if (!students || students.length === 0) {
    container.innerHTML = `
      <div class="empty-state-box" style="padding: 2rem 1rem; border: 1px dashed var(--border-main); border-radius: var(--radius-sm);">
        <div class="empty-icon" style="background: rgba(239,68,68,0.1); color: #ef4444;">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        <h4 class="empty-title">No Students Found</h4>
        <p class="empty-desc">No student matching "<strong>${escapeHtml(query)}</strong>" was found. Please verify the student name or roll number.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-secondary);">
      Found <strong>${students.length}</strong> matching student record${students.length > 1 ? 's' : ''}:
    </div>
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      ${students.map(item => {
        const isApproved = item.decision === 'APPROVED';
        const isRejected = item.decision === 'REJECTED';
        const isVerified = item.locationVerification === 'VERIFIED';

        const decisionBadge = isApproved
          ? `<span class="status-badge status-approved" style="font-size:0.75rem; padding:3px 8px;">APPROVED</span>`
          : (isRejected
              ? `<span class="status-badge status-rejected" style="font-size:0.75rem; padding:3px 8px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">REJECTED</span>`
              : `<span class="status-badge status-pending" style="font-size:0.75rem; padding:3px 8px;">PENDING</span>`);

        const verificationBadge = isVerified
          ? `<span class="status-badge status-approved" style="font-size:0.75rem; padding:3px 8px;">VERIFIED</span>`
          : `<span class="status-badge status-rejected" style="font-size:0.75rem; padding:3px 8px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">UNVERIFIED</span>`;

        return `
          <div class="request-card" style="border: 1px solid var(--border-main); border-radius: var(--radius-sm); padding: 1.25rem; background: var(--bg-surface);">
            
            <!-- Student Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem; border-bottom: 1px solid var(--border-main); padding-bottom: 0.75rem;">
              <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                  <span class="request-code-badge">${escapeHtml(item.student.regNo)}</span>
                  <h3 style="font-family: 'Outfit'; font-size: 1.2rem; color: var(--text-primary); margin: 0;">
                    ${escapeHtml(item.student.name)}
                  </h3>
                </div>
                <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.25rem;">
                  ${escapeHtml(item.student.department)} • Year ${item.student.year || 'N/A'} • ${escapeHtml(item.student.hostelBlock || '')} - ${escapeHtml(item.student.roomNo || '')}
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                ${item.outpass ? `<span class="student-tag">${escapeHtml(item.outpass.requestCode)}</span>` : ''}
                ${decisionBadge}
                ${verificationBadge}
              </div>
            </div>

            <!-- Structured Result Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; font-size: 0.86rem; margin-bottom: 1rem;">
              
              <div class="detail-item">
                <span class="detail-label" style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Student</span>
                <span class="detail-value" style="font-weight:600; color:var(--text-primary);">
                  ${escapeHtml(item.student.name)}<br>
                  <span style="font-family:monospace; font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(item.student.regNo)}</span>
                </span>
              </div>

              <div class="detail-item">
                <span class="detail-label" style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Parent</span>
                <span class="detail-value" style="font-weight:600; color:var(--text-primary);">
                  ${escapeHtml(item.parent.name)}
                </span>
              </div>

              <div class="detail-item">
                <span class="detail-label" style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Parent Mobile</span>
                <span class="detail-value" style="font-family:monospace; font-weight:700; color:var(--text-primary);">
                  ${escapeHtml(item.parent.mobile)}
                </span>
              </div>

              <div class="detail-item">
                <span class="detail-label" style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Decision</span>
                <span class="detail-value" style="font-weight:700; color:${isApproved ? '#10b981' : (isRejected ? '#ef4444' : '#f59e0b')};">
                  ${item.decision}
                </span>
              </div>

              <div class="detail-item">
                <span class="detail-label" style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Biometric Verification</span>
                <span class="detail-value" style="font-weight:700; color:${isVerified ? '#10b981' : '#ef4444'};">
                  ${isVerified ? 'Face Verified ✓' : 'Unverified'}
                </span>
              </div>

              <div class="detail-item">
                <span class="detail-label" style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted);">Submitted At</span>
                <span class="detail-value" style="color:var(--text-secondary);">
                  ${item.submittedAt ? formatDateTime(item.submittedAt) : 'N/A'}
                </span>
              </div>

            </div>

            <!-- Parent Message / Reason Block -->
            <div style="background: ${isApproved ? 'rgba(16,185,129,0.06)' : (isRejected ? 'rgba(239,68,68,0.06)' : 'var(--bg-card)')}; border: 1px solid ${isApproved ? 'rgba(16,185,129,0.2)' : (isRejected ? 'rgba(239,68,68,0.2)' : 'var(--border-main)')}; border-radius: var(--radius-sm); padding: 0.85rem 1rem;">
              <div style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700; color: ${isApproved ? '#10b981' : (isRejected ? '#ef4444' : 'var(--text-muted)')}; margin-bottom: 0.35rem;">
                ${isRejected ? 'Parent Rejection Reason' : 'Parent Message'}
              </div>
              <div style="font-size: 0.9rem; color: var(--text-primary); font-style: italic;">
                "${escapeHtml(item.parentMessage || (isApproved ? 'Approved' : 'No message provided'))}"
              </div>
            </div>

          </div>
        `;
      }).join('')}
    </div>
  `;
}

function clearWardenStudentSearch() {
  const input = document.getElementById('wardenStudentSearchInput');
  const container = document.getElementById('wardenStudentSearchResults');
  if (input) input.value = '';
  if (container) {
    container.innerHTML = `
      <div class="empty-state-box" style="padding:2rem 1rem; border:1px dashed var(--border-main); border-radius:var(--radius-sm);">
        <div class="empty-icon" style="background:rgba(14,165,233,0.1); color:#0ea5e9;">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        <h4 class="empty-title">Search for a Student</h4>
        <p class="empty-desc">Enter a student's full or partial name, or roll number (e.g., 21CS042) to view parent consent, verified mobile identity, location verification state, and messages.</p>
      </div>
    `;
  }
}

async function loadWardenParentMessages() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  const tbody = document.getElementById('parentMessagesTableBody');
  const emptyState = document.getElementById('parentMessagesEmpty');
  if (!tbody) return;

  try {
    const res = await fetch('/api/outpass/warden/parent-messages', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      wardenParentMessagesList = data.messages || [];
      renderWardenParentMessages(wardenParentMessagesList);
    }
  } catch (err) {
    console.error('Error loading parent messages:', err);
  }
}

function renderWardenParentMessages(list) {
  const tbody = document.getElementById('parentMessagesTableBody');
  const emptyState = document.getElementById('parentMessagesEmpty');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  tbody.innerHTML = list.map(m => {
    const isApproved = m.parentResponse === 'approved';
    const isRejected = m.parentResponse === 'rejected';
    const isFaceVerified = (m.faceVerification === 'VERIFIED' || m.parentFaceVerified === 1 || m.locationVerification === 'VERIFIED' || isApproved);

    const decisionBadge = isApproved
      ? `<span class="status-badge status-approved" style="font-size:0.75rem; padding:2px 6px;">APPROVED</span>`
      : (isRejected
          ? `<span class="status-badge status-rejected" style="font-size:0.75rem; padding:2px 6px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">REJECTED</span>`
          : `<span class="status-badge" style="font-size:0.75rem; padding:2px 6px;">${escapeHtml(m.parentResponse || 'NONE')}</span>`);

    const verBadge = isFaceVerified
      ? `<span class="status-badge status-approved" style="font-size:0.75rem; padding:2px 6px;">FACE VERIFIED ✓</span>`
      : `<span class="status-badge status-rejected" style="font-size:0.75rem; padding:2px 6px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">UNVERIFIED</span>`;

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--text-primary);">${escapeHtml(m.studentName)}</div>
          <small style="color:var(--text-muted); font-size:0.75rem;">${escapeHtml(m.studentDept || '')}</small>
        </td>
        <td>
          <div style="font-family:monospace; font-weight:600; color:var(--text-primary);">${escapeHtml(m.studentRegNo)}</div>
          <small style="color:var(--text-secondary); font-size:0.75rem;">${escapeHtml(m.studentBlock || '')} - ${escapeHtml(m.studentRoom || '')}</small>
        </td>
        <td>
          <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(m.parentName || 'Parent')}</div>
          <div style="font-family:monospace; font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(m.parentMobile || 'N/A')}</div>
        </td>
        <td>
          <span class="request-code-badge">${escapeHtml(m.requestCode || 'N/A')}</span>
        </td>
        <td>
          ${decisionBadge}
        </td>
        <td style="max-width:240px;">
          <div style="font-size:0.83rem; color:var(--text-primary); font-style:italic; word-break:break-word;">
            "${escapeHtml(m.messageBody || '')}"
          </div>
        </td>
        <td>
          ${verBadge}
        </td>
        <td>
          <small style="color:${isFaceVerified ? '#10b981' : 'var(--text-muted)'}; font-weight:600;">
            ${isFaceVerified ? '128D Face Biometrics' : 'Pending'}
          </small>
        </td>
        <td>
          <small style="color:var(--text-muted); font-size:0.78rem;">${formatDateTime(m.respondedAt || m.createdAt)}</small>
        </td>
      </tr>
    `;
  }).join('');
}

// Real-time synchronization for parent approvals and messages
(function setupWardenSocket() {
  if (typeof io !== 'undefined') {
    const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
    if (token) {
      try {
        const socket = io({ query: { token } });
        socket.on('parent:decision', () => {
          refreshAllData();
          loadWardenParentMessages();
        });
        socket.on('notification:new', (notif) => {
          if (notif && (notif.type === 'PARENT_APPROVED' || notif.type === 'PARENT_REJECTED')) {
            refreshAllData();
            loadWardenParentMessages();
          }
        });
      } catch (e) {
        console.warn('[Warden Socket Error]:', e);
      }
    }
  }
})();

/* ==========================================================
   10. WARDEN REPORTS & ANALYTICS (REAL MYSQL DATA)
   ========================================================== */
let currentReportData = null;
let currentReportFilter = 'today';

function setReportDateFilter(filterType) {
  currentReportFilter = filterType;
  
  const buttons = document.querySelectorAll('.report-date-filter-btn');
  buttons.forEach(btn => {
    if (btn.id === `btnFilter${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const customBox = document.getElementById('customDateRangeBox');
  if (filterType === 'custom') {
    if (customBox) customBox.style.display = 'flex';
    const startInput = document.getElementById('repStartDate');
    const endInput = document.getElementById('repEndDate');
    const todayStr = new Date().toISOString().split('T')[0];
    if (startInput && !startInput.value) startInput.value = todayStr;
    if (endInput && !endInput.value) endInput.value = todayStr;
  } else {
    if (customBox) customBox.style.display = 'none';
    loadWardenReports(filterType);
  }
}

function applyCustomDateFilter() {
  const startInput = document.getElementById('repStartDate');
  const endInput = document.getElementById('repEndDate');
  const startDate = startInput?.value;
  const endDate = endInput?.value;

  if (!startDate || !endDate) {
    showToast('Please select both Start Date and End Date for custom range.', 'error');
    return;
  }

  if (startDate > endDate) {
    showToast('Start Date cannot be later than End Date.', 'error');
    return;
  }

  loadWardenReports('custom', startDate, endDate);
}

async function loadWardenReports(filter = currentReportFilter, startDate = null, endDate = null) {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  try {
    let url = `/api/outpass/warden/reports?filter=${encodeURIComponent(filter)}`;
    if (filter === 'custom' && startDate && endDate) {
      url += `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    }

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || 'Failed to fetch report data.', 'error');
      return;
    }

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Report retrieval failed.', 'error');
      return;
    }

    currentReportData = data;

    // 1. Update Date Label with clean readable format (e.g. "Today — 07 Sep 2026")
    const dateLabel = document.getElementById('reportDateRangeLabel');
    if (dateLabel) {
      const formatNiceDate = (dStr) => {
        if (!dStr) return '';
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return dStr;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
      };

      if (filter === 'today') {
        dateLabel.textContent = `Today — ${formatNiceDate(data.dateRange?.startDate)}`;
      } else if (filter === 'yesterday') {
        dateLabel.textContent = `Yesterday — ${formatNiceDate(data.dateRange?.startDate)}`;
      } else {
        dateLabel.textContent = `Custom (${formatNiceDate(data.dateRange?.startDate)} to ${formatNiceDate(data.dateRange?.endDate)})`;
      }
    }

    // 2. Populate Summary Metrics
    const s = data.summary || {};
    const setElemText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = (val !== undefined && val !== null) ? val : '0';
    };

    setElemText('repTotalOutpasses', s.totalOutpasses);
    setElemText('repPendingRequests', s.pendingRequests);
    setElemText('repApprovedRequests', s.approvedRequests);
    setElemText('repRejectedRequests', s.rejectedRequests);
    setElemText('repCurrentlyOutside', s.currentlyOutside);
    setElemText('repReturnedStudents', s.returnedStudents);
    setElemText('repLateReturns', s.lateReturns);
    setElemText('repEmergencyExtensions', s.emergencyExtensions);

    // Section badges
    const outsideBadge = document.getElementById('currentlyOutsideBadge');
    if (outsideBadge) outsideBadge.textContent = `${s.currentlyOutside || 0} Students Outside`;

    const lateBadge = document.getElementById('lateReturnBadge');
    if (lateBadge) lateBadge.textContent = `${s.lateReturns || 0} Overdue`;

    const extBadge = document.getElementById('extensionsBadge');
    if (extBadge) extBadge.textContent = `${(data.extensionReport || []).length} Requests`;

    const deptBadge = document.getElementById('deptSummaryBadge');
    if (deptBadge) deptBadge.textContent = `${(data.departments || []).length} Depts`;

    const countBadge = document.getElementById('outpassRecordsCountBadge');
    if (countBadge) countBadge.textContent = `${data.outpassStatusReport?.length || 0} Records`;

    // 3. Render Action Required Section (Admin Alert Panel)
    renderActionRequired(s, data);

    // 4. Render Currently Outside Table (High Priority)
    renderCurrentlyOutsideTable(data.currentlyOutsideReport || []);

    // 5. Render Late Returns Warning Table
    renderLateReturnTable(data.lateReturnReport || []);

    // 6. Render Emergency Extensions Table
    renderEmergencyExtensionsTable(data.extensionReport || []);

    // 7. Render Department-wise Summary Table (Compact 5-column)
    renderDepartmentSummaryTable(data.departments || []);

    // 8. Render Outpass Status Report Table & Status Distribution Progress Bars
    renderOutpassStatusTable(data.outpassStatusReport || []);

  } catch (err) {
    console.error('Error loading warden reports:', err);
    showToast('Failed to load reports: ' + err.message, 'error');
  }
}

function renderActionRequired(s, data) {
  const container = document.getElementById('repActionItemsContainer');
  if (!container) return;

  const pendingCount = Number(s.pendingRequests) || 0;
  const lateCount = Number(s.lateReturns) || 0;
  const extCount = Number(s.emergencyExtensions) || 0;
  const totalActions = pendingCount + lateCount + extCount;

  const badge = document.getElementById('actionReqCountBadge');
  if (badge) {
    if (totalActions > 0) {
      badge.textContent = `${totalActions} Action${totalActions > 1 ? 's' : ''} Needed`;
      badge.className = 'section-badge-counter badge-count-overdue';
    } else {
      badge.textContent = 'All Clear';
      badge.className = 'section-badge-counter badge-count-outside';
    }
  }

  if (totalActions === 0) {
    container.innerHTML = `
      <div class="all-clear-box">
        <div class="all-clear-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div>
          <div class="all-clear-text-primary">✓ No action required</div>
          <div class="all-clear-text-secondary">All outpasses, returns, and extensions are currently up to date.</div>
        </div>
      </div>
    `;
    return;
  }

  let html = '';

  if (pendingCount > 0) {
    html += `
      <div class="action-item-card warn">
        <div class="action-item-top">
          <svg width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span class="action-item-title">PENDING OUTPASS APPROVALS</span>
        </div>
        <div class="action-item-middle">
          <span class="action-item-count">${pendingCount}</span>
          <span class="action-item-desc">Requests waiting for Warden review</span>
        </div>
        <button type="button" class="btn-action-req" onclick="switchTab('normal-requests')">
          <span>Review Requests</span>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
      </div>
    `;
  }

  if (lateCount > 0) {
    html += `
      <div class="action-item-card danger">
        <div class="action-item-top">
          <svg width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <span class="action-item-title">OVERDUE / LATE RETURNS</span>
        </div>
        <div class="action-item-middle">
          <span class="action-item-count">${lateCount}</span>
          <span class="action-item-desc">Students who have crossed their return deadline</span>
        </div>
        <button type="button" class="btn-action-req" onclick="document.getElementById('cardLateReturns')?.scrollIntoView({behavior:'smooth'})">
          <span>View Overdue</span>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
        </button>
      </div>
    `;
  }

  if (extCount > 0) {
    html += `
      <div class="action-item-card alert">
        <div class="action-item-top">
          <svg width="16" height="16" fill="none" stroke="#06b6d4" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline><path d="M12 2v2"></path></svg>
          <span class="action-item-title">EMERGENCY EXTENSIONS</span>
        </div>
        <div class="action-item-middle">
          <span class="action-item-count">${extCount}</span>
          <span class="action-item-desc">Extension requests awaiting Warden review</span>
        </div>
        <button type="button" class="btn-action-req" onclick="switchTab('extensions')">
          <span>Review Extensions</span>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

function formatOutpassTypeLabel(type) {
  if (!type) return 'Normal Outpass';
  const t = String(type).toLowerCase();
  if (t.includes('one_day') || t.includes('duty')) return 'One-Day Duty';
  if (t.includes('emergency')) return 'Emergency Outpass';
  return 'Normal Outpass';
}

function formatLateDurationLabel(mins) {
  const m = Number(mins) || 0;
  if (m >= 60) {
    const hrs = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${hrs}h ${rem}m late` : `${hrs}h late`;
  }
  return `${m} min late`;
}

function renderCurrentlyOutsideTable(list) {
  const tbody = document.getElementById('repCurrentlyOutsideTableBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell"><div class="empty-state-content"><svg width="28" height="28" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>✓ All students have returned.</span></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.studentName)}</strong></td>
      <td><span style="font-family:monospace; font-weight:600;">${escapeHtml(item.studentRegNo)}</span></td>
      <td>${escapeHtml(item.studentDept)}</td>
      <td><span class="badge-outpass-type">${formatOutpassTypeLabel(item.outpassType)}</span></td>
      <td><span style="font-weight:600; color:var(--text-main);">${escapeHtml(item.destination || 'Not Specified')}</span></td>
      <td><span style="color:#f59e0b; font-weight:700;">${formatDateTime(item.expectedReturnTime)}</span></td>
      <td>
        <span class="badge-outside">
          <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg>
          Outside
        </span>
      </td>
    </tr>
  `).join('');
}

function renderLateReturnTable(list) {
  const tbody = document.getElementById('repLateReturnTableBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state-cell"><div class="empty-state-content"><svg width="28" height="28" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>✓ No late returns for this period.</span></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.studentName)}</strong></td>
      <td><span style="font-family:monospace; font-weight:600;">${escapeHtml(item.studentRegNo)}</span></td>
      <td>${formatDateTime(item.originalReturnTime)}</td>
      <td><span style="color:#ef4444; font-weight:700;">${formatDateTime(item.actualReturnTime)}</span></td>
      <td>
        <span class="badge-overdue">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ${formatLateDurationLabel(item.lateDurationMinutes)}
        </span>
      </td>
      <td>
        <span class="badge-status-late">Late</span>
      </td>
    </tr>
  `).join('');
}

function renderEmergencyExtensionsTable(list) {
  const tbody = document.getElementById('repEmergencyExtensionsTableBody') || document.getElementById('repExtensionsTableBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell"><div class="empty-state-content"><svg width="28" height="28" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>✓ No emergency extension requests for this period.</span></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => {
    const statusLower = String(item.status || 'pending').toLowerCase();
    const statusClass = statusLower === 'approved' ? 'status-approved' : (statusLower === 'rejected' ? 'status-rejected' : 'status-pending-warden');

    return `
      <tr>
        <td>
          <strong>${escapeHtml(item.studentName)}</strong><br>
          <small style="color:#94a3b8; font-family:monospace;">${escapeHtml(item.studentRegNo)}</small>
        </td>
        <td>${formatDateTime(item.requestTime)}</td>
        <td>${formatDateTime(item.previousReturnTime)}</td>
        <td>
          <span style="color:#38bdf8; font-weight:700;">+${item.extensionMinutes || 0} min</span><br>
          <small style="color:#94a3b8;">${formatDateTime(item.extendedReturnTime)}</small>
        </td>
        <td><span style="max-width:180px; display:inline-block; word-break:break-word; font-size:0.8rem;">${escapeHtml(item.reason || '-')}</span></td>
        <td><span class="status-badge ${statusClass}" style="font-size:0.72rem;">${escapeHtml(item.status || 'PENDING')}</span></td>
        <td>
          <button type="button" class="btn-action-req" style="padding:0.3rem 0.75rem; font-size:0.75rem;" onclick="switchTab('extensions')">
            Review
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderDepartmentSummaryTable(departments) {
  const tbody = document.getElementById('repDeptSummaryTableBody');
  if (!tbody) return;

  if (!departments || departments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state-cell"><div class="empty-state-content"><span>✓ No department outpasses recorded for this period.</span></div></td></tr>`;
    return;
  }

  tbody.innerHTML = departments.map(d => `
    <tr>
      <td><strong>${escapeHtml(d.department)}</strong></td>
      <td style="text-align:center; font-weight:700;">${d.totalOutpasses}</td>
      <td style="text-align:center; color:#10b981; font-weight:700;">${d.approved}</td>
      <td style="text-align:center; color:#f59e0b; font-weight:700;">${d.pending}</td>
      <td style="text-align:center; color:#06b6d4; font-weight:700;">${d.currentlyOutside}</td>
    </tr>
  `).join('');
}

function renderOutpassStatusTable(list) {
  const tbody = document.getElementById('repOutpassStatusTableBody');
  if (!tbody) return;

  // 1. Calculate Status Breakdown & Progress Bars
  const total = (list || []).length;
  let pendingParent = 0;
  let pendingWarden = 0;
  let approved = 0;
  let rejected = 0;
  let completed = 0;

  (list || []).forEach(item => {
    const st = String(item.status || '').toUpperCase();
    if (st.includes('PARENT')) pendingParent++;
    else if (st.includes('WARDEN') || st === 'PENDING') pendingWarden++;
    else if (st === 'APPROVED') approved++;
    else if (st === 'REJECTED') rejected++;
    else if (st === 'COMPLETED' || (item.returnStatus && item.returnStatus.includes('Returned'))) completed++;
    else approved++;
  });

  const calcPct = (cnt) => total > 0 ? Math.round((cnt / total) * 100) : 0;

  const setElemText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setElemText('statPendingParentCount', pendingParent);
  setElemText('statPendingWardenCount', pendingWarden);
  setElemText('repApprovedRequests', approved);
  setElemText('repRejectedRequests', rejected);
  setElemText('statCompletedCount', completed);

  const setWidth = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.style.width = `${pct}%`;
  };
  setWidth('fillPendingParent', calcPct(pendingParent));
  setWidth('fillPendingWarden', calcPct(pendingWarden));
  setWidth('fillApproved', calcPct(approved));
  setWidth('fillRejected', calcPct(rejected));
  setWidth('fillCompleted', calcPct(completed));

  // 2. Render Operational Table Rows
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell"><div class="empty-state-content"><span>✓ No outpass requests found for the selected period.</span></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => {
    let gateSummary = 'Not Exited';
    if (item.returnStatus && item.returnStatus !== 'N/A') {
      gateSummary = item.returnStatus;
    } else if (item.exitStatus && item.exitStatus !== 'Not Exited') {
      gateSummary = item.exitStatus;
    }

    return `
      <tr>
        <td><strong>${escapeHtml(item.studentName)}</strong></td>
        <td><span style="font-family:monospace; font-weight:600;">${escapeHtml(item.studentRegNo)}</span></td>
        <td>${escapeHtml(item.studentDept)}</td>
        <td><span class="badge-outpass-type">${formatOutpassTypeLabel(item.outpassType)}</span></td>
        <td><small style="color:#94a3b8;">${formatDateTime(item.fromDatetime)} → ${formatDateTime(item.toDatetime)}</small></td>
        <td><span class="status-badge status-${String(item.status || '').toLowerCase().replace(/_/g, '-')}" style="font-size:0.72rem;">${formatStatusBadgeText(item.status)}</span></td>
        <td><span style="font-size:0.78rem; font-weight:600; color:#cbd5e1;">${escapeHtml(gateSummary)}</span></td>
      </tr>
    `;
  }).join('');
}

function exportWardenReportsCsv() {
  if (!currentReportData) {
    showToast('Please wait for report data to load before exporting.', 'warning');
    return;
  }

  const escapeCsv = (str) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines = [];
  lines.push(`SMART HOSTEL OUTPASS MANAGEMENT - WARDEN REPORT`);
  lines.push(`Report Filter,${escapeCsv(currentReportData.filter)}`);
  lines.push(`Date Range,${escapeCsv(currentReportData.dateRange?.startDate)} to ${escapeCsv(currentReportData.dateRange?.endDate)}`);
  lines.push(`Generated At,${escapeCsv(new Date().toLocaleString())}`);
  lines.push('');

  // Summary Cards
  lines.push('--- SUMMARY STATISTICS ---');
  const s = currentReportData.summary || {};
  lines.push(`Metric,Count`);
  lines.push(`Total Outpasses,${s.totalOutpasses || 0}`);
  lines.push(`Pending Requests,${s.pendingRequests || 0}`);
  lines.push(`Approved Requests,${s.approvedRequests || 0}`);
  lines.push(`Rejected Requests,${s.rejectedRequests || 0}`);
  lines.push(`Currently Outside,${s.currentlyOutside || 0}`);
  lines.push(`Returned Students,${s.returnedStudents || 0}`);
  lines.push(`Late Returns,${s.lateReturns || 0}`);
  lines.push(`Emergency Extensions,${s.emergencyExtensions || 0}`);
  lines.push('');

  // Department Summary
  lines.push('--- DEPARTMENT-WISE SUMMARY ---');
  lines.push('Department,Total Outpasses,Approved,Rejected,Returned,Currently Outside');
  (currentReportData.departments || []).forEach(d => {
    lines.push([
      escapeCsv(d.department),
      d.totalOutpasses,
      d.approved,
      d.rejected,
      d.returned,
      d.currentlyOutside
    ].join(','));
  });
  lines.push('');

  // Currently Outside
  lines.push('--- CURRENTLY OUTSIDE STUDENTS ---');
  lines.push('Student Name,Register Number,Department,Destination,Outpass Type,Exit Time,Expected Return Time,Extension Status');
  (currentReportData.currentlyOutsideReport || []).forEach(o => {
    lines.push([
      escapeCsv(o.studentName),
      escapeCsv(o.studentRegNo),
      escapeCsv(o.studentDept),
      escapeCsv(o.destination || 'Not Specified'),
      escapeCsv(o.outpassType),
      escapeCsv(o.exitTime),
      escapeCsv(o.expectedReturnTime),
      escapeCsv(o.extensionStatus)
    ].join(','));
  });
  lines.push('');

  // Late Returns
  lines.push('--- LATE RETURN REPORT ---');
  lines.push('Student Name,Register Number,Department,Outpass Request Code,Original Return Time,Actual Return Time,Late Duration (Minutes),Extension Status');
  (currentReportData.lateReturnReport || []).forEach(l => {
    lines.push([
      escapeCsv(l.studentName),
      escapeCsv(l.studentRegNo),
      escapeCsv(l.studentDept),
      escapeCsv(l.requestCode),
      escapeCsv(l.originalReturnTime),
      escapeCsv(l.actualReturnTime),
      l.lateDurationMinutes,
      escapeCsv(l.extensionStatus)
    ].join(','));
  });
  lines.push('');

  // Emergency Extensions
  lines.push('--- EMERGENCY EXTENSIONS REPORT ---');
  lines.push('Student Name,Register Number,Department,Outpass Request Code,Request Time,Previous Return Time,Requested Return Time,Extension Minutes,Reason,Status');
  (currentReportData.extensionReport || []).forEach(ex => {
    lines.push([
      escapeCsv(ex.studentName),
      escapeCsv(ex.studentRegNo),
      escapeCsv(ex.studentDept),
      escapeCsv(ex.requestCode),
      escapeCsv(ex.requestTime),
      escapeCsv(ex.previousReturnTime),
      escapeCsv(ex.extendedReturnTime),
      ex.extensionMinutes,
      escapeCsv(ex.reason),
      escapeCsv(ex.status)
    ].join(','));
  });
  lines.push('');

  // Outpass Status Report
  lines.push('--- OUTPASS STATUS REPORT ---');
  lines.push('Student Name,Register Number,Department,Outpass Type,From Schedule,To Schedule,Status,Parent Decision,Warden Decision,Exit Status,Return Status');
  (currentReportData.outpassStatusReport || []).forEach(r => {
    lines.push([
      escapeCsv(r.studentName),
      escapeCsv(r.studentRegNo),
      escapeCsv(r.studentDept),
      escapeCsv(r.outpassType),
      escapeCsv(r.fromDatetime),
      escapeCsv(r.toDatetime),
      escapeCsv(r.status),
      escapeCsv(r.parentDecision),
      escapeCsv(r.wardenDecision),
      escapeCsv(r.exitStatus),
      escapeCsv(r.returnStatus)
    ].join(','));
  });

  const csvContent = lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = (currentReportData.dateRange?.startDate || 'report').replace(/-/g, '');
  a.download = `warden_hostel_report_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report exported to CSV successfully.', 'success');
}

function printWardenReport() {
  window.print();
}

window.setReportDateFilter = setReportDateFilter;
window.applyCustomDateFilter = applyCustomDateFilter;
window.loadWardenReports = loadWardenReports;
window.exportWardenReportsCsv = exportWardenReportsCsv;
window.printWardenReport = printWardenReport;
window.renderEmergencyExtensionsTable = renderEmergencyExtensionsTable;

/* ==========================================================
   7. WARDEN REGISTERED STUDENTS & YEAR CENSUS MODULE
   ========================================================== */
let registeredStudentsState = {
  students: [],
  stats: null,
  currentYear: 'all',
  currentDept: 'all',
  currentBlock: 'all',
  searchQuery: '',
  page: 1,
  limit: 15,
  total: 0,
  totalPages: 1
};

async function loadWardenRegisteredStudents(targetPage = 1) {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  registeredStudentsState.page = targetPage;

  // 1. Fetch Census Stats if not already fetched
  try {
    const statsRes = await fetch('/api/outpass/warden/registered-students/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      if (statsData.success && statsData.stats) {
        registeredStudentsState.stats = statsData.stats;
        renderCensusStats(statsData.stats);
        populateCensusFilterOptions(statsData.stats);
      }
    }
  } catch (err) {
    console.error('Error fetching census stats:', err);
  }

  // 2. Fetch Filtered Students List
  const params = new URLSearchParams();
  if (registeredStudentsState.currentYear && registeredStudentsState.currentYear !== 'all') {
    params.set('year', registeredStudentsState.currentYear);
  }
  if (registeredStudentsState.currentDept && registeredStudentsState.currentDept !== 'all') {
    params.set('department', registeredStudentsState.currentDept);
  }
  if (registeredStudentsState.currentBlock && registeredStudentsState.currentBlock !== 'all') {
    params.set('block', registeredStudentsState.currentBlock);
  }
  if (registeredStudentsState.searchQuery && registeredStudentsState.searchQuery.trim()) {
    params.set('search', registeredStudentsState.searchQuery.trim());
  }
  params.set('page', registeredStudentsState.page);
  params.set('limit', registeredStudentsState.limit);

  const tableBody = document.getElementById('censusStudentsTableBody');
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state-cell">
          <div class="empty-state-content">
            <div class="loading-spinner" style="width:24px; height:24px; border:2px solid rgba(59,130,246,0.3); border-top-color:#3b82f6; border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 0.5rem;"></div>
            <span>Loading registered hostel students...</span>
          </div>
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch(`/api/outpass/warden/registered-students?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      registeredStudentsState.students = data.students || [];
      registeredStudentsState.total = data.pagination?.total || 0;
      registeredStudentsState.totalPages = data.pagination?.totalPages || 1;

      renderRegisteredStudentsTable(registeredStudentsState.students);
      renderCensusPagination(data.pagination);
    } else {
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="empty-state-cell">
              <div class="empty-state-content">
                <span style="color:#ef4444;">${escapeHtml(data.message || 'Failed to load registered students')}</span>
              </div>
            </td>
          </tr>
        `;
      }
    }
  } catch (err) {
    console.error('Error fetching registered students:', err);
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state-cell">
            <div class="empty-state-content">
              <span style="color:#ef4444;">Network error while loading student directory.</span>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

function renderCensusStats(stats) {
  const total = stats.totalStudents || 0;
  const y1 = stats.yearCounts?.year1 || 0;
  const y2 = stats.yearCounts?.year2 || 0;
  const y3 = stats.yearCounts?.year3 || 0;
  const y4 = stats.yearCounts?.year4 || 0;

  const totalEl = document.getElementById('censusTotalStudents');
  const y1El = document.getElementById('censusYear1Count');
  const y1Pct = document.getElementById('censusYear1Pct');
  const y2El = document.getElementById('censusYear2Count');
  const y2Pct = document.getElementById('censusYear2Pct');
  const y3El = document.getElementById('censusYear3Count');
  const y3Pct = document.getElementById('censusYear3Pct');
  const y4El = document.getElementById('censusYear4Count');
  const y4Pct = document.getElementById('censusYear4Pct');

  if (totalEl) totalEl.textContent = total;
  if (y1El) y1El.textContent = y1;
  if (y1Pct) y1Pct.textContent = total > 0 ? `${Math.round((y1 / total) * 100)}% of hostel` : '0%';
  if (y2El) y2El.textContent = y2;
  if (y2Pct) y2Pct.textContent = total > 0 ? `${Math.round((y2 / total) * 100)}% of hostel` : '0%';
  if (y3El) y3El.textContent = y3;
  if (y3Pct) y3Pct.textContent = total > 0 ? `${Math.round((y3 / total) * 100)}% of hostel` : '0%';
  if (y4El) y4El.textContent = y4;
  if (y4Pct) y4Pct.textContent = total > 0 ? `${Math.round((y4 / total) * 100)}% of hostel` : '0%';

  // Update nav badge and overview stats as well
  const navBadge = document.getElementById('navBadgeRegisteredStudents');
  if (navBadge) {
    navBadge.textContent = total;
    navBadge.style.display = total > 0 ? 'inline-block' : 'none';
  }
  const ovTotal = document.getElementById('statRegisteredTotal');
  if (ovTotal) ovTotal.textContent = total;

  // Department Year-wise Matrix Grid
  const matrixGrid = document.getElementById('censusDeptMatrixGrid');
  if (matrixGrid && stats.byDept) {
    const depts = Object.keys(stats.byDept);
    if (depts.length === 0) {
      matrixGrid.innerHTML = '<div style="color:var(--text-muted); padding:1rem;">No departmental data available.</div>';
    } else {
      matrixGrid.innerHTML = depts.map(deptName => {
        const d = stats.byDept[deptName];
        return `
          <div style="background:var(--bg-surface); border:1px solid var(--border-main); border-radius:10px; padding:0.9rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
              <span style="font-weight:700; font-size:0.85rem; color:var(--text-primary);">${escapeHtml(deptName)}</span>
              <span style="background:rgba(59,130,246,0.15); color:#60a5fa; font-weight:700; font-size:0.75rem; padding:2px 8px; border-radius:12px;">${d.total} Students</span>
            </div>
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:0.4rem; font-size:0.75rem; text-align:center;">
              <div style="background:rgba(16,185,129,0.08); padding:0.4rem 0.2rem; border-radius:6px; border:1px solid rgba(16,185,129,0.2);">
                <div style="color:#34d399; font-weight:700;">${d.year1 || 0}</div>
                <div style="color:var(--text-muted); font-size:0.68rem;">1st Yr</div>
              </div>
              <div style="background:rgba(59,130,246,0.08); padding:0.4rem 0.2rem; border-radius:6px; border:1px solid rgba(59,130,246,0.2);">
                <div style="color:#60a5fa; font-weight:700;">${d.year2 || 0}</div>
                <div style="color:var(--text-muted); font-size:0.68rem;">2nd Yr</div>
              </div>
              <div style="background:rgba(139,92,246,0.08); padding:0.4rem 0.2rem; border-radius:6px; border:1px solid rgba(139,92,246,0.2);">
                <div style="color:#a78bfa; font-weight:700;">${d.year3 || 0}</div>
                <div style="color:var(--text-muted); font-size:0.68rem;">3rd Yr</div>
              </div>
              <div style="background:rgba(245,158,11,0.08); padding:0.4rem 0.2rem; border-radius:6px; border:1px solid rgba(245,158,11,0.2);">
                <div style="color:#fbbf24; font-weight:700;">${d.year4 || 0}</div>
                <div style="color:var(--text-muted); font-size:0.68rem;">4th Yr</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

let isCensusDropdownsPopulated = false;
function populateCensusFilterOptions(stats) {
  if (isCensusDropdownsPopulated) return;

  const deptSelect = document.getElementById('regStudentDeptFilter');
  if (deptSelect && stats.departments) {
    const currentVal = deptSelect.value;
    deptSelect.innerHTML = '<option value="all">All Departments</option>' +
      stats.departments.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    deptSelect.value = currentVal;
  }

  const blockSelect = document.getElementById('regStudentBlockFilter');
  if (blockSelect && stats.blocks) {
    const currentVal = blockSelect.value;
    blockSelect.innerHTML = '<option value="all">All Hostel Blocks</option>' +
      stats.blocks.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    blockSelect.value = currentVal;
  }

  isCensusDropdownsPopulated = true;
}

function renderRegisteredStudentsTable(students) {
  const tableBody = document.getElementById('censusStudentsTableBody');
  const countText = document.getElementById('censusResultsCountText');
  if (!tableBody) return;

  if (countText) {
    const total = registeredStudentsState.total;
    const start = total === 0 ? 0 : (registeredStudentsState.page - 1) * registeredStudentsState.limit + 1;
    const end = Math.min(registeredStudentsState.page * registeredStudentsState.limit, total);
    countText.textContent = `Showing ${start} - ${end} of ${total} registered students`;
  }

  if (!students || students.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state-cell">
          <div class="empty-state-content">
            <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="1.5" fill="none" style="margin-bottom:0.5rem; opacity:0.6;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>No students found matching the selected census filters.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = students.map(s => {
    const yr = Number(s.yearOfStudy) || 1;
    const yrClass = `year-pill-${yr}`;
    const yrLabel = s.yearName || `Year ${yr}`;
    const initial = (s.name || 'S').charAt(0).toUpperCase();

    const isOutside = Boolean(s.isCurrentlyOutside);
    const statusPill = isOutside
      ? `<span class="status-badge" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3); font-size:0.75rem; padding:3px 8px; border-radius:12px; font-weight:700;">● Outside Hostel</span>`
      : `<span class="status-badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); font-size:0.75rem; padding:3px 8px; border-radius:12px; font-weight:700;">● Inside Hostel</span>`;

    return `
      <tr>
        <td>
          <div class="student-row-info">
            <div class="student-avatar-initial">${initial}</div>
            <div>
              <div class="student-name-text">${escapeHtml(s.name)}</div>
              <div class="student-reg-text">${escapeHtml(s.regNo)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="year-pill ${yrClass}">${yrLabel}</span>
        </td>
        <td>
          <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">${escapeHtml(s.department || 'General')}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${s.section ? `Sec ${escapeHtml(s.section)} • ` : ''}${escapeHtml(s.degreeCourse || 'B.E / B.Tech')}</div>
        </td>
        <td>
          <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">${escapeHtml(s.roomNo || 'N/A')}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(s.hostelBlock || 'Hostel Block')}</div>
        </td>
        <td>
          <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">${escapeHtml(s.parentName || 'Parent')}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-family:monospace;">${escapeHtml(s.parentPhone || 'N/A')}</div>
        </td>
        <td>
          ${statusPill}
          <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">Passes: ${s.totalOutpasses || 0}</div>
        </td>
        <td>
          <button type="button" class="secondary-btn" style="padding:0.4rem 0.75rem; font-size:0.8rem;" onclick="openStudentDetailsModal(${s.id})">
            View Details
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCensusPagination(p) {
  const container = document.getElementById('censusPaginationControls');
  if (!container || !p) return;

  if (p.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <button type="button" class="secondary-btn" style="padding:0.3rem 0.65rem; font-size:0.8rem;" ${p.page <= 1 ? 'disabled' : ''} onclick="loadWardenRegisteredStudents(${p.page - 1})">
      ◀ Prev
    </button>
    <span style="font-size:0.8rem; color:var(--text-secondary); font-weight:600;">
      Page ${p.page} of ${p.totalPages}
    </span>
    <button type="button" class="secondary-btn" style="padding:0.3rem 0.65rem; font-size:0.8rem;" ${p.page >= p.totalPages ? 'disabled' : ''} onclick="loadWardenRegisteredStudents(${p.page + 1})">
      Next ▶
    </button>
  `;
}

function filterByYear(year) {
  registeredStudentsState.currentYear = String(year);
  registeredStudentsState.page = 1;

  // Update pills UI
  const pillBtns = document.querySelectorAll('#censusYearPills .census-filter-pill-btn');
  pillBtns.forEach(btn => {
    const bYear = btn.getAttribute('data-year');
    if (bYear === String(year)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // If currently not on registered-students tab, switch to it
  if (activeTab !== 'registered-students') {
    showWardenSection('registered-students');
  } else {
    loadWardenRegisteredStudents(1);
  }
}

function onCensusFilterChange() {
  const deptSelect = document.getElementById('regStudentDeptFilter');
  const blockSelect = document.getElementById('regStudentBlockFilter');
  registeredStudentsState.currentDept = deptSelect ? deptSelect.value : 'all';
  registeredStudentsState.currentBlock = blockSelect ? blockSelect.value : 'all';
  loadWardenRegisteredStudents(1);
}

let censusSearchDebounceTimer = null;
function onCensusSearchInput(e) {
  clearTimeout(censusSearchDebounceTimer);
  const val = e.target.value;
  censusSearchDebounceTimer = setTimeout(() => {
    registeredStudentsState.searchQuery = val;
    loadWardenRegisteredStudents(1);
  }, 300);
}

function openStudentDetailsModal(studentId) {
  const student = (registeredStudentsState.students || []).find(s => Number(s.id) === Number(studentId));
  if (!student) return;

  const modal = document.getElementById('studentDetailsModal');
  const avatarEl = document.getElementById('modalStudentAvatar');
  const nameEl = document.getElementById('modalStudentName');
  const regNoEl = document.getElementById('modalStudentRegNo');
  const bodyEl = document.getElementById('modalStudentBody');

  if (avatarEl) avatarEl.textContent = (student.name || 'S').charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = student.name;
  if (regNoEl) regNoEl.textContent = `${student.regNo} • Year ${student.yearOfStudy} (${student.yearName || 'Academic Year'})`;

  if (bodyEl) {
    const isOutside = Boolean(student.isCurrentlyOutside);
    bodyEl.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.75rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-main); border-radius:8px; padding:1rem;">
        <div>
          <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Academic Enrollment</span>
          <div style="font-weight:700; color:var(--text-primary); font-size:0.95rem; margin-top:2px;">${escapeHtml(student.department || 'N/A')}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(student.degreeCourse || 'B.E')} • Section ${escapeHtml(student.section || 'A')}</div>
        </div>
        <div>
          <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Hostel Accommodation</span>
          <div style="font-weight:700; color:var(--text-primary); font-size:0.95rem; margin-top:2px;">Room ${escapeHtml(student.roomNo || 'N/A')}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(student.hostelBlock || 'Hostel Block')}</div>
        </div>
        <div>
          <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Student Contact</span>
          <div style="font-weight:600; color:var(--text-primary); font-size:0.9rem; margin-top:2px; font-family:monospace;">${escapeHtml(student.phone || 'Not Provided')}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(student.email || 'N/A')}</div>
        </div>
        <div>
          <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Parent / Guardian</span>
          <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem; margin-top:2px;">${escapeHtml(student.parentName || 'Parent')}</div>
          <div style="font-size:0.8rem; color:var(--text-muted); font-family:monospace;">📞 ${escapeHtml(student.parentPhone || 'N/A')}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:0.75rem; margin-top:0.75rem;">
        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-main); border-radius:8px; padding:0.85rem;">
          <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Class Advisor</span>
          <div style="font-weight:600; color:var(--text-primary); font-size:0.88rem; margin-top:2px;">${escapeHtml(student.advisorName || 'Not Assigned')}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(student.advisorDept || student.department || '')}</div>
        </div>
        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-main); border-radius:8px; padding:0.85rem;">
          <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Live Gate Status</span>
          <div style="margin-top:4px;">
            ${isOutside 
              ? '<span style="color:#ef4444; font-weight:700; font-size:0.9rem;">● Checked Out (Outside Hostel)</span>' 
              : '<span style="color:#10b981; font-weight:700; font-size:0.9rem;">● Present Inside Hostel</span>'}
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Total Historical Passes: ${student.totalOutpasses || 0}</div>
        </div>
      </div>
    `;
  }

  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function closeStudentDetailsModal() {
  const modal = document.getElementById('studentDetailsModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

async function exportRegisteredStudentsCSV() {
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  try {
    showToast('Exporting registered students census...', 'info');
    const params = new URLSearchParams();
    if (registeredStudentsState.currentYear && registeredStudentsState.currentYear !== 'all') {
      params.set('year', registeredStudentsState.currentYear);
    }
    if (registeredStudentsState.currentDept && registeredStudentsState.currentDept !== 'all') {
      params.set('department', registeredStudentsState.currentDept);
    }
    if (registeredStudentsState.currentBlock && registeredStudentsState.currentBlock !== 'all') {
      params.set('block', registeredStudentsState.currentBlock);
    }
    if (registeredStudentsState.searchQuery) {
      params.set('search', registeredStudentsState.searchQuery.trim());
    }
    params.set('page', 1);
    params.set('limit', 1000);

    const res = await fetch(`/api/outpass/warden/registered-students?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const students = (data.students && data.students.length > 0) ? data.students : registeredStudentsState.students;

    if (!students || students.length === 0) {
      showToast('No student records found to export.', 'warning');
      return;
    }

    const lines = [];
    lines.push('Registration Number,Student Name,Year of Study,Academic Level,Department,Section,Hostel Block,Room Number,Student Phone,Parent Name,Parent Phone,Total Outpasses,Current Gate Status');
    students.forEach(s => {
      lines.push([
        escapeCsv(s.regNo),
        escapeCsv(s.name),
        s.yearOfStudy,
        escapeCsv(s.yearName || ('Year ' + s.yearOfStudy)),
        escapeCsv(s.department),
        escapeCsv(s.section || ''),
        escapeCsv(s.hostelBlock || ''),
        escapeCsv(s.roomNo || ''),
        escapeCsv(s.phone || ''),
        escapeCsv(s.parentName || ''),
        escapeCsv(s.parentPhone || ''),
        s.totalOutpasses || 0,
        escapeCsv(s.isCurrentlyOutside ? 'Outside Hostel' : 'Inside Hostel')
      ].join(','));
    });

    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const yearTag = registeredStudentsState.currentYear === 'all' ? 'all_years' : `year_${registeredStudentsState.currentYear}`;
    a.download = `warden_registered_students_${yearTag}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${students.length} student records successfully!`, 'success');
  } catch (err) {
    console.error('Error exporting CSV:', err);
    showToast('Failed to export students CSV.', 'error');
  }
}

window.loadWardenRegisteredStudents = loadWardenRegisteredStudents;
window.filterByYear = filterByYear;
window.onCensusFilterChange = onCensusFilterChange;
window.onCensusSearchInput = onCensusSearchInput;
window.openStudentDetailsModal = openStudentDetailsModal;
window.closeStudentDetailsModal = closeStudentDetailsModal;
window.exportRegisteredStudentsCSV = exportRegisteredStudentsCSV;

/* ==========================================================
   15. WARDEN PARENT FACE MANAGEMENT
   ========================================================== */
let selectedParentIdForRevoke = null;

async function handleWardenParentSearch(event) {
  if (event) event.preventDefault();
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  const mobileInput = document.getElementById('inputWardenParentMobile');
  const mobile = mobileInput ? mobileInput.value.trim() : '';
  if (!mobile) {
    showToast('Please enter a mobile number to search.', 'warning');
    return;
  }

  const resultsContainer = document.getElementById('wardenParentSearchResults');
  const emptyContainer = document.getElementById('wardenParentSearchEmpty');
  const searchBtn = document.getElementById('btnWardenSearchParent');

  if (searchBtn) searchBtn.disabled = true;

  try {
    const res = await fetch(`/api/warden/parents/search?mobile=${encodeURIComponent(mobile)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const parents = data.parents || [];
      if (parents.length === 0) {
        if (resultsContainer) {
          resultsContainer.innerHTML = '';
          resultsContainer.style.display = 'none';
        }
        if (emptyContainer) {
          emptyContainer.style.display = 'block';
        }
      } else {
        if (emptyContainer) emptyContainer.style.display = 'none';
        if (resultsContainer) {
          resultsContainer.style.display = 'grid';
          resultsContainer.style.gap = '1rem';
          resultsContainer.innerHTML = parents.map(p => renderWardenParentCard(p)).join('');
        }
      }
    } else {
      showToast(data.message || 'Error searching parent.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (searchBtn) searchBtn.disabled = false;
  }
}

function renderWardenParentCard(parent) {
  const isRevoked = parent.faceStatus === 'REVOKED';
  const isActive = parent.faceStatus === 'ACTIVE';
  const statusColor = isActive ? '#10b981' : (isRevoked ? '#ef4444' : '#94a3b8');
  const statusBg = isActive ? 'rgba(16,185,129,0.12)' : (isRevoked ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)');
  const statusBorder = isActive ? 'rgba(16,185,129,0.3)' : (isRevoked ? 'rgba(239,68,68,0.3)' : 'rgba(148,163,184,0.3)');

  return `
    <div class="profile-details-card" id="warden-parent-card-${parent.parentId}" style="padding:1.5rem; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-lg);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
        <div>
          <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.25rem;">
            <h3 style="font-family:'Outfit'; font-size:1.2rem; font-weight:700; color:var(--text-primary); margin:0;">
              ${escapeHtml(parent.parentName)}
            </h3>
            <span style="font-size:0.75rem; padding:0.2rem 0.6rem; border-radius:999px; background:${statusBg}; color:${statusColor}; border:1px solid ${statusBorder}; font-weight:700; display:inline-flex; align-items:center; gap:0.35rem;">
              <span style="width:6px; height:6px; border-radius:50%; background:${statusColor}; display:inline-block;"></span>
              ${escapeHtml(parent.faceStatus || 'NOT_REGISTERED')}
            </span>
          </div>
          <div style="font-size:0.85rem; color:var(--text-secondary); display:flex; gap:1rem; flex-wrap:wrap;">
            <span>📞 Mobile: <strong style="color:var(--text-primary); font-family:monospace;">${escapeHtml(parent.mobileNumber)}</strong></span>
            <span>Relation: <strong>${escapeHtml(parent.relationship || 'Parent')}</strong></span>
          </div>
        </div>

        <div>
          ${isActive ? `
            <button type="button" class="btn-reject" onclick="openWardenRevokeModal(${parent.parentId})" style="padding:0.5rem 1.1rem; font-size:0.85rem; font-weight:700; border-radius:8px; display:inline-flex; align-items:center; gap:0.4rem; cursor:pointer;">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
              REVOKE FACE
            </button>
          ` : (isRevoked ? `
            <span style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.45rem 0.9rem; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); border-radius:8px; color:#f87171; font-size:0.82rem; font-weight:600;">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              NO ACTIVE FACE
            </span>
          ` : `
            <span style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.45rem 0.9rem; background:rgba(148,163,184,0.1); border:1px solid rgba(148,163,184,0.25); border-radius:8px; color:#94a3b8; font-size:0.82rem;">
              NOT REGISTERED
            </span>
          `)}
        </div>
      </div>

      <!-- Details grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.9rem; background:var(--bg-input); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-color); font-size:0.85rem;">
        <div>
          <span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; font-weight:600; display:block;">Linked Student</span>
          <strong style="color:var(--text-primary); font-size:0.92rem;">${escapeHtml(parent.studentName)}</strong>
          <div style="color:var(--text-secondary); font-size:0.78rem; font-family:monospace;">${escapeHtml(parent.studentRollNo)}</div>
        </div>
        <div>
          <span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; font-weight:600; display:block;">Academic & Room</span>
          <span style="color:var(--text-primary);">${escapeHtml(parent.studentDept)}</span>
          <div style="color:var(--text-secondary); font-size:0.78rem;">${escapeHtml(parent.studentRoom)}</div>
        </div>
        <div>
          <span style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; font-weight:600; display:block;">Biometric Status</span>
          <span style="font-weight:600; color:${statusColor};">${isActive ? 'Active 128D Face Template' : (isRevoked ? 'Face Revoked by Warden' : 'Face Scan Pending')}</span>
          <div style="color:var(--text-secondary); font-size:0.78rem;">${parent.registeredAt ? 'Enrolled: ' + formatDateTime(parent.registeredAt) : (isRevoked && parent.revokedAt ? 'Revoked: ' + formatDateTime(parent.revokedAt) : 'No template')}</div>
        </div>
      </div>

      ${isRevoked ? `
        <div style="margin-top:0.9rem; padding:0.6rem 0.85rem; background:rgba(239,68,68,0.06); border:1px dashed rgba(239,68,68,0.25); border-radius:6px; font-size:0.8rem; color:#fca5a5; display:flex; align-items:center; gap:0.5rem;">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <span>Face registration is currently revoked. The parent will be required to re-register their face before approving future outpass requests.</span>
        </div>
      ` : ''}
    </div>
  `;
}

function openWardenRevokeModal(parentId) {
  selectedParentIdForRevoke = parentId;
  const modal = document.getElementById('wardenRevokeFaceModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeWardenRevokeModal() {
  selectedParentIdForRevoke = null;
  const modal = document.getElementById('wardenRevokeFaceModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function executeWardenRevokeFace() {
  if (!selectedParentIdForRevoke) return;
  const token = localStorage.getItem('sh_token') || sessionStorage.getItem('sh_token');
  if (!token) return;

  const btnConfirm = document.getElementById('btnConfirmRevokeFace');
  if (btnConfirm) btnConfirm.disabled = true;

  try {
    const res = await fetch('/api/warden/parents/revoke-face', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parentId: selectedParentIdForRevoke,
        reason: 'Revoked by Warden administration from Parent Face Management panel'
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeWardenRevokeModal();
      showToast('Parent face registration has been revoked successfully.', 'success');
      // Re-trigger search to update the card state
      handleWardenParentSearch();
    } else {
      showToast(data.message || 'Failed to revoke parent face.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (btnConfirm) btnConfirm.disabled = false;
  }
}

window.handleWardenParentSearch = handleWardenParentSearch;
window.openWardenRevokeModal = openWardenRevokeModal;
window.closeWardenRevokeModal = closeWardenRevokeModal;
window.executeWardenRevokeFace = executeWardenRevokeFace;





