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

| Capa | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 |
| Llenguatge | TypeScript estricte 5.6 |
| BD | better-sqlite3 (fitxer únic) + Drizzle ORM 0.36 |
| Auth | NextAuth v5 (Google, estratègia JWT) |
| Estat global client | Zustand 5 |
| Drag-drop (cançoner) | @dnd-kit |
| Validació | Zod |
| PDF | Puppeteer (Chromium headless) |
| Estilat | CSS global a `src/app/globals.css` + `src/styles/song.css` aïllat |

**Decisions importants:**
- Cap CSS-in-JS, cap Tailwind. CSS global tradicional amb variables (`--accent`, `--bg`, etc.).
- Sessions NextAuth són **JWT** (no taules de BD). El callback `signIn` crea/actualitza l'usuari a `users`.
- BD viu a `data/canconer.db` (no entra a git).
- Hostatge previst: **VPS propi**. Per això pots usar `puppeteer` complet (no `puppeteer-core`).
- `tsconfig.json` té `"ignoreDeprecations": "6.0"` intencionalment. **No el toquis.**

## Estructura de directoris (resum)

```
src/
├── app/
│   ├── globals.css                         Tots els estils globals (≈3.000 línies)
│   ├── page.tsx                            Pàgina principal
│   ├── editor/page.tsx                     Pàgina /editor (crear/editar cançons, WYSIWYG)
│   ├── my-canconers/page.tsx
│   ├── admin/{layout,page}.tsx             Gate server-side admin + dashboard
│   ├── c/[token]/page.tsx                  Vista pública compartida
│   └── api/                                Route Handlers (songs, canconers, proposals, admin, pdf, import)
│
├── components/
│   ├── songbook/                           Components de /
│   ├── editor/                             Components de /editor (vegeu §1 sota)
│   ├── admin/                              StatsCards, ProposalsTab, SongsTab, UsersTab, CanconersTab
│   └── shared/                             SharedIndex (scroll-spy), SharedPdfButton
│
├── db/
│   ├── client.ts                           Singleton better-sqlite3 + drizzle
│   ├── schema.ts                           5 taules: songs, users, canconers, canconerSongs, songProposals
│   └── queries/                            Una sublib per taula + utils.ts (camelCase→snake_case)
│
├── lib/
│   ├── auth.ts                             Config NextAuth (signIn/jwt/session callbacks)
│   ├── session.ts                          getSessionUser, requireAuth, requireAdmin
│   ├── transpose.ts                        Motor de transposició
│   ├── editor/                             Lògica WYSIWYG: model.ts, sections.ts, chordFunctions.ts
│   ├── schemas/                            Schemas Zod per validació API
│   ├── pdf/                                styles.ts + buildHtml.ts + generate.ts
│   └── importers/                          Importadors URL → ImportResult (admin)
│
├── hooks/
│   ├── useSongbook.ts                      STORE PRINCIPAL Zustand de la pàgina /
│   ├── useToasts.ts                        Cua de toasts globals
│   ├── useUi.ts                            Booleans simples (popups)
│   └── useEditorHistory.ts                 Undo/redo amb stack + debounce
│
├── styles/song.css                         ⚠ FONT ÚNICA dels estils <ch>/<sec> (vegeu §3).
└── types/                                  SongSummary, CanconerEntry, etc.
```

## Coses importants per situar-te

### 1. Editor de cançons WYSIWYG (`/editor`)

L'editor és **WYSIWYG amb model intern**: l'usuari no veu els tags `<ch>` ni `<sec>`; els veu renderitzats. La BD però **conserva el format `<ch>X</ch>` i `<sec>X</sec>`** sense canvis.

**Components a `src/components/editor/`:**
- `WysiwygEditor.tsx` — el core. ContentEditable amb model `Doc/Block/Inline` intern, sync DOM↔model bidireccional, listener natiu `beforeinput` (React 19 no propaga aquest event de forma fiable a contentEditable a Firefox).
- `SongHeader.tsx` — capçalera amb títol/artista inline-editables (requadre dashed faint indica que són editables) + badge de tonalitat que obre `KeyPicker`.
- `KeyPicker.tsx` — popover 6×4 (3 files majors + 3 files menors) per a triar tonalitat.
- `SectionContextMenu.tsx` — menú amb tipus de secció. Modes `insert` i `modify` (modify té botó eliminar a dalt + tipus actual marcat).
- `ChordContextMenu.tsx` — menú compacte 3-col: ACORDS DEL TO + CROMÀTICS + MODIFICADOR. Sempre hi ha un modificador actiu (`-` per defecte = cap modificador). Clicar un modificador NO tanca el menú.
- `EditorToolbar.tsx` — sticky, amb botons Secció / Acord / Desfer / Refer / Reset / Guardar.
- `ConfirmToast.tsx` — toast de confirmació per a Reset i Guardar.

**Lògica a `src/lib/editor/`:**
- `model.ts` — `parse(raw)`/`serialize(doc)` round-trippable. Tipus `Doc = { blocks: Block[] }`, `Block = section|lyric|empty`, `Inline = text|chord`.
- `sections.ts` — `SECTION_TYPES` (Estrofa, Tornada, Pre-tornada, Pont, Solo, Instrumental, Interludi, Intro, Outro), `nextSectionName` (només Estrofa s'autonumera), `renumberEstrofas`.
- `chordFunctions.ts` — `chordsByFunction(key)` retorna `{tonic, subdominant, dominant, chromatic}` segons funció tonal; `CHORD_MODIFIERS` + `applyModifier` + `stripModifier`.

**Convencions del ratolí:**
- Clic esquerre: selecció normal de text.
- Clic mig: obre menú de seccions (mode modify si sobre secció, insert altrament).
- Clic dret: obre menú d'acords (mode modify si sobre acord) o menú modificar secció (si sobre secció).
- Obrir un menú **tanca** automàticament l'altre.
- Drag-and-drop d'acords/seccions amb threshold 5px.

**Estat desactivat:** mentre no s'ha seleccionat tonalitat, l'editor es renderitza amb `disabledReason` que el mostra atenuat i amb missatge "Selecciona la tonalitat per a començar la cançó".

### 2. Format de les cançons (BD)

```html
<sec>Estrofa 1</sec>
<ch>Am</ch>En un lloc de la <ch>F</ch>Manxa de quin <ch>C</ch>nom no vull...
```

- `<ch>X</ch>`: acord. Renderitzat per damunt de la lletra (CSS `position:relative; top:-12pt;`).
- `<sec>X</sec>`: títol de secció.

Aquest format es **PRESERVA tal qual a la BD i NO s'ha de tocar**. La transposició només manipula el contingut de `<ch>`.

### 3. Estils de cançó: una sola font

`src/styles/song.css` és la **font única** d'estilat dels tags `<ch>` i `<sec>`. Reutilitzat a:
- `src/app/globals.css` via `@import "../styles/song.css"`.
- `src/lib/pdf/styles.ts` via `readFileSync()` al moment d'import.

Si l'usuari demana "canvia el color dels acords", el canvi va a `song.css` i es propaga a vista prèvia, /c/[token] i PDF. **No el toquis** llevat que el canvi sigui semànticament del format de sortida.

### 4. Estat client de la pàgina principal

`src/hooks/useSongbook.ts` és el store Zustand amb tota la lògica de `/`. Camps: `songs`, `canconer`, `selectedIdx`, `allowedKeys: Set<string>`, `previewActive`, etc. Actions: `addToCanconer`, `reorder`, `setSemitones`, `applyAllowedKeys`, etc.

**Consum**: usa selectors fins per evitar re-renders massius.
```tsx
const songs = useSongbookStore((s) => s.songs)         // ✅
// EVITAR: const store = useSongbookStore()  ❌
```

### 5. Tonalitats permeses i relació major/menor

Cada botó del filtre representa una **tonalitat major + el seu relatiu menor** (C ⇄ Am). El mapping és a `RELATIVE_MINOR` a `useSongbook.ts`. `toMajorRoot(key)` retorna l'arrel major equivalent. `applyAllowedKeys()` busca el major permès més proper a l'**arrel major equivalent** (no a l'arrel literal) — evita un bug subtil amb menors.

### 6. Drag-drop amb @dnd-kit (cançoner)

A `CanconerList.tsx`, `PointerSensor` té `activationConstraint: { distance: 5 }`. Sense això, qualsevol click curt activa el drag i bloqueja l'`onClick`. 5px és el threshold mínim.

### 7. NextAuth: estratègia JWT

- No usem cap adapter de BD (no `account`/`session`/`verificationToken`).
- Callback `signIn` crea/actualitza l'usuari a la taula `users`.
- Callback `session` enriqueix amb `id`, `role`, `active` llegits de la BD a cada request.
- `getSessionUser()` retorna `null` si l'usuari està desactivat.

### 8. PDF

Puppeteer llança Chromium per cada PDF (no hi ha pool). Trigada típica: ~7s per 3 cançons.

### 9. Auth gate per pàgina

- `/` → pública.
- `/editor`, `/my-canconers` → gate al client (`useSession` + redirect).
- `/admin` → gate al **server** (`src/app/admin/layout.tsx`).
- `/c/[token]` → pública.

### 10. API: snake_case al JSON

Drizzle retorna camelCase (`createdAt`); el frontend espera snake_case (`created_at`). Els helpers de `src/db/queries/utils.ts` fan el mapping. Si afegeixes un endpoint nou, segueix la mateixa convenció.

### 11. Convencions generals

- **Català a tot**: UI, comentaris, commits, missatges d'error.
- **TypeScript estricte**: cap `any`. Si no saps el tipus, usa `unknown` i fes narrowing.
- **Cada Route Handler**: `export const runtime = "nodejs"` i `export const dynamic = "force-dynamic"`.
- **Toasts**: `useToastStore.getState().show(msg, { type?: "error" })` — no `alert()`.
- **Cap emoji al codi** llevat dels que ja existeixen a la UI.

### 12. Importadors de cançons des d'URL (admin)

L'editor té un mode "import URL" per a admins: `NewSongStartPopup` enganxa una URL i pre-omple l'editor amb lletra + acords + metadades.

**Arquitectura:**
- `src/lib/importers/types.ts` — interfície `Importer { host, match, fetch, parse }` + `ImportResult { title, artist, key, capo, language, tags, content }`.
- `src/lib/importers/index.ts` — registre `IMPORTERS: Importer[]` + `findImporter`, `isSupportedUrl`, `SUPPORTED_HOSTS`.
- `src/lib/importers/fetch.ts` — `defaultFetch` (UA realista Chrome, timeout 10s, límit 2 MB).
- `POST /api/songs/import` (admin-only) valida URL amb Zod i fa dispatch.

**Per afegir suport a una nova web:** crea `src/lib/importers/<nomweb>.ts` exportant un `Importer` i registra'l a `IMPORTERS`. La resta funciona automàticament.

**Format de sortida (`content`):**
- Acords en notació anglesa (`C`, `D#`, `Am`). Si la font usa catalana/italiana o bemolls, normalitza a anglesa amb sostinguts (`Bb` → `A#`).
- Insereix `<ch>X</ch>` dins la línia de lletra a la columna correcta (derivada del nombre d'espais entre acords).
- Seccions: emet `<sec>Estrofa N</sec>`, `<sec>Tornada</sec>`, etc. segons pistes (negreta, etiquetes, capçaleres).
- `key`: la primera arrel d'acord; afegeix `m` si menor.
- `language`: dedueix de la URL (`/ca/`, `/es/`) o `"ca"` per defecte.

**Patrons a vigilar:**
- HTML del cos sovint dins `<pre>`. `node-html-parser` NO descendeix dins `<pre>` — processa amb regex o marcadors `\x01`/`\x02` abans de tallar per línies.
- Entitats HTML (`&agrave;`, `&ccedil;`, `&#39;`): reutilitza el `decode()` d'`acordscatala.ts`.
- Normalitza CRLF → LF.

Vegeu `acordscatala.ts` com a exemple de referència (parsing en català amb negreta=tornada, conversió SOL→G, DO→C, etc.).

**Provar un parser nou en local:** baixa una mostra amb `curl`, escriu un `.tmp-test.ts` que importi el parser i l'executi via `npx tsx`. Esborra `.tmp-*` quan acabis.

## Forma de treballar amb Claude

### Quan obris una sessió nova

1. Comparteix aquest fitxer: `"llegeix PROJECT_CONTEXT.md per situar-te"`.
2. Descriu la tasca.
3. Si la tasca és gran, demana primer un **pla en plan mode**. Si és petita, ves directe.

### Patró que va funcionar bé

| Tipus de tasca | Qui ho fa |
|---|---|
| Arquitectura, lògica subtil, decisions de tipus | Opus (sessió principal) |
| Components React, Route Handlers, queries Drizzle | Sub-agent Sonnet amb brief detallat |
| Refactors mecànics (renomenar, port literal) | Sub-agent Haiku |

**Sub-agent**: `Agent` amb `subagent_type: "general-purpose"` i `model: "sonnet"|"haiku"`. El prompt ha de ser **autosuficient** (l'agent no veu la conversa). Inclou:
- Què existeix i no s'ha de tocar.
- Contracte (props/retorn) del que crea.
- Convencions (snake_case JSON, runtime nodejs, etc.).
- Verificació final (`tsc --noEmit`, smoke test).
- **No tocar `tsconfig.json`** (té `ignoreDeprecations: "6.0"`).
- **No tocar `src/styles/song.css`** llevat que sigui sobre el format de sortida.

### Eines útils

- **TodoWrite**: per tasques amb 3+ passos.
- **AskUserQuestion**: per decisions on convé alinear-se abans d'actuar.
- **Plan mode** (`ExitPlanMode`): per a tasques grans on convé escriure pla a un fitxer.
- **Bash background** (`run_in_background: true`): per `npx next dev`, `npm install`, etc.

### Trucs específics

- **Errors estranys després de canvis estructurals**: `taskkill //F //IM node.exe`, `rm -rf .next`, `npx next dev`.
- **Reinstal·lar deps**: `rm -rf node_modules package-lock.json && npm install` (recompila `better-sqlite3`).
- **Provar PDF**: `curl -X POST http://localhost:3000/api/pdf/generate -H "Content-Type: application/json" -d '{"songs":[{"id":1,"semitones":0}]}'`.
- **Inspeccionar BD**: `sqlite3 data/canconer.db ".tables"` o DB Browser for SQLite. Backups a `backups/`.

### Què no esborrar mai

- `node_modules/`, `data/canconer.db`, `.env`, `package-lock.json`.

### Què és segur esborrar

- `.next/` (es regenera), `tsconfig.tsbuildinfo` (cache TS), `backups/*.db` antics.
