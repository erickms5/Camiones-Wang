CREATE TYPE "public"."rol_unidad" AS ENUM('cabezal', 'remolque');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('dueno', 'chofer');--> statement-breakpoint
CREATE TABLE "acoplamientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cabezal_id" uuid NOT NULL,
	"remolque_id" uuid NOT NULL,
	"desde" date NOT NULL,
	"hasta" date
);
--> statement-breakpoint
CREATE TABLE "asignaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"unidad_id" uuid NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"hasta" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid,
	"usuario_id" uuid,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"accion" text NOT NULL,
	"datos" jsonb,
	"en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codigos_acceso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"usado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "componentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidad_id" uuid NOT NULL,
	"padre_id" uuid,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"posicion" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"capacidad_galones" integer,
	"detalles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuentas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mantenimiento_id" uuid NOT NULL,
	"categoria" text NOT NULL,
	"nombre_archivo" text NOT NULL,
	"mime" text NOT NULL,
	"tamano" integer,
	"clave_almacen" text,
	"sha256" text,
	"anexo_posterior" boolean DEFAULT false NOT NULL,
	"subido_por" uuid NOT NULL,
	"subido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intervalos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidad_id" uuid NOT NULL,
	"tarea" text NOT NULL,
	"componente" text NOT NULL,
	"cada_km" integer,
	"cada_meses" integer,
	"origen" text NOT NULL,
	"editado" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mantenimiento_componentes" (
	"mantenimiento_id" uuid NOT NULL,
	"componente_id" uuid NOT NULL,
	CONSTRAINT "mantenimiento_componentes_mantenimiento_id_componente_id_pk" PRIMARY KEY("mantenimiento_id","componente_id")
);
--> statement-breakpoint
CREATE TABLE "mantenimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"unidad_id" uuid,
	"creado_por" uuid NOT NULL,
	"fecha" date NOT NULL,
	"km" integer NOT NULL,
	"parte" text NOT NULL,
	"trabajo" text NOT NULL,
	"provincia" text,
	"canton" text,
	"taller" text,
	"costo_taller" numeric(10, 2) DEFAULT '0' NOT NULL,
	"proveedor" text,
	"costo_repuestos" numeric(10, 2) DEFAULT '0' NOT NULL,
	"repuestos_detalle" text,
	"notas" text,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"reporte_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odometro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unidad_id" uuid NOT NULL,
	"km" integer NOT NULL,
	"fuente" text DEFAULT 'manual' NOT NULL,
	"registrado_por" uuid,
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reportes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"folio" text NOT NULL,
	"tipo" text NOT NULL,
	"periodo" text,
	"chofer_id" uuid,
	"generado_por" uuid NOT NULL,
	"generado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"hash" text NOT NULL,
	"datos" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"rol" "rol_unidad" NOT NULL,
	"tipo" text NOT NULL,
	"placa" text NOT NULL,
	"marca" text NOT NULL,
	"modelo" text NOT NULL,
	"anio" integer,
	"num_ejes" integer NOT NULL,
	"num_llantas" integer NOT NULL,
	"atributos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_id" uuid NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol_usuario" NOT NULL,
	"telefono" text,
	"cedula_cifrada" text,
	"cedula_hash" text,
	"consentimiento_en" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acoplamientos" ADD CONSTRAINT "acoplamientos_cabezal_id_unidades_id_fk" FOREIGN KEY ("cabezal_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acoplamientos" ADD CONSTRAINT "acoplamientos_remolque_id_unidades_id_fk" FOREIGN KEY ("remolque_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "componentes" ADD CONSTRAINT "componentes_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_mantenimiento_id_mantenimientos_id_fk" FOREIGN KEY ("mantenimiento_id") REFERENCES "public"."mantenimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_subido_por_usuarios_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervalos" ADD CONSTRAINT "intervalos_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mantenimiento_componentes" ADD CONSTRAINT "mantenimiento_componentes_mantenimiento_id_mantenimientos_id_fk" FOREIGN KEY ("mantenimiento_id") REFERENCES "public"."mantenimientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mantenimiento_componentes" ADD CONSTRAINT "mantenimiento_componentes_componente_id_componentes_id_fk" FOREIGN KEY ("componente_id") REFERENCES "public"."componentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD CONSTRAINT "mantenimientos_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD CONSTRAINT "mantenimientos_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD CONSTRAINT "mantenimientos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odometro" ADD CONSTRAINT "odometro_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odometro" ADD CONSTRAINT "odometro_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_chofer_id_usuarios_id_fk" FOREIGN KEY ("chofer_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_generado_por_usuarios_id_fk" FOREIGN KEY ("generado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cuenta_id_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codigos_email" ON "codigos_acceso" USING btree ("email");--> statement-breakpoint
CREATE INDEX "componentes_unidad" ON "componentes" USING btree ("unidad_id");--> statement-breakpoint
CREATE INDEX "mant_cuenta_fecha" ON "mantenimientos" USING btree ("cuenta_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "reportes_folio_unico" ON "reportes" USING btree ("cuenta_id","folio");--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_token_unico" ON "sesiones" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "unidades_placa_unica" ON "unidades" USING btree ("placa");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_cedula_cuenta_unica" ON "usuarios" USING btree ("cuenta_id","cedula_hash");