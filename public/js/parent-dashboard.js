/**
 * Smart Hostel Outpass Management System
 * Parent Dashboard Controller - Hardware-Independent Biometric Fingerprint & Same-Language Voice Engine
 */

// State
let currentParent = null;
let linkedStudent = null;
let activeTab = 'pending-queue';
let isLocationVerified = false;
let activeVerificationToken = null;
let latestVerifiedDistance = null;
let pendingList = [];
let approvedList = [];
let rejectedList = [];
let selectedRequestForAction = null;

// Voice-to-Text State (Strictly Same-Language, Zero Translation)
let selectedChatVoiceLang = 'en-IN';
let selectedModalVoiceLang = 'en-IN';
let activeChatRecognizer = null;
let activeModalRecognizer = null;
let isRecordingChatVoice = false;
let isRecordingModalVoice = false;

/// Reverse Geocoding Cache & Helper for Parent Location
const reverseGeoCache = new Map();

async function resolveHumanReadableLocation(lat, lng) {
  if (!lat || !lng) return 'Location not available';
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) return 'Location not available';
  const cacheKey = `${latNum.toFixed(3)},${lngNum.toFixed(3)}`;
  if (reverseGeoCache.has(cacheKey)) {
    return reverseGeoCache.get(cacheKey);
  }
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latNum}&longitude=${lngNum}&localityLanguage=en`;
    const bdcRes = await fetch(bdcUrl, { signal: AbortSignal.timeout(4000) });
    if (bdcRes.ok) {
      const d = await bdcRes.json();
      const parts = [];
      if (d.locality && d.locality !== d.city) parts.push(d.locality);
      if (d.city) parts.push(d.city);
      else if (d.principalSubdivision) parts.push(d.principalSubdivision);
      if (d.countryCode) parts.push(d.countryCode);
      if (parts.length > 0) {
        const place = parts.join(', ');
        reverseGeoCache.set(cacheKey, place);
        return place;
      }
    }
  } catch (e) {}
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}`;
    const nomRes = await fetch(nomUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'SmartHostelOutpass/1.0' },
      signal: AbortSignal.timeout(4000)
    });
    if (nomRes.ok) {
      const nd = await nomRes.json();
      if (nd.name || nd.display_name) {
        const fallbackPlace = nd.address?.city || nd.address?.town || nd.address?.village || nd.name || 'Campus vicinity';
        reverseGeoCache.set(cacheKey, fallbackPlace);
        return fallbackPlace;
      }
    }
  } catch (e) {}
  const defaultPlace = `Lat: ${latNum.toFixed(4)}, Lng: ${lngNum.toFixed(4)}`;
  reverseGeoCache.set(cacheKey, defaultPlace);
  return defaultPlace;
}

// DOM Elements Cache
const DOM = {
  parentName: document.getElementById('parentName'),
  parentAvatar: document.getElementById('parentAvatar'),
  studentMetaPill: document.getElementById('studentMetaPill'),
  parentPhonePill: document.getElementById('parentPhonePill'),
  navUserName: document.getElementById('navUserName'),
  navUserAvatar: document.getElementById('navUserAvatar'),
  liveClockTime: document.getElementById('liveClockTime'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  dashboardSidebar: document.getElementById('dashboardSidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),

  // Proximity Security Hero & Banner
  proximitySecurityCard: document.getElementById('proximitySecurityCard'),
  securityIconBox: document.getElementById('securityIconBox'),
  verifiedMobileBadge: document.getElementById('verifiedMobileBadge'),
  heroParentMobile: document.getElementById('heroParentMobile'),
  securityCardTitle: document.getElementById('securityCardTitle'),
  securityCardSubtext: document.getElementById('securityCardSubtext'),
  authVerifiedBadge: document.getElementById('authVerifiedBadge'),
  authBadgeLabel: document.getElementById('authBadgeLabel'),

  // Counters
  statPendingCount: document.getElementById('statPendingCount'),
  navBadgePending: document.getElementById('navBadgePending'),

  // Queues & Containers
  pendingQueueContainer: document.getElementById('pendingQueueContainer'),
  approvedTableBody: document.getElementById('approvedTableBody'),
  rejectedTableBody: document.getElementById('rejectedTableBody'),

  // Profile tab fields
  profParentName: document.getElementById('profParentName'),
  profRelationship: document.getElementById('profRelationship'),
  profPrimaryPhone: document.getElementById('profPrimaryPhone'),
  profSecondaryPhone: document.getElementById('profSecondaryPhone'),
  profEmail: document.getElementById('profEmail'),
  profAddress: document.getElementById('profAddress'),
  profWardName: document.getElementById('profWardName'),
  profWardReg: document.getElementById('profWardReg'),
  profWardDept: document.getElementById('profWardDept'),
  profWardRoom: document.getElementById('profWardRoom'),
  profWardAdvisor: document.getElementById('profWardAdvisor'),
  profWardWarden: document.getElementById('profWardWarden'),

  // 1. Profile Setup Modal ("Complete Your Profile")
  profileSetupModal: document.getElementById('profileSetupModal'),
  setupParentName: document.getElementById('setupParentName'),
  setupMobileNumber: document.getElementById('setupMobileNumber'),
  setupRelationship: document.getElementById('setupRelationship'),
  setupStudentName: document.getElementById('setupStudentName'),
  setupStudentRegNo: document.getElementById('setupStudentRegNo'),
  setupHostelBlock: document.getElementById('setupHostelBlock'),
  setupRoomNumber: document.getElementById('setupRoomNumber'),
  btnSaveProfileSetup: document.getElementById('btnSaveProfileSetup'),

  // 2. Profile Edit Modal
  editProfileModal: document.getElementById('editProfileModal'),
  editProfileForm: document.getElementById('editProfileForm'),
  editParentName: document.getElementById('editParentName'),
  editParentPhone: document.getElementById('editParentPhone'),
  editRelationship: document.getElementById('editRelationship'),
  editStudentName: document.getElementById('editStudentName'),
  editStudentRegNo: document.getElementById('editStudentRegNo'),
  editHostelBlock: document.getElementById('editHostelBlock'),
  editRoomNumber: document.getElementById('editRoomNumber'),
  editParentAddress: document.getElementById('editParentAddress'),
  btnSaveEditProfile: document.getElementById('btnSaveEditProfile'),

  // 3. Details Modal
  detailsModal: document.getElementById('detailsModal'),
  detailsModalBody: document.getElementById('detailsModalBody'),

  // 4. Location Verification & Approval Modal
  approveModal: document.getElementById('approveModal'),
  approveRequestSummaryBox: document.getElementById('approveRequestSummaryBox'),
  locationVerifySection: document.getElementById('locationVerifySection'),
  locSecurityPill: document.getElementById('locSecurityPill'),
  modalVerifiedMobileText: document.getElementById('modalVerifiedMobileText'),
  locVerifyBox: document.getElementById('locVerifyBox'),
  locRadarPulse: document.getElementById('locRadarPulse'),
  locPinSvg: document.getElementById('locPinSvg'),
  locStatusHeading: document.getElementById('locStatusHeading'),
  locStatusSubtext: document.getElementById('locStatusSubtext'),
  btnTriggerLocVerify: document.getElementById('btnTriggerLocVerify'),
  btnTriggerLocVerifyLabel: document.getElementById('btnTriggerLocVerifyLabel'),
  locDetailsContainer: document.getElementById('locDetailsContainer'),
  locDistanceBadge: document.getElementById('locDistanceBadge'),
  locAccuracyBadge: document.getElementById('locAccuracyBadge'),
  locPlaceText: document.getElementById('locPlaceText'),
  locResultBanner: document.getElementById('locResultBanner'),
  locResultText: document.getElementById('locResultText'),
  parentMessageConsentSection: document.getElementById('parentMessageConsentSection'),
  approveParentMessage: document.getElementById('approveParentMessage'),
  modalVoiceStatusBadge: document.getElementById('modalVoiceStatusBadge'),
  modalVoiceStatusText: document.getElementById('modalVoiceStatusText'),
  btnModalLangEn: document.getElementById('btnModalLangEn'),
  btnModalLangTa: document.getElementById('btnModalLangTa'),
  btnVoiceInput: document.getElementById('btnVoiceInput'),
  voiceBtnLabel: document.getElementById('voiceBtnLabel'),
  btnConfirmApprove: document.getElementById('btnConfirmApprove'),
  btnConfirmApproveLabel: document.getElementById('btnConfirmApproveLabel'),

  // 5. Rejection Modal
  rejectModal: document.getElementById('rejectModal'),
  rejectReasonInput: document.getElementById('rejectReasonInput'),
  btnConfirmReject: document.getElementById('btnConfirmReject'),

  // Toast & Nav
  toastContainer: document.getElementById('toastContainer'),
  navButtons: document.querySelectorAll('.parent-nav-btn'),
  tabSections: document.querySelectorAll('.tab-section'),
  logoutBtn: document.getElementById('logoutBtn')
};

function getAuthToken() {
  return localStorage.getItem('sh_token') ||
         sessionStorage.getItem('sh_token') ||
         localStorage.getItem('token') ||
         sessionStorage.getItem('token');
}

function clearAuthAndRedirect() {
  localStorage.removeItem('sh_token');
  localStorage.removeItem('sh_user');
  sessionStorage.removeItem('sh_token');
  sessionStorage.removeItem('sh_user');
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
  window.location.replace('/index.html');
}

/* ==========================================================
   1. INITIALIZATION & SESSION VERIFICATION
   ========================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupLiveClock();
  setupMobileDrawer();
  initNavigation();
  initLogout();
  setupRealtimeListeners();
  initApproveRejectModals();

  await verifyParentSession();
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
    refreshParentData();
  });
}

// Immediate Route Protection & Browser Back-Button Guard
window.addEventListener('pageshow', () => {
  const token = getAuthToken();
  if (!token) {
    window.location.replace('/index.html');
  }
});

async function verifyParentSession() {
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
    if (role !== 'parent') {
      console.warn(`Role mismatch: Expected parent, got ${role}. Redirecting.`);
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
      window.location.replace(ROLE_DASHBOARDS[role] || '/student-dashboard.html');
      return;
    }

    currentParent = data.user;
    await refreshParentData();

  } catch (err) {
    console.error('[Parent Session Error]:', err);
    clearAuthAndRedirect();
  }
}

async function refreshParentData() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch('/api/parent/overview', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      linkedStudent = data.linkedStudent;
      const parentObj = data.parent || {};
      const verifiedMobile = parentObj.verifiedMobile || parentObj.phone || currentParent?.phone || '-';

      populateParentHeader(parentObj, linkedStudent);
      populateParentProfileTab(parentObj, linkedStudent);
      updateHeroSecurityCard(parentObj);

      const stats = data.stats || {};
      if (DOM.statPendingCount) DOM.statPendingCount.textContent = stats.pendingCount || 0;
      if (DOM.navBadgePending) {
        DOM.navBadgePending.textContent = stats.pendingCount || 0;
        DOM.navBadgePending.style.display = stats.pendingCount > 0 ? 'inline-block' : 'none';
      }

      await Promise.all([
        loadPendingRequests(),
        loadApprovedRequests(),
        loadRejectedRequests(),
        loadChatMessages()
      ]);

      // Profile Guard: if ward details not yet linked, open profile setup modal
      if (!parentObj.profileCompleted && !linkedStudent) {
        openProfileSetupModal(verifiedMobile);
      } else {
        closeModal('profileSetupModal');
      }
    }
  } catch (err) {
    console.error('Error loading parent overview data:', err);
  }
}

function updateHeroSecurityCard(parentObj) {
  const pPhone = parentObj?.verifiedMobile || parentObj?.phone || currentParent?.phone || currentParent?.identifier || '-';
  if (DOM.heroParentMobile) DOM.heroParentMobile.textContent = pPhone;
  if (DOM.authVerifiedBadge) {
    DOM.authVerifiedBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    DOM.authVerifiedBadge.style.color = '#34d399';
    DOM.authVerifiedBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    if (DOM.authBadgeLabel) DOM.authBadgeLabel.textContent = 'Verified Mobile & GPS Proximity Security';
  }
}

function populateParentHeader(parent, student) {
  const pName = parent?.fatherName || parent?.name || 'Parent Guardian';
  const pPhone = parent?.verifiedMobile || parent?.phone || parent?.primary_phone || currentParent?.phone || currentParent?.identifier || '-';

  if (DOM.parentName) DOM.parentName.textContent = pName;
  if (DOM.parentAvatar) DOM.parentAvatar.textContent = pName.charAt(0).toUpperCase();
  if (DOM.navUserName) DOM.navUserName.textContent = pName;
  if (DOM.navUserAvatar) DOM.navUserAvatar.textContent = pName.charAt(0).toUpperCase();
  if (DOM.parentPhonePill) DOM.parentPhonePill.textContent = `Phone: ${pPhone}`;

  if (student) {
    if (DOM.studentMetaPill) {
      DOM.studentMetaPill.textContent = `Ward: ${student.name} (${student.regNo || student.reg_no})`;
    }
  } else {
    if (DOM.studentMetaPill) {
      DOM.studentMetaPill.textContent = 'Ward: Profile Setup Required';
    }
  }
}

function populateParentProfileTab(parent, student) {
  const pName = parent?.fatherName || parent?.name || 'Parent Guardian';
  const pPhone = parent?.verifiedMobile || parent?.phone || parent?.primary_phone || currentParent?.phone || currentParent?.identifier || '-';
  const pEmail = parent?.email || '-';
  const pAddress = parent?.address || '-';

  if (DOM.profParentName) DOM.profParentName.textContent = pName;
  if (DOM.profParentPhone) DOM.profParentPhone.textContent = pPhone;
  if (DOM.profParentEmail) DOM.profParentEmail.textContent = pEmail;
  if (DOM.profParentAddr) DOM.profParentAddr.textContent = pAddress;
  if (DOM.profRelationship) DOM.profRelationship.textContent = parent?.relationship || 'Parent / Guardian';
  if (DOM.profSecurityModel) {
    DOM.profSecurityModel.textContent = 'Verified Mobile + Live GPS (≥ 5m Proximity Rule)';
  }

  if (student) {
    if (DOM.profStudentName) DOM.profStudentName.textContent = student.name;
    if (DOM.profStudentReg) DOM.profStudentReg.textContent = student.regNo || student.reg_no;
    if (DOM.profStudentDept) DOM.profStudentDept.textContent = `${student.department || 'CSE'} (Year ${student.yearOfStudy || '3'})`;
    if (DOM.profStudentRoom) DOM.profStudentRoom.textContent = `${student.hostelBlock || student.block || 'Block A'} - ${student.roomNo || student.room || 'A-304'}`;
  } else {
    if (DOM.profStudentName) DOM.profStudentName.textContent = 'Not Linked Yet';
    if (DOM.profStudentReg) DOM.profStudentReg.textContent = '-';
    if (DOM.profStudentDept) DOM.profStudentDept.textContent = '-';
    if (DOM.profStudentRoom) DOM.profStudentRoom.textContent = '-';
  }
}

/**
 * Exits setup immediately and returns cleanly to Parent Login on Main Portal
 */
async function exitToParentLogin() {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  }
  clearAuthAndRedirect();
}

/* ==========================================================
   3. PARENT PROFILE SETUP ("COMPLETE YOUR PROFILE")
   ========================================================== */
function openProfileSetupModal(prefilledMobile = '') {
  const mobile = prefilledMobile || currentParent?.phone || currentParent?.primary_phone || currentParent?.identifier || '';
  if (DOM.setupMobileNumber) DOM.setupMobileNumber.value = mobile;
  if (DOM.setupParentName) DOM.setupParentName.value = currentParent?.name && currentParent?.name !== 'Parent' ? currentParent.name : '';
  openModal('profileSetupModal');
}

async function handleProfileSetupSubmit(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const parent_name = DOM.setupParentName?.value.trim();
  const relationship = DOM.setupRelationship?.value;
  const student_name = DOM.setupStudentName?.value.trim();
  const student_reg_no = DOM.setupStudentRegNo?.value.trim();
  const hostel_block = DOM.setupHostelBlock?.value.trim();
  const room_no = DOM.setupRoomNumber?.value.trim();

  // Validation
  if (!parent_name) {
    showToast('Parent / Guardian name is required.', 'error');
    DOM.setupParentName?.focus();
    return;
  }
  if (!student_name) {
    showToast('Student name is required.', 'error');
    DOM.setupStudentName?.focus();
    return;
  }
  if (!student_reg_no) {
    showToast('Student roll / registration number is required.', 'error');
    DOM.setupStudentRegNo?.focus();
    return;
  }

  if (DOM.btnSaveProfileSetup) DOM.btnSaveProfileSetup.disabled = true;

  try {
    const res = await fetch('/api/parent/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent_name,
        relationship,
        student_name,
        student_reg_no,
        hostel_block,
        room_no
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('profileSetupModal');
      showToast('🎉 Parent profile and student linkage completed!', 'success');
      await refreshParentData();
    } else {
      showToast(data.message || 'Profile setup failed.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (DOM.btnSaveProfileSetup) DOM.btnSaveProfileSetup.disabled = false;
  }
}

/* ==========================================================
   4. PROFILE EDIT MODAL (FROM DASHBOARD PROFILE TAB)
   ========================================================== */
function openEditProfileModal() {
  const pPhone = currentParent?.phone || currentParent?.primary_phone || currentParent?.identifier || '';
  if (DOM.editParentPhone) DOM.editParentPhone.value = pPhone;
  if (DOM.editParentName) DOM.editParentName.value = DOM.profParentName?.textContent !== '-' ? DOM.profParentName?.textContent : '';
  if (DOM.editParentAddress) DOM.editParentAddress.value = DOM.profParentAddr?.textContent !== '-' ? DOM.profParentAddr?.textContent : '';
  if (DOM.editStudentName) DOM.editStudentName.value = linkedStudent?.name || '';
  if (DOM.editStudentRegNo) DOM.editStudentRegNo.value = linkedStudent?.regNo || linkedStudent?.reg_no || '';
  if (DOM.editHostelBlock) DOM.editHostelBlock.value = linkedStudent?.hostelBlock || linkedStudent?.block || '';
  if (DOM.editRoomNumber) DOM.editRoomNumber.value = linkedStudent?.roomNo || linkedStudent?.room || '';

  openModal('editProfileModal');
}

async function handleProfileUpdateSubmit(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const parent_name = DOM.editParentName?.value.trim();
  const relationship = DOM.editRelationship?.value;
  const student_name = DOM.editStudentName?.value.trim();
  const student_reg_no = DOM.editStudentRegNo?.value.trim();
  const hostel_block = DOM.editHostelBlock?.value.trim();
  const room_no = DOM.editRoomNumber?.value.trim();
  const address = DOM.editParentAddress?.value.trim();

  if (!parent_name) {
    showToast('Parent name is required.', 'error');
    DOM.editParentName?.focus();
    return;
  }

  if (DOM.btnSaveEditProfile) DOM.btnSaveEditProfile.disabled = true;

  try {
    const res = await fetch('/api/parent/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent_name,
        relationship,
        student_name,
        student_reg_no,
        hostel_block,
        room_no,
        address
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('editProfileModal');
      showToast('Profile changes saved successfully.', 'success');
      await refreshParentData();
    } else {
      showToast(data.message || 'Profile update failed.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (DOM.btnSaveEditProfile) DOM.btnSaveEditProfile.disabled = false;
  }
}

/* ==========================================================
   5. LOAD QUEUES & RENDER REQUESTS
   ========================================================== */
async function loadPendingRequests() {
  const token = getAuthToken();
  if (!token || !DOM.pendingQueueContainer) return;

  try {
    const res = await fetch('/api/parent/outpass/pending', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      pendingList = data.pendingRequests || [];
      renderPendingQueue(pendingList);
    }
  } catch (err) {
    console.error('Error loading pending requests:', err);
  }
}

async function loadApprovedRequests() {
  const token = getAuthToken();
  if (!token || !DOM.approvedTableBody) return;

  try {
    const res = await fetch('/api/parent/outpass/approved', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      approvedList = data.approvedRequests || [];
      renderApprovedTable(approvedList);
    }
  } catch (err) {
    console.error('Error loading approved requests:', err);
  }
}

async function loadRejectedRequests() {
  const token = getAuthToken();
  if (!token || !DOM.rejectedTableBody) return;

  try {
    const res = await fetch('/api/parent/outpass/rejected', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      rejectedList = data.rejectedRequests || [];
      renderRejectedTable(rejectedList);
    }
  } catch (err) {
    console.error('Error loading rejected requests:', err);
  }
}

function renderPendingQueue(list) {
  if (!DOM.pendingQueueContainer) return;
  DOM.pendingQueueContainer.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.pendingQueueContainer.innerHTML = `
      <div class="empty-state-card" style="grid-column: 1 / -1; text-align:center; padding:3.5rem 1.5rem; background:var(--bg-card); border:1px dashed var(--border-color); border-radius:var(--radius-lg);">
        <div style="width:54px; height:54px; border-radius:50%; background:rgba(245,158,11,0.15); color:#f59e0b; display:inline-flex; align-items:center; justify-content:center; margin-bottom:1rem;">
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <h3 style="font-family:'Outfit'; font-size:1.2rem; margin-bottom:0.35rem;">No Pending Outpass Requests</h3>
        <p style="color:var(--text-secondary); font-size:0.88rem; max-width:420px; margin:0 auto;">
          When your ward applies for a hostel outpass, it will appear here for your identity-verified biometric consent.
        </p>
      </div>
    `;
    return;
  }

  list.forEach(req => {
    const card = document.createElement('div');
    card.className = 'duty-card';
    card.id = `parent-req-card-${req.id}`;
    card.style.borderLeftColor = '#f59e0b';

    card.innerHTML = `
      <div class="duty-card-header">
        <div>
          <div class="student-tag-group">
            <span class="request-code-badge">${req.requestCode}</span>
            <span class="event-banner-tag" style="background:rgba(245,158,11,0.15); color:#fbbf24; border-color:rgba(245,158,11,0.35);">
              ${req.requestType === 'one_day_duty' ? '🎓 One-Day Duty' : '🏠 Normal Outpass'}
            </span>
            <span class="student-tag">Student: <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})</span>
            <span class="student-tag">${req.studentDept} • Room: ${req.studentBlock}-${req.studentRoom}</span>
          </div>
          <h3 style="font-family:'Outfit'; font-size:1.2rem; margin-top:0.4rem; color:var(--text-primary);">
            ${escapeHtml(req.destination)}
          </h3>
        </div>
        <span class="status-badge status-pending-parent">Pending Parent Consent</span>
      </div>

      <div class="request-details-grid">
        <div class="detail-item">
          <span class="detail-label">Purpose / Reason</span>
          <span class="detail-value">${escapeHtml(req.purpose)}</span>
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
          <span class="detail-label">Student Phone</span>
          <span class="detail-value">${req.contactPhone || req.studentRegisteredPhone || 'N/A'}</span>
        </div>
      </div>

      <div class="request-card-actions">
        <button class="btn-view-details" onclick="openDetailsModal(${req.id})">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>View Details</span>
        </button>
        <button class="btn-reject" onclick="openRejectModal(${req.id})">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          <span>Reject</span>
        </button>
        <button class="btn-approve" onclick="openApproveModal(${req.id})" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 11c0 2-1 3-2 3s-2-1-2-3a4 4 0 0 1 8 0c0 3-1.5 5-2.5 7"></path></svg>
          <span>Approve Request</span>
        </button>
      </div>
    `;

    DOM.pendingQueueContainer.appendChild(card);
  });
}

function renderApprovedTable(list) {
  if (!DOM.approvedTableBody) return;
  DOM.approvedTableBody.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.approvedTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No approved outpasses recorded yet.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(req => {
    const tr = document.createElement('tr');
    let displayStatus = 'Approved';
    if (req.status === 'PENDING_WARDEN') displayStatus = 'Consent Granted • Pending Warden';
    else if (req.status === 'APPROVED') displayStatus = 'Approved by Warden';
    else if (req.status === 'COMPLETED') displayStatus = 'Completed';

    tr.innerHTML = `
      <td><strong>${req.requestCode}</strong></td>
      <td><strong>${escapeHtml(req.destination)}</strong><br><small style="color:var(--text-secondary);">${escapeHtml(req.purpose)}</small></td>
      <td>${formatDateTime(req.leavingDatetime)}</td>
      <td>${formatDateTime(req.returnDatetime)}</td>
      <td><span class="status-badge status-approved">${displayStatus}</span></td>
      <td><small style="color:var(--text-muted);">${formatDateTime(req.parentApprovedAt)}</small></td>
    `;
    DOM.approvedTableBody.appendChild(tr);
  });
}

function renderRejectedTable(list) {
  if (!DOM.rejectedTableBody) return;
  DOM.rejectedTableBody.innerHTML = '';

  if (!list || list.length === 0) {
    DOM.rejectedTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">
          No rejected outpasses recorded.
        </td>
      </tr>
    `;
    return;
  }

  list.forEach(req => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${req.requestCode}</strong></td>
      <td><strong>${escapeHtml(req.destination)}</strong></td>
      <td><span style="color:#ef4444; font-size:0.84rem;">${escapeHtml(req.rejectionReason || 'Denied by Parent')}</span></td>
      <td><span class="status-badge status-rejected">Rejected</span></td>
      <td><small style="color:var(--text-muted);">${formatDateTime(req.rejectedAt)}</small></td>
    `;
    DOM.rejectedTableBody.appendChild(tr);
  });
}

/* ==========================================================
   6. FINGERPRINT VERIFICATION & OUTPASS APPROVAL FLOW
   ========================================================== */
function initApproveRejectModals() {
  if (DOM.btnTriggerLocVerify) {
    DOM.btnTriggerLocVerify.addEventListener('click', async () => {
      await handleStartLocationVerification();
    });
  }

  if (DOM.btnVoiceInput) {
    DOM.btnVoiceInput.addEventListener('click', () => {
      toggleVoiceInput();
    });
  }

  if (DOM.btnModalLangEn) {
    DOM.btnModalLangEn.addEventListener('click', () => {
      setModalVoiceLang('en-IN');
    });
  }

  if (DOM.btnModalLangTa) {
    DOM.btnModalLangTa.addEventListener('click', () => {
      setModalVoiceLang('ta-IN');
    });
  }

  if (DOM.btnConfirmApprove) {
    DOM.btnConfirmApprove.addEventListener('click', async () => {
      if (!selectedRequestForAction) return;
      await executeParentApprove(selectedRequestForAction);
    });
  }

  if (DOM.approveParentMessage) {
    DOM.approveParentMessage.addEventListener('input', () => {
      if (isLocationVerified) {
        const hasMsg = !!DOM.approveParentMessage.value.trim();
        if (DOM.btnConfirmApprove) {
          DOM.btnConfirmApprove.disabled = !hasMsg;
          DOM.btnConfirmApprove.style.opacity = hasMsg ? '1' : '0.5';
          DOM.btnConfirmApprove.style.cursor = hasMsg ? 'pointer' : 'not-allowed';
        }
      }
    });
  }

  if (DOM.btnConfirmReject) {
    DOM.btnConfirmReject.addEventListener('click', async () => {
      if (!selectedRequestForAction) return;
      const reason = DOM.rejectReasonInput ? DOM.rejectReasonInput.value.trim() : '';
      if (!reason) {
        showToast('Please provide a rejection reason.', 'error');
        if (DOM.rejectReasonInput) DOM.rejectReasonInput.focus();
        return;
      }
      await executeParentReject(selectedRequestForAction, reason);
    });
  }
}

function openApproveModal(requestId) {
  selectedRequestForAction = requestId;
  isLocationVerified = false;
  activeVerificationToken = null;
  latestVerifiedDistance = null;

  const req = pendingList.find(r => r.id === requestId);
  if (!req) return;

  // 1. Populate Outpass Summary
  if (DOM.approveRequestSummaryBox) {
    DOM.approveRequestSummaryBox.innerHTML = `
      <div class="verify-summary-grid">
        <div><strong>Student:</strong> ${escapeHtml(req.studentName)} (${req.studentRegNo})</div>
        <div><strong>Hostel:</strong> ${req.studentBlock} - ${req.studentRoom}</div>
        <div><strong>Destination:</strong> ${escapeHtml(req.destination)}</div>
        <div><strong>Purpose:</strong> ${escapeHtml(req.purpose)}</div>
        <div><strong>Leaving:</strong> ${formatDateTime(req.leavingDatetime)}</div>
        <div><strong>Return:</strong> ${formatDateTime(req.returnDatetime)}</div>
      </div>
    `;
  }

  // 2. Reset Location Verification UI State
  const parentMobile = currentParent?.phone || currentParent?.identifier || 'Registered Mobile';
  if (DOM.modalVerifiedMobileText) DOM.modalVerifiedMobileText.textContent = parentMobile;

  if (DOM.locVerifyBox) {
    DOM.locVerifyBox.className = 'loc-verify-box';
  }
  if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'GPS Proximity Security Check';
  if (DOM.locStatusSubtext) DOM.locStatusSubtext.textContent = 'Device GPS location is required. Approvals within 5 meters of student device are blocked.';
  if (DOM.btnTriggerLocVerify) {
    DOM.btnTriggerLocVerify.disabled = false;
    if (DOM.btnTriggerLocVerifyLabel) DOM.btnTriggerLocVerifyLabel.textContent = 'Verify Current Location';
  }

  if (DOM.locDetailsContainer) DOM.locDetailsContainer.classList.add('hidden');
  if (DOM.locDistanceBadge) {
    DOM.locDistanceBadge.textContent = '-- meters';
    DOM.locDistanceBadge.className = 'loc-stat-val';
  }
  if (DOM.locAccuracyBadge) {
    DOM.locAccuracyBadge.textContent = '-- meters';
    DOM.locAccuracyBadge.className = 'loc-stat-val';
  }
  if (DOM.locPlaceText) DOM.locPlaceText.textContent = 'Waiting for location verification...';
  if (DOM.locResultBanner) DOM.locResultBanner.classList.add('hidden');
  if (DOM.parentMessageConsentSection) DOM.parentMessageConsentSection.classList.add('hidden');
  if (DOM.approveParentMessage) DOM.approveParentMessage.value = '';

  // 3. Reset Modal Voice Assistant State
  setModalVoiceLang('en-IN');
  updateModalVoiceStatus('idle');

  // Check browser voice support notice
  const unsuppNotice = document.getElementById('voiceUnsupportedNotice');
  if (unsuppNotice) {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      unsuppNotice.classList.remove('hidden');
    } else {
      unsuppNotice.classList.add('hidden');
    }
  }

  // 4. Disable Approve Submit until location is verified
  if (DOM.btnConfirmApprove) {
    DOM.btnConfirmApprove.disabled = true;
    DOM.btnConfirmApprove.style.opacity = '0.5';
    DOM.btnConfirmApprove.style.cursor = 'not-allowed';
  }
  if (DOM.btnConfirmApproveLabel) {
    DOM.btnConfirmApproveLabel.textContent = 'Verify Location to Approve';
  }

  openModal('approveModal');
}

/**
 * Requests fresh GPS location from device using navigator.geolocation.getCurrentPosition()
 * High accuracy, maxAge 0, timeout 12s
 * Posts coordinates to backend for authoritative 5-meter proximity verification
 */
async function handleStartLocationVerification() {
  if (!selectedRequestForAction) return;
  const token = getAuthToken();
  if (!token) return;

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser.', 'error');
    if (DOM.locVerifyBox) DOM.locVerifyBox.className = 'loc-verify-box blocked';
    if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = '❌ Geolocation Not Supported';
    if (DOM.locStatusSubtext) {
      DOM.locStatusSubtext.textContent = 'Your browser does not support GPS geolocation. Location verification cannot proceed.';
    }
    if (DOM.btnConfirmApproveLabel) {
      DOM.btnConfirmApproveLabel.textContent = 'Approval Unavailable – No Geolocation';
    }
    return;
  }

  // Visual state: "Requesting your current location..."
  if (DOM.locVerifyBox) DOM.locVerifyBox.className = 'loc-verify-box verifying';
  if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Requesting your current location...';
  if (DOM.locStatusSubtext) DOM.locStatusSubtext.textContent = 'Please allow location permission in your browser prompt.';
  if (DOM.btnTriggerLocVerify) DOM.btnTriggerLocVerify.disabled = true;
  if (DOM.btnTriggerLocVerifyLabel) DOM.btnTriggerLocVerifyLabel.textContent = 'Acquiring GPS Signal...';
  if (DOM.locResultBanner) DOM.locResultBanner.classList.add('hidden');
  if (DOM.btnConfirmApproveLabel) DOM.btnConfirmApproveLabel.textContent = 'Acquiring GPS Signal...';

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      // Visual state: "Checking location & distance..."
      if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Checking location & distance...';
      if (DOM.locStatusSubtext) DOM.locStatusSubtext.textContent = 'Backend is calculating distance to student device...';
      if (DOM.btnTriggerLocVerifyLabel) DOM.btnTriggerLocVerifyLabel.textContent = 'Verifying Proximity...';
      if (DOM.btnConfirmApproveLabel) DOM.btnConfirmApproveLabel.textContent = 'Verifying Proximity...';

      const payload = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp || Date.now()
      };

      try {
        const res = await fetch(`/api/parent/outpass/${selectedRequestForAction}/location-verify`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        // Reveal location details container
        if (DOM.locDetailsContainer) DOM.locDetailsContainer.classList.remove('hidden');

        if (res.ok && data.success && data.locationVerified) {
          // ========================================================
          // STATE C – VERIFICATION SUCCESSFUL (Distance >= 5m, Accuracy <= 50m)
          // ========================================================
          isLocationVerified = true;
          activeVerificationToken = data.verificationToken;
          latestVerifiedDistance = data.distanceMeters;

          if (DOM.locVerifyBox) DOM.locVerifyBox.className = 'loc-verify-box verified';
          if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Location Verification Successful';
          if (DOM.locStatusSubtext) {
            DOM.locStatusSubtext.textContent = `Safe proximity confirmed (${data.distanceMeters}m separation). Parental consent unlocked.`;
          }

          if (DOM.locDistanceBadge) {
            DOM.locDistanceBadge.textContent = `${data.distanceMeters} meters`;
            DOM.locDistanceBadge.className = 'loc-stat-val safe';
          }
          if (DOM.locAccuracyBadge) {
            const acc = (data.parentAccuracy !== undefined && data.parentAccuracy !== null)
              ? data.parentAccuracy
              : (data.accuracy !== undefined && data.accuracy !== null ? data.accuracy : payload.accuracy);
            DOM.locAccuracyBadge.textContent = `±${Math.round(acc)} meters`;
            DOM.locAccuracyBadge.className = 'loc-stat-val safe';
          }

          if (DOM.locResultBanner) {
            DOM.locResultBanner.className = 'fp-verify-result-banner success';
            DOM.locResultBanner.classList.remove('hidden');
          }
          if (DOM.locResultText) {
            DOM.locResultText.textContent = `✅ Safe Proximity Confirmed: ${data.distanceMeters} meters away from student device.`;
          }

          if (DOM.btnTriggerLocVerify) {
            DOM.btnTriggerLocVerify.disabled = false;
            if (DOM.btnTriggerLocVerifyLabel) DOM.btnTriggerLocVerifyLabel.textContent = 'Re-verify Location';
          }

          if (DOM.locPlaceText) {
            DOM.locPlaceText.textContent = `Resolving location (${payload.latitude.toFixed(4)}, ${payload.longitude.toFixed(4)})...`;
            resolveHumanReadableLocation(payload.latitude, payload.longitude).then(placeName => {
              if (DOM.locPlaceText) DOM.locPlaceText.textContent = placeName;
            });
          }

          // Unlock Parent Consent Message & Enable Approval Submission
          if (DOM.parentMessageConsentSection) {
            DOM.parentMessageConsentSection.classList.remove('hidden');
          }
          const hasMsg = !!(DOM.approveParentMessage && DOM.approveParentMessage.value.trim());
          if (DOM.btnConfirmApprove) {
            DOM.btnConfirmApprove.disabled = !hasMsg;
            DOM.btnConfirmApprove.style.opacity = hasMsg ? '1' : '0.5';
            DOM.btnConfirmApprove.style.cursor = hasMsg ? 'pointer' : 'not-allowed';
          }
          if (DOM.btnConfirmApproveLabel) {
            DOM.btnConfirmApproveLabel.textContent = 'Send Approval & Forward to Warden →';
          }

          showToast(`✅ Location verified (${data.distanceMeters}m distance). You may now grant consent.`, 'success');

        } else {
          // ========================================================
          // VERIFICATION REJECTED: DISPATCH TO SPECIFIC STATE
          // ========================================================
          isLocationVerified = false;
          activeVerificationToken = null;
          latestVerifiedDistance = null;

          if (DOM.locVerifyBox) DOM.locVerifyBox.className = 'loc-verify-box blocked';

          // Always keep approval disabled & consent section hidden for any rejection
          if (DOM.parentMessageConsentSection) {
            DOM.parentMessageConsentSection.classList.add('hidden');
          }
          if (DOM.btnConfirmApprove) {
            DOM.btnConfirmApprove.disabled = true;
            DOM.btnConfirmApprove.style.opacity = '0.5';
            DOM.btnConfirmApprove.style.cursor = 'not-allowed';
          }
          if (DOM.btnTriggerLocVerify) {
            DOM.btnTriggerLocVerify.disabled = false;
            if (DOM.btnTriggerLocVerifyLabel) DOM.btnTriggerLocVerifyLabel.textContent = 'Retry Location Verification';
          }

          if (DOM.locResultBanner) {
            DOM.locResultBanner.className = 'fp-verify-result-banner error';
            DOM.locResultBanner.classList.remove('hidden');
          }

          const rawParentAcc = (data.parentAccuracy !== undefined && data.parentAccuracy !== null)
            ? data.parentAccuracy
            : (data.accuracy !== undefined && data.accuracy !== null ? data.accuracy : payload.accuracy);
          const formattedAccuracy = (rawParentAcc !== undefined && rawParentAcc !== null && !isNaN(Number(rawParentAcc)))
            ? `±${Math.round(Number(rawParentAcc))} meters`
            : 'N/A';

          if (data.accuracyPoor && data.device !== 'student') {
            // ====================================================
            // STATE A – GPS ACCURACY INSUFFICIENT (> 50 meters)
            // ====================================================
            if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Location Verification Failed';
            if (DOM.locStatusSubtext) {
              DOM.locStatusSubtext.textContent = data.message || `Parent location accuracy (${formattedAccuracy}) is insufficient for 5-meter verification. Please move to an open area and try again.`;
            }

            if (DOM.locPlaceText) {
              DOM.locPlaceText.textContent = `Parent accuracy (${formattedAccuracy}) is insufficient (requires ≤ 50m)`;
            }

            // Distance must be N/A: distance < 5m has NOT been established
            if (DOM.locDistanceBadge) {
              DOM.locDistanceBadge.textContent = 'N/A';
              DOM.locDistanceBadge.className = 'loc-stat-val danger';
            }
            if (DOM.locAccuracyBadge) {
              DOM.locAccuracyBadge.textContent = formattedAccuracy;
              DOM.locAccuracyBadge.className = 'loc-stat-val danger';
            }

            if (DOM.locResultText) {
              DOM.locResultText.textContent = `❌ ${data.message || `Parent location accuracy (${formattedAccuracy}) is insufficient for 5-meter verification. Please move to an open area and try again.`}`;
            }

            // Fix: Status / button must NOT say "Approval Blocked (<5m Proximity)"
            if (DOM.btnConfirmApproveLabel) {
              DOM.btnConfirmApproveLabel.textContent = 'Approval Unavailable – GPS Accuracy Insufficient';
            }

            showToast(data.message || 'GPS accuracy insufficient. Please move to an open area and try again.', 'error');

          } else if (data.proximityBlocked === true || (res.status === 403 && data.distanceMeters !== null && data.distanceMeters !== undefined && data.distanceMeters < 5)) {
            // ====================================================
            // STATE B – PROXIMITY BLOCKED (Distance < 5 meters confirmed by backend)
            // ====================================================
            if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Location Verification Failed';
            if (DOM.locStatusSubtext) {
              DOM.locStatusSubtext.textContent = data.message || 'Parent and student devices are within 5 meters. Approval is blocked for security.';
            }

            if (DOM.locPlaceText) {
              DOM.locPlaceText.textContent = `Location verified within restricted distance (${data.distanceMeters}m)`;
            }

            if (DOM.locDistanceBadge) {
              DOM.locDistanceBadge.textContent = `${data.distanceMeters} meters`;
              DOM.locDistanceBadge.className = 'loc-stat-val danger';
            }
            if (DOM.locAccuracyBadge) {
              DOM.locAccuracyBadge.textContent = formattedAccuracy;
              DOM.locAccuracyBadge.className = 'loc-stat-val';
            }

            if (DOM.locResultText) {
              DOM.locResultText.textContent = `❌ ${data.message || `Approval blocked: Parent and student devices are within ${data.distanceMeters} meters (<5m security rule).`}`;
            }

            // This label is allowed ONLY when the backend actually confirms distance < 5m
            if (DOM.btnConfirmApproveLabel) {
              DOM.btnConfirmApproveLabel.textContent = 'Approval Blocked (< 5m Proximity)';
            }

            showToast(data.message || 'Parent and student devices are within 5 meters. Approval is blocked for security.', 'error');

          } else if (data.studentLocationMissing || data.studentLocationStale || data.studentLocationInvalid || (data.accuracyPoor && data.device === 'student')) {
            // ====================================================
            // STATE D – STUDENT LOCATION INVALID / STALE / MISSING
            // ====================================================
            if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Location Verification Failed';
            if (DOM.locStatusSubtext) {
              DOM.locStatusSubtext.textContent = data.message || 'Student location is unavailable or outdated. Please ask the student to refresh their live location and try again.';
            }

            // Do NOT calculate or display a misleading distance
            if (DOM.locDistanceBadge) {
              DOM.locDistanceBadge.textContent = 'N/A';
              DOM.locDistanceBadge.className = 'loc-stat-val danger';
            }
            if (DOM.locAccuracyBadge) {
              DOM.locAccuracyBadge.textContent = formattedAccuracy;
              DOM.locAccuracyBadge.className = 'loc-stat-val';
            }

            if (DOM.locResultText) {
              DOM.locResultText.textContent = `❌ ${data.message || 'Student location is unavailable or outdated. Please ask the student to refresh their live location and try again.'}`;
            }

            let studentLabel = 'Approval Unavailable – Student Location Required';
            if (data.studentLocationStale) {
              studentLabel = 'Approval Unavailable – Student Location Outdated';
            } else if (data.accuracyPoor && data.device === 'student') {
              studentLabel = 'Approval Unavailable – Student GPS Accuracy Insufficient';
            }
            if (DOM.btnConfirmApproveLabel) {
              DOM.btnConfirmApproveLabel.textContent = studentLabel;
            }

            showToast(data.message || 'Student location is unavailable or outdated. Please ask student to refresh GPS.', 'error');

          } else {
            // ====================================================
            // GENERAL BACKEND REJECTION (e.g. auth or status)
            // ====================================================
            if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Location Verification Failed';
            if (DOM.locStatusSubtext) {
              DOM.locStatusSubtext.textContent = data.message || 'Location verification could not be completed. Please try again.';
            }

            if (DOM.locDistanceBadge) {
              DOM.locDistanceBadge.textContent = (data.distanceMeters !== null && data.distanceMeters !== undefined)
                ? `${data.distanceMeters} meters`
                : 'N/A';
              DOM.locDistanceBadge.className = 'loc-stat-val danger';
            }
            if (DOM.locAccuracyBadge) {
              DOM.locAccuracyBadge.textContent = formattedAccuracy;
              DOM.locAccuracyBadge.className = 'loc-stat-val danger';
            }

            if (DOM.locResultText) {
              DOM.locResultText.textContent = `❌ ${data.message || 'Location verification failed. Approval unavailable.'}`;
            }

            if (DOM.btnConfirmApproveLabel) {
              DOM.btnConfirmApproveLabel.textContent = 'Approval Unavailable – Verification Failed';
            }

            showToast(data.message || 'Location verification failed.', 'error');
          }
        }

      } catch (fetchErr) {
        // ========================================================
        // NETWORK COMMUNICATION ERROR
        // ========================================================
        isLocationVerified = false;
        activeVerificationToken = null;
        latestVerifiedDistance = null;

        if (DOM.locVerifyBox) DOM.locVerifyBox.className = 'loc-verify-box blocked';
        if (DOM.locDetailsContainer) DOM.locDetailsContainer.classList.remove('hidden');
        if (DOM.locDistanceBadge) {
          DOM.locDistanceBadge.textContent = 'N/A';
          DOM.locDistanceBadge.className = 'loc-stat-val danger';
        }
        if (DOM.locAccuracyBadge) {
          DOM.locAccuracyBadge.textContent = payload?.accuracy ? `±${Math.round(payload.accuracy)} meters` : 'N/A';
          DOM.locAccuracyBadge.className = 'loc-stat-val danger';
        }

        const netMsg = 'Network communication failure during location verification: ' + (fetchErr.message || 'Unable to connect to server');
        if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = '⚠️ Network Communication Error';
        if (DOM.locStatusSubtext) {
          DOM.locStatusSubtext.textContent = 'Could not communicate with the verification server. Please check your internet connection and retry.';
        }
        if (DOM.btnConfirmApproveLabel) {
          DOM.btnConfirmApproveLabel.textContent = 'Approval Unavailable – Network Error';
        }

        if (DOM.locResultBanner) {
          DOM.locResultBanner.className = 'fp-verify-result-banner error';
          DOM.locResultBanner.classList.remove('hidden');
        }
        if (DOM.locResultText) {
          DOM.locResultText.textContent = `❌ ${netMsg}`;
        }

        if (DOM.parentMessageConsentSection) DOM.parentMessageConsentSection.classList.add('hidden');
        if (DOM.btnConfirmApprove) {
          DOM.btnConfirmApprove.disabled = true;
          DOM.btnConfirmApprove.style.opacity = '0.5';
          DOM.btnConfirmApprove.style.cursor = 'not-allowed';
        }
        if (DOM.btnTriggerLocVerify) {
          DOM.btnTriggerLocVerify.disabled = false;
          if (DOM.btnTriggerLocVerifyLabel) DOM.btnTriggerLocVerifyLabel.textContent = 'Retry Location Verification';
        }

        showToast(netMsg, 'error');
      }
    },
    (geoError) => {
      // ========================================================
      // BROWSER GEOLOCATION API ERRORS
      // ========================================================
      isLocationVerified = false;
      activeVerificationToken = null;
      latestVerifiedDistance = null;

      if (DOM.locVerifyBox) DOM.locVerifyBox.className = 'loc-verify-box blocked';
      if (DOM.locDetailsContainer) DOM.locDetailsContainer.classList.remove('hidden');
      if (DOM.locDistanceBadge) {
        DOM.locDistanceBadge.textContent = 'N/A';
        DOM.locDistanceBadge.className = 'loc-stat-val danger';
      }
      if (DOM.locAccuracyBadge) {
        DOM.locAccuracyBadge.textContent = 'N/A';
        DOM.locAccuracyBadge.className = 'loc-stat-val danger';
      }

      if (DOM.parentMessageConsentSection) DOM.parentMessageConsentSection.classList.add('hidden');
      if (DOM.btnConfirmApprove) {
        DOM.btnConfirmApprove.disabled = true;
        DOM.btnConfirmApprove.style.opacity = '0.5';
        DOM.btnConfirmApprove.style.cursor = 'not-allowed';
      }
      if (DOM.btnTriggerLocVerify) {
        DOM.btnTriggerLocVerify.disabled = false;
        if (DOM.btnTriggerLocVerifyLabel) DOM.btnTriggerLocVerifyLabel.textContent = 'Retry Location Verification';
      }

      let errorTitle = '⚠️ Location Access Required';
      let errorMsg = 'Unable to verify your current location. Please enable location permission and try again.';
      let buttonStatus = 'Approval Unavailable – Location Required';

      if (geoError) {
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            errorTitle = '⚠️ Location Permission Denied';
            errorMsg = 'GPS location permission was denied. Please allow location access in your browser or device settings and retry.';
            buttonStatus = 'Approval Unavailable – GPS Permission Denied';
            break;
          case geoError.POSITION_UNAVAILABLE:
            errorTitle = '⚠️ GPS Signal Unavailable';
            errorMsg = 'GPS signal is currently unavailable. Please move to an open area or check your device GPS sensor and retry.';
            buttonStatus = 'Approval Unavailable – GPS Signal Lost';
            break;
          case geoError.TIMEOUT:
            errorTitle = '⚠️ GPS Acquisition Timed Out';
            errorMsg = 'GPS location request timed out. Please ensure your device has a clear GPS view and retry.';
            buttonStatus = 'Approval Unavailable – GPS Timed Out';
            break;
          default:
            errorTitle = '⚠️ Location Error';
            errorMsg = geoError.message || 'An unknown error occurred while retrieving GPS coordinates.';
            buttonStatus = 'Approval Unavailable – Location Error';
            break;
        }
      }

      if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = errorTitle;
      if (DOM.locStatusSubtext) DOM.locStatusSubtext.textContent = errorMsg;
      if (DOM.btnConfirmApproveLabel) DOM.btnConfirmApproveLabel.textContent = buttonStatus;

      if (DOM.locResultBanner) {
        DOM.locResultBanner.className = 'fp-verify-result-banner error';
        DOM.locResultBanner.classList.remove('hidden');
      }
      if (DOM.locResultText) {
        DOM.locResultText.textContent = `❌ ${errorMsg}`;
      }

      showToast(errorMsg, 'error');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000
    }
  );
}

/* ==========================================================
   7. SAME-LANGUAGE VOICE-TO-TEXT ENGINE (NO TRANSLATION)
   ========================================================== */

/**
 * Universal Web Speech recognition handler preserving spoken language.
 * English speech -> English transcription (en-IN).
 * Tamil speech   -> Tamil Unicode transcription (ta-IN).
 */
function createSpeechRecognizer({ lang, targetElement, onStateChange, onComplete }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const unsuppNotice = document.getElementById('voiceUnsupportedNotice');
    if (unsuppNotice) unsuppNotice.classList.remove('hidden');
    onStateChange('error', 'Voice input is unavailable in this browser. Please type your message instead.');
    showToast('Voice input is unavailable in this browser. Please type your message instead.', 'error');
    if (onComplete) onComplete();
    return null;
  }

  try {
    const recognizer = new SpeechRecognition();
    recognizer.lang = lang || 'en-IN';
    recognizer.continuous = false;
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    recognizer.onstart = () => {
      onStateChange('listening', 'Listening...');
    };

    recognizer.onspeechstart = () => {
      onStateChange('listening', 'Listening...');
    };

    recognizer.onspeechend = () => {
      onStateChange('processing', 'Converting speech...');
    };

    recognizer.onresult = (event) => {
      onStateChange('processing', 'Converting speech...');
      if (event.results && event.results[0] && event.results[0][0]) {
        const transcript = event.results[0][0].transcript;
        if (transcript && targetElement) {
          const existing = targetElement.value ? targetElement.value.trim() : '';
          targetElement.value = existing ? `${existing} ${transcript}` : transcript;
          targetElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
        onStateChange('completed', 'Voice converted successfully');
        const langName = lang === 'ta-IN' ? 'தமிழ் (Tamil)' : 'English';
        showToast(`Voice transcribed in ${langName}. You can edit before sending.`, 'success');
      }
    };

    recognizer.onerror = (e) => {
      console.warn('[Speech Recognition Error]:', e);
      let errMsg = 'Unable to recognize speech. Please try again.';
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        errMsg = 'Microphone permission denied. Please allow microphone access in browser.';
      } else if (e.error === 'no-speech') {
        errMsg = 'No speech detected. Please tap mic and speak clearly.';
      } else if (e.error === 'network') {
        errMsg = 'Network connection issue during speech recognition.';
      }
      onStateChange('error', errMsg);
      showToast(errMsg, 'error');
    };

    recognizer.onend = () => {
      if (onComplete) onComplete();
    };

    recognizer.start();
    return recognizer;
  } catch (err) {
    console.error('[Speech Init Error]:', err);
    onStateChange('error', 'Unable to initialize microphone: ' + err.message);
    showToast('Microphone error: ' + err.message, 'error');
    if (onComplete) onComplete();
    return null;
  }
}

// 7.1 Chat Tab Voice Assistant Handlers
function setChatVoiceLang(lang) {
  selectedChatVoiceLang = lang === 'ta-IN' ? 'ta-IN' : 'en-IN';
  if (DOM.btnChatLangEn) DOM.btnChatLangEn.classList.toggle('active', selectedChatVoiceLang === 'en-IN');
  if (DOM.btnChatLangTa) DOM.btnChatLangTa.classList.toggle('active', selectedChatVoiceLang === 'ta-IN');
  updateChatVoiceStatus('idle', `Voice Language: ${selectedChatVoiceLang === 'ta-IN' ? 'தமிழ் (ta-IN)' : 'English (en-IN)'}`);
}

function updateChatVoiceStatus(state, customMessage = '') {
  if (!DOM.chatVoiceStatusBadge || !DOM.chatVoiceStatusText) return;

  DOM.chatVoiceStatusBadge.className = 'voice-status-badge';

  if (state === 'listening') {
    DOM.chatVoiceStatusBadge.classList.add('listening');
    DOM.chatVoiceStatusText.textContent = customMessage || 'Listening...';
    if (DOM.btnChatVoiceInput) DOM.btnChatVoiceInput.classList.add('recording');
    if (DOM.chatMicLabel) DOM.chatMicLabel.textContent = 'Listening...';
  } else if (state === 'processing') {
    DOM.chatVoiceStatusBadge.classList.add('processing');
    DOM.chatVoiceStatusText.textContent = customMessage || 'Converting speech...';
    if (DOM.btnChatVoiceInput) DOM.btnChatVoiceInput.classList.add('recording');
    if (DOM.chatMicLabel) DOM.chatMicLabel.textContent = 'Converting...';
  } else if (state === 'completed') {
    DOM.chatVoiceStatusBadge.classList.add('completed');
    DOM.chatVoiceStatusText.textContent = customMessage || 'Voice converted successfully';
    if (DOM.btnChatVoiceInput) DOM.btnChatVoiceInput.classList.remove('recording');
    if (DOM.chatMicLabel) DOM.chatMicLabel.textContent = 'Voice';
  } else if (state === 'error') {
    DOM.chatVoiceStatusBadge.classList.add('error');
    DOM.chatVoiceStatusText.textContent = customMessage || 'Unable to recognize speech. Please try again.';
    if (DOM.btnChatVoiceInput) DOM.btnChatVoiceInput.classList.remove('recording');
    if (DOM.chatMicLabel) DOM.chatMicLabel.textContent = 'Voice';
  } else {
    // Idle state
    DOM.chatVoiceStatusText.textContent = customMessage || 'Tap mic to speak';
    if (DOM.btnChatVoiceInput) DOM.btnChatVoiceInput.classList.remove('recording');
    if (DOM.chatMicLabel) DOM.chatMicLabel.textContent = 'Voice';
  }
}

function toggleChatVoiceInput() {
  if (isRecordingChatVoice) {
    if (activeChatRecognizer) {
      try { activeChatRecognizer.stop(); } catch (e) {}
    }
    isRecordingChatVoice = false;
    updateChatVoiceStatus('idle');
    return;
  }

  isRecordingChatVoice = true;
  activeChatRecognizer = createSpeechRecognizer({
    lang: selectedChatVoiceLang,
    targetElement: DOM.chatMessageInput,
    onStateChange: (state, msg) => {
      updateChatVoiceStatus(state, msg);
    },
    onComplete: () => {
      isRecordingChatVoice = false;
      activeChatRecognizer = null;
    }
  });

  if (!activeChatRecognizer) {
    isRecordingChatVoice = false;
  }
}

// 7.2 Approval Modal Voice Assistant Handlers
function setModalVoiceLang(lang) {
  selectedModalVoiceLang = lang === 'ta-IN' ? 'ta-IN' : 'en-IN';
  if (DOM.btnModalLangEn) DOM.btnModalLangEn.classList.toggle('active', selectedModalVoiceLang === 'en-IN');
  if (DOM.btnModalLangTa) DOM.btnModalLangTa.classList.toggle('active', selectedModalVoiceLang === 'ta-IN');
  updateModalVoiceStatus('idle');
}

function updateModalVoiceStatus(state, customMessage = '') {
  if (!DOM.modalVoiceStatusBadge || !DOM.modalVoiceStatusText) return;

  DOM.modalVoiceStatusBadge.className = 'voice-status-badge';

  if (state === 'listening') {
    DOM.modalVoiceStatusBadge.classList.remove('hidden');
    DOM.modalVoiceStatusBadge.classList.add('listening');
    DOM.modalVoiceStatusText.textContent = customMessage || 'Listening...';
    if (DOM.btnVoiceInput) DOM.btnVoiceInput.classList.add('recording');
    if (DOM.voiceBtnLabel) DOM.voiceBtnLabel.textContent = 'Listening...';
  } else if (state === 'processing') {
    DOM.modalVoiceStatusBadge.classList.remove('hidden');
    DOM.modalVoiceStatusBadge.classList.add('processing');
    DOM.modalVoiceStatusText.textContent = customMessage || 'Converting speech...';
    if (DOM.btnVoiceInput) DOM.btnVoiceInput.classList.add('recording');
    if (DOM.voiceBtnLabel) DOM.voiceBtnLabel.textContent = 'Converting...';
  } else if (state === 'completed') {
    DOM.modalVoiceStatusBadge.classList.remove('hidden');
    DOM.modalVoiceStatusBadge.classList.add('completed');
    DOM.modalVoiceStatusText.textContent = customMessage || 'Voice converted successfully';
    if (DOM.btnVoiceInput) DOM.btnVoiceInput.classList.remove('recording');
    if (DOM.voiceBtnLabel) DOM.voiceBtnLabel.textContent = 'Voice converted';
  } else if (state === 'error') {
    DOM.modalVoiceStatusBadge.classList.remove('hidden');
    DOM.modalVoiceStatusBadge.classList.add('error');
    DOM.modalVoiceStatusText.textContent = customMessage || 'Unable to recognize speech. Please try again.';
    if (DOM.btnVoiceInput) DOM.btnVoiceInput.classList.remove('recording');
    if (DOM.voiceBtnLabel) DOM.voiceBtnLabel.textContent = 'Tap to speak';
  } else {
    // Idle state
    DOM.modalVoiceStatusBadge.classList.add('hidden');
    if (DOM.btnVoiceInput) DOM.btnVoiceInput.classList.remove('recording');
    if (DOM.voiceBtnLabel) DOM.voiceBtnLabel.textContent = 'Tap to speak';
  }
}

function toggleVoiceInput() {
  if (isRecordingModalVoice) {
    if (activeModalRecognizer) {
      try { activeModalRecognizer.stop(); } catch (e) {}
    }
    isRecordingModalVoice = false;
    updateModalVoiceStatus('idle');
    return;
  }

  isRecordingModalVoice = true;
  activeModalRecognizer = createSpeechRecognizer({
    lang: selectedModalVoiceLang,
    targetElement: DOM.approveParentMessage,
    onStateChange: (state, msg) => {
      updateModalVoiceStatus(state, msg);
    },
    onComplete: () => {
      isRecordingModalVoice = false;
      activeModalRecognizer = null;
    }
  });

  if (!activeModalRecognizer) {
    isRecordingModalVoice = false;
  }
}

/* ==========================================================
   8. APPROVE / REJECT SUBMISSION HANDLERS
   ========================================================== */
async function executeParentApprove(requestId) {
  const token = getAuthToken();
  if (!token) return;

  if (!isLocationVerified || !activeVerificationToken) {
    showToast('Location verification is required before approving.', 'error');
    return;
  }

  const parentMessage = DOM.approveParentMessage ? DOM.approveParentMessage.value.trim() : '';
  if (!parentMessage) {
    showToast('Please enter or speak an approval message for the Warden.', 'error');
    if (DOM.approveParentMessage) DOM.approveParentMessage.focus();
    return;
  }

  if (DOM.btnConfirmApprove) DOM.btnConfirmApprove.disabled = true;

  try {
    const res = await fetch(`/api/parent/outpass/${requestId}/approve`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        verification_token: activeVerificationToken,
        parent_message: parentMessage
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('approveModal');
      showToast(`🎉 Outpass ${data.data?.requestCode || ''} approved via verified mobile & GPS proximity, forwarded to Warden.`, 'success');

      isLocationVerified = false;
      activeVerificationToken = null;
      latestVerifiedDistance = null;

      const card = document.getElementById(`parent-req-card-${requestId}`);
      if (card) card.remove();

      selectedRequestForAction = null;
      await refreshParentData();
    } else {
      showToast(data.message || 'Approval failed.', 'error');
    }
  } catch (err) {
    showToast('Network error during approval: ' + err.message, 'error');
  } finally {
    if (DOM.btnConfirmApprove) DOM.btnConfirmApprove.disabled = false;
  }
}

function openRejectModal(requestId) {
  selectedRequestForAction = requestId;
  if (DOM.rejectReasonInput) DOM.rejectReasonInput.value = '';
  openModal('rejectModal');
}

async function executeParentReject(requestId, reason) {
  const token = getAuthToken();
  if (!token) return;

  if (DOM.btnConfirmReject) DOM.btnConfirmReject.disabled = true;

  try {
    const res = await fetch(`/api/parent/outpass/${requestId}/reject`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rejection_reason: reason })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      closeModal('rejectModal');
      showToast(`Outpass ${data.data?.requestCode || ''} rejected.`, 'success');

      const card = document.getElementById(`parent-req-card-${requestId}`);
      if (card) card.remove();

      await refreshParentData();
    } else {
      showToast(data.message || 'Rejection failed.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (DOM.btnConfirmReject) DOM.btnConfirmReject.disabled = false;
  }
}

/* ==========================================================
   9. CHAT & MESSAGING STREAM
   ========================================================== */
function initChat() {
  if (DOM.chatInputForm) {
    DOM.chatInputForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = DOM.chatMessageInput ? DOM.chatMessageInput.value.trim() : '';
      if (!msg) return;
      await sendParentMessage(msg);
    });
  }

  document.querySelectorAll('.tamil-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const phrase = btn.dataset.text || btn.textContent.trim();
      if (DOM.chatMessageInput) {
        DOM.chatMessageInput.value = phrase;
        DOM.chatMessageInput.focus();
      }
    });
  });
}

async function loadChatMessages() {
  const token = getAuthToken();
  if (!token || !DOM.chatMessagesArea) return;

  try {
    const res = await fetch('/api/parent/messages', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      renderChatMessages(data.messages || []);
    }
  } catch (err) {
    console.error('Error loading chat messages:', err);
  }
}

function renderChatMessages(messages) {
  if (!DOM.chatMessagesArea) return;
  DOM.chatMessagesArea.innerHTML = '';

  if (!messages || messages.length === 0) {
    DOM.chatMessagesArea.innerHTML = `
      <div style="text-align:center; padding:3rem; color:var(--text-muted);">
        <p>No previous messages recorded.</p>
        <small>You can send notes, emergency updates, or consent messages in English or தமிழ்.</small>
      </div>
    `;
    return;
  }

  messages.forEach(m => {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble parent';

    bubble.innerHTML = `
      <div>${escapeHtml(m.messageBody)}</div>
      <div class="bubble-meta">${formatDateTime(m.createdAt)} • Sent by Parent</div>
    `;
    DOM.chatMessagesArea.appendChild(bubble);
  });

  DOM.chatMessagesArea.scrollTop = DOM.chatMessagesArea.scrollHeight;
}

async function sendParentMessage(messageText) {
  const token = getAuthToken();
  if (!token) return;

  try {
    const res = await fetch('/api/parent/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: messageText, message_type: 'message' })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      if (DOM.chatMessageInput) DOM.chatMessageInput.value = '';
      showToast('Message sent to Hostel Warden stream.', 'success');
      await loadChatMessages();
    } else {
      showToast(data.message || 'Failed to send message.', 'error');
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  }
}

/* ==========================================================
   10. DETAILS MODAL & TAB NAVIGATION
   ========================================================== */
function openDetailsModal(requestId) {
  const req = pendingList.find(r => r.id === requestId);
  if (!req) return;

  if (DOM.detailsModalBody) {
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
          <span class="autofill-val">${req.studentDept} (Year ${req.studentYear})</span>
        </div>
        <div class="autofill-item">
          <span class="autofill-label">Hostel & Room</span>
          <span class="autofill-val">${req.studentBlock} - ${req.studentRoom}</span>
        </div>
      </div>

      <div style="background:var(--bg-input); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:0.5rem;">
        <div><strong>Place of Visit / Destination:</strong> ${escapeHtml(req.destination)}</div>
        <div><strong>Reason / Purpose:</strong> ${escapeHtml(req.purpose)}</div>
        <div><strong>Leaving Date & Time:</strong> ${formatDateTime(req.leavingDatetime)}</div>
        <div><strong>Expected Return:</strong> ${formatDateTime(req.returnDatetime)}</div>
        <div><strong>Emergency Contact:</strong> ${req.contactPhone || req.studentRegisteredPhone || 'N/A'}</div>
      </div>
    `;
  }

  openModal('detailsModal');
}

function initNavigation() {
  DOM.navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.dataset.tab;
      if (tabId) switchTab(tabId);
    });
  });

  window.addEventListener('hashchange', () => {
    const rawHash = window.location.hash.replace(/^#/, '');
    if (rawHash && rawHash !== activeTab) {
      switchTab(rawHash, false);
    }
  });

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

  if (pushHash && window.location.hash !== `#${tabId}`) {
    history.pushState(null, '', `#${tabId}`);
  }

  if (tabId === 'pending-queue') loadPendingRequests();
  if (tabId === 'approved-list') loadApprovedRequests();
  if (tabId === 'rejected-list') loadRejectedRequests();
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
  if (modalId === 'approveModal' || modalId === 'rejectModal') {
    selectedRequestForAction = null;
  }
}

/* ==========================================================
   11. UTILITIES, TOASTS & THEME
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

function initTheme() {
  const savedTheme = localStorage.getItem('sh_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcons(savedTheme);

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('sh_theme', next);
      updateThemeIcons(next);
    });
  }
}

function updateThemeIcons(theme) {
  const iconDark = document.getElementById('themeIconDark');
  const iconLight = document.getElementById('themeIconLight');
  if (iconDark && iconLight) {
    if (theme === 'dark') {
      iconDark.classList.remove('hidden');
      iconLight.classList.add('hidden');
    } else {
      iconDark.classList.add('hidden');
      iconLight.classList.remove('hidden');
    }
  }
}
