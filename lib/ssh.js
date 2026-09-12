const { execSync } = require('child_process');
const db = require('./db');

// Helper to format date YYYY-MM-DD
function formatDate(date) {
  const d = new Date(date);
  const month = '' + (d.getMonth() + 1);
  const day = '' + d.getDate();
  const year = d.getFullYear();

  return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

// Add days to date
function addDays(days) {
  const result = new Date();
  result.setDate(result.getDate() + parseInt(days, 10));
  return formatDate(result);
}

// Check if username is valid Linux username
function isValidUsername(username) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

// Create new SSH account
function createSshUser({ username, password, expireDays = 30, ipLimit = 1, note = '', dataLimitGB = 0 }) {
  if (!isValidUsername(username)) {
    throw new Error('Username must be 3-20 characters long and contain only letters, numbers, hyphens, and underscores.');
  }
  if (!password || password.length < 3) {
    throw new Error('Password must be at least 3 characters long.');
  }

  const existing = db.getUserByUsername(username);
  if (existing) {
    throw new Error(`User '${username}' already exists.`);
  }

  const expiryDate = addDays(expireDays);

  if (process.platform !== 'win32') {
    try {
      // 1. Create Linux user with disabled shell /bin/false
      execSync(`useradd -e "${expiryDate}" -s /bin/false -M "${username}" 2>&1`, { encoding: 'utf8' });
      // 2. Set password
      execSync(`echo "${username}:${password}" | chpasswd`, { encoding: 'utf8' });
    } catch (err) {
      throw new Error(`Failed to create system user: ${err.message}`);
    }
  }

  const newUser = db.addUser({
    username,
    password,
    expiryDate,
    expireDays: parseInt(expireDays, 10),
    ipLimit: parseInt(ipLimit, 10) || 1,
    note: note || '',
    dataLimitGB: parseFloat(dataLimitGB) || 0,
    uploadBytes: 0,
    downloadBytes: 0,
    totalUsageBytes: 0,
    status: 'active'
  });

  try {
    const traffic = require('./traffic');
    traffic.initUserAccounting(username);
  } catch (e) {}

  const quotaStr = dataLimitGB && parseFloat(dataLimitGB) > 0 ? `${dataLimitGB} GB` : 'Unlimited';
  db.addLog('CREATE_USER', `Created user ${username} (Expiry: ${expiryDate}, Limit: ${ipLimit} IP, Quota: ${quotaStr})`);
  return newUser;
}

// Renew SSH account
function renewSshUser(username, additionalDays, resetTraffic = false, dataLimitGB = null) {
  const user = db.getUserByUsername(username);
  if (!user) {
    throw new Error(`User '${username}' not found.`);
  }

  let baseDate = new Date();
  if (user.expiryDate) {
    const exp = new Date(user.expiryDate);
    if (exp > baseDate) {
      baseDate = exp;
    }
  }

  baseDate.setDate(baseDate.getDate() + parseInt(additionalDays, 10));
  const newExpiry = formatDate(baseDate);

  if (process.platform !== 'win32') {
    try {
      execSync(`chage -E "${newExpiry}" "${username}"`, { encoding: 'utf8' });
      // Unlock if it was locked/expired
      execSync(`usermod -U "${username}" 2>/dev/null || true`, { encoding: 'utf8' });
    } catch (err) {
      throw new Error(`Failed to update system expiry: ${err.message}`);
    }
  }

  const updates = {
    expiryDate: newExpiry,
    status: 'active'
  };

  if (resetTraffic) {
    updates.uploadBytes = 0;
    updates.downloadBytes = 0;
    updates.totalUsageBytes = 0;
  }

  if (dataLimitGB !== null && dataLimitGB !== undefined && dataLimitGB !== '') {
    updates.dataLimitGB = parseFloat(dataLimitGB) || 0;
  }

  db.updateUser(username, updates);

  db.addLog('RENEW_USER', `Renewed ${username} for +${additionalDays} days (New Expiry: ${newExpiry}${resetTraffic ? ', Reset Traffic' : ''})`);
  return db.getUserByUsername(username);
}

// Change Password
function changeSshPassword(username, newPassword) {
  const user = db.getUserByUsername(username);
  if (!user) {
    throw new Error(`User '${username}' not found.`);
  }
  if (!newPassword || newPassword.length < 3) {
    throw new Error('Password must be at least 3 characters.');
  }

  if (process.platform !== 'win32') {
    try {
      execSync(`echo "${username}:${newPassword}" | chpasswd`, { encoding: 'utf8' });
    } catch (err) {
      throw new Error(`Failed to change system password: ${err.message}`);
    }
  }

  db.updateUser(username, { password: newPassword });
  db.addLog('CHANGE_PASS', `Changed password for ${username}`);
  return true;
}

// Delete User
function deleteSshUser(username) {
  const user = db.getUserByUsername(username);
  if (!user) {
    throw new Error(`User '${username}' not found.`);
  }

  if (process.platform !== 'win32') {
    try {
      // Kill active sessions first
      execSync(`pkill -u "${username}" 2>/dev/null || true`, { encoding: 'utf8' });
      // Delete user
      execSync(`userdel -f "${username}" 2>&1`, { encoding: 'utf8' });
    } catch (err) {
      console.warn(`System userdel warning: ${err.message}`);
    }
  }

  try {
    const traffic = require('./traffic');
    traffic.removeUserAccounting(username);
  } catch (e) {}

  db.deleteUser(username);
  db.addLog('DELETE_USER', `Deleted user ${username}`);
  return true;
}

// Lock User (Disable access immediately)
function lockSshUser(username) {
  const user = db.getUserByUsername(username);
  if (!user) throw new Error(`User '${username}' not found.`);

  if (process.platform !== 'win32') {
    try {
      execSync(`pkill -u "${username}" 2>/dev/null || true`, { encoding: 'utf8' });
      execSync(`usermod -L "${username}" 2>&1`, { encoding: 'utf8' });
    } catch (e) {}
  }

  db.updateUser(username, { status: 'locked' });
  db.addLog('LOCK_USER', `Locked user ${username}`);
  return true;
}

// Unlock User
function unlockSshUser(username) {
  const user = db.getUserByUsername(username);
  if (!user) throw new Error(`User '${username}' not found.`);

  if (process.platform !== 'win32') {
    try {
      execSync(`usermod -U "${username}" 2>&1`, { encoding: 'utf8' });
    } catch (e) {}
  }

  db.updateUser(username, { status: 'active' });
  db.addLog('UNLOCK_USER', `Unlocked user ${username}`);
  return true;
}

// Check and mark expired accounts
function checkExpirations() {
  const users = db.getAllUsers();
  const today = formatDate(new Date());

  for (const u of users) {
    if (u.expiryDate && u.expiryDate < today && u.status === 'active') {
      db.updateUser(u.username, { status: 'expired' });
      if (process.platform !== 'win32') {
        try {
          execSync(`pkill -u "${u.username}" 2>/dev/null || true`, { encoding: 'utf8' });
          execSync(`usermod -L "${u.username}" 2>/dev/null || true`, { encoding: 'utf8' });
        } catch (e) {}
      }
      db.addLog('EXPIRE_AUTO', `Account ${u.username} expired automatically on ${u.expiryDate}`);
    }
  }
}

// Sync existing linux users created via autoscript into the DB
function syncSystemUsers() {
  if (process.platform === 'win32') return;

  try {
    // Read /etc/passwd users with shell /bin/false or /bin/sh that are UID >= 1000
    const out = execSync("awk -F: '$3 >= 1000 && $1 != \"nobody\" {print $1\":\"$3}' /etc/passwd", { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      const [uname] = line.split(':');
      if (!uname || uname === 'ubuntu' || uname === 'root') continue;

      const existing = db.getUserByUsername(uname);
      if (!existing) {
        // Try getting expiry from chage
        let expDate = '';
        try {
          const chageOut = execSync(`chage -l "${uname}" | grep "Account expires"`, { encoding: 'utf8' });
          const rawExp = chageOut.replace('Account expires', '').replace(':', '').trim();
          if (rawExp && rawExp !== 'never') {
            expDate = formatDate(new Date(rawExp));
          }
        } catch (e) {}

        db.addUser({
          username: uname,
          password: '***',
          expiryDate: expDate || addDays(30),
          expireDays: 30,
          ipLimit: 1,
          note: 'Synced from VPS system',
          status: 'active'
        });
      }
    }
  } catch (err) {
    console.error('[SSH] Failed to sync system users:', err.message);
  }
}

// Re-create restored users on Linux VPS
function syncRestoredSystemUsers(usersList) {
  if (process.platform === 'win32' || !Array.isArray(usersList)) return;

  for (const u of usersList) {
    if (!u.username) continue;
    try {
      const expDate = u.expiryDate || '';
      if (expDate) {
        execSync(`useradd -e "${expDate}" -s /bin/false -M "${u.username}" 2>/dev/null || chage -E "${expDate}" "${u.username}" 2>/dev/null || true`);
      } else {
        execSync(`useradd -s /bin/false -M "${u.username}" 2>/dev/null || true`);
      }

      if (u.password && u.password !== '***') {
        execSync(`echo "${u.username}:${u.password}" | chpasswd 2>/dev/null || true`);
      }

      if (u.status === 'locked' || u.status === 'expired') {
        execSync(`usermod -L "${u.username}" 2>/dev/null || true`);
      } else {
        execSync(`usermod -U "${u.username}" 2>/dev/null || true`);
      }
    } catch (e) {
      console.warn(`[SSH Restore] Warning provisioning ${u.username}:`, e.message);
    }
  }
}

module.exports = {
  createSshUser,
  renewSshUser,
  changeSshPassword,
  deleteSshUser,
  lockSshUser,
  unlockSshUser,
  checkExpirations,
  syncSystemUsers,
  syncRestoredSystemUsers
};
