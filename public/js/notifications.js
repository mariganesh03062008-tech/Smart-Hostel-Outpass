/**
 * Smart Hostel Centralized Real-Time Notification Client
 * Compatible with all 7 dashboards (Student, Parent, Advisor, Principal, Warden, Caretaker, Watchman)
 */

(function () {
  'use strict';

  class NotificationManager {
    constructor() {
      this.socket = null;
      this.notifications = [];
      this.unreadCount = 0;
      this.isOpen = false;
      this.user = this.getUser();
      this.token = this.getToken();
      this.pollInterval = null;

      // Auto-mount UI on DOM ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.init());
      } else {
        this.init();
      }
    }

    getToken() {
      return localStorage.getItem('sh_token') ||
             localStorage.getItem('token') ||
             sessionStorage.getItem('sh_token') ||
             sessionStorage.getItem('token');
    }

    getUser() {
      const userStr = localStorage.getItem('sh_user') ||
                      localStorage.getItem('user') ||
                      sessionStorage.getItem('sh_user') ||
                      sessionStorage.getItem('user');
      try {
        return userStr ? JSON.parse(userStr) : null;
      } catch (e) {
        return null;
      }
    }

    init() {
      if (!this.token || !this.user) {
        // Not authenticated on this page, don't mount
        return;
      }

      this.injectBellUI();
      this.initSocket();
      this.fetchNotifications();

      // Background fallback polling (every 30s)
      this.pollInterval = setInterval(() => this.fetchNotifications(true), 30000);

      // Global click handler to close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('sh-notif-wrapper');
        if (wrapper && !wrapper.contains(e.target) && this.isOpen) {
          this.toggleDropdown(false);
        }
      });
    }

    initSocket() {
      if (typeof window.io === 'undefined') {
        console.warn('[NotificationManager] Socket.IO library not loaded in window. Falling back to REST polling.');
        return;
      }

      try {
        this.socket = window.io({
          auth: { token: this.token },
          query: { token: this.token },
          transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
          console.log('[Socket.IO] Connected to real-time notification gateway.');
          this.socket.emit('authenticate', this.token);
        });

        this.socket.on('notification:new', (notif) => {
          console.log('[Socket.IO] Real-time notification received:', notif);
          this.handleIncomingNotification(notif);
        });

        this.socket.on('disconnect', () => {
          console.log('[Socket.IO] Disconnected from notification gateway.');
        });
      } catch (err) {
        console.error('[Socket.IO Init Error]:', err.message);
      }
    }

    injectBellUI() {
      // Find mounting anchor in header/topbar
      const mount = document.getElementById('headerNotificationMount');
      let target = mount ||
                   document.querySelector('.navbar-actions') ||
                   document.querySelector('.header-actions') ||
                   document.querySelector('.topbar-actions') ||
                   document.querySelector('.nav-actions') ||
                   document.querySelector('.user-profile') ||
                   document.querySelector('.user-info-dropdown') ||
                   document.querySelector('.navbar-right') ||
                   document.querySelector('header .user-menu') ||
                   document.querySelector('header');

      if (!target) return;

      // Avoid duplicate mount
      if (document.getElementById('sh-notif-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.id = 'sh-notif-wrapper';
      wrapper.className = 'sh-notif-wrapper';
      wrapper.innerHTML = `
        <button id="sh-notif-bell-btn" class="sh-notif-bell-btn" title="Notifications" aria-label="Notifications" type="button">
          🔔
          <span id="sh-notif-badge" class="sh-notif-badge hidden">0</span>
        </button>
        <div id="sh-notif-dropdown" class="sh-notif-dropdown">
          <div class="sh-notif-header">
            <div class="sh-notif-title-wrap">
              <h4 class="sh-notif-title">Notifications</h4>
              <span id="sh-notif-count-pill" class="sh-notif-count-pill">0 New</span>
            </div>
            <button id="sh-notif-mark-all" class="sh-notif-mark-all-btn" type="button">Mark all read</button>
          </div>
          <ul id="sh-notif-list" class="sh-notif-list">
            <div class="sh-notif-empty">
              <div class="sh-notif-empty-icon">🔕</div>
              <p class="sh-notif-empty-text">No notifications right now</p>
            </div>
          </ul>
        </div>
      `;

      if (mount) {
        mount.appendChild(wrapper);
      } else if (target.classList.contains('navbar-actions') || target.classList.contains('header-actions') || target.classList.contains('topbar-actions') || target.classList.contains('nav-actions')) {
        target.prepend(wrapper);
      } else if (target.parentNode) {
        target.parentNode.insertBefore(wrapper, target);
      } else {
        target.appendChild(wrapper);
      }

      // Attach event listeners
      const bellBtn = document.getElementById('sh-notif-bell-btn');
      const markAllBtn = document.getElementById('sh-notif-mark-all');

      if (bellBtn) {
        bellBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleDropdown();
        });
      }

      if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.markAllAsRead();
        });
      }
    }

    toggleDropdown(forcedState) {
      const dropdown = document.getElementById('sh-notif-dropdown');
      if (!dropdown) return;

      this.isOpen = typeof forcedState === 'boolean' ? forcedState : !this.isOpen;
      if (this.isOpen) {
        dropdown.classList.add('active');
        this.renderNotificationList();
      } else {
        dropdown.classList.remove('active');
      }
    }

    async fetchNotifications(isSilent = false) {
      try {
        const res = await fetch('/api/notifications', {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) return;

        const data = await res.json();
        if (data.success && Array.isArray(data.notifications)) {
          this.notifications = data.notifications;
          this.unreadCount = data.unreadCount || 0;
          this.updateBadge();
          if (this.isOpen) {
            this.renderNotificationList();
          }
        }
      } catch (err) {
        if (!isSilent) console.warn('[Notifications Fetch Error]:', err.message);
      }
    }

    handleIncomingNotification(notif) {
      // Check for duplicate in local cache
      const exists = this.notifications.some(n => n.id === notif.id);
      if (!exists) {
        this.notifications.unshift(notif);
        this.unreadCount++;
        this.updateBadge(true);
        if (this.isOpen) {
          this.renderNotificationList();
        }
        this.showToast(notif);
        window.dispatchEvent(new CustomEvent('sh:notification:new', { detail: notif }));
      }
    }

    updateBadge(animate = false) {
      const badge = document.getElementById('sh-notif-badge');
      const pill = document.getElementById('sh-notif-count-pill');

      if (badge) {
        if (this.unreadCount > 0) {
          badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
          badge.classList.remove('hidden');
          if (animate) {
            badge.classList.add('pulse-anim');
            setTimeout(() => badge.classList.remove('pulse-anim'), 3000);
          }
        } else {
          badge.classList.add('hidden');
        }
      }

      if (pill) {
        pill.textContent = `${this.unreadCount} New`;
      }
    }

    renderNotificationList() {
      const list = document.getElementById('sh-notif-list');
      if (!list) return;

      if (!this.notifications || this.notifications.length === 0) {
        list.innerHTML = `
          <div class="sh-notif-empty">
            <div class="sh-notif-empty-icon">🔕</div>
            <p class="sh-notif-empty-text">No notifications right now</p>
          </div>
        `;
        return;
      }

      list.innerHTML = this.notifications.map(n => {
        const iconInfo = this.getTypeIcon(n.type);
        const isUnread = !n.isRead && n.is_read !== 1;
        const timeAgo = this.formatTimeAgo(n.createdAt || n.created_at);

        return `
          <li class="sh-notif-item ${isUnread ? 'unread' : ''}" data-id="${n.id}" data-link="${n.linkUrl || n.link_url || ''}">
            <div class="sh-notif-icon-box ${iconInfo.cssClass}">
              ${iconInfo.icon}
            </div>
            <div class="sh-notif-content">
              <div class="sh-notif-item-title">${this.escapeHtml(n.title)}</div>
              <div class="sh-notif-item-msg">${this.escapeHtml(n.message)}</div>
              <div class="sh-notif-item-time">${timeAgo}</div>
            </div>
          </li>
        `;
      }).join('');

      // Add click listeners to items
      list.querySelectorAll('.sh-notif-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const link = item.dataset.link;
          this.handleNotificationClick(id, link);
        });
      });
    }

    async handleNotificationClick(id, link) {
      // 1. Mark as read
      try {
        await fetch(`/api/notifications/${id}/read`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        });

        // Update local state
        const target = this.notifications.find(n => String(n.id) === String(id));
        if (target && (!target.isRead || target.is_read === 0)) {
          target.isRead = 1;
          target.is_read = 1;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
          this.updateBadge();
          this.renderNotificationList();
        }
      } catch (err) {
        console.warn('[Mark Read Error]:', err.message);
      }

      this.toggleDropdown(false);

      // 2. Navigate if relevant link provided
      if (link && window.location.pathname !== link && !window.location.pathname.endsWith(link)) {
        window.location.href = link;
      }
    }

    async markAllAsRead() {
      try {
        const res = await fetch('/api/notifications/read-all', {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        });

        if (res.ok) {
          this.notifications.forEach(n => {
            n.isRead = 1;
            n.is_read = 1;
          });
          this.unreadCount = 0;
          this.updateBadge();
          this.renderNotificationList();
        }
      } catch (err) {
        console.warn('[Mark All Read Error]:', err.message);
      }
    }

    showToast(notif) {
      let container = document.getElementById('sh-notif-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'sh-notif-toast-container';
        container.className = 'sh-notif-toast-container';
        document.body.appendChild(container);
      }

      const iconInfo = this.getTypeIcon(notif.type);
      const toast = document.createElement('div');
      toast.className = 'sh-notif-toast';
      toast.innerHTML = `
        <div class="sh-notif-toast-icon">${iconInfo.icon}</div>
        <div class="sh-notif-toast-body">
          <div class="sh-notif-toast-title">${this.escapeHtml(notif.title)}</div>
          <div class="sh-notif-toast-msg">${this.escapeHtml(notif.message)}</div>
        </div>
        <button class="sh-notif-toast-close" type="button">&times;</button>
      `;

      toast.addEventListener('click', (e) => {
        if (!e.target.classList.contains('sh-notif-toast-close')) {
          this.handleNotificationClick(notif.id, notif.link_url || notif.linkUrl);
        }
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 250);
      });

      const closeBtn = toast.querySelector('.sh-notif-toast-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toast.classList.add('fade-out');
          setTimeout(() => toast.remove(), 250);
        });
      }

      container.appendChild(toast);

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        if (toast.parentNode) {
          toast.classList.add('fade-out');
          setTimeout(() => toast.remove(), 250);
        }
      }, 6000);
    }

    getTypeIcon(type) {
      const t = String(type || '').toUpperCase();
      if (t.includes('APPROVED')) return { icon: '✅', cssClass: 'type-approved' };
      if (t.includes('REJECTED')) return { icon: '❌', cssClass: 'type-rejected' };
      if (t.includes('QR')) return { icon: '📱', cssClass: 'type-qr' };
      if (t.includes('EXIT') || t.includes('RETURN')) return { icon: '🚪', cssClass: 'type-checkpoint' };
      if (t.includes('EXTENSION')) return { icon: '⏳', cssClass: 'type-extension' };
      if (t.includes('LATE')) return { icon: '⚠️', cssClass: 'type-late' };
      return { icon: '📩', cssClass: 'type-default' };
    }

    formatTimeAgo(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      const diffSecs = Math.floor((new Date() - date) / 1000);

      if (diffSecs < 45) return 'Just now';
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      if (diffSecs < 172800) return 'Yesterday';
      return date.toLocaleDateString();
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  }

  // Auto initialize and expose globally
  window.NotificationManager = new NotificationManager();
})();
