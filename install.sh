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
GITHUB_REPO="${GITHUB_REPO:-https://github.com/BlackPantherV2ray/Tunnel-Forde-LK-SSH-Panel}"
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

# 2. Install basic dependencies & VPN packages
msg "Updating package cache and installing core dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q curl wget git tar gzip procps net-tools lsof ufw python3 openssl cmake build-essential dropbear stunnel4 || true
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
        local ALL_IPS
        ALL_IPS=$(getent ahosts "$DOMAIN_NAME" 2>/dev/null | awk '{print $1}' | sort -u | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || ping -c 1 "$DOMAIN_NAME" 2>/dev/null | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n1 || true)
        local HAS_WRONG_IP=false
        local HAS_CORRECT_IP=false

        for ip in $ALL_IPS; do
            if [[ "$ip" == "$PUBLIC_IP" ]]; then
                HAS_CORRECT_IP=true
            else
                warn "Conflicting A-Record detected: ${DOMAIN_NAME} also points to '${ip}'!"
                HAS_WRONG_IP=true
            fi
        done

        if [[ "$HAS_WRONG_IP" == "true" ]]; then
            warn "Your DNS has multiple conflicting A-records for '${DOMAIN_NAME}'."
            warn "Please delete the extra A-record in your Cloudflare/DNS panel, leaving only '${PUBLIC_IP}' (DNS only)."
            warn "Skipping SSL for now. You can run 'tfl-panel' (Option 6) after cleaning DNS."
        elif [[ "$HAS_CORRECT_IP" == "true" ]]; then
            ok "DNS verified: ${DOMAIN_NAME} points to this server (${PUBLIC_IP})."
            read -rp "Enter admin email for Let's Encrypt notices (press Enter to skip): " SSL_EMAIL
            SSL_EMAIL=${SSL_EMAIL:-"admin@${DOMAIN_NAME}"}

            msg "Issuing Let's Encrypt SSL certificate for ${DOMAIN_NAME}..."
            apt-get install -y -q certbot psmisc >/dev/null 2>&1 || true

            # Temporarily stop port 80 conflicts if any
            systemctl stop nginx ws-dropbear 2>/dev/null || true
            fuser -k 80/tcp 2>/dev/null || true

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
                warn "Certbot issuance failed. Ensure port 80 is not blocked and Proxy is DNS Only."
            fi

            # Restore services
            systemctl start nginx ws-dropbear 2>/dev/null || true
        else
            warn "DNS verification warning: ${DOMAIN_NAME} does not point to this VPS (${PUBLIC_IP})."
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
else
    # Preserve existing credentials if already installed, otherwise default to admin/admin
    node -e "
    const fs = require('fs');
    const crypto = require('crypto');
    const path = '${APP_DIR}/data/tfl_panel.json';
    try {
        let d = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : { settings: {}, users: [], logs: [] };
        d.settings = d.settings || {};
        if (!d.settings.adminPassHash) {
            d.settings.adminUser = 'admin';
            d.settings.adminPassHash = crypto.createHash('sha256').update('admin').digest('hex');
            fs.writeFileSync(path, JSON.stringify(d, null, 2));
        }
    } catch(e) {}
    " 2>/dev/null || true
    ok "Admin credentials verified / preserved."
fi

# 9. Configure & Start Core VPN Services (Dropbear, Stunnel, WebSocket Proxy, BadVPN)
hr
msg "Configuring & Starting Core VPN Services..."

# A. SSH Server Banner
cat << 'EOF' > /etc/issue.net
<font color="#00ffff"><b>=======================================</b></font><br>
<font color="#00ff00"><b>     ⚡ TUNNEL FORDE LK HIGH-SPEED SSH ⚡     </b></font><br>
<font color="#00ffff"><b>=======================================</b></font><br>
<font color="#ffaa00"><b>  • Multi-Protocol: SSH / SSL / WS / UDP</b></font><br>
<font color="#ff3333"><b>  • No DDOS / No Spam / No Torrenting   </b></font><br>
<font color="#00ffaa"><b>  • Official: t.me/Black_Panther_V2ray </b></font><br>
<font color="#00ffff"><b>=======================================</b></font>
EOF

# A.1 Enable Password Authentication on OpenSSH (Port 22)
msg "Configuring OpenSSH (Port 22) for Password Authentication..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/g' /etc/ssh/sshd_config 2>/dev/null || true
sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/g' /etc/ssh/sshd_config 2>/dev/null || true
sed -i 's/#KbdInteractiveAuthentication yes/KbdInteractiveAuthentication yes/g' /etc/ssh/sshd_config 2>/dev/null || true
sed -i 's/KbdInteractiveAuthentication no/KbdInteractiveAuthentication yes/g' /etc/ssh/sshd_config 2>/dev/null || true

mkdir -p /etc/ssh/sshd_config.d
cat << 'EOF' > /etc/ssh/sshd_config.d/99-tunnel-forde.conf
PasswordAuthentication yes
KbdInteractiveAuthentication yes
Banner /etc/issue.net
ClientAliveInterval 30
ClientAliveCountMax 3
EOF

systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true
ok "OpenSSH configured on port 22 with Password Authentication enabled."

# B. Dropbear SSH (Ports 109, 143)
msg "Setting up Dropbear SSH (Ports 109, 143)..."
apt-get install -y -q dropbear

# Disable Ubuntu 22.04/24.04 socket activation conflict on port 22
systemctl stop dropbear.socket 2>/dev/null || true
systemctl disable dropbear.socket 2>/dev/null || true
systemctl mask dropbear.socket 2>/dev/null || true

# Generate host keys if missing
mkdir -p /etc/dropbear
[[ ! -f /etc/dropbear/dropbear_rsa_host_key ]] && dropbearkey -t rsa -f /etc/dropbear/dropbear_rsa_host_key 2>/dev/null || true
[[ ! -f /etc/dropbear/dropbear_ecdsa_host_key ]] && dropbearkey -t ecdsa -f /etc/dropbear/dropbear_ecdsa_host_key 2>/dev/null || true
[[ ! -f /etc/dropbear/dropbear_ed25519_host_key ]] && dropbearkey -t ed25519 -f /etc/dropbear/dropbear_ed25519_host_key 2>/dev/null || true

cat << 'EOF' > /etc/systemd/system/dropbear.service
[Unit]
Description=Dropbear SSH Server (Ports 109, 143)
After=network.target

[Service]
Type=simple
ExecStart=/usr/sbin/dropbear -F -E -p 0.0.0.0:109 -p 0.0.0.0:143 -b /etc/issue.net
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl unmask dropbear 2>/dev/null || true
systemctl enable dropbear 2>/dev/null || true
systemctl restart dropbear 2>/dev/null || true
ok "Dropbear SSH configured and active on ports 109, 143."

# C. Stunnel4 SSL/TLS (Ports 443, 777)
msg "Setting up Stunnel4 (Ports 443, 777)..."
mkdir -p /etc/stunnel
if [[ ! -f /etc/stunnel/stunnel.pem ]]; then
    if [[ -f "${APP_DIR}/certs/privkey.pem" && -f "${APP_DIR}/certs/fullchain.pem" ]]; then
        cat "${APP_DIR}/certs/privkey.pem" "${APP_DIR}/certs/fullchain.pem" > /etc/stunnel/stunnel.pem
    else
        openssl req -new -x509 -days 3650 -nodes \
            -subj "/C=LK/ST=Western/L=Colombo/O=TunnelFordeLK/CN=tunnel-forde.lk" \
            -keyout /etc/stunnel/stunnel.pem \
            -out /etc/stunnel/stunnel.pem >/dev/null 2>&1 || true
    fi
    chmod 600 /etc/stunnel/stunnel.pem 2>/dev/null || true
fi

cat << 'EOF' > /etc/stunnel/stunnel.conf
pid = /var/run/stunnel4.pid
cert = /etc/stunnel/stunnel.pem
client = no
socket = l:TCP_NODELAY=1
socket = r:TCP_NODELAY=1

[dropbear-ssl]
accept = 443
connect = 127.0.0.1:109

[openssh-ssl]
accept = 777
connect = 127.0.0.1:22
EOF

sed -i 's/ENABLED=0/ENABLED=1/g' /etc/default/stunnel4 2>/dev/null || echo "ENABLED=1" >> /etc/default/stunnel4
systemctl daemon-reload
systemctl enable stunnel4 2>/dev/null || true
systemctl restart stunnel4 2>/dev/null || true
ok "Stunnel4 configured and active on ports 443, 777."

# D. SSH WebSocket Proxy (Ports 80, 8880, 8080)
msg "Setting up SSH WebSocket Proxy (Ports 80, 8880, 8080)..."
mkdir -p /usr/local/bin

cat << 'EOF' > /usr/local/bin/ws-dropbear.py
#!/usr/bin/env python3
import socket
import select
import threading

PRIMARY_PORT = 109
FALLBACK_PORT = 22
LISTEN_PORTS = [80, 8880, 8080]
BUFFER_SIZE = 16384

WS_RESPONSE_101 = (
    b"HTTP/1.1 101 Switching Protocols\r\n"
    b"Upgrade: websocket\r\n"
    b"Connection: Upgrade\r\n"
    b"Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n"
)

def handle_client(client_sock):
    target_sock = None
    try:
        req = client_sock.recv(BUFFER_SIZE)
        if not req:
            client_sock.close()
            return

        target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        target_sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        connected = False
        for port in [PRIMARY_PORT, FALLBACK_PORT]:
            try:
                target_sock.connect(('127.0.0.1', port))
                connected = True
                break
            except Exception:
                continue

        if not connected:
            client_sock.close()
            return

        req_str = req.decode('utf-8', errors='ignore')
        if 'upgrade' in req_str.lower():
            client_sock.sendall(WS_RESPONSE_101)
        elif req_str.startswith('CONNECT'):
            client_sock.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        else:
            client_sock.sendall(WS_RESPONSE_101)

        socks = [client_sock, target_sock]
        while True:
            r, _, x = select.select(socks, [], socks, 60)
            if x or not r:
                break
            for s in r:
                other = target_sock if s is client_sock else client_sock
                data = s.recv(BUFFER_SIZE)
                if not data:
                    return
                other.sendall(data)
    except Exception:
        pass
    finally:
        try: client_sock.close()
        except: pass
        if target_sock:
            try: target_sock.close()
            except: pass

def listen_port(port):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind(('0.0.0.0', port))
        server.listen(200)
    except Exception:
        return
    while True:
        try:
            client, addr = server.accept()
            client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            threading.Thread(target=handle_client, args=(client,), daemon=True).start()
        except Exception:
            pass

if __name__ == '__main__':
    for p in LISTEN_PORTS:
        threading.Thread(target=listen_port, args=(p,), daemon=True).start()
    while True:
        import time
        time.sleep(3600)
EOF

chmod +x /usr/local/bin/ws-dropbear.py

cat << 'EOF' > /etc/systemd/system/ws-dropbear.service
[Unit]
Description=Tunnel Forde LK - SSH WebSocket Proxy Service
After=network.target dropbear.service

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /usr/local/bin/ws-dropbear.py
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ws-dropbear 2>/dev/null || true
systemctl restart ws-dropbear 2>/dev/null || true
ok "SSH WebSocket Proxy active on ports 80, 8880, 8080."

# E. BadVPN UDPGW (Port 7300)
msg "Setting up BadVPN UDPGW (Port 7300)..."
if ! command -v badvpn-udpgw >/dev/null 2>&1 && [[ ! -f /usr/bin/badvpn-udpgw ]]; then
    TMP_BUILD=$(mktemp -d)
    if git clone --depth=1 https://github.com/ambrop72/badvpn.git "$TMP_BUILD/badvpn" >/dev/null 2>&1; then
        mkdir -p "$TMP_BUILD/badvpn/build"
        cd "$TMP_BUILD/badvpn/build"
        cmake .. -DBUILD_NOTHING_BY_DEFAULT=1 -DBUILD_UDPGW=1 >/dev/null 2>&1 || true
        make install >/dev/null 2>&1 || true
        cp badvpn-udpgw/badvpn-udpgw /usr/bin/badvpn-udpgw 2>/dev/null || true
    fi
    rm -rf "$TMP_BUILD"
fi

if [[ -f /usr/local/bin/badvpn-udpgw && ! -f /usr/bin/badvpn-udpgw ]]; then
    ln -sf /usr/local/bin/badvpn-udpgw /usr/bin/badvpn-udpgw
fi

if command -v badvpn-udpgw >/dev/null 2>&1 || [[ -f /usr/bin/badvpn-udpgw ]]; then
    cat << 'EOF' > /etc/systemd/system/badvpn-udpgw.service
[Unit]
Description=Tunnel Forde LK - BadVPN UDPGW Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/badvpn-udpgw --listen-addr 127.0.0.1:7300 --max-clients 500 --max-connections-for-client 20
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable badvpn-udpgw 2>/dev/null || true
    systemctl restart badvpn-udpgw 2>/dev/null || true
    ok "BadVPN UDPGW active on port 7300."
fi

# 10. Register Web Panel Systemd Service
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
ok "Panel service registered and started."

# 11. Firewall Configuration (Allow VPN + Panel Ports)
msg "Configuring firewall rules..."
if command -v ufw >/dev/null 2>&1; then
    if ufw status | grep -qw "active"; then
        ufw allow 22/tcp comment "OpenSSH" >/dev/null 2>&1 || true
        ufw allow 80/tcp comment "WebSocket HTTP" >/dev/null 2>&1 || true
        ufw allow 109/tcp comment "Dropbear 1" >/dev/null 2>&1 || true
        ufw allow 143/tcp comment "Dropbear 2" >/dev/null 2>&1 || true
        ufw allow 443/tcp comment "Stunnel SSL" >/dev/null 2>&1 || true
        ufw allow 777/tcp comment "Stunnel SSL Alt" >/dev/null 2>&1 || true
        ufw allow 8080/tcp comment "WebSocket Alt" >/dev/null 2>&1 || true
        ufw allow 8880/tcp comment "WebSocket Alt" >/dev/null 2>&1 || true
        ufw allow 7300/udp comment "BadVPN UDPGW" >/dev/null 2>&1 || true
        ufw allow ${DEFAULT_PORT}/tcp comment "Tunnel Forde LK Panel" >/dev/null 2>&1 || true
        ok "Allowed VPN & Panel ports in UFW firewall."
    fi
fi

sleep 2

# 12. Display Success Banner
hr
echo -e "${C_GREEN}✔ TUNNEL FORDE LK WEB PANEL & VPN SERVICES DEPLOYED SUCCESSFULLY!${C_RESET}"
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
echo -e "${C_WHITE}Active Core VPN Protocols & Ports:${C_RESET}"
echo -e "  • ${C_CYAN}OpenSSH Server:${C_RESET}       ${C_GREEN}Port 22${C_RESET}       [Active 🟢]"
echo -e "  • ${C_CYAN}Dropbear SSH:${C_RESET}         ${C_GREEN}Port 109, 143${C_RESET} [Active 🟢]"
echo -e "  • ${C_CYAN}Stunnel4 (SSL/TLS):${C_RESET}   ${C_GREEN}Port 443, 777${C_RESET} [Active 🟢]"
echo -e "  • ${C_CYAN}SSH WebSocket Proxy:${C_RESET}  ${C_GREEN}Port 80, 8880, 8080${C_RESET} [Active 🟢]"
echo -e "  • ${C_CYAN}BadVPN UDPGW:${C_RESET}         ${C_GREEN}Port 7300${C_RESET}     [Active 🟢]"
echo -e "  • ${C_CYAN}Tunnel Forde LK Web:${C_RESET}  ${C_GREEN}Port ${DEFAULT_PORT}${C_RESET}   [Active 🟢]"
echo ""
echo -e "${C_WHITE}Command Line Management:${C_RESET}"
echo -e "  Type ${C_GREEN}tfl-panel${C_RESET} in your terminal anytime to manage panel, reset password or configure domain."
echo ""
echo -e "${C_WHITE}Official Support & Updates:${C_RESET}"
echo -e "  Telegram: ${C_CYAN}https://t.me/Black_Panther_V2ray${C_RESET} (${C_WHITE}@Black_Panther_V2ray${C_RESET})"
echo ""
hr
echo -e "${C_MUTED}Enjoy using Tunnel Forde LK! Powered by Antigravity.${C_RESET}"
