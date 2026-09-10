const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

class ChromeCDP {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.reqId = 1;
        this.callbacks = new Map();
        this.events = [];
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
                } else if (msg.method) {
                    this.events.push(msg);
                    if (msg.method === 'Runtime.consoleAPICalled') {
                        console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
                    }
                    if (msg.method === 'Network.responseReceived') {
                        const r = msg.params.response;
                        if (r.url.includes('/api/')) {
                            console.log('[BROWSER NETWORK]', r.status, r.url);
                        }
                    }
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

    async evaluate(expr) {
        const res = await this.send('Runtime.evaluate', {
            expression: expr,
            awaitPromise: true,
            returnByValue: true
        });
        if (res.exceptionDetails) {
            throw new Error(JSON.stringify(res.exceptionDetails));
        }
        return res.result ? res.result.value : undefined;
    }

    async captureScreenshot(filepath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
        console.log(`[SCREENSHOT] Saved to ${filepath}`);
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function runTest() {
    console.log('=== STARTING LIVE BROWSER END-TO-END REGISTRATION TEST ===\n');

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'smart_hostel_outpass',
        port: parseInt(process.env.DB_PORT || '3306')
    });

    const testMobile = '9870001122';
    await pool.query('DELETE FROM parents WHERE primary_phone = ?', [testMobile]);

    // Find student
    const [sRows] = await pool.query('SELECT reg_no, name FROM students WHERE is_active = true LIMIT 1');
    const testStudent = sRows[0];
    console.log(`Linking with student: ${testStudent.name} (${testStudent.reg_no})`);

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const cdpPort = 9224;
    const userDataDir = path.join(__dirname, '..', 'tmp_chrome_e2e');

    const chromeProcess = spawn(chromePath, [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--headless=new',
        '--disable-gpu',
        'about:blank'
    ]);

    await new Promise(r => setTimeout(r, 2000));

    let cdp = null;
    try {
        const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
        const targets = await targetsRes.json();
        const pageTarget = targets.find(t => t.type === 'page') || targets[0];
        cdp = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
        await cdp.connect();

        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Network.enable');

        console.log(`1. Navigating to ${BASE_URL}/index.html?mode=register&role=parent`);
        await cdp.send('Page.navigate', { url: `${BASE_URL}/index.html?mode=register&role=parent` });
        await new Promise(r => setTimeout(r, 2500));

        // Fill form fields
        console.log('2. Filling Parent Registration Form...');
        await cdp.evaluate(`
            document.getElementById('parentRegName').value = 'Mrs. Eleanor Vance';
            document.getElementById('parentRegMobile').value = '${testMobile}';
            document.getElementById('parentRegRelationship').value = 'Mother';
            document.getElementById('parentRegStudentRoll').value = '${testStudent.reg_no}';
            document.getElementById('parentRegStudentName').value = '${testStudent.name}';
            document.getElementById('parentRegPassword').value = 'Password@123';
            document.getElementById('parentRegConfirmPassword').value = 'Password@123';
        `);

        // Trigger roll validation
        await cdp.evaluate(`validateParentStudentRollLive(true)`);
        await new Promise(r => setTimeout(r, 800));

        console.log('3. Submitting Parent Registration Form...');
        await cdp.evaluate(`
            const form = document.getElementById('parentRegisterFormElement');
            const submitBtn = document.getElementById('btnParentRegisterSubmit');
            submitBtn.click();
        `);

        await new Promise(r => setTimeout(r, 2000));

        // Check if modal opened
        const modalVisible = await cdp.evaluate(`
            const m = document.getElementById('parentFirstTimeFaceModal');
            m && !m.classList.contains('hidden') && m.style.display !== 'none';
        `);
        console.log(`4. Face Registration Modal Visible: ${modalVisible}`);

        if (!modalVisible) {
            throw new Error('Face registration modal did not open!');
        }

        // Wait a moment for model initialization
        await new Promise(r => setTimeout(r, 1500));

        // Click capture
        console.log('5. Clicking "Capture & Complete Registration"...');
        await cdp.evaluate(`
            const btn = document.getElementById('btnCaptureFirstTimeFace');
            btn.click();
        `);

        // Wait for redirect to parent dashboard
        console.log('6. Waiting for navigation to parent-dashboard.html...');
        let currentUrl = '';
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            currentUrl = await cdp.evaluate(`window.location.href`);
            if (currentUrl.includes('parent-dashboard.html')) break;
        }

        console.log(`7. Final Browser URL: ${currentUrl}`);
        if (!currentUrl.includes('parent-dashboard.html')) {
            throw new Error(`Did not reach parent-dashboard.html! Current URL: ${currentUrl}`);
        }

        // Wait for dashboard data to render
        await new Promise(r => setTimeout(r, 2000));

        const dashboardData = await cdp.evaluate(`({
            parentName: document.getElementById('parentName')?.textContent,
            heroPhone: document.getElementById('heroParentMobile')?.textContent,
            heroStatus: document.getElementById('heroFaceStatus')?.textContent,
            wardMeta: document.getElementById('studentMetaPill')?.textContent
        })`);

        console.log('8. Parent Dashboard Rendered Data:', dashboardData);

        const screenshotPath = path.join(__dirname, '..', 'parent_e2e_dashboard_success.png');
        await cdp.captureScreenshot(screenshotPath);

        // Assertions
        if (!dashboardData.parentName || !dashboardData.parentName.includes('Eleanor Vance')) {
            throw new Error(`Expected parent name Eleanor Vance, got: ${dashboardData.parentName}`);
        }
        if (!dashboardData.heroStatus || !dashboardData.heroStatus.includes('ACTIVE')) {
            throw new Error(`Expected face status ACTIVE, got: ${dashboardData.heroStatus}`);
        }
        if (!dashboardData.wardMeta || !dashboardData.wardMeta.includes(testStudent.reg_no)) {
            throw new Error(`Expected linked student ${testStudent.reg_no}, got: ${dashboardData.wardMeta}`);
        }

        console.log('\n🎉 BROWSER E2E TEST COMPLETED WITH 100% SUCCESS!\n');

    } finally {
        if (cdp) cdp.close();
        chromeProcess.kill();
        await pool.query('DELETE FROM parents WHERE primary_phone = ?', [testMobile]);
        await pool.end();
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
    }
}

runTest().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
