const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 ========================================================');
console.log('🚀 RUNNING WARDEN DASHBOARD UI & DOM VALIDATION TESTS');
console.log('========================================================\n');

let passed = 0;
let failed = 0;

function testAssert(condition, name, details = '') {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${name} - ${details}`);
    failed++;
  }
}

// 1. Inspect warden-dashboard.html
const htmlPath = path.join(__dirname, '..', 'public', 'warden-dashboard.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

testAssert(htmlContent.includes('id="tab-normal-requests"'), '1. Normal Requests tab section exists in HTML');
testAssert(htmlContent.includes('id="normalQueueContainer"'), '2. Normal queue card container exists in HTML');
testAssert(htmlContent.includes('id="tab-duty-requests"'), '3. Duty requests tab section exists in HTML');
testAssert(htmlContent.includes('id="tab-active-passes"'), '4. Active outpasses tab section exists in HTML');
testAssert(htmlContent.includes('id="activeOutpassTableBody"'), '5. Active outpass table body exists in HTML');
testAssert(htmlContent.includes('id="detailsModal"'), '6. Request details modal exists in HTML');
testAssert(htmlContent.includes('id="detailsModalBody"'), '7. Request details modal body exists in HTML');
testAssert(htmlContent.includes('id="approveModal"'), '8. Approval confirmation modal exists in HTML');
testAssert(htmlContent.includes('id="btnConfirmApprove"'), '9. Confirm approval button exists in HTML');
testAssert(htmlContent.includes('id="rejectModal"'), '10. Rejection modal exists in HTML');
testAssert(htmlContent.includes('id="rejectReasonInput"'), '11. Rejection reason textarea exists in HTML');
testAssert(htmlContent.includes('id="btnConfirmReject"'), '12. Confirm rejection button exists in HTML');
testAssert(htmlContent.includes('id="qrPreviewModal"'), '13. QR Preview modal exists in HTML');
testAssert(htmlContent.includes('id="revokeQrModal"'), '14. QR Revoke modal exists in HTML');

// 2. Inspect warden-dashboard.js
const jsPath = path.join(__dirname, '..', 'public', 'js', 'warden-dashboard.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

testAssert(jsContent.includes('function renderNormalQueue'), '15. renderNormalQueue function defined');
testAssert(jsContent.includes('Parent Mobile:'), '16. Parent mobile identity rendered in normal queue cards');
testAssert(jsContent.includes('Distance:'), '17. Calculated distance rendered in normal queue cards');
testAssert(jsContent.includes('Parent GPS:'), '18. Parent GPS coordinates rendered in normal queue cards');
testAssert(jsContent.includes('function openDetailsModal'), '19. openDetailsModal function defined');
testAssert(jsContent.includes('PARENT CONSENT & PROXIMITY VERIFICATION'), '20. Modal includes Parent Consent & Proximity Verification header');
testAssert(jsContent.includes('Parent GPS Location:'), '21. Modal includes Parent GPS Location');
testAssert(jsContent.includes('Parent GPS Accuracy:'), '22. Modal includes Parent GPS Accuracy');
testAssert(jsContent.includes('Parent GPS Timestamp:'), '23. Modal includes Parent GPS Timestamp');
testAssert(jsContent.includes('Student GPS at Consent:'), '24. Modal includes Student GPS at Consent');
testAssert(jsContent.includes('Calculated Distance:'), '25. Modal includes Calculated Distance');
testAssert(jsContent.includes('Proximity ≥ 5m Separation Confirmed'), '26. Modal includes Proximity Rule confirmation');
testAssert(jsContent.includes('Parent Message to Warden:'), '27. Modal includes Parent Message to Warden section');
testAssert(jsContent.includes('/api/qr/generate/'), '28. executeApprove triggers QR generation workflow');
testAssert(jsContent.includes('window.addEventListener(\'sh:notification:new\''), '29. Real-time Socket.IO notification listener configured');

console.log('\n========================================================');
console.log(`🏁 UI VALIDATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================================\n');

if (failed > 0) process.exit(1);
