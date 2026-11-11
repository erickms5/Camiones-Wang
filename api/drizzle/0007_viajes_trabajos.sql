CREATE TABLE "lugares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"tipo" text,
	"usado_como_carga" boolean DEFAULT false NOT NULL,
	"usado_como_destino" boolean DEFAULT false NOT NULL,
	"veces_usado" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mantenimiento_trabajos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mantenimiento_id" uuid NOT NULL,
	"tipo_trabajo_id" text NOT NULL,
	"componente_id" uuid,
	"parte" text NOT NULL,
	"trabajo" text NOT NULL,
	"nota" text,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporte_tanqueos" (
	"reporte_id" uuid NOT NULL,
	"tanqueo_id" uuid NOT NULL,
	CONSTRAINT "reporte_tanqueos_reporte_id_tanqueo_id_pk" PRIMARY KEY("reporte_id","tanqueo_id")
);
--> statement-breakpoint
CREATE TABLE "reporte_viajes" (
	"reporte_id" uuid NOT NULL,
	"viaje_id" uuid NOT NULL,
	CONSTRAINT "reporte_viajes_reporte_id_viaje_id_pk" PRIMARY KEY("reporte_id","viaje_id")
);
--> statement-breakpoint
CREATE TABLE "tanqueos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"cabezal_id" uuid NOT NULL,
	"viaje_id" uuid,
	"creado_por" uuid NOT NULL,
	"fecha_hora" timestamp with time zone NOT NULL,
	"galones" numeric(8, 2) NOT NULL,
	"lugar" text,
	"km" integer,
	"costo" numeric(10, 2),
	"bloqueado" boolean DEFAULT false NOT NULL,
	"reporte_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viaje_compartimentos" (
	"viaje_id" uuid NOT NULL,
	"componente_id" uuid NOT NULL,
	"producto" text NOT NULL,
	CONSTRAINT "viaje_compartimentos_viaje_id_componente_id_pk" PRIMARY KEY("viaje_id","componente_id")
);
--> statement-breakpoint
CREATE TABLE "viaje_productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viaje_id" uuid NOT NULL,
	"producto" text NOT NULL,
	"galones" integer NOT NULL,
	"numero_guia" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"cabezal_id" uuid NOT NULL,
	"remolque_id" uuid,
	"creado_por" uuid NOT NULL,
	"fecha_salida" date NOT NULL,
	"hora_salida" text NOT NULL,
	"fecha_retorno" date,
	"hora_retorno" text,
	"origen_id" uuid NOT NULL,
	"destino_id" uuid NOT NULL,
	"km_salida" integer NOT NULL,
	"km_llegada" integer,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"notas" text,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"reporte_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidencias" ALTER COLUMN "mantenimiento_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN "viaje_id" uuid;--> statement-breakpoint
ALTER TABLE "lugares" ADD CONSTRAINT "lugares_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mantenimiento_trabajos" ADD CONSTRAINT "mantenimiento_trabajos_mantenimiento_id_mantenimientos_id_fk" FOREIGN KEY ("mantenimiento_id") REFERENCES "public"."mantenimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mantenimiento_trabajos" ADD CONSTRAINT "mantenimiento_trabajos_componente_id_componentes_id_fk" FOREIGN KEY ("componente_id") REFERENCES "public"."componentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_tanqueos" ADD CONSTRAINT "reporte_tanqueos_reporte_id_reportes_id_fk" FOREIGN KEY ("reporte_id") REFERENCES "public"."reportes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_tanqueos" ADD CONSTRAINT "reporte_tanqueos_tanqueo_id_tanqueos_id_fk" FOREIGN KEY ("tanqueo_id") REFERENCES "public"."tanqueos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_viajes" ADD CONSTRAINT "reporte_viajes_reporte_id_reportes_id_fk" FOREIGN KEY ("reporte_id") REFERENCES "public"."reportes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_viajes" ADD CONSTRAINT "reporte_viajes_viaje_id_viajes_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viajes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanqueos" ADD CONSTRAINT "tanqueos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanqueos" ADD CONSTRAINT "tanqueos_cabezal_id_unidades_id_fk" FOREIGN KEY ("cabezal_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanqueos" ADD CONSTRAINT "tanqueos_viaje_id_viajes_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viajes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanqueos" ADD CONSTRAINT "tanqueos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje_compartimentos" ADD CONSTRAINT "viaje_compartimentos_viaje_id_viajes_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viajes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje_compartimentos" ADD CONSTRAINT "viaje_compartimentos_componente_id_componentes_id_fk" FOREIGN KEY ("componente_id") REFERENCES "public"."componentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje_productos" ADD CONSTRAINT "viaje_productos_viaje_id_viajes_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viajes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_cabezal_id_unidades_id_fk" FOREIGN KEY ("cabezal_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_remolque_id_unidades_id_fk" FOREIGN KEY ("remolque_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_origen_id_lugares_id_fk" FOREIGN KEY ("origen_id") REFERENCES "public"."lugares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viajes" ADD CONSTRAINT "viajes_destino_id_lugares_id_fk" FOREIGN KEY ("destino_id") REFERENCES "public"."lugares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lugares_usuario_nombre_unico" ON "lugares" USING btree ("usuario_id","nombre_normalizado");--> statement-breakpoint
CREATE INDEX "mant_trabajos_mantenimiento" ON "mantenimiento_trabajos" USING btree ("mantenimiento_id");--> statement-breakpoint
CREATE INDEX "tanqueos_cabezal_fecha" ON "tanqueos" USING btree ("cabezal_id","fecha_hora");--> statement-breakpoint
CREATE UNIQUE INDEX "viaje_producto_unico" ON "viaje_productos" USING btree ("viaje_id","producto");--> statement-breakpoint
CREATE INDEX "viajes_cuenta_fecha" ON "viajes" USING btree ("cuenta_id","fecha_salida");--> statement-breakpoint
CREATE UNIQUE INDEX "viajes_un_abierto_por_vehiculo" ON "viajes" USING btree ("cabezal_id") WHERE estado = 'abierto' and activo;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_viaje_id_viajes_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viajes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_un_solo_origen" CHECK ((mantenimiento_id is null) <> (viaje_id is null));--> statement-breakpoint
-- Datos: cada mantenimiento existente pasa a ser una visita con un solo trabajo (no se pierde nada)
INSERT INTO "mantenimiento_trabajos" ("mantenimiento_id", "tipo_trabajo_id", "parte", "trabajo") SELECT m."id", 'anterior', m."parte", m."trabajo" FROM "mantenimientos" m WHERE NOT EXISTS (SELECT 1 FROM "mantenimiento_trabajos" t WHERE t."mantenimiento_id" = m."id");
