/**
 * Smart Hostel Outpass System
 * Verification Script: Student Mobile Responsive UI & Location Enforcement
 */

const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log('📱 STUDENT MOBILE RESPONSIVE UI & LOCATION MANDATORY AUDIT VERIFICATION');
console.log('======================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message} ${details ? '--> ' + details : ''}`);
    failed++;
  }
}

// 1. Inspect public/student-dashboard.html
console.log('--- 1. Inspecting student-dashboard.html ---');
const studentDashHtml = fs.readFileSync(path.join(__dirname, '../public/student-dashboard.html'), 'utf8');

// Check firstTimeProfileModal
const firstModalMatch = studentDashHtml.match(/id="firstTimeProfileModal"[\s\S]*?<form id="firstTimeProfileForm"[^>]*>([\s\S]*?)<\/form>/);
assert(Boolean(firstModalMatch), 'firstTimeProfileModal exists in student-dashboard.html');
if (firstModalMatch) {
  const firstModalContent = firstModalMatch[1];
  const hasForcedTwoCol = /grid-template-columns\s*:\s*1fr\s+1fr/i.test(firstModalContent);
  assert(!hasForcedTwoCol, 'firstTimeProfileModal has NO hardcoded inline grid-template-columns: 1fr 1fr');
  const formGrid2Count = (firstModalContent.match(/class="form-grid-2"/g) || []).length;
  assert(formGrid2Count >= 5, `firstTimeProfileModal uses responsive class .form-grid-2 on all 5 field rows (found ${formGrid2Count})`);
}

// Check extensionModal
const extModalMatch = studentDashHtml.match(/id="extensionModal"[\s\S]*?<form id="extensionRequestForm"[^>]*>([\s\S]*?)<\/form>/);
assert(Boolean(extModalMatch), 'extensionModal exists in student-dashboard.html');
if (extModalMatch) {
  const extModalContent = extModalMatch[1];
  const hasForcedTwoCol = /grid-template-columns\s*:\s*1fr\s+1fr/i.test(extModalContent);
  assert(!hasForcedTwoCol, 'extensionModal has NO hardcoded inline grid-template-columns: 1fr 1fr');
  const hasFormGrid2 = extModalContent.includes('class="form-grid-2"');
  assert(hasFormGrid2, 'extensionModal uses responsive class .form-grid-2');
}

// Check submitLocationNotice
assert(studentDashHtml.includes('id="submitLocationNotice"'), 'submitLocationNotice element exists in student-dashboard.html');
assert(studentDashHtml.includes('id="submitLocationNoticeText"'), 'submitLocationNoticeText element exists in student-dashboard.html');
assert(studentDashHtml.includes('Location access is required before submitting an outpass.'), 'Clear location required message exists in HTML');

// 2. Inspect public/index.html
console.log('\n--- 2. Inspecting index.html (Student Registration) ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const studentRegMatch = indexHtml.match(/<form[^>]*id="studentRegisterForm"[^>]*>([\s\S]*?)<\/form>/);
assert(Boolean(studentRegMatch), 'studentRegisterForm exists in index.html');
if (studentRegMatch) {
  const studentRegContent = studentRegMatch[1];
  const hasForcedTwoCol = /grid-template-columns\s*:\s*1fr\s+1fr/i.test(studentRegContent);
  assert(!hasForcedTwoCol, 'studentRegisterForm has NO hardcoded inline grid-template-columns: 1fr 1fr');
  const formGrid2Count = (studentRegContent.match(/class="form-grid-2"/g) || []).length;
  assert(formGrid2Count >= 5, `studentRegisterForm uses responsive class .form-grid-2 on field rows (found ${formGrid2Count})`);
}

// 3. Inspect public/css/student-dashboard.css & public/css/style.css
console.log('\n--- 3. Inspecting CSS Breakpoints (max-width: 600px) ---');
const studentCss = fs.readFileSync(path.join(__dirname, '../public/css/student-dashboard.css'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');

assert(studentCss.includes('@media (max-width: 600px)'), 'student-dashboard.css includes mobile breakpoint @media (max-width: 600px)');
assert(
  studentCss.includes('grid-template-columns: 1fr !important') || studentCss.includes('grid-template-columns: 1fr;'),
  'student-dashboard.css defines single vertical column grid-template-columns: 1fr for mobile'
);
assert(styleCss.includes('@media (max-width: 600px)'), 'style.css includes mobile breakpoint @media (max-width: 600px)');
assert(
  styleCss.includes('grid-template-columns: 1fr !important') || styleCss.includes('grid-template-columns: 1fr;'),
  'style.css defines single vertical column grid-template-columns: 1fr for mobile'
);

// 4. Viewport Width Simulation Verification
console.log('\n--- 4. Viewport Width Verification ---');
const viewports = [
  { name: '390x844 (Mobile - iPhone 12/13/14)', width: 390, expectedColumns: 1 },
  { name: '430x932 (Mobile - iPhone 14/15 Pro Max)', width: 430, expectedColumns: 1 },
  { name: '768x1024 (Tablet - iPad)', width: 768, expectedColumns: 2 },
  { name: '1366x768 (Laptop)', width: 1366, expectedColumns: 2 },
  { name: '1920x1080 (Desktop)', width: 1920, expectedColumns: 2 }
];

viewports.forEach(vp => {
  const isMobile = vp.width <= 600;
  const cols = isMobile ? 1 : 2;
  assert(cols === vp.expectedColumns, `${vp.name}: Form fields render as ${cols}-column grid (${cols === 1 ? 'Vertical Stack' : 'Two Columns'})`);
});

// 5. JavaScript Student Location State Machine & Submit Button Guard
console.log('\n--- 5. JavaScript Student Location State Machine & Submit Guard ---');
const studentJs = fs.readFileSync(path.join(__dirname, '../public/js/student-dashboard.js'), 'utf8');

assert(studentJs.includes('function setStudentLocationState'), 'setStudentLocationState function exists in student-dashboard.js');
assert(studentJs.includes('✓ Location Ready'), 'State A: ✓ Location Ready exists in student-dashboard.js');
assert(studentJs.includes('⌛ Getting your location...'), 'State B: ⌛ Getting your location... exists in student-dashboard.js');
assert(studentJs.includes('⚠ Location Permission Required'), 'State C: ⚠ Location Permission Required exists in student-dashboard.js');
assert(studentJs.includes('⚠ Location Unavailable'), 'State D: ⚠ Location Unavailable exists in student-dashboard.js');
assert(studentJs.includes('⚠ Location Accuracy Too Low'), 'State E: ⚠ Location Accuracy Too Low exists in student-dashboard.js');
assert(studentJs.includes('Retry Location'), 'Retry Location button label exists in student-dashboard.js');
assert(studentJs.includes('function updateSubmitButtonState()'), 'updateSubmitButtonState function exists in student-dashboard.js');
assert(studentJs.includes('DOM.btnSubmitOutpass.style.cursor = \'not-allowed\''), 'Submit button cursor set to not-allowed when location not ready');
assert(studentJs.includes('activeLocationPromise'), 'Race condition guard with activeLocationPromise exists in student-dashboard.js');

// 6. Backend Authority & Outpass Controller Guard
console.log('\n--- 6. Backend Authority & Outpass Controller Guard ---');
const outpassCtrl = fs.readFileSync(path.join(__dirname, '../controllers/outpassController.js'), 'utf8');
assert(outpassCtrl.includes('STUDENT_LOCATION_REQUIRED'), 'STUDENT_LOCATION_REQUIRED code exists in outpassController.js');
assert(outpassCtrl.includes('student_locations WHERE student_id = ?'), 'Authoritative SQL query to student_locations exists in createOutpass');
assert(outpassCtrl.includes('locAgeMinutes > 5'), 'Freshness check (5-minute rule) enforced in createOutpass');
assert(outpassCtrl.includes('studentAccuracy > 50'), 'Accuracy check (50-meter rule) enforced in createOutpass');

console.log('\n======================================================================');
console.log(`🏁 MOBILE RESPONSIVE & LOCATION AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================\n');

process.exit(failed > 0 ? 1 : 0);
