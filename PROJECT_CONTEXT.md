# El Cançoner — Context del projecte

> Document de referència per a futures sessions amb Claude. Llegeix-lo abans de tocar res.

## Què és el projecte

**El Cançoner** és una eina web per crear llibrets de cançons. Permet:

- Mantenir una base de dades de cançons amb lletra i acords (tags semàntics `<ch>` i `<sec>`).
- Crear cançoners personalitzats triant cançons, reordenant-les i transposant-les.
- Generar PDFs imprimibles amb portada, índex i pàgines de cançons.
- Comptes d'usuari amb Google OAuth: cada usuari té els seus cançoners guardats, pot compartir-los per enllaç públic i proposar noves cançons.
- Panell d'administració: estadístiques, revisió de propostes, gestió d'usuaris i cançoners.

L'app és en català. Tots els missatges d'UI, comentaris del codi i commits s'escriuen en català.

## Stack tècnic

| Capa | Tecnologia | Versió aproximada |
|---|---|---|
| Framework | Next.js (App Router) | 15 |
| UI | React | 19 |
| Llenguatge | TypeScript estricte | 5.6 |
| BD | better-sqlite3 (local, fitxer únic) | 11 |
| ORM | Drizzle | 0.36 |
| Auth | NextAuth v5 (Auth.js) amb provider Google, estratègia JWT | 5.0.0-beta.25 |
| Estat global client | Zustand | 5 |
| Drag-drop | @dnd-kit (core + sortable + utilities) | 6/8 |
| Validació | Zod | 3.23 |
| PDF | Puppeteer (Chromium headless) | 22 |
| Estilat | CSS global a `src/app/globals.css` + `src/styles/song.css` aïllat | — |

**Decisions importants:**
- Cap CSS-in-JS, cap Tailwind. CSS global tradicional amb variables (`--accent`, `--bg`, etc.).
- Les sessions NextAuth són **JWT** (no taules de BD). El callback `signIn` crea/actualitza l'usuari a la taula `users` existent.
- La BD viu al fitxer `data/canconer.db` (no entra al git via `.gitignore`).
- Hostatge previst: **servidor propi (VPS)**. Per això pots usar `puppeteer` complet (no `puppeteer-core` + `@sparticuz/chromium`).

## Estructura de directoris

```
w:/VSC/guitarreopuntcat/
├── .env                        Vars d'entorn (NextAuth + Google OAuth + DB_PATH)
├── .env.example                Plantilla buida
├── .gitignore                  Inclou node_modules, .next, *.db, data/, backups/
├── PROJECT_CONTEXT.md          ← AQUEST FITXER
├── data/canconer.db            BD SQLite (no entra a git)
├── backups/                    Snapshots manuals de la BD (no entra a git)
├── public/img/                 Estàtics: google.svg, etc.
├── drizzle.config.ts           Config de drizzle-kit (per migracions futures)
├── next.config.mjs             Config Next.js (serverExternalPackages per Puppeteer + better-sqlite3)
├── next-env.d.ts               Tipus de Next (no editar manualment)
├── package.json                Stack net post-tall (sense legacy)
├── tsconfig.json               TypeScript estricte amb paths "@/*" → "./src/*"
└── src/
    ├── app/                                   App Router
    │   ├── layout.tsx                          Layout arrel amb AuthProvider + suppressHydrationWarning
    │   ├── globals.css                         Tots els estils globals (≈2.500 línies)
    │   ├── page.tsx                            Server component que renderitza <SongbookEditor />
    │   ├── editor/page.tsx                     Pàgina /editor (crear/editar cançons)
    │   ├── my-canconers/page.tsx               Pàgina /my-canconers
    │   ├── admin/
    │   │   ├── layout.tsx                      Gate server: redirect si !admin
    │   │   └── page.tsx                        Dashboard amb pestanyes
    │   ├── c/[token]/page.tsx                  Vista pública compartida (server component)
    │   └── api/                                Route Handlers
    │       ├── auth/[...nextauth]/route.ts     NextAuth handler
    │       ├── health/route.ts                 Diagnòstic (compta files BD)
    │       ├── health-protected/route.ts       Prova de requireAuth
    │       ├── songs/route.ts                  GET/POST cançons
    │       ├── songs/[id]/route.ts             GET/PUT/DELETE
    │       ├── canconers/route.ts              GET/POST cançoners (auth)
    │       ├── canconers/[id]/route.ts         GET/DELETE
    │       ├── canconers/[id]/share/route.ts   POST enable/disable share token
    │       ├── canconers/shared/[token]/route.ts  GET públic (path fix)
    │       ├── proposals/route.ts              GET/POST
    │       ├── proposals/[id]/route.ts         PATCH (admin)
    │       ├── proposals/pending-count/route.ts  GET (admin)
    │       ├── admin/stats/route.ts            GET
    │       ├── admin/users/route.ts            GET
    │       ├── admin/users/[id]/route.ts       PATCH
    │       ├── admin/canconers/route.ts        GET
    │       ├── admin/canconers/[id]/route.ts   DELETE
    │       └── pdf/generate/route.ts           POST → blob PDF
    │
    ├── components/                            React components
    │   ├── AuthProvider.tsx                    Wrapper SessionProvider
    │   ├── LoginPopup.tsx                      Popup Google
    │   ├── UserWidget.tsx                      Avatar + dropdown
    │   ├── Toast.tsx                           <ToastHost />
    │   ├── songbook/                          Components de la pàgina principal /
    │   │   ├── SongbookEditor.tsx              Root client (orquestrador, monta/desmonta tot)
    │   │   ├── NewSongButton.tsx               Botó adaptatiu segons rol
    │   │   ├── SongList.tsx                    Col 1 (cerca + llista BD)
    │   │   ├── CanconerPanel.tsx               Col 2 (header + save + PDF + llista/grid)
    │   │   ├── CanconerList.tsx                Vista llista amb @dnd-kit/sortable
    │   │   ├── CanconerGrid.tsx                Vista compacta (sense drag-drop)
    │   │   ├── DetailPanel.tsx                 Col 3 (pestanyes Preview / Opcions)
    │   │   ├── KeyMenu.tsx                     Popover de selecció de tonalitat
    │   │   ├── OverwriteToast.tsx              Toast confirmació sobreescriure
    │   │   └── ProposeLoginToast.tsx           Toast convidant a logar-se
    │   ├── editor/                            Components de /editor
    │   │   ├── ChordEditor.tsx                 Textarea + highlight overlay (sincronitzats)
    │   │   ├── ChordPalette.tsx                Chips acords del to
    │   │   ├── ChordContextMenu.tsx            Menú clic dret amb posicionament viewport-aware
    │   │   ├── EditorToolbar.tsx               Botons Secció / Acord / Desfer / Refer + toggle preview
    │   │   ├── SongMetadataForm.tsx            Formulari controlat
    │   │   └── ProposeInfoPopup.tsx            Popup informatiu primera proposta
    │   ├── admin/                             Components de /admin
    │   │   ├── StatsCards.tsx
    │   │   ├── ProposalsTab.tsx + ReviewModal.tsx
    │   │   ├── SongsTab.tsx
    │   │   ├── UsersTab.tsx
    │   │   └── CanconersTab.tsx
    │   └── shared/                            Components de /c/[token]
    │       ├── SharedIndex.tsx                 Scroll-spy amb IntersectionObserver
    │       └── SharedPdfButton.tsx
    │
    ├── db/                                    Capa de dades
    │   ├── client.ts                            Singleton better-sqlite3 + drizzle wrapper
    │   ├── schema.ts                            5 taules: songs, users, canconers, canconerSongs, songProposals
    │   └── queries/
    │       ├── songs.ts                         listSongs, getSongById, createSong, updateSong, deleteSong
    │       ├── canconers.ts                     listMine, getById, getByToken, save/upsert, delete, toggleShare
    │       ├── proposals.ts                     listProposals, createProposal, reviewProposal, pendingCount
    │       ├── admin.ts                         stats, users, updateUser, allCanconers, deleteCanconer
    │       └── utils.ts                         Helpers mapping camelCase→snake_case per al JSON de resposta
    │
    ├── lib/                                   Lògica server + utilitats
    │   ├── auth.ts                              Config NextAuth + callbacks signIn/jwt/session
    │   ├── session.ts                           getSessionUser, requireAuth, requireAdmin
    │   ├── transpose.ts                         Motor de transposició (port de l'original)
    │   ├── canconerApi.ts                       Helper client per a save (usat per page i toast)
    │   ├── schemas/                             Schemas Zod per validació API
    │   │   ├── song.ts                          songInputSchema, songUpdateSchema, songQuerySchema
    │   │   ├── canconer.ts                      canconerSaveSchema, shareActionSchema
    │   │   └── proposal.ts                      proposalInputSchema, proposalReviewSchema
    │   └── pdf/
    │       ├── styles.ts                        Llegeix src/styles/song.css + constants per portada/índex
    │       ├── buildHtml.ts                     Construeix HTML complet del PDF
    │       └── generate.ts                      puppeteer.launch + page.pdf
    │
    ├── hooks/                                  Custom hooks i stores Zustand
    │   ├── useSongbook.ts                       STORE PRINCIPAL de la pàgina /
    │   │                                        (vegeu sota "Estat client")
    │   ├── useToasts.ts                         Cua de toasts globals
    │   ├── useUi.ts                             Booleans simples (popups visibles)
    │   └── useEditorHistory.ts                  Undo/redo amb stack + debounce
    │
    ├── styles/
    │   └── song.css                             ⚠ FONT ÚNICA dels estils <ch>/<sec>.
    │                                            Reutilitzat per globals.css i src/lib/pdf/styles.ts.
    │                                            Conté :root { --accent } perquè el PDF tingui la variable.
    │
    └── types/
        ├── song.ts                              Tipus compartits: SongSummary, CanconerEntry, etc.
        └── next-auth.d.ts                       Augmenta Session.user amb id, role, active
```

## Coses importants per situar-te

### 1. Format de les cançons

Les cançons són HTML amb dos tags semàntics:

```html
<sec>Estrofa 1</sec>
<ch>Am</ch>En un lloc de la <ch>F</ch>Manxa de quin <ch>C</ch>nom no vull...
```

- `<ch>X</ch>`: acord. Es renderitza posicionat per damunt de la lletra (CSS `position:relative; top:-12pt;`).
- `<sec>X</sec>`: títol de secció (— Estrofa —).

Aquest format es PRESERVA tal qual a la BD i NO s'ha de tocar. La transposició només manipula el contingut dels tags `<ch>`.

### 2. Estils de cançó: una sola font

L'arxiu `src/styles/song.css` és la **font única** d'estilat dels tags `<ch>` i `<sec>`. Es reutilitza a:

- `src/app/globals.css` via `@import "../styles/song.css"`.
- `src/lib/pdf/styles.ts` via `readFileSync()` al moment d'import.

Si l'usuari diu "canvia el color dels acords", el canvi va al `song.css` i es propaga a tots els llocs (vista prèvia, /c/[token], PDF).

### 3. Estat client de la pàgina principal

`src/hooks/useSongbook.ts` és un store Zustand que conté **tota la lògica de la pàgina /**. Camps clau:

- `songs`: llista cançons de la BD (col 1).
- `canconer`: array de `{ song, semitones }` (col 2).
- `selectedIdx`: índex seleccionat (col 3 preview).
- `allowedKeys: Set<string>`: tonalitats majors permeses.
- `previewActive: boolean`: col·lapsable col 3.
- Actions: `addToCanconer, removeFromCanconer, reorder, setSemitones, bumpSemitones, sortMode, applyAllowedKeys, openKeyMenu, ...`.

**Patró de consum**: usar selectors fins per evitar re-renders massius:

```tsx
const songs = useSongbookStore((s) => s.songs)         // ✅
const addToCanconer = useSongbookStore((s) => s.addToCanconer)  // ✅
// EVITAR: const store = useSongbookStore()  ❌ re-render a cada canvi
```

### 4. Tonalitats permeses i relació major/menor

L'app filtra cançons per tonalitats permeses. Cada botó del filtre representa una **tonalitat major** i el seu **relatiu menor** (C ⇄ Am, G ⇄ Em, etc.). El mapping és a la constant `RELATIVE_MINOR` a `useSongbook.ts`.

La funció `toMajorRoot(key)` retorna l'arrel major equivalent de qualsevol to (Am → C, F#m → A, etc.). La lògica de `applyAllowedKeys()` busca el major permès més proper a l'**arrel major equivalent** de la cançó (no a l'arrel literal). Això evita un bug subtil amb els relatius menors (vegeu commit que ho va corregir).

### 5. Drag-drop amb @dnd-kit

A `CanconerList.tsx`, el `PointerSensor` està configurat amb `activationConstraint: { distance: 5 }`. Això **és essencial**: sense això, qualsevol click curt activa el drag i no es propaga al `onClick` (els elements no es poden seleccionar). 5px és el threshold mínim per iniciar drag.

### 6. NextAuth: estratègia JWT

- No usem cap adapter de BD (no taules `account`, `session`, `verificationToken`).
- El callback `signIn` crea/actualitza l'usuari a la nostra taula `users` existent (compatible amb les dades antigues).
- El callback `session` enriqueix la sessió amb `id`, `role`, `active` llegits de la BD a cada request.
- `getSessionUser()` retorna `null` si l'usuari ha estat desactivat (filtra per `active`).

### 7. PDF: bloqueja el procés

Puppeteer llança Chromium per cada PDF (no hi ha pool). Trigada típica: ~7 segons per a 3 cançons. Per millorar caldria mantenir un browser obert entre requests, però per al volum esperat no cal.

### 8. Auth gate per pàgina

- `/` → pública (mostra "Inicia sessió" si no hi ha user, no bloqueja l'editor).
- `/editor` → gate al client (`useSession` + `router.replace("/")` si !user).
- `/my-canconers` → gate al client igual.
- `/admin` → gate al **server** (`src/app/admin/layout.tsx` → `redirect("/")` si !admin). Més segur perquè ningú veu el HTML.
- `/c/[token]` → pública (sense gate).

### 9. API: snake_case al JSON

Drizzle retorna objectes JS amb camelCase (`createdAt`, `userId`, etc.). El **frontend espera snake_case** (`created_at`, `user_id`, etc.) per compatibilitat amb el format antic. Els helpers de `src/db/queries/utils.ts` fan el mapping abans de respondre.

Si afegeixes un endpoint nou, segueix la mateixa convenció.

### 10. Variables i convencions

- **Catalá a tot**: missatges UI, comentaris (quan els hi posis), commits, error messages.
- **Cap emoji al codi** llevat dels que ja existeixen a la UI (preserva'ls).
- **TypeScript estricte**: cap `any`. Si no saps el tipus, usa `unknown` i fes el narrowing.
- **Cada Route Handler ha de tenir**: `export const runtime = "nodejs"` i `export const dynamic = "force-dynamic"`.
- **Toasts**: usa `useToastStore().show(msg, { type?: "error" })` en lloc d'`alert()`.

## Forma de treballar (com fer noves sessions amb Claude)

### Quan obris una sessió nova

1. **Comparteix aquest fitxer** o digues a Claude que el llegeixi: `"llegeix PROJECT_CONTEXT.md per situar-te"`.
2. Descriu la tasca específica que vols fer.
3. Si la tasca és gran (afegir una secció nova, refactor important), demana primer un **pla en plan mode**. Si és petita (canviar un text, fix d'un bug concret), Claude pot anar directe a l'edició.

### Patró que va funcionar bé a la migració

| Tipus de tasca | Qui ho fa | Per què |
|---|---|---|
| Arquitectura, decisions de tipus, store Zustand, lògica subtil | Opus (el model que té sessió principal) | Decisions amb impacte llarg |
| Implementació de components React, Route Handlers, queries Drizzle | **Sub-agent Sonnet** amb brief detallat | Estalvi de crèdits per feina volumosa |
| Refactors mecànics (renomenar, port literal d'un mòdul a TS) | **Sub-agent Haiku** | Encara més estalvi |

**Com llançar un sub-agent**: usa l'eina `Agent` amb `subagent_type: "general-purpose"` i `model: "sonnet"` o `"haiku"`. El prompt ha de ser **autosuficient** (l'agent no veu la conversa, comença de zero). Inclou:
- Què existeix ja al codi i no s'ha de tocar.
- Quin contracte (props, retorn) ha de complir el que crea.
- Quina convenció seguir (snake_case JSON, runtime nodejs, etc.).
- Què cal verificar al final (`tsc --noEmit`, smoke test concret).

**Exemple del prompt que va funcionar per a la Fase 4** (capa de dades):
> "Estàs implementant la Fase 4 [...]. Path arrel: w:/VSC/guitarreopuntcat/. Esquema Drizzle: src/db/schema.ts (ja existeix, NO el toquis). Helpers de sessió: src/lib/session.ts amb signatura `requireAuth(): Promise<{ user } | NextResponse>`. [...] Crea 5 fitxers de queries i els Route Handlers corresponents. Per cada handler: [llista del shape JSON exacte]. [...] Al final: tsc --noEmit ha de passar. Reporta fitxers creats i decisions preses."

### Eines útils

- **TodoWrite**: si tens una tasca amb 3+ passos, fes-ne una llista. Es manté entre torns i mostra el progrés.
- **AskUserQuestion**: per decisions on convé alinear-se abans d'actuar (ex: "vols X o Y?").
- **Plan mode** (`ExitPlanMode`): per a tasques grans on convé escriure el pla a un fitxer abans de tocar codi.
- **Bash en background** (`run_in_background: true`): per `npm install`, `npx next dev`, etc. — així no bloqueges la sessió.

### Trucs específics d'aquest projecte

- **Si veus errors estranys després de canvis estructurals** (esborrar carpetes, canviar package.json...): mata processos node + esborra `.next/` + arrenca de nou.
  ```bash
  taskkill //F //IM node.exe
  rm -rf .next
  npx next dev
  ```
- **Si reinstal·les dependències**: `rm -rf node_modules package-lock.json && npm install`. Cal recompilar el binari natiu de `better-sqlite3`.
- **Per provar PDFs**: `curl -X POST http://localhost:3000/api/pdf/generate -H "Content-Type: application/json" -d '{"songs":[{"id":1,"semitones":0}]}'` (cal ser admin o el JSON shape correcte).
- **Per fer reset de dades**: és un fitxer SQLite a `data/canconer.db`. Pots inspeccionar-lo amb `sqlite3 data/canconer.db ".tables"` o amb DB Browser for SQLite. Els backups van a `backups/`.

### Què no esborrar mai

- `node_modules/` (necessari per executar)
- `data/canconer.db` (les dades dels usuaris reals)
- `.env` (credencials)
- `package-lock.json` (lock de versions)

### Què és segur esborrar

- `.next/` (es regenera amb `npx next dev`)
- `tsconfig.tsbuildinfo` (cache de TS, es regenera)
- `backups/*.db` antics (manualment, quan ja no els necessites)

## Historial de la migració

El projecte va passar d'Express + vanilla JS + better-sqlite3 a aquest stack en 10 fases planificades. El pla complet (amb context històric) era a `C:\Users\aimar\.claude\plans\aquest-projecte-s-una-golden-bunny.md`. Pots esborrar-lo si no el necessites — la documentació viva és aquest fitxer.

Si vols tornar a fer una migració similar o reescriure una part gran, repeteix el patró: fase de exploració → pla → implementació amb sub-agents → verificació al navegador → cleanup.
