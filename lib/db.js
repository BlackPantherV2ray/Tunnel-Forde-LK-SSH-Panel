const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'tfl_panel.json');

// Default database structure
const defaultData = {
  settings: {
    panelName: "Tunnel Forde LK",
    panelPort: 54321,
    adminUser: "admin",
    adminPassHash: "", // will be set on init
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    autoKillInterval: 60, // seconds, 0 = disabled
    telegramBotToken: "",
    telegramChatId: "",
    sshDirectPort: 22,
    dropbearPort: 109,
    stunnelPort: 443,
    wsHttpPort: 80,
    wsTlsPort: 443,
    badvpnPort: 7300,
    slowDnsPort: 5300
  },
  users: [],
  logs: []
};

let db = null;

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(raw);
      // Ensure any missing default keys are set
      db.settings = { ...defaultData.settings, ...(db.settings || {}) };
      if (!Array.isArray(db.users)) db.users = [];
      if (!Array.isArray(db.logs)) db.logs = [];
    } else {
      db = JSON.parse(JSON.stringify(defaultData));
      // Default password: admin (sha256 hash or bcrypt)
      db.settings.adminPassHash = crypto.createHash('sha256').update('admin').digest('hex');
      saveDb();
    }
  } catch (err) {
    console.error('[DB] Error loading DB, using fallback:', err.message);
    db = JSON.parse(JSON.stringify(defaultData));
    db.settings.adminPassHash = crypto.createHash('sha256').update('admin').digest('hex');
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error saving DB:', err.message);
  }
}

// Initialize on module load
loadDb();

module.exports = {
  getSettings: () => {
    return { ...db.settings };
  },
  
  updateSettings: (newSettings) => {
    db.settings = { ...db.settings, ...newSettings };
    saveDb();
    return db.settings;
  },

  verifyAdmin: (username, password) => {
    if (username !== db.settings.adminUser) return false;
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    return hash === db.settings.adminPassHash;
  },

  verifyPasswordOnly: (password) => {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    return hash === db.settings.adminPassHash;
  },

  setAdminPassword: (newPassword) => {
    db.settings.adminPassHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    saveDb();
    return true;
  },

  setAdminUsername: (newUsername) => {
    db.settings.adminUser = newUsername;
    saveDb();
    return true;
  },

  setAdminCredentials: (newUsername, newPassword) => {
    if (newUsername) db.settings.adminUser = newUsername;
    if (newPassword) db.settings.adminPassHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    saveDb();
    return true;
  },

  getAllUsers: () => {
    return [...db.users];
  },

  getUserByUsername: (username) => {
    return db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  },

  addUser: (userObj) => {
    const existingIndex = db.users.findIndex(u => u.username.toLowerCase() === userObj.username.toLowerCase());
    if (existingIndex >= 0) {
      db.users[existingIndex] = { ...db.users[existingIndex], ...userObj, updatedAt: new Date().toISOString() };
    } else {
      db.users.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active', // active, expired, locked
        ...userObj
      });
    }
    saveDb();
    return db.users.find(u => u.username.toLowerCase() === userObj.username.toLowerCase());
  },

  updateUser: (username, updates) => {
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (user) {
      Object.assign(user, updates, { updatedAt: new Date().toISOString() });
      saveDb();
      return user;
    }
    return null;
  },

  deleteUser: (username) => {
    const initialLen = db.users.length;
    db.users = db.users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
    if (db.users.length !== initialLen) {
      saveDb();
      return true;
    }
    return false;
  },

  addLog: (action, details) => {
    db.logs.unshift({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action,
      details
    });
    // Keep max 200 logs
    if (db.logs.length > 200) {
      db.logs = db.logs.slice(0, 200);
    }
    saveDb();
  },

  getLogs: () => {
    return [...db.logs];
  },

  restoreData: (backupObj) => {
    if (!backupObj || typeof backupObj !== 'object') {
      throw new Error('Invalid backup file structure: expected JSON object');
    }

    // Restore Settings if present
    if (backupObj.settings && typeof backupObj.settings === 'object') {
      const currentPass = db.settings.adminPassHash;
      db.settings = { ...db.settings, ...backupObj.settings };
      if (!backupObj.settings.adminPassHash) {
        db.settings.adminPassHash = currentPass;
      }
    }

    // Restore Users
    let restoredCount = 0;
    if (Array.isArray(backupObj.users)) {
      db.users = backupObj.users;
      restoredCount = backupObj.users.length;
    }

    // Restore Logs
    if (Array.isArray(backupObj.logs)) {
      db.logs = backupObj.logs;
    }

    module.exports.addLog('RESTORE_BACKUP', `Restored backup containing ${restoredCount} account(s)`);
    saveDb();

    return {
      success: true,
      restoredCount,
      users: db.users
    };
  }
};
