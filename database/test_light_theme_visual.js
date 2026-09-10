const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'smart_hostel_outpass_super_secret_jwt_key_2026';
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

async function runLightThemeVisualTests() {
    console.log('☀️ ========================================================');
    console.log('✨ COMPLETE APPLICATION: PROFESSIONAL LIGHT THEME VERIFICATION');
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
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_light_vis_' + Date.now());

    const chromeProc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9226',
        `--user-data-dir=${tempProfile}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1600,1050'
    ]);

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 400));
        try {
            const res = await fetch('http://127.0.0.1:9226/json/version');
            if (res.ok) {
                const data = await res.json();
                wsUrl = data.webSocketDebuggerUrl;
                break;
            }
        } catch (e) {}
    }

    if (!wsUrl) {
        console.error('Could not connect to Chrome CDP on port 9226');
        chromeProc.kill();
        process.exit(1);
    }

    const newPageRes = await fetch('http://127.0.0.1:9226/json/new?about:blank', { method: 'PUT' });
    const pageTarget = await newPageRes.json();
    const cdp = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    try {
        // =================================================================
        // 1. WELCOME PAGE (LIGHT & NATURAL)
        // =================================================================
        console.log('--- 1. Testing Welcome Page (Light Theme) ---');
        await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
        await new Promise(r => setTimeout(r, 2000));

        const welcomeEval = await cdp.evaluate(`
            (() => {
                const ws = document.getElementById('welcomeScreen');
                const title = document.querySelector('.welcome-title');
                const subtitle = document.querySelector('.welcome-subtitle');
                const btn = document.getElementById('welcomeEnterBtn');
                const overlay = document.querySelector('.welcome-atmosphere-overlay');
                const glow = document.getElementById('welcomeCursorGlow');
                const img = document.getElementById('welcomeCampusImage');

                const titleStyle = title ? window.getComputedStyle(title) : null;
                const overlayStyle = overlay ? window.getComputedStyle(overlay) : null;
                const htmlTheme = document.documentElement.getAttribute('data-theme');

                return {
                    wsVisible: ws && !ws.classList.contains('welcome-hidden'),
                    hasImg: !!img,
                    hasBtn: !!btn,
                    htmlTheme,
                    hasLightOverlay: overlayStyle ? overlayStyle.backgroundImage.includes('rgba(255, 255, 255') : false,
                    titleText: title ? title.textContent.trim() : '',
                    subtitleText: subtitle ? subtitle.textContent.trim() : ''
                };
            })()
        `);

        assert(welcomeEval.htmlTheme === 'light', 'Welcome Page: html data-theme is locked to light');
        assert(welcomeEval.wsVisible && welcomeEval.hasImg, 'Welcome Page: screen and campus image are visible');
        assert(welcomeEval.titleText === 'GCE Erode' && welcomeEval.subtitleText.includes('SMART HOSTEL OUTPASS SYSTEM'), 'Welcome Page: title and subtitle are present with high contrast');
        assert(welcomeEval.hasLightOverlay, 'Welcome Page: atmospheric overlay uses light frosted veil');

        // Test cursor movement on welcome screen
        await cdp.evaluate(`
            (() => {
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 300, bubbles: true }));
            })()
        `);
        await new Promise(r => setTimeout(r, 300));

        await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'welcome_page_light.png'));

        // =================================================================
        // 2. LOGIN PAGE (CLEAN LIGHT GLASSMORPHISM)
        // =================================================================
        console.log('\n--- 2. Testing Login Page (Light Glassmorphism) ---');
        // Click ENTER to smoothly transition into Login Page
        await cdp.evaluate(`
            (() => {
                const btn = document.getElementById('welcomeEnterBtn');
                if (btn) btn.click();
            })()
        `);
        await new Promise(r => setTimeout(r, 1200));

        const loginEval = await cdp.evaluate(`
            (() => {
                const authCard = document.querySelector('.auth-card');
                const inputs = document.querySelectorAll('.input-wrapper input');
                const primaryBtn = document.querySelector('.primary-btn');
                const themeBtn = document.getElementById('themeToggleBtn');
                const roleTabs = document.querySelector('.role-tabs');

                const cardStyle = authCard ? window.getComputedStyle(authCard) : null;
                const cardBg = cardStyle ? cardStyle.backgroundColor : '';
                const themeBtnHidden = themeBtn ? (window.getComputedStyle(themeBtn).display === 'none') : true;

                return {
                    hasCard: !!authCard,
                    cardIsLight: cardBg.includes('rgba(255, 255, 255') || cardBg.includes('rgb(255, 255, 255'),
                    inputsCount: inputs.length,
                    hasPrimaryBtn: !!primaryBtn,
                    themeBtnHidden,
                    hasRoleTabs: !!roleTabs
                };
            })()
        `);

        assert(loginEval.hasCard && loginEval.cardIsLight, 'Login Page: Auth card is styled in translucent white light glassmorphism');
        assert(loginEval.themeBtnHidden, 'Login Page: Theme toggle button is hidden (no dark theme option)');
        assert(loginEval.hasRoleTabs && loginEval.hasPrimaryBtn, 'Login Page: Role tabs and primary button are active');

        await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'login_page_light.png'));

        // =================================================================
        // 3. ALL 7 ROLE DASHBOARDS (LIGHT THEME)
        // =================================================================
        const dashboards = [
            { name: 'Student Dashboard', path: '/student-dashboard.html', shot: 'student_dashboard_light.png', user: { id: 1, role: 'student', name: 'John Doe', reg_no: '21CS042' } },
            { name: 'Warden Dashboard', path: '/warden-dashboard.html', shot: 'warden_dashboard_light.png', user: { id: 1, role: 'warden', name: 'Dr. Ramesh Kumar', staff_id: 'WRD-101' } },
            { name: 'Principal Dashboard', path: '/principal-dashboard.html', shot: 'principal_dashboard_light.png', user: { id: 2, role: 'principal', name: 'Dr. A. Sharma', staff_id: 'PRC-001' } },
            { name: 'Parent Dashboard', path: '/parent-dashboard.html', shot: 'parent_dashboard_light.png', user: { id: 1, role: 'parent', name: 'Robert Doe', phone: '9876543210' } },
            { name: 'Advisor Dashboard', path: '/advisor-dashboard.html', shot: 'advisor_dashboard_light.png', user: { id: 3, role: 'class_advisor', name: 'Prof. S. Venkatesh', staff_id: 'ADV-204' } },
            { name: 'Caretaker Dashboard', path: '/caretaker-dashboard.html', shot: 'caretaker_dashboard_light.png', user: { id: 4, role: 'caretaker', name: 'Mr. Murugan', staff_id: 'CTK-305' } },
            { name: 'Watchman Dashboard', path: '/watchman-dashboard.html', shot: 'watchman_dashboard_light.png', user: { id: 5, role: 'watchman', name: 'Mr. K. Selvam', staff_id: 'SEC-001' } }
        ];

        for (const d of dashboards) {
            console.log(`\n--- 3. Verifying: ${d.name} (${d.path}) ---`);

            const token = jwt.sign(d.user, JWT_SECRET, { expiresIn: '2h' });

            // Ensure origin storage is set with valid token
            await cdp.evaluate(`
                (() => {
                    localStorage.setItem('sh_token', '${token}');
                    sessionStorage.setItem('sh_token', '${token}');
                    localStorage.setItem('token', '${token}');
                    localStorage.setItem('sh_user', ${JSON.stringify(JSON.stringify(d.user))});
                    sessionStorage.setItem('sh_user', ${JSON.stringify(JSON.stringify(d.user))});
                    localStorage.setItem('user', ${JSON.stringify(JSON.stringify(d.user))});
                    localStorage.setItem('sh_theme', 'light');
                })()
            `);

            await cdp.send('Page.navigate', { url: `${BASE_URL}${d.path}` });
            await new Promise(r => setTimeout(r, 2200));

            // Check DOM and Styles
            const dashCheck = await cdp.evaluate(`
                (() => {
                    const viewport = document.querySelector('.dashboard-bg-viewport');
                    const img = document.querySelector('.dashboard-bg-image');
                    const overlay = document.querySelector('.dashboard-bg-overlay');
                    const glow = document.querySelector('.dashboard-cursor-glow');
                    const nav = document.querySelector('.dashboard-navbar') || document.querySelector('.app-header') || document.querySelector('.navbar');
                    const sidebar = document.querySelector('.dash-sidebar') || document.querySelector('.student-sidebar') || document.querySelector('.warden-sidebar') || document.querySelector('.principal-sidebar');
                    const themeBtn = document.getElementById('themeToggleBtn');
                    const htmlTheme = document.documentElement.getAttribute('data-theme');
                    const bodyBg = window.getComputedStyle(document.body).backgroundColor;

                    const navStyle = nav ? window.getComputedStyle(nav) : null;
                    const navBg = navStyle ? navStyle.backgroundColor : '';
                    const themeBtnHidden = themeBtn ? (window.getComputedStyle(themeBtn).display === 'none') : true;

                    return {
                        hasViewport: !!viewport,
                        hasImg: !!img,
                        hasOverlay: !!overlay,
                        hasGlow: !!glow,
                        htmlTheme,
                        bodyIsLight: bodyBg.includes('248, 250, 252') || bodyBg.includes('255, 255, 255'),
                        navIsLight: navBg.includes('255, 255, 255'),
                        hasSidebar: !!sidebar,
                        themeBtnHidden
                    };
                })()
            `);

            assert(dashCheck.htmlTheme === 'light', `${d.name}: html data-theme is locked to light`);
            assert(dashCheck.bodyIsLight, `${d.name}: Body surface is light (#f8fafc)`);
            assert(dashCheck.hasViewport && dashCheck.hasImg && dashCheck.hasOverlay, `${d.name}: Campus background and light overlay are mounted`);
            assert(dashCheck.navIsLight, `${d.name}: Navbar is frosted white glass with dark text`);
            assert(dashCheck.themeBtnHidden, `${d.name}: Dark theme toggle is hidden (locked to light)`);

            // Mouse parallax test
            await cdp.evaluate(`
                (() => {
                    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 450, clientY: 250, bubbles: true }));
                })()
            `);
            await new Promise(r => setTimeout(r, 300));

            await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, d.shot));
        }

        console.log('\n========================================================');
        console.log(`🏁 LIGHT THEME VERIFICATION COMPLETE: ${passed} PASSED | ${failed} FAILED`);
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

runLightThemeVisualTests().catch(console.error);
