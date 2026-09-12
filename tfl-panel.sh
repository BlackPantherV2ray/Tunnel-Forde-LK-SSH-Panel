#!/usr/bin/env bash
# ==============================================================================
# Tunnel Forde LK - CLI Management Utility
# ==============================================================================

SERVICE_NAME="tunnel-forde-lk"
APP_DIR="/opt/tunnel-forde-lk"

# Colors
C_RESET='\e[0m'
C_CYAN='\e[38;5;51m'
C_GREEN='\e[38;5;82m'
C_RED='\e[38;5;196m'
C_YELLOW='\e[38;5;220m'
C_WHITE='\e[1;37m'
C_MUTED='\e[38;5;244m'

banner() {
    clear
    echo -e "${C_CYAN}======================================================================${C_RESET}"
    echo -e "${C_WHITE}            ⚡ TUNNEL FORDE LK - WEB PANEL MANAGER ⚡                 ${C_RESET}"
    echo -e "${C_MUTED}       Next-Gen SSH, Dropbear & WebSocket Web Management              ${C_RESET}"
    echo -e "${C_MUTED}       Official Support: ${C_CYAN}https://t.me/Black_Panther_V2ray${C_RESET} (${C_WHITE}@Black_Panther_V2ray${C_RESET})"
    echo -e "${C_CYAN}======================================================================${C_RESET}"
    echo ""
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${C_RED}Error: This script must be run as root (sudo tfl-panel)${C_RESET}"
        exit 1
    fi
}

start_panel() {
    echo -e "${C_YELLOW}Starting Tunnel Forde LK Panel...${C_RESET}"
    systemctl start "$SERVICE_NAME"
    sleep 1
    status_panel
}

stop_panel() {
    echo -e "${C_YELLOW}Stopping Tunnel Forde LK Panel...${C_RESET}"
    systemctl stop "$SERVICE_NAME"
    echo -e "${C_RED}Panel stopped.${C_RESET}"
}

restart_panel() {
    echo -e "${C_YELLOW}Restarting Tunnel Forde LK Panel...${C_RESET}"
    systemctl restart "$SERVICE_NAME"
    sleep 1
    status_panel
}

status_panel() {
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo -e "${C_GREEN}● Tunnel Forde LK Panel is RUNNING (Active)${C_RESET}"
        local IP
        IP=$(curl -s4 --max-time 3 https://api.ipify.org || echo "YOUR-SERVER-IP")
        local PORT
        PORT=$(grep -o '"panelPort": [0-9]*' "${APP_DIR}/data/tfl_panel.json" 2>/dev/null | awk '{print $2}')
        PORT=${PORT:-54321}
        echo -e "${C_WHITE}Web Dashboard URL:${C_RESET} ${C_CYAN}http://${IP}:${PORT}${C_RESET}"
    else
        echo -e "${C_RED}● Tunnel Forde LK Panel is STOPPED (Inactive)${C_RESET}"
    fi
}

change_admin_credentials() {
    echo -e "${C_YELLOW}Change Panel Admin Username & Password${C_RESET}"

    local CUR_USER
    CUR_USER=$(node -e "
    const fs = require('fs');
    try {
        const d = JSON.parse(fs.readFileSync('${APP_DIR}/data/tfl_panel.json', 'utf8'));
        console.log(d.settings.adminUser || 'admin');
    } catch(e) { console.log('admin'); }
    " 2>/dev/null || echo "admin")

    echo -e "${C_WHITE}Current Admin Username:${C_RESET} ${C_CYAN}${CUR_USER}${C_RESET}"
    read -rp "Enter new admin username (press Enter to keep '${CUR_USER}'): " NEW_USER
    NEW_USER=${NEW_USER:-"$CUR_USER"}

    read -rp "Enter new admin password (leave empty to keep current password): " NEW_PASS

    if [[ "$NEW_USER" == "$CUR_USER" && -z "$NEW_PASS" ]]; then
        echo -e "${C_YELLOW}No changes made.${C_RESET}"
        return
    fi

    node -e "
    const fs = require('fs');
    const crypto = require('crypto');
    const path = '${APP_DIR}/data/tfl_panel.json';
    try {
        const d = JSON.parse(fs.readFileSync(path, 'utf8'));
        d.settings = d.settings || {};
        if ('$NEW_USER') d.settings.adminUser = '$NEW_USER';
        if ('$NEW_PASS') {
            d.settings.adminPassHash = crypto.createHash('sha256').update('$NEW_PASS').digest('hex');
        }
        fs.writeFileSync(path, JSON.stringify(d, null, 2));
        console.log('SUCCESS');
    } catch(e) {
        console.error('Error updating config:', e.message);
    }
    "
    systemctl restart "$SERVICE_NAME"
    echo -e "${C_GREEN}✔ Admin credentials updated and panel restarted!${C_RESET}"
    echo -e "  ${C_CYAN}New Username:${C_RESET} ${C_WHITE}${NEW_USER}${C_RESET}"
    if [[ -n "$NEW_PASS" ]]; then
        echo -e "  ${C_CYAN}New Password:${C_RESET} ${C_WHITE}${NEW_PASS}${C_RESET}"
    else
        echo -e "  ${C_CYAN}Password:${C_RESET}     ${C_MUTED}(Unchanged)${C_RESET}"
    fi
}

configure_ssl() {
    echo -e "${C_YELLOW}Configure Custom Domain & SSL (Let's Encrypt)${C_RESET}"
    read -rp "Enter your domain name (e.g. vpn.tunnel-forde.lk): " DOMAIN_NAME
    DOMAIN_NAME=$(echo "$DOMAIN_NAME" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
    if [[ -z "$DOMAIN_NAME" ]]; then
        echo -e "${C_RED}Domain name cannot be empty!${C_RESET}"
        return
    fi

    local PUBLIC_IP
    PUBLIC_IP=$(curl -s4 --max-time 4 https://api.ipify.org || curl -s4 --max-time 4 https://ifconfig.me/ip || hostname -I | awk '{print $1}')
    echo -e "${C_CYAN}Verifying DNS pointing for ${DOMAIN_NAME}...${C_RESET}"
    local RESOLVED_IP
    RESOLVED_IP=$(ping -c 1 "$DOMAIN_NAME" 2>/dev/null | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n1 || getent ahosts "$DOMAIN_NAME" 2>/dev/null | awk '{print $1}' | head -n1 || true)

    if [[ -n "$RESOLVED_IP" && "$RESOLVED_IP" == "$PUBLIC_IP" ]]; then
        echo -e "${C_GREEN}✔ DNS Verified: ${DOMAIN_NAME} points to this server (${PUBLIC_IP}).${C_RESET}"
        read -rp "Enter email for Let's Encrypt notices (press Enter to skip): " SSL_EMAIL
        SSL_EMAIL=${SSL_EMAIL:-"admin@${DOMAIN_NAME}"}

        apt-get install -y certbot >/dev/null 2>&1 || true
        systemctl stop nginx ws-dropbear 2>/dev/null || true

        if certbot certonly --standalone --agree-tos --non-interactive -m "$SSL_EMAIL" -d "$DOMAIN_NAME" --preferred-challenges http; then
            mkdir -p "${APP_DIR}/certs"
            cp "/etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem" "${APP_DIR}/certs/"
            cp "/etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem" "${APP_DIR}/certs/"

            if [[ -d "/etc/stunnel" ]]; then
                cat "${APP_DIR}/certs/privkey.pem" "${APP_DIR}/certs/fullchain.pem" > /etc/stunnel/stunnel.pem
                systemctl restart stunnel4 2>/dev/null || true
            fi

            (crontab -l 2>/dev/null | grep -v 'certbot renew'; echo "0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/${DOMAIN_NAME}/*.pem ${APP_DIR}/certs/ && systemctl restart ${SERVICE_NAME}") | crontab -

            node -e "
            const fs = require('fs');
            const path = '${APP_DIR}/data/tfl_panel.json';
            try {
                let d = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : { settings: {} };
                d.settings = d.settings || {};
                d.settings.sslDomain = '${DOMAIN_NAME}';
                d.settings.enableHttps = true;
                fs.writeFileSync(path, JSON.stringify(d, null, 2));
            } catch(e) {}
            " 2>/dev/null || true

            systemctl restart "$SERVICE_NAME"
            echo -e "${C_GREEN}✔ SSL Certificate successfully installed!${C_RESET}"
            echo -e "${C_WHITE}Access panel at:${C_RESET} ${C_GREEN}https://${DOMAIN_NAME}:54321${C_RESET}"
        else
            echo -e "${C_RED}Certbot failed to issue certificate. Ensure port 80 is not blocked.${C_RESET}"
        fi
        systemctl start nginx ws-dropbear 2>/dev/null || true
    else
        echo -e "${C_RED}DNS Error: ${DOMAIN_NAME} points to '${RESOLVED_IP}', but this VPS is '${PUBLIC_IP}'.${C_RESET}"
        echo -e "${C_YELLOW}Please add an A-Record for ${DOMAIN_NAME} pointing to ${PUBLIC_IP} in your Cloudflare/DNS panel.${C_RESET}"
    fi
}

view_logs() {
    echo -e "${C_CYAN}Press Ctrl+C to exit logs view...${C_RESET}"
    journalctl -u "$SERVICE_NAME" -f -n 50
}

uninstall_panel() {
    echo -e "${C_RED}WARNING: This will completely remove Tunnel Forde LK Web Panel!${C_RESET}"
    read -rp "Are you sure you want to uninstall? (y/n): " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
        systemctl daemon-reload
        rm -rf "$APP_DIR"
        rm -f "/usr/bin/tfl-panel"
        echo -e "${C_GREEN}Tunnel Forde LK Panel has been successfully uninstalled.${C_RESET}"
        exit 0
    else
        echo -e "${C_YELLOW}Uninstall cancelled.${C_RESET}"
    fi
}

main_menu() {
    check_root
    while true; do
        banner
        status_panel
        echo ""
        echo -e "${C_WHITE}Management Options:${C_RESET}"
        echo -e "  ${C_CYAN}1)${C_RESET} Start Panel"
        echo -e "  ${C_CYAN}2)${C_RESET} Stop Panel"
        echo -e "  ${C_CYAN}3)${C_RESET} Restart Panel"
        echo -e "  ${C_CYAN}4)${C_RESET} Check Status & Login URL"
        echo -e "  ${C_CYAN}5)${C_RESET} Change Admin Username & Password"
        echo -e "  ${C_CYAN}6)${C_RESET} Configure Custom Domain & SSL (Let's Encrypt)"
        echo -e "  ${C_CYAN}7)${C_RESET} View Live Logs"
        echo -e "  ${C_CYAN}8)${C_RESET} Uninstall Panel"
        echo -e "  ${C_RED}0)${C_RESET} Exit"
        echo ""
        read -rp "Select an option [0-8]: " OPTION

        case "$OPTION" in
            1) start_panel; read -rp "Press Enter to continue..." ;;
            2) stop_panel; read -rp "Press Enter to continue..." ;;
            3) restart_panel; read -rp "Press Enter to continue..." ;;
            4) status_panel; read -rp "Press Enter to continue..." ;;
            5) change_admin_credentials; read -rp "Press Enter to continue..." ;;
            6) configure_ssl; read -rp "Press Enter to continue..." ;;
            7) view_logs ;;
            8) uninstall_panel ;;
            0) exit 0 ;;
            *) echo -e "${C_RED}Invalid option!${C_RESET}"; sleep 1 ;;
        esac
    done
}

# Handle command line arguments directly (e.g. tfl-panel restart)
if [[ $# -gt 0 ]]; then
    check_root
    case "$1" in
        start) start_panel ;;
        stop) stop_panel ;;
        restart) restart_panel ;;
        status) status_panel ;;
        reset-admin|change-admin) change_admin_credentials ;;
        ssl) configure_ssl ;;
        logs) view_logs ;;
        uninstall) uninstall_panel ;;
        *) echo "Usage: tfl-panel {start|stop|restart|status|reset-admin|ssl|logs|uninstall}" ;;
    esac
else
    main_menu
fi
