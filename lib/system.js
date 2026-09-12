const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');

let cachedPublicIp = null;
let lastNetSample = { time: Date.now(), rx: 0, tx: 0 };
let currentNetSpeed = { rxSpeed: 0, txSpeed: 0 }; // bytes per sec

// Get Server Public IP
function getPublicIp() {
  if (cachedPublicIp) return cachedPublicIp;
  try {
    const ip = execSync('curl -s4 --max-time 3 https://api.ipify.org || curl -s4 --max-time 3 https://ifconfig.me/ip', { encoding: 'utf8' }).trim();
    if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      cachedPublicIp = ip;
      return ip;
    }
  } catch (e) {
    // fallback to local network interface IP
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          cachedPublicIp = net.address;
          return net.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

// Calculate real CPU usage percentage
let lastCpuMeasure = null;
function getCpuUsage() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }

  if (!lastCpuMeasure) {
    lastCpuMeasure = { idle, total };
    return 5.0; // initial estimate
  }

  const idleDelta = idle - lastCpuMeasure.idle;
  const totalDelta = total - lastCpuMeasure.total;
  lastCpuMeasure = { idle, total };

  if (totalDelta === 0) return 0;
  const usage = 100 - Math.round((100 * idleDelta) / totalDelta);
  return Math.max(0, Math.min(100, usage));
}

// Memory details
function getMemoryUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usagePercent = Math.round((usedMem / totalMem) * 100);

  return {
    total: Math.round(totalMem / (1024 * 1024)), // MB
    used: Math.round(usedMem / (1024 * 1024)),   // MB
    free: Math.round(freeMem / (1024 * 1024)),   // MB
    percent: usagePercent
  };
}

// Disk Usage for Root mount /
function getDiskUsage() {
  try {
    if (process.platform === 'win32') {
      return { total: 100, used: 25, free: 75, percent: 25 };
    }
    const output = execSync("df -B1M / | tail -n 1", { encoding: 'utf8' });
    const parts = output.trim().split(/\s+/);
    if (parts.length >= 5) {
      const total = parseInt(parts[1], 10);
      const used = parseInt(parts[2], 10);
      const free = parseInt(parts[3], 10);
      const percent = parseInt(parts[4].replace('%', ''), 10);
      return { total, used, free, percent };
    }
  } catch (e) {
    // fallback
  }
  return { total: 50000, used: 12000, free: 38000, percent: 24 };
}

// Network Total & Current Speed
function getNetworkStats() {
  let totalRx = 0;
  let totalTx = 0;

  try {
    if (fs.existsSync('/proc/net/dev')) {
      const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n');
      for (const line of lines) {
        if (line.includes(':') && !line.includes('lo:')) {
          const parts = line.trim().split(/:|\s+/).filter(Boolean);
          if (parts.length >= 10) {
            totalRx += parseInt(parts[1], 10) || 0;
            totalTx += parseInt(parts[9], 10) || 0;
          }
        }
      }
    }
  } catch (e) {}

  const now = Date.now();
  const timeDelta = (now - lastNetSample.time) / 1000;
  if (timeDelta >= 1 && lastNetSample.rx > 0) {
    currentNetSpeed = {
      rxSpeed: Math.max(0, Math.round((totalRx - lastNetSample.rx) / timeDelta)),
      txSpeed: Math.max(0, Math.round((totalTx - lastNetSample.tx) / timeDelta))
    };
    lastNetSample = { time: now, rx: totalRx, tx: totalTx };
  } else if (lastNetSample.rx === 0) {
    lastNetSample = { time: now, rx: totalRx, tx: totalTx };
  }

  return {
    totalRxMB: (totalRx / (1024 * 1024)).toFixed(2),
    totalTxMB: (totalTx / (1024 * 1024)).toFixed(2),
    rxSpeedKB: (currentNetSpeed.rxSpeed / 1024).toFixed(1),
    txSpeedKB: (currentNetSpeed.txSpeed / 1024).toFixed(1)
  };
}

// OS information
function getOsInfo() {
  let osName = os.type() + ' ' + os.release();
  try {
    if (fs.existsSync('/etc/os-release')) {
      const release = fs.readFileSync('/etc/os-release', 'utf8');
      const match = release.match(/PRETTY_NAME="([^"]+)"/);
      if (match) osName = match[1];
    }
  } catch (e) {}

  return {
    osName,
    hostname: os.hostname(),
    platform: process.platform,
    arch: os.arch(),
    uptimeSeconds: os.uptime(),
    publicIp: getPublicIp()
  };
}

module.exports = {
  getPublicIp,
  getCpuUsage,
  getMemoryUsage,
  getDiskUsage,
  getNetworkStats,
  getOsInfo,
  getFullSystemStatus: () => {
    return {
      cpu: getCpuUsage(),
      memory: getMemoryUsage(),
      disk: getDiskUsage(),
      network: getNetworkStats(),
      os: getOsInfo(),
      timestamp: Date.now()
    };
  }
};
