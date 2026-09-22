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

# El stack és allà on viu aquest script: el docker-compose.yml és el seu
# veí. Així el fitxer funciona a /opt/canconer, a ~/guitarreopuntcat o on
# el posis, sense editar res ni haver de passar STACK_DIR des del cron.
# Es pot forçar igualment amb STACK_DIR=/una/altra/ruta.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="${STACK_DIR:-$SCRIPT_DIR}"
SERVICE="canconer"
LOG_TAG="canconer-deploy"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  logger -t "$LOG_TAG" "$*" 2>/dev/null || true
}

cd "$STACK_DIR" || { echo "No existeix el directori $STACK_DIR"; exit 1; }

if [ ! -f docker-compose.yml ] && [ ! -f compose.yml ]; then
  log "ERROR: no hi ha cap docker-compose.yml a $STACK_DIR."
  exit 1
fi

# Un sol desplegament alhora: si el build anterior encara descarrega,
# una segona execució del cron no s'hi ha d'encavalcar. El lock viu al
# directori del stack i no a /tmp, on un fitxer d'un altre usuari ens
# bloquejaria per sempre.
exec 9>"$STACK_DIR/.deploy.lock"
if ! flock -n 9; then
  log "Ja hi ha un desplegament en curs; sortim."
  exit 0
fi

IMAGE="$(docker compose config --images "$SERVICE" | head -n1)"

# Digest de la imatge que el contenidor està executant ara mateix.
CURRENT="$(docker image inspect "$IMAGE" --format '{{index .RepoDigests 0}}' 2>/dev/null || echo "cap")"

# Comprovació prèvia del registre: `docker manifest inspect` no baixa cap
# capa, només consulta el manifest. Serveix per distingir un problema de
# xarxa o d'autenticació (imatge privada sense login) d'un pull fallit.
if ! REGISTRY_ERR="$(docker manifest inspect "$IMAGE" 2>&1 >/dev/null)"; then
  log "No s'ha pogut consultar el registre: $REGISTRY_ERR"
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
#
# El nom del contenidor el demanem a compose: depèn de si el compose fixa
# `container_name` o deixa que Docker el derivi del directori del stack.
CONTAINER="$(docker compose ps -q "$SERVICE" 2>/dev/null | head -n1)"
if [ -z "$CONTAINER" ]; then
  log "ERROR: el contenidor del servei '$SERVICE' no s'està executant."
  exit 1
fi

log "Esperant que l'aplicació respongui…"
for _ in $(seq 1 30); do
  STATUS="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo "unknown")"
  case "$STATUS" in
    healthy)
      log "Desplegament correcte."
      docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
      exit 0
      ;;
    none)
      # Sense healthcheck definit no hi ha res a esperar.
      log "Desplegat (el servei no declara healthcheck)."
      docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
      exit 0
      ;;
    unhealthy)
      log "ATENCIÓ: el contenidor ha arrencat però el healthcheck falla."
      log "Revisa: docker compose logs --tail=50 $SERVICE"
      exit 1
      ;;
  esac
  sleep 5
done

log "ATENCIÓ: l'aplicació no ha arribat a healthy en 150s. Revisa: docker compose logs $SERVICE"
exit 1
