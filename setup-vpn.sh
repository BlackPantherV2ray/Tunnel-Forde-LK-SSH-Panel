#!/usr/bin/env bash
# ==============================================================================
# ⚡ TUNNEL FORDE LK - CORE VPN SERVICES AUTO-INSTALLER ⚡
# ==============================================================================
# Installs & Configures:
#   1. Dropbear SSH (Ports: 109, 143)
#   2. Stunnel4 SSL/TLS (Ports: 443, 777)
#   3. SSH WebSocket Proxy (Ports: 80, 8880, 8080 -> Dropbear 109)
#   4. BadVPN UDPGW (Port: 7300 for VoIP / Gaming UDP forwarding)
#
# Supported: Ubuntu 20.04 / 22.04 / 24.04, Debian 10 / 11 / 12
# ==============================================================================

set -euo pipefail

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
echo -e "${C_WHITE}         Core VPN Services Installer (Dropbear, Stunnel, WS, UDPGW)    ${C_RESET}"
echo -e "${C_MUTED}         Branded for: ${C_CYAN}Tunnel Forde LK${C_RESET}"
hr
echo ""

if [[ $EUID -ne 0 ]]; then
    die "This installer must be run as root (sudo bash setup-vpn.sh)"
fi

# 1. Install System Dependencies
msg "Installing dependencies & build tools..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q curl wget git python3 net-tools lsof ufw openssl build-essential cmake

# 2. Configure Banner
msg "Setting up SSH server banner..."
cat << 'EOF' > /etc/issue.net
<font color="#00ffff"><b>=======================================</b></font><br>
<font color="#00ff00"><b>     ⚡ TUNNEL FORDE LK HIGH-SPEED SSH ⚡     </b></font><br>
<font color="#00ffff"><b>=======================================</b></font><br>
<font color="#ffaa00"><b>  • Multi-Protocol: SSH / SSL / WS / UDP</b></font><br>
<font color="#ff3333"><b>  • No DDOS / No Spam / No Torrenting   </b></font><br>
<font color="#00ffaa"><b>  • Official: t.me/Black_Panther_V2ray </b></font><br>
<font color="#00ffff"><b>=======================================</b></font>
EOF

# 3. Setup Dropbear SSH (Ports 109, 143)
msg "Installing and configuring Dropbear SSH (Ports 109, 143)..."
apt-get install -y -q dropbear

cat << 'EOF' > /etc/default/dropbear
NO_START=0
DROPBEAR_PORT=143
DROPBEAR_EXTRA_ARGS="-p 109"
DROPBEAR_BANNER="/etc/issue.net"
DROPBEAR_RECEIVE_WINDOW=65536
EOF

systemctl daemon-reload
systemctl enable dropbear
systemctl restart dropbear
ok "Dropbear SSH configured and active on ports 109, 143."

# 4. Setup Stunnel4 SSL/TLS (Ports 443, 777)
msg "Installing and configuring Stunnel4 (Ports 443, 777)..."
apt-get install -y -q stunnel4

mkdir -p /etc/stunnel
if [[ ! -f /etc/stunnel/stunnel.pem ]]; then
    msg "Generating SSL certificate for Stunnel..."
    openssl req -new -x509 -days 3650 -nodes \
        -subj "/C=LK/ST=Western/L=Colombo/O=TunnelFordeLK/CN=tunnel-forde.lk" \
        -keyout /etc/stunnel/stunnel.pem \
        -out /etc/stunnel/stunnel.pem 2>/dev/null
    chmod 600 /etc/stunnel/stunnel.pem
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
systemctl enable stunnel4
systemctl restart stunnel4
ok "Stunnel4 configured and active on ports 443, 777."

# 5. Setup SSH WebSocket Proxy (Ports 80, 8880, 8080)
msg "Configuring SSH WebSocket Proxy (Ports 80, 8880, 8080 -> Dropbear 109)..."
mkdir -p /usr/local/bin

cat << 'EOF' > /usr/local/bin/ws-dropbear.py
#!/usr/bin/env python3
"""
Tunnel Forde LK - High-Performance Multi-Port WebSocket SSH Proxy
Listens on ports 80, 8880, 8080 and proxies HTTP/WS payloads to Dropbear 109
"""
import socket
import select
import threading
import sys

TARGET_HOST = '127.0.0.1'
TARGET_PORT = 109
LISTEN_PORTS = [80, 8880, 8080]
BUFFER_SIZE = 16384

WS_RESPONSE = (
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

        # Handshake with standard WebSocket response or 200 OK
        client_sock.sendall(WS_RESPONSE)

        target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        target_sock.connect((TARGET_HOST, TARGET_PORT))

        sockets = [client_sock, target_sock]
        while True:
            r_socks, _, x_socks = select.select(sockets, [], sockets, 60)
            if x_socks:
                break
            if not r_socks:
                continue

            for s in r_socks:
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
    except Exception as e:
        print(f"[WS] Failed to bind on port {port}: {e}")
        return

    while True:
        try:
            client, addr = server.accept()
            client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            t = threading.Thread(target=handle_client, args=(client,), daemon=True)
            t.start()
        except Exception:
            pass

if __name__ == '__main__':
    threads = []
    for p in LISTEN_PORTS:
        th = threading.Thread(target=listen_port, args=(p,), daemon=True)
        th.start()
        threads.append(th)

    for th in threads:
        th.join()
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
systemctl enable ws-dropbear
systemctl restart ws-dropbear
ok "SSH WebSocket Proxy configured and active on ports 80, 8880, 8080."

# 6. Setup BadVPN UDPGW (Port 7300)
msg "Setting up BadVPN UDPGW (Port 7300 for VoIP/Gaming UDP)..."
if ! command -v badvpn-udpgw >/dev/null 2>&1; then
    msg "Compiling BadVPN UDPGW (fast build)..."
    TMP_BUILD=$(mktemp -d)
    if git clone --depth=1 https://github.com/ambrop72/badvpn.git "$TMP_BUILD/badvpn" 2>/dev/null; then
        mkdir -p "$TMP_BUILD/badvpn/build"
        cd "$TMP_BUILD/badvpn/build"
        cmake .. -DBUILD_NOTHING_BY_DEFAULT=1 -DBUILD_UDPGW=1 >/dev/null 2>&1 || true
        make install >/dev/null 2>&1 || true
        cp badvpn-udpgw/badvpn-udpgw /usr/bin/badvpn-udpgw 2>/dev/null || true
    fi
    rm -rf "$TMP_BUILD"
fi

# Ensure executable link exists
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
    systemctl enable badvpn-udpgw
    systemctl restart badvpn-udpgw
    ok "BadVPN UDPGW active on port 7300."
else
    warn "Could not compile badvpn-udpgw. Skipping UDPGW."
fi

# 7. Configure Firewall
msg "Opening ports in UFW firewall..."
if command -v ufw >/dev/null 2>&1; then
    if ufw status | grep -qw "active"; then
        ufw allow 22/tcp >/dev/null 2>&1 || true
        ufw allow 80/tcp >/dev/null 2>&1 || true
        ufw allow 109/tcp >/dev/null 2>&1 || true
        ufw allow 143/tcp >/dev/null 2>&1 || true
        ufw allow 443/tcp >/dev/null 2>&1 || true
        ufw allow 777/tcp >/dev/null 2>&1 || true
        ufw allow 8080/tcp >/dev/null 2>&1 || true
        ufw allow 8880/tcp >/dev/null 2>&1 || true
        ufw allow 7300/udp >/dev/null 2>&1 || true
        ok "UFW rules applied for VPN ports."
    fi
fi

# Restart panel to refresh service statuses
systemctl restart tunnel-forde-lk 2>/dev/null || true

hr
echo -e "${C_GREEN}✔ ALL CORE VPN SERVICES INSTALLED & STARTED SUCCESSFULLY!${C_RESET}"
hr
echo ""
echo -e "  ${C_CYAN}• OpenSSH Server:${C_RESET}       ${C_GREEN}Port 22${C_RESET}"
echo -e "  ${C_CYAN}• Dropbear SSH:${C_RESET}         ${C_GREEN}Port 109, 143${C_RESET}"
echo -e "  ${C_CYAN}• Stunnel4 (SSL/TLS):${C_RESET}   ${C_GREEN}Port 443, 777${C_RESET}"
echo -e "  ${C_CYAN}• SSH WebSocket Proxy:${C_RESET}  ${C_GREEN}Port 80, 8880, 8080${C_RESET}"
echo -e "  ${C_CYAN}• BadVPN UDPGW:${C_RESET}         ${C_GREEN}Port 7300${C_RESET}"
echo ""
echo -e "${C_WHITE}Now refresh your Web Panel in browser (${C_CYAN}http://$(curl -s4 --max-time 3 https://api.ipify.org || echo "VPS-IP"):54321${C_WHITE}) to see all green Active indicators!${C_RESET}"
echo ""
