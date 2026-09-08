const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log('🧪 RUNNING PARENT DASHBOARD UI DOM & STATE DISPATCH SIMULATION TESTS');
console.log('======================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name} - ${details}`);
    failed++;
  }
}

// 1. Inspect public/parent-dashboard.html
const htmlPath = path.join(__dirname, '..', 'public', 'parent-dashboard.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

console.log('--- 1. HTML Element Existence Checks ---');
assert(htmlContent.includes('id="modalVerifiedMobileText"'), '1.1 modalVerifiedMobileText element exists');
assert(htmlContent.includes('id="locVerifyBox"'), '1.2 locVerifyBox element exists');
assert(htmlContent.includes('id="locStatusHeading"'), '1.3 locStatusHeading element exists');
assert(htmlContent.includes('id="locStatusSubtext"'), '1.4 locStatusSubtext element exists');
assert(htmlContent.includes('id="btnTriggerLocVerify"'), '1.5 btnTriggerLocVerify button exists');
assert(htmlContent.includes('id="btnTriggerLocVerifyLabel"'), '1.6 btnTriggerLocVerifyLabel span exists');
assert(htmlContent.includes('onclick="handleStartLocationVerification()"'), '1.7 Trigger button triggers handleStartLocationVerification()');
assert(htmlContent.includes('id="locDetailsContainer"'), '1.8 locDetailsContainer exists');
assert(htmlContent.includes('id="locDistanceBadge"'), '1.9 locDistanceBadge element exists');
assert(htmlContent.includes('id="locAccuracyBadge"'), '1.10 locAccuracyBadge element exists');
assert(htmlContent.includes('id="locResultBanner"'), '1.11 locResultBanner element exists');
assert(htmlContent.includes('id="locResultText"'), '1.12 locResultText element exists');
assert(htmlContent.includes('id="parentMessageConsentSection"'), '1.13 parentMessageConsentSection element exists');
assert(htmlContent.includes('id="btnConfirmApprove"'), '1.14 btnConfirmApprove button exists');
assert(htmlContent.includes('id="btnConfirmApproveLabel"'), '1.15 btnConfirmApproveLabel span exists');

// 2. Behavioral Simulation of State Transitions in JavaScript
console.log('\n--- 2. Behavioral State Transition Simulation ---');

// Create mock DOM object reflecting elements in parent-dashboard.js
function createMockDOM() {
  function createElement(initialText = '', initialClasses = []) {
    const classSet = new Set(initialClasses);
    return {
      textContent: initialText,
      className: initialClasses.join(' '),
      disabled: false,
      style: {},
      classList: {
        add: (...cls) => cls.forEach(c => classSet.add(c)),
        remove: (...cls) => cls.forEach(c => classSet.delete(c)),
        contains: (c) => classSet.has(c)
      }
    };
  }

  return {
    locVerifyBox: createElement('', ['loc-verify-box']),
    locStatusHeading: createElement('GPS Proximity Security Check'),
    locStatusSubtext: createElement('Device GPS location is required. Approvals within 5 meters of student device are blocked.'),
    btnTriggerLocVerify: createElement(),
    btnTriggerLocVerifyLabel: createElement('Verify Current Location'),
    locDetailsContainer: createElement('', ['loc-details-container', 'hidden']),
    locDistanceBadge: createElement('-- meters', ['loc-stat-val']),
    locAccuracyBadge: createElement('-- meters', ['loc-stat-val']),
    locResultBanner: createElement('', ['fp-verify-result-banner', 'hidden']),
    locResultText: createElement(),
    parentMessageConsentSection: createElement('', ['parent-message-consent-box', 'hidden']),
    btnConfirmApprove: createElement(),
    btnConfirmApproveLabel: createElement('Verify Location to Approve')
  };
}

// Extract and test simulated dispatch function matching parent-dashboard.js
function simulateVerificationResponse(DOM, res, data, payload) {
  let isLocationVerified = false;
  let activeVerificationToken = null;
  let latestVerifiedDistance = null;

  if (DOM.locDetailsContainer) DOM.locDetailsContainer.classList.remove('hidden');

  if (res.ok && data.success && data.locationVerified) {
    // STATE C: SUCCESS
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

    if (DOM.parentMessageConsentSection) {
      DOM.parentMessageConsentSection.classList.remove('hidden');
    }
    if (DOM.btnConfirmApprove) {
      DOM.btnConfirmApprove.disabled = false;
      DOM.btnConfirmApprove.style.opacity = '1';
      DOM.btnConfirmApprove.style.cursor = 'pointer';
    }
    if (DOM.btnConfirmApproveLabel) {
      DOM.btnConfirmApproveLabel.textContent = 'Send Approval & Forward to Warden →';
    }
  } else {
    isLocationVerified = false;
    activeVerificationToken = null;
    latestVerifiedDistance = null;

    if (DOM.locVerifyBox) DOM.locVerifyBox.className = 'loc-verify-box blocked';

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
      // STATE A: GPS ACCURACY INSUFFICIENT
      if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Location Verification Failed';
      if (DOM.locStatusSubtext) {
        DOM.locStatusSubtext.textContent = data.message || `Parent location accuracy (${formattedAccuracy}) is insufficient for 5-meter verification. Please move to an open area and try again.`;
      }

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

      if (DOM.btnConfirmApproveLabel) {
        DOM.btnConfirmApproveLabel.textContent = 'Approval Unavailable – GPS Accuracy Insufficient';
      }
    } else if (data.proximityBlocked === true || (res.status === 403 && data.distanceMeters !== null && data.distanceMeters !== undefined && data.distanceMeters < 5)) {
      // STATE B: PROXIMITY BLOCKED
      if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Location Verification Failed';
      if (DOM.locStatusSubtext) {
        DOM.locStatusSubtext.textContent = data.message || 'Parent and student devices are within 5 meters. Approval is blocked for security.';
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

      if (DOM.btnConfirmApproveLabel) {
        DOM.btnConfirmApproveLabel.textContent = 'Approval Blocked (< 5m Proximity)';
      }
    } else if (data.studentLocationMissing || data.studentLocationStale || data.studentLocationInvalid || (data.accuracyPoor && data.device === 'student')) {
      // STATE D: STUDENT LOCATION INVALID/STALE
      if (DOM.locStatusHeading) DOM.locStatusHeading.textContent = 'Location Verification Failed';
      if (DOM.locStatusSubtext) {
        DOM.locStatusSubtext.textContent = data.message || 'Student location is unavailable or outdated. Please ask the student to refresh their live location and try again.';
      }

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
    }
  }

  return { isLocationVerified, activeVerificationToken, latestVerifiedDistance };
}

// Test State A: Accuracy ±105m
{
  const DOM = createMockDOM();
  const res = { ok: false, status: 422 };
  const data = {
    success: false,
    locationVerified: false,
    accuracyPoor: true,
    device: 'parent',
    distanceMeters: null,
    parentAccuracy: 105.4,
    message: 'Parent location accuracy (±105m) is insufficient for 5-meter verification. Please move to an open area and try again.'
  };
  simulateVerificationResponse(DOM, res, data, { accuracy: 105.4 });

  assert(DOM.locStatusHeading.textContent === 'Location Verification Failed', '2.1 State A: Heading is "Location Verification Failed"');
  assert(DOM.locDistanceBadge.textContent === 'N/A', '2.2 State A: Distance is strictly "N/A"');
  assert(DOM.locAccuracyBadge.textContent === '±105 meters', '2.3 State A: Accuracy badge shows ±105 meters');
  assert(DOM.btnConfirmApproveLabel.textContent === 'Approval Unavailable – GPS Accuracy Insufficient', '2.4 State A: Button says "Approval Unavailable – GPS Accuracy Insufficient"');
  assert(!DOM.btnConfirmApproveLabel.textContent.includes('<5m Proximity') && !DOM.btnConfirmApproveLabel.textContent.includes('< 5m Proximity'), '2.5 State A: Button NEVER says "<5m Proximity"');
  assert(DOM.btnConfirmApprove.disabled === true, '2.6 State A: Approval button is disabled');
  assert(DOM.btnTriggerLocVerifyLabel.textContent === 'Retry Location Verification', '2.7 State A: Trigger button shows "Retry Location Verification"');
}

// Test State B: Proximity Blocked (< 5m)
{
  const DOM = createMockDOM();
  const res = { ok: false, status: 403 };
  const data = {
    success: false,
    locationVerified: false,
    proximityBlocked: true,
    distanceMeters: 3.45,
    parentAccuracy: 12.0,
    message: 'Approval cannot be submitted because the parent and student devices are within the restricted 5-meter range.'
  };
  simulateVerificationResponse(DOM, res, data, { accuracy: 12.0 });

  assert(DOM.locDistanceBadge.textContent === '3.45 meters', '2.8 State B: Distance shows actual 3.45 meters');
  assert(DOM.btnConfirmApproveLabel.textContent === 'Approval Blocked (< 5m Proximity)', '2.9 State B: Button says "Approval Blocked (< 5m Proximity)"');
  assert(DOM.btnConfirmApprove.disabled === true, '2.10 State B: Approval button is disabled');
}

// Test State C: Verification Successful (>= 5m)
{
  const DOM = createMockDOM();
  const res = { ok: true, status: 200 };
  const data = {
    success: true,
    locationVerified: true,
    distanceMeters: 42.5,
    parentAccuracy: 15.0,
    verificationToken: 'token_abc123'
  };
  simulateVerificationResponse(DOM, res, data, { accuracy: 15.0 });

  assert(DOM.locStatusHeading.textContent === 'Location Verification Successful', '2.11 State C: Heading is "Location Verification Successful"');
  assert(DOM.locDistanceBadge.textContent === '42.5 meters', '2.12 State C: Distance shows 42.5 meters');
  assert(DOM.btnConfirmApproveLabel.textContent === 'Send Approval & Forward to Warden →', '2.13 State C: Button enabled with "Send Approval & Forward to Warden →"');
  assert(DOM.btnConfirmApprove.disabled === false, '2.14 State C: Approval button is enabled');
  assert(DOM.parentMessageConsentSection.classList.contains('hidden') === false, '2.15 State C: Parental consent message is unlocked');
}

// Test State D: Stale Student Location
{
  const DOM = createMockDOM();
  const res = { ok: false, status: 422 };
  const data = {
    success: false,
    locationVerified: false,
    studentLocationStale: true,
    distanceMeters: null,
    parentAccuracy: 14.0,
    message: 'Student location is outdated (8 minutes old). Student location must be refreshed within the last 5 minutes.'
  };
  simulateVerificationResponse(DOM, res, data, { accuracy: 14.0 });

  assert(DOM.locDistanceBadge.textContent === 'N/A', '2.16 State D: Distance is strictly "N/A"');
  assert(DOM.btnConfirmApproveLabel.textContent === 'Approval Unavailable – Student Location Outdated', '2.17 State D: Button says "Approval Unavailable – Student Location Outdated"');
  assert(!DOM.btnConfirmApproveLabel.textContent.includes('<5m Proximity'), '2.18 State D: Button NEVER mentions proximity');
  assert(DOM.btnConfirmApprove.disabled === true, '2.19 State D: Approval button is disabled');
}

console.log('\n======================================================================');
console.log(`🏁 DOM & STATE DISPATCH SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================\n');

if (failed > 0) process.exit(1);
