# Pla d'implementació — Redisseny de `/my-canconers` → `/library`

> Pla detallat per a la migració de la pàgina **Els meus cançoners** a una nova
> pàgina **La teva Biblioteca**, amb dues pestanyes (cançoners + propostes),
> targetes expandibles, vista prèvia privada i nou cicle de vida de propostes
> amb estat **Cancel·lada**.
>
> Aquest pla està pensat per ser executat amb sub-agents (Opus per a feina
> arquitectònica, Sonnet per a components/route handlers/queries, Haiku per a
> refactors mecànics). Cada fase indica el model recomanat i el brief que
> s'ha de passar al sub-agent.

---

## 0. Decisions preses (vegeu conversa)

1. **Ruta antiga `/my-canconers` s'elimina del tot** (no redirect). Cal
   actualitzar tots els enllaços interns.
2. **Camp `draft` (taula `songs`) → `state`** (migració SQL) amb 5 valors:
   - `0` Pública (visible al cançoner públic).
   - `1` Privada (preparat per a una futura feature; **no s'implementa lògica
     encara**, però el camp ha d'acceptar el valor).
   - `2` Pendent (proposta a revisió).
   - `3` Rebutjada (admin l'ha rebutjat, l'usuari pot modificar-la).
   - `4` Cancel·lada (l'usuari l'ha descartat, no apareix a la seva llista
     però sí al panell admin si filtra "Cancel·lades").
3. **Propostes rebutjades NO s'esborren** la cançó associada (vs. comportament
   actual que la borra). Només es passa a `state=3`.
4. **Proposta re-enviada** (rebutjada → modificada → pendent) ha d'aparèixer
   al panell admin amb un **badge visual "Re-enviada"** per a alertar.
5. **Botó "Mostrar"** de cançoner → nova ruta `/library/canconers/[id]/preview`
   amb auth gate i ownership check; reutilitza el layout de `/c/[token]`.
6. **Ordenació de cançoners i propostes**: dropdown compacte amb fletxa
   asc/desc al costat.
7. **Modificar proposta sense canvis**: botó "Modificar Proposta" deshabilitat
   fins que hi hagi canvis reals respecte la versió desada (snapshot compare).

---

## 1. Esquema de fases

| # | Fase | Sub-agent | Justificació |
|---|---|---|---|
| 1 | Migració BD: `draft` → `state` | **Sonnet** | SQL + queries; mecànic però cal entendre dependències. |
| 2 | Lògica de propostes (API + queries) | **Opus** | Canvi de cicle de vida, edge cases (re-enviament, cancel·lació). |
| 3 | Ruta `/library/canconers/[id]/preview` | **Sonnet** | Server component nou, ownership check, reaprofita components. |
| 4 | Pàgina `/library` — esquelet + tabs | **Sonnet** | Estructura React + estat compartit. |
| 5 | Pestanya **Cançoners** (UI + targetes expandibles) | **Sonnet** | Component complex però acotat. |
| 6 | Pestanya **Propostes** (UI + targetes expandibles + filtres) | **Sonnet** | Similar a (5). |
| 7 | Mode "modificar proposta" a `/editor` | **Opus** | Snapshot diff + nou mode al WysiwygEditor que ja és complex. |
| 8 | Panell admin: filtre "Cancel·lades" + badge "Re-enviada" | **Sonnet** | Petit canvi a `ProposalsTab`. |
| 9 | Eliminar `/my-canconers` i actualitzar enllaços | **Haiku** | Refactor mecànic: esborrar fitxer i fer find/replace. |
| 10 | CSS i polish visual | **Sonnet** | Reescriptura de la secció 4 de `globals.css`. |
| 11 | Verificació final (`tsc`, smoke test) | **Opus** (sessió principal) | Integració. |

Fases **1, 2, 9** són desbloquejadores (es fan abans). **4 i 5/6** poden anar
en paral·lel un cop fet 1+2.

---

## 2. Fase 1 — Migració BD `draft` → `state`

**Model:** Sonnet.

### 2.1. Canvis a l'esquema (`src/db/schema.ts`)

```ts
// songs:
state: integer("state").default(0)
// 0 pública, 1 privada, 2 pendent, 3 rebutjada, 4 cancel·lada
```

Elimina el camp `draft`. La taula `song_proposals` **manté** el seu `status`
intern (`pending`/`approved`/`rejected`) — coexisteixen perquè:
- `state` al song descriu el cicle de vida públic/privat de la **cançó**.
- `status` al proposal descriu l'estat de la **revisió administrativa**.

S'hi afegirà també `status = "cancelled"` (vegeu fase 2).

### 2.2. Script de migració

Crear `data/migrations/0001_draft_to_state.sql`:

```sql
ALTER TABLE songs ADD COLUMN state INTEGER DEFAULT 0;

-- Mapping inicial:
-- draft=0 → state=0 (pública)
-- draft=1 i proposta pending → state=2
-- draft=1 i proposta rejected → state=3
-- draft=1 sense proposta o orfes → state=0 (assumim pública, casos rars)

UPDATE songs SET state = 2
  WHERE id IN (SELECT song_id FROM song_proposals WHERE status = 'pending');

UPDATE songs SET state = 3
  WHERE id IN (SELECT song_id FROM song_proposals WHERE status = 'rejected');

ALTER TABLE songs DROP COLUMN draft;
```

> ⚠ Cal **backup automàtic** abans (`cp data/canconer.db backups/pre-state-<date>.db`).
> Recordatori: SQLite < 3.35 no suporta `DROP COLUMN`; verificar versió. Si no,
> recrear taula via `CREATE TABLE … AS SELECT …`.

### 2.3. Refactor de tot el codi que fa servir `draft`

Buscar amb `Grep "draft"` als fitxers `src/**/*.{ts,tsx}` i actualitzar:
- `db/queries/songs.ts` — filtres del `WHERE draft = 0` → `WHERE state = 0`.
- `db/queries/proposals.ts` — `draft: 1` → `state: 2` (pendent) en crear; `draft: 0`
  → `state: 0` en acceptar; **NOU**: en rebutjar fer `state: 3` (no esborrar).
- `lib/schemas/*` — qualsevol referència.
- `app/api/songs/**` — endpoints públics filtren `state = 0`.

### 2.4. Brief al sub-agent

> "Tasca: renomenar el camp `draft` a `state` a la taula `songs` (BD SQLite via
> Drizzle) amb 5 valors enum (0-4). Has d'escriure el script SQL de migració a
> `data/migrations/0001_draft_to_state.sql`, fer backup previ a `backups/`, i
> actualitzar **tots** els llocs que llegeixen/escriuen `draft` a `src/`. Llista
> els fitxers afectats amb `Grep`. Per a propostes rebutjades, la cançó NO s'ha
> d'esborrar — només posar `state=3`. Verifica amb `npx tsc --noEmit`. No
> toquis `src/styles/song.css` ni `tsconfig.json`."

---

## 3. Fase 2 — Lògica de propostes (API + queries)

**Model:** Opus (sessió principal o sub-agent Opus dedicat).

### 3.1. Canvis a l'enum de `song_proposals.status`

```ts
status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] })
```

Migració SQLite: l'enum és només TypeScript-side (SQLite no té check
constraints aplicats per Drizzle), però cal afegir `"cancelled"` als tipus.

### 3.2. Nou endpoint: cancel·lar proposta

`POST /api/proposals/[id]/cancel` (o `PATCH` amb action):

- Auth: el propietari de la proposta (no només admin).
- Validació: només es pot cancel·lar si `status` ∈ {`pending`, `rejected`}.
- Efecte: `proposals.status = "cancelled"`, `songs.state = 4` (cancel·lada).
- La cançó queda a la BD per traçabilitat.

### 3.3. Nou endpoint: modificar proposta (re-enviar)

`PUT /api/proposals/[id]` (nou):

- Auth: propietari de la proposta.
- Validació: només `status` ∈ {`pending`, `rejected`}. Body = `proposalInputSchema`.
- Efecte:
  - Actualitza els camps de la cançó associada (`songs[songId]`).
  - `state = 2` (pendent).
  - `proposals.status = "pending"`, `reviewed_at = null`, `notes` es **manté**
    si venia de rebutjada (per a tenir traça), però es marca un nou camp
    `resubmitted_at` o `resubmit_count++` per al badge admin.

### 3.4. Camp nou a `song_proposals`: `resubmittedAt` (opcional)

```ts
resubmittedAt: text("resubmitted_at")
```

Si `resubmitted_at IS NOT NULL` → mostrar badge "Re-enviada" al panell admin.

Migració:

```sql
ALTER TABLE song_proposals ADD COLUMN resubmitted_at TEXT;
```

### 3.5. Modificar `listProposals` per a filtrar cancel·lades

- Per a l'usuari (no-admin): excloure `status = "cancelled"` per defecte.
- Per a admin: paràmetre `?status=` o filtre client-side; ja existeix filtre
  al `ProposalsTab`, només cal afegir l'opció "Cancel·lades" al dropdown.

### 3.6. Modificar `reviewProposal` (admin rebutja)

Comportament nou: NO esborrar la cançó. Només:
- `proposals.status = "rejected"`, `reviewer_id`, `notes`, `reviewed_at`.
- `songs.state = 3`.

### 3.7. Schemas Zod (`src/lib/schemas/proposal.ts`)

- Afegir `cancelled` a l'enum d'estats.
- Nou schema `proposalUpdateSchema` (modificació per propietari).

### 3.8. Brief al sub-agent (Opus)

> "Tasca: implementar el nou cicle de vida de propostes. Llegeix
> `src/db/queries/proposals.ts`, `src/app/api/proposals/**` i
> `src/lib/schemas/proposal.ts` per situar-te. Canvis:
> 1) Afegir estat `cancelled` a l'enum de `song_proposals.status`.
> 2) Afegir camp `resubmittedAt` (text, nullable).
> 3) Endpoint nou `POST /api/proposals/[id]/cancel` (auth: propietari).
> 4) Endpoint nou `PUT /api/proposals/[id]` per a re-enviar (propietari)
>    — actualitza song, posa proposal.status='pending', resubmitted_at=ara.
> 5) `reviewProposal` (PATCH admin) en cas 'rejected' ja NO esborra la cançó;
>    només posa song.state=3.
> 6) `listProposals` exclou `cancelled` per a no-admins.
> Cada endpoint segueix les convencions: runtime nodejs, dynamic force-dynamic,
> JSON snake_case, errors amb status code adequat. Verifica `tsc`."

---

## 4. Fase 3 — Vista prèvia privada de cançoner

**Model:** Sonnet.

### 4.1. Nova ruta

`src/app/library/canconers/[id]/preview/page.tsx`:

- Server component.
- `getSessionUser()` → 401/redirect a `/` si no autenticat.
- `getCanconerById(id)` → 404 si no existeix.
- Check d'ownership: `canconer.user_id === session.user.id` o `role === "admin"`.
- Reutilitza **EXACTAMENT** el mateix JSX que `src/app/c/[token]/page.tsx`
  (SharedIndex + SongView + SharedPdfButton). Es pot extreure un component
  compartit `CanconerPreviewLayout` per a no duplicar codi.

### 4.2. Refactor recomanat

Crear `src/components/shared/CanconerPreviewLayout.tsx` que rebi un
`CanconerDetail` i renderitzi el layout. Tant `/c/[token]/page.tsx` com
`/library/canconers/[id]/preview/page.tsx` el cridarien.

### 4.3. Nova query `getCanconerById`

A `src/db/queries/canconers.ts`: similar a `getCanconerByToken` però accepta
`id: number` i no requereix `share_token`. Si ja existeix, reutilitzar.

### 4.4. Brief al sub-agent

> "Tasca: crear ruta `/library/canconers/[id]/preview` que mostri un cançoner
> privadament al propietari (sense compartir per enllaç públic). Llegeix
> `src/app/c/[token]/page.tsx` per a entendre el layout actual. Crea:
> 1) Component compartit `src/components/shared/CanconerPreviewLayout.tsx` amb
>    el JSX comú (header + SharedIndex + SongView*).
> 2) Refactor `src/app/c/[token]/page.tsx` per a utilitzar-lo.
> 3) Nova pàgina `src/app/library/canconers/[id]/preview/page.tsx` (server
>    component) amb auth gate i ownership check. Si no és propietari ni admin:
>    `notFound()`.
> Convencions: tot en català, `runtime = nodejs`, JSON snake_case. Verifica `tsc`."

---

## 5. Fase 4 — Pàgina `/library` esquelet + tabs

**Model:** Sonnet.

### 5.1. Estructura

```
src/app/library/
├── page.tsx                 ← entry point (client component)
├── CanconersTab.tsx         ← fase 5
└── ProposalsTab.tsx         ← fase 6
```

`page.tsx`:
- `"use client"` (manté la lògica que estava a `my-canconers/page.tsx`: auth
  gate, useSession, useRouter).
- Estat de tab actiu: `useState<"canconers" | "proposals">("canconers")`.
- Es pot persistir a URL via `searchParams` (`?tab=proposals`) per
  consistència amb `/admin`.
- Renderitza `<UserWidget />`, títol "📚 La teva Biblioteca", tabs.

### 5.2. Tabs (UI)

Reutilitza el patró de tabs del panell admin (`src/app/admin/page.tsx`) si ja
existeix; si no, dos botons amb `active` class.

### 5.3. Brief al sub-agent

> "Tasca: crear l'esquelet de la nova pàgina `/library` (substitueix la futura
> `/my-canconers`). Llegeix `src/app/my-canconers/page.tsx` per a context. Crea
> `src/app/library/page.tsx` com a client component amb:
> - Auth gate (redirigeix a `/` si no autenticat).
> - Header amb títol "📚 La teva Biblioteca" i UserWidget.
> - Dues tabs: 'Cançoners' i 'Propostes' (estat sincronitzat amb
>   `?tab=` searchParam).
> - Renderitza `<CanconersTab />` o `<ProposalsTab />` segons tab activa.
> Crea fitxers buits `CanconersTab.tsx` i `ProposalsTab.tsx` que retornen un
> div placeholder. La feina real va a fases següents. Verifica `tsc`."

---

## 6. Fase 5 — Pestanya **Cançoners**

**Model:** Sonnet.

### 6.1. Layout: 2 columnes centrades

```
┌─ La teva Biblioteca ──────────────────────────────────┐
│ [Cançoners] [Propostes]                                │
├──────────────────────────────────────────────────────┤
│ ┌───────────────────────┐  ┌──────────────────────┐  │
│ │ 🔍 Cerca…             │  │ Cançons del cançoner  │  │
│ │ Ordena: Títol ↑▼      │  │ 1. Title — Artist  Em │  │
│ │                       │  │ 2. ...                │  │
│ │ ┌─ Cançoner A ──────┐ │  └──────────────────────┘  │
│ │ │ 12 cançons · 12/3  │ │                            │
│ │ └───────────────────┘ │                            │
│ │ ┌─ Cançoner B (sel) ┐ │                            │
│ │ │ 5 cançons · 14/4   │ │                            │
│ │ │ ───────────────── │ │                            │
│ │ │ 📂 Mostrar         │ │                            │
│ │ │ ✏️  Editar         │ │                            │
│ │ │ 🗑  Eliminar        │ │                            │
│ │ │ 🔗 Compartir        │ │                            │
│ │ └───────────────────┘ │                            │
│ └───────────────────────┘                            │
└──────────────────────────────────────────────────────┘
```

**Amplada total:** decidir `max-width: 1200px` centrat (estètica) o
`100vw - 2rem` (utilitari). Recomanació: **centrat amb max-width** per
consistència amb la pàgina principal.

### 6.2. Component `CanconersTab`

Estat:
```ts
const [canconers, setCanconers] = useState<CanconerListItem[]>([])
const [active, setActive] = useState<CanconerDetail | null>(null)
const [search, setSearch] = useState("")
const [sortBy, setSortBy] = useState<"title" | "updated" | "song_count">("updated")
const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
```

Càrrega: igual que ara (`/api/canconers` + `/api/canconers/[id]`).

Filtrat:
```ts
const filtered = canconers
  .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
  .sort(/* per sortBy + sortDir */)
```

### 6.3. Targeta expandible

Component intern `<CanconerCard canconer={c} active={active?.id === c.id} onSelect={...} ...>`.

- Quan no està seleccionada: títol + meta (n cançons · data).
- Quan està seleccionada (`active`): s'expandeix amb una **secció d'opcions**
  separada per un `<hr>`. Animació `max-height` o `grid-template-rows: 0fr → 1fr`
  per a transició suau.
- Opcions: Mostrar, Editar (= "carregar al cançoner", la lògica actual de
  `sessionStorage.setItem('load_canconer', …)` + `router.push("/")`),
  Eliminar, Compartir.
- Compartir: si `share_token` → input read-only + Copiar + Revocar; si no →
  botó "Generar enllaç".
- **Editar nom** del cançoner inline (mantenir la funcionalitat actual).

### 6.4. Columna dreta

Mostra `active.songs` amb `transposeKey(s.key, s.semitones)`. Quan no hi ha
seleccionat, placeholder amb il·lustració/text.

### 6.5. Brief al sub-agent

> "Tasca: implementar la pestanya 'Cançoners' a `src/app/library/CanconersTab.tsx`.
> Layout 2 columnes (esquerra: cerca/ordena + llista de targetes expandibles;
> dreta: cançons del seleccionat). Llegeix `src/app/my-canconers/page.tsx` per a
> conèixer les APIs i la lògica actual de:
> - selecció de cançoner
> - editar nom inline
> - generar/revocar/copiar share_token
> - eliminar cançoner
> - carregar al cançoner (sessionStorage 'load_canconer' + router.push('/'))
> NOVA acció: 'Mostrar' → `router.push('/library/canconers/${id}/preview')`.
> Funcionalitats noves:
> - Cerca per títol (case-insensitive, includes).
> - Ordenació per títol / data d'actualització / nombre de cançons, asc/desc.
>   Dropdown compacte + botó fletxa per a direcció.
> Targeta expandible: en seleccionar-la, s'expandeix mostrant les opcions
> separades per `<hr>`. Animació suau (max-height o grid-rows 0fr→1fr).
> Convencions: tot en català, sense emojis nous, useToastStore per errors,
> camelCase a React / snake_case al JSON. Verifica `tsc`."

---

## 7. Fase 6 — Pestanya **Propostes**

**Model:** Sonnet.

### 7.1. Layout: 2 columnes

```
┌──────────────────────────────────────┐
│ ┌─────────────┐  ┌─────────────────┐ │
│ │ 🔍 Cerca…    │  │ [si rebutjada:  │ │
│ │ Ordena: Data │  │  Retroacció admin]│
│ │ Filtres:     │  │  ┌─ vista prèvia│ │
│ │ ☑ Pendents   │  │  │  de la cançó  │ │
│ │ ☑ Acceptades │  │  │  (SongView)   │ │
│ │ ☑ Rebutjades │  │  └──────────────┘ │
│ │              │  └─────────────────┘ │
│ │ ┌─ Proposta─┐│                      │
│ │ │ Title     ││                      │
│ │ │ Artist    ││                      │
│ │ │ [Pendent] ││                      │
│ │ └───────────┘│                      │
│ └─────────────┘                       │
└──────────────────────────────────────┘
```

### 7.2. Component `ProposalsTab` (de l'usuari, NO confondre amb el del panell admin)

Estat:
```ts
const [proposals, setProposals] = useState<UserProposal[]>([])
const [active, setActive] = useState<UserProposal | null>(null)
const [activeSong, setActiveSong] = useState<Song | null>(null)
const [search, setSearch] = useState("")
const [sortBy, setSortBy] = useState<"title" | "created">("created")
const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
const [showPending, setShowPending] = useState(true)
const [showApproved, setShowApproved] = useState(true)
const [showRejected, setShowRejected] = useState(true)
```

L'usuari NO veu les seves cancel·lades (decisió).

Càrrega: `/api/proposals` (filtra automàticament `cancelled` per a no-admins
segons fase 2). Per a la vista prèvia: `/api/songs/[id]` quan se selecciona.

### 7.3. Filtrat

```ts
const filtered = proposals
  .filter((p) => {
    if (!showPending && p.status === "pending") return false
    if (!showApproved && p.status === "approved") return false
    if (!showRejected && p.status === "rejected") return false
    return p.song_title.toLowerCase().includes(search.toLowerCase())
        || p.song_artist.toLowerCase().includes(search.toLowerCase())
  })
  .sort(/* per sortBy + sortDir */)
```

### 7.4. Targeta expandible amb accions

Segons estat:
- **`approved`** (acceptada): cap acció. Mostra "Aquesta cançó forma part de la base de dades pública".
- **`rejected`** (rebutjada):
  - "✏️ Modificar" → `router.push('/editor?proposal=' + p.id + '&mode=modify')`
  - "🗑 Cancel·lar" → confirm → `POST /api/proposals/[id]/cancel`
- **`pending`** (pendent):
  - "✏️ Modificar" → idem
  - "🗑 Cancel·lar" → idem

### 7.5. Panell dret

- Si la proposta està **rebutjada** i té `notes`: mostra requadre vermell
  abans de la vista prèvia: "Retroacció de l'administrador: {notes}".
- Sota: la vista prèvia (`<SongView song={...} semitones={0} number={1} />`)
  amb el contingut de la cançó proposada.

### 7.6. Brief al sub-agent

> "Tasca: implementar la pestanya 'Propostes' a `src/app/library/ProposalsTab.tsx`.
> Layout 2 columnes (esquerra: cerca/ordena/filtres + llista de targetes
> expandibles; dreta: requadre retroacció si rebutjada + vista prèvia SongView).
> Llegeix `src/app/my-canconers/page.tsx` (secció propostes), `src/components/song/SongView.tsx`
> i `src/app/api/proposals/route.ts` per a situar-te.
> Estats nous: filtres toggle pendent/aprovat/rebutjat (cancel·lades NO es veuen),
> cerca per títol+artista, ordenació títol/data, dropdown asc/desc.
> Targeta seleccionada s'expandeix amb accions segons estat:
>  - acceptada: cap (text informatiu).
>  - pendent/rebutjada: 'Modificar' (→ /editor?proposal=ID&mode=modify) i
>    'Cancel·lar' (→ POST /api/proposals/[id]/cancel amb confirm).
> Per a la vista prèvia, en seleccionar fer fetch /api/songs/[song_id] i passar
> el resultat a <SongView />. Si rebutjada amb notes: requadre vermell amb
> 'Retroacció: {notes}' a sobre.
> Convencions: tot en català, sense emojis nous a la lògica (els existents OK),
> useToastStore per errors, snake_case JSON. Verifica `tsc`."

---

## 8. Fase 7 — Mode "modificar proposta" a `/editor`

**Model:** Opus.

### 8.1. Nou mode

`searchParams.get("mode") === "modify"` + `searchParams.get("proposal") = "<id>"`.

Diferències vs. mode review (admin) i mode normal:
- L'usuari ha de ser el **propietari** de la proposta (no admin).
- La proposta ha de ser `pending` o `rejected`.
- Carrega la cançó associada (`song_id` del proposal).
- Mostra:
  - Si rebutjada: requadre groc a dalt "Aquesta proposta va ser rebutjada.
    Retroacció: {notes}".
- Botons de toolbar:
  - "Reset" → "Cancel·lar" (= cancel·lar la proposta sencera, no esborrar
    canvis a l'editor).
  - "Guardar" → "Modificar Proposta".
- **Snapshot de la versió original** al carregar; el botó "Modificar Proposta"
  es **deshabilita** si l'estat actual coincideix amb l'snapshot.

### 8.2. Snapshot diff

```ts
const initialSnapshotRef = useRef<string>("")
useEffect(() => {
  if (loaded) {
    initialSnapshotRef.current = JSON.stringify({ meta, content: editor.value })
  }
}, [loaded])

const hasChanges = useMemo(() => {
  return JSON.stringify({ meta, content: editor.value }) !== initialSnapshotRef.current
}, [meta, editor.value])
```

Botó deshabilitat amb tooltip "No s'ha modificat res encara" quan
`!hasChanges`.

### 8.3. Submit

```ts
PUT /api/proposals/[id]
body: proposalInputSchema
```

Backend: actualitza song, posa proposal.status='pending', resubmitted_at=ara.

### 8.4. Cancel·lar des de l'editor

Botó "Cancel·lar": confirm toast "Cancel·lar la proposta sencera? Es perdrà
i no apareixerà a la teva llista" → `POST /api/proposals/[id]/cancel` →
`router.push("/library?tab=proposals")`.

### 8.5. Refactor de `EditorPage`

L'estat del mode actual ja és `review | normal`; afegir un tercer mode:
`"modify"`. El switch principal queda:

```ts
type EditorMode = "create" | "edit" | "review" | "modify"
```

### 8.6. Brief al sub-agent (Opus)

> "Tasca: afegir mode 'modify' a `src/app/editor/page.tsx` per a permetre que
> el propietari d'una proposta (pending o rejected) la modifiqui i re-envii.
> Llegeix tot `src/app/editor/page.tsx` per a entendre els modes existents
> (create, edit, review).
> Especificacions:
> 1) S'activa amb `?proposal=ID&mode=modify`.
> 2) Carrega la cançó del proposal.song_id. Gate: usuari ha de ser el proposer
>    i status ∈ {pending, rejected}. Si no, redirect a `/library?tab=proposals`
>    amb toast d'error.
> 3) Si proposta rebutjada amb `notes`: requadre groc-ambre a la part superior
>    'Retroacció de l'administrador: {notes}'.
> 4) Toolbar: Reset → 'Cancel·lar' (cancela proposta sencera), Save → 'Modificar
>    Proposta'. Submit fa `PUT /api/proposals/[id]`.
> 5) Snapshot diff: 'Modificar Proposta' deshabilitat si meta+content no han
>    canviat respecte el carregat inicial. Tooltip 'No s'ha modificat res encara'.
> 6) Cancel·lar: confirm toast → `POST /api/proposals/[id]/cancel` → push
>    `/library?tab=proposals`.
> Convencions: tot en català, sense any, useToastStore per errors. Verifica `tsc`."

---

## 9. Fase 8 — Panell admin: filtre "Cancel·lades" + badge "Re-enviada"

**Model:** Sonnet.

### 9.1. Canvis a `src/components/admin/ProposalsTab.tsx`

- Afegir `<option value="cancelled">Cancel·lades</option>` al filtre.
- Si `proposal.resubmitted_at !== null`, mostrar un badge "Re-enviada" al
  costat del nom de l'usuari (estil: petit, taronja).

### 9.2. Brief al sub-agent

> "Tasca: actualitzar `src/components/admin/ProposalsTab.tsx`:
> 1) Afegir opció 'Cancel·lades' al dropdown filtre.
> 2) Si `proposal.resubmitted_at` no és null, mostrar badge 'Re-enviada' al
>    costat del proposer (CSS class `.badge-resubmitted`, taronja, mida petita).
> Verifica `tsc`."

---

## 10. Fase 9 — Eliminar `/my-canconers` i actualitzar enllaços

**Model:** Haiku.

### 10.1. Operacions

1. `rm -rf src/app/my-canconers/`.
2. Actualitzar `src/components/UserWidget.tsx`: `/my-canconers` → `/library`.
3. Actualitzar `src/components/songbook/SongbookEditor.tsx`: comentari fa
   referència a `my-canconers`; canviar-lo a `library`.
4. `Grep` global per a `my-canconers` per a verificar que no queden referències.
5. Actualitzar `PROJECT_CONTEXT.md` si cal (referències a la pàgina).

### 10.2. Brief al sub-agent

> "Tasca mecànica: la pàgina `/my-canconers` ha estat substituïda per `/library`.
> 1) Esborra el directori `src/app/my-canconers/`.
> 2) Fes Grep global de 'my-canconers' al projecte i actualitza totes les
>    referències a 'library' (rutes, comentaris, doc).
> 3) NO toquis encara `src/app/globals.css` (CSS es fa en fase separada).
> Verifica `tsc`. Llista tots els fitxers modificats."

---

## 11. Fase 10 — CSS i polish visual

**Model:** Sonnet.

### 11.1. Reescriure secció 4 de `globals.css`

Reemplaçar `/* 4. MY_CANCONERS.CSS */` per `/* 4. LIBRARY.CSS */` amb:

- `#library-main` (2 columnes centrades, max-width 1200px).
- `.library-tabs` (pestanyes superiors).
- `.library-card` (targeta de cançoner/proposta).
- `.library-card.active` (estat seleccionat).
- `.library-card-actions` (secció expandible amb transició `grid-template-rows`).
- `.library-search`, `.library-sort` (controls).
- `.library-songs-list`, `.library-songs-list li` (columna dreta).
- `.library-feedback-box` (requadre vermell retroacció admin).
- `.library-resubmit-warning` (requadre groc a /editor).
- `.badge-resubmitted` (al panell admin).

### 11.2. Animació d'expansió

Tècnica: `display: grid; grid-template-rows: 0fr` (contret) → `1fr` (expandit),
amb `transition: grid-template-rows 0.2s`. El fill ha de tenir `overflow: hidden`.

### 11.3. Brief al sub-agent

> "Tasca: reescriure la secció 4 de `src/app/globals.css` (cerca el comentari
> `4. MY_CANCONERS.CSS`) amb estils per a la nova pàgina `/library`. Estils a
> implementar (classnames concrets al pla):
> - layout 2 columnes centrades max-width 1200px
> - tabs Cançoners/Propostes
> - targetes amb estat actiu i secció expandible animada
> - search + sort controls
> - llista de cançons a la columna dreta (preservar `.mc-pos`, `.mc-stitle`,
>   etc. estètica però amb nous classnames `.library-song-*`)
> - requadre vermell retroacció admin a /library
> - requadre groc retroacció a /editor mode=modify
> - badge .badge-resubmitted (panell admin)
> Usar les variables CSS existents (`--accent`, `--bg`, `--surface`, etc.).
> No tocar `src/styles/song.css`. Mantenir el mateix to visual que la resta
> del projecte. Verifica que les pàgines /library i /editor renderitzen sense
> errors visuals evidents (mira amb el dev server)."

---

## 12. Fase 11 — Verificació final

**Sessió principal (Opus).**

Passos:
1. `npx tsc --noEmit` → ha de passar.
2. Arrencar `npm run dev` en background.
3. Smoke test manual (script bash o instruccions per a l'usuari):
   - Crear un cançoner i visitar `/library?tab=canconers`.
   - Seleccionar el cançoner: la targeta s'expandeix amb opcions.
   - Mostrar → preview privada.
   - Compartir → enllaç funcional.
   - Crear una proposta de cançó nova.
   - Veure-la a `/library?tab=proposals` com a "Pendent".
   - Com a admin, rebutjar-la amb una retroacció.
   - Com a usuari, veure que la proposta ara apareix com a "Rebutjada" amb
     retroacció en vermell.
   - Modificar la proposta → botó "Modificar Proposta" deshabilitat fins fer
     un canvi.
   - Re-enviar → torna a "Pendent".
   - Al panell admin: badge "Re-enviada" visible.
   - Cancel·lar una proposta pendent → desapareix de la llista usuari, apareix
     filtrant per "Cancel·lades" al panell admin.
4. Verificar BD: `sqlite3 data/canconer.db "SELECT id, state FROM songs LIMIT 5"`.

---

## 13. Riscos i decisions obertes

| Risc | Mitigació |
|---|---|
| Migració SQL trenca BD existent | Backup automàtic abans (`backups/pre-state-<date>.db`). |
| `DROP COLUMN` no suportat en SQLite antic | Recrear taula via `CREATE TABLE … AS SELECT`. |
| Duplicació de lògica entre /c/[token] i /library/preview | Component compartit `CanconerPreviewLayout`. |
| Estat de `proposals.status === "approved"` però `songs.state === 0` desincronitzats | Operar sempre dins una transacció (`db.transaction`). |
| Snapshot diff false-positive per espais en blanc | `JSON.stringify` és exacte; normalitzar `meta.title.trim()` abans del snapshot. |

---

## 14. Resum visual del flux d'estats de proposta

```
            ┌──────────────────────────────────────────────┐
            │                                              │
            │  [Usuari crea]                               │
            │       ↓                                      │
[Pendent (state=2, status=pending)]                       │
       │           ↓ [admin accepta]                      │
       │   [Acceptada (state=0, status=approved)]  FI    │
       │                                                  │
       │  ↓ [admin rebutja]                              │
       │  [Rebutjada (state=3, status=rejected)]         │
       │       │                                          │
       │       ↓ [usuari modifica]                       │
       │  [Pendent novament (state=2, status=pending,    │
       │   resubmitted_at=now)] ─┐                       │
       │                          │                       │
       ↓                          ↓                       │
[Usuari cancel·la]                                       │
[Cancel·lada (state=4, status=cancelled)]   FI (invisible│
                                              per a l'usuari)│
                                                          │
            (Estat 1 = Privada — reservat per a futur)   │
            └──────────────────────────────────────────────┘
```

---

## 15. Ordre suggerit d'execució

```
[Fase 1: BD draft→state]
        ↓
[Fase 2: API propostes]
        ↓
   ┌────┴───┬────────┐
   ↓        ↓        ↓
[Fase 3] [Fase 4] [Fase 8]
preview  esquel.   admin
        ↓
   ┌────┴────┐
   ↓         ↓
[Fase 5] [Fase 6]
canç.tab prop.tab
        ↓
[Fase 7: editor modify]
        ↓
[Fase 9: cleanup my-canconers]
        ↓
[Fase 10: CSS]
        ↓
[Fase 11: verificació final]
```

---

**FI DEL PLA.**
