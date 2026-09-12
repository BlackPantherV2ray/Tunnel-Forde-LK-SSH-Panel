const { execSync } = require('child_process');

const MANAGED_SERVICES = [
  { name: 'OpenSSH Server', unit: 'ssh', port: '22', desc: 'Secure Shell Daemon' },
  { name: 'Dropbear SSH', unit: 'dropbear', port: '109, 143', desc: 'Lightweight SSH Daemon' },
  { name: 'Stunnel (SSL/TLS)', unit: 'stunnel4', port: '443, 777', desc: 'SSL/TLS Tunnel Wrapper' },
  { name: 'SSH WebSocket Proxy', unit: 'ws-dropbear', port: '80, 8880, 8080', desc: 'HTTP WebSocket Proxy' },
  { name: 'BadVPN UDPGW (7300)', unit: 'badvpn-udpgw', port: '7100-7300', desc: 'UDP Forwarder for Voice/Games' },
  { name: 'Nginx Web Server', unit: 'nginx', port: '80, 443', desc: 'Reverse Proxy & Static Server' },
  { name: 'Xray Core', unit: 'xray', port: 'V2Ray/VMess', desc: 'Multi-protocol Tunnel Engine' },
  { name: 'Tunnel Forde LK Panel', unit: 'tunnel-forde-lk', port: '54321', desc: 'Web Management Dashboard' }
];

function checkServiceStatus(unit) {
  if (process.platform === 'win32') {
    return 'active';
  }
  try {
    const unitCheck = execSync(`systemctl list-unit-files ${unit}.service 2>/dev/null || true`, { encoding: 'utf8' });
    if (!unitCheck.includes(`${unit}.service`)) {
      return 'not-installed';
    }
    const out = execSync(`systemctl is-active ${unit} 2>/dev/null || true`, { encoding: 'utf8' }).trim();
    if (out === 'active') return 'active';
    return 'inactive';
  } catch (e) {
    return 'not-installed';
  }
}

function getServicesStatus() {
  return MANAGED_SERVICES.map(svc => {
    return {
      ...svc,
      status: checkServiceStatus(svc.unit)
    };
  });
}

function restartService(unit) {
  if (process.platform === 'win32') return true;
  try {
    execSync(`systemctl restart ${unit} 2>&1`, { encoding: 'utf8' });
    return true;
  } catch (err) {
    throw new Error(`Failed to restart ${unit}: ${err.message}`);
  }
}

function restartAllServices() {
  const results = {};
  for (const svc of MANAGED_SERVICES) {
    if (svc.unit === 'tunnel-forde-lk') continue; // don't restart self in middle of response
    try {
      if (checkServiceStatus(svc.unit) !== 'not-installed') {
        restartService(svc.unit);
        results[svc.name] = 'restarted';
      }
    } catch (e) {
      results[svc.name] = 'error: ' + e.message;
    }
  }
  return results;
}

module.exports = {
  getServicesStatus,
  restartService,
  restartAllServices
};
