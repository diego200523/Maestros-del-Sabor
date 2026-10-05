-- ══════════════════════════════════════════════════════════════════
-- ACTUALIZACIÓN INCREMENTAL — ejecuta esto en SSMS.
-- No borra nada de lo que ya tienes (usuarios, productos, pedidos).
-- Agrega: columnas para recuperar contraseña + tabla de chat.
-- ══════════════════════════════════════════════════════════════════

USE maestros_del_sabor;
GO

-- ── Columnas para "olvidé mi contraseña" ────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usuarios') AND name = 'reset_token')
BEGIN
    ALTER TABLE usuarios ADD reset_token VARCHAR(255) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usuarios') AND name = 'reset_token_expira')
BEGIN
    ALTER TABLE usuarios ADD reset_token_expira DATETIME NULL;
END
GO

-- ── Tabla de chat cliente ↔ admin ────────────────────────────────────
IF OBJECT_ID('mensajes_chat', 'U') IS NULL
BEGIN
    CREATE TABLE mensajes_chat (
        id INT IDENTITY(1,1) PRIMARY KEY,
        id_usuario INT NOT NULL,
        remitente VARCHAR(10) NOT NULL CHECK (remitente IN ('cliente', 'admin')),
        mensaje VARCHAR(MAX) NOT NULL,
        leido BIT NOT NULL DEFAULT 0,
        creado_en DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_chat_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
    );
END
GO

-- ── Ya no se usa la tabla vieja de contacto de una sola vía ─────────
-- (opcional: bórrala si ya no la necesitas, tus mensajes ahora viven en mensajes_chat)
IF OBJECT_ID('mensajes_contacto', 'U') IS NOT NULL DROP TABLE mensajes_contacto;
GO

PRINT '✅ Base de datos actualizada correctamente.';
