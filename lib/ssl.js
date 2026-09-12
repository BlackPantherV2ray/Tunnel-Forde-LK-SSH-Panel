const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { execSync, exec } = require('child_process');
const db = require('./db');
const system = require('./system');

const CERTS_DIR = path.join(__dirname, '..', 'certs');
if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
}

const CERT_FILE = path.join(CERTS_DIR, 'fullchain.pem');
const KEY_FILE = path.join(CERTS_DIR, 'privkey.pem');

// Check DNS resolution of domain against VPS Public IP
async function checkDomainResolution(domain) {
  const cleanDomain = domain.trim().toLowerCase();
  const serverIp = system.getPublicIp();

  try {
    const addresses = await dns.resolve4(cleanDomain);
    const isPointing = addresses.includes(serverIp);
    return {
      domain: cleanDomain,
      resolvedIps: addresses,
      serverIp,
      isPointing,
      message: isPointing 
        ? `Domain points correctly to this VPS IP (${serverIp})` 
        : `Domain points to [${addresses.join(', ')}], but this VPS IP is ${serverIp}. Please update your DNS A Record first.`
    };
  } catch (err) {
    return {
      domain: cleanDomain,
      resolvedIps: [],
      serverIp,
      isPointing: false,
      message: `Failed to resolve domain DNS: ${err.message}`
    };
  }
}

// Get current certificate status and details
function getCertificateStatus() {
  const settings = db.getSettings();
  const currentDomain = settings.sslDomain || null;
  const isHttpsEnabled = !!settings.enableHttps;

  const hasCerts = fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE);
  if (!hasCerts) {
    return {
      hasCert: false,
      domain: currentDomain,
      isHttpsEnabled: false,
      issuer: null,
      validTo: null,
      daysRemaining: 0,
      certPath: null,
      keyPath: null
    };
  }

  // Parse certificate details using OpenSSL
  let issuer = 'Let\'s Encrypt / Custom';
  let validTo = null;
  let daysRemaining = 90;

  try {
    if (process.platform !== 'win32') {
      const datesOut = execSync(`openssl x509 -enddate -noout -in "${CERT_FILE}" 2>/dev/null || true`, { encoding: 'utf8' }).trim();
      const notAfter = datesOut.replace('notAfter=', '');
      if (notAfter) {
        const expDate = new Date(notAfter);
        validTo = expDate.toISOString().split('T')[0];
        const diffMs = expDate - new Date();
        daysRemaining = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }

      const issuerOut = execSync(`openssl x509 -issuer -noout -in "${CERT_FILE}" 2>/dev/null || true`, { encoding: 'utf8' }).trim();
      if (issuerOut.includes('Let\'s Encrypt')) issuer = 'Let\'s Encrypt (Trusted)';
      else if (issuerOut.includes('ZeroSSL')) issuer = 'ZeroSSL (Trusted)';
    } else {
      validTo = '2026-12-31';
      daysRemaining = 88;
    }
  } catch (e) {}

  return {
    hasCert: true,
    domain: currentDomain || 'Configured Domain',
    isHttpsEnabled,
    issuer,
    validTo,
    daysRemaining,
    certPath: CERT_FILE,
    keyPath: KEY_FILE
  };
}

// Issue / Request Let's Encrypt Certificate (3X-UI style)
async function issueCertificate(domain, email = '') {
  const cleanDomain = domain.trim().toLowerCase();
  const cleanEmail = email.trim() || `admin@${cleanDomain}`;

  // 1. Verify DNS A Record first
  if (process.platform !== 'win32') {
    const dnsCheck = await checkDomainResolution(cleanDomain);
    if (!dnsCheck.isPointing) {
      throw new Error(dnsCheck.message);
    }
  }

  // 2. Ensure certbot is installed on Linux
  if (process.platform !== 'win32') {
    try {
      execSync('command -v certbot >/dev/null 2>&1 || apt-get install -y certbot', { encoding: 'utf8' });
    } catch (e) {
      throw new Error('Failed to install certbot: ' + e.message);
    }

    // 3. Temporarily stop any process holding port 80 (e.g. Nginx or WS Proxy)
    let restartedServices = [];
    try {
      if (execSync("systemctl is-active nginx 2>/dev/null || true", { encoding: 'utf8' }).trim() === 'active') {
        execSync('systemctl stop nginx 2>/dev/null || true');
        restartedServices.push('nginx');
      }
      if (execSync("systemctl is-active ws-dropbear 2>/dev/null || true", { encoding: 'utf8' }).trim() === 'active') {
        execSync('systemctl stop ws-dropbear 2>/dev/null || true');
        restartedServices.push('ws-dropbear');
      }
    } catch (e) {}

    // 4. Run Certbot Standalone
    try {
      const certbotCmd = `certbot certonly --standalone --agree-tos --non-interactive -m "${cleanEmail}" -d "${cleanDomain}" --preferred-challenges http`;
      console.log(`[SSL] Running: ${certbotCmd}`);
      execSync(certbotCmd, { encoding: 'utf8', stdio: 'inherit' });
    } catch (err) {
      // Restore stopped services before throwing
      for (const s of restartedServices) {
        try { execSync(`systemctl start ${s} 2>/dev/null || true`); } catch (e) {}
      }
      throw new Error(`Certbot issuance failed: ${err.message}. Ensure port 80 is accessible.`);
    }

    // Restore stopped services
    for (const s of restartedServices) {
      try { execSync(`systemctl start ${s} 2>/dev/null || true`); } catch (e) {}
    }

    // 5. Copy certificates from /etc/letsencrypt/live/<domain>/ to panel certs folder
    const liveDir = `/etc/letsencrypt/live/${cleanDomain}`;
    if (!fs.existsSync(`${liveDir}/fullchain.pem`)) {
      throw new Error('Certificate was not generated in ' + liveDir);
    }

    fs.copyFileSync(`${liveDir}/fullchain.pem`, CERT_FILE);
    fs.copyFileSync(`${liveDir}/privkey.pem`, KEY_FILE);

    // 6. Setup Auto-renewal cron job
    try {
      const cronLine = `0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/${cleanDomain}/*.pem ${CERTS_DIR}/ && systemctl restart tunnel-forde-lk`;
      execSync(`(crontab -l 2>/dev/null | grep -v 'certbot renew'; echo "${cronLine}") | crontab -`);
    } catch (e) {}
  } else {
    // Mock for local testing on Windows
    fs.writeFileSync(CERT_FILE, '-----BEGIN CERTIFICATE-----\nMOCK CERTIFICATE\n-----END CERTIFICATE-----');
    fs.writeFileSync(KEY_FILE, '-----BEGIN PRIVATE KEY-----\nMOCK PRIVATE KEY\n-----END PRIVATE KEY-----');
  }

  // 7. Save domain in settings
  db.updateSettings({
    sslDomain: cleanDomain,
    sslEmail: cleanEmail
  });

  db.addLog('SSL_ISSUED', `Issued Let's Encrypt SSL certificate for domain: ${cleanDomain}`);

  // 8. Automatically apply to Stunnel and Xray if available
  applyCertToVpnServices(cleanDomain);

  return getCertificateStatus();
}

// Apply certificates to Stunnel (SSL 443), WebSocket TLS, and Xray
function applyCertToVpnServices(domain) {
  if (process.platform === 'win32') return;

  try {
    // Stunnel / Stunnel4 uses a combined .pem file (key + cert)
    const combinedPem = '/etc/stunnel/stunnel.pem';
    if (fs.existsSync('/etc/stunnel')) {
      const keyData = fs.readFileSync(KEY_FILE, 'utf8');
      const certData = fs.readFileSync(CERT_FILE, 'utf8');
      fs.writeFileSync(combinedPem, keyData + '\n' + certData, 'utf8');
      execSync('systemctl restart stunnel4 2>/dev/null || true');
    }

    // If Xray / V2Ray exists, update certificate paths in /etc/xray/config.json
    const xrayConfig = '/etc/xray/config.json';
    if (fs.existsSync(xrayConfig)) {
      try {
        const raw = fs.readFileSync(xrayConfig, 'utf8');
        const cfg = JSON.parse(raw);
        // Find inbounds with tlsSettings and point to our certificates
        if (Array.isArray(cfg.inbounds)) {
          for (const inb of cfg.inbounds) {
            if (inb.streamSettings && inb.streamSettings.security === 'tls') {
              inb.streamSettings.tlsSettings = inb.streamSettings.tlsSettings || {};
              inb.streamSettings.tlsSettings.certificates = [
                {
                  certificateFile: CERT_FILE,
                  keyFile: KEY_FILE
                }
              ];
            }
          }
          fs.writeFileSync(xrayConfig, JSON.stringify(cfg, null, 2), 'utf8');
          execSync('systemctl restart xray 2>/dev/null || true');
        }
      } catch (xe) {
        console.warn('[SSL] Xray cert patch warning:', xe.message);
      }
    }
  } catch (err) {
    console.error('[SSL] Apply to VPN services warning:', err.message);
  }
}

// Toggle Web Panel HTTPS
function togglePanelHttps(enable) {
  const hasCerts = fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE);
  if (enable && !hasCerts) {
    throw new Error('No SSL certificate found! Please issue a certificate first.');
  }

  db.updateSettings({ enableHttps: !!enable });
  db.addLog('SSL_HTTPS_TOGGLE', `Web Panel HTTPS set to: ${enable ? 'ENABLED' : 'DISABLED'}`);
  return db.getSettings();
}

module.exports = {
  CERT_FILE,
  KEY_FILE,
  checkDomainResolution,
  getCertificateStatus,
  issueCertificate,
  applyCertToVpnServices,
  togglePanelHttps
};
