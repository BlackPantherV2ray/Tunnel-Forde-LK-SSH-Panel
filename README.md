# ⚡ Tunnel Forde LK - SSH & Multi-Protocol Web Panel

A sleek, lightweight, high-performance **Web Management Dashboard** (inspired by X-UI / 3X-UI) designed specifically for Linux VPS servers running SSH, Dropbear, Stunnel, WebSocket, and BadVPN UDPGW autoscripts (such as *Simple-Dimple*).

Manage SSH accounts, generate FastSSH connection configs, monitor real-time network traffic, inspect online users, and kick unauthorized multi-logins — **all from your phone or PC web browser**.

---

## 🚀 1-Line Fast Installation (GitHub)

Connect to your Ubuntu or Debian VPS via SSH and run this single command:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/BlackPantherV2ray/tunnel-forde-lk/main/install.sh)
```

*Or using wget:*
```bash
wget -qO- https://raw.githubusercontent.com/BlackPantherV2ray/tunnel-forde-lk/main/install.sh | bash
```

> [!TIP]
> If you are testing locally or directly on the VPS after uploading, simply run:
> ```bash
> chmod +x install.sh && sudo ./install.sh
> ```

---

## 🌟 Key Features

### 1. 📊 X-UI Style Live Dashboard
- **Live System Metrics**: Real-time CPU gauge, RAM gauge, Storage progress bar, Uptime, and Linux Kernel specs.
- **Traffic Monitor**: Real-time Download (Rx) and Upload (Tx) bandwidth speed (KB/s and MB).
- **Quick Statistics**: Total Accounts, Active, Expired, Locked, and Live Connected Sessions.

### 2. 👥 SSH & WebSocket Account Manager
- **One-Click Create User**:
  - Alphanumeric username & random password generator.
  - Expiry days selector (e.g. 7, 15, 30, 60 days).
  - Multi-Login Limit (1 to 10 simultaneous IP connections).
  - Customer note (Telegram @handle, phone, buyer name).
- **Instant FastSSH & Payload Export**:
  - Pre-formatted account text ready to paste into Telegram or WhatsApp.
  - HTTP Custom / NapsternetV / V2rayNG payload generator.
  - Offline QR Code generator.
- **Renew / Extend Account**:
  - Add +7, +15, +30, or custom days with 1 click.
- **Instant Lock & Delete**:
  - Instantly lock an account to deny access without deleting history.
  - Clean deletion removes user from Linux `/etc/passwd` and database.

### 3. 🟢 Live Online Users & Auto-Kill Enforcer
- Real-time detection of active Dropbear, OpenSSH, and WebSocket tunnel sessions.
- Displays remote client IP addresses and connection duration.
- **Manual Disconnect**: Kick any active session instantly.
- **Auto-Kill Enforcer Daemon**: Automatically monitors multi-device limits (e.g. 1 user = 1 IP) and terminates unauthorized duplicate connections every 30 seconds.

### 4. ⚙️ System Services Manager
- Status indicators for:
  - OpenSSH (`ssh`)
  - Dropbear (`dropbear`)
  - Stunnel (`stunnel4`)
  - WebSocket Proxy (`ws-dropbear`)
  - BadVPN UDPGW (`badvpn-udpgw` on ports 7100-7300)
  - Xray Core (`xray`)
  - Tunnel Forde LK Web Panel (`tunnel-forde-lk`)
- Individual restart button for each service or **1-Click "Restart All Services"**.

### 5. 🛠️ Command Line Management (`tfl-panel`)
Manage your panel directly from the VPS terminal anytime by typing:
```bash
tfl-panel
```
Options available:
- `tfl-panel start` - Start web panel
- `tfl-panel stop` - Stop web panel
- `tfl-panel restart` - Restart web panel
- `tfl-panel status` - View panel status & login URL
- `tfl-panel reset-admin` - Reset admin password
- `tfl-panel logs` - View live real-time logs
- `tfl-panel uninstall` - Clean removal

---

## 🔒 Default Login Credentials

Upon installation, access your panel at:
```text
URL:      http://<YOUR-VPS-IP>:54321
Username: admin
Password: admin
```
*(You can change the username and password immediately under the Settings tab or via `tfl-panel reset-admin`).*

---

## 💻 System Compatibility

- **Ubuntu**: 20.04 LTS, 22.04 LTS, 24.04 LTS
- **Debian**: 10 (Buster), 11 (Bullseye), 12 (Bookworm)
- **Autoscripts**: Fully compatible with *Simple-Dimple*, SSHPlus, Autoscript VPS, and standard Debian/Ubuntu multi-protocol setups.

---

## 📦 How to Upload this to Your GitHub

To make your personal 1-line installer work under your GitHub profile:

1. Create a new repository on GitHub named `tunnel-forde-lk` (Public).
2. Push the files in this folder to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: initial release of Tunnel Forde LK Web Panel"
   git branch -M main
   git remote add origin https://github.com/BlackPantherV2ray/tunnel-forde-lk.git
   git push -u origin main
   ```
3. Run your 1-line installer on any VPS:
   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/BlackPantherV2ray/tunnel-forde-lk/main/install.sh)
   ```

---

## 📄 License
MIT License. Developed for **Tunnel Forde LK**.
