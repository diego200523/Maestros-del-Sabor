-- ══════════════════════════════════════════════════════════════════
-- ACTUALIZACIÓN INCREMENTAL #2 — ejecuta esto en SSMS.
-- No borra nada de lo que ya tienes.
-- Agrega: invalidación de sesiones al resetear contraseña + registro de auditoría.
-- ══════════════════════════════════════════════════════════════════

USE maestros_del_sabor;
GO

-- ── Versión de sesión: permite invalidar tokens viejos cuando se
-- restablece la contraseña (aunque el token no haya expirado todavía) ──
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('usuarios') AND name = 'token_version')
BEGIN
    ALTER TABLE usuarios ADD token_version INT NOT NULL DEFAULT 1;
END
GO

-- ── Registro de auditoría: quién hizo qué y cuándo ──────────────────
IF OBJECT_ID('audit_log', 'U') IS NULL
BEGIN
    CREATE TABLE audit_log (
        id INT IDENTITY(1,1) PRIMARY KEY,
        id_usuario INT NULL,
        correo VARCHAR(150) NULL,
        accion VARCHAR(100) NOT NULL,
        detalle VARCHAR(500) NULL,
        ip VARCHAR(50) NULL,
        creado_en DATETIME NOT NULL DEFAULT GETDATE()
    );
END
GO

PRINT '✅ Base de datos actualizada correctamente (seguridad reforzada).';
