ALTER TABLE "mantenimientos" ADD COLUMN "pago_taller" text;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD COLUMN "taller_pagado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD COLUMN "taller_pagado_con" text;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD COLUMN "pago_repuestos" text;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD COLUMN "repuestos_pagado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mantenimientos" ADD COLUMN "repuestos_pagado_con" text;