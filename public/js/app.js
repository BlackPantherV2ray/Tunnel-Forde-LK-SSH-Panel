/**
 * Tunnel Forde LK - Modern X-UI Style SPA Frontend Controller
 */

let authToken = localStorage.getItem('tfl_token') || null;
let currentTab = 'dashboard';
let statusPollInterval = null;
let currentEditingUser = null;
let cachedUsers = [];

// DOM Elements
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const sidebar = document.querySelector('.sidebar');
const refreshAllBtn = document.getElementById('refresh-all-btn');

// Init
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  setupEventListeners();

  if (authToken) {
    verifyTokenAndBoot();
  } else {
    showLogin();
  }
});

// Setup All UI Event Listeners
function setupEventListeners() {
  // Login Form Submit
  loginForm.addEventListener('submit', handleLogin);

  // Logout
  logoutBtn.addEventListener('click', handleLogout);

  // Mobile Sidebar Toggles
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => sidebar.classList.add('open'));
  }
  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', () => sidebar.classList.remove('open'));
  }

  // Refresh All Button
  if (refreshAllBtn) {
    refreshAllBtn.addEventListener('click', () => {
      fetchSystemStatus();
      if (currentTab === 'users') fetchUsers();
      if (currentTab === 'online') fetchOnlineUsers();
      if (currentTab === 'services') fetchServices();
      showToast('Data refreshed', 'info');
    });
  }

  // Navigation Tabs
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });
  });

  // User Search
  const userSearch = document.getElementById('user-search-input');
  if (userSearch) {
    userSearch.addEventListener('input', (e) => {
      renderUsersTable(e.target.value);
    });
  }

  // Modal Closers
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  // Open Create User Modal
  const openCreateBtn = document.getElementById('open-create-user-modal-btn');
  if (openCreateBtn) {
    openCreateBtn.addEventListener('click', () => {
      document.getElementById('create-user-form').reset();
      document.getElementById('new-password').value = generateRandomPassword(8);
      openModal('create-user-modal');
    });
  }

  // Generate Random Password in Modal
  const genPassBtn = document.getElementById('gen-random-pass-btn');
  if (genPassBtn) {
    genPassBtn.addEventListener('click', () => {
      document.getElementById('new-password').value = generateRandomPassword(8);
    });
  }

  // Create User Form Submit
  const createUserForm = document.getElementById('create-user-form');
  if (createUserForm) {
    createUserForm.addEventListener('submit', handleCreateUser);
  }

  // Renew User Form Submit
  const renewUserForm = document.getElementById('renew-user-form');
  if (renewUserForm) {
    renewUserForm.addEventListener('submit', handleRenewUser);
  }

  // Quick Days buttons in Renew Modal
  document.querySelectorAll('.btn-quick-day').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-quick-day').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('renew-custom-days').value = btn.getAttribute('data-days');
    });
  });

  // Config Modal Tabs
  document.querySelectorAll('.config-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.config-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.cfg-content-tab').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-cfg-tab');
      document.getElementById(`cfg-tab-${target}`).classList.add('active');
    });
  });

  // Copy Buttons in Config Modal
  const copyConfigTextBtn = document.getElementById('copy-config-text-btn');
  if (copyConfigTextBtn) {
    copyConfigTextBtn.addEventListener('click', () => {
      const text = document.getElementById('config-text-pre').innerText;
      copyToClipboard(text, 'Full account text copied to clipboard!');
    });
  }

  const copyHttpPayloadBtn = document.getElementById('copy-payload-http-btn');
  if (copyHttpPayloadBtn) {
    copyHttpPayloadBtn.addEventListener('click', () => {
      const val = document.getElementById('cfg-payload-http').value;
      copyToClipboard(val, 'HTTP WebSocket payload copied!');
    });
  }

  const copyCfPayloadBtn = document.getElementById('copy-payload-cf-btn');
  if (copyCfPayloadBtn) {
    copyCfPayloadBtn.addEventListener('click', () => {
      const val = document.getElementById('cfg-payload-cf').value;
      copyToClipboard(val, 'Cloudflare payload copied!');
    });
  }

  // Online Tab Refresh Button
  const refreshOnlineBtn = document.getElementById('refresh-online-btn');
  if (refreshOnlineBtn) {
    refreshOnlineBtn.addEventListener('click', fetchOnlineUsers);
  }

  // Restart All Services Button
  const restartAllBtn = document.getElementById('restart-all-services-btn');
  if (restartAllBtn) {
    restartAllBtn.addEventListener('click', handleRestartAllServices);
  }

  // Logs Tab Refresh Button
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', fetchLogs);
  }

  // General Settings Form Submit
  const generalSettingsForm = document.getElementById('settings-general-form');
  if (generalSettingsForm) {
    generalSettingsForm.addEventListener('submit', handleSaveGeneralSettings);
  }

  // Admin Settings Form Submit
  const adminSettingsForm = document.getElementById('settings-admin-form');
  if (adminSettingsForm) {
    adminSettingsForm.addEventListener('submit', handleSaveAdminSettings);
  }

  // Telegram Settings Form Submit
  const tgSettingsForm = document.getElementById('settings-telegram-form');
  if (tgSettingsForm) {
    tgSettingsForm.addEventListener('submit', handleSaveTelegramSettings);
  }

  // Telegram Test Connection Button
  const testTgBtn = document.getElementById('test-tg-btn');
  if (testTgBtn) {
    testTgBtn.addEventListener('click', handleTestTelegram);
  }

  // Telegram Send Backup Button
  const sendTgBackupBtn = document.getElementById('send-tg-backup-btn');
  if (sendTgBackupBtn) {
    sendTgBackupBtn.addEventListener('click', handleSendTelegramBackup);
  }

  // Restore Backup Button
  const restoreUploadBtn = document.getElementById('restore-upload-btn');
  if (restoreUploadBtn) {
    restoreUploadBtn.addEventListener('click', handleRestoreBackup);
  }

  // Password Show/Hide Toggle Buttons
  document.querySelectorAll('.btn-toggle-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}"></i>`;
        if (window.lucide) lucide.createIcons();
      }
    });
  });

  // Activate License Button
  const activateLicBtn = document.getElementById('activate-license-btn');
  if (activateLicBtn) {
    activateLicBtn.addEventListener('click', handleActivateLicense);
  }

  // Topbar Buttons
  const logoutTopbarBtn = document.getElementById('logout-topbar-btn');
  if (logoutTopbarBtn) {
    logoutTopbarBtn.addEventListener('click', handleLogout);
  }

  const notifTopbarBtn = document.getElementById('notif-topbar-btn');
  if (notifTopbarBtn) {
    notifTopbarBtn.addEventListener('click', () => {
      showToast('System operational. All tunnel services active.', 'info');
    });
  }
}

// --------------------------------------------------------------------------
// Authentication & Boot
// --------------------------------------------------------------------------

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const loginBtn = document.getElementById('login-btn');

  loginBtn.disabled = true;
  loginBtn.innerText = 'Verifying...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success && data.token) {
      authToken = data.token;
      localStorage.setItem('tfl_token', authToken);
      showToast('Welcome back, Admin!', 'success');
      bootDashboard();
    } else {
      showToast(data.error || 'Login failed', 'error');
    }
  } catch (err) {
    showToast('Network error connecting to panel', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i data-lucide="log-in" class="btn-icon"></i> Sign In to Dashboard';
    if (window.lucide) lucide.createIcons();
  }
}

async function verifyTokenAndBoot() {
  try {
    const res = await apiRequest('/api/auth/check');
    if (res && res.success) {
      bootDashboard();
    } else {
      handleLogout();
    }
  } catch (err) {
    handleLogout();
  }
}

function handleLogout() {
  authToken = null;
  localStorage.removeItem('tfl_token');
  if (statusPollInterval) clearInterval(statusPollInterval);
  showLogin();
  showToast('Logged out successfully', 'info');
}

function showLogin() {
  loginView.classList.remove('d-none');
  appView.classList.add('d-none');
}

function bootDashboard() {
  loginView.classList.add('d-none');
  appView.classList.remove('d-none');
  switchTab('dashboard');
  fetchSystemStatus();

  // Polling loop for status (every 3 seconds)
  if (statusPollInterval) clearInterval(statusPollInterval);
  statusPollInterval = setInterval(() => {
    fetchSystemStatus(true);
    if (currentTab === 'online') fetchOnlineUsers(true);
  }, 3000);
}

// --------------------------------------------------------------------------
// Navigation & Tabs
// --------------------------------------------------------------------------

function switchTab(tabId) {
  currentTab = tabId;

  // Update sidebar active link
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
  });

  // Update tab content view
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.toggle('active', tab.id === `tab-${tabId}`);
  });

  // Update Page Title
  const titleMap = {
    dashboard: 'Dashboard',
    users: 'SSH & WS Accounts',
    online: 'Online Users',
    services: 'System Services',
    logs: 'Audit Logs',
    settings: 'Settings'
  };
  document.getElementById('current-page-title').innerText = titleMap[tabId] || 'Panel';

  // Fetch relevant tab data
  if (tabId === 'dashboard') {
    fetchSystemStatus();
    renderTrafficChart();
  }
  if (tabId === 'users') fetchUsers();
  if (tabId === 'online') fetchOnlineUsers();
  if (tabId === 'services') fetchServices();
  if (tabId === 'logs') fetchLogs();
  if (tabId === 'settings') fetchSettings();

  if (window.lucide) lucide.createIcons();
}

// --------------------------------------------------------------------------
// Real-Time Traffic Speed Chart (Mockup Replica with Bezier Waves)
// --------------------------------------------------------------------------
const TRAFFIC_POINTS = 18;
const trafficHistory = {
  rx: [0, 120, 280, 520, 310, 450, 780, 620, 890, 710, 850, 920, 1100, 840, 650, 720, 950, 800],
  tx: [0, 80, 140, 210, 190, 310, 290, 420, 380, 460, 400, 510, 480, 390, 310, 350, 420, 390]
};

function updateTrafficChart(rxKB, txKB) {
  trafficHistory.rx.push(rxKB);
  if (trafficHistory.rx.length > TRAFFIC_POINTS) trafficHistory.rx.shift();

  trafficHistory.tx.push(txKB);
  if (trafficHistory.tx.length > TRAFFIC_POINTS) trafficHistory.tx.shift();

  renderTrafficChart();
}

function renderTrafficChart() {
  const canvas = document.getElementById('traffic-speed-chart');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width || 560;
  const height = rect.height || 170;

  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  const w = width;
  const h = height;

  const paddingLeft = 52;
  const paddingRight = 14;
  const paddingTop = 14;
  const paddingBottom = 22;
  const plotWidth = Math.max(10, w - paddingLeft - paddingRight);
  const plotHeight = Math.max(10, h - paddingTop - paddingBottom);

  // Determine scale (default 25 MiB scale as in mockup, or dynamic if traffic is higher)
  const maxVal = Math.max(...trafficHistory.rx, ...trafficHistory.tx, 0);
  let scaleMax = 25 * 1024; // 25 MiB in KB
  if (maxVal > scaleMax) {
    scaleMax = Math.ceil(maxVal / (5 * 1024)) * (5 * 1024);
  }

  const ticks = [scaleMax, scaleMax * 0.8, scaleMax * 0.6, scaleMax * 0.4, scaleMax * 0.2, 0];

  ctx.clearRect(0, 0, w, h);

  // Draw Horizontal Gridlines & Y-Axis Labels
  ctx.font = '10px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < ticks.length; i++) {
    const y = paddingTop + (i / (ticks.length - 1)) * plotHeight;
    const val = ticks[i];
    const label = val === 0 ? '0 B' : `${Math.round(val / 1024)} MiB`;
    ctx.fillText(label, paddingLeft - 8, y);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(w - paddingRight, y);
    ctx.stroke();
  }

  // Draw Vertical Subtle Gridlines
  for (let i = 0; i <= 6; i++) {
    const x = paddingLeft + (i / 6) * plotWidth;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    ctx.moveTo(x, paddingTop);
    ctx.lineTo(x, h - paddingBottom);
    ctx.stroke();
  }

  // Draw smooth spline waves
  function drawSeries(data, strokeColor, topColor, bottomColor) {
    if (!data || data.length < 2) return;
    const bottomY = h - paddingBottom;

    const points = data.map((val, idx) => {
      const x = paddingLeft + (idx / (data.length - 1)) * plotWidth;
      const clamped = Math.max(0, Math.min(scaleMax, val));
      const y = bottomY - (clamped / scaleMax) * plotHeight;
      return { x, y };
    });

    // 1. Area fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, bottomY);
    ctx.lineTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(points[points.length - 1].x, bottomY);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, paddingTop, 0, bottomY);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.fill();

    // 2. Stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw Download (Cyan)
  drawSeries(trafficHistory.rx, '#00f2fe', 'rgba(0, 242, 254, 0.28)', 'rgba(0, 242, 254, 0.0)');

  // Draw Upload (Emerald Green)
  drawSeries(trafficHistory.tx, '#10b981', 'rgba(16, 185, 129, 0.24)', 'rgba(16, 185, 129, 0.0)');

  ctx.restore();
}

window.addEventListener('resize', () => {
  if (currentTab === 'dashboard') {
    renderTrafficChart();
  }
});

// --------------------------------------------------------------------------
// API Helpers
// --------------------------------------------------------------------------

async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(endpoint, options);
    if (res.status === 401) {
      handleLogout();
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    return null;
  }
}

// --------------------------------------------------------------------------
// Dashboard & System Metrics
// --------------------------------------------------------------------------

async function fetchSystemStatus(silent = false) {
  const data = await apiRequest('/api/status');
  if (!data || !data.success) return;

  const sys = data.system || {};
  const stats = data.stats || {};

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  // Update Stat Cards
  setText('stat-total-users', stats.total ?? 0);
  setText('stat-active-users', stats.active ?? 0);
  setText('stat-online-sessions', stats.onlineCount ?? 0);
  setText('stat-expired-users', stats.expired ?? 0);
  setText('stat-locked-users', stats.locked ?? 0);

  // Sidebar badges
  setText('sidebar-user-count', stats.total ?? 0);
  setText('sidebar-online-count', stats.onlineCount ?? 0);

  // SVG Circular Gauges (Circumference 301.6 for r=48)
  const CIRCUMFERENCE = 301.6;

  // 1. CPU Usage
  const cpuPercent = parseFloat(sys.cpu) || 0;
  setText('gauge-cpu-val', `${cpuPercent}%`);
  const cpuCircle = document.getElementById('gauge-cpu-circle');
  if (cpuCircle) {
    const offset = CIRCUMFERENCE - (CIRCUMFERENCE * Math.min(100, Math.max(0, cpuPercent)) / 100);
    cpuCircle.style.strokeDashoffset = offset.toFixed(1);
  }
  const cpuBar = document.getElementById('gauge-cpu-bar');
  if (cpuBar) cpuBar.style.width = `${cpuPercent}%`;

  // 2. RAM Usage
  const ram = sys.memory || { used: 0, total: 1024, percent: 0 };
  const ramUsedGB = (ram.used / 1024).toFixed(1);
  const ramTotalGB = (ram.total / 1024).toFixed(0);
  setText('gauge-ram-val', `${ramUsedGB} GB`);
  setText('gauge-ram-sub', `/ ${ramTotalGB} GB`);
  const ramCircle = document.getElementById('gauge-ram-circle');
  if (ramCircle) {
    const offset = CIRCUMFERENCE - (CIRCUMFERENCE * Math.min(100, Math.max(0, ram.percent)) / 100);
    ramCircle.style.strokeDashoffset = offset.toFixed(1);
  }
  const ramBar = document.getElementById('gauge-ram-bar');
  if (ramBar) ramBar.style.width = `${ram.percent}%`;

  // 3. Root Storage
  const disk = sys.disk || { used: 0, total: 1024, percent: 0 };
  setText('gauge-disk-val', `${disk.percent}%`);
  const diskUsedGB = (disk.used / 1024).toFixed(1);
  const diskTotalGB = (disk.total / 1024).toFixed(1);
  setText('gauge-disk-sub', `${diskUsedGB} GB / ${diskTotalGB} GB`);
  const diskCircle = document.getElementById('gauge-disk-circle');
  if (diskCircle) {
    const offset = CIRCUMFERENCE - (CIRCUMFERENCE * Math.min(100, Math.max(0, disk.percent)) / 100);
    diskCircle.style.strokeDashoffset = offset.toFixed(1);
  }
  const diskBar = document.getElementById('gauge-disk-bar');
  if (diskBar) diskBar.style.width = `${disk.percent}%`;

  // Traffic / Network Bandwidth
  const net = sys.network || { totalRxMB: 0, totalTxMB: 0, rxSpeedKB: 0, txSpeedKB: 0 };
  const totalBytes = (parseFloat(net.totalRxMB || 0) + parseFloat(net.totalTxMB || 0)) * 1024 * 1024;
  setText('stat-total-traffic', formatBytes(totalBytes));
  setText('stat-rx-traffic', `${net.totalRxMB} MB`);
  setText('stat-tx-traffic', `${net.totalTxMB} MB`);
  setText('top-rx-speed', `${net.rxSpeedKB} KB/s`);
  setText('top-tx-speed', `${net.txSpeedKB} KB/s`);

  // Update Live Real-Time Network Traffic Chart
  const rxKB = parseFloat(net.rxSpeedKB) || 0;
  const txKB = parseFloat(net.txSpeedKB) || 0;
  updateTrafficChart(rxKB, txKB);

  // OS & Specs
  const osInfo = sys.os || {};
  setText('spec-ip', osInfo.publicIp || '--');
  setText('sidebar-ip', osInfo.publicIp || '--');
  setText('spec-os', osInfo.osName || '--');
  setText('spec-arch', osInfo.arch || '--');
  setText('spec-hostname', osInfo.hostname || '--');

  const uptimeStr = formatUptime(osInfo.uptimeSeconds);
  setText('spec-uptime', uptimeStr);
  setText('sidebar-uptime', `Uptime: ${uptimeStr}`);
}

// --------------------------------------------------------------------------
// User Management
// --------------------------------------------------------------------------

async function fetchUsers() {
  const data = await apiRequest('/api/users');
  if (!data || !data.success) return;

  cachedUsers = data.users || [];
  renderUsersTable();
}

function renderUsersTable(filter = '') {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';

  let filtered = cachedUsers;
  if (filter) {
    const q = filter.toLowerCase();
    filtered = cachedUsers.filter(u => u.username.toLowerCase().includes(q) || (u.note && u.note.toLowerCase().includes(q)));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No accounts match your search.</td></tr>`;
    return;
  }

  for (const user of filtered) {
    const tr = document.createElement('tr');

    let statusHtml = '';
    if (user.status === 'active') {
      statusHtml = `<span class="status-badge active"><span class="status-indicator online inline"></span> Active</span>`;
    } else if (user.status === 'expired') {
      statusHtml = `<span class="status-badge expired">Expired</span>`;
    } else {
      statusHtml = `<span class="status-badge locked">Locked</span>`;
    }

    const liveBadge = user.isOnline 
      ? `<span class="badge-tag text-emerald font-bold">${user.onlineCount} Online</span>`
      : `<span class="text-dim">0</span>`;

    // Data Usage & Quota Calculations
    const totalUsage = parseFloat(user.totalUsageBytes) || 0;
    const usedFormatted = formatBytes(totalUsage);
    const limitGB = parseFloat(user.dataLimitGB) || 0;
    const limitText = limitGB > 0 ? `${limitGB} GB` : '∞';
    let percent = 0;
    if (limitGB > 0) {
      const maxBytes = limitGB * 1024 * 1024 * 1024;
      percent = Math.min(100, Math.round((totalUsage / maxBytes) * 100));
    }
    const progressColor = percent >= 90 ? 'bg-rose' : (percent >= 70 ? 'bg-amber' : 'bg-cyan');

    const trafficHtml = `
      <div class="traffic-box">
        <div class="traffic-header">
          <span class="traffic-used">${usedFormatted}</span>
          <span class="traffic-limit">/ ${limitText}</span>
        </div>
        ${limitGB > 0 ? `
        <div class="progress-bar-mini">
          <div class="progress-bar-mini-fill ${progressColor}" style="width: ${percent}%"></div>
        </div>
        ` : ''}
        <div class="traffic-breakdown">
          <span>↓ ${formatBytes(user.downloadBytes || 0)}</span>
          <span>↑ ${formatBytes(user.uploadBytes || 0)}</span>
        </div>
      </div>
    `;

    tr.innerHTML = `
      <td>${statusHtml}</td>
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td><span class="font-mono text-muted">${escapeHtml(user.password)}</span></td>
      <td><span class="font-mono">${user.expiryDate || 'Never'}</span></td>
      <td>${trafficHtml}</td>
      <td>${user.ipLimit || 1} Device(s)</td>
      <td>${liveBadge}</td>
      <td><span class="text-muted text-sm">${escapeHtml(user.note || '-')}</span></td>
      <td class="text-right">
        <div class="table-actions">
          <button class="action-btn-sm btn-copy-cfg" title="View Config / FastSSH" onclick="openConfigModal('${user.username}')">
            <i data-lucide="share-2"></i>
          </button>
          <button class="action-btn-sm btn-renew" title="Renew Account (+Days / Quota)" onclick="openRenewModal('${user.username}')">
            <i data-lucide="calendar-plus"></i>
          </button>
          <button class="action-btn-sm" title="Reset Data Usage Counter" onclick="resetUserUsage('${user.username}')">
            <i data-lucide="rotate-ccw"></i>
          </button>
          <button class="action-btn-sm" title="${user.status === 'locked' ? 'Unlock Account' : 'Lock Account'}" onclick="toggleLockUser('${user.username}', '${user.status}')">
            <i data-lucide="${user.status === 'locked' ? 'unlock' : 'lock'}"></i>
          </button>
          <button class="action-btn-sm btn-delete" title="Delete Account" onclick="deleteUser('${user.username}')">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  }

  if (window.lucide) lucide.createIcons();
}

async function handleCreateUser(e) {
  e.preventDefault();
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value.trim();
  const expireDays = document.getElementById('new-expire-days').value;
  const ipLimit = document.getElementById('new-ip-limit').value;
  const dataLimitGB = document.getElementById('new-data-limit') ? document.getElementById('new-data-limit').value : 0;
  const note = document.getElementById('new-note').value.trim();
  const btn = document.getElementById('submit-create-user-btn');

  btn.disabled = true;
  btn.innerText = 'Creating on VPS...';

  const res = await apiRequest('/api/users', 'POST', { username, password, expireDays, ipLimit, note, dataLimitGB });

  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="check" class="btn-icon"></i> Create Account';
  if (window.lucide) lucide.createIcons();

  if (res && res.success) {
    showToast(`Account '${username}' created successfully!`, 'success');
    closeModal('create-user-modal');
    fetchUsers();
    // Prompt config modal directly for convenience
    openConfigModal(username);
  } else {
    showToast(res ? res.error : 'Failed to create user', 'error');
  }
}

async function openConfigModal(username) {
  const res = await apiRequest(`/api/users/${username}/config`);
  if (!res || !res.success) {
    showToast('Failed to load user config', 'error');
    return;
  }

  const cfg = res.config;
  document.getElementById('config-text-pre').innerText = cfg.formattedText;
  document.getElementById('cfg-payload-http').value = cfg.payloads.websocketHttp;
  document.getElementById('cfg-payload-cf').value = cfg.payloads.websocketCloudflare;

  // Generate QR Code
  generateQrCode(cfg.formattedText);

  openModal('config-modal');
}

function generateQrCode(text) {
  const container = document.getElementById('qrcode-container');
  container.innerHTML = '';
  if (window.qrcode) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      container.innerHTML = qr.createImgTag(4);
    } catch (e) {
      container.innerHTML = '<span class="text-muted">QR Code unavailable</span>';
    }
  }
}

function openRenewModal(username) {
  currentEditingUser = username;
  document.getElementById('renew-username-title').innerText = username;
  document.getElementById('renew-custom-days').value = '30';
  document.querySelectorAll('.btn-quick-day').forEach(b => b.classList.toggle('active', b.getAttribute('data-days') === '30'));
  
  const user = cachedUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (user && document.getElementById('renew-data-limit')) {
    document.getElementById('renew-data-limit').value = user.dataLimitGB || '';
  }
  if (document.getElementById('renew-reset-traffic')) {
    document.getElementById('renew-reset-traffic').checked = true;
  }
  openModal('renew-modal');
}

async function handleRenewUser(e) {
  e.preventDefault();
  if (!currentEditingUser) return;

  const days = document.getElementById('renew-custom-days').value;
  const resetTraffic = document.getElementById('renew-reset-traffic') ? document.getElementById('renew-reset-traffic').checked : false;
  const dataLimitGB = document.getElementById('renew-data-limit') ? document.getElementById('renew-data-limit').value : null;

  const res = await apiRequest(`/api/users/${currentEditingUser}/renew`, 'POST', { days, resetTraffic, dataLimitGB });

  if (res && res.success) {
    showToast(`Renewed ${currentEditingUser} successfully!`, 'success');
    closeModal('renew-modal');
    fetchUsers();
  } else {
    showToast(res ? res.error : 'Failed to renew account', 'error');
  }
}

async function resetUserUsage(username) {
  if (!confirm(`Are you sure you want to reset data usage for '${username}' back to 0 B?`)) return;

  const res = await apiRequest(`/api/users/${username}/reset-traffic`, 'POST');
  if (res && res.success) {
    showToast(`Data usage for '${username}' reset to 0 B`, 'info');
    fetchUsers();
  } else {
    showToast(res ? res.error : 'Failed to reset data usage', 'error');
  }
}

async function toggleLockUser(username, currentStatus) {
  const action = currentStatus === 'locked' ? 'unlock' : 'lock';
  const res = await apiRequest(`/api/users/${username}/${action}`, 'POST');
  if (res && res.success) {
    showToast(`User ${username} ${action}ed!`, 'info');
    fetchUsers();
  } else {
    showToast(res ? res.error : `Failed to ${action} user`, 'error');
  }
}

async function deleteUser(username) {
  if (!confirm(`Are you sure you want to completely delete '${username}' from the VPS?`)) return;

  const res = await apiRequest(`/api/users/${username}`, 'DELETE');
  if (res && res.success) {
    showToast(`User ${username} deleted successfully`, 'success');
    fetchUsers();
  } else {
    showToast(res ? res.error : 'Failed to delete user', 'error');
  }
}

// --------------------------------------------------------------------------
// Online Sessions Tab
// --------------------------------------------------------------------------

async function fetchOnlineUsers(silent = false) {
  const data = await apiRequest('/api/online');
  if (!data || !data.success) return;

  const sessions = data.sessions || [];
  const tbody = document.getElementById('online-table-body');
  tbody.innerHTML = '';

  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No active sessions connected currently.</td></tr>`;
    return;
  }

  for (const s of sessions) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="font-mono text-cyan">${s.pid}</span></td>
      <td><strong>${escapeHtml(s.user)}</strong></td>
      <td><span class="font-mono">${escapeHtml(s.ip)}</span></td>
      <td><span class="badge-tag">${escapeHtml(s.protocol)}</span></td>
      <td>${escapeHtml(s.time)}</td>
      <td class="text-right">
        <button class="btn btn-danger-outline" style="padding: 0.25rem 0.65rem; font-size: 0.78rem;" onclick="kickSession('${s.pid}', '${s.user}')">
          <i data-lucide="user-x" class="btn-icon"></i> Disconnect
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  if (window.lucide) lucide.createIcons();
}

async function kickSession(pid, username) {
  const res = await apiRequest(`/api/online/kill/${pid}`, 'POST');
  if (res && res.success) {
    showToast(`Disconnected session ${pid} (${username})`, 'info');
    fetchOnlineUsers();
  } else {
    showToast('Failed to disconnect session', 'error');
  }
}

// --------------------------------------------------------------------------
// System Services Tab
// --------------------------------------------------------------------------

async function fetchServices() {
  const data = await apiRequest('/api/services');
  if (!data || !data.success) return;

  const list = data.services || [];
  const container = document.getElementById('services-grid-container');
  container.innerHTML = '';

  for (const svc of list) {
    const card = document.createElement('div');
    card.className = 'service-card';

    let statusBadge = '';
    if (svc.status === 'active') {
      statusBadge = '<span class="status-badge active"><span class="status-indicator online inline"></span> Active</span>';
    } else if (svc.status === 'not-installed') {
      statusBadge = '<span class="status-badge locked">Not Installed</span>';
    } else {
      statusBadge = '<span class="status-badge expired">Stopped</span>';
    }

    card.innerHTML = `
      <div class="service-info">
        <div class="service-name">${escapeHtml(svc.name)}</div>
        <div class="service-desc">${escapeHtml(svc.desc)}</div>
        <div class="service-port">Ports: ${escapeHtml(svc.port)}</div>
        <div class="mt-2">${statusBadge}</div>
      </div>
      <div>
        <button class="btn btn-outline-sm" onclick="restartService('${svc.unit}')" title="Restart ${svc.name}">
          <i data-lucide="refresh-cw"></i>
        </button>
      </div>
    `;

    container.appendChild(card);
  }

  if (window.lucide) lucide.createIcons();
}

async function restartService(unit) {
  showToast(`Restarting service ${unit}...`, 'info');
  const res = await apiRequest(`/api/services/restart/${unit}`, 'POST');
  if (res && res.success) {
    showToast(`Service ${unit} restarted successfully!`, 'success');
    fetchServices();
  } else {
    showToast(res ? res.error : 'Failed to restart service', 'error');
  }
}

async function handleRestartAllServices() {
  if (!confirm('Restart all VPN services (SSH, Dropbear, Stunnel, WebSocket, BadVPN)? Connected users will briefly reconnect.')) return;

  showToast('Restarting all VPN daemons...', 'info');
  const res = await apiRequest('/api/services/restart-all', 'POST');
  if (res && res.success) {
    showToast('All VPN services restarted!', 'success');
    fetchServices();
  } else {
    showToast('Error restarting services', 'error');
  }
}

// --------------------------------------------------------------------------
// Audit Logs Tab
// --------------------------------------------------------------------------

async function fetchLogs() {
  const data = await apiRequest('/api/logs');
  if (!data || !data.success) return;

  const logs = data.logs || [];
  const tbody = document.getElementById('logs-table-body');
  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-muted">No logs recorded yet.</td></tr>`;
    return;
  }

  for (const log of logs) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="font-mono text-muted text-sm">${new Date(log.timestamp).toLocaleString()}</span></td>
      <td><span class="badge-tag">${escapeHtml(log.action)}</span></td>
      <td>${escapeHtml(log.details)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// --------------------------------------------------------------------------
// Settings Tab
// --------------------------------------------------------------------------

async function fetchSettings() {
  const data = await apiRequest('/api/settings');
  if (!data || !data.success) return;

  const s = data.settings;
  document.getElementById('settings-panel-name').value = s.panelName || 'Tunnel Forde LK';
  document.getElementById('settings-autokill-interval').value = s.autoKillInterval || 30;
  document.getElementById('settings-admin-user').value = s.adminUser || 'admin';

  const topAdminEl = document.getElementById('topbar-admin-username');
  if (topAdminEl) topAdminEl.innerText = s.adminUser || 'admin';

  // Telegram fields
  const tgTokenEl = document.getElementById('settings-tg-token');
  const tgChatIdEl = document.getElementById('settings-tg-chatid');
  const tgDailyBackupEl = document.getElementById('settings-tg-dailybackup');
  const tgLoginAlertEl = document.getElementById('settings-tg-loginalert');

  if (tgTokenEl) tgTokenEl.value = s.telegramBotToken || '';
  if (tgChatIdEl) tgChatIdEl.value = s.telegramChatId || '';
  if (tgDailyBackupEl) tgDailyBackupEl.checked = s.telegramDailyBackup !== false;
  if (tgLoginAlertEl) tgLoginAlertEl.checked = s.telegramLoginAlert !== false;

  fetchLicenseStatus();
}

async function fetchLicenseStatus() {
  const data = await apiRequest('/api/license/status');
  if (!data || !data.success || !data.license) return;

  const lic = data.license;
  const relEl = document.getElementById('license-panel-release');
  const statEl = document.getElementById('license-panel-status');
  const hintEl = document.getElementById('license-check-hint');

  if (lic.isFreeCommunity) {
    if (relEl) relEl.innerHTML = '<span class="text-emerald font-bold">Community Free Edition (Unlimited Access)</span>';
    if (statEl) statEl.innerHTML = '<span class="status-badge active"><span class="status-indicator online inline"></span> 🟢 Free Community Mode Active</span>';
    if (hintEl) hintEl.innerText = 'Currently running in Community Free Mode. Paid or Lifetime keys can be activated anytime.';
  } else {
    if (relEl) relEl.innerHTML = '<span class="text-cyan font-bold">Commercial Paid Edition</span>';
    if (lic.valid) {
      if (statEl) statEl.innerHTML = `<span class="status-badge active"><span class="status-indicator online inline"></span> 🔒 Active License (${lic.daysRemaining} days left)</span>`;
      if (hintEl) hintEl.innerHTML = `<span class="text-emerald font-bold">✔ Verified: ${lic.type} (Expires: ${lic.expiresAt})</span>`;
    } else {
      if (statEl) statEl.innerHTML = '<span class="status-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;"><span class="status-indicator offline inline"></span> ⛔ Unlicensed / Activation Required</span>';
      if (hintEl) hintEl.innerHTML = `<span class="text-rose font-bold">✖ ${lic.error || 'License Required. Contact @Black_Panther_V2ray'}</span>`;
    }
  }
}

async function handleSaveGeneralSettings(e) {
  e.preventDefault();
  const panelName = document.getElementById('settings-panel-name').value.trim();
  const autoKillInterval = document.getElementById('settings-autokill-interval').value;

  const res = await apiRequest('/api/settings', 'POST', { panelName, autoKillInterval });
  if (res && res.success) {
    showToast('Settings saved successfully!', 'success');
    document.title = `${panelName} - Web Panel`;
  } else {
    showToast('Failed to save settings', 'error');
  }
}

async function handleSaveAdminSettings(e) {
  e.preventDefault();
  const adminUsername = document.getElementById('settings-admin-user').value.trim();
  const newAdminPassword = document.getElementById('settings-admin-newpass').value.trim();
  const confirmPassword = document.getElementById('settings-admin-confirmpass').value.trim();
  const btn = document.getElementById('save-admin-cred-btn');

  if (!adminUsername || adminUsername.length < 3) {
    showToast('Admin username must be at least 3 characters long', 'error');
    document.getElementById('settings-admin-user').focus();
    return;
  }

  if (newAdminPassword) {
    if (newAdminPassword.length < 4) {
      showToast('New password must be at least 4 characters long', 'error');
      document.getElementById('settings-admin-newpass').focus();
      return;
    }
    if (newAdminPassword !== confirmPassword) {
      showToast('New passwords do not match!', 'error');
      document.getElementById('settings-admin-confirmpass').focus();
      return;
    }
  }

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="btn-icon"></i> Saving...';
  if (window.lucide) lucide.createIcons();

  const payload = {
    newAdminUsername: adminUsername
  };
  if (newAdminPassword) {
    payload.newAdminPassword = newAdminPassword;
  }

  const res = await apiRequest('/api/settings/admin', 'POST', payload);

  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="check-circle" class="btn-icon"></i> Save New Username & Password';
  if (window.lucide) lucide.createIcons();

  if (res && res.success) {
    showToast(res.message || 'Admin credentials updated successfully! 🎉', 'success');
    if (res.token) {
      authToken = res.token;
      localStorage.setItem('tfl_token', res.token);
    }
    document.getElementById('settings-admin-newpass').value = '';
    document.getElementById('settings-admin-confirmpass').value = '';
    if (res.username) {
      document.getElementById('settings-admin-user').value = res.username;
      const topAdminEl = document.getElementById('topbar-admin-username');
      if (topAdminEl) topAdminEl.innerText = res.username;
    }
  } else {
    showToast(res ? res.error : 'Failed to update credentials', 'error');
  }
}

async function handleSaveTelegramSettings(e) {
  e.preventDefault();
  const telegramBotToken = document.getElementById('settings-tg-token').value.trim();
  const telegramChatId = document.getElementById('settings-tg-chatid').value.trim();
  const telegramDailyBackup = document.getElementById('settings-tg-dailybackup').checked;
  const telegramLoginAlert = document.getElementById('settings-tg-loginalert').checked;

  const res = await apiRequest('/api/settings', 'POST', {
    telegramBotToken,
    telegramChatId,
    telegramDailyBackup,
    telegramLoginAlert
  });

  if (res && res.success) {
    showToast('Telegram Bot settings saved successfully!', 'success');
  } else {
    showToast('Failed to save Telegram settings', 'error');
  }
}

async function handleTestTelegram() {
  const token = document.getElementById('settings-tg-token').value.trim();
  const chatId = document.getElementById('settings-tg-chatid').value.trim();
  const btn = document.getElementById('test-tg-btn');

  if (!token || !chatId) {
    showToast('Please enter both Bot Token and Chat ID first', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="btn-icon"></i> Testing...';
  if (window.lucide) lucide.createIcons();

  const res = await apiRequest('/api/telegram/test', 'POST', { token, chatId });

  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="plug-zap" class="btn-icon"></i> Test Connection';
  if (window.lucide) lucide.createIcons();

  if (res && res.success) {
    showToast(`Connected to @${res.botUsername}! Test message sent.`, 'success');
  } else {
    showToast(res ? res.error : 'Connection test failed', 'error');
  }
}

async function handleSendTelegramBackup() {
  const btn = document.getElementById('send-tg-backup-btn');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="btn-icon"></i> Sending...';
  if (window.lucide) lucide.createIcons();

  showToast('Generating and uploading backup to Telegram...', 'info');
  const res = await apiRequest('/api/telegram/send-backup', 'POST');

  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="upload-cloud" class="btn-icon"></i> Send Backup Now';
  if (window.lucide) lucide.createIcons();

  if (res && res.success) {
    showToast('Backup file sent to your Telegram chat successfully! 📥', 'success');
  } else {
    showToast(res ? res.error : 'Failed to send backup to Telegram', 'error');
  }
}

async function handleRestoreBackup() {
  const fileInput = document.getElementById('restore-file-input');
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a backup JSON file first', 'error');
    return;
  }

  const file = fileInput.files[0];
  if (!confirm(`Are you sure you want to restore '${file.name}'? This will restore users and configuration on this VPS.`)) {
    return;
  }

  const btn = document.getElementById('restore-upload-btn');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="btn-icon"></i> Restoring accounts...';
  if (window.lucide) lucide.createIcons();

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const jsonContent = JSON.parse(e.target.result);
      const res = await apiRequest('/api/restore', 'POST', { backup: jsonContent });

      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="upload" class="btn-icon"></i> Upload & Restore Backup';
      if (window.lucide) lucide.createIcons();

      if (res && res.success) {
        showToast(res.message || 'Backup restored successfully!', 'success');
        fileInput.value = '';
        fetchUsers();
        fetchSystemStatus();
        fetchSettings();
      } else {
        showToast(res ? res.error : 'Failed to restore backup', 'error');
      }
    } catch (parseErr) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="upload" class="btn-icon"></i> Upload & Restore Backup';
      if (window.lucide) lucide.createIcons();
      showToast('Invalid JSON backup file format', 'error');
    }
  };

  reader.onerror = () => {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="upload" class="btn-icon"></i> Upload & Restore Backup';
    if (window.lucide) lucide.createIcons();
    showToast('Failed to read backup file', 'error');
  };

  reader.readAsText(file);
}

async function handleActivateLicense() {
  const keyInput = document.getElementById('license-input-key');
  const key = (keyInput ? keyInput.value : '').trim();
  const btn = document.getElementById('activate-license-btn');
  const hintEl = document.getElementById('license-check-hint');

  if (!key) {
    showToast('Please enter or paste your license key first', 'error');
    if (keyInput) keyInput.focus();
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="btn-icon"></i> Activating...';
  if (window.lucide) lucide.createIcons();

  const res = await apiRequest('/api/license/activate', 'POST', { key });

  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="key" class="btn-icon"></i> Activate';
  if (window.lucide) lucide.createIcons();

  if (res && res.success) {
    showToast(`License Activated: ${res.check.type} (${res.check.daysRemaining} days)! 🎉`, 'success');
    if (keyInput) keyInput.value = '';
    fetchLicenseStatus();
  } else {
    showToast(res ? res.error : 'License activation failed', 'error');
    if (hintEl) {
      hintEl.innerHTML = `<span class="text-rose font-bold">✖ ${res ? res.error : 'Activation failed'}</span>`;
    }
  }
}

// --------------------------------------------------------------------------
// Utilities
// --------------------------------------------------------------------------

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('d-none');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('d-none');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: '<i data-lucide="check-circle" class="text-emerald"></i>',
    error: '<i data-lucide="alert-circle" class="text-rose"></i>',
    info: '<i data-lucide="info" class="text-cyan"></i>'
  };

  toast.innerHTML = `
    ${iconMap[type] || ''}
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    }).catch(() => {
      fallbackCopy(text, successMsg);
    });
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast(successMsg, 'success');
}

function generateRandomPassword(len = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pass = '';
  for (let i = 0; i < len; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function formatUptime(seconds) {
  if (!seconds) return '0m';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(bytes) {
  const b = parseFloat(bytes) || 0;
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return parseFloat((b / Math.pow(k, idx)).toFixed(2)) + ' ' + sizes[idx];
}

