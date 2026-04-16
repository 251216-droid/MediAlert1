-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Agregar columna fcm_token a la tabla usuarios
-- Ejecuta este script UNA SOLA VEZ en tu MySQL antes de arrancar la API.
--
-- En MySQL Workbench o terminal:
--   USE medialert_db;
--   SOURCE /ruta/a/migracion_fcm.sql;
-- ─────────────────────────────────────────────────────────────────────────────

USE medialert_db;

ALTER TABLE usuarios
    ADD COLUMN fcm_token VARCHAR(255) DEFAULT NULL
    COMMENT 'Token de Firebase Cloud Messaging para notificaciones push';

-- Verificar que se agregó correctamente
DESCRIBE usuarios;
