# Pla — Pàgina de Compte (`/app/account`)

> Pàgina nova a l'app on l'usuari gestiona el seu compte. Accés des del UserWidget.

## Decisions preses

| Decisió | Tria |
|---|---|
| **Icona de perfil** | Només visualitzar l'avatar de Google (cap upload). |
| **Nom d'usuari** | Editable. Es preserva sempre el `googleName` original del primer login (per a referència) encara que l'usuari canviï el `name` mostrat. El callback `signIn` deixa de sobreescriure `name` si l'usuari ja existeix. |
| **Eliminar compte** | **Soft-delete amb anonimització**: posa `active=0`, buida `email`, `name`, `avatarUrl`, `googleId`. Els cançoners queden orfes (l'usuari fantasma els reté). |
| **Opcions extra** | Targeta d'**estadístiques resum** (nº cançoners, nº propostes, data d'alta). |

## Esquema de la pàgina

```
┌─ AppHeader (subtitle: "El meu compte", backLink: "← Cançoner" /app, actions: UserWidget) ─┐
│                                                                                             │
│  ┌─ account-grid (2 col responsive, col·lapsa a 1 a <900px) ─────────────────────────────┐ │
│  │                                                                                        │ │
│  │  ┌─ Targeta: PERFIL ─────────────┐   ┌─ Targeta: ESTADÍSTIQUES ──────────────┐        │ │
│  │  │  [avatar gran 96px]           │   │  Membre des de  · 12 mar 2025          │        │ │
│  │  │  Nom d'usuari [input editable]│   │  Cançoners      · 7                    │        │ │
│  │  │  Email (read-only, gris)      │   │  Propostes      · 3 (1 pendent)        │        │ │
│  │  │  [Guardar canvis]             │   └────────────────────────────────────────┘        │ │
│  │  └───────────────────────────────┘                                                     │ │
│  │                                                                                        │ │
│  │  ┌─ Targeta: ZONA PERILLOSA (full-width) ────────────────────────────────────────────┐│ │
│  │  │  Eliminar compte                                                                  ││ │
│  │  │  Text explicatiu: dades anonimitzades, cançoners orfes preservats.                ││ │
│  │  │  [Eliminar el meu compte] (vermell, obre ConfirmToast)                            ││ │
│  │  └────────────────────────────────────────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

Estètica: reutilitza variables CSS existents (`--accent`, `--bg`, `--card-bg`, etc.) i el patró visual de la "targeta blanca" de les pàgines `/projecte` i `/contacte`. Zona perillosa amb accent vermell discret (no estrident).

---

## Tasques i assignació de subagents

### Tasca 1 — Migració BD: afegir `google_name` i preparar soft-delete
**Agent:** Haiku (mecànic, ben acotat).
**Brief autosuficient:**
- Crear `src/db/migrations/0004_account_management.sql` que:
  - Afegeix columna `google_name TEXT` a `users` (nullable, sense default).
  - Backfill: `UPDATE users SET google_name = name WHERE google_name IS NULL;`
  - **No** toca `email`/`googleId`/`name` per a permetre que es buidin a soft-delete més tard (ja són nullable a SQLite per defecte).
- Actualitzar [src/db/schema.ts](src/db/schema.ts) afegint `googleName: text("google_name")` a la taula `users` (després de `name`, abans de `avatarUrl`).
- **No tocar res més.** Verificar `npx tsc --noEmit`.

### Tasca 2 — Queries d'usuari (account.ts)
**Agent:** Sonnet (lògica pura, multi-funció).
**Brief autosuficient:**
- Crear `src/db/queries/account.ts` amb tres funcions:
  - `getAccountSummary(userId: number)`: retorna `{ id, name, email, avatar_url, google_name, created_at, canconer_count, proposal_count, pending_proposal_count }`. Fa joins amb `canconers` i `songProposals`. Snake_case al retorn (vegeu [src/db/queries/utils.ts](src/db/queries/utils.ts) i exemple a [src/db/queries/admin.ts:41](src/db/queries/admin.ts#L41)).
  - `updateAccountName(userId: number, name: string)`: trim + valida (1–80 chars). Retorna `{ ok: true }` o `{ error, status }`.
  - `softDeleteAccount(userId: number)`: en una sola transacció `db.transaction(...)`, posa `active=0`, `name=''`, `email=<userId>@deleted.local` (per a satisfer la `email_unique` constraint), `avatar_url=NULL`, `google_id=<userId>@deleted.local` (per a satisfer `google_id_unique`). NO esborra cançoners ni propostes.
- Cap canvi en altres fitxers. Compleix TypeScript estricte.

### Tasca 3 — Route Handlers `/api/account`
**Agent:** Sonnet.
**Brief autosuficient:**
- Crear tres endpoints (cadascun amb `runtime = "nodejs"` i `dynamic = "force-dynamic"`):
  - `GET /api/account` → retorna `getAccountSummary(user.id)`. Usa `requireAuth()`.
  - `PATCH /api/account` → body `{ name: string }` (Zod). Crida `updateAccountName`. 400 si validació falla.
  - `DELETE /api/account` → crida `softDeleteAccount(user.id)`, fa logout server-side no és necessari (el client farà `signOut`). Retorna `{ ok: true }`.
- Patró de retorn d'errors: vegeu [src/app/api/admin/users/[id]/route.ts](src/app/api/admin/users/[id]/route.ts).
- Schemas Zod a `src/lib/schemas/account.ts` (nou fitxer).

### Tasca 4 — Modificar callback `signIn` per a preservar el nom editat
**Agent:** Opus (la sessió principal — té implicacions subtils).
**Què faig jo:**
- A [src/lib/auth.ts:43-48](src/lib/auth.ts#L43-L48), quan l'usuari ja existeix:
  - **NO sobreescriure `name`** si `existing.googleName` ja està fixat (l'usuari pot haver-lo canviat).
  - **Sí** actualitzar `avatarUrl` i `email` sempre (l'email de Google és la font de veritat per a comunicacions).
  - Si `existing.googleName` és `NULL` (usuari pre-migració o nou camp encara no inicialitzat), inicialitzar `googleName = name (de Google)` i `name = name (de Google)`.
- A la branca `else` (usuari nou), inicialitzar `googleName = name` en el primer insert.

### Tasca 5 — Component pàgina + targetes
**Agent:** Sonnet.
**Brief autosuficient:**
- Crear [src/app/app/account/page.tsx](src/app/app/account/page.tsx): Client Component (`"use client"`). Auth gate igual que [src/app/app/library/page.tsx:35-39](src/app/app/library/page.tsx#L35-L39). `AppHeader` amb `subtitle={t.app.account.titol}`, `backLink={{ href: "/app", label: t.app.library.backLink }}`, `actions={<UserWidget />}`. Fa `fetch("/api/account")` al muntar.
- Components a `src/components/account/`:
  - `ProfileCard.tsx` — avatar (`<img className="user-avatar-xl">` 96px) + email read-only + input nom controlat + botó "Guardar canvis" (deshabilitat si no hi ha canvis). En guardar, PATCH `/api/account` i toast via `useToastStore`.
  - `StatsCard.tsx` — llista de definicions (`<dl>`). Format dates amb `toLocaleDateString("ca-ES", ...)`. Plurals via funció al diccionari.
  - `DangerZoneCard.tsx` — text explicatiu + botó vermell. En clicar, mostra `<ConfirmDialog>` (reutilitzar el patró de [src/components/songbook/CanconerPanel.tsx](src/components/songbook/CanconerPanel.tsx) — confirmDescartarMissatge). Confirmació explícita: l'usuari ha d'escriure "ELIMINAR" en un input. En confirmar, `DELETE /api/account` → `signOut({ callbackUrl: "/" })`.
- Tot el text via `t.app.account.*` (no hardcoded).

### Tasca 6 — Estils CSS
**Agent:** Sonnet.
**Brief autosuficient:**
- Afegir a [src/app/globals.css](src/app/globals.css) (al final, secció nova `/* === COMPTE === */`):
  - `.account-grid` (CSS grid 2 cols, gap 1.5rem, responsive a 1 col a `max-width: 900px`).
  - `.account-card` (reutilitzar look de targeta blanca existent — consulta classes ja existents tipus `.card` o `.tab-panel` i agafa el to).
  - `.user-avatar-xl` (96×96 circular).
  - `.account-danger` (border `--danger` o `#c0392b`, subtle).
  - `.btn-danger` (botó vermell amb hover).
  - `.account-stat-row` (parella label/valor amb separador subtil).
- Tot via variables CSS existents. Coherent amb la paleta. **Cap canvi a [src/styles/song.css](src/styles/song.css).**

### Tasca 7 — Enllaç al UserWidget + nova clau al diccionari
**Agent:** Haiku.
**Brief autosuficient:**
- A [src/components/UserWidget.tsx:94](src/components/UserWidget.tsx#L94), afegir nou item de dropdown **abans** de "La teva Biblioteca": enllaç a `/app/account` amb un `IconUser` (afegir si no existeix a `src/components/shared/Icons.tsx` — usa SVG simple, vegeu altres icones del fitxer).
- Afegir al diccionari [src/lib/i18n/ca/app.ts](src/lib/i18n/ca/app.ts):
  - `userWidget.elMeuCompte: "El meu compte"`
  - Nova secció `account: { titol, backLink, profile: { titol, nomLabel, emailLabel, googleNameNota: (n: string) => \`Nom original de Google: ${n}\`, guardar, toastGuardat, toastError }, stats: { titol, membre, canconers, propostes, propostesPendents: (n: number) => ..., dataFormat: (d: string) => ... }, danger: { titol, descripcio, botoEliminar, confirmTitle, confirmMissatge, confirmInputLabel, confirmInputPlaceholder: "ELIMINAR", confirmBoto, toastEliminat, toastError } }`.

---

## Ordre d'execució suggerit

```
1 (Haiku, BD migració + schema)
  ↓
2 (Sonnet, queries)  +  4 (Opus, callback signIn)   ← en paral·lel
  ↓
3 (Sonnet, API routes)
  ↓
6 (Sonnet, CSS)   +   7 (Haiku, UserWidget + i18n)   ← en paral·lel
  ↓
5 (Sonnet, pàgina + components)
  ↓
Verificació final (Opus): `npx tsc --noEmit`, smoke test al navegador.
```

## Riscos i notes

- **Migració:** SQLite no necessita re-create per a afegir una columna nullable. Cap risc.
- **`email_unique` / `google_id_unique` en soft-delete:** per això omplim amb `<userId>@deleted.local` (únic per usuari).
- **JWT obsolet post-delete:** el token JWT viu fins a 30 dies, però el `session()` callback de [src/lib/auth.ts:97](src/lib/auth.ts#L97) ja filtra per `active=0` i retorna sessió buida. Per tant en signOut + qualsevol intent posterior, queda fora. Si l'usuari mai tornés a fer login amb el mateix Google, no podríem recuperar el compte (el `googleId` ja està anonimitzat). Acceptable.
- **No tocar:** `tsconfig.json`, `src/styles/song.css`, esquema d'altres taules.
- **Verificació manual:** crear compte de prova, editar nom, comprovar que un re-login no el sobreescriu, eliminar, verificar que la sessió no es pot restaurar.
