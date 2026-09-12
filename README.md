# ⚡ Tunnel Forde LK - SSH & Multi-Protocol Web Panel

<p align="center">
  <img src="https://img.shields.io/badge/Release-v1.0.0-00d2ff?style=for-the-badge&logo=rocket" alt="Release">
  <img src="https://img.shields.io/badge/Platform-Ubuntu%20%7C%20Debian-emerald?style=for-the-badge&logo=linux" alt="Linux">
  <img src="https://img.shields.io/badge/Node.js-v20%20LTS-339933?style=for-the-badge&logo=nodedotjs" alt="Node">
  <img src="https://img.shields.io/badge/Support-@Black__Panther__V2ray-2CA5E0?style=for-the-badge&logo=telegram" alt="Telegram Support">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License">
</p>

A modern, high-performance, dark-themed **Web Management Dashboard** (inspired by 3X-UI / X-UI) designed specifically for Linux VPS servers running SSH, Dropbear, Stunnel, WebSocket, and BadVPN UDPGW autoscripts (such as *Simple-Dimple*).

Manage SSH accounts, generate FastSSH connection configs, monitor real-time network traffic, inspect online users, kick unauthorized multi-logins, and toggle SSL — **all from your mobile phone or PC browser**.

---

## 🚀 1-Line Fast Installation (Ubuntu / Debian)

Connect to your VPS via SSH as `root` and run this single command:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/BlackPantherV2ray/Tunnel-Forde-LK-SSH-Panel/main/install.sh)
```

*Or using wget:*
```bash
wget -qO- https://raw.githubusercontent.com/BlackPantherV2ray/Tunnel-Forde-LK-SSH-Panel/main/install.sh | bash
```

> [!TIP]
> **Complete Turnkey Setup**: The installer automatically deploys the **Tunnel Forde LK Web Panel** along with all core VPN daemons:
> - **OpenSSH Server** (Port 22)
> - **Dropbear SSH** (Ports 109, 143)
> - **Stunnel4 SSL/TLS** (Ports 443, 777)
> - **SSH WebSocket Proxy** (Ports 80, 8880, 8080)
> - **BadVPN UDPGW** (Port 7300)
> - **Node.js 20 LTS & UFW Firewall Rules**
> All services will be active 🟢 and ready immediately upon completion!

---

## 🔒 Default Access Credentials

Upon installation, open your browser and navigate to:

| Detail | Default Value | Note |
| :--- | :--- | :--- |
| **URL** | `http://<YOUR-VPS-IP>:54321` | Accessible via any browser |
| **Username** | `admin` | Changeable via Settings or CLI |
| **Password** | `admin` | Changeable via Settings or CLI |

*(You can configure custom domains with free Let's Encrypt SSL certificates anytime from the Web Panel or CLI).*

---

## 🌟 Key Features

### 1. 📊 X-UI Style Live Dashboard
- **Real-Time Gauges**: Live CPU gauge, RAM usage, Storage disk bar, Uptime, and Linux Kernel specs.
- **Traffic Bandwidth Monitor**: Real-time Download (Rx) and Upload (Tx) speeds (KB/s and MB counter).
- **Quick Statistics**: Total Accounts, Active, Expired, Locked, and Live Connected Sessions.

### 2. 👥 SSH & WebSocket Account Manager
- **One-Click User Creation**:
  - Alphanumeric username & random password generator.
  - Expiry days selector (7, 15, 30, 60 days, or custom).
  - Multi-Login Limit (1 to 10 simultaneous IP connections).
  - Customer note field (buyer name, phone, Telegram @username).
- **Instant FastSSH & Payload Exporter**:
  - Pre-formatted account text ready to copy-paste directly to clients on Telegram or WhatsApp.
  - Payloads generator for HTTP Custom, NapsternetV, NetMod, and V2rayNG.
  - Integrated QR Code generator.
- **Renew / Extend User**:
  - Add +7, +15, +30, or custom days with 1 click.
- **Instant Lock & Delete**:
  - Temporarily lock accounts to deny login without deleting account history.
  - Complete deletion removes the user from Linux `/etc/passwd` and system database.

### 3. 🟢 Live Online Users & Auto-Kill Enforcer
- Real-time detection of active Dropbear, OpenSSH, and WebSocket tunnel sessions.
- Displays remote client IP addresses and connection duration.
- **Manual Kick**: Disconnect any active user session instantly.
- **Auto-Kill Enforcer Daemon**: Automatically enforces multi-login limits (e.g. 1 account = 1 device) and terminates unauthorized duplicate connections every 30 seconds.

### 4. ⚙️ System Services Manager
- Live status indicators and 1-click controls for:
  - OpenSSH (`ssh`)
  - Dropbear (`dropbear`)
  - Stunnel (`stunnel4`)
  - WebSocket Proxy (`ws-dropbear`)
  - BadVPN UDPGW (`badvpn-udpgw` on ports 7100-7300)
  - Xray Core (`xray`)
  - Tunnel Forde LK Web Panel (`tunnel-forde-lk`)
- Individual restart buttons or **1-Click "Restart All Services"**.

### 5. 🔒 SSL & Custom Domain Manager
- 1-Click Let's Encrypt SSL issuance for your custom domain.
- Automated certificate renewal cronjob.
- Enables HTTPS on Web Panel and automatically applies certificates to Stunnel.

### 6. 📱 Telegram Integration & Remote Licensing
- Automated daily database backup sent directly to your Telegram chat at 00:00.
- Instant alert on Web Panel login.
- Built-in remote switchable licensing system (Free Community Mode ↔ Commercial Paid Mode).

---

## 🛠️ CLI Helper Management (`tfl-panel`)

Manage your panel directly from the VPS terminal anytime by typing:

```bash
tfl-panel
```

### CLI Quick Commands:

| Command | Action |
| :--- | :--- |
| `tfl-panel start` | Start the web panel |
| `tfl-panel stop` | Stop the web panel |
| `tfl-panel restart` | Restart the web panel |
| `tfl-panel status` | Check panel status, port & login URL |
| `tfl-panel reset-admin` | Change or reset admin username & password |
| `tfl-panel ssl` | Issue Let's Encrypt SSL certificate for custom domain |
| `tfl-panel update` | Update panel to latest version from GitHub |
| `tfl-panel logs` | View live real-time panel logs |
| `tfl-panel uninstall` | Clean uninstallation |

---

## 💻 System Compatibility

- **Ubuntu**: 20.04 LTS, 22.04 LTS, 24.04 LTS
- **Debian**: 10 (Buster), 11 (Bullseye), 12 (Bookworm)
- **Autoscripts**: Fully compatible with *Simple-Dimple*, SSHPlus, Autoscript VPS, and standard Debian/Ubuntu multi-protocol setups.

---

## 📞 Official Support & Updates

- **Developer**: Black Panther
- **Official Telegram**: [@Black_Panther_V2ray](https://t.me/Black_Panther_V2ray)
- **GitHub Repository**: [BlackPantherV2ray/Tunnel-Forde-LK-SSH-Panel](https://github.com/BlackPantherV2ray/Tunnel-Forde-LK-SSH-Panel)

---

## 📄 License
MIT License © 2026 **Tunnel Forde LK**. All rights reserved.
