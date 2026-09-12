const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const https = require('https');
const fs = require('fs');

const db = require('./lib/db');
const system = require('./lib/system');
const ssh = require('./lib/ssh');
const sessions = require('./lib/sessions');
const services = require('./lib/services');
const telegram = require('./lib/telegram');
const ssl = require('./lib/ssl');
const license = require('./lib/license');

const app = express();
const settings = db.getSettings();
const PORT = process.env.PORT || settings.panelPort || 54321;
const JWT_SECRET = settings.jwtSecret || 'tfl_secret_key_tunnel_forde_lk';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// JWT Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Token missing' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
  }
}

// --------------------------------------------------------------------------
// Public Routes
// --------------------------------------------------------------------------

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }

  if (db.verifyAdmin(username, password)) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    db.addLog('LOGIN', `Admin '${username}' logged in successfully`);

    // Telegram Login Alert
    const curSettings = db.getSettings();
    if (curSettings.telegramBotToken && curSettings.telegramChatId && curSettings.telegramLoginAlert !== false) {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      telegram.sendTelegramMessage(`🔔 <b>Admin Login Alert</b>\n\nAdmin <code>${username}</code> logged into <b>${curSettings.panelName || 'Tunnel Forde LK'}</b>\n🌐 IP: <code>${clientIp}</code>\n⏰ Time: <code>${new Date().toLocaleString()}</code>`).catch(() => {});
    }

    return res.json({
      success: true,
      token,
      admin: { username }
    });
  }

  db.addLog('FAILED_LOGIN', `Failed login attempt for username '${username}'`);
  return res.status(401).json({ success: false, error: 'Invalid admin username or password' });
});

// Panel Info (Public branding)
app.get('/api/info', (req, res) => {
  const curSettings = db.getSettings();
  res.json({
    name: curSettings.panelName || "Tunnel Forde LK",
    version: "1.0.0",
    serverIp: system.getPublicIp()
  });
});

// --------------------------------------------------------------------------
// Protected API Routes
// --------------------------------------------------------------------------

// Check Auth Status
app.get('/api/auth/check', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.admin });
});

// Full System Status (CPU, RAM, Network, Storage, Uptime)
app.get('/api/status', authMiddleware, (req, res) => {
  const fullStatus = system.getFullSystemStatus();
  const allUsers = db.getAllUsers();
  const online = sessions.getOnlineSessions();

  const userStats = {
    total: allUsers.length,
    active: allUsers.filter(u => u.status === 'active').length,
    expired: allUsers.filter(u => u.status === 'expired').length,
    locked: allUsers.filter(u => u.status === 'locked').length,
    onlineCount: online.length
  };

  res.json({
    success: true,
    system: fullStatus,
    stats: userStats
  });
});

// User Management: List Users
app.get('/api/users', authMiddleware, (req, res) => {
  ssh.checkExpirations();
  const users = db.getAllUsers();
  const online = sessions.getOnlineSessions();

  // Attach online session count to each user
  const usersWithOnline = users.map(u => {
    const activeCount = online.filter(s => s.user === u.username).length;
    return {
      ...u,
      onlineCount: activeCount,
      isOnline: activeCount > 0
    };
  });

  res.json({ success: true, users: usersWithOnline });
});

// User Management: Create User
app.post('/api/users', authMiddleware, (req, res) => {
  try {
    const { username, password, expireDays, ipLimit, note } = req.body;
    const user = ssh.createSshUser({ username, password, expireDays, ipLimit, note });
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// User Management: Renew User
app.post('/api/users/:username/renew', authMiddleware, (req, res) => {
  try {
    const { days } = req.body;
    const updated = ssh.renewSshUser(req.params.username, days || 30);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// User Management: Change Password
app.post('/api/users/:username/password', authMiddleware, (req, res) => {
  try {
    const { newPassword } = req.body;
    ssh.changeSshPassword(req.params.username, newPassword);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// User Management: Lock User
app.post('/api/users/:username/lock', authMiddleware, (req, res) => {
  try {
    ssh.lockSshUser(req.params.username);
    res.json({ success: true, message: `User ${req.params.username} locked` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// User Management: Unlock User
app.post('/api/users/:username/unlock', authMiddleware, (req, res) => {
  try {
    ssh.unlockSshUser(req.params.username);
    res.json({ success: true, message: `User ${req.params.username} unlocked` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// User Management: Delete User
app.delete('/api/users/:username', authMiddleware, (req, res) => {
  try {
    ssh.deleteSshUser(req.params.username);
    res.json({ success: true, message: `User ${req.params.username} deleted` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// User Config & Account Format (FastSSH / HTTP Custom ready)
app.get('/api/users/:username/config', authMiddleware, (req, res) => {
  const user = db.getUserByUsername(req.params.username);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const curSettings = db.getSettings();
  const serverIp = system.getPublicIp();

  const configData = {
    username: user.username,
    password: user.password,
    serverIp: serverIp,
    host: serverIp,
    expiryDate: user.expiryDate,
    ipLimit: user.ipLimit,
    ports: {
      openSsh: curSettings.sshDirectPort || 22,
      dropbear: curSettings.dropbearPort || 109,
      stunnel: curSettings.stunnelPort || 443,
      wsHttp: curSettings.wsHttpPort || 80,
      wsTls: curSettings.wsTlsPort || 443,
      badvpnUdp: curSettings.badvpnPort || 7300,
      slowDns: curSettings.slowDnsPort || 5300
    },
    payloads: {
      websocketHttp: `GET / HTTP/1.1[crlf]Host: ${serverIp}[crlf]Upgrade: websocket[crlf]Connection: Keep-Alive[crlf][crlf]`,
      websocketCloudflare: `GET / HTTP/1.1[crlf]Host: [host][crlf]Upgrade: websocket[crlf]Connection: Keep-Alive[crlf][crlf]`
    },
    formattedText: `=================================
⚡ ${curSettings.panelName || 'Tunnel Forde LK'} - SSH Account
=================================
Host / IP      : ${serverIp}
Username       : ${user.username}
Password       : ${user.password}
Expired Date   : ${user.expiryDate}
Login Limit    : ${user.ipLimit} Device(s)
---------------------------------
OpenSSH Port   : ${curSettings.sshDirectPort || 22}
Dropbear Port  : ${curSettings.dropbearPort || 109}
SSL/TLS Port   : ${curSettings.stunnelPort || 443}
WS (HTTP) Port : ${curSettings.wsHttpPort || 80}
WS (TLS) Port  : ${curSettings.wsTlsPort || 443}
BadVPN UDPGW   : ${curSettings.badvpnPort || 7300}
---------------------------------
HTTP Custom / NapsternetV Payload:
GET / HTTP/1.1[crlf]Host: ${serverIp}[crlf]Upgrade: websocket[crlf]Connection: Keep-Alive[crlf][crlf]
=================================
Thank you for using Tunnel Forde LK!
=================================`
  };

  res.json({ success: true, config: configData });
});

// Online Sessions
app.get('/api/online', authMiddleware, (req, res) => {
  const activeSessions = sessions.getOnlineSessions();
  res.json({ success: true, sessions: activeSessions });
});

// Kill session by PID
app.post('/api/online/kill/:pid', authMiddleware, (req, res) => {
  try {
    sessions.killSession(req.params.pid);
    res.json({ success: true, message: `Session PID ${req.params.pid} killed` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Kick all sessions for username
app.post('/api/online/kick/:username', authMiddleware, (req, res) => {
  try {
    sessions.kickUser(req.params.username);
    res.json({ success: true, message: `All sessions for ${req.params.username} terminated` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// System Services Status
app.get('/api/services', authMiddleware, (req, res) => {
  const list = services.getServicesStatus();
  res.json({ success: true, services: list });
});

// Restart a service
app.post('/api/services/restart/:unit', authMiddleware, (req, res) => {
  try {
    services.restartService(req.params.unit);
    db.addLog('RESTART_SERVICE', `Restarted service ${req.params.unit}`);
    res.json({ success: true, message: `Service ${req.params.unit} restarted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restart all services
app.post('/api/services/restart-all', authMiddleware, (req, res) => {
  try {
    const result = services.restartAllServices();
    db.addLog('RESTART_ALL', 'Restarted all VPN and network tunnel services');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Settings & Config
app.get('/api/settings', authMiddleware, (req, res) => {
  const current = db.getSettings();
  const safeSettings = { ...current };
  delete safeSettings.adminPassHash;
  delete safeSettings.jwtSecret;
  res.json({ success: true, settings: safeSettings });
});

// Update Settings
app.post('/api/settings', authMiddleware, (req, res) => {
  try {
    const { panelName, autoKillInterval, ports, adminUsername, newAdminPassword } = req.body;
    const updates = {};

    if (panelName) updates.panelName = panelName;
    if (typeof autoKillInterval !== 'undefined') updates.autoKillInterval = parseInt(autoKillInterval, 10);
    if (adminUsername) updates.adminUser = adminUsername;
    if (newAdminPassword && newAdminPassword.length >= 4) {
      db.setAdminPassword(newAdminPassword);
    }
    if (typeof req.body.telegramBotToken !== 'undefined') updates.telegramBotToken = req.body.telegramBotToken.trim();
    if (typeof req.body.telegramChatId !== 'undefined') updates.telegramChatId = req.body.telegramChatId.trim();
    if (typeof req.body.telegramDailyBackup !== 'undefined') updates.telegramDailyBackup = !!req.body.telegramDailyBackup;
    if (typeof req.body.telegramLoginAlert !== 'undefined') updates.telegramLoginAlert = !!req.body.telegramLoginAlert;

    if (ports && typeof ports === 'object') {
      if (ports.sshDirectPort) updates.sshDirectPort = parseInt(ports.sshDirectPort, 10);
      if (ports.dropbearPort) updates.dropbearPort = parseInt(ports.dropbearPort, 10);
      if (ports.stunnelPort) updates.stunnelPort = parseInt(ports.stunnelPort, 10);
      if (ports.wsHttpPort) updates.wsHttpPort = parseInt(ports.wsHttpPort, 10);
      if (ports.wsTlsPort) updates.wsTlsPort = parseInt(ports.wsTlsPort, 10);
      if (ports.badvpnPort) updates.badvpnPort = parseInt(ports.badvpnPort, 10);
      if (ports.slowDnsPort) updates.slowDnsPort = parseInt(ports.slowDnsPort, 10);
    }

    const saved = db.updateSettings(updates);
    db.addLog('SETTINGS_UPDATE', 'Updated panel configuration settings');
    res.json({ success: true, settings: saved });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update Admin Credentials (Username & Password)
app.post('/api/settings/admin', authMiddleware, (req, res) => {
  try {
    const { currentPassword, newAdminUsername, newAdminPassword } = req.body;

    // If currentPassword is provided, verify it (optional safeguard)
    if (currentPassword && !db.verifyPasswordOnly(currentPassword)) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    const curSettings = db.getSettings();
    let usernameChanged = false;
    let passwordChanged = false;
    let updatedUser = curSettings.adminUser;

    if (newAdminUsername && newAdminUsername.trim()) {
      const cleanUser = newAdminUsername.trim();
      if (cleanUser.length < 3) {
        return res.status(400).json({ success: false, error: 'Admin username must be at least 3 characters' });
      }
      if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanUser)) {
        return res.status(400).json({ success: false, error: 'Username can only contain letters, numbers, dots, dashes, and underscores' });
      }
      if (cleanUser !== curSettings.adminUser) {
        db.setAdminUsername(cleanUser);
        usernameChanged = true;
        updatedUser = cleanUser;
      }
    }

    if (newAdminPassword) {
      if (newAdminPassword.length < 4) {
        return res.status(400).json({ success: false, error: 'New password must be at least 4 characters' });
      }
      db.setAdminPassword(newAdminPassword);
      passwordChanged = true;
    }

    if (!usernameChanged && !passwordChanged) {
      return res.status(400).json({ success: false, error: 'No changes detected. Please enter a new username or password.' });
    }

    const newToken = jwt.sign({ username: updatedUser }, JWT_SECRET, { expiresIn: '7d' });
    db.addLog('ADMIN_CREDENTIALS', `Admin credentials changed (Username: ${updatedUser}, Password updated: ${passwordChanged})`);

    if (curSettings.telegramBotToken && curSettings.telegramChatId && curSettings.telegramLoginAlert !== false) {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      telegram.sendTelegramMessage(`🔐 <b>Admin Credentials Changed</b>\n\nAdmin username: <code>${updatedUser}</code>\nPassword updated: <b>${passwordChanged ? 'Yes' : 'No'}</b>\n🌐 IP: <code>${clientIp}</code>\n⏰ Time: <code>${new Date().toLocaleString()}</code>`).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Admin credentials updated successfully!',
      username: updatedUser,
      token: newToken,
      usernameChanged,
      passwordChanged
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Telegram: Test Bot Connection
app.post('/api/telegram/test', authMiddleware, async (req, res) => {
  try {
    const { token, chatId } = req.body;
    const result = await telegram.testConnection(token, chatId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Telegram: Send Backup File Now
app.post('/api/telegram/send-backup', authMiddleware, async (req, res) => {
  try {
    const result = await telegram.sendTelegramBackup();
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit Logs
app.get('/api/logs', authMiddleware, (req, res) => {
  res.json({ success: true, logs: db.getLogs() });
});

// Backup Database
app.get('/api/backup', authMiddleware, (req, res) => {
  const data = {
    settings: db.getSettings(),
    users: db.getAllUsers(),
    logs: db.getLogs(),
    exportedAt: new Date().toISOString()
  };
  res.setHeader('Content-disposition', `attachment; filename=tunnel-forde-lk-backup-${Date.now()}.json`);
  res.setHeader('Content-type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

// Restore Database Backup
app.post('/api/restore', authMiddleware, (req, res) => {
  try {
    const { backup } = req.body;
    if (!backup) {
      return res.status(400).json({ success: false, error: 'No backup data provided in request' });
    }

    const restoreResult = db.restoreData(backup);

    // Sync restored users on the VPS Linux system
    ssh.syncRestoredSystemUsers(restoreResult.users);

    res.json({
      success: true,
      message: `Successfully restored ${restoreResult.restoredCount} account(s) and panel settings!`,
      restoredCount: restoreResult.restoredCount
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// SSL Certificate Status
app.get('/api/ssl/status', authMiddleware, (req, res) => {
  res.json({ success: true, ssl: ssl.getCertificateStatus() });
});

// Check Domain DNS Resolution
app.post('/api/ssl/check-dns', authMiddleware, async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ success: false, error: 'Domain is required' });
  const check = await ssl.checkDomainResolution(domain);
  res.json({ success: true, check });
});

// Issue / Request SSL Certificate (Let's Encrypt)
app.post('/api/ssl/issue', authMiddleware, async (req, res) => {
  const { domain, email } = req.body;
  if (!domain) return res.status(400).json({ success: false, error: 'Domain is required' });

  try {
    const cert = await ssl.issueCertificate(domain, email);
    res.json({ success: true, message: `SSL Certificate issued successfully for ${domain}!`, cert });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Toggle Web Panel HTTPS
app.post('/api/ssl/toggle-https', authMiddleware, (req, res) => {
  try {
    const { enable } = req.body;
    const settings = ssl.togglePanelHttps(enable);
    res.json({
      success: true,
      message: `HTTPS ${enable ? 'enabled' : 'disabled'}. Restart panel to apply.`,
      settings
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Apply SSL to VPN Services (Stunnel & Xray)
app.post('/api/ssl/apply-vpn', authMiddleware, (req, res) => {
  try {
    const settings = db.getSettings();
    ssl.applyCertToVpnServices(settings.sslDomain || 'localhost');
    res.json({ success: true, message: 'SSL certificates applied to Stunnel & VPN daemons!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// License System Routes
// --------------------------------------------------------------------------

// Get License Status
app.get('/api/license/status', (req, res) => {
  res.json({ success: true, license: license.getPanelLicenseStatus() });
});

// Activate License Key
app.post('/api/license/activate', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ success: false, error: 'License key is required' });
  const result = license.activateKey(key);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// Switch License Mode (Free vs Paid)
app.post('/api/license/mode', authMiddleware, (req, res) => {
  const { mode } = req.body;
  if (!['free', 'paid'].includes(mode)) {
    return res.status(400).json({ success: false, error: "Mode must be 'free' or 'paid'" });
  }
  license.setGlobalMasterMode(mode);
  db.addLog('LICENSE_MODE_CHANGE', `Switched license mode to ${mode}`);
  res.json({ success: true, message: `License mode updated to ${mode}`, license: license.getPanelLicenseStatus() });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------------------------------------------------------------------
// Boot & Background Tasks
// --------------------------------------------------------------------------

const curSettings = db.getSettings();
const hasSslCerts = fs.existsSync(ssl.CERT_FILE) && fs.existsSync(ssl.KEY_FILE);

const onServerStart = (protocol) => {
  console.log(`====================================================`);
  console.log(`⚡ Tunnel Forde LK Web Panel running (${protocol}) on port ${PORT}`);
  console.log(`⚡ Web UI: ${protocol.toLowerCase()}://localhost:${PORT}`);
  console.log(`====================================================`);

  // Sync existing VPS users on start
  ssh.syncSystemUsers();

  // Initialize Telegram Bot Service (Commands & Auto-Backups)
  telegram.initTelegramWorker();

  // Background Auto-kill loop (every 30s)
  setInterval(() => {
    try {
      sessions.runAutoKillEnforcer();
    } catch (e) {
      console.error('[AutoKill Loop Error]:', e.message);
    }
  }, 30000);

  // Expiration checker (every 30 mins)
  setInterval(() => {
    try {
      ssh.checkExpirations();
    } catch (e) {
      console.error('[Expire Loop Error]:', e.message);
    }
  }, 30 * 60 * 1000);
};

if (curSettings.enableHttps && hasSslCerts) {
  try {
    const httpsOpts = {
      cert: fs.readFileSync(ssl.CERT_FILE),
      key: fs.readFileSync(ssl.KEY_FILE)
    };
    https.createServer(httpsOpts, app).listen(PORT, '0.0.0.0', () => onServerStart('HTTPS'));
  } catch (e) {
    console.warn('[SSL] Failed to start HTTPS server, falling back to HTTP:', e.message);
    app.listen(PORT, '0.0.0.0', () => onServerStart('HTTP'));
  }
} else {
  app.listen(PORT, '0.0.0.0', () => onServerStart('HTTP'));
}
