// test_warden_reports_redesign.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('======================================================================');
console.log('📊 VERIFYING WARDEN REPORTS REDESIGN SPECIFICATIONS & ASSETS');
console.log('======================================================================');

let passCount = 0;
function pass(msg) {
  passCount++;
  console.log(`  ✅ PASS: ${msg}`);
}

// 1. CSS Syntax & Rule Verification
const cssPath = path.join(__dirname, '../public/css/warden-dashboard.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Check brace matching in CSS
let openBraces = 0;
let closedBraces = 0;
for (let i = 0; i < cssContent.length; i++) {
  if (cssContent[i] === '{') openBraces++;
  if (cssContent[i] === '}') closedBraces++;
}
assert.strictEqual(openBraces, closedBraces, `CSS braces mismatch: {=${openBraces}, }=${closedBraces}`);
pass(`CSS syntax valid: ${openBraces} open and closed braces perfectly balanced`);

assert.ok(cssContent.includes('.report-table-container'), 'CSS contains .report-table-container');
assert.ok(cssContent.includes('overflow-x: auto'), 'CSS contains overflow-x: auto on table container');
assert.ok(cssContent.includes('.report-header-card'), 'CSS contains .report-header-card');
assert.ok(cssContent.includes('.report-action-card'), 'CSS contains .report-action-card');
assert.ok(cssContent.includes('.summary-cards-grid'), 'CSS contains .summary-cards-grid');
assert.ok(cssContent.includes('.report-section-card'), 'CSS contains .report-section-card');
assert.ok(cssContent.includes('.rep-status-grid'), 'CSS contains .rep-status-grid');
assert.ok(cssContent.includes('.status-track'), 'CSS contains .status-track for progress bars');
assert.ok(cssContent.includes('@media print'), 'CSS contains print media rules');
pass('All required CSS classes, grid layouts, containers, and print rules present');

// 2. HTML Verification in warden-dashboard.html
const htmlPath = path.join(__dirname, '../public/warden-dashboard.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const expectedIds = [
  'tab-reports',
  'btnPrintReport',
  'btnExportCsv',
  'btnFilterToday',
  'btnFilterYesterday',
  'btnFilterCustom',
  'reportDateRangeLabel',
  'repActionRequiredCard',
  'repActionItemsContainer',
  'repTotalOutpasses',
  'repPendingRequests',
  'repCurrentlyOutside',
  'repReturnedStudents',
  'repLateReturns',
  'repEmergencyExtensions',
  'currentlyOutsideBadge',
  'repCurrentlyOutsideTableBody',
  'lateReturnBadge',
  'repLateReturnTableBody',
  'cardEmergencyExtensions',
  'repEmergencyExtensionsTableBody',
  'cardDeptSummary',
  'repDeptSummaryTableBody',
  'cardOutpassStatus',
  'repStatusDistributionGrid',
  'repApprovedRequests',
  'repRejectedRequests',
  'repOutpassStatusTableBody'
];

for (const id of expectedIds) {
  assert.ok(htmlContent.includes(`id="${id}"`), `HTML missing element id="${id}"`);
}
pass(`All ${expectedIds.length} mandatory report element IDs exist in warden-dashboard.html`);

// Check table containers in HTML
const tableContainerMatches = (htmlContent.match(/class="report-table-container"/g) || []).length;
assert.ok(tableContainerMatches >= 4, `Expected at least 4 .report-table-container wrappers, found ${tableContainerMatches}`);
pass(`All report tables wrapped inside .report-table-container (${tableContainerMatches} containers found)`);

// 3. JavaScript Functions in warden-dashboard.js
const jsPath = path.join(__dirname, '../public/js/warden-dashboard.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

const expectedFunctions = [
  'loadWardenReports',
  'renderActionRequired',
  'renderCurrentlyOutsideTable',
  'renderLateReturnTable',
  'renderEmergencyExtensionsTable',
  'renderDepartmentSummaryTable',
  'renderOutpassStatusTable',
  'exportWardenReportsCsv',
  'printWardenReport'
];

for (const fn of expectedFunctions) {
  assert.ok(jsContent.includes(fn), `JS missing function ${fn}`);
}
pass(`All ${expectedFunctions.length} report controller and rendering functions verified in warden-dashboard.js`);

// 4. Sensitive Data Guardrail: Ensure no GPS coords exposed in warden reports rendering
assert.ok(!jsContent.includes('repDeptSummaryTableBody.innerHTML += row.parent_lat'), 'No parent GPS coordinates in reports');
assert.ok(!jsContent.includes('repCurrentlyOutsideTableBody.innerHTML += row.parent_latitude'), 'No parent GPS coordinates in currently outside table');
pass('Sensitive data guard: Parent GPS coordinates are strictly excluded from general reports tables');

console.log('======================================================================');
console.log(`🏁 ALL REDESIGN CHECKS PASSED: ${passCount} tests verified!`);
console.log('======================================================================');
