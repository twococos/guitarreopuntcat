# Pla d'implementació — Portada pública + pàgines de cançons

> Pla per a transformar el projecte: la pàgina principal passa a ser una **portada pública** amb buscador de cançons (com una web d'acords clàssica), i l'actual editor de cançoners (i tota l'app) es mou sota el prefix `/app`.

---

## 1. Visió general

### Objectiu

Convertir guitarreo.cat en una web amb dues capes:

1. **Capa pública** (SEO-first, anònima): portada, buscador, pàgines individuals de cançons, índex, *El projecte*, *Contacte*. Pensada per a usuaris que arriben des de Google buscant una cançó.
2. **Capa app** (`/app/...`): tot l'ecosistema actual del cançoner — editor de cançoners, /editor de cançons, /library, /admin, /c/[token]. La porta d'entrada des de la portada és un botó "Crea un cançoner" o, des d'una cançó, "Comença un cançoner amb aquesta cançó".

### Decisions ja preses (per l'usuari)

- **Estructura:** tot sota `/app/` (sense subdomini).
- **Vista de cançó:** reutilitzar el render actual de `<ch>`/`<sec>` + barra de controls (transposició, autoscroll, mida).
- **URLs:** `/songs/[artist-slug]/[song-slug]` amb cerca server-side.
- **Portada:** logo `/public/img/Logo.png`, paleta actual (`--accent`, `--bg`...), hero amb buscador prominent.

### Mapa de rutes resultant

```
PÚBLIC
/                              Portada (hero + buscador + accés a /app)
/songs                         Índex (per lletra / per artista — toggle)
/songs/[artist]                Pàgina d'artista (llista de cançons)
/songs/[artist]/[song]         Vista pública d'una cançó
/c/[token]                     Vista pública d'un cançoner compartit (mantinguda)
/projecte                      Descripció del projecte (placeholder)
/contacte                      Contacte (placeholder)
/api/songs/search              Endpoint de cerca unificat (cançons + artistes)
/api/songs/index               Endpoint de l'índex (per lletra / per artista)
/api/artists/[slug]            Endpoint d'una pàgina d'artista (opcional)

APP (gate auth com ara)
/app                           Editor de cançoners (l'antic /)
/app/editor                    Editor de cançons (l'antic /editor)
/app/library                   Els meus cançoners
/app/admin                     Panell admin

API (no es mou)
/api/*                         Tots els endpoints actuals
```

**Nota important:** com que `/songs/[artist]` i `/songs/[artist]/[song]` comparteixen el primer segment, el slug d'artista ha de ser **únic globalment** (no només dins de combinació amb song). La Fase 2 ho garanteix.

---

## 2. Fases d'implementació

El pla està dividit en **6 fases** ordenades per dependències. Cada fase és un PR independent (recomanat) o un commit dins d'una branca llarga.

```
Fase 1  Re-ubicació de l'app a /app/        ← refactor mecànic, base de la resta
Fase 2  Slugs i utilitats de routing        ← afegir slugs a la BD
Fase 3  Endpoints públics                   ← search unificat + index
Fase 4  Vista pública de cançó              ← /songs/[artist]/[song]
Fase 5  Pàgina d'artista                    ← /songs/[artist]
Fase 6  Portada + buscador + nav            ← /, /projecte, /contacte
Fase 7  Índex (per lletra + per artista)    ← /songs
```

---

## 3. Detall per fases

### Fase 1 — Re-ubicació de l'app sota `/app/`

**Objectiu:** moure tot el contingut actual de l'app dins `/app/` sense canviar cap funcionalitat. Quan acabi aquesta fase, l'usuari accedeix a l'editor de cançoners via `/app` en lloc de `/`.

**Tasques:**

1. **Moure fitxers** (refactor mecànic):
   - `src/app/page.tsx` → `src/app/app/page.tsx`
   - `src/app/editor/` → `src/app/app/editor/`
   - `src/app/library/` → `src/app/app/library/`
   - `src/app/admin/` → `src/app/app/admin/`
   - `src/app/c/[token]/` → `src/app/app/c/[token]/`
   - **No** moure `src/app/api/` (els endpoints es queden on són).
   - **No** moure `src/app/globals.css` ni `src/app/layout.tsx` (queden al root).

2. **Actualitzar links/redirects interns**. Buscar i substituir referències cap a les rutes mogudes:
   - `router.push("/")` → `router.push("/app")`
   - `<Link href="/library">` → `<Link href="/app/library">`
   - `<Link href="/editor">` → `<Link href="/app/editor">`
   - `<Link href="/admin">` → `<Link href="/app/admin")`
   - URL del cançoner compartit (`/c/${token}`) → `/app/c/${token}` (la lògica que genera `shareToken` no canvia, però la URL que copiem al porta-retalls sí — buscar a `CanconerPanel`, `ShareButton`, etc.).
   - `UserWidget`, `LoginPopup` (el `callbackUrl` per defecte).
   - `next-auth` callbacks: `signIn` callback i `redirect` callback — comprovar que tornen `/app` per defecte si la sessió s'acaba d'iniciar des de l'app.

3. **Layout específic de l'app**: crear `src/app/app/layout.tsx` que importi qualsevol provider/wrapper que ara estigui al layout principal i que sigui específic de l'app. (Sospito que ara és tot al root layout; deixar-ho així si funciona, és opcional.)

4. **Verificació de tipus i navegació**:
   - `npx tsc --noEmit`
   - Engegar dev server, login, crear cançoner, /editor, /library, /admin, compartir cançoner i obrir-lo amb el token nou.

**Què NO tocar:**
- `src/app/api/*`
- `src/db/`, `src/lib/`, `src/hooks/`
- `src/styles/song.css`

**Risc:** alt en cerca-substitució (URLs hard-coded enmig del codi). Cal buscar `"/"`, `"/editor"`, `"/library"`, `"/admin"`, `"/c/"` i revisar context per context.

**Delegació:** `Sonnet` — el refactor és gran però mecànic; un brief detallat amb la llista exacta de rutes a substituir és suficient. Opus revisa el resultat.

**Verificació final del subagent:**
- `npx tsc --noEmit` neta.
- `npx next build` neta.
- Llista de rutes que continuen "ofegades" (no s'han pogut moure automàticament) i per què.

---

### Fase 2 — Slugs a la BD i utilitats de routing

**Objectiu:** que cada cançó tingui slugs estables d'artista i títol per a poder construir URLs com `/songs/els-amics-de-les-arts/lhomme-statique`.

**Decisions de disseny:**

- Slugs **persistits a la BD** (no calculats on-the-fly): més ràpid al render i estable encara que canviï l'algoritme de slugificació.
- **`artist_slug` és únic globalment** per cada artista — totes les cançons d'"Els Amics de les Arts" tenen `artist_slug = "els-amics-de-les-arts"`. Imprescindible perquè `/songs/[artist]` (pàgina d'artista) funcioni: si dos artistes amb noms diferents col·lidissin al mateix slug, una de les pàgines d'artista quedaria inaccessible.
- Combinació `(artist_slug, song_slug)` ha de ser única dins d'un mateix artista. Si dues cançons col·lideixen (ex.: dos "Hallelujah" del mateix artista), el segon afegeix `-2`, `-3`, etc.
- Si l'artista o el títol es modifiquen, el slug **no es regenera automàticament** (per no trencar enllaços externs). Hi haurà una acció admin "regenerar slug" si cal.

**Conseqüència:** durant la migració cal **agrupar cançons per artista** primer. Totes les cançons amb mateix `artist` (cadena exacta, case-insensitive amb diacrítics normalitzats) reben el mateix `artist_slug`. Si dos artistes diferents produeixen el mateix slug (ex.: "Manel" i "Mañel"), resoldre la col·lisió afegint `-2` al segon i caldrà una revisió manual posterior — el script ha d'emetre un log d'aquests casos.

**Tasques:**

1. **Schema**: a `src/db/schema.ts`, afegir columnes a `songs`:
   ```ts
   artistSlug: text("artist_slug"),
   songSlug: text("song_slug"),
   ```
   I un índex únic compost `(artistSlug, songSlug)`.

2. **Migració**:
   - Crear `src/db/migrations/add_slugs.ts` (o seguir el patró existent — comprovar com es fan les migracions actuals).
   - Algoritme:
     1. SELECT tots els `(id, artist, title)` ordenats per `id` (estable).
     2. Agrupar per `artist` normalitzat (NFD + diacrítics fora + lowercase). Per cada grup, calcular `artist_slug` base i resoldre col·lisions entre grups diferents (sufix `-2`...) — log d'aquests casos.
     3. Per cada cançó dins un grup, calcular `song_slug` base i resoldre col·lisions dins el grup.
     4. UPDATE en una transacció.
   - **Idempotent**: si una cançó ja té slugs, no els toca.

3. **Helper**: `src/lib/slugify.ts` amb:
   ```ts
   export function slugify(text: string): string
   export async function generateUniqueSlug(
     artistSlug: string,
     baseSongSlug: string
   ): Promise<string>
   ```
   - Slugify: minúscules, NFD, treure diacrítics, espais→`-`, treure caràcters no `[a-z0-9-]`, collapse `--`, trim `-`.
   - Casos especials: `'` → res, `ç` → `c`, `·` → res, `&` → `i` (català).

4. **Integració a creació/edició de cançons**:
   - `POST /api/songs`: generar slugs. Per `artist_slug`, buscar si ja existeix una cançó amb el mateix `artist` (normalitzat) i reutilitzar-ne el slug; si no, generar-lo nou (i resoldre col·lisió global). Per `song_slug`, resoldre col·lisió dins l'artista.
   - `PUT /api/songs/[id]`: si s'edita `artist` o `title`, **no** tocar els slugs existents. Documentar-ho amb un comentari.
   - **Cas especial**: si una cançó canvia d'artista a un que ja té slug, mantenir el `song_slug` original però **això pot trencar la coherència** (cançó visible sota un artist_slug, però el `artist` mostrat és un altre). Decisió: en aquest cas SÍ regenerar `artist_slug` per coherència, però només quan tot el grup d'artist canvia. Documentar-ho com a edge case poc freqüent.

5. **Endpoint admin per regenerar slug** (opcional, baixa prioritat): `POST /api/admin/songs/[id]/regenerate-slug`.

**Què NO tocar:**
- El contingut HTML de les cançons (`content`).
- El format `<ch>`/`<sec>`.

**Delegació:** `Sonnet` — toca BD i lògica delicada de col·lisions. Opus revisa la migració abans d'executar-la.

**Verificació:**
- Executar migració contra una còpia de la BD a `data/canconer.db.bak`.
- `SELECT artist, title, artist_slug, song_slug FROM songs ORDER BY artist, title LIMIT 30;` — inspecció visual.
- Test: dues cançons amb mateix títol del mateix artista → segona té sufix `-2`.

---

### Fase 3 — Endpoints públics de cançons

**Objectiu:** API que la portada i l'índex consumiran.

**Tasques:**

1. **`GET /api/songs/search?q=...&limit=20`** (cerca unificada):
   - Públic (sense gate auth).
   - Filtra cançons amb `state = 0` (públiques) per `title` o `artist` (`LIKE %q%`, case-insensitive, normalitzar diacrítics).
   - Retorna **dos blocs**: artistes i cançons.
     ```json
     {
       "artists": [{ "name": "Els Amics de les Arts", "slug": "els-amics-de-les-arts", "song_count": 12 }],
       "songs":   [{ "id": 42, "title": "Jean-Luc", "artist": "...", "artist_slug": "...", "song_slug": "...", "key": "G" }]
     }
     ```
   - Els artistes apareixen si `q` coincideix amb el nom de l'artista (LIKE). Agrupats a partir de la taula `songs` (`SELECT DISTINCT artist, artist_slug, COUNT(*) FROM songs WHERE state=0 GROUP BY artist_slug`).
   - Si `q` és buit, retorna les cançons més recents (artistes buits).
   - **Limit max 50** per bloc. Sense paginació en aquesta primera versió.

2. **`GET /api/songs/by-slug/[artistSlug]/[songSlug]`** (opcional — alternativa: fer la query directament al Server Component):
   - Públic.
   - Retorna `{ id, title, artist, key, capo, content, language, album?, year?, youtube_url?, spotify_url? }` o 404.
   - **Decisió recomanada:** ometre aquest endpoint i fer la query al server component de `/songs/[artist]/[song]/page.tsx`. Menys codi i el render és server-side igual. Sí que ens cal un helper a `src/db/queries/songs.ts`: `getSongBySlug(artistSlug, songSlug)`.

3. **`GET /api/songs/index?by=letter|artist`** (per a l'índex `/songs`):
   - Públic.
   - `by=letter`: retorna cançons agrupades per inicial del títol. Resposta: `{ "A": [...], "B": [...], ... }` amb camps `{ id, title, artist, artist_slug, song_slug, key }`.
   - `by=artist`: retorna **artistes** agrupats per inicial del nom d'artista. Resposta: `{ "A": [{ name, slug, song_count }, ...], ... }`. NO retorna cançons individuals (les veurà l'usuari clicant l'artista).
   - Cap paginació; per ara assumim el catàleg cap a memòria.

4. **`GET /api/artists/[slug]`** (per a la pàgina d'artista) — **opcional**, alternativa: query directa al server component:
   - Retorna `{ name, slug, songs: [{ id, title, song_slug, key, year?, album? }] }` ordenades alfabèticament o per any.
   - 404 si no hi ha cap cançó pública amb aquell `artist_slug`.
   - **Decisió recomanada:** ometre i fer la query al server component. Helper a `src/db/queries/songs.ts`: `getArtistBySlug(slug)`.

**Convencions a respectar:** snake_case al JSON, `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

**Delegació:** `Sonnet`. Tres endpoints curts, contracte clar.

**Verificació:**
- `curl 'http://localhost:3000/api/songs/search?q=hall'` retorna les cançons que toca.
- `curl 'http://localhost:3000/api/songs/index'` retorna agrupació.

---

### Fase 4 — Vista pública d'una cançó (`/songs/[artist]/[song]`)

**Objectiu:** la pàgina on aterra l'usuari des de Google. Reutilitza el render actual del contingut `<ch>`/`<sec>` però amb una **barra de controls pròpia** (transposició, autoscroll, mida) i un **CTA gros** "Comença un cançoner amb aquesta cançó".

**Tasques:**

1. **Estructura del fitxer**: `src/app/songs/[artistSlug]/[songSlug]/page.tsx` (Server Component).
   - Llegeix la cançó via `getSongBySlug`. Si no existeix o `state != 0`, `notFound()`.
   - Genera `<head>` amb `generateMetadata`: títol `"<title> — <artist> | Acords i lletra | guitarreo.cat"`, description amb primer fragment de la lletra (sense tags), `og:image` placeholder o `cover-default.jpg`.

2. **Component client `SongView`** a `src/components/songs/SongView.tsx`:
   - Rep la cançó com a prop.
   - Estat local: `semitones`, `fontSize`, `autoscrollSpeed`.
   - Renderitza el contingut amb un helper compartit amb el cançoner. **Important:** ja existeix renderitzat dels tags a la `DetailPanel` / `CanconerPreviewLayout`. Cal extreure aquesta lògica a un component reutilitzable `<SongContent content={...} semitones={...} />` per evitar duplicació. Si l'extracció és complicada, en aquesta primera versió duplica i obre un TODO per a unificar.
   - Barra superior sticky amb:
     - `[-1] To: F# [+1]` (tonalitat efectiva = original + semitones, usar `transpose`).
     - `[Capo: 2]` (mostrar només si la cançó té capo).
     - `[Aa-] Mida [Aa+]` (font-size 12-24px).
     - `[▶ Autoscroll] [Velocitat: ▬▬▬]` (slider 0-5, multiplicador de píxels/segon).
   - CTA gros a sota o flotant: `Comença un cançoner amb aquesta cançó →`.

3. **Acció "Començar cançoner amb aquesta cançó"**:
   - Click → guarda a `sessionStorage` un payload com el de "load_canconer" però per pre-omplir, p.ex. `start_with_song = { songId, semitones }`.
   - Redirigeix a `/app`.
   - A `SongbookEditor` afegir lectura d'aquest flag (prioritat alta, dins el `useEffect` de càrrega) → crear cançoner nou amb aquesta cançó dins.
   - Si l'usuari no està logat: igualment funciona (el cançoner viu només a `sessionStorage` fins que faci login i guardi). Es respecta el comportament actual.

4. **CSS**: afegir secció `/* === Vista pública de cançó === */` a `globals.css` amb estils per la barra de controls i el contenidor de la cançó. **No** tocar `src/styles/song.css`.

5. **Autoscroll**: `setInterval` que fa `window.scrollBy(0, speedPxPerTick)` cada 50ms. Es para amb un altre click al botó o si l'usuari fa scroll manual amunt.

**Què NO tocar:**
- `src/styles/song.css`.
- El motor de transposició (reutilitzar `src/lib/transpose.ts`).

**Delegació:**
- **Opus**: decidir l'extracció del component `<SongContent>` compartit (toca arquitectura).
- **Sonnet**: implementar `SongView` (component complex amb estat però delimitat) i el server component.
- **Haiku**: estils CSS i `generateMetadata` (simples).

**Verificació:**
- Obrir `/songs/els-amics-de-les-arts/jean-luc` (o similar) — render correcte.
- Transposar +2 → tots els acords pugen 2 semitons.
- Autoscroll → la pàgina baixa progressivament.
- CTA "Comença un cançoner" → redirigeix a `/app` amb la cançó ja a dins.

---

### Fase 5 — Pàgina d'artista (`/songs/[artist]`)

**Objectiu:** quan l'usuari busca un artista a la portada (o clica un artista a l'índex), aterra en una pàgina amb totes les cançons d'aquell artista.

**Tasques:**

1. **`src/app/songs/[artistSlug]/page.tsx`** (Server Component):
   - Helper `getArtistBySlug(slug)` a `src/db/queries/songs.ts` → retorna `{ name, slug, songs[] }` o `null`.
   - Si no hi ha resultat: `notFound()`.
   - `generateMetadata`: `"<Nom artista> — Cançons amb acords | guitarreo.cat"`, description amb nombre de cançons i 2-3 títols.

2. **Component `<ArtistPage>`** a `src/components/songs/ArtistPage.tsx`:
   - Header amb nom de l'artista en gran, comptador de cançons.
   - Llista de cançons (cards o files) amb títol, tonalitat, any (si existeix). Cada una és un `<Link href="/songs/[artist]/[song]">`.
   - Ordenació: alfabètica per títol (default), toggle per any (si totes tenen any).
   - Inclou `<PublicNav>` a dalt (compartit amb portada).

3. **CSS**: secció `/* === Pàgina d'artista === */` a `globals.css`.

**Què NO tocar:**
- `src/styles/song.css`.

**Riscos:**
- Conflicte de routing: `/songs/[artistSlug]/page.tsx` i `/songs/[artistSlug]/[songSlug]/page.tsx` conviuen a Next 15 App Router sense problema — Next prioritza el segment més específic. Verificar amb un test ràpid: `/songs/els-amics-de-les-arts` ha d'anar a artist page, `/songs/els-amics-de-les-arts/jean-luc` a song page.
- Si `artistSlug` no existeix però sí coincideix parcialment amb un slug d'artista (ex.: `/songs/els-amics`), 404. No fer fuzzy matching (massa complex per a primera iteració).

**Delegació:** `Sonnet`. Component net amb llista.

**Verificació:**
- `/songs/els-amics-de-les-arts` → llista totes les seves cançons.
- Clic en una cançó → vista pública.
- `/songs/artista-inexistent` → 404.

---

### Fase 6 — Portada, navegació i pàgines estàtiques

**Objectiu:** la cara visible del domini. Disseny càlid però fent servir les variables CSS actuals.

**Tasques:**

1. **`src/app/page.tsx`** (la nova portada):
   - Server Component (la cerca és client-side dins, però el shell és server).
   - Layout:
     ```
     ┌──────────────────────────────────────────┐
     │   [Logo] guitarreo.cat       Cançons    │
     │                              El projecte│
     │                              Contacte   │
     │                              [Inicia ses]│
     ├──────────────────────────────────────────┤
     │                                          │
     │              [LOGO GROS]                 │
     │           guitarreo.cat                  │
     │     Acords i lletres en català           │
     │                                          │
     │   ┌─────────────────────────────┐ 🔍    │
     │   │ Busca una cançó o artista   │       │
     │   └─────────────────────────────┘       │
     │                                          │
     │      [ Crea un cançoner → ]              │
     │                                          │
     ├──────────────────────────────────────────┤
     │  Últimes incorporades / Destacades       │
     │  [card] [card] [card] [card]             │
     └──────────────────────────────────────────┘
     ```
   - **Navegació top-bar:** component `<PublicNav>` reutilitzable a `/`, `/songs`, `/projecte`, `/contacte`, `/songs/[a]/[s]`.

2. **Component `<PublicNav>`** a `src/components/public/PublicNav.tsx`:
   - Esquerra: logo + wordmark.
   - Dreta: links + `UserWidget`.
   - Sticky a dalt amb fons amb leve transparència.

3. **Component `<SearchHero>`** a `src/components/public/SearchHero.tsx` (client):
   - Input gran centrat amb autocomplete.
   - On-type: debounce 200ms → fetch a `/api/songs/search?q=...`.
   - Resultats en un dropdown sota l'input dividit en **dues seccions visualment separades**:
     - **Artistes** (si n'hi ha): `<Link href="/songs/<slug>">` amb `Nom artista — N cançons`. Icona o badge per distingir-los.
     - **Cançons**: `<Link href="/songs/<a>/<s>">` amb `Títol — Artista (Tonalitat)`.
   - Si la cerca no troba artistes, omet la secció (no mostrar "0 artistes").
   - Tecles ↑↓ + Enter per navegar amb teclat (movent entre artistes i cançons com una sola llista plana).

4. **Component `<RecentSongsCarousel>`** (opcional, primera versió pot ser una graella simple):
   - Mostra les 8 cançons més recents amb `state=0`.
   - Format card minimalista: títol, artista, tonalitat.

5. **`/projecte`**: `src/app/projecte/page.tsx`:
   - Server Component, contingut estàtic placeholder.
   - Estructura recomanada: hero amb títol "El projecte", 3-4 paràgrafs (placeholder Lorem en català), secció "Qui hi ha darrere" (placeholder).

6. **`/contacte`**: `src/app/contacte/page.tsx`:
   - Server Component, contingut estàtic placeholder.
   - Posa noms+emails placeholder, una secció "Formulari de contacte (proper)".

7. **CSS**: secció nova `/* === Portada pública === */` a `globals.css`.
   - Reutilitzar `--accent`, `--bg`, `--text-fg`.
   - Hero centrat amb max-width 720px.
   - Search input: alçada gran (54px), border-radius generós, ombra subtil.
   - CTA "Crea un cançoner": botó `--accent` ben gros sota l'input.

8. **Layout del root**:
   - `src/app/layout.tsx`: assegurar que el `<body>` no aplica estils que xoquen amb la portada (ara mateix probablement aplica un layout d'app).
   - Si cal, separar layouts: deixar `app/layout.tsx` minimal i posar layouts específics a `app/(public)/layout.tsx` i `app/app/layout.tsx`. **Decisió:** evitar Route Groups a la primera iteració per simplicitat; aplicar classes condicionals si cal.

**Delegació:**
- **Opus**: decidir la separació de layouts (decisió arquitectònica).
- **Sonnet**: `SearchHero` (component amb estat, debounce, navegació teclat).
- **Sonnet**: `PublicNav` i portada (composició).
- **Haiku**: `/projecte` i `/contacte` (placeholders gairebé estàtics).

**Verificació:**
- `/` carrega, logo es veu, buscador funciona.
- Escriure "hall" → resultats apareixen, clicar un → va a `/songs/.../...`.
- "Crea un cançoner" → va a `/app` amb un cançoner nou buit.
- `/projecte` i `/contacte` carreguen i tenen la mateixa nav.

---

### Fase 7 — Índex (`/songs`)

**Objectiu:** llistat navegable amb dos modes: per **cançó** (alfabètic per títol) o per **artista** (alfabètic per artista, on cada entrada porta a la pàgina d'artista).

**Tasques:**

1. **`src/app/songs/page.tsx`** (Server Component):
   - Llegeix l'índex via helper. Suporta `?by=letter|artist` (default: `letter`).
   - `by=letter`: helper `getSongsIndexByLetter()` → cançons agrupades per inicial del títol.
   - `by=artist`: helper `getArtistsIndex()` → artistes agrupats per inicial del nom, amb `song_count`.

2. **Component `<SongsIndex>`** a `src/components/public/SongsIndex.tsx`:
   - Toggle "Per cançó | Per artista" a dalt (botons o tabs). Canvia el query param `?by=...` amb `useRouter` o és un link normal — millor link normal perquè és SEO-friendly.
   - **Mode `letter`**: agrupa per inicial del títol (A, B, C... amb ancorats `#letter-a`). Cada entrada: `Títol — Artista (Tonalitat)`, link cap a `/songs/[a]/[s]`.
   - **Mode `artist`**: agrupa per inicial del nom de l'artista. Cada entrada: `Nom artista (N cançons)`, link cap a `/songs/[artist-slug]` (la pàgina d'artista de la Fase 5). **No** llista cançons dins l'índex — l'usuari clica l'artista i veu les cançons a la seva pàgina.
   - Menú lateral sticky a-z per saltar a cada inicial.

3. **CSS**: secció `/* === Índex === */` a `globals.css`.

**Delegació:** `Sonnet`. Component amb dos modes i agrupació.

**Verificació:**
- `/songs` (default `by=letter`) → cançons per inicial del títol.
- `/songs?by=artist` → artistes per inicial del nom.
- Clic en una cançó (mode letter) → vista pública.
- Clic en un artista (mode artist) → pàgina d'artista.
- Menú a-z lateral funciona als dos modes.

---

## 4. Tasques transversals

### Sitemap i robots.txt

Per SEO (que és tot el sentit d'aquest projecte):

- `src/app/sitemap.ts`: genera dinàmicament les entrades de `/`, `/songs`, `/songs?by=artist`, `/projecte`, `/contacte`, una entrada per cada `/songs/[artist]` (artistes únics) i una per cada `/songs/[artist]/[song]`.
- `src/app/robots.ts`: `User-agent: *`, `Allow: /`, `Disallow: /app/`, `Sitemap: https://guitarreo.cat/sitemap.xml`.

**Delegació:** `Haiku` (curt i mecànic).

### Redireccions per compatibilitat

Per si algú té marcadors a les rutes velles:

- Middleware `src/middleware.ts` (o `next.config.ts` redirects):
  - `/editor` → `/app/editor`
  - `/library` → `/app/library`
  - `/admin` → `/app/admin`
  - `/c/[token]` → `/app/c/[token]`
- `/` no redirigeix — és la portada nova.

**Decisió:** fer-ho a `next.config.ts` (més senzill que middleware per a redirects estàtics).

**Delegació:** `Haiku`.

### Verificació final (manual, Opus)

- Login amb Google → segueix funcionant.
- Crear cançoner anònim a `/app` → guardar a `/library` → compartir → obrir token en finestra privada.
- /admin amb compte admin.
- /editor (cançons): crear, importar URL, guardar.
- Cercar a la portada, obrir cançó, transposar, autoscroll, "Comença un cançoner".
- Cançó pública té `<title>`, `<meta description>`, `og:image` correctes (View Source).
- `/sitemap.xml` retorna XML vàlid amb totes les cançons.

---

## 5. Resum de delegació

| Fase | Tasca | Model | Notes |
|---|---|---|---|
| 1 | Re-ubicació `/app/` | Sonnet | Brief amb llista exacta de moves + greps |
| 2 | Slugs BD + migració | Sonnet | Opus revisa migració abans d'executar |
| 3 | Endpoints públics (search + index) | Sonnet | Contracte clar, snake_case, search retorna artistes+cançons |
| 4 | Extracció `<SongContent>` | Opus | Decisió arquitectònica |
| 4 | Implementar `SongView` | Sonnet | Estat complex però delimitat |
| 4 | Metadata + CSS | Haiku | Mecànic |
| 5 | Pàgina d'artista | Sonnet | Component amb llista, query nova |
| 6 | Layout/Route Groups | Opus | Decisió arquitectònica |
| 6 | `SearchHero` (artistes+cançons) | Sonnet | Component interactiu amb dues seccions |
| 6 | `PublicNav` + portada | Sonnet | Composició |
| 6 | `/projecte`, `/contacte` | Haiku | Placeholders |
| 7 | Índex `/songs` (letter+artist) | Sonnet | Dos modes |
| T | Sitemap, robots | Haiku | Curt + entrades d'artista al sitemap |
| T | Redirects retro | Haiku | `next.config.ts` |
| T | QA final | Opus | Manual |

---

## 6. Riscos i punts a vigilar

1. **Hardcoded URLs**: la Fase 1 té molt risc de deixar links morts. Cal grep exhaustiu (`"/library"`, `"/editor"`, `"/admin"`, `"/c/"`, `/api/canconers/.../shared/`).
2. **Cookies/JWT NextAuth**: el `callbackUrl` pot quedar apuntant a `/` (portada pública en lloc de l'app). Cal canviar default a `/app`.
3. **`/c/[token]`**: si algú ja té un link compartit `/c/xxxx`, deixar redirect permanent a `/app/c/xxxx`.
4. **Hidratació SSR**: la portada serà server-rendered però el buscador és client. Cal client boundary clar.
5. **Re-extracció del render de cançó**: si ara mateix el contingut `<ch>`/`<sec>` el renderitza un component íntimament lligat a `useSongbookStore`, extreure'l serà delicat. **Pla B:** duplicar i marcar amb TODO d'unificació.
6. **Slugs amb caràcters especials**: caps de cançons amb apòstrofs (`L'home`), ç, accents, parèntesis (`(Acústic)`). Test amb una mostra real abans de migrar.
7. **Performance del buscador**: la cerca server-side amb `LIKE` és OK fins a uns ~10k registres. Si supera això, planificar FTS5 de SQLite en una iteració futura.

---

## 7. Estimació d'esforç (orientativa)

| Fase | Esforç (sessions Claude) |
|---|---|
| 1 — Re-ubicació | 1 sessió |
| 2 — Slugs | 1 sessió |
| 3 — Endpoints | 0.5 sessió |
| 4 — Vista cançó | 1.5 sessions |
| 5 — Pàgina d'artista | 0.5 sessió |
| 6 — Portada | 2 sessions |
| 7 — Índex | 0.5 sessió |
| Transversal | 0.5 sessió |
| **Total** | **~7.5 sessions** |

---

## 8. Decisions confirmades

- ✅ **URL de cançó:** dos segments `/songs/[artist]/[song]`.
- ✅ **Pàgina d'artista:** inclosa com a Fase 5. La cerca de la portada hi porta i l'índex té un mode "Per artista" que també hi porta.
- ✅ **Visibilitat:** totes les rutes públiques `/songs/...` mostren **només** cançons amb `state = 0`.
