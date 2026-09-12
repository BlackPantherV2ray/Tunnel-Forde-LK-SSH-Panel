const { execSync } = require('child_process');
const db = require('./db');

// Get active Dropbear & OpenSSH sessions
function getOnlineSessions() {
  const sessions = [];

  if (process.platform === 'win32') {
    // Mock sessions for local development
    return [
      { pid: '1042', user: 'demo_user', ip: '112.134.140.22', protocol: 'Dropbear WS', time: '12m 45s' },
      { pid: '1058', user: 'test_client', ip: '175.157.88.91', protocol: 'OpenSSH Direct', time: '3m 12s' }
    ];
  }

  try {
    // 1. Check Dropbear sessions
    // Dropbear session processes typically look like: /usr/sbin/dropbear -p ... or child dropbear [PID]: ...
    const dropbearPs = execSync("ps aux | grep -i '[d]ropbear' | grep -v 'dropbear -' || true", { encoding: 'utf8' });
    const dropbearLines = dropbearPs.trim().split('\n');
    for (const line of dropbearLines) {
      if (!line) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[1];
      const user = parts[0];

      // Try finding the connected client IP via netstat or ss or lsof
      let clientIp = 'Unknown IP';
      try {
        const netOut = execSync(`ss -t -p -n 2>/dev/null | grep "pid=${pid}," || lsof -p ${pid} -n -P -i 2>/dev/null || true`, { encoding: 'utf8' });
        const ipMatch = netOut.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+/);
        if (ipMatch) {
          clientIp = ipMatch[2];
        }
      } catch (e) {}

      if (user && user !== 'root') {
        sessions.push({
          pid,
          user,
          ip: clientIp,
          protocol: 'Dropbear',
          time: parts[9] || 'Active'
        });
      }
    }
  } catch (err) {
    console.error('[Sessions] Dropbear parse error:', err.message);
  }

  try {
    // 2. Check OpenSSH sessions via 'who' and 'ps aux | grep sshd'
    const whoOut = execSync('who 2>/dev/null || true', { encoding: 'utf8' });
    const whoLines = whoOut.trim().split('\n');
    for (const line of whoLines) {
      if (!line) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const user = parts[0];
        const rawIp = parts[4] ? parts[4].replace(/[()]/g, '') : 'Unknown IP';
        if (user && user !== 'root') {
          sessions.push({
            pid: 'sshd',
            user,
            ip: rawIp,
            protocol: 'OpenSSH',
            time: `${parts[2]} ${parts[3]}`
          });
        }
      }
    }
  } catch (err) {
    console.error('[Sessions] OpenSSH parse error:', err.message);
  }

  return sessions;
}

// Kill a specific PID session
function killSession(pid) {
  if (!pid || pid === 'sshd') return false;
  try {
    if (process.platform !== 'win32') {
      execSync(`kill -9 ${pid} 2>&1`, { encoding: 'utf8' });
    }
    db.addLog('KILL_SESSION', `Killed session PID ${pid}`);
    return true;
  } catch (err) {
    throw new Error(`Failed to kill process PID ${pid}: ${err.message}`);
  }
}

// Kick all sessions for a username
function kickUser(username) {
  try {
    if (process.platform !== 'win32') {
      execSync(`pkill -u "${username}" 2>&1 || true`, { encoding: 'utf8' });
    }
    db.addLog('KICK_USER', `Disconnected all active sessions for ${username}`);
    return true;
  } catch (err) {
    throw new Error(`Failed to kick ${username}: ${err.message}`);
  }
}

// Auto-Kill Enforcer (Runs on interval)
function runAutoKillEnforcer() {
  const settings = db.getSettings();
  if (!settings.autoKillInterval || settings.autoKillInterval <= 0) return;

  const activeSessions = getOnlineSessions();
  const userSessionMap = {};

  for (const s of activeSessions) {
    if (!userSessionMap[s.user]) {
      userSessionMap[s.user] = [];
    }
    userSessionMap[s.user].push(s);
  }

  const allUsers = db.getAllUsers();
  for (const u of allUsers) {
    const sessions = userSessionMap[u.username];
    if (sessions && sessions.length > 0) {
      const limit = u.ipLimit || 1;
      if (sessions.length > limit) {
        console.log(`[AutoKill] User ${u.username} exceeded limit (${sessions.length}/${limit}). Terminating extra sessions...`);
        // Kill the newest sessions beyond limit
        const toKill = sessions.slice(limit);
        for (const s of toKill) {
          if (s.pid && s.pid !== 'sshd') {
            try {
              execSync(`kill -9 ${s.pid} 2>/dev/null || true`);
            } catch (e) {}
          }
        }
        db.addLog('AUTOKILL', `Auto-killed ${toKill.length} extra session(s) for ${u.username} (Limit: ${limit})`);
      }
    }
  }
}

module.exports = {
  getOnlineSessions,
  killSession,
  kickUser,
  runAutoKillEnforcer
};
