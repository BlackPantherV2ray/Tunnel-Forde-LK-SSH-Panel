/**
 * Tunnel Forde LK - Cryptographic License Engine
 * Generates and verifies HMAC-SHA256 signed license keys offline with zero downtime.
 * Supports: Community Free Mode, Monthly 30-Day Client Keys, and Lifetime Unlimited Keys for Owner.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const system = require('./system');

// Master Status file (written by Telegram Bot or local config)
const BOT_STATUS_FILE = path.join(__dirname, '..', 'license-bot', 'master_status.json');

// Master Secret Salt (Shared between License Bot and Panel)
const MASTER_SECRET = 'TFL_SEC_LIC_KEY_2026_BLACK_PANTHER_V2RAY_8826422397';

// Owner Master Key (Hardcoded bypass key that works on ANY VPS forever)
const OWNER_MASTER_KEY = 'TFL-MASTER-LIFETIME-BLACK-PANTHER-1919247232';

let cachedRemoteMode = null;
let lastSyncTime = 0;

/**
 * Sync global mode from GitHub Raw or local master_status.json
 */
async function syncRemoteMasterMode() {
  // If local file exists, use it
  if (fs.existsSync(BOT_STATUS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(BOT_STATUS_FILE, 'utf8'));
      if (data && (data.mode === 'free' || data.mode === 'paid')) {
        cachedRemoteMode = data.mode;
        return cachedRemoteMode;
      }
    } catch (e) {}
  }

  if (cachedRemoteMode && Date.now() - lastSyncTime < 10 * 60 * 1000) {
    return cachedRemoteMode;
  }

  const settings = db.getSettings();
  const remoteUrl = settings.licenseMasterUrl || 'https://raw.githubusercontent.com/BlackPantherV2ray/tunnel-forde-lk/main/license-bot/master_status.json';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(remoteUrl, { signal: timer.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.mode === 'free' || data.mode === 'paid')) {
        cachedRemoteMode = data.mode;
        lastSyncTime = Date.now();
        return cachedRemoteMode;
      }
    }
  } catch (err) {}

  return settings.licenseMode || 'free';
}

// Background sync every 15 minutes
setInterval(() => {
  syncRemoteMasterMode().catch(() => {});
}, 15 * 60 * 1000);

/**
 * Get current global master license mode ('free' or 'paid')
 */
function getGlobalMasterMode() {
  if (cachedRemoteMode) return cachedRemoteMode;

  try {
    if (fs.existsSync(BOT_STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(BOT_STATUS_FILE, 'utf8'));
      if (data && (data.mode === 'free' || data.mode === 'paid')) {
        return data.mode;
      }
    }
  } catch (e) {}

  const settings = db.getSettings();
  return settings.licenseMode || 'free';
}

/**
 * Update global master license mode
 */
function setGlobalMasterMode(mode) {
  const cleanMode = mode === 'paid' ? 'paid' : 'free';
  try {
    const dir = path.dirname(BOT_STATUS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BOT_STATUS_FILE, JSON.stringify({ mode: cleanMode, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  } catch (e) {}

  db.updateSettings({ licenseMode: cleanMode });
  return cleanMode;
}

/**
 * Generate a Cryptographic License Key for an IP
 * @param {string} ip VPS Public IP or 'any'
 * @param {number} days Days valid (e.g. 30, or 99999 for lifetime)
 * @param {string} type 'monthly' | 'lifetime'
 * @returns {string} License Key
 */
function generateKey(ip, days = 30, type = 'monthly') {
  const cleanIp = (ip || 'any').trim().toLowerCase();
  const now = Date.now();
  const isUnlimited = type === 'lifetime' || days >= 9999;
  const expTime = isUnlimited ? 9999999999999 : now + (days * 86400000);

  const payloadObj = {
    ip: cleanIp,
    exp: expTime,
    type: isUnlimited ? 'lifetime' : 'monthly',
    iat: now
  };

  const payloadStr = JSON.stringify(payloadObj);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');

  const hmac = crypto.createHmac('sha256', MASTER_SECRET);
  hmac.update(payloadB64);
  const sig = hmac.digest('hex').substring(0, 16).toUpperCase();

  return `TFL-${payloadB64}-${sig}`;
}

/**
 * Verify a License Key against this Server's IP
 * @param {string} key 
 * @param {string} serverIp 
 * @returns {{ valid: boolean, error?: string, details?: any }}
 */
function verifyKey(key, serverIp) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'No license key provided' };
  }

  const cleanKey = key.trim();

  // 1. Master Owner Lifetime Key bypass
  if (cleanKey === OWNER_MASTER_KEY) {
    return {
      valid: true,
      type: 'Owner Lifetime Master',
      ip: 'ANY',
      isLifetime: true,
      daysRemaining: 99999,
      expiresAt: 'Never (Lifetime Owner Access)'
    };
  }

  // 2. Parse Standard TFL Key
  const parts = cleanKey.split('-');
  if (parts.length !== 3 || parts[0] !== 'TFL') {
    return { valid: false, error: 'Invalid key format' };
  }

  const payloadB64 = parts[1];
  const sig = parts[2].toUpperCase();

  // Verify HMAC Signature
  const expectedHmac = crypto.createHmac('sha256', MASTER_SECRET);
  expectedHmac.update(payloadB64);
  const expectedSig = expectedHmac.digest('hex').substring(0, 16).toUpperCase();

  if (sig !== expectedSig) {
    return { valid: false, error: 'Invalid key signature (Tampered or fake key)' };
  }

  // Decode Payload
  let payload;
  try {
    const raw = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(raw);
  } catch (err) {
    return { valid: false, error: 'Malformed key data' };
  }

  // Check Expiry
  const now = Date.now();
  if (payload.exp && payload.exp < now) {
    const expiredDaysAgo = Math.floor((now - payload.exp) / 86400000);
    return {
      valid: false,
      error: `License expired ${expiredDaysAgo} day(s) ago. Please contact Admin on Telegram: @Black_Panther_V2ray`,
      expired: true
    };
  }

  // Check IP match (unless key is marked for 'any' IP)
  const currentIp = (serverIp || system.getPublicIp() || '').trim().toLowerCase();
  const keyIp = (payload.ip || '').trim().toLowerCase();

  if (keyIp !== 'any' && currentIp && keyIp !== currentIp && !['127.0.0.1', 'localhost'].includes(currentIp)) {
    return {
      valid: false,
      error: `License is locked to IP ${payload.ip}, but this VPS IP is ${currentIp}`
    };
  }

  const isLifetime = payload.type === 'lifetime' || payload.exp > 4000000000000;
  const daysRemaining = isLifetime ? 9999 : Math.max(0, Math.ceil((payload.exp - now) / 86400000));
  const expDateStr = isLifetime ? 'Lifetime (Never Expires)' : new Date(payload.exp).toLocaleDateString();

  return {
    valid: true,
    type: isLifetime ? 'Lifetime License' : 'Monthly License',
    ip: payload.ip,
    isLifetime,
    daysRemaining,
    expiresAt: expDateStr,
    issuedAt: new Date(payload.iat).toLocaleDateString()
  };
}

/**
 * Get the current active panel license status
 */
function getPanelLicenseStatus() {
  const settings = db.getSettings();
  const currentIp = system.getPublicIp();

  // Mode: 'free' (Community edition) or 'paid' (Enforce license)
  const mode = getGlobalMasterMode();
  const savedKey = settings.licenseKey || '';

  // If set to Free Community Edition
  if (mode === 'free') {
    return {
      valid: true,
      mode: 'free',
      isFreeCommunity: true,
      statusBadge: 'Community Free Edition',
      statusText: 'Active & Unlimited (Public Release)',
      daysRemaining: 'Unlimited',
      serverIp: currentIp,
      adminTelegram: 'Black_Panther_V2ray',
      supportUrl: 'https://t.me/Black_Panther_V2ray'
    };
  }

  // In Paid / Enforce mode: Check key
  const check = verifyKey(savedKey, currentIp);

  return {
    valid: check.valid,
    mode: 'paid',
    isFreeCommunity: false,
    statusBadge: check.valid ? 'Verified License' : 'License Inactive / Expired',
    statusText: check.valid ? `${check.type} - Active (${check.daysRemaining} days left)` : (check.error || 'Activation Required'),
    error: check.error,
    daysRemaining: check.daysRemaining || 0,
    expiresAt: check.expiresAt || '--',
    type: check.type || 'None',
    serverIp: currentIp,
    adminTelegram: 'Black_Panther_V2ray',
    supportUrl: 'https://t.me/Black_Panther_V2ray'
  };
}

/**
 * Activate a new license key in panel database
 */
function activateKey(key) {
  const currentIp = system.getPublicIp();
  const check = verifyKey(key, currentIp);

  if (!check.valid) {
    return { success: false, error: check.error || 'Invalid license key' };
  }

  db.updateSettings({
    licenseKey: key.trim(),
    licenseMode: 'paid'
  });

  db.addLog('LICENSE_ACTIVATE', `Activated license (${check.type}, ${check.daysRemaining} days remaining)`);
  return { success: true, message: `License activated successfully! (${check.type})`, check };
}

module.exports = {
  MASTER_SECRET,
  OWNER_MASTER_KEY,
  generateKey,
  verifyKey,
  getPanelLicenseStatus,
  activateKey,
  getGlobalMasterMode,
  setGlobalMasterMode
};
