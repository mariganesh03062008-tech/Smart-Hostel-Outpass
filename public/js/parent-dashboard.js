/**
 * Smart Hostel Outpass Management System
 * Parent Dashboard Controller - AI Face Biometric Verification & Same-Language Voice Engine
 */

// State
let currentParent = null;
let linkedStudent = null;
let activeTab = 'pending-queue';
let isFaceVerified = false;
let isFaceRegistered = false;
let activeVerificationToken = null;
let liveFaceDescriptor = null;
let faceApiModelsLoaded = false;
let faceApiLoadError = null;
let registerVideoStream = null;
let verifyVideoStream = null;
let registerDetectionInterval = null;
let verifyDetectionInterval = null;
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

// Strict Type Normalizer Helper
function getCanonicalOutpassType(req) {
  if (!req) return 'normal';
  const raw = String(req.outpass_type || req.outpassType || req.requestType || '').toLowerCase().trim();
  if (raw === 'emergency') return 'emergency';
  if (raw === 'special') return 'special';
  if (raw === 'one_day_duty' || raw === 'duty' || raw === 'one_day' || raw === 'oneday') return 'one_day_duty';
  return 'normal';
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

  // Face Biometric Security Hero & Card
  faceSecurityCard: document.getElementById('faceSecurityCard'),
  faceSecurityIconBox: document.getElementById('faceSecurityIconBox'),
  heroFaceStatus: document.getElementById('heroFaceStatus'),
  heroFaceBtnText: document.getElementById('heroFaceBtnText'),
  btnOpenFaceEnrollHero: document.getElementById('btnOpenFaceEnrollHero'),
  heroParentMobile: document.getElementById('heroParentMobile'),
  authVerifiedBadge: document.getElementById('authVerifiedBadge'),
  authBadgeLabel: document.getElementById('authBadgeLabel'),

  // Counters
  statPendingCount: document.getElementById('statPendingCount'),
  navBadgePending: document.getElementById('navBadgePending'),
  badgePendingNormal: document.getElementById('badgePendingNormal'),
  badgePendingDuty: document.getElementById('badgePendingDuty'),
  badgePendingSpecial: document.getElementById('badgePendingSpecial'),

  // Queues & Containers
  pendingQueueContainer: document.getElementById('pendingQueueContainer'),
  pendingNormalContainer: document.getElementById('pendingNormalContainer'),
  pendingDutyContainer: document.getElementById('pendingDutyContainer'),
  pendingSpecialContainer: document.getElementById('pendingSpecialContainer'),
  approvedTableBody: document.getElementById('approvedTableBody'),
  rejectedTableBody: document.getElementById('rejectedTableBody'),

  // Profile tab fields
  profParentName: document.getElementById('profParentName'),
  profRelationship: document.getElementById('profRelationship'),
  profParentPhone: document.getElementById('profParentPhone') || document.getElementById('profPrimaryPhone'),
  profPrimaryPhone: document.getElementById('profPrimaryPhone') || document.getElementById('profParentPhone'),
  profSecondaryPhone: document.getElementById('profSecondaryPhone'),
  profParentEmail: document.getElementById('profParentEmail') || document.getElementById('profEmail'),
  profEmail: document.getElementById('profEmail') || document.getElementById('profParentEmail'),
  profParentAddr: document.getElementById('profParentAddr') || document.getElementById('profAddress'),
  profAddress: document.getElementById('profAddress') || document.getElementById('profParentAddr'),
  profSecurityModel: document.getElementById('profSecurityModel'),
  profStudentName: document.getElementById('profStudentName') || document.getElementById('profWardName'),
  profWardName: document.getElementById('profWardName') || document.getElementById('profStudentName'),
  profStudentReg: document.getElementById('profStudentReg') || document.getElementById('profWardReg'),
  profWardReg: document.getElementById('profWardReg') || document.getElementById('profStudentReg'),
  profStudentDept: document.getElementById('profStudentDept') || document.getElementById('profWardDept'),
  profWardDept: document.getElementById('profWardDept') || document.getElementById('profStudentDept'),
  profStudentRoom: document.getElementById('profStudentRoom') || document.getElementById('profWardRoom'),
  profWardRoom: document.getElementById('profWardRoom') || document.getElementById('profStudentRoom'),
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

  // 4. Face Verification & Approval Modal
  approveModal: document.getElementById('approveModal'),
  approveRequestSummaryBox: document.getElementById('approveRequestSummaryBox'),
  faceVerifyCard: document.getElementById('faceVerifyCard'),
  faceVerifyPill: document.getElementById('faceVerifyPill'),
  faceVerifyPillText: document.getElementById('faceVerifyPillText'),
  approveFaceVideo: document.getElementById('approveFaceVideo'),
  approveFaceCanvas: document.getElementById('approveFaceCanvas'),
  approveCamOverlayBadge: document.getElementById('approveCamOverlayBadge'),
  faceDecisionBanner: document.getElementById('faceDecisionBanner'),
  faceDecisionIcon: document.getElementById('faceDecisionIcon'),
  faceDecisionTitle: document.getElementById('faceDecisionTitle'),
  faceDecisionMsg: document.getElementById('faceDecisionMsg'),
  btnTriggerFaceVerify: document.getElementById('btnTriggerFaceVerify'),

  parentMessageConsentSection: document.getElementById('parentMessageConsentSection'),
  consentVerifiedNotice: document.getElementById('consentVerifiedNotice'),
  faceConsentUnlockedIcon: document.getElementById('faceConsentUnlockedIcon'),
  faceConsentUnlockedLabel: document.getElementById('faceConsentUnlockedLabel'),
  approveParentMessage: document.getElementById('approveParentMessage'),
  modalVoiceStatusBadge: document.getElementById('modalVoiceStatusBadge'),
  modalVoiceStatusText: document.getElementById('modalVoiceStatusText'),
  btnModalLangEn: document.getElementById('btnModalLangEn'),
  btnModalLangTa: document.getElementById('btnModalLangTa'),
  btnVoiceInput: document.getElementById('btnVoiceInput'),
  voiceBtnLabel: document.getElementById('voiceBtnLabel'),
  btnConfirmApprove: document.getElementById('btnConfirmApprove'),
  btnConfirmApproveLabel: document.getElementById('btnConfirmApproveLabel'),

  // 5. Face Registration Modal
  faceRegisterModal: document.getElementById('faceRegisterModal'),
  registerFaceVideo: document.getElementById('registerFaceVideo'),
  registerFaceCanvas: document.getElementById('registerFaceCanvas'),
  registerCamOverlayBadge: document.getElementById('registerCamOverlayBadge'),
  registerStatusBanner: document.getElementById('registerStatusBanner'),
  registerStatusIcon: document.getElementById('registerStatusIcon'),
  registerStatusTitle: document.getElementById('registerStatusTitle'),
  registerStatusMsg: document.getElementById('registerStatusMsg'),
  btnCaptureAndRegisterFace: document.getElementById('btnCaptureAndRegisterFace'),
  btnCaptureRegisterLabel: document.getElementById('btnCaptureRegisterLabel'),

  // 6. Rejection Modal
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
    if (data.user.faceStatus === 'NOT_REGISTERED' || data.user.face_status === 'NOT_REGISTERED') {
      alert('Face registration is required before you can access the Parent Dashboard. Please complete your registration.');
      window.location.replace('/index.html?face_registration_required=1');
      return;
    }
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
      if (data.accessBlocked || data.faceStatus === 'NOT_REGISTERED') {
        alert('Face registration is required before accessing Parent Dashboard.');
        window.location.replace('/index.html?face_registration_required=1');
        return;
      }

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
  const faceStatus = parentObj?.faceStatus || (parentObj?.faceRegistered || parentObj?.face_registered ? 'ACTIVE' : 'NOT_REGISTERED');
  isFaceRegistered = faceStatus === 'ACTIVE';

  if (DOM.heroFaceStatus) {
    if (faceStatus === 'ACTIVE') {
      DOM.heroFaceStatus.textContent = 'ACTIVE';
      DOM.heroFaceStatus.style.background = 'rgba(16, 185, 129, 0.15)';
      DOM.heroFaceStatus.style.color = '#34d399';
      DOM.heroFaceStatus.style.borderColor = 'rgba(16, 185, 129, 0.35)';
    } else if (faceStatus === 'REVOKED') {
      DOM.heroFaceStatus.textContent = 'REVOKED';
      DOM.heroFaceStatus.style.background = 'rgba(239, 68, 68, 0.15)';
      DOM.heroFaceStatus.style.color = '#f87171';
      DOM.heroFaceStatus.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    } else {
      DOM.heroFaceStatus.textContent = 'NOT REGISTERED';
      DOM.heroFaceStatus.style.background = 'rgba(245, 158, 11, 0.15)';
      DOM.heroFaceStatus.style.color = '#fbbf24';
      DOM.heroFaceStatus.style.borderColor = 'rgba(245, 158, 11, 0.35)';
    }
  }

  if (DOM.heroFaceBtnText) {
    DOM.heroFaceBtnText.textContent = isFaceRegistered ? 'ACTIVE' : (faceStatus === 'REVOKED' ? 'REVOKED' : 'PENDING');
  }

  if (DOM.authVerifiedBadge) {
    if (faceStatus === 'ACTIVE') {
      DOM.authVerifiedBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      DOM.authVerifiedBadge.style.color = '#34d399';
      DOM.authVerifiedBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      if (DOM.authBadgeLabel) DOM.authBadgeLabel.textContent = 'AI Face Biometric Protected';
    } else if (faceStatus === 'REVOKED') {
      DOM.authVerifiedBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      DOM.authVerifiedBadge.style.color = '#f87171';
      DOM.authVerifiedBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      if (DOM.authBadgeLabel) DOM.authBadgeLabel.textContent = 'Face Biometrics Revoked by Warden';
    } else {
      DOM.authVerifiedBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      DOM.authVerifiedBadge.style.color = '#fbbf24';
      DOM.authVerifiedBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      if (DOM.authBadgeLabel) DOM.authBadgeLabel.textContent = 'Face Biometrics Pending';
    }
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
    DOM.profSecurityModel.textContent = 'AI Face Biometric Verification (128D Neural Matching, D ≤ 0.45)';
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
  if (!token) return;

  try {
    const res = await fetch('/api/parent/outpass/pending', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      pendingList = data.pendingRequests || [];
      const normalList = (data.normalRequests || pendingList.filter(r => getCanonicalOutpassType(r) === 'normal'))
        .filter(r => getCanonicalOutpassType(r) === 'normal');
      const dutyList = (data.dutyRequests || pendingList.filter(r => getCanonicalOutpassType(r) === 'one_day_duty'))
        .filter(r => getCanonicalOutpassType(r) === 'one_day_duty');
      const specialList = (data.specialRequests || pendingList.filter(r => getCanonicalOutpassType(r) === 'special'))
        .filter(r => getCanonicalOutpassType(r) === 'special');

      renderPendingNormalQueue(normalList);
      renderPendingDutyQueue(dutyList);
      renderPendingSpecialQueue(specialList);

      if (DOM.badgePendingNormal) DOM.badgePendingNormal.textContent = normalList.length;
      if (DOM.badgePendingDuty) DOM.badgePendingDuty.textContent = dutyList.length;
      if (DOM.badgePendingSpecial) DOM.badgePendingSpecial.textContent = specialList.length;
      if (DOM.navBadgePending) {
        const total = normalList.length + dutyList.length + specialList.length;
        DOM.navBadgePending.textContent = total;
        DOM.navBadgePending.style.display = total > 0 ? 'inline-block' : 'none';
      }
      if (DOM.statPendingCount) {
        DOM.statPendingCount.textContent = normalList.length + dutyList.length + specialList.length;
      }
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

/**
 * Legacy router delegating to type-specific renderers
 */
function renderPendingQueue(list) {
  const normalList = (list || []).filter(r => getCanonicalOutpassType(r) === 'normal');
  const dutyList = (list || []).filter(r => getCanonicalOutpassType(r) === 'one_day_duty');
  const specialList = (list || []).filter(r => getCanonicalOutpassType(r) === 'special');
  renderPendingNormalQueue(normalList);
  renderPendingDutyQueue(dutyList);
  renderPendingSpecialQueue(specialList);
}

/**
 * Renders ONLY canonical 'normal' outpasses awaiting parent biometric consent
 */
function renderPendingNormalQueue(list) {
  if (!DOM.pendingNormalContainer) return;
  DOM.pendingNormalContainer.innerHTML = '';

  const normalList = (list || []).filter(r => getCanonicalOutpassType(r) === 'normal');

  if (normalList.length === 0) {
    DOM.pendingNormalContainer.innerHTML = `
      <div class="empty-state-card" style="grid-column: 1 / -1; text-align:center; padding:2.5rem 1.5rem; background:var(--bg-card); border:1px dashed var(--border-color); border-radius:var(--radius-lg);">
        <div style="width:48px; height:48px; border-radius:50%; background:rgba(245,158,11,0.12); color:#f59e0b; display:inline-flex; align-items:center; justify-content:center; margin-bottom:0.75rem;">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <h4 style="font-family:'Outfit'; font-size:1.1rem; margin-bottom:0.25rem; color:var(--text-primary);">No Pending Normal Outpasses</h4>
        <p style="color:var(--text-secondary); font-size:0.84rem; max-width:400px; margin:0 auto;">
          Normal outpass requests submitted by your ward will appear here for 128D facial biometric consent.
        </p>
      </div>
    `;
    return;
  }

  normalList.forEach(req => {
    const card = document.createElement('div');
    card.className = 'duty-card';
    card.id = `parent-req-card-${req.id}`;
    card.style.borderLeftColor = '#f59e0b';

    card.innerHTML = `
      <div class="duty-card-header">
        <div>
          <div class="student-tag-group">
            <span class="request-code-badge">${req.requestCode}</span>
            <span class="event-banner-tag" style="background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.35);">
              🏠 Normal Outpass
            </span>
            <span class="student-tag">Student: <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})</span>
            <span class="student-tag">${req.studentDept} • Room: ${req.studentBlock}-${req.studentRoom}</span>
          </div>
          <h3 style="font-family:'Outfit'; font-size:1.2rem; margin-top:0.4rem; color:var(--text-primary);">
            ${escapeHtml(req.destination)}
          </h3>
        </div>
        <span class="status-badge status-pending-parent">
          Pending Parent Consent
        </span>
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
          <span>Verify Face & Approve</span>
        </button>
      </div>
    `;

    DOM.pendingNormalContainer.appendChild(card);
  });
}

/**
 * Renders ONLY canonical 'special' outpasses awaiting initial parent biometric consent
 */
function renderPendingSpecialQueue(list) {
  if (!DOM.pendingSpecialContainer) return;
  DOM.pendingSpecialContainer.innerHTML = '';

  const specialList = (list || []).filter(r => getCanonicalOutpassType(r) === 'special');

  if (specialList.length === 0) {
    DOM.pendingSpecialContainer.innerHTML = `
      <div class="empty-state-card" style="grid-column: 1 / -1; text-align:center; padding:2.5rem 1.5rem; background:var(--bg-card); border:1px dashed var(--border-color); border-radius:var(--radius-lg);">
        <div style="width:48px; height:48px; border-radius:50%; background:rgba(139,92,246,0.12); color:#a78bfa; display:inline-flex; align-items:center; justify-content:center; margin-bottom:0.75rem;">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </div>
        <h4 style="font-family:'Outfit'; font-size:1.1rem; margin-bottom:0.25rem; color:var(--text-primary);">No Pending Special Outpasses</h4>
        <p style="color:var(--text-secondary); font-size:0.84rem; max-width:400px; margin:0 auto;">
          Special multi-day / academic outpass requests will appear here for your Tier 1 biometric authorization.
        </p>
      </div>
    `;
    return;
  }

  specialList.forEach(req => {
    const card = document.createElement('div');
    card.className = 'duty-card';
    card.id = `parent-req-card-${req.id}`;
    card.style.borderLeftColor = '#8b5cf6';
    card.style.background = 'rgba(139,92,246,0.02)';

    card.innerHTML = `
      <div class="duty-card-header">
        <div>
          <div class="student-tag-group">
            <span class="request-code-badge" style="background:rgba(139,92,246,0.2); color:#a78bfa; border-color:rgba(139,92,246,0.4);">${req.requestCode}</span>
            <span class="event-banner-tag" style="background:rgba(139,92,246,0.2); color:#a78bfa; border:1px solid rgba(139,92,246,0.5); font-weight:700;">
              ⭐ Special Outpass (Tier 1 Consent)
            </span>
            <span class="student-tag">Student: <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})</span>
            <span class="student-tag">${req.studentDept} • Room: ${req.studentBlock}-${req.studentRoom}</span>
          </div>
          <h3 style="font-family:'Outfit'; font-size:1.2rem; margin-top:0.4rem; color:var(--text-primary);">
            ${escapeHtml(req.destination)}
          </h3>
        </div>
        <span class="status-badge" style="background:rgba(139,92,246,0.2); color:#a78bfa; border:1px solid #8b5cf6; font-weight:700;">
          Tier 1: Parent Consent Needed
        </span>
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
        <div class="detail-item" style="grid-column: 1 / -1; background:rgba(139,92,246,0.08); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid rgba(139,92,246,0.25);">
          <div style="color:#a78bfa; font-weight:700; font-size:0.82rem; margin-bottom:0.25rem;">⭐ 4-TIER MULTI-DAY EVENT DETAILS</div>
          ${req.additionalRemarks ? `<div style="font-size:0.85rem; color:var(--text-primary);"><strong>Justification:</strong> ${escapeHtml(req.additionalRemarks)}</div>` : ''}
          ${req.attachmentUrl ? `<div style="font-size:0.85rem; margin-top:0.2rem;"><a href="${escapeHtml(req.attachmentUrl)}" target="_blank" style="color:#60a5fa; text-decoration:underline;">View Attachment / Proof Link ↗</a></div>` : ''}
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.35rem;">
            Workflow after your consent: Class Advisor → Principal → Warden (Final QR).
          </div>
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
        <button class="btn-approve" onclick="openApproveModal(${req.id})" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 11c0 2-1 3-2 3s-2-1-2-3a4 4 0 0 1 8 0c0 3-1.5 5-2.5 7"></path></svg>
          <span>Verify Face & Approve Special</span>
        </button>
      </div>
    `;

    DOM.pendingSpecialContainer.appendChild(card);
  });
}

/**
 * Renders ONLY canonical 'one_day_duty' outpasses awaiting parent biometric consent
 */
function renderPendingDutyQueue(list) {
  if (!DOM.pendingDutyContainer) return;
  DOM.pendingDutyContainer.innerHTML = '';

  const dutyList = (list || []).filter(r => getCanonicalOutpassType(r) === 'one_day_duty');

  if (dutyList.length === 0) {
    DOM.pendingDutyContainer.innerHTML = `
      <div class="empty-state-card" style="grid-column: 1 / -1; text-align:center; padding:2.5rem 1.5rem; background:var(--bg-card); border:1px dashed var(--border-color); border-radius:var(--radius-lg);">
        <div style="width:48px; height:48px; border-radius:50%; background:rgba(56,189,248,0.12); color:#38bdf8; display:inline-flex; align-items:center; justify-content:center; margin-bottom:0.75rem;">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><polygon points="12 8 8 12 12 16 12 8"></polygon></svg>
        </div>
        <h4 style="font-family:'Outfit'; font-size:1.1rem; margin-bottom:0.25rem; color:var(--text-primary);">No Pending One-Day Duty Passes</h4>
        <p style="color:var(--text-secondary); font-size:0.84rem; max-width:400px; margin:0 auto;">
          Academic and duty pass requests submitted by your ward will appear here for your biometric consent before Class Advisor review.
        </p>
      </div>
    `;
    return;
  }

  dutyList.forEach(req => {
    const card = document.createElement('div');
    card.className = 'duty-card';
    card.id = `parent-req-card-${req.id}`;
    card.style.borderLeftColor = '#38bdf8';
    card.style.background = 'rgba(56,189,248,0.02)';

    card.innerHTML = `
      <div class="duty-card-header">
        <div>
          <div class="student-tag-group">
            <span class="request-code-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8; border-color:rgba(56,189,248,0.4);">${req.requestCode}</span>
            <span class="event-banner-tag" style="background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid rgba(56,189,248,0.5); font-weight:700;">
              🎯 One-Day Duty Pass
            </span>
            <span class="student-tag">Student: <strong>${escapeHtml(req.studentName)}</strong> (${req.studentRegNo})</span>
            <span class="student-tag">${req.studentDept} • Room: ${req.studentBlock}-${req.studentRoom}</span>
          </div>
          <h3 style="font-family:'Outfit'; font-size:1.2rem; margin-top:0.4rem; color:var(--text-primary);">
            ${escapeHtml(req.destination)}
          </h3>
        </div>
        <span class="status-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid #38bdf8; font-weight:700;">
          Parent Consent Needed
        </span>
      </div>

      <div class="request-details-grid">
        <div class="detail-item">
          <span class="detail-label">Purpose / Event</span>
          <span class="detail-value">${escapeHtml(req.eventName || req.purpose)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Event Location</span>
          <span class="detail-value">${escapeHtml(req.eventLocation || req.destination)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Leaving Schedule</span>
          <span class="detail-value">${formatDateTime(req.leavingDatetime)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Expected Return</span>
          <span class="detail-value">${formatDateTime(req.returnDatetime)}</span>
        </div>
        <div class="detail-item" style="grid-column: 1 / -1; background:rgba(56,189,248,0.08); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid rgba(56,189,248,0.25);">
          <div style="color:#38bdf8; font-weight:700; font-size:0.82rem; margin-bottom:0.25rem;">🎯 ONE-DAY DUTY WORKFLOW</div>
          ${req.dutyDescription ? `<div style="font-size:0.85rem; color:var(--text-primary);"><strong>Description:</strong> ${escapeHtml(req.dutyDescription)}</div>` : ''}
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.35rem;">
            Workflow after your consent: Class Advisor → Principal (Final QR). Warden is not involved.
          </div>
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
        <button class="btn-approve" onclick="openApproveModal(${req.id})" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 11c0 2-1 3-2 3s-2-1-2-3a4 4 0 0 1 8 0c0 3-1.5 5-2.5 7"></path></svg>
          <span>Verify Face & Approve Duty</span>
        </button>
      </div>
    `;

    DOM.pendingDutyContainer.appendChild(card);
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
   6. AI FACE BIOMETRIC VERIFICATION & ENROLLMENT FLOW
   ========================================================== */

/**
 * Loads face-api.js neural network models from /models
 */
async function loadFaceApiModels() {
  if (faceApiModelsLoaded) return true;
  if (typeof faceapi === 'undefined') {
    faceApiLoadError = 'face-api.js library not loaded in document';
    console.error('[Face-API]', faceApiLoadError);
    return false;
  }

  const MODEL_URL = '/models';

  try {
    console.log('[Face-API] Loading SSD MobileNet v1 face detection model from', MODEL_URL);
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    console.log('[Face-API] SSD MobileNet v1 model loaded successfully.');
  } catch (err) {
    faceApiLoadError = 'Failed to load SSD MobileNet v1 model: ' + (err.message || err);
    console.error('[Face-API]', faceApiLoadError, err);
    return false;
  }

  try {
    console.log('[Face-API] Loading 68-Point Face Landmark model from', MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    console.log('[Face-API] Face Landmark 68 model loaded successfully.');
  } catch (err) {
    faceApiLoadError = 'Failed to load Face Landmark 68 model: ' + (err.message || err);
    console.error('[Face-API]', faceApiLoadError, err);
    return false;
  }

  try {
    console.log('[Face-API] Loading Face Recognition (128D embedding) model from', MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    console.log('[Face-API] Face Recognition Net model loaded successfully.');
  } catch (err) {
    faceApiLoadError = 'Failed to load Face Recognition Net model: ' + (err.message || err);
    console.error('[Face-API]', faceApiLoadError, err);
    return false;
  }

  faceApiModelsLoaded = true;
  faceApiLoadError = null;
  console.log('[Face-API] All 3 neural models (SSD MobileNet v1, Landmark 68, Face Recognition Net) loaded successfully.');
  return true;
}

/**
 * Starts camera on a given HTMLVideoElement
 */
async function startCamera(videoElement) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera access is not supported by your browser.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user'
    },
    audio: false
  });
  if (videoElement) {
    videoElement.srcObject = stream;
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve();
      };
    });
  }
  return stream;
}

/**
 * Stops camera tracks and clears video source
 */
function stopCamera(stream, videoElement) {
  if (stream) {
    try {
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {}
  }
  if (videoElement) {
    videoElement.srcObject = null;
  }
}

/**
 * Checks parent face registration status from backend
 */
async function checkParentFaceRegistrationStatus() {
  const token = getAuthToken();
  if (!token) return { isRegistered: false, faceStatus: 'NOT_REGISTERED' };

  try {
    const res = await fetch('/api/parent/face/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const faceStatus = data.faceStatus || (data.faceRegistered ? 'ACTIVE' : 'NOT_REGISTERED');
    isFaceRegistered = faceStatus === 'ACTIVE';

    if (DOM.heroFaceStatus) {
      if (faceStatus === 'ACTIVE') {
        DOM.heroFaceStatus.textContent = 'ACTIVE';
        DOM.heroFaceStatus.style.background = 'rgba(16, 185, 129, 0.15)';
        DOM.heroFaceStatus.style.color = '#34d399';
        DOM.heroFaceStatus.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      } else if (faceStatus === 'REVOKED') {
        DOM.heroFaceStatus.textContent = 'REVOKED';
        DOM.heroFaceStatus.style.background = 'rgba(239, 68, 68, 0.15)';
        DOM.heroFaceStatus.style.color = '#f87171';
        DOM.heroFaceStatus.style.borderColor = 'rgba(239, 68, 68, 0.35)';
      } else {
        DOM.heroFaceStatus.textContent = 'NOT REGISTERED';
        DOM.heroFaceStatus.style.background = 'rgba(245, 158, 11, 0.15)';
        DOM.heroFaceStatus.style.color = '#fbbf24';
        DOM.heroFaceStatus.style.borderColor = 'rgba(245, 158, 11, 0.35)';
      }
    }

    if (DOM.heroFaceBtnText) {
      DOM.heroFaceBtnText.textContent = isFaceRegistered ? 'ACTIVE' : (faceStatus === 'REVOKED' ? 'REVOKED' : 'PENDING');
    }

    return { isRegistered: isFaceRegistered, faceStatus, registeredAt: data.registeredAt };
  } catch (err) {
    console.error('Error checking face status:', err);
    return { isRegistered: false, faceStatus: 'NOT_REGISTERED' };
  }
}

/**
 * Opens Face Registration Modal and starts camera loop
 */
async function openFaceRegisterModal() {
  openModal('faceRegisterModal');
  if (DOM.registerStatusBanner) {
    setRegisterBannerState('READY', 'Position your face in the oval guide and look directly at the camera.');
  }
  if (DOM.btnCaptureAndRegisterFace) {
    DOM.btnCaptureAndRegisterFace.disabled = true;
  }

  const loaded = await loadFaceApiModels();
  if (!loaded) {
    setRegisterBannerState('ERROR', faceApiLoadError || 'Unable to load Face AI models. Check your network or models directory.');
    return;
  }

  try {
    registerVideoStream = await startCamera(DOM.registerFaceVideo);
    if (DOM.btnCaptureAndRegisterFace) {
      DOM.btnCaptureAndRegisterFace.disabled = false;
    }
    startDetectionPreview(DOM.registerFaceVideo, DOM.registerFaceCanvas, (hasFace) => {
      if (DOM.registerCamOverlayBadge) {
        DOM.registerCamOverlayBadge.textContent = hasFace ? 'Face Detected' : 'Aligning Face...';
        DOM.registerCamOverlayBadge.style.background = hasFace ? 'rgba(16,185,129,0.85)' : 'rgba(0,0,0,0.6)';
      }
    });
  } catch (err) {
    console.error('Register Camera Error:', err);
    setRegisterBannerState('ERROR', 'Camera error: ' + (err.message || 'Permission denied'));
  }
}

/**
 * Closes Face Registration Modal and cleans up
 */
function closeFaceRegisterModal() {
  if (registerDetectionInterval) {
    clearInterval(registerDetectionInterval);
    registerDetectionInterval = null;
  }
  stopCamera(registerVideoStream, DOM.registerFaceVideo);
  registerVideoStream = null;
  if (DOM.registerFaceCanvas) {
    const ctx = DOM.registerFaceCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, DOM.registerFaceCanvas.width, DOM.registerFaceCanvas.height);
  }
  closeModal('faceRegisterModal');
}

/**
 * Real-time canvas overlay preview for face bounding box
 */
function startDetectionPreview(videoElement, canvasElement, onFaceDetected) {
  if (!videoElement || !canvasElement || typeof faceapi === 'undefined') return;

  const displaySize = { width: videoElement.videoWidth || 640, height: videoElement.videoHeight || 480 };
  faceapi.matchDimensions(canvasElement, displaySize);

  const intervalId = setInterval(async () => {
    if (!videoElement.srcObject || videoElement.paused || videoElement.ended) return;
    try {
      const detection = await faceapi.detectSingleFace(videoElement).withFaceLandmarks();
      const ctx = canvasElement.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

      if (detection) {
        const resized = faceapi.resizeResults(detection, displaySize);
        faceapi.draw.drawDetections(canvasElement, resized);
        if (onFaceDetected) onFaceDetected(true);
      } else {
        if (onFaceDetected) onFaceDetected(false);
      }
    } catch (e) {}
  }, 250);

  if (videoElement === DOM.registerFaceVideo) {
    registerDetectionInterval = intervalId;
  } else {
    verifyDetectionInterval = intervalId;
  }
}

function setRegisterBannerState(state, message) {
  if (!DOM.registerStatusBanner) return;
  DOM.registerStatusBanner.className = 'face-decision-banner';
  if (state === 'SUCCESS') {
    DOM.registerStatusBanner.style.background = 'rgba(16, 185, 129, 0.15)';
    DOM.registerStatusBanner.style.borderColor = 'rgba(16, 185, 129, 0.35)';
    DOM.registerStatusBanner.style.color = '#34d399';
    if (DOM.registerStatusTitle) DOM.registerStatusTitle.textContent = 'Registration Successful';
    if (DOM.registerStatusIcon) DOM.registerStatusIcon.textContent = '✅';
  } else if (state === 'ERROR') {
    DOM.registerStatusBanner.style.background = 'rgba(239, 68, 68, 0.15)';
    DOM.registerStatusBanner.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    DOM.registerStatusBanner.style.color = '#f87171';
    if (DOM.registerStatusTitle) DOM.registerStatusTitle.textContent = 'Registration Error';
    if (DOM.registerStatusIcon) DOM.registerStatusIcon.textContent = '⚠️';
  } else if (state === 'PROCESSING') {
    DOM.registerStatusBanner.style.background = 'rgba(59, 130, 246, 0.15)';
    DOM.registerStatusBanner.style.borderColor = 'rgba(59, 130, 246, 0.35)';
    DOM.registerStatusBanner.style.color = '#60a5fa';
    if (DOM.registerStatusTitle) DOM.registerStatusTitle.textContent = 'Processing Biometric Enrollment...';
    if (DOM.registerStatusIcon) DOM.registerStatusIcon.textContent = '⏳';
  } else {
    DOM.registerStatusBanner.style.background = 'rgba(59, 130, 246, 0.15)';
    DOM.registerStatusBanner.style.borderColor = 'rgba(59, 130, 246, 0.35)';
    DOM.registerStatusBanner.style.color = '#60a5fa';
    if (DOM.registerStatusTitle) DOM.registerStatusTitle.textContent = 'Face Biometric Enrollment';
    if (DOM.registerStatusIcon) DOM.registerStatusIcon.textContent = '📷';
  }
  if (DOM.registerStatusMsg) DOM.registerStatusMsg.textContent = message;
}

/**
 * Captures live face descriptor from register video and enrolls parent face
 */
async function captureAndRegisterFace() {
  const token = getAuthToken();
  if (!token) return;

  if (DOM.btnCaptureAndRegisterFace) {
    DOM.btnCaptureAndRegisterFace.disabled = true;
    if (DOM.btnCaptureRegisterLabel) DOM.btnCaptureRegisterLabel.textContent = 'Extracting 128D Embeddings...';
  }
  setRegisterBannerState('PROCESSING', 'Analyzing face structure and generating 128D neural descriptor...');

  try {
    const detection = await faceapi.detectSingleFace(DOM.registerFaceVideo).withFaceLandmarks().withFaceDescriptor();
    if (!detection || !detection.descriptor) {
      setRegisterBannerState('ERROR', 'No clear face detected. Please ensure good lighting and face the camera directly.');
      if (DOM.btnCaptureAndRegisterFace) {
        DOM.btnCaptureAndRegisterFace.disabled = false;
        if (DOM.btnCaptureRegisterLabel) DOM.btnCaptureRegisterLabel.textContent = 'Capture & Register Face';
      }
      return;
    }

    const descriptorArray = Array.from(detection.descriptor);
    const res = await fetch('/api/parent/face/register', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ faceDescriptor: descriptorArray, singleFace: true })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      setRegisterBannerState('SUCCESS', 'Face biometrics enrolled successfully! You can now authenticate outpass approvals.');
      showToast('🎉 Face biometrics enrolled successfully!', 'success');
      isFaceRegistered = true;
      if (currentParent) currentParent.faceStatus = 'ACTIVE';
      await checkParentFaceRegistrationStatus();
      setTimeout(async () => {
        closeFaceRegisterModal();
        if (selectedRequestForAction) {
          await openApproveModal(selectedRequestForAction);
        }
      }, 1500);
    } else {
      setRegisterBannerState('ERROR', data.message || 'Face enrollment failed. Please try again.');
      if (DOM.btnCaptureAndRegisterFace) {
        DOM.btnCaptureAndRegisterFace.disabled = false;
        if (DOM.btnCaptureRegisterLabel) DOM.btnCaptureRegisterLabel.textContent = 'Try Again';
      }
    }
  } catch (err) {
    console.error('Enrollment error:', err);
    setRegisterBannerState('ERROR', 'Enrollment error: ' + err.message);
    if (DOM.btnCaptureAndRegisterFace) {
      DOM.btnCaptureAndRegisterFace.disabled = false;
      if (DOM.btnCaptureRegisterLabel) DOM.btnCaptureRegisterLabel.textContent = 'Capture & Register Face';
    }
  }
}

/**
 * UI State helper for Approve Modal verification banner
 */
function setFaceVerificationUiState(state, meta = {}) {
  if (!DOM.faceDecisionBanner) return;
  DOM.faceDecisionBanner.className = 'face-decision-banner';

  if (state === 'REVOKED') {
    DOM.faceDecisionBanner.classList.add('blocked');
    DOM.faceDecisionBanner.style.background = 'rgba(239, 68, 68, 0.15)';
    DOM.faceDecisionBanner.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    DOM.faceDecisionBanner.style.color = '#f87171';
    if (DOM.faceDecisionTitle) DOM.faceDecisionTitle.textContent = 'Face Registration Revoked';
    if (DOM.faceDecisionMsg) {
      DOM.faceDecisionMsg.innerHTML = `
        <div style="margin-bottom:0.75rem; color:#fca5a5; font-size:0.88rem; line-height:1.4;">
          Face registration is required before you can approve this outpass. Your previous registration was revoked by the Warden.
        </div>
        <button type="button" class="primary-btn" onclick="openFaceRegisterModal()" style="padding:0.5rem 1.1rem; font-size:0.85rem; font-weight:700; background:linear-gradient(135deg, #0d9488 0%, #06b6d4 100%); color:#fff; border:none; border-radius:6px; cursor:pointer;">
          Start Face Registration
        </button>
      `;
    }
    if (DOM.faceDecisionIcon) DOM.faceDecisionIcon.textContent = '⚠️';
    if (DOM.btnTriggerFaceVerify) DOM.btnTriggerFaceVerify.disabled = true;
  } else if (state === 'NOT_ENROLLED') {
    DOM.faceDecisionBanner.classList.add('blocked');
    DOM.faceDecisionBanner.style.background = 'rgba(239, 68, 68, 0.15)';
    DOM.faceDecisionBanner.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    DOM.faceDecisionBanner.style.color = '#f87171';
    if (DOM.faceDecisionTitle) DOM.faceDecisionTitle.textContent = 'Face Not Enrolled';
    if (DOM.faceDecisionMsg) DOM.faceDecisionMsg.innerHTML = 'You must enroll your face biometrics before approving outpass requests. <a href="#" onclick="openFaceRegisterModal(); return false;" style="color:#fbbf24; text-decoration:underline; font-weight:bold;">Enroll Face Now</a>';
    if (DOM.faceDecisionIcon) DOM.faceDecisionIcon.textContent = '⚠️';
    if (DOM.btnTriggerFaceVerify) DOM.btnTriggerFaceVerify.disabled = true;
  } else if (state === 'SCANNING') {
    DOM.faceDecisionBanner.style.background = 'rgba(59, 130, 246, 0.15)';
    DOM.faceDecisionBanner.style.borderColor = 'rgba(59, 130, 246, 0.35)';
    DOM.faceDecisionBanner.style.color = '#60a5fa';
    if (DOM.faceDecisionTitle) DOM.faceDecisionTitle.textContent = 'Scanning Face...';
    if (DOM.faceDecisionMsg) DOM.faceDecisionMsg.textContent = 'Comparing your live camera feed against your enrolled biometric vector.';
    if (DOM.faceDecisionIcon) DOM.faceDecisionIcon.textContent = '🔍';
  } else if (state === 'VERIFIED') {
    DOM.faceDecisionBanner.classList.remove('blocked');
    DOM.faceDecisionBanner.style.background = 'rgba(16, 185, 129, 0.15)';
    DOM.faceDecisionBanner.style.borderColor = 'rgba(16, 185, 129, 0.35)';
    DOM.faceDecisionBanner.style.color = '#34d399';
    const distText = meta.distance !== undefined ? ` (Confidence: ${Math.max(0, Math.round((1 - meta.distance) * 100))}%, Euclidean D: ${meta.distance.toFixed(3)})` : '';
    if (DOM.faceDecisionTitle) DOM.faceDecisionTitle.textContent = 'Biometric Identity Verified';
    if (DOM.faceDecisionMsg) DOM.faceDecisionMsg.textContent = `Server successfully confirmed parent identity match${distText}. You may now approve this outpass.`;
    if (DOM.faceDecisionIcon) DOM.faceDecisionIcon.textContent = '🛡️';

    // Unlock consent section and parent message
    if (DOM.parentMessageConsentSection) {
      DOM.parentMessageConsentSection.classList.remove('hidden');
    }
    if (DOM.consentVerifiedNotice) {
      DOM.consentVerifiedNotice.style.background = 'rgba(16, 185, 129, 0.15)';
      DOM.consentVerifiedNotice.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      DOM.consentVerifiedNotice.style.color = '#34d399';
    }
    if (DOM.faceConsentUnlockedIcon) DOM.faceConsentUnlockedIcon.textContent = '✓';
    if (DOM.faceConsentUnlockedLabel) {
      DOM.faceConsentUnlockedLabel.textContent = 'Identity Verified via 128D Face Biometrics';
    }
    if (DOM.approveParentMessage) {
      DOM.approveParentMessage.disabled = false;
      DOM.approveParentMessage.style.opacity = '1';
      DOM.approveParentMessage.style.cursor = 'text';
      DOM.approveParentMessage.placeholder = 'Type approval message or special note for Warden (required)...';
      DOM.approveParentMessage.focus();
    }
    if (DOM.btnConfirmApprove) {
      const hasMsg = !!(DOM.approveParentMessage && DOM.approveParentMessage.value.trim());
      DOM.btnConfirmApprove.disabled = !hasMsg;
      DOM.btnConfirmApprove.style.opacity = hasMsg ? '1.0' : '0.5';
      DOM.btnConfirmApprove.style.cursor = hasMsg ? 'pointer' : 'not-allowed';
    }
    if (DOM.btnConfirmApproveLabel) {
      const hasMsg = !!(DOM.approveParentMessage && DOM.approveParentMessage.value.trim());
      DOM.btnConfirmApproveLabel.textContent = hasMsg ? 'Approve & Forward to Warden →' : 'Enter Message to Approve';
    }
    if (DOM.btnTriggerFaceVerify) {
      DOM.btnTriggerFaceVerify.disabled = true;
      DOM.btnTriggerFaceVerify.textContent = '✅ Verified Successfully';
      DOM.btnTriggerFaceVerify.style.background = '#10b981';
    }
  } else if (state === 'MISMATCH') {
    DOM.faceDecisionBanner.classList.add('blocked');
    DOM.faceDecisionBanner.style.background = 'rgba(239, 68, 68, 0.15)';
    DOM.faceDecisionBanner.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    DOM.faceDecisionBanner.style.color = '#f87171';
    const distText = meta.distance !== undefined ? ` (Euclidean Distance: ${meta.distance.toFixed(3)} > 0.45 threshold)` : '';
    if (DOM.faceDecisionTitle) DOM.faceDecisionTitle.textContent = 'Biometric Mismatch';
    if (DOM.faceDecisionMsg) DOM.faceDecisionMsg.textContent = `Face did not match the enrolled parent profile${distText}. Please ensure proper lighting and face the camera directly.`;
    if (DOM.faceDecisionIcon) DOM.faceDecisionIcon.textContent = '❌';
    if (DOM.btnTriggerFaceVerify) DOM.btnTriggerFaceVerify.disabled = false;
  } else if (state === 'NO_FACE') {
    DOM.faceDecisionBanner.classList.add('blocked');
    DOM.faceDecisionBanner.style.background = 'rgba(239, 68, 68, 0.15)';
    DOM.faceDecisionBanner.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    DOM.faceDecisionBanner.style.color = '#f87171';
    if (DOM.faceDecisionTitle) DOM.faceDecisionTitle.textContent = 'No Face Detected';
    if (DOM.faceDecisionMsg) DOM.faceDecisionMsg.textContent = 'No face was detected in camera view. Please position yourself directly in front of the camera.';
    if (DOM.faceDecisionIcon) DOM.faceDecisionIcon.textContent = '👤';
    if (DOM.btnTriggerFaceVerify) DOM.btnTriggerFaceVerify.disabled = false;
  } else if (state === 'ERROR') {
    DOM.faceDecisionBanner.classList.add('blocked');
    DOM.faceDecisionBanner.style.background = 'rgba(239, 68, 68, 0.15)';
    DOM.faceDecisionBanner.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    DOM.faceDecisionBanner.style.color = '#f87171';
    if (DOM.faceDecisionTitle) DOM.faceDecisionTitle.textContent = 'Camera / Verification Error';
    if (DOM.faceDecisionMsg) DOM.faceDecisionMsg.textContent = meta.message || 'An error occurred during biometric verification.';
    if (DOM.faceDecisionIcon) DOM.faceDecisionIcon.textContent = '⚠️';
    if (DOM.btnTriggerFaceVerify) DOM.btnTriggerFaceVerify.disabled = false;
  } else {
    DOM.faceDecisionBanner.style.background = 'rgba(59, 130, 246, 0.15)';
    DOM.faceDecisionBanner.style.borderColor = 'rgba(59, 130, 246, 0.35)';
    DOM.faceDecisionBanner.style.color = '#60a5fa';
    if (DOM.faceDecisionTitle) DOM.faceDecisionTitle.textContent = 'Ready for Biometric Verification';
    if (DOM.faceDecisionMsg) DOM.faceDecisionMsg.textContent = 'Position your face in the oval guide and click "Verify My Face".';
    if (DOM.faceDecisionIcon) DOM.faceDecisionIcon.textContent = '📷';
  }
}

/**
 * Opens approve modal, starts camera stream, and prepares for face verification
 */
async function openApproveModal(requestId) {
  selectedRequestForAction = requestId;
  isFaceVerified = false;
  activeVerificationToken = null;
  liveFaceDescriptor = null;

  const req = pendingList.find(r => r.id === requestId);
  if (!req) return;

  // 1. Populate Outpass Summary Box
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

  // 2. Reset Consent Section State
  if (DOM.parentMessageConsentSection) {
    DOM.parentMessageConsentSection.classList.remove('hidden');
  }
  if (DOM.consentVerifiedNotice) {
    DOM.consentVerifiedNotice.style.background = 'rgba(239, 68, 68, 0.12)';
    DOM.consentVerifiedNotice.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    DOM.consentVerifiedNotice.style.color = '#f87171';
  }
  if (DOM.faceConsentUnlockedIcon) {
    DOM.faceConsentUnlockedIcon.textContent = '✕';
  }
  if (DOM.faceConsentUnlockedLabel) {
    DOM.faceConsentUnlockedLabel.textContent = 'Biometric verification required before consent approval.';
  }
  if (DOM.approveParentMessage) {
    DOM.approveParentMessage.value = '';
    DOM.approveParentMessage.disabled = true;
    DOM.approveParentMessage.style.opacity = '0.6';
    DOM.approveParentMessage.style.cursor = 'not-allowed';
    DOM.approveParentMessage.placeholder = 'Parent message input will unlock once your face is verified...';
  }
  if (DOM.btnConfirmApprove) {
    DOM.btnConfirmApprove.disabled = true;
    DOM.btnConfirmApprove.style.opacity = '0.5';
    DOM.btnConfirmApprove.style.cursor = 'not-allowed';
  }
  if (DOM.btnConfirmApproveLabel) {
    DOM.btnConfirmApproveLabel.textContent = 'Approval Disabled (Face Unverified)';
  }
  if (DOM.btnTriggerFaceVerify) {
    DOM.btnTriggerFaceVerify.disabled = false;
    DOM.btnTriggerFaceVerify.textContent = 'Verify My Face';
    DOM.btnTriggerFaceVerify.style.background = '';
  }

  // 3. Reset Modal Voice Assistant State
  setModalVoiceLang('en-IN');
  updateModalVoiceStatus('idle');

  openModal('approveModal');

  // Check enrollment & revocation status
  const status = await checkParentFaceRegistrationStatus();
  if (status.faceStatus === 'REVOKED') {
    setFaceVerificationUiState('REVOKED');
    return;
  }
  if (!status.isRegistered || status.faceStatus === 'NOT_REGISTERED') {
    setFaceVerificationUiState('NOT_ENROLLED');
    return;
  }

  setFaceVerificationUiState('READY');

  // Load models & start camera
  const loaded = await loadFaceApiModels();
  if (!loaded) {
    setFaceVerificationUiState('ERROR', { message: faceApiLoadError || 'Failed to load face detection neural models.' });
    return;
  }

  try {
    verifyVideoStream = await startCamera(DOM.approveFaceVideo);
    startDetectionPreview(DOM.approveFaceVideo, DOM.approveFaceCanvas, (hasFace) => {
      if (DOM.approveCamOverlayBadge) {
        DOM.approveCamOverlayBadge.textContent = hasFace ? 'Face In Frame' : 'Aligning Face...';
        DOM.approveCamOverlayBadge.style.background = hasFace ? 'rgba(16,185,129,0.85)' : 'rgba(0,0,0,0.6)';
      }
    });
  } catch (err) {
    console.error('Approve Camera Error:', err);
    setFaceVerificationUiState('ERROR', { message: 'Camera access denied or unavailable: ' + err.message });
  }
}

/**
 * Triggers server-side face verification for the outpass approval
 */
async function verifyParentFaceForOutpass() {
  const token = getAuthToken();
  if (!token || !selectedRequestForAction) return;

  if (!DOM.approveFaceVideo || !DOM.approveFaceVideo.srcObject) {
    showToast('Camera is not active. Please allow camera permissions.', 'error');
    return;
  }

  if (DOM.btnTriggerFaceVerify) {
    DOM.btnTriggerFaceVerify.disabled = true;
    DOM.btnTriggerFaceVerify.textContent = 'Extracting Live Biometrics...';
  }
  setFaceVerificationUiState('SCANNING');

  try {
    const detection = await faceapi.detectSingleFace(DOM.approveFaceVideo).withFaceLandmarks().withFaceDescriptor();
    if (!detection || !detection.descriptor) {
      setFaceVerificationUiState('NO_FACE');
      return;
    }

    const descriptorArray = Array.from(detection.descriptor);
    if (DOM.btnTriggerFaceVerify) {
      DOM.btnTriggerFaceVerify.textContent = 'Verifying with Server...';
    }

    const res = await fetch(`/api/parent/outpass/${selectedRequestForAction}/face-verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ faceDescriptor: descriptorArray, singleFace: true })
    });

    const data = await res.json();
    if (res.ok && data.success && data.faceVerified) {
      isFaceVerified = true;
      activeVerificationToken = data.verificationToken;
      liveFaceDescriptor = descriptorArray;
      setFaceVerificationUiState('VERIFIED', { distance: data.distance });
      showToast('✅ Face verified! You may now enter your message and approve.', 'success');
    } else {
      isFaceVerified = false;
      activeVerificationToken = null;
      liveFaceDescriptor = null;
      setFaceVerificationUiState('MISMATCH', { distance: data.distance });
      showToast(data.message || 'Face verification failed: Biometric mismatch.', 'error');
    }
  } catch (err) {
    console.error('Verification error:', err);
    setFaceVerificationUiState('ERROR', { message: 'Biometric verification error: ' + err.message });
    showToast('Biometric verification failed: ' + err.message, 'error');
  }
}

function initApproveRejectModals() {
  if (DOM.btnTriggerFaceVerify) {
    DOM.btnTriggerFaceVerify.addEventListener('click', () => {
      verifyParentFaceForOutpass();
    });
  }

  if (DOM.btnCaptureAndRegisterFace) {
    DOM.btnCaptureAndRegisterFace.addEventListener('click', () => {
      captureAndRegisterFace();
    });
  }

  if (DOM.btnOpenFaceEnrollHero) {
    DOM.btnOpenFaceEnrollHero.addEventListener('click', () => {
      openFaceRegisterModal();
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
      if (isFaceVerified) {
        const hasMsg = !!DOM.approveParentMessage.value.trim();
        if (DOM.btnConfirmApprove) {
          DOM.btnConfirmApprove.disabled = !hasMsg;
          DOM.btnConfirmApprove.style.opacity = hasMsg ? '1.0' : '0.5';
          DOM.btnConfirmApprove.style.cursor = hasMsg ? 'pointer' : 'not-allowed';
        }
        if (DOM.btnConfirmApproveLabel) {
          DOM.btnConfirmApproveLabel.textContent = hasMsg
            ? 'Approve & Forward to Warden →'
            : 'Enter Message to Approve';
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

  if (!isFaceVerified || !activeVerificationToken) {
    showToast('Parent face verification is required before approving.', 'error');
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
      showToast(`🎉 Outpass ${data.data?.requestCode || ''} approved via verified Parent Face Biometrics, forwarded to Warden.`, 'success');

      isFaceVerified = false;
      activeVerificationToken = null;
      liveFaceDescriptor = null;

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
  if (modalId === 'approveModal') {
    if (verifyDetectionInterval) {
      clearInterval(verifyDetectionInterval);
      verifyDetectionInterval = null;
    }
    stopCamera(verifyVideoStream, DOM.approveFaceVideo);
    verifyVideoStream = null;
    if (DOM.approveFaceCanvas) {
      const ctx = DOM.approveFaceCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, DOM.approveFaceCanvas.width, DOM.approveFaceCanvas.height);
    }
    selectedRequestForAction = null;
    isFaceVerified = false;
    activeVerificationToken = null;
    liveFaceDescriptor = null;
  } else if (modalId === 'faceRegisterModal') {
    if (registerDetectionInterval) {
      clearInterval(registerDetectionInterval);
      registerDetectionInterval = null;
    }
    stopCamera(registerVideoStream, DOM.registerFaceVideo);
    registerVideoStream = null;
    if (DOM.registerFaceCanvas) {
      const ctx = DOM.registerFaceCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, DOM.registerFaceCanvas.width, DOM.registerFaceCanvas.height);
    }
  } else if (modalId === 'rejectModal') {
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
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('sh_theme', 'dark');
  updateThemeIcons('dark');
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

// Global modal triggers for inline onclick handlers
window.openFaceRegisterModal = openFaceRegisterModal;
window.closeFaceRegisterModal = closeFaceRegisterModal;

