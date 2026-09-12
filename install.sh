#!/usr/bin/env bash
# ==============================================================================
# ⚡ TUNNEL FORDE LK - 1-LINE WEB PANEL INSTALLER SCRIPT ⚡
# ==============================================================================
# Installs Tunnel Forde LK Web Panel alongside Simple-Dimple / standard SSH setups
# Supported OS: Ubuntu 20.04 / 22.04 / 24.04, Debian 10 / 11 / 12
# ==============================================================================

set -euo pipefail

# Configuration
BRAND_NAME="Tunnel Forde LK"
APP_DIR="/opt/tunnel-forde-lk"
SERVICE_NAME="tunnel-forde-lk"
CLI_NAME="tfl-panel"
DEFAULT_PORT=54321

# Default GitHub Repo (User can override with REPO_URL environment variable)
GITHUB_REPO="${GITHUB_REPO:-https://github.com/BlackPantherV2ray/tunnel-forde-lk}"
# Branch
BRANCH="${BRANCH:-main}"

# Colors
C_RESET='\e[0m'
C_CYAN='\e[38;5;51m'
C_GREEN='\e[38;5;82m'
C_RED='\e[38;5;196m'
C_YELLOW='\e[38;5;220m'
C_WHITE='\e[1;37m'
C_MUTED='\e[38;5;244m'

msg()  { echo -e "${C_CYAN}::${C_RESET} ${C_WHITE}$*${C_RESET}"; }
ok()   { echo -e "  ${C_GREEN}✔${C_RESET} ${C_GREEN}$*${C_RESET}"; }
warn() { echo -e "  ${C_YELLOW}⚠${C_RESET} ${C_YELLOW}$*${C_RESET}"; }
die()  { echo -e "${C_RED}Error: $*${C_RESET}" >&2; exit 1; }
hr()   { echo -e "${C_CYAN}----------------------------------------------------------------------${C_RESET}"; }

# Banner
clear
echo -e "${C_CYAN}"
cat << 'EOF'
  _______                      _   ______             _         _     _  __
 |__   __|                    | | |  ____|           | |       | |   | |/ /
    | |_   _ _ __  _ __   ___ | | | |__ ___  _ __  __| | ___   | |   | ' / 
    | | | | | '_ \| '_ \ / _ \| | |  __/ _ \| '__|/ _` |/ _ \  | |   |  <  
    | | |_| | | | | | | |  __/| | | | | (_) | |  | (_| |  __/  | |___| . \ 
    |_|\__,_|_| |_|_| |_|\___||_| |_|  \___/|_|   \__,_|\___|  |______|_|\_\
EOF
echo -e "${C_RESET}"
echo -e "${C_WHITE}       Next-Gen SSH, Dropbear & WebSocket Web Management Panel         ${C_RESET}"
echo -e "${C_MUTED}       Branded for: ${C_CYAN}Tunnel Forde LK${C_RESET}"
hr
echo ""

# 1. Preflight checks
msg "Running pre-flight checks..."
if [[ $EUID -ne 0 ]]; then
    die "This installer must be run as root. Run with: sudo bash install.sh"
fi

command -v systemctl >/dev/null 2>&1 || die "systemctl is required. This host must run systemd."
ok "Pre-flight checks passed."

# 2. Install basic dependencies
msg "Updating package cache and installing core dependencies..."
apt-get update -y -q
apt-get install -y -q curl wget git tar gzip procps net-tools lsof ufw || true
ok "Core dependencies installed."

# 3. Check / Install Node.js (Node 20 LTS)
msg "Checking Node.js environment..."
NODE_INSTALLED=false
if command -v node >/dev/null 2>&1; then
    NODE_VER=$(node -v | tr -d 'v' | cut -d'.' -f1)
    if [[ "$NODE_VER" -ge 18 ]]; then
        ok "Node.js $(node -v) is already installed."
        NODE_INSTALLED=true
    fi
fi

if [[ "$NODE_INSTALLED" = false ]]; then
    msg "Installing Node.js 20 LTS (NodeSource)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -q nodejs
    ok "Node.js $(node -v) installed successfully."
fi

# 4. Prepare Destination Directory
msg "Setting up application in ${APP_DIR}..."
mkdir -p "${APP_DIR}"

# Check if installing from local directory or remote GitHub
INSTALL_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

if [[ -f "${INSTALL_SOURCE_DIR}/server.js" && -d "${INSTALL_SOURCE_DIR}/lib" ]]; then
    msg "Detected local installation files. Copying..."
    cp -r "${INSTALL_SOURCE_DIR}"/* "${APP_DIR}/"
else
    msg "Downloading latest Tunnel Forde LK release files from GitHub..."
    TMP_DIR=$(mktemp -d)
    
    # Try Git clone, fallback to tarball download
    if git clone --depth=1 -b "$BRANCH" "$GITHUB_REPO" "$TMP_DIR" 2>/dev/null; then
        cp -r "$TMP_DIR"/* "${APP_DIR}/"
    else
        # If repo is in archive format
        RAW_TAR="${GITHUB_REPO}/archive/refs/heads/${BRANCH}.tar.gz"
        wget -qO- "$RAW_TAR" | tar -xz -C "$TMP_DIR" --strip-components=1 2>/dev/null || \
            die "Failed to download repository files from ${GITHUB_REPO}. Please check your internet connection or repo URL."
        cp -r "$TMP_DIR"/* "${APP_DIR}/"
    fi
    rm -rf "$TMP_DIR"
fi

# 5. Install Node Dependencies
msg "Installing npm dependencies in ${APP_DIR}..."
cd "${APP_DIR}"
npm install --omit=dev --silent --no-audit --no-fund || npm install --production
ok "Dependencies installed."

# 6. Setup CLI Tool
msg "Configuring CLI helper command (/usr/bin/${CLI_NAME})..."
if [[ -f "${APP_DIR}/tfl-panel.sh" ]]; then
    cp "${APP_DIR}/tfl-panel.sh" "/usr/bin/${CLI_NAME}"
    chmod +x "/usr/bin/${CLI_NAME}"
    ok "CLI helper registered. You can now type '${CLI_NAME}' in terminal anytime."
fi

# 7. Interactive Custom Domain & SSL Certificate Setup (3X-UI Style)
PUBLIC_IP=$(curl -s4 --max-time 4 https://api.ipify.org || curl -s4 --max-time 4 https://ifconfig.me/ip || hostname -I | awk '{print $1}')
SSL_CONFIGURED=false
DOMAIN_NAME=""

hr
msg "Custom Domain & SSL Configuration (3X-UI Style)"
echo -e "${C_MUTED}Point your domain's A-Record to this VPS IP (${PUBLIC_IP}) to enable HTTPS.${C_RESET}"
read -rp "Do you want to configure a custom domain and SSL certificate now? (y/n): " SETUP_DOMAIN

if [[ "$SETUP_DOMAIN" =~ ^[Yy]$ ]]; then
    read -rp "Enter your domain name (e.g. vpn.tunnel-forde.lk): " DOMAIN_NAME
    DOMAIN_NAME=$(echo "$DOMAIN_NAME" | tr '[:upper:]' '[:lower:]' | tr -d ' ')

    if [[ -n "$DOMAIN_NAME" ]]; then
        msg "Verifying DNS pointing for ${DOMAIN_NAME}..."
        RESOLVED_IP=$(ping -c 1 "$DOMAIN_NAME" 2>/dev/null | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n1 || getent ahosts "$DOMAIN_NAME" 2>/dev/null | awk '{print $1}' | head -n1 || true)
        
        if [[ -n "$RESOLVED_IP" && "$RESOLVED_IP" == "$PUBLIC_IP" ]]; then
            ok "DNS verified: ${DOMAIN_NAME} points to this server (${PUBLIC_IP})."
            read -rp "Enter admin email for Let's Encrypt notices (press Enter to skip): " SSL_EMAIL
            SSL_EMAIL=${SSL_EMAIL:-"admin@${DOMAIN_NAME}"}

            msg "Issuing Let's Encrypt SSL certificate for ${DOMAIN_NAME}..."
            apt-get install -y -q certbot >/dev/null 2>&1 || true

            # Temporarily stop port 80 conflicts if any
            systemctl stop nginx ws-dropbear 2>/dev/null || true

            if certbot certonly --standalone --agree-tos --non-interactive -m "$SSL_EMAIL" -d "$DOMAIN_NAME" --preferred-challenges http; then
                mkdir -p "${APP_DIR}/certs"
                cp "/etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem" "${APP_DIR}/certs/"
                cp "/etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem" "${APP_DIR}/certs/"
                
                # Apply to stunnel if available
                if [[ -d "/etc/stunnel" ]]; then
                    cat "${APP_DIR}/certs/privkey.pem" "${APP_DIR}/certs/fullchain.pem" > /etc/stunnel/stunnel.pem
                    systemctl restart stunnel4 2>/dev/null || true
                fi

                # Setup auto-renew cron
                (crontab -l 2>/dev/null | grep -v 'certbot renew'; echo "0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/${DOMAIN_NAME}/*.pem ${APP_DIR}/certs/ && systemctl restart ${SERVICE_NAME}") | crontab -

                # Enable HTTPS in settings
                node -e "
                const fs = require('fs');
                const path = '${APP_DIR}/data/tfl_panel.json';
                try {
                    let d = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : { settings: {}, users: [], logs: [] };
                    d.settings = d.settings || {};
                    d.settings.sslDomain = '${DOMAIN_NAME}';
                    d.settings.enableHttps = true;
                    fs.writeFileSync(path, JSON.stringify(d, null, 2));
                } catch(e) {}
                " 2>/dev/null || true

                ok "SSL Certificate issued and applied successfully!"
                SSL_CONFIGURED=true
            else
                warn "Certbot issuance failed. Continuing with standard HTTP access."
            fi

            # Restore services
            systemctl start nginx ws-dropbear 2>/dev/null || true
        else
            warn "DNS verification warning: ${DOMAIN_NAME} points to '${RESOLVED_IP}', but this VPS is '${PUBLIC_IP}'."
            warn "Skipping SSL for now. You can run 'tfl-panel' in terminal anytime to setup domain after DNS propagates."
        fi
    fi
fi

# 8. Interactive Admin Account Setup (3X-UI Style)
hr
msg "Admin Account Setup (3X-UI Style)"
echo -e "${C_MUTED}Default admin credentials are username: 'admin' and password: 'admin'.${C_RESET}"
read -rp "Do you want to customize your admin username & password now? (y/n): " CUSTOM_ADMIN

ADMIN_USER="admin"
ADMIN_PASS="admin"

if [[ "$CUSTOM_ADMIN" =~ ^[Yy]$ ]]; then
    read -rp "Enter custom admin username [admin]: " INPUT_USER
    read -rp "Enter custom admin password [admin]: " INPUT_PASS
    [[ -n "$INPUT_USER" ]] && ADMIN_USER="$INPUT_USER"
    [[ -n "$INPUT_PASS" ]] && ADMIN_PASS="$INPUT_PASS"
fi

# Save credentials into panel database
node -e "
const fs = require('fs');
const crypto = require('crypto');
const path = '${APP_DIR}/data/tfl_panel.json';
try {
    let d = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : { settings: {}, users: [], logs: [] };
    d.settings = d.settings || {};
    d.settings.adminUser = '${ADMIN_USER}';
    d.settings.adminPassHash = crypto.createHash('sha256').update('${ADMIN_PASS}').digest('hex');
    fs.writeFileSync(path, JSON.stringify(d, null, 2));
} catch(e) {}
" 2>/dev/null || true
ok "Admin credentials configured: Username '${ADMIN_USER}'"

# 9. Register Systemd Service
msg "Configuring systemd service (${SERVICE_NAME}.service)..."
cat << EOF > "/etc/systemd/system/${SERVICE_NAME}.service"
[Unit]
Description=Tunnel Forde LK - Web Panel Service
After=network.target network-online.target ssh.service dropbear.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/server.js
Restart=always
RestartSec=3s
LimitNOFILE=65535
Environment=PORT=${DEFAULT_PORT}
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
ok "Service registered and started."

# 10. Firewall Configuration
msg "Checking firewall rules for port ${DEFAULT_PORT}..."
if command -v ufw >/dev/null 2>&1; then
    if ufw status | grep -qw "active"; then
        ufw allow ${DEFAULT_PORT}/tcp comment "Tunnel Forde LK Panel" >/dev/null 2>&1 || true
        ok "Allowed port ${DEFAULT_PORT} in UFW firewall."
    fi
fi

sleep 2

# 11. Display Success Banner
hr
echo -e "${C_GREEN}✔ TUNNEL FORDE LK WEB PANEL DEPLOYED SUCCESSFULLY!${C_RESET}"
hr
echo ""
echo -e "${C_WHITE}Dashboard Access Details:${C_RESET}"
if [[ "$SSL_CONFIGURED" = true && -n "$DOMAIN_NAME" ]]; then
    echo -e "  ${C_CYAN}URL (HTTPS):${C_RESET} ${C_GREEN}https://${DOMAIN_NAME}:${DEFAULT_PORT}${C_RESET} 🔒"
    echo -e "  ${C_CYAN}Fallback IP:${C_RESET} http://${PUBLIC_IP}:${DEFAULT_PORT}"
else
    echo -e "  ${C_CYAN}URL:${C_RESET}         ${C_WHITE}http://${PUBLIC_IP}:${DEFAULT_PORT}${C_RESET}"
fi
echo -e "  ${C_CYAN}Username:${C_RESET}    ${C_GREEN}${ADMIN_USER}${C_RESET}"
echo -e "  ${C_CYAN}Password:${C_RESET}    ${C_GREEN}${ADMIN_PASS}${C_RESET}"
echo ""
echo -e "${C_WHITE}Command Line Management:${C_RESET}"
echo -e "  Type ${C_GREEN}tfl-panel${C_RESET} in your terminal anytime to manage panel, reset password or configure domain."
echo ""
echo -e "${C_WHITE}Official Support & Updates:${C_RESET}"
echo -e "  Telegram: ${C_CYAN}https://t.me/Black_Panther_V2ray${C_RESET} (${C_WHITE}@Black_Panther_V2ray${C_RESET})"
echo ""
hr
echo -e "${C_MUTED}Enjoy using Tunnel Forde LK! Powered by Antigravity.${C_RESET}"
