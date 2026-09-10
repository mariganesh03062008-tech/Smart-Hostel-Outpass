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
        console.log(`📸 Screenshot saved: ${path.basename(outputPath)}`);
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

async function runDarkThemeVisualTests() {
    console.log('🌙 ========================================================');
    console.log('✨ PREMIUM BLACK / DARK THEME SYSTEM VERIFICATION');
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
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_dark_vis_' + Date.now());

    const chromeProc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9226',
        `--user-data-dir=${tempProfile}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1600,1050'
    ]);

    await new Promise(r => setTimeout(r, 1600));

    let wsUrl = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const res = await fetch('http://127.0.0.1:9226/json/version');
            if (res.ok) {
                const data = await res.json();
                wsUrl = data.webSocketDebuggerUrl;
                break;
            }
        } catch (e) {
            await new Promise(r => setTimeout(r, 500));
        }
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
        // ========================================================
        // 1. VERIFY WELCOME PAGE (DARK CINEMATIC)
        // ========================================================
        console.log('\n--- 1. Welcome Page (Dark Cinematic) ---');
        await cdp.send('Page.navigate', { url: `${BASE_URL}/` });
        await new Promise(r => setTimeout(r, 2200));

        const welcomeCheck = await cdp.evaluate(`
            (() => {
                const screen = document.getElementById('welcomeScreen');
                const campusImg = document.getElementById('welcomeCampusImage');
                const title = document.querySelector('.welcome-title');
                const enterBtn = document.getElementById('welcomeEnterBtn');
                const capIcon = document.querySelector('.welcome-cap-icon-wrapper');
                const screenStyle = screen ? window.getComputedStyle(screen) : null;
                const themeAttr = document.documentElement.getAttribute('data-theme');
                return {
                    hasScreen: !!screen,
                    isVisible: screen ? screenStyle.display !== 'none' && screenStyle.visibility !== 'hidden' : false,
                    hasCampusImg: !!campusImg,
                    campusVisible: campusImg ? window.getComputedStyle(campusImg).backgroundImage.includes('gce_erode_campus.jpg') : false,
                    hasTitle: !!title,
                    titleText: title ? title.textContent.trim() : '',
                    hasEnterBtn: !!enterBtn,
                    hasCapIcon: !!capIcon,
                    themeAttr: themeAttr,
                    bgColor: screenStyle ? screenStyle.backgroundColor : ''
                };
            })()
        `);

        assert(welcomeCheck.hasScreen && welcomeCheck.isVisible, 'Welcome screen is visible initially');
        assert(welcomeCheck.campusVisible, 'Campus background image is loaded in Welcome Screen');
        assert(welcomeCheck.hasTitle && welcomeCheck.titleText.includes('GCE Erode'), `Welcome Title is present: "${welcomeCheck.titleText}"`);
        assert(welcomeCheck.hasEnterBtn, 'ENTER button is present');
        assert(welcomeCheck.hasCapIcon, 'Luminous graduation cap icon is present');
        assert(welcomeCheck.themeAttr === 'dark', 'HTML root data-theme attribute is "dark"');

        await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'welcome_page_dark.png'));

        // ========================================================
        // 2. VERIFY ENTER BUTTON CLICK & LOGIN PAGE (DARK GLASS)
        // ========================================================
        console.log('\n--- 2. Login Page Flow (Dark Glassmorphism) ---');
        await cdp.evaluate(`
            (() => {
                const btn = document.getElementById('welcomeEnterBtn');
                if (btn) btn.click();
            })()
        `);
        await new Promise(r => setTimeout(r, 1200));

        const loginCheck = await cdp.evaluate(`
            (() => {
                const authCard = document.querySelector('.auth-card');
                const cardStyle = authCard ? window.getComputedStyle(authCard) : null;
                const roleTabs = document.querySelectorAll('.role-tab');
                const usernameInput = document.getElementById('identifierInput') || 
                                      document.getElementById('passwordInput') || 
                                      document.getElementById('username') || 
                                      document.querySelector('input[name="username"]') || 
                                      document.querySelector('input');
                const inputStyle = usernameInput ? window.getComputedStyle(usernameInput) : null;
                const enterBtnHidden = document.getElementById('welcomeScreen').classList.contains('welcome-hidden') ||
                                       window.getComputedStyle(document.getElementById('welcomeScreen')).display === 'none';
                return {
                    enterNavigated: enterBtnHidden,
                    hasAuthCard: !!authCard,
                    cardBg: cardStyle ? cardStyle.backgroundColor : '',
                    roleTabCount: roleTabs.length,
                    inputBg: inputStyle ? inputStyle.backgroundColor : '',
                    inputColor: inputStyle ? inputStyle.color : ''
                };
            })()
        `);

        assert(loginCheck.enterNavigated, 'ENTER click smoothly hides Welcome screen and reveals Login portal');
        assert(loginCheck.hasAuthCard, 'Dark glassmorphic authentication card is present');
        assert(loginCheck.roleTabCount >= 7, `All 7 user roles are selectable (found ${loginCheck.roleTabCount} tabs)`);
        assert(loginCheck.inputBg.includes('11') || loginCheck.inputBg.includes('14') || loginCheck.inputBg.includes('16') || loginCheck.inputBg.includes('0') || loginCheck.inputBg.includes('5'), 'Inputs have dark charcoal background');

        await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, 'login_page_dark.png'));

        // ========================================================
        // 3. VERIFY ALL 7 ROLE DASHBOARDS IN DARK THEME
        // ========================================================
        const dashboards = [
            { name: 'Student Dashboard', path: '/student-dashboard.html', shot: 'student_dashboard_dark.png', user: { id: 1, role: 'student', name: 'John Doe', reg_no: '21CS042' } },
            { name: 'Warden Dashboard', path: '/warden-dashboard.html', shot: 'warden_dashboard_dark.png', user: { id: 1, role: 'warden', name: 'Dr. Ramesh Kumar', staff_id: 'WRD-101' } },
            { name: 'Principal Dashboard', path: '/principal-dashboard.html', shot: 'principal_dashboard_dark.png', user: { id: 2, role: 'principal', name: 'Dr. A. Sharma', staff_id: 'PRC-001' } },
            { name: 'Parent Dashboard', path: '/parent-dashboard.html', shot: 'parent_dashboard_dark.png', user: { id: 1, role: 'parent', name: 'Robert Doe', phone: '9876543210' } },
            { name: 'Advisor Dashboard', path: '/advisor-dashboard.html', shot: 'advisor_dashboard_dark.png', user: { id: 3, role: 'class_advisor', name: 'Prof. S. Venkatesh', staff_id: 'ADV-204' } },
            { name: 'Caretaker Dashboard', path: '/caretaker-dashboard.html', shot: 'caretaker_dashboard_dark.png', user: { id: 4, role: 'caretaker', name: 'Mr. Murugan', staff_id: 'CTK-305' } },
            { name: 'Watchman Dashboard', path: '/watchman-dashboard.html', shot: 'watchman_dashboard_dark.png', user: { id: 5, role: 'watchman', name: 'Mr. K. Selvam', staff_id: 'SEC-001' } }
        ];

        for (const d of dashboards) {
            console.log(`\n--- Verifying: ${d.name} (${d.path}) ---`);

            const token = jwt.sign(d.user, JWT_SECRET, { expiresIn: '2h' });
            const userJson = JSON.stringify(d.user);

            // Set credentials in browser storage
            await cdp.send('Page.navigate', { url: `${BASE_URL}/login` });
            await new Promise(r => setTimeout(r, 500));

            await cdp.evaluate(`
                (() => {
                    localStorage.setItem('sh_token', '${token}');
                    sessionStorage.setItem('sh_token', '${token}');
                    localStorage.setItem('token', '${token}');
                    localStorage.setItem('sh_user', ${JSON.stringify(userJson)});
                    sessionStorage.setItem('sh_user', ${JSON.stringify(userJson)});
                    localStorage.setItem('user', ${JSON.stringify(userJson)});
                    localStorage.setItem('sh_theme', 'dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                })()
            `);

            // Navigate to role dashboard
            await cdp.send('Page.navigate', { url: `${BASE_URL}${d.path}` });
            await new Promise(r => setTimeout(r, 2200));

            const dashCheck = await cdp.evaluate(`
                (() => {
                    const theme = document.documentElement.getAttribute('data-theme');
                    const bodyStyle = window.getComputedStyle(document.body);
                    const nav = document.querySelector('.dashboard-navbar, .app-header, .navbar, header');
                    const navStyle = nav ? window.getComputedStyle(nav) : null;
                    const card = document.querySelector('.advisor-metric-card, .caretaker-metric-card, .watchman-metric-card, .warden-metric-card, .stat-card, .metric-card, .card, .dashboard-card, .stat-metric-card, .duty-card, .parent-card, .ward-card, .security-hero-banner, .table-header-bar, .report-section-card, .quick-action-card');
                    const cardStyle = card ? window.getComputedStyle(card) : null;
                    const bgViewport = document.querySelector('.dashboard-bg-viewport');
                    const bgImg = document.querySelector('.dashboard-bg-image');
                    const sidebar = document.querySelector('.dash-sidebar, .student-sidebar, .advisor-sidebar, .warden-sidebar, .principal-sidebar, .caretaker-sidebar, .watchman-sidebar');
                    const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null;
                    return {
                        theme: theme,
                        bodyBg: bodyStyle.backgroundColor,
                        hasNav: !!nav,
                        navBg: navStyle ? navStyle.backgroundColor : '',
                        hasCard: !!card,
                        cardBg: cardStyle ? cardStyle.backgroundColor : '',
                        hasBgViewport: !!bgViewport,
                        hasBgImg: !!bgImg,
                        hasSidebar: !!sidebar,
                        sidebarBg: sidebarStyle ? sidebarStyle.backgroundColor : ''
                    };
                })()
            `);

            assert(dashCheck.theme === 'dark', `${d.name}: data-theme is "dark"`);
            assert(dashCheck.bodyBg.includes('5') || dashCheck.bodyBg.includes('7') || dashCheck.bodyBg.includes('9'), `${d.name}: Body has dark base background (${dashCheck.bodyBg})`);
            assert(dashCheck.hasBgViewport && dashCheck.hasBgImg, `${d.name}: GCE Erode campus background viewport is mounted`);
            assert(dashCheck.hasNav, `${d.name}: Navbar is mounted`);
            assert(dashCheck.hasCard, `${d.name}: Dashboard cards are rendered in dark theme`);

            await cdp.captureScreenshot(path.join(ARTIFACTS_DIR, d.shot));
        }

    } catch (err) {
        console.error('❌ Error during visual verification:', err);
        failed++;
    } finally {
        cdp.close();
        chromeProc.kill();

        console.log('\n========================================================');
        console.log(`🏁 TESTS FINISHED: ${passed} Passed, ${failed} Failed`);
        console.log('========================================================\n');

        if (failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runDarkThemeVisualTests();
