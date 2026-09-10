/**
 * ==========================================================
 * GCE ERODE SMART HOSTEL OUTPASS SYSTEM - DASHBOARD BACKGROUND CONTROLLER
 * ==========================================================
 * Provides subtle, non-intrusive cursor parallax and soft ambient
 * lighting behind dashboards matching the Welcome Page aesthetic.
 * Performance-optimized: GPU-accelerated translate3d, 60fps lerp,
 * pauses when document is hidden.
 */

(function () {
  'use strict';

  let bgViewport = null;
  let bgImage = null;
  let cursorGlow = null;
  let animId = null;

  // Mouse & Parallax State
  let mouse = {
    screenX: window.innerWidth / 2,
    screenY: window.innerHeight / 2,
    normX: 0,
    normY: 0,
    hasMoved: false
  };

  let currentBgX = 0, targetBgX = 0;
  let currentBgY = 0, targetBgY = 0;
  let currentLightX = window.innerWidth / 2, targetLightX = window.innerWidth / 2;
  let currentLightY = window.innerHeight / 2, targetLightY = window.innerHeight / 2;

  let idleTimer = 0;
  let isTouch = false;

  function createBackgroundElements() {
    if (document.querySelector('.dashboard-bg-viewport')) return;

    bgViewport = document.createElement('div');
    bgViewport.className = 'dashboard-bg-viewport';
    bgViewport.setAttribute('aria-hidden', 'true');

    bgImage = document.createElement('div');
    bgImage.className = 'dashboard-bg-image';
    bgImage.id = 'dashBgImage';

    const overlay = document.createElement('div');
    overlay.className = 'dashboard-bg-overlay';

    cursorGlow = document.createElement('div');
    cursorGlow.className = 'dashboard-cursor-glow';
    cursorGlow.id = 'dashCursorGlow';

    bgViewport.appendChild(bgImage);
    bgViewport.appendChild(overlay);
    bgViewport.appendChild(cursorGlow);

    // Prepend to body so it sits behind all content
    document.body.prepend(bgViewport);
  }

  function handleMouseMove(e) {
    mouse.screenX = e.clientX;
    mouse.screenY = e.clientY;
    mouse.normX = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.normY = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.hasMoved = true;
  }

  function renderLoop() {
    if (document.hidden) {
      animId = requestAnimationFrame(renderLoop);
      return;
    }

    if (isTouch || !mouse.hasMoved) {
      // Gentle harmonic breathing drift on touch or idle
      idleTimer += 0.016;
      targetBgX = Math.sin(idleTimer * 0.35) * 5;
      targetBgY = Math.cos(idleTimer * 0.28) * 4;
      targetLightX = (window.innerWidth / 2) + Math.sin(idleTimer * 0.5) * 90;
      targetLightY = (window.innerHeight / 2) + Math.cos(idleTimer * 0.4) * 60;
    } else {
      // Very subtle counter-motion: max ±6px (content remains 100% stable)
      const MAX_SHIFT = 6;
      targetBgX = -mouse.normX * MAX_SHIFT;
      targetBgY = -mouse.normY * MAX_SHIFT;

      targetLightX = mouse.screenX;
      targetLightY = mouse.screenY;
    }

    // Smooth Lerp Interpolation
    currentBgX += (targetBgX - currentBgX) * 0.05;
    currentBgY += (targetBgY - currentBgY) * 0.05;

    currentLightX += (targetLightX - currentLightX) * 0.065;
    currentLightY += (targetLightY - currentLightY) * 0.065;

    if (bgImage) {
      bgImage.style.transform = `translate3d(${currentBgX.toFixed(2)}px, ${currentBgY.toFixed(2)}px, 0) scale(1.025)`;
    }

    if (cursorGlow) {
      cursorGlow.style.left = `${currentLightX.toFixed(1)}px`;
      cursorGlow.style.top = `${currentLightY.toFixed(1)}px`;
    }

    animId = requestAnimationFrame(renderLoop);
  }

  function initDashboardBg() {
    createBackgroundElements();

    isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Handle visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !animId) {
        animId = requestAnimationFrame(renderLoop);
      }
    });

    animId = requestAnimationFrame(renderLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardBg);
  } else {
    initDashboardBg();
  }
})();
