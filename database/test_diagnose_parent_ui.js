const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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
                            console.log('[BROWSER NETWORK RESPONSE]', r.status, r.url);
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

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

async function diagnose() {
    console.log('🔍 Starting Headless Chrome for Parent Registration UI Diagnosis...');

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const tempProfile = path.join('C:\\Users\\marig\\AppData\\Local\\Temp', 'chrome_diag_' + Date.now());

    const chromeProc = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9225',
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
            const res = await fetch('http://127.0.0.1:9225/json/version');
            if (res.ok) {
                const data = await res.json();
                wsUrl = data.webSocketDebuggerUrl;
                break;
            }
        } catch (e) {}
    }

    if (!wsUrl) {
        console.error('Could not connect to Chrome CDP');
        chromeProc.kill();
        process.exit(1);
    }

    const newPageRes = await fetch('http://127.0.0.1:9225/json/new?about:blank', { method: 'PUT' });
    const pageTarget = await newPageRes.json();
    const cdp = new ChromeCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    try {
        console.log('1. Navigating to:', BASE_URL);
        await cdp.send('Page.navigate', { url: BASE_URL });
        await new Promise(r => setTimeout(r, 1500));

        // Click enter button to dismiss welcome screen if visible
        const enterBtnClicked = await cdp.evaluate(`
            (() => {
                const btn = document.getElementById('welcomeEnterBtn');
                if (btn) { btn.click(); return true; }
                return false;
            })()
        `);
        console.log('Welcome button clicked:', enterBtnClicked);
        await new Promise(r => setTimeout(r, 1000));

        // Switch to parent registration
        console.log('2. Switching to Parent Registration Form...');
        const switched = await cdp.evaluate(`
            (() => {
                showParentRegisterForm();
                return {
                    authMode: currentAuthMode,
                    regRole: currentRegisterRole,
                    parentFormVisible: !document.getElementById('parentRegisterForm').classList.contains('hidden'),
                    loginSectionVisible: !document.getElementById('loginSection').classList.contains('hidden')
                };
            })()
        `);
        console.log('Switch status:', switched);

        console.log('2.5. Testing faceapi model loading in browser...');
        const modelTest = await cdp.evaluate(`
            (async () => {
                const res = {};
                try {
                    res.faceapiDefined = typeof faceapi !== 'undefined';
                    if (!res.faceapiDefined) return res;
                    res.initialBackend = faceapi.tf ? faceapi.tf.getBackend() : 'no tf';
                    res.registry = faceapi.tf ? Object.keys(faceapi.tf.engine().registry) : [];

                    // Explicitly test setting backend before load
                    if (faceapi.tf) {
                        try {
                            await faceapi.tf.setBackend('webgl');
                            await faceapi.tf.ready();
                            res.setBackend = 'webgl';
                        } catch (e) {
                            res.webglError = e.message;
                            await faceapi.tf.setBackend('cpu');
                            await faceapi.tf.ready();
                            res.setBackend = 'cpu';
                        }
                    }

                    const MODEL_URL = '/models';
                    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
                    res.ssdLoaded = faceapi.nets.ssdMobilenetv1.isLoaded;
                    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
                    res.landmarkLoaded = faceapi.nets.faceLandmark68Net.isLoaded;
                    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
                    res.recLoaded = faceapi.nets.faceRecognitionNet.isLoaded;
                    res.success = true;
                } catch (err) {
                    res.success = false;
                    res.error = err.message;
                    res.stack = err.stack;
                }
                return res;
            })()
        `);
        console.log('Model loading test result:', modelTest);

        // Fill out form
        const testTimestamp = Date.now().toString().slice(-6);
        const testMobile = `97${testTimestamp}11`;
        console.log(`3. Filling Parent Registration form with Mobile: ${testMobile}...`);

        const fillResult = await cdp.evaluate(`
            (async () => {
                const nameInput = document.getElementById('parentRegName');
                const mobileInput = document.getElementById('parentRegMobile');
                const relInput = document.getElementById('parentRegRelationship');
                const rollInput = document.getElementById('parentRegStudentRoll');
                const studentNameInput = document.getElementById('parentRegStudentName');
                const pwdInput = document.getElementById('parentRegPassword');
                const confirmInput = document.getElementById('parentRegConfirmPassword');

                nameInput.value = 'John Parent ' + '${testTimestamp}';
                nameInput.dispatchEvent(new Event('input'));
                nameInput.dispatchEvent(new Event('blur'));

                mobileInput.value = '${testMobile}';
                mobileInput.dispatchEvent(new Event('input'));
                mobileInput.dispatchEvent(new Event('blur'));

                relInput.value = 'Father';

                rollInput.value = '21CS042';
                rollInput.dispatchEvent(new Event('input'));
                rollInput.dispatchEvent(new Event('blur'));

                // Wait for roll validation debounce
                await new Promise(r => setTimeout(r, 600));

                studentNameInput.value = 'John Doe';
                studentNameInput.dispatchEvent(new Event('input'));
                studentNameInput.dispatchEvent(new Event('blur'));

                pwdInput.value = 'Password@123';
                pwdInput.dispatchEvent(new Event('input'));
                pwdInput.dispatchEvent(new Event('blur'));

                confirmInput.value = 'Password@123';
                confirmInput.dispatchEvent(new Event('input'));
                confirmInput.dispatchEvent(new Event('blur'));

                return {
                    nameVal: nameInput.value,
                    mobileVal: mobileInput.value,
                    rollVal: rollInput.value,
                    studentNameVal: studentNameInput.value,
                    rollFeedback: document.getElementById('feedback_parentRegStudentRoll').textContent
                };
            })()
        `);
        console.log('Fill result:', fillResult);

        // Submit form
        console.log('4. Clicking Create Parent Account button...');
        const submitRes = await cdp.evaluate(`
            (async () => {
                const btn = document.getElementById('btnParentRegisterSubmit');
                btn.click();
                await new Promise(r => setTimeout(r, 2000));

                const alertEl = document.getElementById('formAlert');
                const faceModal = document.getElementById('parentFirstTimeFaceModal');

                return {
                    alertVisible: alertEl ? !alertEl.classList.contains('hidden') : false,
                    alertText: alertEl ? alertEl.textContent : '',
                    faceModalVisible: faceModal ? (faceModal.style.display !== 'none' && !faceModal.classList.contains('hidden')) : false,
                    localStorageToken: !!localStorage.getItem('sh_token'),
                    localStorageUser: localStorage.getItem('sh_user'),
                    btnDisabled: btn ? btn.disabled : false
                };
            })()
        `);
        console.log('Submit result:', submitRes);

    } catch (err) {
        console.error('Diagnosis Error:', err);
    } finally {
        cdp.close();
        chromeProc.kill();
        process.exit(0);
    }
}

diagnose();
