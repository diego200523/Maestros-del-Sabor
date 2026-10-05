-- ══════════════════════════════════════════════════════════════════
-- Base de datos: Maestros del Sabor (SQL Server)
-- Abre este script en SQL Server Management Studio y ejecútalo
-- completo con el botón "Execute" (o F5).
-- ══════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'maestros_del_sabor')
BEGIN
    CREATE DATABASE maestros_del_sabor;
END
GO

USE maestros_del_sabor;
GO

-- Borra las tablas en orden inverso a sus dependencias (primero las que
-- tienen FOREIGN KEY hacia otras, al final las que son referenciadas).
IF OBJECT_ID('detalle_pedido', 'U') IS NOT NULL DROP TABLE detalle_pedido;
IF OBJECT_ID('pedidos', 'U') IS NOT NULL DROP TABLE pedidos;
IF OBJECT_ID('productos', 'U') IS NOT NULL DROP TABLE productos;
IF OBJECT_ID('usuarios', 'U') IS NOT NULL DROP TABLE usuarios;
GO

-- ── Usuarios (clientes y administradores) ────────────────────────────
CREATE TABLE usuarios (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    contrasena VARCHAR(255) NOT NULL,        -- se guarda encriptada (bcrypt)
    telefono VARCHAR(30) NULL,
    direccion VARCHAR(255) NULL,
    rol VARCHAR(10) NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'admin')),
    reset_token VARCHAR(255) NULL,            -- para "olvidé mi contraseña"
    reset_token_expira DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ── Productos ─────────────────────────────────────────────────────────
CREATE TABLE productos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(MAX) NULL,
    categoria VARCHAR(20) NOT NULL DEFAULT 'embutidos' CHECK (categoria IN ('embutidos', 'otros')),
    precio DECIMAL(10,2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    imagen_url VARCHAR(500) NULL,
    creado_en DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ── Pedidos ───────────────────────────────────────────────────────────
CREATE TABLE pedidos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NOT NULL,
    direccion_entrega VARCHAR(255) NOT NULL,
    estado VARCHAR(15) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'en proceso', 'entregado', 'cancelado')),
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_pedidos_usuarios FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
);
GO

-- ── Detalle de cada pedido (qué productos y cuántos) ────────────────
CREATE TABLE detalle_pedido (
    id INT IDENTITY(1,1) PRIMARY KEY,
    id_pedido INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_detalle_pedido FOREIGN KEY (id_pedido) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT FK_detalle_producto FOREIGN KEY (id_producto) REFERENCES productos(id)
);
GO

-- ── Chat: conversación continua entre cada cliente y el administrador ──
IF OBJECT_ID('mensajes_chat', 'U') IS NOT NULL DROP TABLE mensajes_chat;
CREATE TABLE mensajes_chat (
    id INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NOT NULL,               -- el cliente dueño de la conversación
    remitente VARCHAR(10) NOT NULL CHECK (remitente IN ('cliente', 'admin')),
    mensaje VARCHAR(MAX) NOT NULL,
    leido BIT NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_chat_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
);
GO

-- ── Datos de ejemplo (opcional, para probar) ────────────────────────
INSERT INTO productos (nombre, descripcion, categoria, precio, stock, imagen_url) VALUES
('Chorizo Marinado Especial', 'Chorizo artesanal con marinado secreto de especias y hierbas finas.', 'embutidos', 85.00, 24, 'https://images.unsplash.com/photo-1612203776846-d319091f43b4?w=400&h=300&fit=crop&auto=format'),
('Salchicha Ahumada Premium', 'Salchicha ahumada en leña con marinado de ajo y pimentón dulce.', 'embutidos', 72.00, 15, 'https://images.unsplash.com/photo-1529241160658-a8a2a0d86620?w=400&h=300&fit=crop&auto=format'),
('Longaniza Artesanal', 'Longaniza tradicional con marinado de chipotle y comino tostado.', 'embutidos', 65.00, 30, 'https://images.unsplash.com/photo-1460122109654-7e46ab4fc9b9?w=400&h=300&fit=crop&auto=format'),
('Tabla Charcutera Mixta', 'Selección de embutidos marinados con quesos y acompañamientos.', 'otros', 220.00, 8, 'https://images.unsplash.com/photo-1758972573607-509448e9f3e4?w=400&h=300&fit=crop&auto=format'),
('Jamón Serrano Marinado', 'Jamón curado con marinado de vino tinto y romero fresco.', 'embutidos', 130.00, 0, 'https://images.unsplash.com/photo-1700486338138-5cc21dae205a?w=400&h=300&fit=crop&auto=format'),
('Salsa Marinada Artesanal 250g', 'Salsa secreta de la casa, ideal para acompañar todos los embutidos.', 'otros', 45.00, 42, 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400&h=300&fit=crop&auto=format');
GO

-- Nota: el usuario administrador NO se inserta aquí por seguridad.
-- Regístrate primero desde la página web y luego usa "npm run create-admin -- correo@ejemplo.com"
-- para convertir esa cuenta en administrador.
