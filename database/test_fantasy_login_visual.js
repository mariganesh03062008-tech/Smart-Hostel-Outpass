const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5001;
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
        if (this.ws) {
            this.ws.close();
        }
    }
}

async function runVisualTests() {
    console.log('🌌 ========================================================');
    console.log('✨ FANTASY LOGIN & DUAL-MODE AUTH: CDP VISUAL VERIFICATION');
    console.log(`📡 URL: ${BASE_URL}`);
    console.log('========================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, title, details = '') {
        if (condition) {
            console.log(`  ✅ [PASS] ${title}`);
            passed++;
        } else {
            console.error(`  ❌ [FAIL] ${title} | ${details}`);
            failed++;
        }
    }

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_fantasy_vis_' + Date.now());

    const chromeProc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9223',
        `--user-data-dir=${tempProfile}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1440,920'
    ]);

    let wsUrl = null;
    for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 400));
        try {
            const res = await fetch('http://127.0.0.1:9223/json/version');
            if (res.ok) {
                const data = await res.json();
                wsUrl = data.webSocketDebuggerUrl;
                break;
            }
        } catch (e) {}
    }

    if (!wsUrl) {
        console.error('Could not connect to Chrome CDP on port 9223');
        chromeProc.kill();
        process.exit(1);
    }

    const newPageRes = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' });
    const pageTarget = await newPageRes.json();
    const cdp = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    try {
        console.log('\n--- Step 1: Navigate to Login Page ---');
        await cdp.send('Page.navigate', { url: BASE_URL });
        await new Promise(r => setTimeout(r, 2000));

        // Check Canvas
        const canvasExists = await cdp.evaluate(`!!document.getElementById('fantasyCanvas')`);
        assert(canvasExists, 'Fantasy animation canvas exists in DOM');

        const canvasSize = await cdp.evaluate(`
            (() => {
                const c = document.getElementById('fantasyCanvas');
                return { w: c.width, h: c.height };
            })()
        `);
        assert(canvasSize.w > 0 && canvasSize.h > 0, `Fantasy canvas initialized with dimensions (${canvasSize.w}x${canvasSize.h})`);

        // Check Animated GCE Erode Campus Background
        const campusBgExists = await cdp.evaluate(`
            (() => {
                const container = document.querySelector('.campus-bg-container');
                const image = document.querySelector('.campus-bg-image');
                return !!container && !!image;
            })()
        `);
        assert(campusBgExists, 'GCE Erode animated campus background container and image exist');

        // Check extra hero content removed
        const heroRemoved = await cdp.evaluate(`!document.querySelector('.hero-card')`);
        assert(heroRemoved, 'Extra left hero card (.hero-card) removed from login page');

        // Check mode switcher
        const modeSwitchExists = await cdp.evaluate(`!!document.getElementById('authModeSwitch')`);
        assert(modeSwitchExists, 'Dual-mode switcher pill (#authModeSwitch) exists');

        const initialMode = await cdp.evaluate(`
            (() => {
                const isLoginActive = document.getElementById('modeBtnLogin').classList.contains('active');
                const isRegActive = document.getElementById('modeBtnRegister').classList.contains('active');
                const loginSecVisible = !document.getElementById('loginSection').classList.contains('hidden');
                const regSecHidden = document.getElementById('registerSection').classList.contains('hidden');
                return isLoginActive && !isRegActive && loginSecVisible && regSecHidden;
            })()
        `);
        assert(initialMode, 'Default initial mode is strictly "Login"');

        // Capture Login View Screenshot
        await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'fantasy_login_view.png'));

        console.log('\n--- Step 2: Switch to "Register" Mode ---');
        await cdp.evaluate(`document.getElementById('modeBtnRegister').click()`);
        await new Promise(r => setTimeout(r, 600));

        const isRegisterMode = await cdp.evaluate(`
            (() => {
                const switchHasClass = document.getElementById('authModeSwitch').classList.contains('is-register');
                const regBtnActive = document.getElementById('modeBtnRegister').classList.contains('active');
                const loginSecHidden = document.getElementById('loginSection').classList.contains('hidden');
                const regSecVisible = !document.getElementById('registerSection').classList.contains('hidden');
                const parentFormVisible = !document.getElementById('parentRegisterForm').classList.contains('hidden');
                const hasStudentRoll = !!document.getElementById('parentRegStudentRoll');
                const hasStudentName = !!document.getElementById('parentRegStudentName');
                return switchHasClass && regBtnActive && loginSecHidden && regSecVisible && parentFormVisible && hasStudentRoll && hasStudentName;
            })()
        `);
        assert(isRegisterMode, 'Register mode activated: Switch slid right, parent registration form directly displayed');

        // Capture Parent Register Screenshot
        await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'fantasy_register_parent_view.png'));

        console.log('\n--- Step 3: Switch Back to "Sign In" Mode ---');
        await cdp.evaluate(`document.getElementById('modeBtnLogin').click()`);
        await new Promise(r => setTimeout(r, 600));

        const returnedToLogin = await cdp.evaluate(`
            (() => {
                const switchNoClass = !document.getElementById('authModeSwitch').classList.contains('is-register');
                const loginBtnActive = document.getElementById('modeBtnLogin').classList.contains('active');
                const loginSecVisible = !document.getElementById('loginSection').classList.contains('hidden');
                const regSecHidden = document.getElementById('registerSection').classList.contains('hidden');
                return switchNoClass && loginBtnActive && loginSecVisible && regSecHidden;
            })()
        `);
        assert(returnedToLogin, 'Returned smoothly to Sign In mode');

        console.log('\n--- Step 5: Expand Demo Credentials Drawer and Autofill ---');
        await cdp.evaluate(`toggleDemoAccounts()`);
        await new Promise(r => setTimeout(r, 400));

        const drawerOpen = await cdp.evaluate(`document.getElementById('demoChipsDrawer').classList.contains('open')`);
        assert(drawerOpen, 'Demo credentials drawer expanded successfully');

        // Click Parent demo chip
        await cdp.evaluate(`document.querySelector('[data-fill-role="parent"]').click()`);
        await new Promise(r => setTimeout(r, 500));

        const autofillVerified = await cdp.evaluate(`
            (() => {
                const parentTabActive = document.querySelector('.role-tab[data-role="parent"]').classList.contains('active');
                const idVal = document.getElementById('identifierInput').value;
                const passVal = document.getElementById('passwordInput').value;
                return parentTabActive && idVal === '9876543210' && passVal === 'Password@123';
            })()
        `);
        assert(autofillVerified, 'Parent demo chip clicked: switched role to parent and autofilled credentials');

        // Capture Autofilled Parent Login Screenshot
        await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'fantasy_login_parent_autofilled.png'));

        console.log('\n========================================================');
        console.log(`🏁 VISUAL VERIFICATION: ${passed} PASSED | ${failed} FAILED`);
        console.log('========================================================\n');

    } catch (err) {
        console.error('Test execution error:', err);
    } finally {
        cdp.close();
        chromeProc.kill();
        try {
            fs.rmSync(tempProfile, { recursive: true, force: true });
        } catch (e) {}
    }
}

runVisualTests().catch(console.error);
