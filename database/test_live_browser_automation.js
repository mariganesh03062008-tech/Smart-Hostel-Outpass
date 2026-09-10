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
        this.networkResponses = [];
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
                } else if (msg.method === 'Network.responseReceived') {
                    this.networkResponses.push(msg.params);
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

    async getResponseBody(requestId) {
        try {
            const res = await this.send('Network.getResponseBody', { requestId });
            return res.body;
        } catch (e) {
            return null;
        }
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

function formatLocalDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatLocalTime(d) {
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
}

async function runLiveBrowserVerification() {
    console.log('🧪 ========================================================');
    console.log('🚀 LIVE BROWSER VERIFICATION: SPECIAL OUTPASS SEPARATION');
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
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_live_verify_' + Date.now());
    
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
        // --- STEP 1: AUTH & SEED DATA ---
        console.log('--- Step 1: Seeding Test Records (Normal, Duty, Emergency, Special) ---');
        const studentLogin = await request('/api/auth/login', {
            method: 'POST',
            body: { username: '21CS042', password: 'Password@123', role: 'student' }
        });
        assert(studentLogin.ok, 'Student authenticated (21CS042)');
        const studentToken = studentLogin.data.token;

        const parentLogin = await request('/api/auth/login', {
            method: 'POST',
            body: { username: '9876543210', password: 'Password@123', role: 'parent' }
        });
        assert(parentLogin.ok, 'Parent authenticated (9876543210)');
        const parentToken = parentLogin.data.token;

        const advisorLogin = await request('/api/auth/login', {
            method: 'POST',
            body: { username: 'ADV-204', password: 'Password@123', role: 'class_advisor' }
        });
        assert(advisorLogin.ok, 'Class Advisor authenticated (ADV-204)');
        const advisorToken = advisorLogin.data.token;

        const principalLogin = await request('/api/auth/login', {
            method: 'POST',
            body: { username: 'PRC-001', password: 'Password@123', role: 'principal' }
        });
        assert(principalLogin.ok, 'Principal authenticated (PRC-001)');
        const principalToken = principalLogin.data.token;

        const wardenLogin = await request('/api/auth/login', {
            method: 'POST',
            body: { username: 'WRD-101', password: 'Password@123', role: 'warden' }
        });
        assert(wardenLogin.ok, 'Warden authenticated (WRD-101)');
        const wardenToken = wardenLogin.data.token;

        // Register parent face template
        const rawVec = new Array(128).fill(0).map((_, i) => Math.sin(i + 1));
        const norm = Math.sqrt(rawVec.reduce((s, v) => s + v * v, 0));
        const registeredFaceVec = rawVec.map(v => Number((v / norm).toFixed(6)));
        await request('/api/parent/face/register', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${parentToken}` },
            body: { faceDescriptor: registeredFaceVec, qualityScore: 0.98, singleFace: true }
        });
        const matchingFaceVec = registeredFaceVec.map((v, i) => v + (i % 2 === 0 ? 0.003 : -0.003));

        // Clean out existing pending requests for clean deterministic state
        await pool.query("UPDATE outpass_requests SET status = 'CANCELLED' WHERE status IN ('PENDING_PARENT', 'PENDING_ADVISOR', 'PENDING_PRINCIPAL', 'PENDING_WARDEN')");

        // Record 1: Normal Outpass (Parent face approved -> PENDING_WARDEN)
        const now = new Date();
        const departNormal = new Date(now.getTime() + 30 * 3600 * 1000);
        const returnNormal = new Date(departNormal.getTime() + 48 * 3600 * 1000);
        const normalRes = await request('/api/outpass', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${studentToken}` },
            body: {
                request_type: 'normal',
                destination: 'Home Town - Coimbatore',
                reason: 'Normal Outpass Live Check',
                leaving_date: formatLocalDate(departNormal),
                leaving_time: formatLocalTime(departNormal),
                expected_return_date: formatLocalDate(returnNormal),
                expected_return_time: formatLocalTime(returnNormal),
                student_phone: '9876543210'
            }
        });
        assert(normalRes.status === 201, '1. Normal outpass submitted');
        const normalId = normalRes.data.data.id;

        // Parent face verify & approve Normal
        const verifyResNormal = await request(`/api/parent/outpass/${normalId}/face-verify`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${parentToken}` },
            body: { faceDescriptor: matchingFaceVec, singleFace: true }
        });
        await request(`/api/parent/outpass/${normalId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${parentToken}` },
            body: { verification_token: verifyResNormal.data.verificationToken, parent_message: 'Approved Normal' }
        });

        // Record 2: One-Day Duty Outpass (Student submits -> PENDING_ADVISOR)
        const departDuty = new Date(now.getTime() + 30 * 3600 * 1000);
        const returnDuty = new Date(departDuty.getTime() + 10 * 3600 * 1000);
        const dutyRes = await request('/api/outpass', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${studentToken}` },
            body: {
                request_type: 'one_day_duty',
                event_name: 'Hackathon 2026',
                event_location: 'PSG Tech Coimbatore',
                duty_date: formatLocalDate(departDuty),
                destination: 'PSG Tech Coimbatore',
                reason: 'One-Day Duty Live Browser Check',
                leaving_date: formatLocalDate(departDuty),
                leaving_time: '08:00',
                expected_return_date: formatLocalDate(returnDuty),
                expected_return_time: '18:00',
                student_phone: '9876543210'
            }
        });
        assert(dutyRes.status === 201, '2. One-Day Duty outpass submitted');
        const dutyId = dutyRes.data.data.id;

        // Record 3: Emergency Outpass (Student submits -> PENDING_WARDEN)
        const departUrgent = new Date(now.getTime() + 2 * 3600 * 1000);
        const returnUrgent = new Date(departUrgent.getTime() + 6 * 3600 * 1000);
        const emerRes = await request('/api/outpass', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${studentToken}` },
            body: {
                request_type: 'emergency',
                emergency_type: 'medical',
                emergency_contact: '9988776655',
                additional_remarks: 'Sudden toothache',
                destination: 'City Hospital',
                reason: 'Medical Emergency Live Browser Check',
                leaving_date: formatLocalDate(departUrgent),
                leaving_time: formatLocalTime(departUrgent),
                expected_return_date: formatLocalDate(returnUrgent),
                expected_return_time: formatLocalTime(returnUrgent),
                student_phone: '9876543210'
            }
        });
        assert(emerRes.status === 201, '3. Emergency outpass submitted');
        const emerId = emerRes.data.data.id;

        // Record 4: Special Outpass (Student submits -> Parent face verify & approve -> PENDING_ADVISOR)
        const specialRes = await request('/api/outpass', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${studentToken}` },
            body: {
                request_type: 'special',
                special_type: 'competition',
                additional_remarks: 'National RoboWars Event',
                destination: 'IIT Madras',
                reason: 'Special Internship Live Browser Check',
                leaving_date: formatLocalDate(departUrgent),
                leaving_time: formatLocalTime(departUrgent),
                expected_return_date: formatLocalDate(returnUrgent),
                expected_return_time: formatLocalTime(returnUrgent),
                student_phone: '9876543210'
            }
        });
        assert(specialRes.status === 201, '4. Special outpass submitted');
        const specialId = specialRes.data.data.id;

        // Parent verify & approve Special
        const verifyResSpecial = await request(`/api/parent/outpass/${specialId}/face-verify`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${parentToken}` },
            body: { faceDescriptor: matchingFaceVec, singleFace: true }
        });
        await request(`/api/parent/outpass/${specialId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${parentToken}` },
            body: { verification_token: verifyResSpecial.data.verificationToken, parent_message: 'Approved for RoboWars' }
        });

        console.log(`\nRecords Created & Transitioned:
- Normal Outpass ID ${normalId} -> PENDING_WARDEN
- One-Day Duty ID ${dutyId} -> PENDING_ADVISOR
- Emergency Outpass ID ${emerId} -> PENDING_WARDEN
- Special Outpass ID ${specialId} -> PENDING_ADVISOR (Parent Face Verified)\n`);

        // --- STEP 2: LIVE BROWSER SESSION AS CLASS ADVISOR ---
        console.log('--- Step 2: Live Browser Verification - CLASS ADVISOR ---');
        
        // Open blank page in Chrome
        const newPageRes = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
        const pageTarget = await newPageRes.json();
        const client = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
        await client.connect();

        await client.send('Page.enable');
        await client.send('Network.enable');
        await client.send('Runtime.enable');

        // Prime localStorage for Class Advisor
        const advisorUserStr = JSON.stringify(advisorLogin.data.user);
        await client.send('Page.navigate', { url: `${BASE_URL}/advisor-dashboard.html` });
        await new Promise(r => setTimeout(r, 1000));
        
        await client.evaluate(`
            localStorage.setItem('sh_token', '${advisorToken}');
            localStorage.setItem('token', '${advisorToken}');
            localStorage.setItem('sh_user', '${advisorUserStr.replace(/'/g, "\\'")}');
            localStorage.setItem('user', '${advisorUserStr.replace(/'/g, "\\'")}');
        `);

        // Clear recorded responses before dashboard load
        client.networkResponses = [];
        await client.send('Page.navigate', { url: `${BASE_URL}/advisor-dashboard.html` });

        // Wait for dashboard fetch and render
        await new Promise(r => setTimeout(r, 2500));

        // Inspect captured network responses for advisor endpoints
        console.log('\n🔍 Inspecting Advisor Network API Responses...');
        let advisorDutyResponse = null;
        let advisorSpecialResponse = null;

        for (const resp of client.networkResponses) {
            const url = resp.response.url;
            if (url.includes('/api/advisor/duty/pending')) {
                const bodyStr = await client.getResponseBody(resp.requestId);
                if (bodyStr) advisorDutyResponse = JSON.parse(bodyStr);
            }
            if (url.includes('/api/advisor/special/pending')) {
                const bodyStr = await client.getResponseBody(resp.requestId);
                if (bodyStr) advisorSpecialResponse = JSON.parse(bodyStr);
            }
        }

        assert(advisorDutyResponse !== null, 'Network captured GET /api/advisor/duty/pending');
        console.log('   Duty Response sample:', JSON.stringify(advisorDutyResponse).substring(0, 160) + '...');
        
        const dutyListFromApi = advisorDutyResponse ? (advisorDutyResponse.dutyRequests || []) : [];
        const specialInDutyApi = dutyListFromApi.filter(r => (r.outpass_type || '').toLowerCase() === 'special');
        const dutyInDutyApi = dutyListFromApi.filter(r => (r.outpass_type || '').toLowerCase() === 'one_day_duty');
        assert(specialInDutyApi.length === 0, 'Zero Special requests inside /api/advisor/duty/pending response');
        assert(dutyInDutyApi.some(r => r.id === dutyId), `One-Day Duty ID ${dutyId} present inside /api/advisor/duty/pending response`);

        assert(advisorSpecialResponse !== null, 'Network captured GET /api/advisor/special/pending');
        console.log('   Special Response sample:', JSON.stringify(advisorSpecialResponse).substring(0, 160) + '...');
        
        const specialListFromApi = advisorSpecialResponse ? (advisorSpecialResponse.specialRequests || []) : [];
        const specialInSpecialApi = specialListFromApi.filter(r => (r.outpass_type || '').toLowerCase() === 'special');
        const dutyInSpecialApi = specialListFromApi.filter(r => (r.outpass_type || '').toLowerCase() === 'one_day_duty');
        const normalInSpecialApi = specialListFromApi.filter(r => (r.outpass_type || '').toLowerCase() === 'normal');
        assert(specialInSpecialApi.some(r => r.id === specialId), `Special request ID ${specialId} present inside /api/advisor/special/pending response`);
        assert(dutyInSpecialApi.length === 0, 'Zero One-Day Duty requests inside /api/advisor/special/pending response');
        assert(normalInSpecialApi.length === 0, 'Zero Normal/Emergency inside /api/advisor/special/pending response');

        // Check Live DOM in Advisor Dashboard
        console.log('\n🔍 Inspecting Advisor Live DOM Elements...');
        const advisorDom = await client.evaluate(`
            (() => {
                const dutyContainer = document.getElementById('dutyQueueContainer');
                const specialContainer = document.getElementById('specialQueueContainer');
                return {
                    dutyContainerExists: !!dutyContainer,
                    specialContainerExists: !!specialContainer,
                    dutyText: dutyContainer ? dutyContainer.innerText : '',
                    specialText: specialContainer ? specialContainer.innerText : '',
                    pendingDutyListLength: window.pendingDutyList ? window.pendingDutyList.length : -1,
                    pendingSpecialListLength: window.pendingSpecialList ? window.pendingSpecialList.length : -1
                };
            })()
        `);

        assert(advisorDom.dutyContainerExists, 'Live DOM contains #dutyQueueContainer');
        assert(advisorDom.specialContainerExists, 'Live DOM contains #specialQueueContainer');
        assert(advisorDom.dutyText.includes('One-Day Duty Live Browser Check'), 'One-Day Duty appears in #dutyQueueContainer');
        assert(!advisorDom.dutyText.includes('Special Internship Live Browser Check'), 'Special Outpass DOES NOT appear in #dutyQueueContainer');
        assert(advisorDom.specialText.includes('Special Internship Live Browser Check'), 'Special Outpass appears in #specialQueueContainer');
        assert(!advisorDom.specialText.includes('One-Day Duty Live Browser Check'), 'One-Day Duty DOES NOT appear in #specialQueueContainer');
        assert(!advisorDom.specialText.includes('Medical Emergency'), 'Emergency DOES NOT appear in #specialQueueContainer');
        assert(!advisorDom.specialText.includes('Normal Outpass'), 'Normal DOES NOT appear in #specialQueueContainer');

        // Test Tab Switching in Advisor Dashboard
        console.log('\n🔍 Testing Advisor Navigation & Tab Switching...');
        const tabTest = await client.evaluate(`
            (() => {
                const dutyTabBtn = document.querySelector('[data-tab="duty-queue"]');
                const specialTabBtn = document.querySelector('[data-tab="special-queue"]');
                
                // Click special tab
                if (specialTabBtn) specialTabBtn.click();
                const specialTabActive = document.getElementById('tab-special-queue') ? document.getElementById('tab-special-queue').classList.contains('active') : false;
                const dutyTabInactive = document.getElementById('tab-duty-queue') ? !document.getElementById('tab-duty-queue').classList.contains('active') : false;

                // Click duty tab
                if (dutyTabBtn) dutyTabBtn.click();
                const dutyTabActive = document.getElementById('tab-duty-queue') ? document.getElementById('tab-duty-queue').classList.contains('active') : false;
                const specialTabInactive = document.getElementById('tab-special-queue') ? !document.getElementById('tab-special-queue').classList.contains('active') : false;

                return {
                    specialTabActive,
                    dutyTabInactive,
                    dutyTabActive,
                    specialTabInactive
                };
            })()
        `);

        assert(tabTest.specialTabActive && tabTest.dutyTabInactive, 'Special Outpass tab opens and duty queue is hidden');
        assert(tabTest.dutyTabActive && tabTest.specialTabInactive, 'One-Day Duty tab opens and special queue is hidden');

        // Capture screenshot of Advisor Dashboard
        const artifactDir = 'C:\\Users\\marig\\.gemini\\antigravity-ide\\brain\\0c90062c-c4ab-4f4d-b70b-639fa8a7dc49';
        const advisorScreenshot = path.join(artifactDir, 'advisor_live_dashboard.png');
        await client.captureScreenshot(advisorScreenshot);

        // Advisor Approves both Duty and Special to advance to Principal
        console.log('\n--- Advisor Approves Duty and Special Outpasses ---');
        const advApproveDuty = await request(`/api/advisor/one-day/${dutyId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${advisorToken}` },
            body: { remarks: 'Advisor approved OD for Live Verification' }
        });
        assert(advApproveDuty.ok, `Advisor approved OD ID ${dutyId} -> PENDING_PRINCIPAL`);

        const advApproveSpecial = await request(`/api/advisor/special/${specialId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${advisorToken}` },
            body: { remarks: 'Advisor approved Special for Live Verification' }
        });
        assert(advApproveSpecial.ok, `Advisor approved Special ID ${specialId} -> PENDING_PRINCIPAL`);

        // --- STEP 3: LIVE BROWSER SESSION AS PRINCIPAL ---
        console.log('\n--- Step 3: Live Browser Verification - PRINCIPAL ---');
        const principalUserStr = JSON.stringify(principalLogin.data.user);
        
        await client.evaluate(`
            localStorage.setItem('sh_token', '${principalToken}');
            localStorage.setItem('token', '${principalToken}');
            localStorage.setItem('sh_user', '${principalUserStr.replace(/'/g, "\\'")}');
            localStorage.setItem('user', '${principalUserStr.replace(/'/g, "\\'")}');
        `);

        client.networkResponses = [];
        await client.send('Page.navigate', { url: `${BASE_URL}/principal-dashboard.html` });
        await new Promise(r => setTimeout(r, 2500));

        // Click One-Day Permission tab to trigger network fetch
        await client.evaluate(`(() => {
            const btn1 = document.querySelector('.warden-nav-btn[data-tab="one-day-permission"]');
            if (btn1) btn1.click();
        })()`);
        await new Promise(r => setTimeout(r, 1200));

        // Click Special Permission tab to trigger network fetch
        await client.evaluate(`(() => {
            const btn2 = document.querySelector('.warden-nav-btn[data-tab="special-permission"]');
            if (btn2) btn2.click();
        })()`);
        await new Promise(r => setTimeout(r, 1200));

        // Inspect captured network responses for principal endpoints
        console.log('\n🔍 Inspecting Principal Network API Responses...');
        let principalOneDayResponse = null;
        let principalSpecialResponse = null;

        for (const resp of client.networkResponses) {
            const url = resp.response.url;
            if (url.includes('/api/principal/one-day-permissions')) {
                const bodyStr = await client.getResponseBody(resp.requestId);
                if (bodyStr) principalOneDayResponse = JSON.parse(bodyStr);
            }
            if (url.includes('/api/principal/special-permissions')) {
                const bodyStr = await client.getResponseBody(resp.requestId);
                if (bodyStr) principalSpecialResponse = JSON.parse(bodyStr);
            }
        }

        assert(principalOneDayResponse !== null, 'Network captured GET /api/principal/one-day-permissions');
        console.log('   Principal One-Day Response sample:', JSON.stringify(principalOneDayResponse).substring(0, 160) + '...');
        
        const pDutyList = principalOneDayResponse ? (principalOneDayResponse.dutyRequests || principalOneDayResponse.permissions || []) : [];
        const pSpecialInDutyApi = pDutyList.filter(r => (r.outpass_type || '').toLowerCase() === 'special');
        const pDutyInDutyApi = pDutyList.filter(r => (r.outpass_type || '').toLowerCase() === 'one_day_duty');
        assert(pSpecialInDutyApi.length === 0, 'Zero Special requests inside /api/principal/one-day-permissions response');
        assert(pDutyInDutyApi.some(r => r.id === dutyId), `One-Day Duty ID ${dutyId} present inside /api/principal/one-day-permissions response`);

        assert(principalSpecialResponse !== null, 'Network captured GET /api/principal/special-permissions');
        console.log('   Principal Special Response sample:', JSON.stringify(principalSpecialResponse).substring(0, 160) + '...');

        const pSpecialList = principalSpecialResponse ? (principalSpecialResponse.specialRequests || []) : [];
        const pSpecialInSpecialApi = pSpecialList.filter(r => (r.outpass_type || '').toLowerCase() === 'special');
        const pDutyInSpecialApi = pSpecialList.filter(r => (r.outpass_type || '').toLowerCase() === 'one_day_duty');
        assert(pSpecialInSpecialApi.some(r => r.id === specialId), `Special request ID ${specialId} present inside /api/principal/special-permissions response`);
        assert(pDutyInSpecialApi.length === 0, 'Zero One-Day Duty requests inside /api/principal/special-permissions response');

        // Check Live DOM in Principal Dashboard
        console.log('\n🔍 Inspecting Principal Live DOM Elements...');
        const principalDom = await client.evaluate(`
            (() => {
                const dutyTbody = document.getElementById('oneDayTableBody');
                const specialTbody = document.getElementById('specialPermissionTableBody');
                return {
                    dutyTbodyExists: !!dutyTbody,
                    specialTbodyExists: !!specialTbody,
                    dutyText: dutyTbody ? dutyTbody.innerText : '',
                    specialText: specialTbody ? specialTbody.innerText : '',
                    currentDutyListLength: window.currentDutyList ? window.currentDutyList.length : -1,
                    currentSpecialListLength: window.currentSpecialList ? window.currentSpecialList.length : -1
                };
            })()
        `);

        assert(principalDom.dutyTbodyExists, 'Live DOM contains #oneDayTableBody');
        assert(principalDom.specialTbodyExists, 'Live DOM contains #specialPermissionTableBody');
        assert(principalDom.dutyText.includes('One-Day Duty Live Browser Check') || principalDom.dutyText.includes('Hackathon 2026'), 'One-Day Duty appears in #oneDayTableBody');
        assert(!principalDom.dutyText.includes('Special Internship Live Browser Check'), 'Special Outpass DOES NOT appear in #oneDayTableBody');
        assert(principalDom.specialText.includes('Special Internship Live Browser Check') || principalDom.specialText.includes('National RoboWars'), 'Special Outpass appears in #specialPermissionTableBody');
        assert(!principalDom.specialText.includes('One-Day Duty Live Browser Check'), 'One-Day Duty DOES NOT appear in #specialPermissionTableBody');

        // Test Tab Switching in Principal Dashboard
        console.log('\n🔍 Testing Principal Navigation & Tab Switching...');
        const pTabTest = await client.evaluate(`
            (() => {
                const dutyTabBtn = document.querySelector('.warden-nav-btn[data-tab="one-day-permission"]');
                const specialTabBtn = document.querySelector('.warden-nav-btn[data-tab="special-permission"]');
                
                // Click special tab
                if (specialTabBtn) specialTabBtn.click();
                const specialTabActive = document.getElementById('tab-special-permission') ? document.getElementById('tab-special-permission').classList.contains('active') : false;
                const dutyTabInactive = document.getElementById('tab-one-day-permission') ? !document.getElementById('tab-one-day-permission').classList.contains('active') : false;

                // Click duty tab
                if (dutyTabBtn) dutyTabBtn.click();
                const dutyTabActive = document.getElementById('tab-one-day-permission') ? document.getElementById('tab-one-day-permission').classList.contains('active') : false;
                const specialTabInactive = document.getElementById('tab-special-permission') ? !document.getElementById('tab-special-permission').classList.contains('active') : false;

                return {
                    specialTabActive,
                    dutyTabInactive,
                    dutyTabActive,
                    specialTabInactive
                };
            })()
        `);

        assert(pTabTest.specialTabActive && pTabTest.dutyTabInactive, 'Principal Special Permission tab opens and hides One-Day table');
        assert(pTabTest.dutyTabActive && pTabTest.specialTabInactive, 'Principal One-Day Permission tab opens and hides Special table');

        // Capture screenshot of Principal Dashboard
        const principalScreenshot = path.join(artifactDir, 'principal_live_dashboard.png');
        await client.captureScreenshot(principalScreenshot);

        // Principal Approvals
        console.log('\n--- Principal Approvals & Forwarding ---');
        const pApproveDuty = await request(`/api/principal/one-day/${dutyId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${principalToken}` },
            body: { remarks: 'Principal approved OD' }
        });
        assert(pApproveDuty.ok, `Principal approved One-Day Duty ID ${dutyId} -> APPROVED`);

        const pApproveSpecial = await request(`/api/principal/special/${specialId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${principalToken}` },
            body: { remarks: 'Principal approved Special' }
        });
        assert(pApproveSpecial.ok, `Principal approved Special ID ${specialId} -> PENDING_WARDEN (forwarded to Warden)`);

        // Check database state
        const dutyStatusCheck = await pool.query('SELECT status FROM outpass_requests WHERE id = ?', [dutyId]);
        assert(dutyStatusCheck[0][0].status === 'APPROVED', 'One-Day Duty is APPROVED upon Principal approval');

        const specialStatusCheck = await pool.query('SELECT status FROM outpass_requests WHERE id = ?', [specialId]);
        assert(specialStatusCheck[0][0].status === 'PENDING_WARDEN', 'Special Outpass advanced to PENDING_WARDEN (forwarded to Warden)');

        // Principal generates QR for One-Day Duty
        const principalGenDutyQr = await request(`/api/qr/generate/${dutyId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${principalToken}` }
        });
        assert(principalGenDutyQr.ok && principalGenDutyQr.data.data.qrImageData, 'Principal generates QR for One-Day Duty Pass');

        // Check qr_codes table
        const dutyQrCheck = await pool.query('SELECT id, token FROM qr_codes WHERE outpass_request_id = ?', [dutyId]);
        assert(dutyQrCheck[0].length > 0 && dutyQrCheck[0][0].token, 'One-Day Duty has active QR code record');

        const specialQrCheck = await pool.query('SELECT id, token FROM qr_codes WHERE outpass_request_id = ?', [specialId]);
        assert(specialQrCheck[0].length === 0, 'Special Outpass has NO premature QR code prior to Warden review');

        // --- STEP 4: WARDEN WORKFLOW VERIFICATION ---
        console.log('\n--- Step 4: Warden Dashboard Strict Isolation ---');
        const wardenPendingRes = await request('/api/outpass/warden/pending', {
            headers: { 'Authorization': `Bearer ${wardenToken}` }
        });
        assert(wardenPendingRes.ok, 'Warden fetched pending requests');
        const wardenSpecialList = wardenPendingRes.data.specialRequests || [];
        const wardenNormalList = wardenPendingRes.data.normalRequests || [];
        const wardenEmergencyList = wardenPendingRes.data.emergencyRequests || [];

        assert(wardenNormalList.some(r => r.id === normalId), `Normal outpass ID ${normalId} present in Warden normalRequests`);
        assert(wardenEmergencyList.some(r => r.id === emerId), `Emergency outpass ID ${emerId} present in Warden emergencyRequests`);
        assert(wardenSpecialList.some(r => r.id === specialId), `Special outpass ID ${specialId} present in Warden specialRequests`);

        // Verify zero cross-leakage in Warden
        assert(!wardenNormalList.some(r => r.id === specialId), 'Special Outpass does NOT leak into Warden normalRequests');
        assert(!wardenEmergencyList.some(r => r.id === specialId), 'Special Outpass does NOT leak into Warden emergencyRequests');
        assert(!wardenSpecialList.some(r => r.id === normalId), 'Normal Outpass does NOT leak into Warden specialRequests');
        assert(!wardenSpecialList.some(r => r.id === emerId), 'Emergency Outpass does NOT leak into Warden specialRequests');
        assert(!wardenSpecialList.some(r => r.id === dutyId), 'One-Day Duty does NOT appear in Warden specialRequests');

        // Warden Approves Special & Generates QR
        const wardenApproveSpecial = await request(`/api/outpass/${specialId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${wardenToken}` },
            body: { remarks: 'Warden approved Special Outpass' }
        });
        assert(wardenApproveSpecial.ok, `Warden approved Special ID ${specialId} -> APPROVED`);

        const wardenQrSpecial = await request(`/api/qr/generate/${specialId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${wardenToken}` }
        });
        assert(wardenQrSpecial.ok && wardenQrSpecial.data.data?.qrImageData, 'Warden successfully generated Gate Pass QR for Special Outpass');

        // --- STEP 5: STUDENT DASHBOARD FILTERS ---
        console.log('\n--- Step 5: Student Dashboard Filters Isolation ---');
        const studentOutpassRes = await request('/api/outpass/my-requests', {
            headers: { 'Authorization': `Bearer ${studentToken}` }
        });
        assert(studentOutpassRes.ok, 'Student fetched my-requests');
        const myRequests = studentOutpassRes.data.data || studentOutpassRes.data.requests || [];

        const studentNormals = myRequests.filter(r => (r.outpass_type || '').toLowerCase() === 'normal');
        const studentDuties = myRequests.filter(r => (r.outpass_type || '').toLowerCase() === 'one_day_duty');
        const studentEmergencies = myRequests.filter(r => (r.outpass_type || '').toLowerCase() === 'emergency');
        const studentSpecials = myRequests.filter(r => (r.outpass_type || '').toLowerCase() === 'special');

        assert(studentNormals.some(r => r.id === normalId), 'Normal filter correctly isolated for Student');
        assert(studentDuties.some(r => r.id === dutyId), 'Duty filter correctly isolated for Student');
        assert(studentEmergencies.some(r => r.id === emerId), 'Emergency filter correctly isolated for Student');
        assert(studentSpecials.some(r => r.id === specialId), 'Special filter correctly isolated for Student');

        // Cleanup
        client.close();
        chromeProc.kill();
        try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch(e) {}

        console.log('\n========================================================');
        console.log(`🏁 LIVE BROWSER VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
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

runLiveBrowserVerification().then(() => {
    process.exit(0);
});
