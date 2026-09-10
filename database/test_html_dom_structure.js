const fs = require('fs');

const advHtml = fs.readFileSync('public/advisor-dashboard.html', 'utf8');
const prcHtml = fs.readFileSync('public/principal-dashboard.html', 'utf8');

console.log('--- Checking Advisor HTML ---');
console.log('Advisor dutyQueueContainer:', advHtml.includes('id="dutyQueueContainer"'));
console.log('Advisor specialQueueContainer:', advHtml.includes('id="specialQueueContainer"'));
console.log('Advisor tab-duty-queue:', advHtml.includes('id="tab-duty-queue"'));
console.log('Advisor tab-special-queue:', advHtml.includes('id="tab-special-queue"'));
console.log('Advisor nav badge special:', advHtml.includes('id="navBadgeSpecial"'));

console.log('\n--- Checking Principal HTML ---');
console.log('Principal oneDayTableBody:', prcHtml.includes('id="oneDayTableBody"'));
console.log('Principal specialPermissionTableBody:', prcHtml.includes('id="specialPermissionTableBody"'));
console.log('Principal tab-one-day-permission:', prcHtml.includes('id="tab-one-day-permission"'));
console.log('Principal tab-special-permission:', prcHtml.includes('id="tab-special-permission"'));
console.log('Principal nav badge special:', prcHtml.includes('id="navBadgePendingSpecial"'));
console.log('Principal stat pending special:', prcHtml.includes('id="statPendingSpecial"'));

const allChecks = [
  advHtml.includes('id="dutyQueueContainer"'),
  advHtml.includes('id="specialQueueContainer"'),
  advHtml.includes('id="tab-duty-queue"'),
  advHtml.includes('id="tab-special-queue"'),
  advHtml.includes('id="navBadgeSpecial"'),
  prcHtml.includes('id="oneDayTableBody"'),
  prcHtml.includes('id="specialPermissionTableBody"'),
  prcHtml.includes('id="tab-one-day-permission"'),
  prcHtml.includes('id="tab-special-permission"'),
  prcHtml.includes('id="navBadgePendingSpecial"'),
  prcHtml.includes('id="statPendingSpecial"')
];

if (allChecks.every(Boolean)) {
  console.log('\n✅ ALL 11 DOM STRUCTURAL CHECKS PASSED');
  process.exit(0);
} else {
  console.error('\n❌ SOME DOM STRUCTURAL CHECKS FAILED');
  process.exit(1);
}
