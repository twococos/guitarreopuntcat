"use client"
import { useEffect, useRef } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"

export function SongList() {
  const songs = useSongbookStore((s) => s.songs)
  const canconer = useSongbookStore((s) => s.canconer)
  const searchTerm = useSongbookStore((s) => s.searchTerm)
  const songSortBy = useSongbookStore((s) => s.songSortBy)
  const setSearchTerm = useSongbookStore((s) => s.setSearchTerm)
  const setSongSortBy = useSongbookStore((s) => s.setSongSortBy)
  const addToCanconer = useSongbookStore((s) => s.addToCanconer)
  const loadSongs = useSongbookStore((s) => s.loadSongs)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const inCanconer = new Set(canconer.map((e) => e.song.id))

  function onSearchInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setSearchTerm(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      loadSongs()
    }, 300)
  }

  function onSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as "title" | "artist" | "key"
    setSongSortBy(val)
    loadSongs()
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <section id="panel-songs">
      <div className="toolbar">
        <input
          type="text"
          id="search"
          placeholder="Cerca per títol o artista…"
          value={searchTerm}
          onChange={onSearchInput}
        />
        <select id="sort" value={songSortBy} onChange={onSortChange}>
          <option value="title">Per títol</option>
          <option value="artist">Per artista</option>
          <option value="key">Per to</option>
        </select>
      </div>
      <ul id="song-list">
        {songs.map((s) => {
          const already = inCanconer.has(s.id)
          return (
            <li
              key={s.id}
              className={already ? "in-canconer" : ""}
              onClick={!already ? () => addToCanconer(s.id) : undefined}
            >
              <span className="song-key">{s.key}</span>
              <div className="song-name">{s.title}</div>
              <div className="song-info">{s.artist}</div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
