const db = require('./db');
const system = require('./system');
const sessions = require('./sessions');
const services = require('./services');

let isPolling = false;
let lastUpdateId = 0;
let pollTimeout = null;

// Get current bot credentials
function getBotConfig() {
  const s = db.getSettings();
  return {
    token: s.telegramBotToken ? s.telegramBotToken.trim() : '',
    chatId: s.telegramChatId ? s.telegramChatId.trim() : '',
    dailyBackup: s.telegramDailyBackup !== false,
    loginAlert: s.telegramLoginAlert !== false,
    panelName: s.panelName || 'Tunnel Forde LK'
  };
}

// Send a text message to Telegram
async function sendTelegramMessage(text, customChatId = null, parseMode = 'HTML') {
  const cfg = getBotConfig();
  const token = cfg.token;
  const targetChatId = customChatId || cfg.chatId;

  if (!token || !targetChatId) {
    return { success: false, error: 'Telegram Bot Token or Chat ID not configured.' };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    });

    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || 'Telegram API error' };
    }
    return { success: true, data: data.result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Send Backup File (.json) to Telegram (Just like 3X-UI)
async function sendTelegramBackup(customChatId = null) {
  const cfg = getBotConfig();
  const token = cfg.token;
  const targetChatId = customChatId || cfg.chatId;

  if (!token || !targetChatId) {
    return { success: false, error: 'Telegram Bot Token or Chat ID is missing.' };
  }

  try {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-');
    const filename = `tfl_backup_${dateStr}.json`;

    // Prepare backup content
    const backupData = {
      settings: db.getSettings(),
      users: db.getAllUsers(),
      logs: db.getLogs(),
      exportedAt: now.toISOString(),
      panel: cfg.panelName
    };
    const jsonString = JSON.stringify(backupData, null, 2);

    // Format caption
    const allUsers = db.getAllUsers();
    const activeCount = allUsers.filter(u => u.status === 'active').length;
    const serverIp = system.getPublicIp();

    const caption = `⚡ <b>${cfg.panelName} - Database Backup</b> ⚡\n\n` +
      `🌐 <b>Server IP:</b> <code>${serverIp}</code>\n` +
      `👥 <b>Total Accounts:</b> ${allUsers.length} (${activeCount} Active)\n` +
      `📅 <b>Backup Date:</b> <code>${now.toLocaleString()}</code>\n\n` +
      `🔒 <i>Keep this backup file secure. You can restore your accounts and settings anytime.</i>`;

    const form = new FormData();
    form.append('chat_id', targetChatId);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('document', new Blob([jsonString], { type: 'application/json' }), filename);

    const url = `https://api.telegram.org/bot${token}/sendDocument`;
    const res = await fetch(url, {
      method: 'POST',
      body: form
    });

    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || 'Telegram failed to send document' };
    }

    db.addLog('TELEGRAM_BACKUP', `Backup document successfully sent to Telegram chat ID ${targetChatId}`);
    return { success: true, message: 'Backup file sent to Telegram!' };
  } catch (err) {
    console.error('[Telegram Backup Error]:', err.message);
    return { success: false, error: err.message };
  }
}

// Test Connection & Send Verification
async function testConnection(token, chatId) {
  if (!token || !chatId) {
    return { success: false, error: 'Token and Chat ID are required.' };
  }

  try {
    // 1. Verify Bot Token via getMe
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return { success: false, error: `Invalid Bot Token: ${meData.description}` };
    }

    const botName = meData.result.first_name || meData.result.username;
    const serverIp = system.getPublicIp();

    // 2. Send Test Message to Chat
    const msg = `⚡ <b>Tunnel Forde LK - Connection Test</b> ⚡\n\n` +
      `✅ <b>Bot:</b> @${meData.result.username} (${botName})\n` +
      `🌐 <b>Server IP:</b> <code>${serverIp}</code>\n` +
      `📡 <b>Status:</b> Connected & Ready\n\n` +
      `You will receive database backups and panel alerts here!`;

    const sendRes = await sendTelegramMessage(msg, chatId);
    if (!sendRes.success) {
      return { success: false, error: `Bot verified, but could not message Chat ID ${chatId}: ${sendRes.error}. (Did you click /start in the bot?)` };
    }

    return {
      success: true,
      botUsername: meData.result.username,
      botName
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --------------------------------------------------------------------------
// Interactive Telegram Bot Command Listener (Like 3X-UI Bot)
// --------------------------------------------------------------------------

async function pollBotCommands() {
  const cfg = getBotConfig();
  if (!cfg.token || !cfg.chatId) {
    pollTimeout = setTimeout(pollBotCommands, 10000);
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${cfg.token}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const data = await res.json();

    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const senderId = String(msg.chat.id);
        const text = msg.text.trim();

        // Security check: Only respond to authorized chat ID
        if (senderId !== cfg.chatId) {
          await sendTelegramMessage('🚫 <i>Unauthorized access. This bot is private to Tunnel Forde LK Admin.</i>', senderId);
          continue;
        }

        await handleBotCommand(text, senderId);
      }
    }
  } catch (e) {
    // Network / timeout glitch, silently retry
  }

  pollTimeout = setTimeout(pollBotCommands, 2000);
}

// Handle Bot Commands (/start, /backup, /status, /users, /online, /restart)
async function handleBotCommand(cmdText, chatId) {
  const cmd = cmdText.split(' ')[0].toLowerCase();
  const cfg = getBotConfig();
  const serverIp = system.getPublicIp();

  if (cmd === '/start' || cmd === '/help') {
    const helpMsg = `⚡ <b>${cfg.panelName} - Telegram Bot</b> ⚡\n\n` +
      `Manage your VPS tunnel server directly from Telegram:\n\n` +
      `💾 <b>/backup</b> - Download latest database backup (.json)\n` +
      `📊 <b>/status</b> - View CPU, RAM, Uptime & Network traffic\n` +
      `👥 <b>/users</b>  - View total & active SSH accounts\n` +
      `🟢 <b>/online</b> - View currently connected users\n` +
      `🔄 <b>/restart</b> - Restart all VPN & tunnel services\n\n` +
      `🌐 <b>Web Panel:</b> <code>http://${serverIp}:${db.getSettings().panelPort || 54321}</code>`;
    await sendTelegramMessage(helpMsg, chatId);
  } else if (cmd === '/backup') {
    await sendTelegramMessage('⏳ <i>Generating and uploading latest database backup...</i>', chatId);
    await sendTelegramBackup(chatId);
  } else if (cmd === '/status') {
    const sys = system.getFullSystemStatus();
    const allUsers = db.getAllUsers();
    const online = sessions.getOnlineSessions();

    const statusMsg = `📊 <b>${cfg.panelName} - System Status</b>\n\n` +
      `🌐 <b>Server IP:</b> <code>${serverIp}</code>\n` +
      `💻 <b>OS:</b> ${sys.os.osName}\n` +
      `⏱ <b>Uptime:</b> ${Math.floor(sys.os.uptimeSeconds / 3600)} hours\n` +
      `⚙️ <b>CPU Usage:</b> ${sys.cpu}%\n` +
      `🧠 <b>RAM Usage:</b> ${sys.memory.used} MB / ${sys.memory.total} MB (${sys.memory.percent}%)\n` +
      `💾 <b>Disk Usage:</b> ${sys.disk.used} MB / ${sys.disk.total} MB (${sys.disk.percent}%)\n` +
      `🚀 <b>Network:</b> ↓ ${sys.network.rxSpeedKB} KB/s | ↑ ${sys.network.txSpeedKB} KB/s\n\n` +
      `👥 <b>Accounts:</b> ${allUsers.length} total | 🟢 <b>Online Now:</b> ${online.length} session(s)`;
    await sendTelegramMessage(statusMsg, chatId);
  } else if (cmd === '/users') {
    const allUsers = db.getAllUsers();
    if (allUsers.length === 0) {
      await sendTelegramMessage('👥 No SSH accounts found on this VPS.', chatId);
      return;
    }

    let usersMsg = `👥 <b>${cfg.panelName} - Accounts List (${allUsers.length})</b>\n\n`;
    for (const u of allUsers.slice(0, 25)) {
      const statusIcon = u.status === 'active' ? '🟢' : (u.status === 'expired' ? '🔴' : '🔒');
      usersMsg += `${statusIcon} <b>${u.username}</b> | Exp: <code>${u.expiryDate}</code> | Limit: ${u.ipLimit || 1} Device\n`;
    }
    if (allUsers.length > 25) {
      usersMsg += `\n<i>...and ${allUsers.length - 25} more accounts (view on Web Panel).</i>`;
    }
    await sendTelegramMessage(usersMsg, chatId);
  } else if (cmd === '/online') {
    const online = sessions.getOnlineSessions();
    if (online.length === 0) {
      await sendTelegramMessage('🟢 <b>Online Users:</b> No active tunnel sessions currently.', chatId);
      return;
    }

    let onlineMsg = `🟢 <b>${cfg.panelName} - Live Connected Users (${online.length})</b>\n\n`;
    for (const s of online) {
      onlineMsg += `👤 <b>${s.user}</b> | IP: <code>${s.ip}</code> | ${s.protocol} | ${s.time}\n`;
    }
    await sendTelegramMessage(onlineMsg, chatId);
  } else if (cmd === '/restart') {
    await sendTelegramMessage('🔄 <i>Restarting all VPN & tunnel daemons...</i>', chatId);
    try {
      services.restartAllServices();
      await sendTelegramMessage('✅ <b>All VPN services restarted successfully!</b>', chatId);
    } catch (e) {
      await sendTelegramMessage(`❌ Error restarting services: ${e.message}`, chatId);
    }
  } else {
    await sendTelegramMessage("❓ Unknown command. Type <b>/start</b> to see the command menu.", chatId);
  }
}

// Start Telegram Background Worker
function initTelegramWorker() {
  if (isPolling) return;
  isPolling = true;
  console.log('[Telegram] Bot poller initialized.');
  pollBotCommands();

  // Daily Backup Schedule: Check every hour if it's midnight (00:00 - 01:00 UTC)
  setInterval(() => {
    const cfg = getBotConfig();
    if (cfg.token && cfg.chatId && cfg.dailyBackup) {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() < 10) {
        console.log('[Telegram] Running scheduled daily backup to Telegram...');
        sendTelegramBackup().catch(err => console.error('[Daily Backup Error]:', err.message));
      }
    }
  }, 60 * 60 * 1000); // check hourly
}

module.exports = {
  getBotConfig,
  sendTelegramMessage,
  sendTelegramBackup,
  testConnection,
  initTelegramWorker
};
