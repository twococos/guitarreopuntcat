"use client"
import { ALL_KEYS } from "@/lib/transpose"

export interface SongMetadata {
  title: string
  artist: string
  key: string
  capo: number
  language: string
  tags: string
}

interface MetadataProps {
  value: SongMetadata
  onChange: (next: SongMetadata) => void
}

export function SongMetadataForm({ value, onChange }: MetadataProps) {
  function set<K extends keyof SongMetadata>(field: K, v: SongMetadata[K]) {
    onChange({ ...value, [field]: v })
  }

  return (
    <div className="metadata-form">
      <label>
        Títol <span className="required">*</span>
        <input
          type="text"
          value={value.title}
          placeholder="El nom de la cançó"
          onChange={(e) => set("title", e.target.value)}
        />
      </label>
      <label>
        Artista <span className="required">*</span>
        <input
          type="text"
          value={value.artist}
          placeholder="Autor o grup"
          onChange={(e) => set("artist", e.target.value)}
        />
      </label>
      <label>
        To original <span className="required">*</span>
        <select value={value.key} onChange={(e) => set("key", e.target.value)}>
          {ALL_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cejilla
        <input
          type="number"
          value={value.capo}
          min={0}
          max={11}
          onChange={(e) => set("capo", parseInt(e.target.value, 10) || 0)}
        />
      </label>
      <label>
        Idioma
        <select value={value.language} onChange={(e) => set("language", e.target.value)}>
          <option value="ca">Català</option>
          <option value="es">Castellà</option>
          <option value="en">Anglès</option>
          <option value="other">Altre</option>
        </select>
      </label>
      <label>
        Etiquetes
        <input
          type="text"
          value={value.tags}
          placeholder="pop, rock, tradicional…"
          onChange={(e) => set("tags", e.target.value)}
        />
        <small>Separades per comes</small>
      </label>
    </div>
  )
}
