const fs = require('fs');
const { execSync } = require('child_process');
const db = require('./db');

// Cache to track delta per PID: pid -> { rchar, wchar, lastTime }
const pidIoCache = new Map();

// Helper to format bytes into readable string
function formatBytes(bytes) {
  const b = parseFloat(bytes) || 0;
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return parseFloat((b / Math.pow(k, idx)).toFixed(2)) + ' ' + sizes[idx];
}

// Setup iptables rule for a user's UID (output bandwidth accounting)
function initUserAccounting(username) {
  if (process.platform === 'win32') return;
  try {
    execSync(`iptables -C OUTPUT -m owner --uid-owner "${username}" -j ACCEPT 2>/dev/null || iptables -A OUTPUT -m owner --uid-owner "${username}" -j ACCEPT 2>/dev/null || true`);
  } catch (e) {}
}

// Remove iptables rule for a user
function removeUserAccounting(username) {
  if (process.platform === 'win32') return;
  try {
    execSync(`iptables -D OUTPUT -m owner --uid-owner "${username}" -j ACCEPT 2>/dev/null || true`);
  } catch (e) {}
}

// Read process IO stats from /proc/<pid>/io
function getPidIo(pid) {
  if (process.platform === 'win32') return null;
  try {
    const ioPath = `/proc/${pid}/io`;
    if (!fs.existsSync(ioPath)) return null;

    const content = fs.readFileSync(ioPath, 'utf8');
    let rchar = 0;
    let wchar = 0;

    for (const line of content.split('\n')) {
      if (line.startsWith('rchar:')) {
        rchar = parseInt(line.split(':')[1].trim(), 10) || 0;
      } else if (line.startsWith('wchar:')) {
        wchar = parseInt(line.split(':')[1].trim(), 10) || 0;
      }
    }
    return { rchar, wchar };
  } catch (e) {
    return null;
  }
}

// Read iptables byte counter for UID
function getIptablesBytes(username) {
  if (process.platform === 'win32') return 0;
  try {
    const out = execSync(`iptables -nvx -L OUTPUT 2>/dev/null | grep "${username}" || true`, { encoding: 'utf8' });
    const match = out.trim().match(/^\s*\d+\s+(\d+)/);
    if (match) {
      return parseInt(match[1], 10) || 0;
    }
  } catch (e) {}
  return 0;
}

// Poll traffic for all active sessions & update database
function pollTraffic(sessionsList = []) {
  if (process.platform === 'win32') return;

  const currentPids = new Set();
  const userDelta = {}; // username -> { up: 0, down: 0 }

  for (const s of sessionsList) {
    const pid = s.pid;
    const user = s.user;
    if (!pid || pid === 'sshd' || !user) continue;

    currentPids.add(pid);
    const io = getPidIo(pid);
    if (!io) continue;

    if (!userDelta[user]) {
      userDelta[user] = { up: 0, down: 0 };
    }

    if (pidIoCache.has(pid)) {
      const prev = pidIoCache.get(pid);
      // rchar is bytes read by daemon (from socket: upload by client)
      // wchar is bytes written by daemon (to socket: download by client)
      const dUp = Math.max(0, io.rchar - prev.rchar);
      const dDown = Math.max(0, io.wchar - prev.wchar);

      userDelta[user].up += dUp;
      userDelta[user].down += dDown;
    }

    pidIoCache.set(pid, { rchar: io.rchar, wchar: io.wchar, time: Date.now() });
  }

  // Clean dead PIDs from cache
  for (const cachedPid of pidIoCache.keys()) {
    if (!currentPids.has(cachedPid)) {
      pidIoCache.delete(cachedPid);
    }
  }

  // Apply deltas to DB
  let dbChanged = false;
  for (const [uname, delta] of Object.entries(userDelta)) {
    if (delta.up > 0 || delta.down > 0) {
      const u = db.getUserByUsername(uname);
      if (u) {
        const curUp = parseFloat(u.uploadBytes) || 0;
        const curDown = parseFloat(u.downloadBytes) || 0;
        const newUp = curUp + delta.up;
        const newDown = curDown + delta.down;
        const newTotal = newUp + newDown;

        db.updateUser(uname, {
          uploadBytes: newUp,
          downloadBytes: newDown,
          totalUsageBytes: newTotal
        });
        dbChanged = true;

        // Check if data limit exceeded
        const limitGB = parseFloat(u.dataLimitGB) || 0;
        if (limitGB > 0) {
          const maxBytes = limitGB * 1024 * 1024 * 1024;
          if (newTotal >= maxBytes && u.status === 'active') {
            db.updateUser(uname, { status: 'locked' });
            db.addLog('DATA_LIMIT_EXCEEDED', `Account '${uname}' reached data limit (${limitGB} GB / used ${formatBytes(newTotal)}). Auto-locked.`);
            try {
              execSync(`pkill -u "${uname}" 2>&1 || true`);
            } catch (e) {}
          }
        }
      }
    }
  }
}

// Reset user's traffic counter
function resetUserTraffic(username) {
  const user = db.getUserByUsername(username);
  if (!user) throw new Error(`User '${username}' not found`);

  db.updateUser(username, {
    uploadBytes: 0,
    downloadBytes: 0,
    totalUsageBytes: 0
  });

  db.addLog('RESET_TRAFFIC', `Reset data usage for user '${username}'`);
  return true;
}

module.exports = {
  formatBytes,
  initUserAccounting,
  removeUserAccounting,
  pollTraffic,
  resetUserTraffic
};
