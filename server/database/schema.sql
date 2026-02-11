-- ==========================================
-- SCHEMA PARA BOLETERA TEMPLO - MYSQL
-- ==========================================

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS boletera_templo 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE boletera_templo;

-- ==================== TABLA: rutas ====================
CREATE TABLE IF NOT EXISTS rutas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    origen VARCHAR(100) NOT NULL,
    destino VARCHAR(100) NOT NULL,
    paradas JSON,
    dias_operacion JSON,
    precio DECIMAL(10,2) NOT NULL,
    duracion_minutos INT DEFAULT 0,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_origen_destino (origen, destino),
    INDEX idx_activa (activa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== TABLA: viajes ====================
CREATE TABLE IF NOT EXISTS viajes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ruta_id INT NOT NULL,
    fecha_salida DATE NOT NULL,
    hora_salida TIME NOT NULL,
    asientos_totales INT DEFAULT 15,
    asientos_ocupados INT DEFAULT 0,
    precio DECIMAL(10,2) NOT NULL,
    estado ENUM('programado', 'en_curso', 'completado', 'cancelado') DEFAULT 'programado',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE,
    INDEX idx_fecha (fecha_salida),
    INDEX idx_ruta_fecha (ruta_id, fecha_salida),
    INDEX idx_estado (estado),
    CONSTRAINT chk_asientos CHECK (asientos_ocupados >= 0 AND asientos_ocupados <= asientos_totales)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== TABLA: reservas ====================
CREATE TABLE IF NOT EXISTS reservas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    viaje_id INT NOT NULL,
    codigo_visual VARCHAR(50) UNIQUE NOT NULL,
    cliente_nombre VARCHAR(200) NOT NULL,
    cliente_email VARCHAR(200) NOT NULL,
    cliente_telefono VARCHAR(20),
    precio_pagado DECIMAL(10,2) NOT NULL,
    validado BOOLEAN DEFAULT FALSE,
    firma_seguridad VARCHAR(500) NOT NULL,
    validado_por INT NULL,
    validado_en TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (viaje_id) REFERENCES viajes(id) ON DELETE CASCADE,
    INDEX idx_codigo (codigo_visual),
    INDEX idx_email (cliente_email),
    INDEX idx_telefono (cliente_telefono),
    INDEX idx_viaje (viaje_id),
    INDEX idx_validado (validado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== TABLA: usuarios (para admin) ====================
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('admin', 'chofer', 'scanner') DEFAULT 'admin',
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== DATOS DE PRUEBA ====================

-- Insertar ruta de ejemplo
INSERT INTO rutas (nombre, origen, destino, paradas, dias_operacion, precio, duracion_minutos) VALUES
('Chalco - Templo CDMX', 'Chalco', 'Templo', 
 JSON_ARRAY('Base Chalco', 'Plaza Cortijo', 'Metro Pantitlán', 'Templo CDMX'),
 JSON_ARRAY('Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'),
 150.00, 90
);

-- Crear usuario admin de prueba (password: admin123)
-- Hash generado con bcrypt para 'admin123'
INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES
('Administrador', 'admin@templo.com', '$2a$10$rE8KvZvOhH7L.uF1FvXFUO8wJqX9V4Y5h5J7F5w3e5j5g5h5i5k5l', 'admin');
