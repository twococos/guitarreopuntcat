# Fonts

Fonts dels estils de cançó, servides a la web (`@font-face` a
`src/styles/song.css`) i incrustades als PDF generats al navegador
(`src/lib/pdf-client/fonts.ts`). Totes provenen de Google Fonts.

| Fitxers | Família | Substitueix | Llicència |
|---|---|---|---|
| `Gelasio-*` | Gelasio | Georgia | SIL Open Font License 1.1 |
| `Caladea-*` | Caladea | Cambria | SIL Open Font License 1.1 |
| `Cousine-*` | Cousine | Courier New | Apache License 2.0 |
| `Inconsolata-*` | Inconsolata | Consolas | SIL Open Font License 1.1 |
| `Anton-*` | Anton | Impact | SIL Open Font License 1.1 |
| `Inter-*` | Inter | system-ui / Segoe UI | SIL Open Font License 1.1 |
| `JetBrainsMono-*` | JetBrains Mono | ui-monospace / SF Mono | SIL Open Font License 1.1 |
| `Caveat-*` | Caveat | Bradley Hand / Segoe Script | SIL Open Font License 1.1 |

Els TTF estan normalitzats amb `node scripts/normalize-fonts.mjs` (glifs
alineats a 4 bytes, sense canviar cap contorn). És imprescindible perquè
`@pdf-lib/fontkit` els pugui incrustar sense perdre glifs: qualsevol font
nova ha de passar per l'script.

Les cursives de Cousine, Caladea i JetBrains Mono (`*-400i`, `*-700i`) són
per a les tornades en cursiva quan s'amaguen els títols de secció al PDF.
Inconsolata i Caveat no en tenen a Google Fonts.
