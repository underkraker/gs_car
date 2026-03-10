CREATE DATABASE gs_car_detail;
USE gs_car_detail;

CREATE TABLE servicios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(50), precio_sedan DECIMAL(10,2), precio_camioneta DECIMAL(10,2));
INSERT INTO servicios (nombre, precio_sedan, precio_camioneta) VALUES ('Lavado Clásico', 250, 300), ('Detallado Básico', 400, 500), ('Premium', 1200, 1500);

CREATE TABLE configuracion (id INT PRIMARY KEY, telefono_personal VARCHAR(20), telefono_local VARCHAR(20));
INSERT INTO configuracion (id, telefono_personal, telefono_local) VALUES (1, '529833211710', '529833211710');

CREATE TABLE citas (id INT AUTO_INCREMENT PRIMARY KEY, nombre_cliente VARCHAR(100), telefono VARCHAR(20), modelo_auto VARCHAR(50), servicio VARCHAR(50), fecha_cita DATE, hora_cita TIME, recordatorio_24h TINYINT(1) DEFAULT 0, recordatorio_1h TINYINT(1) DEFAULT 0);