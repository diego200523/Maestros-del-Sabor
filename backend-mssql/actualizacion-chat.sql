-- ══════════════════════════════════════════════════════════════════
-- ACTUALIZACIÓN de la base de datos (no borra tus datos existentes)
-- Ejecuta este script completo en SSMS.
-- Agrega: recuperación de contraseña + chat cliente-admin.
-- ══════════════════════════════════════════════════════════════════

USE maestros_del_sabor;
GO

-- Agrega los campos de "olvidé mi contraseña" a la tabla de usuarios,
-- solo si todavía no existen (para poder correr este script más de una vez sin error).
IF COL_LENGTH('usuarios', 'reset_token') IS NULL
    ALTER TABLE usuarios ADD reset_token VARCHAR(255) NULL;
GO

IF COL_LENGTH('usuarios', 'reset_token_expira') IS NULL
    ALTER TABLE usuarios ADD reset_token_expira DATETIME NULL;
GO

-- Elimina la tabla vieja de mensajes de contacto (de una sola vía)
IF OBJECT_ID('mensajes_contacto', 'U') IS NOT NULL DROP TABLE mensajes_contacto;
GO

-- Crea la tabla de chat (conversación continua cliente-admin)
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

PRINT 'Actualización completada correctamente.';
