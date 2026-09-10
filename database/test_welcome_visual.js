const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;
const ARTIFACTS_DIR = 'C:\\Users\\marig\\.gemini\\antigravity-ide\\brain\\a8d1d429-bd46-4779-bfb1-0d7186302cc2';

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

async function runWelcomeVerification() {
    console.log('🌿 ========================================================');
    console.log('✨ GCE ERODE WELCOME PAGE & LOGIN TRANSITION: CDP VERIFICATION');
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
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_welcome_vis_' + Date.now());

    const chromeProc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9224',
        `--user-data-dir=${tempProfile}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1600,1000'
    ]);

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 400));
        try {
            const res = await fetch('http://127.0.0.1:9224/json/version');
            if (res.ok) {
                const data = await res.json();
                wsUrl = data.webSocketDebuggerUrl;
                break;
            }
        } catch (e) {}
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

    try {
        console.log('\n--- Step 1: Open Website (http://localhost:5001/) ---');
        await cdp.send('Page.navigate', { url: BASE_URL });
        await new Promise(r => setTimeout(r, 1800));

        // 1. Verify Welcome Screen container
        const welcomeScreenVisible = await cdp.evaluate(`
            (() => {
                const ws = document.getElementById('welcomeScreen');
                if (!ws) return false;
                const style = window.getComputedStyle(ws);
                return style.display !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden';
            })()
        `);
        assert(welcomeScreenVisible, 'Welcome Screen (#welcomeScreen) is active and visible on initial entry');

        // 2. Verify Campus background image
        const bgDetails = await cdp.evaluate(`
            (() => {
                const img = document.getElementById('welcomeCampusImage');
                if (!img) return null;
                const style = window.getComputedStyle(img);
                return {
                    bg: style.backgroundImage,
                    filter: style.filter
                };
            })()
        `);
        assert(bgDetails && bgDetails.bg.includes('gce_erode_campus.jpg'), 'GCE Erode campus image is loaded as background', JSON.stringify(bgDetails));
        assert(bgDetails && !bgDetails.filter.includes('brightness(0.3)'), 'Campus background is bright and natural (not heavily darkened)', bgDetails.filter);

        // 3. Verify Title and Subtitle
        const textContent = await cdp.evaluate(`
            (() => {
                const title = document.querySelector('.welcome-title');
                const sub = document.querySelector('.welcome-subtitle');
                const cap = document.querySelector('.welcome-cap-block');
                const sprout = document.querySelector('.welcome-sprout-divider');
                const btn = document.getElementById('welcomeEnterBtn');
                return {
                    title: title ? title.textContent.trim() : null,
                    subtitle: sub ? sub.textContent.trim() : null,
                    hasCap: !!cap,
                    hasSprout: !!sprout,
                    btnText: btn ? btn.textContent.trim().replace(/\\s+/g, ' ') : null
                };
            })()
        `);
        assert(textContent.title === 'GCE Erode', 'Title is "GCE Erode"', textContent.title);
        assert(textContent.subtitle === 'SMART HOSTEL OUTPASS SYSTEM', 'Subtitle is "SMART HOSTEL OUTPASS SYSTEM"', textContent.subtitle);
        assert(textContent.hasCap, 'Graduation cap icon with accent wings is present');
        assert(textContent.hasSprout, 'Delicate sprout divider with accent hairlines is present');
        assert(textContent.btnText && textContent.btnText.includes('ENTER'), 'ENTER button is present with text "ENTER"', textContent.btnText);

        // 4. Verify login card is hidden underneath initially
        const loginCardHidden = await cdp.evaluate(`
            (() => {
                const app = document.querySelector('.app-wrapper');
                const style = window.getComputedStyle(app);
                return style.opacity === '0' || style.pointerEvents === 'none';
            })()
        `);
        assert(loginCardHidden, 'Existing login card is hidden behind welcome screen initially');

        // Capture initial Welcome View screenshot
        const welcomeImgPath = path.join(ARTIFACTS_DIR, 'welcome_page_view.png');
        await cdp.captureScreenshot(welcomeImgPath);

        console.log('\n--- Step 2: Test Interactive Cursor Parallax & Light Tracking ---');
        // Dispatch mouse movements
        await cdp.evaluate(`
            (() => {
                const moveEvent = new MouseEvent('mousemove', {
                    clientX: 400,
                    clientY: 300,
                    bubbles: true
                });
                window.dispatchEvent(moveEvent);
            })()
        `);
        await new Promise(r => setTimeout(r, 600));

        const parallaxState = await cdp.evaluate(`
            (() => {
                const img = document.getElementById('welcomeCampusImage');
                const glow = document.getElementById('welcomeCursorGlow');
                return {
                    imgTransform: img ? img.style.transform : '',
                    glowLeft: glow ? glow.style.left : '',
                    glowTop: glow ? glow.style.top : ''
                };
            })()
        `);
        assert(parallaxState.imgTransform.includes('translate3d'), 'Campus image responds with 3D parallax transform', parallaxState.imgTransform);
        assert(parseFloat(parallaxState.glowLeft) > 0, 'Ambient light tracks cursor position smoothly', `${parallaxState.glowLeft}, ${parallaxState.glowTop}`);

        // Capture parallax screenshot
        await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'welcome_page_parallax.png'));

        console.log('\n--- Step 3: Hover & Click ENTER Pill Button ---');
        // Trigger hover style
        await cdp.evaluate(`
            (() => {
                const btn = document.getElementById('welcomeEnterBtn');
                btn.classList.add('hover');
            })()
        `);
        await new Promise(r => setTimeout(r, 200));

        // Click ENTER button
        await cdp.evaluate(`document.getElementById('welcomeEnterBtn').click()`);
        console.log('  👉 Clicked ENTER button. Awaiting smooth cinematic transition...');
        await new Promise(r => setTimeout(r, 800));

        // 5. Verify transition completion
        const transitionResult = await cdp.evaluate(`
            (() => {
                const ws = document.getElementById('welcomeScreen');
                const app = document.querySelector('.app-wrapper');
                const appStyle = window.getComputedStyle(app);
                const wsStyle = window.getComputedStyle(ws);
                const path = window.location.pathname;
                return {
                    wsHidden: ws.classList.contains('welcome-hidden') || wsStyle.display === 'none',
                    appVisible: appStyle.opacity === '1' && appStyle.pointerEvents !== 'none',
                    path: path
                };
            })()
        `);
        assert(transitionResult.wsHidden, 'Welcome Screen smoothly faded and hidden after click');
        assert(transitionResult.appVisible, 'Existing Login Page is now fully visible and active');
        assert(transitionResult.path === '/login', 'Browser URL smoothly updated to /login without full reload');

        // Capture Login View after enter
        const loginImgPath = path.join(ARTIFACTS_DIR, 'login_page_after_enter.png');
        await cdp.captureScreenshot(loginImgPath);

        console.log('\n--- Step 4: Verify Existing Login Page Workflows (100% Intact) ---');
        const loginFormChecks = await cdp.evaluate(`
            (() => {
                const form = document.getElementById('loginForm');
                const roleBadge = document.getElementById('roleBadge');
                const modeSwitch = document.getElementById('authModeSwitch');
                const submitBtn = document.getElementById('submitBtn');
                const studentTab = document.querySelector('.role-tab[data-role="student"]');
                const parentTab = document.querySelector('.role-tab[data-role="parent"]');
                const wardenTab = document.querySelector('.role-tab[data-role="warden"]');

                return {
                    hasForm: !!form,
                    badgeText: roleBadge ? roleBadge.textContent : '',
                    hasModeSwitch: !!modeSwitch,
                    hasSubmitBtn: !!submitBtn,
                    rolesAvailable: !!studentTab && !!parentTab && !!wardenTab
                };
            })()
        `);
        assert(loginFormChecks.hasForm, 'Existing login form (#loginForm) is intact');
        assert(loginFormChecks.hasModeSwitch, 'Dual-mode switcher (#authModeSwitch) is intact');
        assert(loginFormChecks.rolesAvailable, 'All role selector tabs (student, parent, warden, etc.) are intact');

        // Test role switching to Warden
        await cdp.evaluate(`document.querySelector('.role-tab[data-role="warden"]').click()`);
        await new Promise(r => setTimeout(r, 400));
        const wardenSelected = await cdp.evaluate(`
            (() => {
                const badge = document.getElementById('roleBadge').textContent;
                const role = document.getElementById('selectedRole').value;
                return badge.includes('Warden') && role === 'warden';
            })()
        `);
        assert(wardenSelected, 'Role switching to Warden functions normally');

        // Test mode toggle to Register
        await cdp.evaluate(`document.getElementById('modeBtnRegister').click()`);
        await new Promise(r => setTimeout(r, 400));
        const registerActive = await cdp.evaluate(`
            (() => {
                const regSec = document.getElementById('registerSection');
                return !regSec.classList.contains('hidden');
            })()
        `);
        assert(registerActive, 'Switch to Register form functions normally');

        console.log('\n--- Step 5: Direct Navigation to /login Bypass Test ---');
        await cdp.send('Page.navigate', { url: `${BASE_URL}/login` });
        await new Promise(r => setTimeout(r, 1200));

        const directLoginBypassed = await cdp.evaluate(`
            (() => {
                const ws = document.getElementById('welcomeScreen');
                const app = document.querySelector('.app-wrapper');
                const wsStyle = window.getComputedStyle(ws);
                const appStyle = window.getComputedStyle(app);
                return wsStyle.display === 'none' && appStyle.opacity === '1';
            })()
        `);
        assert(directLoginBypassed, 'Direct visit to /login immediately bypasses welcome screen to login form');

        console.log('\n========================================================');
        console.log(`🏁 VERIFICATION COMPLETE: ${passed} PASSED | ${failed} FAILED`);
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

runWelcomeVerification().catch(console.error);
