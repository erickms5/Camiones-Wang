CREATE TABLE "archivos" (
	"clave" text PRIMARY KEY NOT NULL,
	"datos" "bytea" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
