// Genera las migraciones SQL a partir de src/db/esquema.js → carpeta drizzle/
export default {
  dialect: 'postgresql',
  schema: './src/db/esquema.js',
  out: './drizzle',
};
