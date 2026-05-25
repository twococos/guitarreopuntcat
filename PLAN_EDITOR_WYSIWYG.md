# Pla — Editor WYSIWYG de cançons

> Refactor gran de [src/app/editor/page.tsx](src/app/editor/page.tsx) i tots els components de [src/components/editor/](src/components/editor/).
> El format de BD (`<ch>X</ch>` i `<sec>X</sec>`) NO canvia — la transformació és només a la capa UI.

---

## 1. Visió general

Substituïm la `<textarea>` + overlay sintàctic per un **editor contentEditable amb model intern**. L'usuari ja no veu mai `<ch>` ni `<sec>`: veu els acords sobre la lletra (estil vista prèvia) i les seccions amb el seu format `— Estrofa 1 —`.

Tres botons del ratolí amb semàntiques diferents:

| Acció                       | Botó esquerre              | Botó del mig            | Botó dret                |
|----------------------------|----------------------------|-------------------------|--------------------------|
| Clic curt en lletra        | Selecciona lletra          | Menú "afegir secció"    | Menú "afegir acord"      |
| Clic curt sobre secció     | Selecciona lletra          | Menú "modificar secció" | Menú "afegir acord"      |
| Clic curt sobre acord      | Selecciona lletra          | Menú "afegir secció"    | Menú "modificar acord"   |
| Mantenir + arrossegar      | Mou la secció/acord        | Mou la secció/acord     | Mou la secció/acord      |

A la sortida (commit a l'editor.value) tot es serialitza altra vegada com `<sec>…</sec>` / `<ch>…</ch>` — el `useEditorHistory`, l'autosave, el draft i el save endpoint queden intactes.

---

## 2. Decisions tancades (de les preguntes prèvies)

- **Arquitectura editor**: contentEditable amb model intern (no llibreria externa).
- **Menú d'acords**: agrupació per **funció tonal** (Tònica/Subdominant/Dominant) + secció d'acords cromàtics fora del to + fila de modificadors aplicables a l'acord seleccionat.
- **Header**: format de vista prèvia editable inline (clic = edit); camps secundaris (capo, idioma, tags) en panell expandible.
- **Toolbar botons**: toolbar sticky a sobre de l'editor amb Secció / Acord / Undo / Redo / Reset / Guardar (alineat dreta).
- **Drag**: qualsevol botó arrossega (clic curt fa l'acció del botó, mantenir + moure = drag).
- **Esborrar acord/secció**: ancorat a una posició textual; si esborres aquest tram, l'acord/secció va amb el text. Copy/cut/paste preserva tags.
- **Reset**: tot (metadades + contingut), amb confirmació via toast.
- **Mode crua**: eliminat. Editor sempre WYSIWYG (el toggle "Vista prèvia" desapareix).

---

## 3. Llista de seccions permeses

Les úniques seccions permeses al menú:

```
Intro
Estrofa            (auto-numera: Estrofa 1, Estrofa 2…)
Tornada            (auto-numera només si n'hi ha 2+ amb lletra diferent — vegeu §6.3)
Pre-tornada        (variant suggerida — confirma si la vols)
Pont
Solo
Instrumental
Interludi          (suggerida — confirma)
Outro
Final              (suggerida — confirma)
```

**Pregunta oberta**: Et van bé Pre-tornada, Interludi i Final com a addicionals? O només deixem les 8 que vas mencionar (Estrofa, Tornada, Intro, Instrumental, Solo, Pont, Outro)?

---

## 4. Arquitectura tècnica

### 4.1 Model intern

Definir a `src/lib/editor/model.ts`:

```ts
type Inline =
  | { kind: "text"; text: string }
  | { kind: "chord"; chord: string }                 // acord ancorat just abans del text següent
type Block =
  | { kind: "section"; name: string }                // sempre una línia pròpia
  | { kind: "lyric"; spans: Inline[] }               // línia de lletra
type Doc = { blocks: Block[] }
```

I dues funcions pures:

- `parse(raw: string): Doc` — converteix `<sec>X</sec>\n<ch>Am</ch>En un lloc…` a `Doc`.
- `serialize(doc: Doc): string` — l'invers. **Ha de ser idempotent** (`serialize(parse(x)) === x` per qualsevol `x` vàlid).

Tests unitaris: round-trips amb cançons reals de la BD.

### 4.2 Component `<WysiwygEditor />`

Reemplaça [src/components/editor/ChordEditor.tsx](src/components/editor/ChordEditor.tsx).

- Renderitza el `Doc` com a `<div contentEditable suppressContentEditableWarning>` amb nodes:
  - Blocs `lyric` → `<div data-block="lyric">…</div>` amb `<span data-chord="Am">` flotants i `<span data-text>...</span>` per a la lletra.
  - Blocs `section` → `<div data-block="section" data-name="Estrofa 1"><span class="sec-marker">— Estrofa 1 —</span></div>` (no editable directament; modificar via menú).
- A cada mutació (`onBeforeInput`, `onInput`, `onPaste`, `onCut`), interceptar:
  - Capturar la mutació.
  - Reconstruir el `Doc` llegint el DOM (o aplicar el delta al model).
  - Serialitzar a `raw` i propagar a `editor.setValue(next)`.
  - Re-renderitzar el contentEditable amb el `Doc` resultant (només si cal).
  - Restaurar la selecció (mapping DOM ↔ índex de model).
- **Selecció**: mantenir un mapping bidireccional entre rang DOM i `(blockIndex, spanIndex, offset)`. Cal per al menú contextual (saber on inserir un acord nou).
- **Estabilitat del cursor**: després de qualsevol re-render, restaurar selecció via `Range`/`Selection` API.

### 4.3 Esdeveniments del ratolí

Listener al contenidor principal del editor:

- `onMouseDown(e)`: registrar `{button, x, y, target, startedOnChord?, startedOnSection?, timer}`.
- `onMouseMove(e)`: si distància > 5px, iniciar drag (estil @dnd-kit threshold). Mostrar ghost/indicator.
- `onMouseUp(e)`:
  - Si va ser drag → soltar a la nova posició (recalcular ancla per `caretRangeFromPoint` o `caretPositionFromPoint`).
  - Si va ser clic curt:
    - Botó 0 (esq) → comportament natiu (selecció text), no preventDefault.
    - Botó 1 (mig) → `e.preventDefault()`; obrir menú segons context (vegeu §5.1).
    - Botó 2 (dret) → `e.preventDefault()`; obrir menú segons context (vegeu §5.2).

Cal `e.preventDefault()` al `onAuxClick`/`onContextMenu` per cancel·lar el menú natiu del navegador.

### 4.4 Sincronització amb `useEditorHistory`

Cap canvi al hook. El `WysiwygEditor` continua cridant `onChange(raw)` i `onCommit(raw)` amb el text serialitzat. Undo/Redo segueix funcionant igual.

---

## 5. Menús contextuals

### 5.1 Menú de seccions (botó del mig)

Component: `src/components/editor/SectionContextMenu.tsx`.

Mode **afegir** (clic mig sobre lletra):
```
┌─ Afegir secció ──┐
│ ▸ Intro          │
│ ▸ Estrofa        │  ← inserta com "Estrofa N" amb N auto
│ ▸ Tornada        │
│ ▸ Pre-tornada    │
│ ▸ Pont           │
│ ▸ Solo           │
│ ▸ Instrumental   │
│ ▸ Interludi      │
│ ▸ Outro          │
│ ▸ Final          │
└──────────────────┘
```

Mode **modificar** (clic mig sobre secció existent):
```
┌─ Modificar secció ─┐
│ Tipus: [Estrofa ▾] │  ← combobox amb les opcions
│ ┌─────────────────┐│
│ │ Eliminar secció ││
│ └─────────────────┘│
└────────────────────┘
```

**Auto-numeració** d'Estrofa:
- En inserir, comptar quantes seccions "Estrofa" existeixen al `Doc` i posar `N+1`.
- Renumerar dinàmicament si l'usuari mou/elimina una estrofa: passar pel `Doc` i reassignar 1..N a totes les estrofes en ordre.
- Mateixa lògica opcional per Tornada/Pont si l'usuari ho vol — **confirma si vols numerar només Estrofa o també altres**.

### 5.2 Menú d'acords (botó dret)

Component: `src/components/editor/ChordContextMenu.tsx` (refactor del que ja existeix).

Mode **afegir** (clic dret sobre lletra):

```
┌─ Afegir acord ────────────────────────────────────┐
│ Acords del to                                     │
│ ┌─Tònica──┬─Subdominant─┬─Dominant───┐            │
│ │  C  Em  │   F   Dm    │   G   Am   │            │
│ └─────────┴─────────────┴────────────┘            │
│                                                   │
│ Altres acords                                     │
│  C# D# F# G# A# B                                 │
│  C#m D#m F#m G#m A#m Bm                           │
│                                                   │
│ Modificadors (es combinen amb l'acord triat)      │
│  [maj7] [7] [m7] [sus2] [sus4]                    │
│  [add9] [6] [dim] [m7b5] [mmaj7]                  │
└───────────────────────────────────────────────────┘
```

Fluxe d'interacció:
- Clic en un acord (Ex: `C`) → inserta `<ch>C</ch>` i tanca el menú.
- Clic en un modificador (Ex: `maj7`) → activa estat "modifier pendent"; el següent clic d'acord inserta amb el modificador (`Cmaj7`).
- Alternativa: el modificador només s'aplica quan ja hi ha un acord seleccionat o sobre el qual es modifica.

Mode **modificar** (clic dret sobre acord existent):

```
┌─ Modificar acord ─────────────────────┐
│ Acord actual: [Am]                    │
│                                        │
│ Canvia a:                              │
│ ┌─Tònica──┬─Subd─┬─Domin─┐            │
│ │  C  Em  │ F Dm │ G  Am │            │
│ └─────────┴──────┴───────┘            │
│ Altres: C# D# F# … etc                 │
│                                        │
│ Modificadors:                          │
│ [maj7][7][m7][sus2][sus4][add9][m]…    │
│                                        │
│ ┌──────────────┐                       │
│ │ Eliminar acord│                      │
│ └──────────────┘                       │
└────────────────────────────────────────┘
```

### 5.3 Lògica de mapeig per funció tonal

Helper a `src/lib/editor/chordFunctions.ts`:

```ts
function chordsByFunction(key: string): {
  tonic: string[]      // I, vi  (C, Am en C major)
  subdominant: string[]// IV, ii (F, Dm en C major)
  dominant: string[]   // V, iii, vii° (G, Em, Bdim en C major)
  chromatic: string[]  // resta de cromàtics fora del to
}
```

Reutilitza `chordsForKey` existent però reorganitza segons graus.

---

## 6. Drag-and-drop de seccions i acords

### 6.1 Acords

- Cursor canvia a `grab` quan passes pel damunt d'un acord.
- En `mousedown` sobre acord + moviment ≥ 5px: `grabbing`, mostra ghost amb el nom de l'acord seguint el cursor.
- Mentre arrossegues, mostrar un indicador (línia vertical o caret blink) on s'inseriria.
- En `mouseup`: usa `document.caretRangeFromPoint(x, y)` per trobar la posició de text més propera; mou l'acord allà. **Restricció**: si el target és dins un bloc `section`, el drop falla (no fa res) — els acords només viuen sobre lletra.

### 6.2 Seccions

- Igual però el drop ha d'anar entre línies (entre dos blocs).
- Indicador: línia horitzontal entre línies.
- Una secció sempre ocupa una línia sencera.

### 6.3 Auto-renumeració després de moure

- Després d'un drop d'una secció `Estrofa`, recórrer els blocs i renumerar.
- (Pregunta) Si l'usuari mou `Estrofa 3` davant de `Estrofa 1`, la que era "1" passa a "2" i "3" passa a "1"? Sí (renumerem per ordre d'aparició).

---

## 7. Header WYSIWYG editable

Component nou: `src/components/editor/SongHeader.tsx`.

Visual idèntic al `SongView` (mateix CSS de `.song-head`):

```
┌────────────────────────────────────────┐
│ TÍTOL DE LA CANÇÓ          [Am]        │
│ Artista                                │
└────────────────────────────────────────┘
▸ Més opcions (capo, idioma, tags)
```

- Títol i artista: en clicar, es converteixen en `<input>` amb estil idèntic; en `blur` o `Enter` tornen a div.
- Tonalitat (`[Am]` badge): clic → `KeyPicker` (vegeu §8).
- "Més opcions" expandible: mostra capo (número), idioma (select), tags (input). Estat col·lapsat per defecte.

Reemplaça [src/components/editor/SongMetadataForm.tsx](src/components/editor/SongMetadataForm.tsx) (es pot eliminar si no s'usa enlloc més).

---

## 8. KeyPicker (selector de tonalitat)

Component: `src/components/editor/KeyPicker.tsx`.

Popover obert al clicar el badge de tonalitat:

```
┌─ Major ──────────────┐
│  C   G   D   A       │
│  E   B   F#  C#      │
│  F   Bb  Eb  Ab      │
├─ Menor ──────────────┤
│  Am  Em  Bm  F#m     │
│  C#m G#m Dm  Gm      │
│  Cm  Fm  Bbm  Ebm    │
└──────────────────────┘
```

(Ja existeix `KeyMenu.tsx` per a la pàgina principal — pots reutilitzar-lo o crear un de bessó per a l'editor.)

**Nota**: l'`ALL_KEYS` actual només té sostinguts. La taula de 6×4 que vols (3 fila majors, 3 fila menors, començant per C i Am) caldrà arranjar-la. Mirant l'ordre natural del cicle de quintes:
- Majors: C G D A E B / F# (= C major es repetiria si fas 24 cel·les). Decideix tu si vols cicle de quintes o ordre cromàtic.

**Confirma**: l'ordre que vols a la taula (cromàtic ascendent C C# D D#… o cicle de quintes C G D A E B…?).

---

## 9. Toolbar i botons d'acció

Component: refactor de [src/components/editor/EditorToolbar.tsx](src/components/editor/EditorToolbar.tsx).

```
┌──────────────────────────────────────────────────────┐
│ § Secció  ♩ Acord  ↩ Desfer  ↪ Refer  │  ⟳ Reset  💾 Guardar │
└──────────────────────────────────────────────────────┘
```

- "§ Secció" → obre el menú de seccions al cursor.
- "♩ Acord" → obre el menú d'acords al cursor.
- "↩ Desfer" / "↪ Refer" — igual que ara.
- "⟳ Reset" — toast de confirmació:
  ```
  Esborrar tot el progrés?
  Es perdran títol, artista i contingut.
  [Cancel·lar]  [Sí, esborrar]
  ```
- "💾 Guardar" / "📤 Proposar":
  - Per a admin en mode nova cançó: toast confirmació:
    ```
    Guardar la cançó a la base de dades pública?
    [Cancel·lar]  [Sí, guardar]
    ```
  - Per a usuari (proposta): toast confirmació anàloga.
  - Mode edició: confirma igual abans de fer PUT.

Toolbar `position: sticky; top: 0;` per estar sempre visible al fer scroll.

---

## 10. Copy / cut / paste

- `onCut`: capturar selecció DOM, mapejar a rang `(blockStart, blockEnd, offsetStart, offsetEnd)`, serialitzar el sub-`Doc` a `raw` amb tags, posar al portapapers (`text/plain` + opcional `text/html` propi), eliminar del model.
- `onCopy`: igual sense eliminar.
- `onPaste`: llegir `text/plain`; si conté tags `<ch>`/`<sec>`, parse → inserir el `Doc` al cursor (merge amb el bloc actual o split). Si és text pla, inserir com lletra.

---

## 11. Esborrar manualment (Backspace/Delete)

- `Backspace` davant d'un acord: esborra l'acord (no el caràcter de lletra anterior).
- `Backspace` dins un bloc de secció: esborra la secció sencera (és atòmica).
- `Delete` darrera d'un acord: igual.
- Selecció que cobreix acord/secció: a l'esborrar la selecció, els nodes interns van fora.

Aquesta lògica es codifica al `onBeforeInput` interceptant `inputType` (`deleteContentBackward`, `deleteContentForward`, `deleteByCut`, etc.).

---

## 12. CSS

Afegir a [src/app/globals.css](src/app/globals.css) (o un fitxer nou `editor-wysiwyg.css` importat des de globals):

- Estils per a `[data-block="lyric"]` (reutilitza `.song-body`).
- Estils per a `[data-block="section"]` (reutilitza el bloc `sec`).
- Estils per a `[data-chord]` (reutilitza `ch`).
- Estats `:hover` per a acords/seccions (cursor grab, highlight subtil).
- Drag ghost i drop indicator.
- Toolbar sticky.
- Header WYSIWYG (reutilitza `.song-head`, `.song-title`, `.song-artist`, `.song-key`).
- KeyPicker (graella 6×4).
- Menús contextuals (extendre estils existents de `#chord-menu`).

⚠ NO tocar `src/styles/song.css` — aquell és el de la sortida (PDF/preview). L'editor pot usar les mateixes classes via `@import` o reutilització visual.

---

## 13. Estructura de fitxers final

```
src/
├── components/editor/
│   ├── WysiwygEditor.tsx           ← nou (reemplaça ChordEditor.tsx)
│   ├── SongHeader.tsx              ← nou (reemplaça SongMetadataForm.tsx)
│   ├── EditorToolbar.tsx           ← refactor
│   ├── SectionContextMenu.tsx      ← nou
│   ├── ChordContextMenu.tsx        ← refactor gran
│   ├── ChordPalette.tsx            ← eliminat (substituït pel menú)
│   ├── KeyPicker.tsx               ← nou
│   ├── ConfirmToast.tsx            ← nou (o reusable component)
│   ├── ProposeInfoPopup.tsx        ← intacte
│   └── NewSongStartPopup.tsx       ← intacte
├── lib/editor/
│   ├── model.ts                    ← nou (parse/serialize)
│   ├── chordFunctions.ts           ← nou (agrupació tonal)
│   └── sections.ts                 ← nou (constants seccions + auto-renumeració)
└── app/editor/page.tsx             ← refactor (orquestrador)
```

A esborrar:
- `ChordEditor.tsx`, `ChordPalette.tsx`, `SongMetadataForm.tsx` (substituïts).

---

## 14. Fases d'implementació + assignació de subagents

Cada fase és independent verificable. Les fases en sèrie marquen una dependència; les marcades "paral·lel" es poden fer alhora.

### Fase 1 — Model parse/serialize  *(Sonnet)*
**Per què Sonnet**: lògica de parser amb edge cases (acords dins seccions impossibles, anidaments rars, salts de línia), important fer-ho bé però mecànic.
**Sortida**: `src/lib/editor/model.ts` amb tests round-trip a `src/lib/editor/__tests__/model.test.ts` (script `npx tsx`).

### Fase 2 — Helpers chordFunctions + sections  *(Haiku)*  *(paral·lel amb Fase 1)*
**Per què Haiku**: mapping mecànic d'acords a graus tonals + array de seccions permeses.
**Sortida**: `src/lib/editor/chordFunctions.ts`, `src/lib/editor/sections.ts`.

### Fase 3 — KeyPicker  *(Haiku)*  *(paral·lel)*
**Per què Haiku**: component visual senzill, taula de 6×4 amb onClick.
**Sortida**: `src/components/editor/KeyPicker.tsx`.

### Fase 4 — SongHeader WYSIWYG  *(Sonnet)*
**Per què Sonnet**: edició inline amb estats hover/focus, integració amb KeyPicker, panell expandible. Visual important.
**Sortida**: `src/components/editor/SongHeader.tsx`.

### Fase 5 — Context menus (Secció + Acord)  *(Sonnet)*
**Per què Sonnet**: refactor del ChordContextMenu existent + nou SectionContextMenu amb modes afegir/modificar.
**Sortida**: `SectionContextMenu.tsx`, `ChordContextMenu.tsx` refactoritzat.

### Fase 6 — WysiwygEditor (CORE)  *(Opus o sessió principal)*
**Per què Opus**: la peça crítica. ContentEditable + model bidireccional + mapping DOM↔índex + interceptors de teclat/click/paste/cut.
**Sortida**: `src/components/editor/WysiwygEditor.tsx`.
**Verificacions**: smoke test al navegador, escriure una cançó sencera, copy/paste, undo/redo.

### Fase 7 — Drag-and-drop  *(Opus o sessió principal)*
**Per què Opus**: lògica subtil de detecció de drag vs clic curt amb 3 botons, drop indicators, recàlcul d'ancles, restriccions (acord només sobre lletra). Es fa damunt del WysiwygEditor.
**Sortida**: ampliació de `WysiwygEditor.tsx`.

### Fase 8 — Toolbar + Reset/Save confirmation  *(Sonnet)*
**Per què Sonnet**: refactor moderat amb integració de toasts de confirmació.
**Sortida**: `EditorToolbar.tsx` refactoritzat, integració de toasts.

### Fase 9 — Integració a `/editor/page.tsx`  *(sessió principal)*
**Per què sessió principal**: orquestració, gates d'autenticació, lligams entre tots els components nous.
**Sortida**: `src/app/editor/page.tsx` refactoritzat.

### Fase 10 — CSS + polit visual  *(Sonnet)*
**Per què Sonnet**: estils relativament mecànics però amb atenció al detall (cursor states, hover, drag indicators, sticky toolbar).
**Sortida**: `src/app/globals.css` ampliat.

### Fase 11 — Smoke test manual + correccions  *(sessió principal)*
- Crear una cançó nova de zero amb tot el fluxe.
- Editar una cançó existent.
- Copy/paste entre cançons.
- Drag d'acords i seccions.
- Reset i confirmacions.
- Comprovar que el `raw` serialitzat coincideix amb el format de BD.
- `tsc --noEmit` net.

---

## 15. Riscos i mitigacions

| Risc | Mitigació |
|---|---|
| ContentEditable té comportaments inconsistents entre navegadors | Suportem només Chromium-based (l'app és desktop-first; declara-ho). Tot el flux passa per `onBeforeInput` controlat. |
| Selecció es perd a cada re-render | Implementar mapping rigorós DOM↔model + restauració amb `Selection.setBaseAndExtent`. |
| Drag amb 3 botons conflicte amb context menu nadiu | `preventDefault` a `contextmenu` i `auxclick`. |
| Tags al `serialize` no son idèntics als de BD (espais extra, ordre) | Tests de round-trip exhaustius a Fase 1. |
| Auto-renumeració d'Estrofa renombra inesperadament | Decisió documentada: renumera SEMPRE per ordre d'aparició. |
| `useEditorHistory` no funciona bé amb canvis de model granulars | Continuem passant `raw` serialitzat a `commit()`. El history opera amb strings, no canvia. |
| Undo de Ctrl+Z amb contentEditable nadiu interfereix | Interceptem Ctrl+Z al `onKeyDown` i cridem `editor.undo()` nostre, mai deixar el nadiu. |

---

## 16. Coses a confirmar abans d'arrancar

1. **Llista definitiva de seccions** (vegeu §3): t'afegeixo Pre-tornada / Interludi / Final o no?
2. **Auto-numeració**: només a Estrofa, o també a Tornada/Pont quan n'hi ha múltiples?
3. **Ordre del KeyPicker** (§8): cromàtic ascendent (C C# D D#…) o cicle de quintes (C G D A E B…)?
4. **Modificadors d'acord** (§5.2): la llista que proposo (`maj7 7 m7 sus2 sus4 add9 6 dim m7b5 mmaj7`) és correcta? En falta o en sobra?
5. Confirma que vols **eliminar `ChordPalette` lateral** (substituït totalment pel menú contextual) i no mantenir-lo com a referència visual.

---

## 17. Estimació de mida

Aproximadament:
- ~600 LOC nous a `WysiwygEditor.tsx` (la peça més grossa).
- ~150 LOC a `model.ts`.
- ~200 LOC a `SongHeader.tsx`.
- ~150 LOC per cada context menu.
- ~100 LOC per `KeyPicker`.
- ~80 LOC `EditorToolbar` refactor.
- ~50 LOC `chordFunctions.ts` + `sections.ts`.
- ~200 LOC CSS.

Total: ~1.500-1.800 LOC nous (esborrant ~400 dels antics). Refactor gran però acotat.

---

**Pròxim pas**: contesta els 5 punts del §16 i comencem per Fase 1 + Fase 2 + Fase 3 en paral·lel.
