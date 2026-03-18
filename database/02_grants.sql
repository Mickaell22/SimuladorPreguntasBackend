-- =============================================
-- GRANTS: permisos sobre tablas ya creadas
-- Se ejecuta despues de 01_schema.sql
-- =============================================

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA simulador TO simulador_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA simulador TO simulador_app;
