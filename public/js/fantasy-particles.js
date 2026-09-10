/**
 * Smart Hostel Outpass - Fantasy Particle Animation Engine
 * Creates a breathtaking interactive celestial stardust & constellation field
 * Features: Multi-layered floating cosmic orbs, shooting stars (meteors),
 * dynamic constellation energy lines, and interactive mouse stardust.
 */

(function () {
  'use strict';

  function initFantasyCanvas() {
    const canvas = document.getElementById('fantasyCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let particles = [];
    let sparkles = [];
    let shootingStars = [];
    let mouse = { x: -1000, y: -1000, active: false, radius: 150 };
    let lastShootingStarTime = Date.now();
    let shootingStarInterval = 4500 + Math.random() * 3000;
    let animationFrameId = null;

    // Rich Celestial Palette: Violet, Cyan, Azure Blue, Rose Gold, Solar Amber, Auroral Mint
    const COLORS = [
      { r: 168, g: 85, b: 247 }, // Nebula Violet
      { r: 6, g: 182, b: 212 },   // Astral Cyan
      { r: 59, g: 130, b: 246 },  // Cosmic Blue
      { r: 244, g: 63, b: 94 },   // Starlight Rose
      { r: 251, g: 191, b: 36 },  // Solar Gold
      { r: 16, g: 185, b: 129 }   // Auroral Mint
    ];

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    /* ==========================================================
       1. FLOATING COSMIC ORBS / STARDUST PARTICLES
       ========================================================== */
    class Particle {
      constructor() {
        this.reset(true);
      }

      reset(initial = false) {
        this.x = Math.random() * width;
        this.y = initial ? Math.random() * height : height + 15;
        this.depth = Math.random() > 0.60 ? 2 : 1; // 1 = background, 2 = foreground
        this.baseSize = this.depth === 2 ? Math.random() * 2.2 + 1.4 : Math.random() * 1.2 + 0.8;
        this.size = this.baseSize;
        this.vx = (Math.random() - 0.5) * (this.depth === 2 ? 0.35 : 0.18);
        this.vy = -(Math.random() * 0.35 + (this.depth === 2 ? 0.22 : 0.10));
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.alpha = this.depth === 2 ? Math.random() * 0.42 + 0.30 : Math.random() * 0.28 + 0.16;
        this.pulseSpeed = Math.random() * 0.02 + 0.01;
        this.pulse = Math.random() * Math.PI * 2;
      }

      update() {
        this.pulse += this.pulseSpeed;
        this.size = this.baseSize + Math.sin(this.pulse) * (this.depth === 2 ? 0.7 : 0.35);
        const currentAlpha = Math.max(0.08, this.alpha + Math.sin(this.pulse) * 0.15);

        // Gentle interactive magnetic deflection & attraction
        if (mouse.active) {
          const dx = this.x - mouse.x;
          const dy = this.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius && dist > 0) {
            const force = (1 - dist / mouse.radius) * 1.2;
            this.x += (dx / dist) * force;
            this.y += (dy / dist) * force;
          }
        }

        this.x += this.vx;
        this.y += this.vy;

        // Wrap around viewport edges
        if (this.x < -15) this.x = width + 15;
        if (this.x > width + 15) this.x = -15;
        if (this.y < -15) this.reset(false);

        this.currentAlpha = currentAlpha;
      }

      draw() {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size), 0, Math.PI * 2);

        // Outer ethereal glow gradient
        const glowRad = Math.max(2, this.size * 2.4);
        const grad = ctx.createRadialGradient(
          this.x, this.y, 0,
          this.x, this.y, glowRad
        );
        grad.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.currentAlpha})`);
        grad.addColorStop(0.4, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.currentAlpha * 0.35})`);
        grad.addColorStop(1, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRad, 0, Math.PI * 2);
        ctx.fill();

        // Brilliant white luminous core
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.9, this.currentAlpha + 0.25)})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    /* ==========================================================
       2. SHOOTING STARS / CELESTIAL METEORS
       ========================================================== */
    class ShootingStar {
      constructor() {
        this.reset();
      }

      reset() {
        // Spawn from upper edge or upper right
        this.x = Math.random() * (width * 0.8) + (width * 0.1);
        this.y = Math.random() * (height * 0.35);
        this.length = Math.random() * 80 + 90;
        this.speed = Math.random() * 9 + 12;
        this.angle = (Math.PI / 4) + (Math.random() - 0.5) * 0.25; // ~45 degrees diagonal
        this.dx = Math.cos(this.angle) * this.speed;
        this.dy = Math.sin(this.angle) * this.speed;
        this.size = Math.random() * 1.5 + 1.2;
        this.life = 1.0;
        this.decay = Math.random() * 0.018 + 0.014;
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      }

      update() {
        this.x += this.dx;
        this.y += this.dy;
        this.life -= this.decay;
      }

      draw() {
        if (this.life <= 0) return;
        ctx.save();

        const tailX = this.x - Math.cos(this.angle) * this.length;
        const tailY = this.y - Math.sin(this.angle) * this.length;

        // Meteor luminous streak gradient
        const grad = ctx.createLinearGradient(tailX, tailY, this.x, this.y);
        grad.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0)`);
        grad.addColorStop(0.7, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.life * 0.35})`);
        grad.addColorStop(1, `rgba(255, 255, 255, ${this.life * 0.85})`);

        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();

        // Meteor glowing head
        ctx.fillStyle = `rgba(255, 255, 255, ${this.life * 0.95})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 1.3, 0, Math.PI * 2);
        ctx.shadowBlur = 10;
        ctx.shadowColor = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0.8)`;
        ctx.fill();

        ctx.restore();
      }
    }

    /* ==========================================================
       3. INTERACTIVE MOUSE STARDUST SPARKLES
       ========================================================== */
    class SparkleTrail {
      constructor(x, y) {
        this.x = x + (Math.random() - 0.5) * 14;
        this.y = y + (Math.random() - 0.5) * 14;
        this.size = Math.random() * 2.0 + 1.0;
        this.life = 1.0;
        this.decay = Math.random() * 0.035 + 0.02;
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = (Math.random() - 0.5) * 0.8 - 0.3;
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
      }

      draw() {
        if (this.life <= 0) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.2, this.size * this.life), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.life * 0.6})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0.6)`;
        ctx.fill();
        ctx.restore();
      }
    }

    function initParticles() {
      particles = [];
      // Balanced particle count: 32 to 56 for optimal 60fps & celestial stardust depth
      const count = Math.min(56, Math.max(32, Math.floor((width * height) / 24000)));
      for (let i = 0; i < count; i++) {
        particles.push(new Particle());
      }
    }

    /* ==========================================================
       4. CONSTELLATION ENERGY WEB LINES
       ========================================================== */
    function drawConstellationLines() {
      const maxDist = 125;
      for (let i = 0; i < particles.length; i++) {
        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.16;
            ctx.strokeStyle = (i % 2 === 0) ? `rgba(168, 85, 247, ${alpha})` : `rgba(6, 182, 212, ${alpha * 0.85})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }

        // Connect particles near mouse cursor
        if (mouse.active) {
          const mdx = particles[i].x - mouse.x;
          const mdy = particles[i].y - mouse.y;
          const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mDist < 130) {
            const mAlpha = (1 - mDist / 130) * 0.22;
            ctx.strokeStyle = `rgba(6, 182, 212, ${mAlpha})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }
    }

    /* ==========================================================
       5. MAIN ANIMATION RENDER LOOP (60 FPS)
       ========================================================== */
    function animate() {
      ctx.clearRect(0, 0, width, height);

      // Periodically spawn shooting star meteors
      const now = Date.now();
      if (now - lastShootingStarTime > shootingStarInterval) {
        shootingStars.push(new ShootingStar());
        lastShootingStarTime = now;
        shootingStarInterval = 4000 + Math.random() * 3500;
      }

      // 1. Draw constellation network lines
      drawConstellationLines();

      // 2. Update & render shooting stars
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        shootingStars[i].update();
        if (shootingStars[i].life <= 0) {
          shootingStars.splice(i, 1);
        } else {
          shootingStars[i].draw();
        }
      }

      // 3. Update & render cosmic particles
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
      }

      // 4. Update & render interactive stardust sparkles
      for (let i = sparkles.length - 1; i >= 0; i--) {
        sparkles[i].update();
        if (sparkles[i].life <= 0) {
          sparkles.splice(i, 1);
        } else {
          sparkles[i].draw();
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    }

    window.addEventListener('resize', () => {
      resize();
      initParticles();
    });

    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;

      // Spawn stardust sparkles on mouse movement (throttled)
      if (Math.random() < 0.45 && sparkles.length < 50) {
        sparkles.push(new SparkleTrail(e.clientX, e.clientY));
      }
    });

    window.addEventListener('mouseleave', () => {
      mouse.active = false;
      mouse.x = -1000;
      mouse.y = -1000;
    });

    // Touch support for tablets and mobile
    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
        mouse.active = true;
        if (Math.random() < 0.5 && sparkles.length < 40) {
          sparkles.push(new SparkleTrail(mouse.x, mouse.y));
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      mouse.active = false;
    });

    resize();
    initParticles();
    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFantasyCanvas);
  } else {
    initFantasyCanvas();
  }
})();
