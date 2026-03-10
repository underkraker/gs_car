#!/usr/bin/env bash
set -euo pipefail

# Uso:
# sudo bash setup_vps.sh \
#   --repo https://github.com/tuusuario/turepo.git \
#   --domain tudominio.com \
#   --admin-pass "tu_password_segura"

REPO_URL=""
DOMAIN=""
ADMIN_PASS=""
APP_DIR="/var/www/gscling"
APP_USER="${SUDO_USER:-root}"
PORT="3000"
CHROME_BIN="/usr/bin/google-chrome"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_URL="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --admin-pass) ADMIN_PASS="${2:-}"; shift 2 ;;
    --app-dir) APP_DIR="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    *) echo "Parametro no reconocido: $1"; exit 1 ;;
  esac
done

if [[ -z "$REPO_URL" ]]; then
  echo "Falta --repo"
  exit 1
fi

if [[ -z "$ADMIN_PASS" ]]; then
  echo "Falta --admin-pass"
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Ejecuta como root o con sudo."
  exit 1
fi

echo "==> Instalando paquetes base..."
apt update -y
apt upgrade -y
apt install -y nginx git curl wget build-essential ca-certificates gnupg

echo "==> Instalando Node.js 20..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

echo "==> Instalando PM2..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm i -g pm2
fi

echo "==> Instalando Google Chrome (para whatsapp-web.js)..."
if [[ ! -x "$CHROME_BIN" ]]; then
  wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt install -y /tmp/chrome.deb || apt --fix-broken install -y
fi

echo "==> Preparando app en $APP_DIR ..."
mkdir -p "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" pull
else
  rm -rf "$APP_DIR"
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> Instalando dependencias npm..."
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm install"

echo "==> Creando .env ..."
if [[ ! -f "$APP_DIR/.env" ]]; then
  cat > "$APP_DIR/.env" <<EOF
PORT=$PORT
ADMIN_PASSWORD=$ADMIN_PASS
CHROME_BIN=$CHROME_BIN
EOF
else
  sed -i "s/^PORT=.*/PORT=$PORT/" "$APP_DIR/.env" || true
  if grep -q "^ADMIN_PASSWORD=" "$APP_DIR/.env"; then
    sed -i "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$ADMIN_PASS/" "$APP_DIR/.env"
  else
    printf "\nADMIN_PASSWORD=%s\n" "$ADMIN_PASS" >> "$APP_DIR/.env"
  fi
  if grep -q "^CHROME_BIN=" "$APP_DIR/.env"; then
    sed -i "s#^CHROME_BIN=.*#CHROME_BIN=$CHROME_BIN#" "$APP_DIR/.env"
  else
    printf "CHROME_BIN=%s\n" "$CHROME_BIN" >> "$APP_DIR/.env"
  fi
fi

echo "==> Levantando app con PM2..."
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && set -a && source .env && set +a && pm2 delete gscling >/dev/null 2>&1 || true && pm2 start server.js --name gscling --update-env && pm2 save"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/tmp/pm2_startup_cmd.txt 2>/dev/null || true
if [[ -s /tmp/pm2_startup_cmd.txt ]]; then
  bash /tmp/pm2_startup_cmd.txt || true
fi

echo "==> Configurando Nginx..."
SERVER_NAME="${DOMAIN:-_}"
cat > /etc/nginx/sites-available/gscling <<EOF
server {
    listen 80;
    server_name $SERVER_NAME;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/gscling /etc/nginx/sites-enabled/gscling
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

if [[ -n "${DOMAIN}" ]]; then
  echo "==> Instalando SSL con Let's Encrypt..."
  apt install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || true
fi

echo "==> Listo."
echo "URL: http://${DOMAIN:-IP_DE_TU_VPS}"
echo "Estado app:"
sudo -u "$APP_USER" pm2 status
echo "Logs:"
echo "sudo -u $APP_USER pm2 logs gscling"
