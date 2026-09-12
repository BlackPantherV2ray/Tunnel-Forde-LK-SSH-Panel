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
  if (tabId === 'dashboard') fetchSystemStatus();
  if (tabId === 'users') fetchUsers();
  if (tabId === 'online') fetchOnlineUsers();
  if (tabId === 'services') fetchServices();
  if (tabId === 'logs') fetchLogs();
  if (tabId === 'settings') fetchSettings();

  if (window.lucide) lucide.createIcons();
}

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

  const sys = data.system;
  const stats = data.stats;

  // Update Stat Cards
  document.getElementById('stat-total-users').innerText = stats.total;
  document.getElementById('stat-active-users').innerText = stats.active;
  document.getElementById('stat-online-sessions').innerText = stats.onlineCount;
  document.getElementById('stat-expired-users').innerText = stats.expired;
  document.getElementById('stat-locked-users').innerText = stats.locked;

  // Sidebar badges
  document.getElementById('sidebar-user-count').innerText = stats.total;
  document.getElementById('sidebar-online-count').innerText = stats.onlineCount;

  // System Gauges
  const cpuPercent = sys.cpu;
  document.getElementById('gauge-cpu-val').innerText = `${cpuPercent}%`;
  document.getElementById('gauge-cpu-bar').style.width = `${cpuPercent}%`;

  const ram = sys.memory;
  document.getElementById('gauge-ram-val').innerText = `${ram.used} MB / ${ram.total} MB (${ram.percent}%)`;
  document.getElementById('gauge-ram-bar').style.width = `${ram.percent}%`;

  const disk = sys.disk;
  document.getElementById('gauge-disk-val').innerText = `${disk.used} MB / ${disk.total} MB (${disk.percent}%)`;
  document.getElementById('gauge-disk-bar').style.width = `${disk.percent}%`;

  // Traffic / Network
  const net = sys.network;
  const totalMB = (parseFloat(net.totalRxMB) + parseFloat(net.totalTxMB)).toFixed(1);
  document.getElementById('stat-total-traffic').innerText = `${totalMB} MB`;
  document.getElementById('stat-rx-traffic').innerText = net.totalRxMB;
  document.getElementById('stat-tx-traffic').innerText = net.totalTxMB;
  document.getElementById('top-rx-speed').innerText = `${net.rxSpeedKB} KB/s`;
  document.getElementById('top-tx-speed').innerText = `${net.txSpeedKB} KB/s`;

  // OS & Specs
  const osInfo = sys.os;
  document.getElementById('spec-ip').innerText = osInfo.publicIp;
  document.getElementById('sidebar-ip').innerText = osInfo.publicIp;
  document.getElementById('spec-os').innerText = osInfo.osName;
  document.getElementById('spec-arch').innerText = osInfo.arch;
  document.getElementById('spec-hostname').innerText = osInfo.hostname;

  const uptimeStr = formatUptime(osInfo.uptimeSeconds);
  document.getElementById('spec-uptime').innerText = uptimeStr;
  document.getElementById('sidebar-uptime').innerText = `Uptime: ${uptimeStr}`;
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
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No accounts match your search.</td></tr>`;
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

    tr.innerHTML = `
      <td>${statusHtml}</td>
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td><span class="font-mono text-muted">${escapeHtml(user.password)}</span></td>
      <td><span class="font-mono">${user.expiryDate || 'Never'}</span></td>
      <td>${user.ipLimit || 1} Device(s)</td>
      <td>${liveBadge}</td>
      <td><span class="text-muted text-sm">${escapeHtml(user.note || '-')}</span></td>
      <td class="text-right">
        <div class="table-actions">
          <button class="action-btn-sm btn-copy-cfg" title="View Config / FastSSH" onclick="openConfigModal('${user.username}')">
            <i data-lucide="share-2"></i>
          </button>
          <button class="action-btn-sm btn-renew" title="Renew Account (+Days)" onclick="openRenewModal('${user.username}')">
            <i data-lucide="calendar-plus"></i>
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
  const note = document.getElementById('new-note').value.trim();
  const btn = document.getElementById('submit-create-user-btn');

  btn.disabled = true;
  btn.innerText = 'Creating on VPS...';

  const res = await apiRequest('/api/users', 'POST', { username, password, expireDays, ipLimit, note });

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
  openModal('renew-modal');
}

async function handleRenewUser(e) {
  e.preventDefault();
  if (!currentEditingUser) return;

  const days = document.getElementById('renew-custom-days').value;
  const res = await apiRequest(`/api/users/${currentEditingUser}/renew`, 'POST', { days });

  if (res && res.success) {
    showToast(`Renewed ${currentEditingUser} for +${days} days!`, 'success');
    closeModal('renew-modal');
    fetchUsers();
  } else {
    showToast(res ? res.error : 'Failed to renew account', 'error');
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
