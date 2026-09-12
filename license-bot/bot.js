/**
 * Tunnel Forde LK - Dedicated Telegram License Manager Bot
 * Bot Username: @Tunnel_Forde_LK_License_bot
 * Owner ID: 1919247232 (@Black_Panther_V2ray)
 * 
 * Features:
 * - Persistent Keyboard Buttons (Clickable menu)
 * - Interactive Conversational Wizard (Just click button & send IP)
 * - Inline Quick Action Keyboards
 * - Native Telegram /menu command registration
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

// Configuration
const BOT_TOKEN = '8826422397:AAESLO_Uq59mOJZ0gWQ683pL6J7RYN-GY6M';
// STRICT WHITELIST: Only Owner Admin ID 1919247232 (@Black_Panther_V2ray)
const ADMIN_CHAT_ID = 1919247232;
const OWNER_USERNAME = '@Black_Panther_V2ray';
const MASTER_SECRET = 'TFL_SEC_LIC_KEY_2026_BLACK_PANTHER_V2RAY_8826422397';
const OWNER_MASTER_KEY = 'TFL-MASTER-LIFETIME-BLACK-PANTHER-1919247232';
const API_PORT = process.env.LIC_BOT_PORT || 54322;

const DB_FILE = path.join(__dirname, 'licenses.json');
const MASTER_STATUS_FILE = path.join(__dirname, 'master_status.json');

// In-memory / persistent database
let licenses = [];
// Conversational state per user: { [chatId]: { action: 'awaiting_genkey_ip' | 'awaiting_unlimited_ip' | 'awaiting_renew_ip' | 'awaiting_check_ip' | 'awaiting_block_ip' } }
const userStates = {};

// Global License Master Status (Free vs Paid)
let masterStatus = {
  mode: 'free', // 'free' = Public Community Free Edition, 'paid' = Paid License Key Enforced
  updatedAt: new Date().toISOString()
};

function loadMasterStatus() {
  try {
    if (fs.existsSync(MASTER_STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(MASTER_STATUS_FILE, 'utf8'));
      if (data && (data.mode === 'free' || data.mode === 'paid')) {
        masterStatus = data;
      }
    } else {
      saveMasterStatus();
    }
  } catch (e) {
    console.error('[MASTER STATUS] Error loading:', e.message);
  }
}

function saveMasterStatus() {
  try {
    fs.writeFileSync(MASTER_STATUS_FILE, JSON.stringify(masterStatus, null, 2), 'utf8');
  } catch (e) {
    console.error('[MASTER STATUS] Error saving:', e.message);
  }
}

loadMasterStatus();

function isAuthorized(chatId, userId) {
  return Number(chatId) === ADMIN_CHAT_ID || Number(userId) === ADMIN_CHAT_ID;
}

function loadLicenses() {
  try {
    if (fs.existsSync(DB_FILE)) {
      licenses = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (!Array.isArray(licenses)) licenses = [];
    } else {
      licenses = [];
      saveLicenses();
    }
  } catch (err) {
    console.error('[BOT DB] Error reading licenses:', err.message);
    licenses = [];
  }
}

function saveLicenses() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(licenses, null, 2), 'utf8');
  } catch (err) {
    console.error('[BOT DB] Error saving licenses:', err.message);
  }
}

loadLicenses();

// Cryptographic Key Generator
function createLicenseKey(ip, days = 30, type = 'monthly') {
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

  return {
    key: `TFL-${payloadB64}-${sig}`,
    expTime,
    isUnlimited
  };
}

// Telegram API Helper
async function tgCall(method, body = {}) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (err) {
    console.error(`[TG API ERROR] ${method}:`, err.message);
    return null;
  }
}

async function sendMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tgCall('sendMessage', payload);
}

// Persistent Bottom Keyboard Menu
const mainKeyboard = {
  keyboard: [
    [{ text: '🔑 Generate Key (30D)' }, { text: '♾️ Lifetime Key' }],
    [{ text: '🔄 Renew Client (+30D)' }, { text: '👑 My Master Key' }],
    [{ text: '🌐 Free / Paid Mode' }, { text: '📋 All Clients List' }],
    [{ text: '🔍 Check IP' }, { text: '📊 Bot Statistics' }],
    [{ text: '❌ Cancel Action' }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

// Inline Keyboards
const inlineMenu = {
  inline_keyboard: [
    [
      { text: '🔑 New Key (30D)', callback_data: 'btn_genkey' },
      { text: '♾️ Lifetime Key', callback_data: 'btn_unlimited' }
    ],
    [
      { text: '🔄 Renew (+30D)', callback_data: 'btn_renew' },
      { text: '👑 Master Key', callback_data: 'btn_masterkey' }
    ],
    [
      { text: '🌐 Free / Paid Mode', callback_data: 'btn_mode' },
      { text: '📊 Statistics', callback_data: 'btn_stats' }
    ],
    [
      { text: '📋 All Clients', callback_data: 'btn_list' }
    ]
  ]
};

// Handle Incoming Messages
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const fromUser = msg.from.username ? `@${msg.from.username}` : `User ${msg.from.id}`;

  // Security Check: Allow authorized ADMIN_CHAT_IDS
  if (!isAuthorized(chatId, msg.from.id)) {
    console.warn(`[UNAUTHORIZED] Attempt from ID ${msg.from.id} (${fromUser}): ${text}`);
    await sendMessage(chatId, `⛔ <b>Access Denied</b>\n\nThis bot is private property of <b>${OWNER_USERNAME}</b>. You are not authorized.`);
    return;
  }

  // Handle Cancel Action
  if (text === '❌ Cancel Action' || text === '/cancel') {
    delete userStates[chatId];
    await sendMessage(chatId, '❌ Action cancelled. Returned to main menu.', mainKeyboard);
    return;
  }

  // Check if user is in an interactive state (waiting for IP input)
  const state = userStates[chatId];

  if (state) {
    // 1. Awaiting IP for 30-Day Key
    if (state.action === 'awaiting_genkey_ip') {
      const ip = text.replace(/[^0-9\.]/g, '').trim();
      if (!ip || !ip.includes('.')) {
        await sendMessage(chatId, `⚠️ <b>Invalid IP address format.</b>\nPlease enter a valid IP address (e.g. <code>159.65.12.34</code>) or tap ❌ Cancel Action:`, mainKeyboard);
        return;
      }

      delete userStates[chatId];
      return executeGenKey(chatId, ip, 30);
    }

    // 2. Awaiting IP for Lifetime Key
    if (state.action === 'awaiting_unlimited_ip') {
      const ip = text.replace(/[^0-9\.]/g, '').trim();
      if (!ip || !ip.includes('.')) {
        await sendMessage(chatId, `⚠️ <b>Invalid IP address format.</b>\nPlease enter a valid IP address (e.g. <code>159.65.12.34</code>) or tap ❌ Cancel Action:`, mainKeyboard);
        return;
      }

      delete userStates[chatId];
      return executeUnlimitedKey(chatId, ip);
    }

    // 3. Awaiting IP for Renew
    if (state.action === 'awaiting_renew_ip') {
      const ip = text.replace(/[^0-9\.]/g, '').trim();
      if (!ip || !ip.includes('.')) {
        await sendMessage(chatId, `⚠️ <b>Invalid IP address format.</b>\nPlease enter a valid IP address (e.g. <code>159.65.12.34</code>) or tap ❌ Cancel Action:`, mainKeyboard);
        return;
      }

      delete userStates[chatId];
      return executeRenew(chatId, ip, 30);
    }

    // 4. Awaiting IP for Check
    if (state.action === 'awaiting_check_ip') {
      const ip = text.replace(/[^0-9\.]/g, '').trim();
      delete userStates[chatId];
      return executeCheck(chatId, ip);
    }
  }

  // Handle Command / Button Presses
  const lowerText = text.toLowerCase();

  // /start or /help
  if (lowerText === '/start' || lowerText === '/help' || lowerText === 'menu') {
    const isFree = masterStatus.mode === 'free';
    const welcome = `⚡ <b>Tunnel Forde LK - License Control Center</b> ⚡\n\n` +
      `Welcome Administrator (ID: <code>${chatId}</code>)!\n` +
      `Official Developer: <b>${OWNER_USERNAME}</b>\n\n` +
      `🌐 <b>Current Global Mode:</b> ${isFree ? '🟢 <b>FREE COMMUNITY</b> (Public)' : '🔒 <b>PAID / ENFORCED</b>'}\n\n` +
      `Select an action below or use the Mode Switcher:`;

    await sendMessage(chatId, welcome, mainKeyboard);
    await sendMessage(chatId, `👇 <b>Quick Control Menu:</b>`, inlineMenu);
    await executeModeMenu(chatId);
    return;
  }

  // 🔑 Generate Key (30D)
  if (lowerText === '🔑 generate key (30d)' || lowerText.startsWith('/genkey')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 2 && parts[1]) {
      const ip = parts[1];
      const days = parseInt(parts[2] || '30', 10);
      return executeGenKey(chatId, ip, days);
    }

    userStates[chatId] = { action: 'awaiting_genkey_ip' };
    await sendMessage(chatId, `🔑 <b>Generate 30-Day License Key</b>\n\n🌐 Please send the client's <b>VPS IP Address</b>:\n<i>(Example: <code>159.65.12.34</code>)</i>\n\n<i>Or tap ❌ Cancel Action below.</i>`, mainKeyboard);
    return;
  }

  // ♾️ Lifetime Key
  if (lowerText === '♾️ lifetime key' || lowerText.startsWith('/unlimited')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 2 && parts[1]) {
      return executeUnlimitedKey(chatId, parts[1]);
    }

    userStates[chatId] = { action: 'awaiting_unlimited_ip' };
    await sendMessage(chatId, `♾️ <b>Generate Lifetime Unlimited Key</b>\n\n🌐 Please send the <b>VPS IP Address</b> for Lifetime activation:\n<i>(Example: <code>159.65.12.34</code>)</i>\n\n<i>Or tap ❌ Cancel Action below.</i>`, mainKeyboard);
    return;
  }

  // 🔄 Renew Client (+30D)
  if (lowerText === '🔄 renew client (+30d)' || lowerText.startsWith('/renew')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 2 && parts[1]) {
      const ip = parts[1];
      const days = parseInt(parts[2] || '30', 10);
      return executeRenew(chatId, ip, days);
    }

    userStates[chatId] = { action: 'awaiting_renew_ip' };
    await sendMessage(chatId, `🔄 <b>Renew / Extend Client License (+30 Days)</b>\n\n🌐 Please send the client's <b>VPS IP Address</b> to extend:\n<i>(Example: <code>159.65.12.34</code>)</i>\n\n<i>Or tap ❌ Cancel Action below.</i>`, mainKeyboard);
    return;
  }

  // 👑 My Master Key
  if (lowerText === '👑 my master key' || lowerText === '/masterkey') {
    return executeMasterKey(chatId);
  }

  // 🌐 Free / Paid Mode
  if (
    lowerText === '🌐 free / paid mode' || 
    lowerText.startsWith('/mode') || 
    lowerText.includes('mode') || 
    lowerText.includes('swich') || 
    lowerText.includes('switch') || 
    lowerText === 'free' || 
    lowerText === 'paid'
  ) {
    const parts = text.split(/\s+/);
    if (parts.length >= 2 && ['free', 'paid'].includes(parts[1].toLowerCase())) {
      await executeSetMode(chatId, parts[1].toLowerCase());
      await executeModeMenu(chatId);
      return;
    }
    return executeModeMenu(chatId);
  }

  // 📋 All Clients List
  if (lowerText === '📋 all clients list' || lowerText === '/list') {
    return executeList(chatId);
  }

  // 📊 Bot Statistics
  if (lowerText === '📊 bot statistics' || lowerText === '/stats') {
    return executeStats(chatId);
  }

  // 🔍 Check IP
  if (lowerText === '🔍 check ip' || lowerText.startsWith('/check')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 2 && parts[1]) {
      return executeCheck(chatId, parts[1]);
    }

    userStates[chatId] = { action: 'awaiting_check_ip' };
    await sendMessage(chatId, `🔍 <b>Check Client Status</b>\n\nPlease send the <b>VPS IP Address</b> you wish to look up:`, mainKeyboard);
    return;
  }

  // /block <ip>
  if (lowerText.startsWith('/block')) {
    const parts = text.split(/\s+/);
    if (parts.length >= 2 && parts[1]) {
      return executeBlock(chatId, parts[1]);
    }
    await sendMessage(chatId, `⚠️ <b>Usage:</b> <code>/block &lt;ip&gt;</code>`, mainKeyboard);
    return;
  }

  // Unknown Message
  await sendMessage(chatId, `❓ Unknown option. Please tap a button below or type <code>/start</code>:`, mainKeyboard);
}

// Handle Inline Keyboard Callback Queries (Button Clicks)
async function handleCallbackQuery(cq) {
  const chatId = cq.message.chat.id;
  const data = cq.data;

  // Acknowledge callback query
  await tgCall('answerCallbackQuery', { callback_query_id: cq.id });

  if (!isAuthorized(chatId, cq.from.id)) return;

  if (data === 'btn_genkey') {
    userStates[chatId] = { action: 'awaiting_genkey_ip' };
    await sendMessage(chatId, `🔑 <b>Generate 30-Day License Key</b>\n\n🌐 Please send the client's <b>VPS IP Address</b>:\n<i>(Example: <code>159.65.12.34</code>)</i>`, mainKeyboard);
  } else if (data === 'btn_unlimited') {
    userStates[chatId] = { action: 'awaiting_unlimited_ip' };
    await sendMessage(chatId, `♾️ <b>Generate Lifetime Unlimited Key</b>\n\n🌐 Please send the <b>VPS IP Address</b> for Lifetime activation:`, mainKeyboard);
  } else if (data === 'btn_renew') {
    userStates[chatId] = { action: 'awaiting_renew_ip' };
    await sendMessage(chatId, `🔄 <b>Renew / Extend Client License</b>\n\n🌐 Please send the client's <b>VPS IP Address</b> to extend (+30 Days):`, mainKeyboard);
  } else if (data === 'btn_masterkey') {
    await executeMasterKey(chatId);
  } else if (data === 'btn_mode') {
    await executeModeMenu(chatId);
  } else if (data === 'set_mode_paid') {
    await executeSetMode(chatId, 'paid');
    await executeModeMenu(chatId);
  } else if (data === 'set_mode_free') {
    await executeSetMode(chatId, 'free');
    await executeModeMenu(chatId);
  } else if (data === 'btn_list') {
    await executeList(chatId);
  } else if (data === 'btn_stats') {
    await executeStats(chatId);
  }
}

// --------------------------------------------------------------------------
// Core Actions Implementation
// --------------------------------------------------------------------------

async function executeGenKey(chatId, ip, days = 30) {
  const { key, expTime, isUnlimited } = createLicenseKey(ip, days, 'monthly');
  const expDateStr = isUnlimited ? 'Never (Lifetime)' : new Date(expTime).toLocaleDateString();

  const existingIndex = licenses.findIndex(l => l.ip.toLowerCase() === ip.toLowerCase());
  const record = {
    ip: ip.trim(),
    key,
    days: isUnlimited ? 'unlimited' : days,
    expTime,
    type: isUnlimited ? 'lifetime' : 'monthly',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) licenses[existingIndex] = record;
  else licenses.push(record);
  saveLicenses();

  const reply = `✅ <b>License Key Generated Successfully!</b>\n\n` +
    `🌐 <b>Target VPS IP:</b> <code>${ip}</code>\n` +
    `⏳ <b>Validity:</b> ${days} Days (Expires: <b>${expDateStr}</b>)\n` +
    `🏷️ <b>License Type:</b> Monthly Client Edition\n\n` +
    `🔑 <b>Activation Key:</b>\n` +
    `<code>${key}</code>\n\n` +
    `<i>Tap the key above to copy and send it to your customer!</i>`;

  const copyKeyboard = {
    inline_keyboard: [
      [{ text: '📋 View All Clients', callback_data: 'btn_list' }, { text: '🔑 Generate Another', callback_data: 'btn_genkey' }]
    ]
  };

  await sendMessage(chatId, reply, copyKeyboard);
}

async function executeUnlimitedKey(chatId, ip) {
  const { key, expTime } = createLicenseKey(ip, 99999, 'lifetime');

  const existingIndex = licenses.findIndex(l => l.ip.toLowerCase() === ip.toLowerCase());
  const record = {
    ip: ip.trim(),
    key,
    days: 'unlimited',
    expTime,
    type: 'lifetime',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) licenses[existingIndex] = record;
  else licenses.push(record);
  saveLicenses();

  const reply = `♾️ <b>Lifetime Unlimited License Created!</b>\n\n` +
    `🌐 <b>Target VPS IP:</b> <code>${ip}</code>\n` +
    `⏳ <b>Validity:</b> <b>Lifetime (Never Expires)</b>\n` +
    `🏷️ <b>Type:</b> Unlimited Lifetime Access\n\n` +
    `🔑 <b>Activation Key:</b>\n` +
    `<code>${key}</code>\n\n` +
    `<i>Tap above to copy and activate on your server!</i>`;

  await sendMessage(chatId, reply, mainKeyboard);
}

async function executeRenew(chatId, ip, addDays = 30) {
  const existing = licenses.find(l => l.ip.toLowerCase() === ip.toLowerCase());
  const baseTime = (existing && existing.expTime && existing.expTime > Date.now()) ? existing.expTime : Date.now();
  const newExpTime = baseTime + (addDays * 86400000);
  const newDaysTotal = Math.ceil((newExpTime - Date.now()) / 86400000);

  const { key } = createLicenseKey(ip, newDaysTotal, 'monthly');

  const record = {
    ip: ip.trim(),
    key,
    days: newDaysTotal,
    expTime: newExpTime,
    type: 'monthly',
    status: 'active',
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const idx = licenses.findIndex(l => l.ip.toLowerCase() === ip.toLowerCase());
  if (idx >= 0) licenses[idx] = record;
  else licenses.push(record);
  saveLicenses();

  const reply = `🔄 <b>License Renewed Successfully!</b>\n\n` +
    `🌐 <b>VPS IP:</b> <code>${ip}</code>\n` +
    `➕ <b>Added:</b> +${addDays} Days\n` +
    `⏳ <b>New Expiration:</b> <b>${new Date(newExpTime).toLocaleDateString()}</b> (${newDaysTotal} days total)\n\n` +
    `🔑 <b>New Activation Key:</b>\n` +
    `<code>${key}</code>\n\n` +
    `<i>Send this renewed key to the customer!</i>`;

  await sendMessage(chatId, reply, mainKeyboard);
}

async function executeMasterKey(chatId) {
  const resp = `👑 <b>Universal Owner Master Key</b>\n\n` +
    `This master key has <b>Lifetime Unlimited Access</b> and works on <b>ANY VPS IP address</b> without ever expiring.\n\n` +
    `<code>${OWNER_MASTER_KEY}</code>\n\n` +
    `<i>Tap above to copy. You can paste this on any of your personal servers!</i>`;
  await sendMessage(chatId, resp, mainKeyboard);
}

async function executeList(chatId) {
  if (licenses.length === 0) {
    await sendMessage(chatId, `📋 <b>No licenses issued yet.</b>\nTap <b>🔑 Generate Key (30D)</b> to create your first client key!`, mainKeyboard);
    return;
  }

  const now = Date.now();
  let textOut = `📋 <b>Issued Licenses (${licenses.length} Total):</b>\n\n`;

  licenses.forEach((item, index) => {
    const isLife = item.type === 'lifetime' || item.days === 'unlimited';
    const daysLeft = isLife ? '♾️ Unlimited' : Math.max(0, Math.ceil((item.expTime - now) / 86400000)) + ' days left';
    const statusIcon = item.status === 'blocked' ? '🚫' : (isLife || item.expTime > now ? '🟢' : '🔴');
    textOut += `<b>${index + 1}.</b> ${statusIcon} <code>${item.ip}</code>\n` +
      `   ⏳ ${daysLeft} | ${item.type.toUpperCase()}\n\n`;
  });

  await sendMessage(chatId, textOut, mainKeyboard);
}

async function executeCheck(chatId, ip) {
  const item = licenses.find(l => l.ip.toLowerCase() === ip.toLowerCase());
  if (!item) {
    await sendMessage(chatId, `❌ No license record found for IP <code>${ip}</code>`, mainKeyboard);
    return;
  }

  const now = Date.now();
  const isLife = item.type === 'lifetime';
  const isExpired = !isLife && item.expTime < now;
  const daysLeft = isLife ? 'Lifetime' : `${Math.max(0, Math.ceil((item.expTime - now) / 86400000))} days`;

  const out = `🔍 <b>License Record:</b>\n\n` +
    `🌐 <b>IP:</b> <code>${item.ip}</code>\n` +
    `🏷️ <b>Status:</b> ${item.status === 'blocked' ? '🚫 Blocked' : (isExpired ? '🔴 Expired' : '🟢 Active')}\n` +
    `⏳ <b>Remaining:</b> ${daysLeft}\n` +
    `📅 <b>Expires:</b> ${isLife ? 'Never' : new Date(item.expTime).toLocaleDateString()}\n` +
    `🔑 <b>Key:</b>\n<code>${item.key}</code>`;

  await sendMessage(chatId, out, mainKeyboard);
}

async function executeBlock(chatId, ip) {
  const item = licenses.find(l => l.ip.toLowerCase() === ip.toLowerCase());
  if (!item) {
    await sendMessage(chatId, `❌ No license record found for IP <code>${ip}</code>`, mainKeyboard);
    return;
  }

  item.status = 'blocked';
  item.updatedAt = new Date().toISOString();
  saveLicenses();

  await sendMessage(chatId, `🚫 <b>License for IP <code>${ip}</code> has been BLOCKED!</b>`, mainKeyboard);
}

async function executeStats(chatId) {
  const now = Date.now();
  const total = licenses.length;
  const active = licenses.filter(l => l.status !== 'blocked' && (l.type === 'lifetime' || l.expTime > now)).length;
  const expired = licenses.filter(l => l.type !== 'lifetime' && l.expTime <= now).length;
  const blocked = licenses.filter(l => l.status === 'blocked').length;
  const isFree = masterStatus.mode === 'free';

  const statsMsg = `📊 <b>Tunnel Forde LK - System Statistics</b>\n\n` +
    `🌐 <b>Global Mode:</b> ${isFree ? '🟢 FREE COMMUNITY' : '🔒 PAID ENFORCED'}\n` +
    `👥 <b>Total Clients / IPs:</b> ${total}\n` +
    `🟢 <b>Active Licenses:</b> ${active}\n` +
    `🔴 <b>Expired Licenses:</b> ${expired}\n` +
    `🚫 <b>Blocked Licenses:</b> ${blocked}\n\n` +
    `👑 <b>Support Contact:</b> ${OWNER_USERNAME}`;

  await sendMessage(chatId, statsMsg, mainKeyboard);
}

// 🌐 Free vs Paid Mode Control
async function executeModeMenu(chatId) {
  const isFree = masterStatus.mode === 'free';
  const badge = isFree ? '🟢 FREE (Community Public Edition)' : '🔒 PAID (License Enforced)';
  const desc = isFree 
    ? `✅ <b>Status:</b> All client panels worldwide are currently <b>100% FREE</b>.\n• No license keys required.\n• Users can install and run unlimited accounts without restriction.\n• Ideal for gaining popular community adoption and trust!` 
    : `🚨 <b>Status:</b> All panels worldwide currently <b>REQUIRE A PAID LICENSE KEY</b>.\n• Panels without an active key are locked.\n• Users are directed to message <b>${OWNER_USERNAME}</b> to purchase access.`;

  const msg = `🌐 <b>Global License Mode Switcher</b>\n\n` +
    `Current Active Mode:\n👉 <b>${badge}</b>\n\n` +
    desc + `\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👇 <b>Tap a button below to switch mode anytime:</b>`;

  const modeKeyboard = {
    inline_keyboard: [
      [
        { text: isFree ? '✅ Free Active' : '🟢 Switch to FREE Mode', callback_data: 'set_mode_free' },
        { text: !isFree ? '✅ Paid Active' : '🔒 Switch to PAID Mode', callback_data: 'set_mode_paid' }
      ],
      [
        { text: '🔄 Refresh Status', callback_data: 'btn_mode' }
      ]
    ]
  };

  await sendMessage(chatId, msg, modeKeyboard);
}

async function executeSetMode(chatId, targetMode) {
  if (masterStatus.mode === targetMode) {
    await sendMessage(chatId, `ℹ️ Global Mode is already set to <b>${targetMode.toUpperCase()}</b>.`, mainKeyboard);
    return;
  }

  masterStatus.mode = targetMode;
  masterStatus.updatedAt = new Date().toISOString();
  saveMasterStatus();

  if (targetMode === 'paid') {
    const paidAlert = `🚨 <b>GLOBAL MODE SWITCHED TO PAID!</b> 🚨\n\n` +
      `🔒 <b>All Tunnel Forde LK panels worldwide will now enforce paid licenses!</b>\n\n` +
      `• Panels without a valid key will lock with your Telegram contact: <b>${OWNER_USERNAME}</b>\n` +
      `• When clients contact you to purchase access:\n` +
      `  1. Tap <b>🔑 Generate Key (30D)</b> or <b>♾️ Lifetime Key</b>\n` +
      `  2. Send their VPS IP\n` +
      `  3. Copy the generated key and send it to your customer!\n\n` +
      `👑 <i>Remember: Your personal server will always stay unlocked with your Universal Master Key!</i>`;
    await sendMessage(chatId, paidAlert, mainKeyboard);
  } else {
    const freeAlert = `🟢 <b>GLOBAL MODE SWITCHED TO FREE!</b> 🟢\n\n` +
      `🎉 <b>All client panels can now be used completely FREE with zero license restrictions!</b>\n\n` +
      `• New and existing users can run their panels freely.\n` +
      `• Great for growing your user base before monetizing!`;
    await sendMessage(chatId, freeAlert, mainKeyboard);
  }
}

// Built-in Lightweight HTTP Server for Remote Panels
function startApiServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (parsedUrl.pathname === '/api/mode') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        mode: masterStatus.mode,
        updatedAt: masterStatus.updatedAt
      }));
      return;
    }

    if (parsedUrl.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        bot: '@Tunnel_Forde_LK_License_bot',
        mode: masterStatus.mode,
        totalLicenses: licenses.length,
        updatedAt: masterStatus.updatedAt
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
  });

  server.listen(API_PORT, '0.0.0.0', () => {
    console.log(`[BOT HTTP API] Master Mode Server running on port ${API_PORT} (/api/mode)`);
  }).on('error', (err) => {
    console.warn(`[BOT HTTP API] Port ${API_PORT} note: ${err.message}`);
  });
}

// Long Polling Loop
let lastUpdateId = 0;

async function pollUpdates() {
  while (true) {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=25`;
      const res = await fetch(url);
      const data = await res.json();

      if (data && data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;
          console.log('[UPDATE RECEIVED]', update.update_id, update.message ? update.message.text : (update.callback_query ? update.callback_query.data : 'other'));
          if (update.message && update.message.text) {
            await handleMessage(update.message);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      console.error('[POLLING ERROR]', err.message);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

// Register Native Bot Commands with Telegram API
async function registerCommands() {
  await tgCall('setMyCommands', {
    commands: [
      { command: 'start', description: '🏠 Main Menu & Buttons' },
      { command: 'mode', description: '🌐 Switch Free / Paid Mode' },
      { command: 'genkey', description: '🔑 Generate Monthly Key' },
      { command: 'unlimited', description: '♾️ Lifetime Unlimited Key' },
      { command: 'masterkey', description: '👑 Universal Master Key' },
      { command: 'renew', description: '🔄 Extend / Renew Client' },
      { command: 'list', description: '📋 View All Clients' },
      { command: 'stats', description: '📊 Bot Statistics' },
      { command: 'cancel', description: '❌ Cancel Current Action' }
    ]
  });
}

// Startup Notification
async function startBot() {
  console.log(`[LICENSE BOT] Starting @Tunnel_Forde_LK_License_bot...`);
  await registerCommands();
  startApiServer();

  const startupMsg = `⚡ <b>Tunnel Forde LK - Interactive License Bot Online!</b> ⚡\n\n` +
    `👑 Developer / Support: <b>${OWNER_USERNAME}</b>\n` +
    `🌐 Current Global Mode: <b>${masterStatus.mode === 'free' ? '🟢 FREE COMMUNITY' : '🔒 PAID ENFORCED'}</b>\n\n` +
    `✨ <b>Interactive Buttons & Mode Switcher are ready!</b>\n` +
    `Use the buttons below to control licenses and switch between Free / Paid modes anytime:`;

  try {
    await sendMessage(ADMIN_CHAT_ID, startupMsg, mainKeyboard);
    await executeModeMenu(ADMIN_CHAT_ID);
    console.log(`[LICENSE BOT] Startup menu + Mode Switcher sent to Owner ID ${ADMIN_CHAT_ID}`);
  } catch (e) {
    console.warn(`[LICENSE BOT] Could not notify Admin ${ADMIN_CHAT_ID}: ${e.message}`);
  }

  pollUpdates();
}

startBot();
