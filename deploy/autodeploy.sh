#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Auto-desplegament per polling.
#
# Pregunta a GHCR si el tag `latest` apunta a una imatge diferent de
# la que corre ara. Si sí: pull, recrea el contenidor i neteja les
# imatges velles. Si no: no fa res i surt.
#
# Tot el trànsit és SORTINT — el servidor no exposa cap port nou ni
# accepta connexions de GitHub.
#
# Instal·lació: vegeu deploy/README.md
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/canconer}"
SERVICE="canconer"
LOG_TAG="canconer-deploy"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  logger -t "$LOG_TAG" "$*" 2>/dev/null || true
}

cd "$STACK_DIR"

# Un sol desplegament alhora: si el build anterior encara descarrega,
# una segona execució del cron no s'hi ha d'encavalcar.
exec 9>/tmp/canconer-deploy.lock
if ! flock -n 9; then
  log "Ja hi ha un desplegament en curs; sortim."
  exit 0
fi

IMAGE="$(docker compose config --images "$SERVICE" | head -n1)"

# Digest de la imatge que el contenidor està executant ara mateix.
CURRENT="$(docker image inspect "$IMAGE" --format '{{index .RepoDigests 0}}' 2>/dev/null || echo "cap")"

# Digest del tag `latest` al registre. `docker manifest inspect` no
# baixa les capes: només consulta el manifest.
if ! REMOTE_RAW="$(docker manifest inspect "$IMAGE" 2>&1)"; then
  log "No s'ha pogut consultar el registre: $REMOTE_RAW"
  exit 1
fi

docker pull --quiet "$IMAGE" >/dev/null
NEW="$(docker image inspect "$IMAGE" --format '{{index .RepoDigests 0}}')"

if [ "$CURRENT" = "$NEW" ]; then
  log "Cap canvi ($NEW). No cal desplegar."
  exit 0
fi

log "Imatge nova detectada."
log "  abans: $CURRENT"
log "  ara:   $NEW"

# `up -d` recrea el contenidor perquè la imatge ha canviat. Hi ha uns
# segons de tall: és inevitable amb una sola rèplica i SQLite, i és el
# comportament correcte per a aquest projecte.
docker compose up -d "$SERVICE"

# Espera que el healthcheck passi abans de donar-ho per bo.
log "Esperant que l'aplicació respongui…"
for i in $(seq 1 30); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$SERVICE" 2>/dev/null || echo "unknown")"
  if [ "$STATUS" = "healthy" ]; then
    log "Desplegament correcte."
    docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 5
done

log "ATENCIÓ: l'aplicació no ha arribat a healthy en 150s. Revisa: docker compose logs $SERVICE"
exit 1
