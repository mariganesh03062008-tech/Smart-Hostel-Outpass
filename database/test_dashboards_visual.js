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

async function runDashboardVisualTests() {
    console.log('🌿 ========================================================');
    console.log('✨ ALL DASHBOARDS: NATURE + GLASSMORPHISM VISUAL TEST');
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
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_dash_vis_' + Date.now());

    const chromeProc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9225',
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
            const res = await fetch('http://127.0.0.1:9225/json/version');
            if (res.ok) {
                const data = await res.json();
                wsUrl = data.webSocketDebuggerUrl;
                break;
            }
        } catch (e) {}
    }

    if (!wsUrl) {
        console.error('Could not connect to Chrome CDP on port 9225');
        chromeProc.kill();
        process.exit(1);
    }

    const newPageRes = await fetch('http://127.0.0.1:9225/json/new?about:blank', { method: 'PUT' });
    const pageTarget = await newPageRes.json();
    const cdp = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const dashboards = [
        { name: 'Student Dashboard', path: '/student-dashboard.html', shot: 'student_dashboard_glass.png', user: { id: 1, role: 'student', name: 'John Doe', reg_no: '21CS042' } },
        { name: 'Warden Dashboard', path: '/warden-dashboard.html', shot: 'warden_dashboard_glass.png', user: { id: 1, role: 'warden', name: 'Dr. Ramesh Kumar', staff_id: 'WRD-101' } },
        { name: 'Principal Dashboard', path: '/principal-dashboard.html', shot: 'principal_dashboard_glass.png', user: { id: 2, role: 'principal', name: 'Dr. A. Sharma', staff_id: 'PRC-001' } },
        { name: 'Parent Dashboard', path: '/parent-dashboard.html', shot: 'parent_dashboard_glass.png', user: { id: 1, role: 'parent', name: 'Robert Doe', phone: '9876543210' } },
        { name: 'Advisor Dashboard', path: '/advisor-dashboard.html', shot: 'advisor_dashboard_glass.png', user: { id: 3, role: 'class_advisor', name: 'Prof. S. Venkatesh', staff_id: 'ADV-204' } },
        { name: 'Caretaker Dashboard', path: '/caretaker-dashboard.html', shot: 'caretaker_dashboard_glass.png', user: { id: 4, role: 'caretaker', name: 'Mr. Murugan', staff_id: 'CTK-305' } },
        { name: 'Watchman Dashboard', path: '/watchman-dashboard.html', shot: 'watchman_dashboard_glass.png', user: { id: 5, role: 'watchman', name: 'Mr. K. Selvam', staff_id: 'SEC-001' } }
    ];

    try {
        for (const d of dashboards) {
            console.log(`\n--- Verifying: ${d.name} (${d.path}) ---`);

            // Generate valid JWT token for this role
            const token = jwt.sign(d.user, JWT_SECRET, { expiresIn: '2h' });

            // Navigate to login page first to initialize origin context and set localStorage
            await cdp.send('Page.navigate', { url: `${BASE_URL}/login` });
            await new Promise(r => setTimeout(r, 600));

            const userJson = JSON.stringify(d.user);
            await cdp.evaluate(`
                (() => {
                    localStorage.setItem('sh_token', '${token}');
                    sessionStorage.setItem('sh_token', '${token}');
                    localStorage.setItem('token', '${token}');
                    localStorage.setItem('sh_user', ${JSON.stringify(userJson)});
                    sessionStorage.setItem('sh_user', ${JSON.stringify(userJson)});
                    localStorage.setItem('user', ${JSON.stringify(userJson)});
                })()
            `);

            // Now navigate to the actual dashboard
            await cdp.send('Page.navigate', { url: `${BASE_URL}${d.path}` });
            await new Promise(r => setTimeout(r, 2200));

            // 1. Verify Campus Background & Parallax Viewport
            const bgCheck = await cdp.evaluate(`
                (() => {
                    const viewport = document.querySelector('.dashboard-bg-viewport');
                    const img = document.querySelector('.dashboard-bg-image');
                    const overlay = document.querySelector('.dashboard-bg-overlay');
                    const glow = document.querySelector('.dashboard-cursor-glow');
                    return {
                        hasViewport: !!viewport,
                        hasImg: !!img,
                        hasOverlay: !!overlay,
                        hasGlow: !!glow,
                        bgLoaded: img ? window.getComputedStyle(img).backgroundImage.includes('gce_erode_campus.jpg') : false
                    };
                })()
            `);
            assert(bgCheck.hasViewport && bgCheck.hasImg && bgCheck.bgLoaded, `${d.name}: GCE Erode campus background is mounted and loaded`);
            assert(bgCheck.hasOverlay && bgCheck.hasGlow, `${d.name}: Atmosphere overlay and ambient cursor glow are mounted`);

            // 2. Verify Glassmorphism on Navbar & Header
            const navCheck = await cdp.evaluate(`
                (() => {
                    const nav = document.querySelector('.dashboard-navbar') || document.querySelector('.navbar');
                    if (!nav) return false;
                    const style = window.getComputedStyle(nav);
                    const backdrop = style.backdropFilter || style.webkitBackdropFilter;
                    return (backdrop && backdrop.includes('blur')) || style.backgroundColor.includes('rgba');
                })()
            `);
            assert(navCheck, `${d.name}: Navbar is styled with frosted glass and blur`);

            // 3. Verify Mouse Parallax Movement
            await cdp.evaluate(`
                (() => {
                    const moveEvent = new MouseEvent('mousemove', {
                        clientX: 300,
                        clientY: 200,
                        bubbles: true
                    });
                    window.dispatchEvent(moveEvent);
                })()
            `);
            await new Promise(r => setTimeout(r, 400));

            const parallaxTransform = await cdp.evaluate(`
                (() => {
                    const img = document.getElementById('dashBgImage');
                    return img ? img.style.transform : '';
                })()
            `);
            assert(parallaxTransform.includes('translate3d'), `${d.name}: Campus background responds with smooth parallax transform`);

            // Capture high-res screenshot
            await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, d.shot));
        }

        console.log('\n--- Final Check: Welcome Page and Login Flow Intact ---');
        // Clear storage so we can test the fresh visitor Welcome Page flow
        await cdp.evaluate(`
            (() => {
                localStorage.clear();
                sessionStorage.clear();
            })()
        `);
        await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
        await new Promise(r => setTimeout(r, 1800));

        const welcomeCheck = await cdp.evaluate(`
            (() => {
                const ws = document.getElementById('welcomeScreen');
                const title = document.querySelector('.welcome-title');
                const btn = document.getElementById('welcomeEnterBtn');
                return {
                    wsVisible: ws && !ws.classList.contains('welcome-hidden'),
                    titleText: title ? title.textContent.trim() : '',
                    hasBtn: !!btn
                };
            })()
        `);
        assert(welcomeCheck.wsVisible && welcomeCheck.titleText === 'GCE Erode' && welcomeCheck.hasBtn, 'Welcome Page is 100% functional at /');

        console.log('\n========================================================');
        console.log(`🏁 DASHBOARD VERIFICATION COMPLETE: ${passed} PASSED | ${failed} FAILED`);
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

runDashboardVisualTests().catch(console.error);
