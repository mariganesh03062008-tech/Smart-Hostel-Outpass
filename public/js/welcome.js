/**
 * ==========================================================
 * GCE ERODE SMART HOSTEL OUTPASS SYSTEM - WELCOME PAGE CONTROLLER
 * ==========================================================
 * Visual recreation matching reference_image.png:
 * - Real-time cursor-based cinematic background parallax
 * - Ambient cursor-following light illuminating campus
 * - Delicate floating dust & firefly motes particle engine
 * - Automatic harmonic drift fallback for touch screens & mobile
 * - Zero-reload, zero-duplication transition to existing login page
 * - Full route & browser history navigation support
 */

(function () {
  'use strict';

  // DOM references
  let welcomeScreen = null;
  let campusImage = null;
  let cursorGlow = null;
  let centerContent = null;
  let enterBtn = null;
  let particlesCanvas = null;
  let pCtx = null;

  // Animation & Parallax State
  let animFrameId = null;
  let isWelcomeActive = false;
  let isTransitioning = false;
  let isTouchDevice = false;

  // Mouse coordinates (interpolated with lerp for silky 60fps)
  let mouse = {
    screenX: window.innerWidth / 2,
    screenY: window.innerHeight / 2,
    normX: 0, // -1 to +1
    normY: 0,
    hasMoved: false
  };

  // Interpolated values
  let currentBgX = 0, targetBgX = 0;
  let currentBgY = 0, targetBgY = 0;
  let currentLightX = window.innerWidth / 2, targetLightX = window.innerWidth / 2;
  let currentLightY = window.innerHeight / 2, targetLightY = window.innerHeight / 2;
  let currentContentX = 0, targetContentX = 0;
  let currentContentY = 0, targetContentY = 0;

  // Autonomous harmonic drift timer (for touch screens or idle cursor)
  let idleTimer = 0;

  // Particles
  let particles = [];
  const PARTICLE_COUNT = 38;
  const PARTICLE_COLORS = [
    { r: 52, g: 211, b: 153 },  // Mint Emerald
    { r: 45, g: 212, b: 191 },  // Vibrant Teal
    { r: 56, g: 189, b: 248 },  // Sky Cyan
    { r: 251, g: 191, b: 36 }   // Sunlight Amber Gold
  ];

  /**
   * Initializes particle system
   */
  function initParticles() {
    if (!particlesCanvas) return;
    pCtx = particlesCanvas.getContext('2d');
    resizeParticlesCanvas();

    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(true));
    }
  }

  function resizeParticlesCanvas() {
    if (!particlesCanvas) return;
    particlesCanvas.width = window.innerWidth;
    particlesCanvas.height = window.innerHeight;
  }

  function createParticle(initial = false) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];

    return {
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 10,
      radius: Math.random() * 2.2 + 0.8,
      baseRadius: Math.random() * 2.2 + 0.8,
      vx: (Math.random() - 0.5) * 0.45,
      vy: -(Math.random() * 0.55 + 0.25),
      color: color,
      alpha: Math.random() * 0.55 + 0.25,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.02 + 0.015,
      swayOffset: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 0.015 + 0.008
    };
  }

  function updateAndDrawParticles() {
    if (!pCtx || !particlesCanvas) return;
    const w = particlesCanvas.width;
    const h = particlesCanvas.height;

    pCtx.clearRect(0, 0, w, h);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.pulse += p.pulseSpeed;
      p.swayOffset += p.swaySpeed;

      // Vertical drift with gentle horizontal swaying
      p.y += p.vy;
      p.x += p.vx + Math.sin(p.swayOffset) * 0.35;

      // Soft response to cursor position
      if (mouse.hasMoved && !isTouchDevice) {
        const dx = p.x - currentLightX;
        const dy = p.y - currentLightY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180 && dist > 0) {
          const force = (1 - dist / 180) * 0.8;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }
      }

      // Reset particle if scrolled out of screen
      if (p.y < -15 || p.x < -20 || p.x > w + 20) {
        particles[i] = createParticle(false);
        continue;
      }

      // Draw glowing particle
      const currentAlpha = Math.max(0.1, p.alpha + Math.sin(p.pulse) * 0.2);
      const rad = p.radius + Math.sin(p.pulse) * 0.4;

      pCtx.save();
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, Math.max(0.6, rad), 0, Math.PI * 2);
      pCtx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${currentAlpha})`;
      pCtx.shadowColor = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, 0.8)`;
      pCtx.shadowBlur = rad * 4;
      pCtx.fill();
      pCtx.restore();
    }
  }

  /**
   * High performance render loop (runs only when welcome screen is visible)
   */
  function renderLoop() {
    if (!isWelcomeActive) return;

    // 1. Calculate targets
    if (isTouchDevice || !mouse.hasMoved) {
      // Harmonic ambient floating drift when on touch or idle
      idleTimer += 0.016;
      targetBgX = Math.sin(idleTimer * 0.45) * 8;
      targetBgY = Math.cos(idleTimer * 0.35) * 6;
      targetContentX = -targetBgX * 0.25;
      targetContentY = -targetBgY * 0.25;

      targetLightX = (window.innerWidth / 2) + Math.sin(idleTimer * 0.6) * 120;
      targetLightY = (window.innerHeight / 2) + Math.cos(idleTimer * 0.5) * 90;
    } else {
      // CURSOR PARALLAX:
      // Cursor moves RIGHT -> background moves slightly LEFT
      // Cursor moves LEFT  -> background moves slightly RIGHT
      // Cursor moves UP    -> background moves slightly DOWN
      // Cursor moves DOWN  -> background moves slightly UP
      const MAX_BG_SHIFT = 15; // pixels
      targetBgX = -mouse.normX * MAX_BG_SHIFT;
      targetBgY = -mouse.normY * MAX_BG_SHIFT;

      // Center content micro-shift in opposite direction for subtle 3D depth
      const MAX_CONTENT_SHIFT = 4; // pixels
      targetContentX = mouse.normX * MAX_CONTENT_SHIFT;
      targetContentY = mouse.normY * MAX_CONTENT_SHIFT;

      // Soft light follows cursor
      targetLightX = mouse.screenX;
      targetLightY = mouse.screenY;
    }

    // 2. Smooth Lerp Interpolation
    currentBgX += (targetBgX - currentBgX) * 0.055;
    currentBgY += (targetBgY - currentBgY) * 0.055;

    currentContentX += (targetContentX - currentContentX) * 0.065;
    currentContentY += (targetContentY - currentContentY) * 0.065;

    currentLightX += (targetLightX - currentLightX) * 0.08;
    currentLightY += (targetLightY - currentLightY) * 0.08;

    // 3. Apply Transforms via GPU-accelerated translate3d
    if (campusImage) {
      campusImage.style.transform = `translate3d(${currentBgX.toFixed(2)}px, ${currentBgY.toFixed(2)}px, 0) scale(1.035)`;
    }

    if (centerContent) {
      centerContent.style.transform = `translate3d(${currentContentX.toFixed(2)}px, ${currentContentY.toFixed(2)}px, 0)`;
    }

    if (cursorGlow) {
      cursorGlow.style.left = `${currentLightX.toFixed(1)}px`;
      cursorGlow.style.top = `${currentLightY.toFixed(1)}px`;
    }

    // 4. Update Particle Canvas
    updateAndDrawParticles();

    // 5. Schedule next frame
    animFrameId = requestAnimationFrame(renderLoop);
  }

  /**
   * Tracks mouse movement over viewport
   */
  function handleMouseMove(e) {
    mouse.screenX = e.clientX;
    mouse.screenY = e.clientY;
    mouse.normX = (e.clientX / window.innerWidth) * 2 - 1; // -1 to +1
    mouse.normY = (e.clientY / window.innerHeight) * 2 - 1; // -1 to +1
    mouse.hasMoved = true;
  }

  /**
   * Smoothly navigates from Welcome Page to existing Login Page
   */
  function enterPortal(e) {
    if (e) e.preventDefault();
    if (isTransitioning || !welcomeScreen) return;

    isTransitioning = true;

    // 1. Play smooth exit transition
    welcomeScreen.classList.add('welcome-exiting');
    document.body.classList.remove('welcome-active');
    document.body.classList.add('welcome-transitioning');

    // 2. Update browser history to /login without full page reload
    try {
      if (window.location.pathname !== '/login') {
        window.history.pushState({ view: 'login' }, '', '/login');
      }
    } catch (err) {
      console.warn('[Welcome] History push failed:', err);
    }

    // 3. Complete transition after animation finish
    setTimeout(() => {
      welcomeScreen.classList.add('welcome-hidden');
      isWelcomeActive = false;
      isTransitioning = false;

      // Stop animation loop to save 100% CPU/GPU resources
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }

      // Detach mouse listeners
      window.removeEventListener('mousemove', handleMouseMove);

      // Focus on role input or first login input on the existing login page
      const firstInput = document.getElementById('identifierInput') || document.querySelector('.auth-card input');
      if (firstInput) {
        try { firstInput.focus(); } catch (_) {}
      }
    }, 660);
  }

  /**
   * Re-opens welcome screen (e.g. if browser back button is clicked)
   */
  function showWelcomeScreen() {
    if (!welcomeScreen) return;

    isWelcomeActive = true;
    isTransitioning = false;

    welcomeScreen.classList.remove('welcome-hidden', 'welcome-exiting');
    document.body.classList.add('welcome-active');
    document.body.classList.remove('welcome-transitioning');

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    if (!animFrameId) {
      animFrameId = requestAnimationFrame(renderLoop);
    }
  }

  /**
   * Determines whether to show welcome screen or jump directly to login
   */
  function checkInitialRoute() {
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    // Direct login flags: URL path /login, query parameters like ?role= or ?mode=, or #login
    const isDirectLogin =
      path.includes('/login') ||
      search.includes('role=') ||
      search.includes('mode=') ||
      search.includes('view=login') ||
      hash === '#login';

    if (isDirectLogin) {
      // Skip welcome page directly
      if (welcomeScreen) {
        welcomeScreen.classList.add('welcome-hidden');
      }
      document.body.classList.remove('welcome-active');
      document.body.classList.add('welcome-transitioning');
      isWelcomeActive = false;
    } else {
      // Show Welcome Screen initially
      document.body.classList.add('welcome-active');
      isWelcomeActive = true;
      initParticles();
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      animFrameId = requestAnimationFrame(renderLoop);
    }
  }

  /**
   * Main Initialization on DOM ready
   */
  function initWelcomePage() {
    welcomeScreen = document.getElementById('welcomeScreen');
    if (!welcomeScreen) return;

    campusImage = document.getElementById('welcomeCampusImage');
    cursorGlow = document.getElementById('welcomeCursorGlow');
    centerContent = document.getElementById('welcomeCenterContent');
    enterBtn = document.getElementById('welcomeEnterBtn');
    particlesCanvas = document.getElementById('welcomeParticlesCanvas');

    // Detect touch device
    isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Attach ENTER button click handler
    if (enterBtn) {
      enterBtn.addEventListener('click', enterPortal);
    }

    // Resize handlers
    window.addEventListener('resize', () => {
      resizeParticlesCanvas();
    }, { passive: true });

    // Handle browser Back / Forward buttons
    window.addEventListener('popstate', (e) => {
      const path = window.location.pathname.toLowerCase();
      if (path === '/' || path === '/welcome' || path.endsWith('/index.html')) {
        showWelcomeScreen();
      } else if (path.includes('/login')) {
        enterPortal();
      }
    });

    // Check entry route
    checkInitialRoute();
  }

  // Self initialize on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWelcomePage);
  } else {
    initWelcomePage();
  }

  // Expose enterPortal globally in case needed
  window.enterPortal = enterPortal;
  window.showWelcomeScreen = showWelcomeScreen;
})();
