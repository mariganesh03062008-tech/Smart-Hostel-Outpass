const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pool } = require('../utils/db');

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

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

async function request(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const headers = options.headers || {};
    if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({ statusText: res.statusText }));
    return { status: res.status, ok: res.ok, data };
}

async function runWardenNavigationTests() {
    console.log('🧪 ========================================================');
    console.log('🚀 WARDEN MODULE: STRICT NAVIGATION & CONTENT ISOLATION TEST');
    console.log(`📡 URL: ${BASE_URL}`);
    console.log('========================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, title, details = '') {
        if (condition) {
            console.log(`✅ [PASS] ${title}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${title} | ${details}`);
            failed++;
        }
    }

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_warden_nav_' + Date.now());
    
    const chromeProc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9222',
        `--user-data-dir=${tempProfile}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1400,900'
    ]);

    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
            const res = await fetch('http://127.0.0.1:9222/json/version');
            if (res.ok) {
                const data = await res.json();
                wsUrl = data.webSocketDebuggerUrl;
                break;
            }
        } catch (e) {}
    }

    if (!wsUrl) {
        console.error('Failed to connect to headless Chrome');
        chromeProc.kill();
        process.exit(1);
    }
    console.log('🌐 Connected to Chrome via CDP!\n');

    try {
        // Authenticate Warden
        const wardenLogin = await request('/api/auth/login', {
            method: 'POST',
            body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
        });
        assert(wardenLogin.ok && wardenLogin.data.token, 'Warden authenticated (WRD-101)');
        const wardenToken = wardenLogin.data.token;
        const wardenUserStr = JSON.stringify(wardenLogin.data.user);

        // Open page in Chrome
        const newPageRes = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
        const pageTarget = await newPageRes.json();
        const client = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
        await client.connect();
        await client.send('Page.enable');
        await client.send('Runtime.enable');

        // Prime credentials
        await client.send('Page.navigate', { url: `${BASE_URL}/warden-dashboard.html` });
        await new Promise(r => setTimeout(r, 1000));
        await client.evaluate(`
            localStorage.setItem('sh_token', '${wardenToken}');
            localStorage.setItem('token', '${wardenToken}');
            localStorage.setItem('sh_user', '${wardenUserStr.replace(/'/g, "\\'")}');
            localStorage.setItem('user', '${wardenUserStr.replace(/'/g, "\\'")}');
        `);

        // Navigate to dashboard
        await client.send('Page.navigate', { url: `${BASE_URL}/warden-dashboard.html` });
        await new Promise(r => setTimeout(r, 2000));

        // Helper to inspect all tab sections visibility
        async function getSectionVisibility() {
            return await client.evaluate(`
                (() => {
                    const sections = Array.from(document.querySelectorAll('.tab-section, .warden-section'));
                    const result = {};
                    sections.forEach(sec => {
                        const style = window.getComputedStyle(sec);
                        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && sec.offsetHeight > 0;
                        result[sec.id] = {
                            id: sec.id,
                            display: style.display,
                            offsetHeight: sec.offsetHeight,
                            hasActiveClass: sec.classList.contains('active'),
                            isVisible: isVisible
                        };
                    });

                    const activeBtns = Array.from(document.querySelectorAll('.warden-nav-btn.active')).map(b => b.dataset.tab || b.getAttribute('data-tab'));

                    return {
                        sections: result,
                        visibleCount: Object.values(result).filter(r => r.isVisible).length,
                        visibleIds: Object.values(result).filter(r => r.isVisible).map(r => r.id),
                        activeBtns: activeBtns
                    };
                })()
            `);
        }

        const artifactDir = 'C:\\Users\\marig\\.gemini\\antigravity-ide\\brain\\0c90062c-c4ab-4f4d-b70b-639fa8a7dc49';

        // --- TEST STEP 1: INITIAL LOAD DEFAULT SECTION ---
        console.log('\n--- Test Step 1: Default Initial Load (Dashboard Overview) ---');
        let vis = await getSectionVisibility();
        assert(vis.visibleCount === 1, `Exactly 1 section visible on initial load (Found ${vis.visibleCount}: ${vis.visibleIds.join(', ')})`);
        assert(vis.visibleIds[0] === 'tab-overview', 'Visible section is strictly #tab-overview');
        assert(vis.sections['tab-reports'].isVisible === false, 'Reports section #tab-reports is strictly hidden on load');
        assert(vis.sections['tab-profile'].isVisible === false, 'Profile section #tab-profile is strictly hidden on load');
        assert(vis.activeBtns.length === 1 && vis.activeBtns[0] === 'overview', 'Only Dashboard navigation button is active');
        await client.captureScreenshot(path.join(artifactDir, 'warden_tab_dashboard.png'));

        // --- TEST STEP 2: CLICK REPORTS ---
        console.log('\n--- Test Step 2: Click Reports Button ---');
        await client.evaluate(`document.querySelector('.warden-nav-btn[data-tab="reports"]').click();`);
        await new Promise(r => setTimeout(r, 1000));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1, `Exactly 1 section visible on Reports click (Found ${vis.visibleCount}: ${vis.visibleIds.join(', ')})`);
        assert(vis.visibleIds[0] === 'tab-reports', 'Visible section is strictly #tab-reports');
        assert(vis.sections['tab-overview'].isVisible === false, 'Dashboard #tab-overview is strictly hidden');
        assert(vis.sections['tab-profile'].isVisible === false, 'Profile #tab-profile is strictly hidden');
        assert(vis.activeBtns.length === 1 && vis.activeBtns[0] === 'reports', 'Only Reports navigation button is active');
        await client.captureScreenshot(path.join(artifactDir, 'warden_tab_reports.png'));

        // --- TEST STEP 3: CLICK PROFILE ---
        console.log('\n--- Test Step 3: Click Profile Button ---');
        await client.evaluate(`document.querySelector('.warden-nav-btn[data-tab="profile"]').click();`);
        await new Promise(r => setTimeout(r, 1000));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1, `Exactly 1 section visible on Profile click (Found ${vis.visibleCount}: ${vis.visibleIds.join(', ')})`);
        assert(vis.visibleIds[0] === 'tab-profile', 'Visible section is strictly #tab-profile');
        assert(vis.sections['tab-reports'].isVisible === false, 'CRITICAL: Reports #tab-reports does NOT appear at bottom of Profile');
        assert(vis.sections['tab-overview'].isVisible === false, 'Dashboard #tab-overview does NOT appear in Profile');
        assert(vis.activeBtns.length === 1 && vis.activeBtns[0] === 'profile', 'Only Profile navigation button is active');
        await client.captureScreenshot(path.join(artifactDir, 'warden_tab_profile.png'));

        // --- TEST STEP 4: CLICK SETTINGS ---
        console.log('\n--- Test Step 4: Click Settings Button ---');
        await client.evaluate(`document.querySelector('.warden-nav-btn[data-tab="settings"]').click();`);
        await new Promise(r => setTimeout(r, 1000));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1, `Exactly 1 section visible on Settings click (Found ${vis.visibleCount}: ${vis.visibleIds.join(', ')})`);
        assert(vis.visibleIds[0] === 'tab-settings', 'Visible section is strictly #tab-settings');
        assert(vis.sections['tab-reports'].isVisible === false, 'Reports does NOT appear in Settings');
        assert(vis.sections['tab-profile'].isVisible === false, 'Profile does NOT appear in Settings');
        assert(vis.sections['tab-overview'].isVisible === false, 'Dashboard does NOT appear in Settings');
        assert(vis.activeBtns.length === 1 && vis.activeBtns[0] === 'settings', 'Only Settings navigation button is active');
        await client.captureScreenshot(path.join(artifactDir, 'warden_tab_settings.png'));

        // --- TEST STEP 5: REPEAT NAVIGATION SEQUENCE ---
        console.log('\n--- Test Step 5: Repeat Full Navigation Sequence ---');
        // Click Dashboard
        await client.evaluate(`document.querySelector('.warden-nav-btn[data-tab="overview"]').click();`);
        await new Promise(r => setTimeout(r, 800));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-overview', 'Returned to Dashboard: ONLY #tab-overview is visible (Zero Reports)');

        // Click Reports
        await client.evaluate(`document.querySelector('.warden-nav-btn[data-tab="reports"]').click();`);
        await new Promise(r => setTimeout(r, 800));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-reports', 'Returned to Reports: ONLY #tab-reports is visible');

        // Click Profile
        await client.evaluate(`document.querySelector('.warden-nav-btn[data-tab="profile"]').click();`);
        await new Promise(r => setTimeout(r, 800));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-profile', 'Returned to Profile: ONLY #tab-profile is visible (Zero Reports at bottom)');

        // Click Dashboard again
        await client.evaluate(`document.querySelector('.warden-nav-btn[data-tab="overview"]').click();`);
        await new Promise(r => setTimeout(r, 800));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-overview', 'Returned to Dashboard again: ONLY #tab-overview is visible');

        // --- TEST STEP 6: VERIFY ALL OTHER TABS ---
        console.log('\n--- Test Step 6: Verify Outpass Tabs Strict Isolation ---');
        const tabsToTest = [
            { tab: 'normal-requests', id: 'tab-normal-requests' },
            { tab: 'emergency-requests', id: 'tab-emergency-requests' },
            { tab: 'special-requests', id: 'tab-special-requests' },
            { tab: 'duty-requests', id: 'tab-duty-requests' },
            { tab: 'active-passes', id: 'tab-active-passes' },
            { tab: 'extension-requests', id: 'tab-extension-requests' }
        ];

        for (const t of tabsToTest) {
            await client.evaluate(`showWardenSection('${t.tab}');`);
            await new Promise(r => setTimeout(r, 500));
            vis = await getSectionVisibility();
            assert(
                vis.visibleCount === 1 && vis.visibleIds[0] === t.id,
                `Tab "${t.tab}": ONLY #${t.id} is visible (No Reports, No Dashboard, No Profile)`
            );
        }

        // --- TEST STEP 7: HASH CHANGE & DIRECT URL NAVIGATION ---
        console.log('\n--- Test Step 7: Hash / History Navigation ---');
        await client.evaluate(`window.location.hash = '#reports';`);
        await new Promise(r => setTimeout(r, 500));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-reports', 'Hash navigation #reports shows ONLY #tab-reports');

        await client.evaluate(`window.location.hash = '#profile';`);
        await new Promise(r => setTimeout(r, 500));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-profile', 'Hash navigation #profile shows ONLY #tab-profile');

        client.close();
        chromeProc.kill();
        try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch(e) {}

        console.log('\n========================================================');
        console.log(`🏁 WARDEN NAVIGATION TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
        console.log('========================================================\n');

        if (failed > 0) {
            process.exit(1);
        }

    } catch (err) {
        console.error('Test execution error:', err);
        if (chromeProc) chromeProc.kill();
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runWardenNavigationTests().then(() => {
    process.exit(0);
});
