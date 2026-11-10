DROP TABLE "codigos_acceso" CASCADE;--> statement-breakpoint
-- Datos que ya existían: cada dueño queda como dueño de las unidades de su empresa
INSERT INTO "propietarios" ("usuario_id", "unidad_id")
SELECT u."id", n."id" FROM "usuarios" u JOIN "unidades" n ON n."cuenta_id" = u."cuenta_id" WHERE u."rol" = 'dueno'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Vehículo de cada mantenimiento: el cabezal mismo o el que tiene enganchado el tanquero
UPDATE "mantenimientos" m SET "vehiculo_id" = COALESCE(
  (SELECT n."id" FROM "unidades" n WHERE n."id" = m."unidad_id" AND n."rol" = 'cabezal'),
  (SELECT a."cabezal_id" FROM "acoplamientos" a WHERE a."remolque_id" = m."unidad_id" AND a."hasta" IS NULL LIMIT 1)
) WHERE m."unidad_id" IS NOT NULL;--> statement-breakpoint
UPDATE "reportes" r SET "vehiculo_id" = (
  SELECT m."vehiculo_id" FROM "mantenimientos" m WHERE m."reporte_id" = r."id" AND m."vehiculo_id" IS NOT NULL LIMIT 1
) WHERE r."vehiculo_id" IS NULL;--> statement-breakpoint
UPDATE "unidades" SET "tipo" = 'tanquero' WHERE "rol" = 'remolque' AND "tipo" <> 'tanquero';
