#!/usr/bin/env bash
# Instala PostgreSQL en CachyOS / Arch y crea la base de desarrollo de Mi Trailer.
# Uso: bash api/scripts/instalar-postgres.sh   (pide la contraseña de sudo)
set -euo pipefail

sudo pacman -S --needed --noconfirm postgresql

if [ ! -f /var/lib/postgres/data/PG_VERSION ]; then
  sudo -iu postgres initdb --locale=C.UTF-8 --encoding=UTF8 -D /var/lib/postgres/data
fi
sudo systemctl enable --now postgresql

# Usuario y base solo para desarrollo local (no usar esta contraseña en producción)
sudo -iu postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='mitrailer'" | grep -q 1 \
  || sudo -iu postgres psql -c "CREATE ROLE mitrailer LOGIN PASSWORD 'mitrailer_dev'"
sudo -iu postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='mitrailer'" | grep -q 1 \
  || sudo -iu postgres createdb -O mitrailer mitrailer

echo "PostgreSQL listo: postgres://mitrailer:mitrailer_dev@localhost:5432/mitrailer"
