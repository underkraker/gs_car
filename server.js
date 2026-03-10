const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// --- PROTECCION DE PROCESO (WhatsApp/Puppeteer) ---
const isTargetCloseError = (err) =>
    err?.name === 'TargetCloseError' ||
    err?.message?.includes('Target closed') ||
    err?.message?.includes('Runtime.callFunctionOn');

process.on('unhandledRejection', (reason) => {
    if (isTargetCloseError(reason)) {
        console.error('⚠️ Promise rechazada por cierre de Puppeteer/WhatsApp. Se mantiene el servidor activo.');
        return;
    }
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    if (isTargetCloseError(err)) {
        console.error('⚠️ Excepción controlada por cierre de Puppeteer/WhatsApp. Se mantiene el servidor activo.');
        return;
    }
    console.error('❌ Uncaught Exception fatal:', err);
    process.exit(1);
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "darkwolf";

// --- CLIENTE WHATSAPP ---
const puppeteerConfig = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
if (process.env.CHROME_BIN) {
    puppeteerConfig.executablePath = process.env.CHROME_BIN;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
});

// --- ESTADO WHATSAPP ---
let whatsappQR = null;
let whatsappReady = false;

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    QRCode.toDataURL(qr, { width: 280 }, (err, url) => {
        if (!err) whatsappQR = url;
    });
    whatsappReady = false;
});
client.on('ready', () => {
    console.log('✅ WhatsApp Conectado.');
    whatsappQR = null;
    whatsappReady = true;
});
client.on('disconnected', () => {
    console.log('❌ WhatsApp Desconectado.');
    whatsappReady = false;
    whatsappQR = null;

    // Reintenta inicializar para forzar nuevo QR
    setTimeout(() => {
        initializeWhatsApp();
    }, 1500);
});

const initializeWhatsApp = () => {
    client.initialize().catch((err) => {
        console.error('Error inicializando WhatsApp:', err);
    });
};

initializeWhatsApp();

// --- DB CONNECTION ---
const db = new sqlite3.Database('./gs_car_detail.sqlite', (err) => {
    if (err) console.error('Error opening database', err);
    else {
        console.log('✅ Base de datos SQLite conectada.');
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS servicios (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, precio_sedan REAL, precio_camioneta REAL)`);
            db.run(`CREATE TABLE IF NOT EXISTS configuracion (id INTEGER PRIMARY KEY, telefono_personal TEXT, telefono_local TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS citas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre_cliente TEXT, telefono TEXT, modelo_auto TEXT, servicio TEXT, fecha_cita TEXT, hora_cita TEXT, recordatorio_24h INTEGER DEFAULT 0, recordatorio_1h INTEGER DEFAULT 0)`);
            db.run(`CREATE TABLE IF NOT EXISTS comentarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT,
                comentario TEXT,
                fecha_creacion TEXT DEFAULT (datetime('now', 'localtime'))
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS media_config (
                id INTEGER PRIMARY KEY,
                logo_path TEXT,
                gallery_1 TEXT,
                gallery_2 TEXT,
                gallery_3 TEXT,
                gallery_4 TEXT,
                gallery_5 TEXT,
                gallery_6 TEXT
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS promociones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT,
                descripcion TEXT,
                precio_especial REAL,
                descuento_porcentaje REAL,
                codigo TEXT,
                activa INTEGER DEFAULT 1,
                fecha_creacion TEXT DEFAULT (datetime('now', 'localtime'))
            )`);
            
            db.get("SELECT COUNT(*) AS count FROM servicios", (err, row) => {
                if (row && row.count === 0) {
                    const stmt = db.prepare("INSERT INTO servicios (nombre, precio_sedan, precio_camioneta) VALUES (?, ?, ?)");
                    stmt.run('Lavado Clásico', 250, 300);
                    stmt.run('Detallado Básico', 400, 500);
                    stmt.run('Premium', 1200, 1500);
                    stmt.finalize();
                }
            });
            db.all("PRAGMA table_info(servicios)", (err, cols) => {
                if (err) return;
                const hasIncluye = Array.isArray(cols) && cols.some(c => c.name === 'incluye');
                const hasPromo = Array.isArray(cols) && cols.some(c => c.name === 'es_promocion');
                if (!hasIncluye) {
                    db.run("ALTER TABLE servicios ADD COLUMN incluye TEXT DEFAULT ''");
                }
                if (!hasPromo) {
                    db.run("ALTER TABLE servicios ADD COLUMN es_promocion INTEGER DEFAULT 0");
                }
            });
            db.get("SELECT COUNT(*) AS count FROM configuracion", (err, row) => {
                if (row && row.count === 0) {
                    db.run("INSERT INTO configuracion (id, telefono_personal, telefono_local) VALUES (1, '529833211710', '529833211710')");
                }
            });
            db.get("SELECT COUNT(*) AS count FROM media_config", (err, row) => {
                if (row && row.count === 0) {
                    db.run(
                        `INSERT INTO media_config (id, logo_path, gallery_1, gallery_2, gallery_3, gallery_4, gallery_5, gallery_6)
                         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            '43791.jpg',
                            'https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&w=1200&q=80',
                            'https://images.unsplash.com/photo-1485291571150-772bcfc10da5?auto=format&fit=crop&w=1200&q=80',
                            'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
                            'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80',
                            'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1200&q=80',
                            'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80'
                        ]
                    );
                }
            });
        });
    }
});

const saveBase64Image = (dataUrl, prefix) => {
    const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return null;

    const mime = match[1];
    const base64Data = match[2];
    let ext = 'png';
    if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('webp')) ext = 'webp';

    const fileName = `${prefix}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    return `uploads/${fileName}`;
};

// --- MIDDLEWARE AUTH ---
const checkAuth = (req, res, next) => {
    const password = req.headers['x-admin-password'];
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

// --- CRON JOB: RECORDATORIOS ---
cron.schedule('0 * * * *', () => {
    db.get('SELECT * FROM configuracion WHERE id = 1', (err, config) => {
        if (err || !config) {
            console.error("Error al obtener config en Cron:", err);
            return;
        }
        const miNum = config.telefono_personal;
        
        // 24 Horas Antes
        db.all("SELECT * FROM citas WHERE fecha_cita = date('now', '+1 day', 'localtime') AND recordatorio_24h = 0", (err, results) => {
            if (err) return console.error("Error Cron 24h:", err);
            results?.forEach(async (cita) => {
                try {
                    const msg = `Hola ${cita.nombre_cliente}, GS Car Detail te recuerda tu cita de mañana a las ${cita.hora_cita}.`;
                    await client.sendMessage(`${cita.telefono}@c.us`, msg);
                    await client.sendMessage(`${miNum}@c.us`, `⚠️ CITA MAÑANA: ${cita.nombre_cliente} - ${cita.hora_cita}`);
                    db.run('UPDATE citas SET recordatorio_24h = 1 WHERE id = ?', [cita.id]);
                } catch(e) { console.error("Error mandando msj 24h", e); }
            });
        });

        // 1 Hora Antes
        db.all("SELECT * FROM citas WHERE fecha_cita = date('now', 'localtime') AND substr(hora_cita, 1, 2) = strftime('%H', 'now', '+1 hour', 'localtime') AND recordatorio_1h = 0", (err, results) => {
            if (err) return console.error("Error Cron 1h:", err);
            results?.forEach(async (cita) => {
                try {
                    const msg = `¡Hola! Tu cita en GS Car Detail comienza en 1 hora.`;
                    await client.sendMessage(`${cita.telefono}@c.us`, msg);
                    await client.sendMessage(`${miNum}@c.us`, `⏰ EN 1 HORA: ${cita.nombre_cliente} llega al local.`);
                    db.run('UPDATE citas SET recordatorio_1h = 1 WHERE id = ?', [cita.id]);
                } catch(e) { console.error("Error mandando msj 1h", e); }
            });
        });
    });
});

// --- RUTAS API ---
app.post('/admin-login', (req, res) => {
    const { password } = req.body;
    res.json({ success: password === ADMIN_PASSWORD });
});

app.get('/obtener-paquetes', (req, res) => {
    db.all('SELECT * FROM servicios', (err, r) => {
        if(err) return res.status(500).json({error: "Database error"});
        res.json(r);
    });
});

app.get('/obtener-promociones', (req, res) => {
    db.all('SELECT * FROM promociones WHERE activa = 1 ORDER BY id DESC', (err, r) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(r);
    });
});

app.get('/admin-obtener-promociones', checkAuth, (req, res) => {
    db.all('SELECT * FROM promociones ORDER BY id DESC', (err, r) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(r);
    });
});

app.get('/obtener-comentarios', (req, res) => {
    db.all('SELECT * FROM comentarios ORDER BY id DESC LIMIT 50', (err, r) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(r);
    });
});

app.get('/obtener-media', (req, res) => {
    db.get('SELECT * FROM media_config WHERE id = 1', (err, r) => {
        if (err || !r) return res.status(500).json({ error: "Database error" });
        res.json(r);
    });
});

app.post('/agregar-comentario', (req, res) => {
    const { nombre, comentario } = req.body;
    if (!nombre || !comentario) return res.status(400).json({ error: "Datos incompletos" });

    db.run(
        'INSERT INTO comentarios (nombre, comentario) VALUES (?, ?)',
        [String(nombre).trim(), String(comentario).trim()],
        function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.post('/subir-logo', checkAuth, (req, res) => {
    const { imageData } = req.body;
    const savedPath = saveBase64Image(imageData, 'logo');
    if (!savedPath) return res.status(400).json({ error: "Imagen invalida" });

    db.run('UPDATE media_config SET logo_path = ? WHERE id = 1', [savedPath], (err) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ success: true, path: savedPath });
    });
});

app.post('/subir-galeria', checkAuth, (req, res) => {
    const { slot, imageData } = req.body;
    const slotNum = Number(slot);

    if (![1, 2, 3, 4, 5, 6].includes(slotNum)) {
        return res.status(400).json({ error: "Slot invalido" });
    }

    const savedPath = saveBase64Image(imageData, `galeria_${slotNum}`);
    if (!savedPath) return res.status(400).json({ error: "Imagen invalida" });

    const field = `gallery_${slotNum}`;
    db.run(`UPDATE media_config SET ${field} = ? WHERE id = 1`, [savedPath], (err) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ success: true, path: savedPath, slot: slotNum });
    });
});

app.post('/registrar-cita', (req, res) => {
    const { nombre, modelo, servicio, fecha, hora, telefono } = req.body;
    db.run('INSERT INTO citas (nombre_cliente, modelo_auto, servicio, fecha_cita, hora_cita, telefono) VALUES (?,?,?,?,?,?)', 
    [nombre, modelo, servicio, fecha, hora, telefono], (err) => {
        if(err) return res.status(500).json({error: "Database error"});
        
        // Obtenemos numeros de config:
        // - telefono_local para el enlace del front
        // - telefono_personal para notificar nueva cita al admin
        db.get('SELECT telefono_local, telefono_personal FROM configuracion WHERE id = 1', (errConf, conf) => {
            const telefonoLocal = (!errConf && conf?.telefono_local) ? conf.telefono_local : '529833211710';
            const telefonoPersonal = (!errConf && conf?.telefono_personal) ? conf.telefono_personal : null;

            res.json({ success: true, telefono_local: telefonoLocal });

            if (!telefonoPersonal) return;
            if (!whatsappReady) {
                console.log('⚠️ Cita registrada, pero WhatsApp no está conectado para enviar aviso al admin.');
                return;
            }

            const mensajeAdmin = [
                '📅 NUEVA CITA AGENDADA',
                `👤 Cliente: ${nombre}`,
                `📱 Teléfono: ${telefono}`,
                `🚗 Vehículo: ${modelo}`,
                `🧽 Servicio: ${servicio}`,
                `🗓️ Fecha: ${fecha}`,
                `⏰ Hora: ${hora}`
            ].join('\n');

            client.sendMessage(`${telefonoPersonal}@c.us`, mensajeAdmin)
                .catch((e) => console.error('Error enviando nueva cita al admin:', e));
        });
    });
});

app.get('/obtener-citas', checkAuth, (req, res) => {
    db.all('SELECT * FROM citas ORDER BY fecha_cita ASC, hora_cita ASC, id ASC', (err, r) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(r);
    });
});

app.post('/eliminar-cita', checkAuth, (req, res) => {
    const { id } = req.body;
    db.run('DELETE FROM citas WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        if (this.changes === 0) return res.status(404).json({ error: "Cita no encontrada" });
        res.sendStatus(200);
    });
});

app.post('/reagendar-cita', checkAuth, (req, res) => {
    const { id, nombre, telefono, modelo, servicio, fecha, hora } = req.body;
    db.run(
        `UPDATE citas 
         SET nombre_cliente = ?, telefono = ?, modelo_auto = ?, servicio = ?, fecha_cita = ?, hora_cita = ?, recordatorio_24h = 0, recordatorio_1h = 0
         WHERE id = ?`,
        [nombre, telefono, modelo, servicio, fecha, hora, id],
        function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            if (this.changes === 0) return res.status(404).json({ error: "Cita no encontrada" });
            res.sendStatus(200);
        }
    );
});

app.get('/obtener-config', (req, res) => {
    db.get('SELECT * FROM configuracion WHERE id = 1', (err, r) => {
        if(err || !r) return res.status(500).json({error: "Database error"});
        res.json(r);
    });
});

app.post('/actualizar-precio', checkAuth, (req, res) => {
    const { id, p_sedan, p_camioneta } = req.body;
    db.run('UPDATE servicios SET precio_sedan = ?, precio_camioneta = ? WHERE id = ?', [p_sedan, p_camioneta, id], (err) => {
         if(err) return res.status(500).json({error: "Database error"});
         res.sendStatus(200);
    });
});

app.post('/actualizar-paquete', checkAuth, (req, res) => {
    const { id, nombre, p_sedan, p_camioneta, incluye, es_promocion } = req.body;
    db.run(
        'UPDATE servicios SET nombre = ?, precio_sedan = ?, precio_camioneta = ?, incluye = ?, es_promocion = ? WHERE id = ?',
        [nombre, p_sedan, p_camioneta, incluye || '', es_promocion ? 1 : 0, id],
        function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            if (this.changes === 0) return res.status(404).json({ error: "Paquete no encontrado" });
            res.sendStatus(200);
        }
    );
});

app.post('/crear-paquete', checkAuth, (req, res) => {
    const { nombre, p_sedan, p_camioneta, incluye, es_promocion } = req.body;
    if (!nombre || String(nombre).trim().length < 2) {
        return res.status(400).json({ error: "Nombre invalido" });
    }

    db.run(
        'INSERT INTO servicios (nombre, precio_sedan, precio_camioneta, incluye, es_promocion) VALUES (?, ?, ?, ?, ?)',
        [
            String(nombre).trim(),
            Number(p_sedan) || 0,
            Number(p_camioneta) || 0,
            String(incluye || '').trim(),
            es_promocion ? 1 : 0
        ],
        function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.post('/eliminar-paquete', checkAuth, (req, res) => {
    const { id } = req.body;
    db.run('DELETE FROM servicios WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        if (this.changes === 0) return res.status(404).json({ error: "Paquete no encontrado" });
        res.sendStatus(200);
    });
});

app.post('/crear-promocion', checkAuth, (req, res) => {
    const { titulo, descripcion, precio_especial, descuento_porcentaje, codigo, activa } = req.body;
    if (!titulo || String(titulo).trim().length < 2) {
        return res.status(400).json({ error: 'Titulo invalido' });
    }

    const precioEspecial = precio_especial === '' || precio_especial == null ? null : Number(precio_especial);
    const descuento = descuento_porcentaje === '' || descuento_porcentaje == null ? null : Number(descuento_porcentaje);

    db.run(
        `INSERT INTO promociones (titulo, descripcion, precio_especial, descuento_porcentaje, codigo, activa)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            String(titulo).trim(),
            String(descripcion || '').trim(),
            Number.isFinite(precioEspecial) ? precioEspecial : null,
            Number.isFinite(descuento) ? descuento : null,
            String(codigo || '').trim(),
            activa === false ? 0 : 1
        ],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.post('/actualizar-promocion', checkAuth, (req, res) => {
    const { id, titulo, descripcion, precio_especial, descuento_porcentaje, codigo, activa } = req.body;
    if (!titulo || String(titulo).trim().length < 2) {
        return res.status(400).json({ error: 'Titulo invalido' });
    }

    const precioEspecial = precio_especial === '' || precio_especial == null ? null : Number(precio_especial);
    const descuento = descuento_porcentaje === '' || descuento_porcentaje == null ? null : Number(descuento_porcentaje);

    db.run(
        `UPDATE promociones
         SET titulo = ?, descripcion = ?, precio_especial = ?, descuento_porcentaje = ?, codigo = ?, activa = ?
         WHERE id = ?`,
        [
            String(titulo).trim(),
            String(descripcion || '').trim(),
            Number.isFinite(precioEspecial) ? precioEspecial : null,
            Number.isFinite(descuento) ? descuento : null,
            String(codigo || '').trim(),
            activa ? 1 : 0,
            id
        ],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Promocion no encontrada' });
            res.sendStatus(200);
        }
    );
});

app.post('/eliminar-promocion', checkAuth, (req, res) => {
    const { id } = req.body;
    db.run('DELETE FROM promociones WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ error: 'Promocion no encontrada' });
        res.sendStatus(200);
    });
});

app.post('/actualizar-config', checkAuth, (req, res) => {
    const { personal, local } = req.body;
    db.run('UPDATE configuracion SET telefono_personal = ?, telefono_local = ? WHERE id = 1', [personal, local], (err) => {
        if(err) return res.status(500).json({error: "Database error"});
        res.sendStatus(200);
    });
});

// --- WHATSAPP STATUS & LOGOUT ---
app.get('/whatsapp-status', checkAuth, (req, res) => {
    res.json({ connected: whatsappReady, qr: whatsappQR });
});

app.post('/whatsapp-logout', checkAuth, async (req, res) => {
    try {
        await client.logout();
        whatsappReady = false;
        whatsappQR = null;
        res.json({ success: true, message: 'Sesión cerrada. Regenerando QR...' });
    } catch(e) {
        console.error('Error al cerrar sesión WA:', e);
        res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/index.html', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/gs-manager-login.html', (req, res) => {
    res.sendFile(__dirname + '/gs-manager-login.html');
});

app.listen(PORT, () => console.log(`Servidor en Puerto ${PORT}`));
