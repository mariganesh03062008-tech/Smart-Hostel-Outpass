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

async function runPrincipalNavigationTests() {
    console.log('🧪 ========================================================');
    console.log('🚀 PRINCIPAL MODULE: STRICT NAVIGATION & CONTENT ISOLATION TEST');
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
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_principal_nav_' + Date.now());
    
    const chromeProc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9224',
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
            const res = await fetch('http://127.0.0.1:9224/json/version');
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
        // Authenticate Principal
        const principalLogin = await request('/api/auth/login', {
            method: 'POST',
            body: { username: 'PRC-001', password: 'Password@123', role: 'principal' }
        });
        assert(principalLogin.ok && principalLogin.data.token, 'Principal authenticated (PRC-001)');
        const principalToken = principalLogin.data.token;
        const principalUserStr = JSON.stringify(principalLogin.data.user);

        // Open page in Chrome
        const newPageRes = await fetch('http://127.0.0.1:9224/json/new?about:blank', { method: 'PUT' });
        const pageTarget = await newPageRes.json();
        const client = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
        await client.connect();
        await client.send('Page.enable');
        await client.send('Runtime.enable');

        // Prime credentials
        await client.send('Page.navigate', { url: `${BASE_URL}/principal-dashboard.html` });
        await new Promise(r => setTimeout(r, 1000));
        await client.evaluate(`
            localStorage.setItem('sh_token', '${principalToken}');
            localStorage.setItem('token', '${principalToken}');
            localStorage.setItem('sh_user', '${principalUserStr.replace(/'/g, "\\'")}');
            localStorage.setItem('user', '${principalUserStr.replace(/'/g, "\\'")}');
        `);

        // Navigate to dashboard
        await client.send('Page.navigate', { url: `${BASE_URL}/principal-dashboard.html` });
        await new Promise(r => setTimeout(r, 2000));

        // Helper to inspect all tab sections visibility
        async function getSectionVisibility() {
            return await client.evaluate(`
                (() => {
                    const sections = Array.from(document.querySelectorAll('.tab-section, .principal-section'));
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

                    const activeBtns = Array.from(document.querySelectorAll('.warden-nav-btn.active, .principal-nav-btn.active')).map(b => b.dataset.tab || b.getAttribute('data-tab') || b.dataset.section || b.getAttribute('data-section'));

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
        assert(!vis.sections['tab-reports'].isVisible, 'Reports section #tab-reports is strictly hidden on load');
        assert(!vis.sections['tab-profile'].isVisible, 'Profile section #tab-profile is strictly hidden on load');
        assert(!vis.sections['tab-settings'].isVisible, 'Settings section #tab-settings is strictly hidden on load');
        assert(vis.activeBtns.includes('overview') && vis.activeBtns.length === 1, 'Only Dashboard navigation button is active');
        await client.captureScreenshot(path.join(artifactDir, 'principal_tab_dashboard.png'));

        // --- TEST STEP 2: CLICK REPORTS BUTTON ---
        console.log('\n--- Test Step 2: Click Reports Button ---');
        await client.evaluate(`
            (() => {
                const btn = document.querySelector('[data-tab="reports"]') || document.querySelector('[data-section="reports"]');
                if (btn) btn.click();
            })()
        `);
        await new Promise(r => setTimeout(r, 600));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1, `Exactly 1 section visible on Reports click (Found ${vis.visibleCount}: ${vis.visibleIds.join(', ')})`);
        assert(vis.visibleIds[0] === 'tab-reports', 'Visible section is strictly #tab-reports');
        assert(!vis.sections['tab-overview'].isVisible, 'Dashboard #tab-overview is strictly hidden');
        assert(!vis.sections['tab-profile'].isVisible, 'Profile #tab-profile is strictly hidden');
        assert(!vis.sections['tab-settings'].isVisible, 'Settings #tab-settings is strictly hidden');
        assert(vis.activeBtns.includes('reports') && vis.activeBtns.length === 1, 'Only Reports navigation button is active');
        await client.captureScreenshot(path.join(artifactDir, 'principal_tab_reports.png'));

        // --- TEST STEP 3: CLICK PROFILE BUTTON ---
        console.log('\n--- Test Step 3: Click Profile Button ---');
        await client.evaluate(`
            (() => {
                const btn = document.querySelector('[data-tab="profile"]') || document.querySelector('[data-section="profile"]');
                if (btn) btn.click();
            })()
        `);
        await new Promise(r => setTimeout(r, 600));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1, `Exactly 1 section visible on Profile click (Found ${vis.visibleCount}: ${vis.visibleIds.join(', ')})`);
        assert(vis.visibleIds[0] === 'tab-profile', 'Visible section is strictly #tab-profile');
        assert(!vis.sections['tab-reports'].isVisible, 'CRITICAL: Reports #tab-reports does NOT appear at bottom of Profile');
        assert(!vis.sections['tab-overview'].isVisible, 'Dashboard #tab-overview does NOT appear in Profile');
        assert(!vis.sections['tab-settings'].isVisible, 'Settings #tab-settings does NOT appear in Profile');
        assert(vis.activeBtns.includes('profile') && vis.activeBtns.length === 1, 'Only Profile navigation button is active');
        await client.captureScreenshot(path.join(artifactDir, 'principal_tab_profile.png'));

        // --- TEST STEP 4: CLICK SETTINGS BUTTON ---
        console.log('\n--- Test Step 4: Click Settings Button ---');
        await client.evaluate(`
            (() => {
                const btn = document.querySelector('[data-tab="settings"]') || document.querySelector('[data-section="settings"]');
                if (btn) btn.click();
            })()
        `);
        await new Promise(r => setTimeout(r, 600));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1, `Exactly 1 section visible on Settings click (Found ${vis.visibleCount}: ${vis.visibleIds.join(', ')})`);
        assert(vis.visibleIds[0] === 'tab-settings', 'Visible section is strictly #tab-settings');
        assert(!vis.sections['tab-reports'].isVisible, 'Reports does NOT appear in Settings');
        assert(!vis.sections['tab-profile'].isVisible, 'Profile does NOT appear in Settings');
        assert(!vis.sections['tab-overview'].isVisible, 'Dashboard does NOT appear in Settings');
        assert(vis.activeBtns.includes('settings') && vis.activeBtns.length === 1, 'Only Settings navigation button is active');
        await client.captureScreenshot(path.join(artifactDir, 'principal_tab_settings.png'));

        // --- TEST STEP 5: REPEAT FULL NAVIGATION SEQUENCE ---
        console.log('\n--- Test Step 5: Repeat Full Navigation Sequence ---');
        // Dashboard
        await client.evaluate(`showPrincipalSection('overview')`);
        await new Promise(r => setTimeout(r, 300));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-overview', 'Returned to Dashboard: ONLY #tab-overview is visible (Zero Reports)');

        // Reports
        await client.evaluate(`showPrincipalSection('reports')`);
        await new Promise(r => setTimeout(r, 300));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-reports', 'Returned to Reports: ONLY #tab-reports is visible');

        // Profile
        await client.evaluate(`showPrincipalSection('profile')`);
        await new Promise(r => setTimeout(r, 300));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-profile', 'Returned to Profile: ONLY #tab-profile is visible (Zero Reports at bottom)');

        // Dashboard again
        await client.evaluate(`showPrincipalSection('overview')`);
        await new Promise(r => setTimeout(r, 300));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-overview', 'Returned to Dashboard again: ONLY #tab-overview is visible');

        // --- TEST STEP 6: VERIFY ALL OTHER PRINCIPAL TABS STRICT ISOLATION ---
        console.log('\n--- Test Step 6: Verify Other Principal Tabs Strict Isolation ---');
        const otherTabs = [
            'normal-monitoring',
            'one-day-permission',
            'special-permission',
            'students-outside',
            'analytics'
        ];

        for (const tab of otherTabs) {
            await client.evaluate(`showPrincipalSection('${tab}')`);
            await new Promise(r => setTimeout(r, 200));
            vis = await getSectionVisibility();
            assert(
                vis.visibleCount === 1 && vis.visibleIds[0] === `tab-${tab}`,
                `Tab "${tab}": ONLY #tab-${tab} is visible (No Reports, No Dashboard, No Profile)`
            );
        }

        // --- TEST STEP 7: HASH & HISTORY NAVIGATION ---
        console.log('\n--- Test Step 7: Hash / History Navigation ---');
        await client.evaluate(`window.location.hash = '#reports'`);
        await new Promise(r => setTimeout(r, 400));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-reports', 'Hash navigation #reports shows ONLY #tab-reports');

        await client.evaluate(`window.location.hash = '#profile'`);
        await new Promise(r => setTimeout(r, 400));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-profile', 'Hash navigation #profile shows ONLY #tab-profile');

        await client.evaluate(`window.location.hash = '#settings'`);
        await new Promise(r => setTimeout(r, 400));
        vis = await getSectionVisibility();
        assert(vis.visibleCount === 1 && vis.visibleIds[0] === 'tab-settings', 'Hash navigation #settings shows ONLY #tab-settings');

        // --- SUMMARY ---
        console.log('\n========================================================');
        console.log(`🏁 PRINCIPAL NAVIGATION TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
        console.log('========================================================\n');

        client.close();
        chromeProc.kill();
        process.exit(failed > 0 ? 1 : 0);

    } catch (err) {
        console.error('Test error:', err);
        chromeProc.kill();
        process.exit(1);
    }
}

runPrincipalNavigationTests();
