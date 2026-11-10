ALTER TYPE "public"."rol_usuario" ADD VALUE 'admin';--> statement-breakpoint
CREATE TABLE "propietarios" (
	"usuario_id" uuid NOT NULL,
	"unidad_id" uuid NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "propietarios_usuario_id_unidad_id_pk" PRIMARY KEY("usuario_id","unidad_id")
);
--> statement-breakpoint
ALTER TABLE "unidades" ALTER COLUMN "placa" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "cuenta_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD COLUMN "vehiculo_id" uuid;--> statement-breakpoint
ALTER TABLE "reportes" ADD COLUMN "vehiculo_id" uuid;--> statement-breakpoint
ALTER TABLE "propietarios" ADD CONSTRAINT "propietarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propietarios" ADD CONSTRAINT "propietarios_unidad_id_unidades_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD CONSTRAINT "mantenimientos_vehiculo_id_unidades_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_vehiculo_id_unidades_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."unidades"("id") ON DELETE no action ON UPDATE no action;