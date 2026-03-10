# Deploy VPS (Ubuntu)

## 1) Instalar dependencias del sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 2) Instalar Chrome para whatsapp-web.js

```bash
wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y /tmp/chrome.deb || sudo apt --fix-broken install -y
```

## 3) Subir proyecto y dependencias

```bash
git clone <tu-repo> /var/www/gscling
cd /var/www/gscling
npm install
cp .env.example .env
```

Edita `.env` y cambia al menos:

```env
PORT=3000
ADMIN_PASSWORD=TU_PASSWORD_SEGURA
CHROME_BIN=/usr/bin/google-chrome
```

## 4) Ejecutar con PM2

```bash
cd /var/www/gscling
source .env && pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

## 5) Nginx reverse proxy

Crea `/etc/nginx/sites-available/gscling` con:

```nginx
server {
    listen 80;
    server_name TU_DOMINIO_O_IP;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activa y recarga:

```bash
sudo ln -s /etc/nginx/sites-available/gscling /etc/nginx/sites-enabled/gscling
sudo nginx -t
sudo systemctl reload nginx
```

## 6) SSL gratis (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d TU_DOMINIO
```

## 7) Logs utiles

```bash
pm2 logs gscling
pm2 status
sudo systemctl status nginx
```

## Nota importante

- Para que WhatsApp quede vinculado, escanea QR una vez en el VPS.
- La sesion se guarda en `.wwebjs_auth/`.
- Si mueves o borras esa carpeta, volvera a pedir QR.
