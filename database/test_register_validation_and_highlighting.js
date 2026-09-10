/**
 * Automated Verification Script for Pre-Submit Registration Error Highlighting & Auto-Validation
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 5001;
const BASE_URL = `http://localhost:${PORT}`;
const ARTIFACTS_DIR = 'C:\\Users\\marig\\.gemini\\antigravity-ide\\brain\\0c90062c-c4ab-4f4d-b70b-639fa8a7dc49';

class ChromeCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reqId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(msg.error);
          else cb.resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.reqId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    console.log(`📸 Screenshot captured: ${outputPath}`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('🧪 ====================================================================');
  console.log('🔍 VERIFYING PRE-SUBMIT REGISTRATION VALIDATION & HIGHLIGHTING');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;
  function assert(cond, name, details = '') {
    if (cond) {
      console.log(`  ✅ [PASS]: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL]: ${name} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // 1. Backend Endpoint Validation
  console.log('📡 1. Testing /api/auth/check-student-roll endpoint...');
  const testRoll = async (roll) => {
    return new Promise((resolve, reject) => {
      http.get(`${BASE_URL}/api/auth/check-student-roll?roll_no=${encodeURIComponent(roll)}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
  };

  const resFound = await testRoll('21CS042');
  assert(resFound.success === true, 'API returned success for registered student');
  assert(resFound.exists === true, 'exists flag is true for 21CS042');
  assert(Boolean(resFound.student?.name), `Student metadata returned: ${resFound.student?.name}`);

  const resNotFound = await testRoll('INVALID_ROLL_999');
  assert(resNotFound.success === true, 'API returned success for unregistered roll');
  assert(resNotFound.exists === false, 'exists flag is false for INVALID_ROLL_999');
  assert(resNotFound.message.includes('not found in system'), 'Helpful message returned for unregistered student');

  // 2. Headless Chrome CDP Live UI & Highlighting Verification
  console.log('\n🖥️ 2. Starting Chrome CDP for Live UI Error Highlighting & Auto-Validation...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_val_vis_' + Date.now());

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9224',
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,920'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://localhost:9224/json/version', r => {
          let data = '';
          r.on('data', chunk => data += chunk);
          r.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      wsUrl = res.webSocketDebuggerUrl;
      break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (!wsUrl) {
    console.error('Could not connect to Chrome CDP on port 9224');
    chromeProc.kill();
    process.exit(1);
  }

  const newPageRes = await fetch('http://127.0.0.1:9224/json/new?about:blank', { method: 'PUT' });
  const pageTarget = await newPageRes.json();
  const cdp = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `${BASE_URL}/index.html` });
  await new Promise(r => setTimeout(r, 1500));

  // Check background image visibility and 50% canvas opacity
  const canvasOpacity = await cdp.evaluate(`window.getComputedStyle(document.getElementById('fantasyCanvas')).opacity`);
  assert(canvasOpacity === '0.5', `Fantasy canvas opacity is exactly 50%: ${canvasOpacity}`);

  // Switch to Register
  await cdp.evaluate(`setAuthMode('register')`);
  await new Promise(r => setTimeout(r, 300));

  // Try submitting empty parent form -> should highlight all empty required fields
  console.log('\n🚨 3. Triggering Pre-Submit Validation on Empty Form...');
  await cdp.evaluate(`document.getElementById('parentRegisterForm').dispatchEvent(new Event('submit', { cancelable: true }))`);
  await new Promise(r => setTimeout(r, 300));

  const isNameInvalid = await cdp.evaluate(`document.getElementById('wrapper_parentRegName').classList.contains('is-invalid')`);
  assert(isNameInvalid === true, 'Parent Name field highlighted with red border (.is-invalid)');

  const isMobileInvalid = await cdp.evaluate(`document.getElementById('wrapper_parentRegMobile').classList.contains('is-invalid')`);
  assert(isMobileInvalid === true, 'Parent Mobile field highlighted with red border (.is-invalid)');

  const isRollInvalid = await cdp.evaluate(`document.getElementById('wrapper_parentRegStudentRoll').classList.contains('is-invalid')`);
  assert(isRollInvalid === true, 'Student Roll field highlighted with red border (.is-invalid)');

  const isPasswordInvalid = await cdp.evaluate(`document.getElementById('wrapper_parentRegPassword').classList.contains('is-invalid')`);
  assert(isPasswordInvalid === true, 'Password field highlighted with red border (.is-invalid)');

  await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'register_presubmit_errors_highlighted.png'));

  // Test live check with UNREGISTERED roll number
  console.log('\n🔍 4. Typing Unregistered Roll Number "99ZZ999" (Simulating user confusion)...');
  await cdp.evaluate(`(() => {
    const rollInput = document.getElementById('parentRegStudentRoll');
    rollInput.value = '99ZZ999';
    validateParentStudentRollLive(true);
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const rollErrorText = await cdp.evaluate(`document.getElementById('feedback_parentRegStudentRoll').textContent`);
  assert(rollErrorText.includes('not found in system'), `Shows inline warning before submit: "${rollErrorText.trim()}"`);

  const hasFixButton = await cdp.evaluate(`Boolean(document.querySelector('#feedback_parentRegStudentRoll .inline-fix-btn'))`);
  assert(hasFixButton === true, 'Shows inline quick action button: "Register Student"');

  await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'register_unregistered_roll_inline_guidance.png'));

  // Click the quick action button -> should seamlessly switch to Student Registration with roll filled!
  console.log('\n🔄 5. Clicking "Register Student" quick action button...');
  await cdp.evaluate(`document.querySelector('#feedback_parentRegStudentRoll .inline-fix-btn').click()`);
  await new Promise(r => setTimeout(r, 400));

  const studentRegVisible = await cdp.evaluate(`!document.getElementById('studentRegisterForm').classList.contains('hidden')`);
  assert(studentRegVisible === true, 'Student Registration Form is now visible');

  const prefilledRoll = await cdp.evaluate(`document.getElementById('studentRegUsername').value`);
  assert(prefilledRoll === '99ZZ999', `Roll Number prefilled automatically: ${prefilledRoll}`);

  await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'register_switched_to_student_view.png'));

  // Switch back to Parent Registration and test VALID roll number (21CS042)
  console.log('\n✨ 6. Testing Registered Roll Number "21CS042" (Live Auto-Verification)...');
  await cdp.evaluate(`setRegisterRole('parent')`);
  await new Promise(r => setTimeout(r, 300));

  await cdp.evaluate(`(() => {
    const rollInput = document.getElementById('parentRegStudentRoll');
    rollInput.value = '21CS042';
    validateParentStudentRollLive(true);
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const isRollValid = await cdp.evaluate(`document.getElementById('wrapper_parentRegStudentRoll').classList.contains('is-valid')`);
  assert(isRollValid === true, 'Student Roll field highlighted with glowing green border (.is-valid)');

  const rollSuccessText = await cdp.evaluate(`document.getElementById('feedback_parentRegStudentRoll').textContent`);
  assert(rollSuccessText.includes('Enrolled Student: John Doe'), `Inline success message: "${rollSuccessText.trim()}"`);

  const autoFilledName = await cdp.evaluate(`document.getElementById('parentRegStudentName').value`);
  assert(autoFilledName === 'John Doe', `Student Name auto-populated with enrolled record: "${autoFilledName}"`);

  await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'register_valid_roll_verified.png'));

  cdp.close();
  try { chromeProc.kill(); } catch (e) {}

  console.log('\n====================================================================');
  console.log(`🏁 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
