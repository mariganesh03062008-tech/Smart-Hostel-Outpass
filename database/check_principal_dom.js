const fs = require('fs');

const html = fs.readFileSync('public/principal-dashboard.html', 'utf8');

// Check section parentage
const lines = html.split('\n');
let sectionStack = [];
let divStack = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const sectionOpen = line.match(/<section[^>]*id=["']([^"']+)["'][^>]*>/i);
  if (sectionOpen) {
    if (sectionStack.length > 0) {
      console.log(`WARNING: Section ${sectionOpen[1]} opened inside section ${sectionStack[sectionStack.length - 1]} at line ${i + 1}`);
    }
    sectionStack.push({ id: sectionOpen[1], line: i + 1 });
  }
  if (line.includes('</section>')) {
    const closed = sectionStack.pop();
    // console.log(`Section ${closed ? closed.id : 'unknown'} closed at line ${i + 1}`);
  }
}
console.log('Remaining open sections at EOF:', sectionStack);
