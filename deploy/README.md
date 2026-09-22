# Desplegament d'El Cançoner al home server

Guia completa per posar guitarreo.cat en producció a un Ubuntu Server amb
Docker Compose i Nginx Proxy Manager, amb actualització automàtica a cada
push a `main`.

## Com funciona

```
   push a main
        │
        ▼
  GitHub Actions ──── construeix la imatge ────▶ ghcr.io/twococos/canconer:latest
                                                          │
                                                          │ (polling cada 2 min,
                                                          │  connexió SORTINT)
                                                          ▼
                                            home server ── cron ── autodeploy.sh
                                                          │
                                                          ▼
                                              docker compose up -d
                                                          │
                                                          ▼
                                          Nginx Proxy Manager ──▶ Internet
```

**El servidor no accepta cap connexió entrant nova.** Ni port SSH exposat, ni
webhook, ni accés de GitHub a la teva xarxa. L'única comunicació és el servidor
preguntant a GHCR si hi ha imatge nova.

---

## Part 1 — Preparació al PC (una sola vegada)

### 1.1 Puja els fitxers nous a GitHub

Des de l'arrel del projecte:

```bash
git add Dockerfile .dockerignore .github/workflows/deploy.yml deploy/
git commit -m "Afegida infraestructura de desplegament amb Docker i GHCR"
git push
```

El workflow s'executarà immediatament. Ves a la pestaña **Actions** del repo i
comprova que acaba en verd. El primer build triga uns 5-8 minuts (compila
`better-sqlite3` i instal·la Chromium); els següents són molt més ràpids gràcies
al cache.

### 1.2 Fes pública la imatge (o prepara un token)

Per defecte, els paquets de GHCR són privats. La via més senzilla és fer-la
pública — la imatge no conté ni la BD ni el `.env`, només el codi que ja és
al repo:

1. Al teu perfil de GitHub → pestanya **Packages** → `canconer`
2. **Package settings** → **Change visibility** → **Public**

Si la prefereixes privada, salta a l'[Annex A](#annex-a--imatge-privada).

### 1.3 Prepara una còpia neta del catàleg

Les BD SQLite tenen fitxers `-wal` amb escriptures pendents. Copiar-les en
calent dona una BD incompleta o corrupta.

**Atura primer el servidor de desenvolupament** (`Ctrl+C` a la terminal del
`npm run dev`), i després, des de l'arrel del projecte:

```bash
sqlite3 data/canconer.db ".backup 'canconer-prod.db'"
```

Si no tens `sqlite3` a Windows, alternativa amb Node:

```bash
node -e "const D=require('better-sqlite3');const d=new D('data/canconer.db');d.backup('canconer-prod.db').then(()=>{console.log('Fet');process.exit(0)})"
```

Això genera `canconer-prod.db` a l'arrel, consolidat i segur de copiar.
`analytics.db` no la copiem: al servidor començarà buida, com vas decidir.

### 1.4 Descarrega la BD GeoIP

Si no la tens a mà, cal `data/GeoLite2-Country.mmdb` (ja la tens al projecte).
La copiarem al servidor al pas 2.3.

---

## Part 2 — Configuració al servidor

> **Nota sobre les rutes.** Aquesta guia usa `/opt/canconer`, però el stack
> pot viure on vulguis — per exemple `~/guitarreopuntcat`. Si el canvies,
> adapta totes les rutes d'aquesta guia, inclosa la variable `STACK_DIR`
> del cron (Part 4). Res del codi depèn d'aquesta ubicació.

### 2.1 Crea l'estructura

Connecta't al servidor i:

```bash
sudo mkdir -p /opt/canconer/data
sudo chown -R $USER:$USER /opt/canconer
cd /opt/canconer
```

### 2.2 Copia els fitxers de desplegament

Des del **PC**, amb `scp` (substitueix `usuari` i `IP-DEL-SERVIDOR`):

```bash
scp deploy/docker-compose.yml deploy/.env.example deploy/autodeploy.sh usuari@IP-DEL-SERVIDOR:/opt/canconer/
```

> Si tampoc tens SSH cap al servidor des del PC, pots crear els fitxers a mà
> amb `nano` al servidor — el contingut és el d'aquesta carpeta `deploy/`.

### 2.3 Copia les dades

Des del **PC**:

```bash
scp canconer-prod.db usuari@IP-DEL-SERVIDOR:/opt/canconer/data/canconer.db
scp data/GeoLite2-Country.mmdb usuari@IP-DEL-SERVIDOR:/opt/canconer/data/
```

Al **servidor**, comprova que el contenidor podrà escriure al volum. L'usuari
`node` de la imatge té UID 1000; si el teu usuari del servidor va ser el
primer que es va crear, també el té i no cal fer res:

```bash
id -u        # si diu 1000, ja estàs
```

Si dona un número diferent:

```bash
sudo chown -R 1000:1000 /opt/canconer/data
```

A partir d'aquí caldrà `sudo` per tocar els fitxers de `data/` a mà. És
normal.

### 2.4 Omple el `.env`

Al servidor:

```bash
cd /opt/canconer
cp .env.example .env
chmod 600 .env
nano .env
```

Cal omplir, com a mínim:

| Variable                                | Valor                                           |
| --------------------------------------- | ----------------------------------------------- |
| `GHCR_OWNER`                            | `twococos` (en minúscules)                      |
| `AUTH_SECRET`                           | Genera'l amb `openssl rand -base64 32`          |
| `AUTH_URL`                              | `https://guitarreo.cat` — el domini públic real |
| `NEXT_PUBLIC_SITE_URL`                  | El mateix domini                                |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Els de Google Cloud Console                     |

### 2.5 Autoritza el domini a Google

**Sense aquest pas el login amb Google fallarà amb `redirect_uri_mismatch`.**

A [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
el teu client OAuth → **URIs de redirecció autoritzats** → afegeix:

```
https://guitarreo.cat/api/auth/callback/google
```

I a **Orígens de JavaScript autoritzats**:

```
https://guitarreo.cat
```

Pots deixar-hi també els de `localhost:3000` per seguir desenvolupant.

### 2.6 Arrenca

```bash
cd /opt/canconer
docker compose pull
docker compose up -d
docker compose logs -f
```

Hauries de veure Next.js arrencant i les migracions d'analytics creant la BD
buida. `Ctrl+C` surt dels logs sense aturar res.

Comprova que respon:

```bash
curl http://127.0.0.1:3000/api/health
```

### 2.7 Provar-ho des del navegador abans de tenir el domini

El compose publica el port a `127.0.0.1`, així que la web **no** és accessible
des d'altres màquines de la xarxa. Per fer-hi una ullada des del teu PC, obre
un túnel SSH i visita `http://localhost:3000`:

```bash
ssh -L 3000:127.0.0.1:3000 usuari@IP-DEL-SERVIDOR
```

Si prefereixes obrir-lo a tota la LAN mentre proves, canvia el `ports` del
compose a `"3000:3000"` i fes `docker compose up -d`. Recorda tornar-lo a
`127.0.0.1:3000:3000` quan NPM ja funcioni: el proxy hi arriba per la xarxa
de Docker i no cal que el port quedi exposat.

> **El login amb Google no funcionarà per IP ni per `localhost`.** `AUTH_URL`
> apunta al domini públic i Google rebutja qualsevol altre redirect. La resta
> del lloc (catàleg, cerca, editor, muntar cançoners) sí que es pot provar.

---

## Part 3 — Nginx Proxy Manager

Al teu NPM, crea un **Proxy Host**:

| Camp                  | Valor                                                |
| --------------------- | ---------------------------------------------------- |
| Domain Names          | `guitarreo.cat` (i `www.guitarreo.cat` si el vols)   |
| Scheme                | `http`                                               |
| Forward Hostname / IP | La IP del servidor a la xarxa Docker, o `172.17.0.1` |
| Forward Port          | `3000`                                               |
| Websockets Support    | ✅ activat                                           |
| Block Common Exploits | ✅ activat                                           |

A la pestanya **SSL**: certificat Let's Encrypt nou, **Force SSL** i **HTTP/2**
activats.

### Sobre el `Forward Hostname`

Depèn d'on corre NPM:

- **NPM en un contenidor de la mateixa màquina**: el compose publica el port a
  `127.0.0.1:3000`, que NPM _no_ veu des del seu contenidor. Tens dues opcions:
  1. Posa `172.17.0.1` (la gateway de Docker) com a Forward Hostname. Funciona
     sense tocar res més.
  2. **Més net:** connecta els dos a una xarxa Docker compartida i usa
     `canconer` com a hostname. Vegeu l'[Annex B](#annex-b--xarxa-compartida-amb-npm).
- **NPM en una altra màquina**: canvia el `ports` del compose de
  `"127.0.0.1:3000:3000"` a `"3000:3000"` i apunta a la IP del servidor.

### Mida màxima de pujada

Els PDF generats poden ser grans. A la pestanya **Advanced** del Proxy Host,
afegeix-hi:

```nginx
client_max_body_size 20m;
proxy_read_timeout 120s;
```

El `proxy_read_timeout` importa: generar un PDF d'un cançoner llarg pot passar
dels 60s per defecte de nginx i el visitant rebria un 504.

---

## Part 4 — Auto-desplegament

Al servidor:

```bash
chmod +x /opt/canconer/autodeploy.sh
```

Prova'l a mà primer:

```bash
/opt/canconer/autodeploy.sh
```

Hauria de dir `Cap canvi`. Si és així, programa'l al cron:

```bash
crontab -e
```

I afegeix-hi aquesta línia, amb la ruta del teu stack:

```cron
*/2 * * * * /opt/canconer/autodeploy.sh >> $HOME/canconer-deploy.log 2>&1
```

L'script dedueix el directori del stack de la seva pròpia ubicació, així que
funciona des d'on el posis sense cap variable. El log va al teu home per
estalviar-te el `sudo` de `/var/log`.

**Ja està.** A partir d'ara, cada `git push` a `main` arriba a producció en
2-4 minuts (el que triga el build d'Actions més el polling).

Per veure què ha fet:

```bash
tail -f ~/canconer-deploy.log
```

---

## Operació diària

### Desplegar ara mateix, sense esperar el cron

```bash
/opt/canconer/autodeploy.sh
```

### Veure els logs de l'aplicació

```bash
cd /opt/canconer && docker compose logs -f --tail=100
```

### Tornar enrere a una versió anterior

Cada build etiqueta la imatge amb el SHA del commit. Busca el que vols a la
pestanya Packages de GitHub, i re-etiqueta'l localment com a `latest` perquè
el compose l'agafi sense canviar cap fitxer:

```bash
cd /opt/canconer
SHA=sha-<EL-SHA-COMPLET>
docker pull ghcr.io/twococos/canconer:$SHA
docker tag ghcr.io/twococos/canconer:$SHA ghcr.io/twococos/canconer:latest
docker compose up -d
```

**Atura el cron mentre investigues**, o al cap de dos minuts l'autodeploy
tornarà a baixar la versió trencada:

```bash
crontab -l | grep -v autodeploy | crontab -
```

Per tornar a la versió bona: restaura la línia del cron i executa
`docker compose pull && docker compose up -d`.

**Important:** si el commit que revertit incloïa una migració de BD, tornar
enrere el codi **no** desfà la migració. Restaura també el backup de la BD.

### Backups

L'únic que cal salvar és `/opt/canconer/data/`. Un backup diari en calent,
consistent gràcies a l'API `.backup` de SQLite:

```bash
tee ~/guitarreopuntcat/backup.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STACK_DIR="${STACK_DIR:-$HOME/guitarreopuntcat}"
DEST="$STACK_DIR/backups"
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M)"
cd "$STACK_DIR"

# El nom del contenidor el resol compose, no el fixem a mà.
CID="$(docker compose ps -q canconer)"
[ -n "$CID" ] || { echo "El contenidor no corre"; exit 1; }

docker exec "$CID" node -e "
  const D=require('better-sqlite3');
  const d=new D('/app/data/canconer.db', { readonly: true });
  d.backup('/app/data/canconer-backup.db').then(()=>process.exit(0));
"
mv "$STACK_DIR/data/canconer-backup.db" "$DEST/canconer-$STAMP.db"
# Conserva els 14 més recents.
ls -1t "$DEST"/canconer-*.db | tail -n +15 | xargs -r rm --
EOF
chmod +x ~/guitarreopuntcat/backup.sh
```

I al cron:

```cron
0 4 * * * $HOME/guitarreopuntcat/backup.sh >> $HOME/canconer-backup.log 2>&1
```

---

## Resolució de problemes

### El contenidor reinicia en bucle

```bash
docker compose logs --tail=50 canconer
```

Les causes habituals: `AUTH_SECRET` buit, o permisos del volum. Per als
permisos: `sudo chown -R 1000:1000 /opt/canconer/data`.

### `redirect_uri_mismatch` en fer login

El redirect URI de Google Cloud Console no coincideix exactament amb
`AUTH_URL` + `/api/auth/callback/google`. Revisa que no hi hagi barra final
a `AUTH_URL` i que sigui `https`, no `http`.

### Els PDF fallen o es queden penjats

Normalment és memòria compartida. El compose ja hi posa `shm_size: 512mb`;
si tot i així falla, mira la memòria lliure del servidor amb `free -h` —
Chromium en necessita uns 300-500 MB per PDF. Prova:

```bash
docker compose exec canconer /usr/bin/chromium --version
```

Ha de respondre amb la versió. Si no, la imatge no s'ha construït bé.

### Les analítiques mostren totes les visites des de la mateixa IP

NPM no està enviant `X-Forwarded-For`. A la configuració avançada del
Proxy Host, comprova que no hi hagi res que sobreescrigui els headers; NPM
els envia per defecte.

### El polling no detecta imatges noves

```bash
docker manifest inspect ghcr.io/twococos/canconer:latest
```

Si dona error d'autenticació, la imatge encara és privada
([Annex A](#annex-a--imatge-privada)).

---

## Annex A — Imatge privada

Si prefereixes no fer pública la imatge, el servidor necessita un token de
lectura.

1. A GitHub: **Settings** → **Developer settings** → **Personal access tokens**
   → **Tokens (classic)** → **Generate new token**
2. Marca només l'scope **`read:packages`**. Cap més.
3. Al servidor:

```bash
echo "ghp_EL_TEU_TOKEN" | docker login ghcr.io -u twococos --password-stdin
```

Docker el desa a `~/.docker/config.json` i tant el compose com l'`autodeploy.sh`
l'usaran automàticament. El cron corre com el mateix usuari, així que no cal
res més.

---

## Annex B — Xarxa compartida amb NPM

Més net que dependre de `172.17.0.1`. Al `docker-compose.yml`, substitueix el
bloc `ports` per:

```yaml
    networks:
      - npm

networks:
  npm:
    external: true
    name: <el-nom-de-la-xarxa-de-npm>
```

Troba el nom amb `docker network ls`. Després, al Proxy Host de NPM, posa
`canconer` com a Forward Hostname i `3000` com a port. Així el port no queda
publicat a l'amfitrió i el trànsit no surt mai de Docker.

---

## Annex C — Què NO s'ha de fer

- **No escalis a més d'una rèplica.** SQLite en fitxer més el scheduler
  d'`instrumentation.ts` assumeixen un sol procés. Dues instàncies corrompen
  la BD i dupliquen l'agregació d'analítiques.
- **No posis `data/` dins de la imatge.** Viu al volum; si no, cada
  desplegament esborraria el catàleg.
- **No comparteixis el `.env`.** Conté `AUTH_SECRET` i les credencials de
  Google.
