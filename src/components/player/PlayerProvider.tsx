"use client"
/**
 * PlayerProvider — estat i accions del reproductor «Toca-la» d'una cançó.
 *
 * Store Zustand PER INSTÀNCIA (createStore dins un context, no global): al visor de cançoners es
 * tornarà a crear a cada cançó (amb `key`). El controlador (src/lib/player/controller.ts) es
 * carrega amb import() dinàmic el primer cop que es prem «Toca-la»; l'AudioContext es crea abans,
 * dins el clic. La posició no viu al store (canvia a cada frame): qui la necessita es subscriu a
 * `usePlayerFrame`, que la llegeix del controlador amb requestAnimationFrame.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { createStore, type StoreApi } from "zustand/vanilla"
import { useStore } from "zustand"
import { useToastStore } from "@/hooks/useToasts"
import { getT } from "@/lib/i18n"
import { createUnlockedAudioContext } from "@/lib/player/audioUnlock"
import type { ControllerState, PlayerController } from "@/lib/player/controller"
import { DEFAULT_MIX, type Mix, type PlayerMode } from "@/lib/player/options"
import type { StyleId } from "@/lib/player/styles"
import { indexAt } from "@/lib/player/timeline"

export interface PlayerSong {
  id: number
  /** Content de la BD (noms de les seccions). */
  content: string
  youtubeId: string | null
  capo: number
  /** Estil fixat per l'admin (`songs.rhythm`). */
  rhythm: string | null
}

export interface PlayerUiState extends ControllerState {
  open: boolean
  /** El cos de la cançó segueix la línia que sona (s'atura si l'usuari fa scroll). */
  following: boolean
  /** Miniatura del vídeo plegada (pantalles estretes). */
  videoCollapsed: boolean
  /** Full d'ajustos obert (pantalles estretes). */
  settingsOpen: boolean
  /** Mescla de l'acompanyament (mode sol). */
  mix: Mix
  /** Estil fixat ara mateix a la BD (pot canviar si l'admin el fixa des del panell). */
  fixedStyle: string | null
}

export interface PlayerActions {
  start: () => void
  close: () => void
  toggle: () => void
  seek: (ms: number) => void
  setMode: (m: PlayerMode) => void
  setStyle: (s: StyleId) => void
  setMix: (m: Partial<Mix>) => void
  setRate: (r: number) => void
  setFollowing: (f: boolean) => void
  setVideoCollapsed: (c: boolean) => void
  setSettingsOpen: (o: boolean) => void
  setVideoElement: (el: HTMLElement | null) => void
  /** Admin: desa l'estil actual (o null) com a `songs.rhythm`. */
  fixStyle: (style: StyleId | null) => Promise<void>
  /** Salta a la secció anterior (-1) o següent (+1). */
  stepSection: (dir: -1 | 1) => void
  now: () => number
  prefetch: () => void
}

interface PlayerContextValue {
  store: StoreApi<PlayerUiState>
  actions: PlayerActions
  subscribeFrame: (cb: (t: number) => void) => () => void
  song: PlayerSong
  semitones: number
  flats: boolean
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

const MIX_KEY = "player.mix"

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // navegació privada o emmagatzematge bloquejat: no es recorda
  }
}

const loadController = () => import("@/lib/player/controller")

function initialState(song: PlayerSong): PlayerUiState {
  return {
    open: false,
    status: "loading",
    error: null,
    mode: song.youtubeId ? "video" : "solo",
    playing: false,
    videoOk: Boolean(song.youtubeId),
    style: "pop",
    styleSource: "default",
    detected: null,
    rate: 1,
    timeline: null,
    following: true,
    videoCollapsed: false,
    settingsOpen: false,
    mix: { ...DEFAULT_MIX },
    fixedStyle: song.rhythm,
  }
}

export function PlayerProvider({
  song,
  semitones,
  flats,
  onOpen,
  children,
}: {
  song: PlayerSong
  semitones: number
  flats: boolean
  /** En obrir el reproductor (p. ex. per aturar l'autoscroll). */
  onOpen?: () => void
  children: ReactNode
}) {
  const storeRef = useRef<StoreApi<PlayerUiState> | null>(null)
  if (!storeRef.current) storeRef.current = createStore<PlayerUiState>(() => initialState(song))
  const store = storeRef.current
  const ctrlRef = useRef<PlayerController | null>(null)
  const videoElRef = useRef<HTMLElement | null>(null)
  const frameSubs = useRef(new Set<(t: number) => void>())
  const semitonesRef = useRef(semitones)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  // La transposició de la vista arriba al controlador (en mode sol, canvia el to de la guitarra)
  useEffect(() => {
    semitonesRef.current = semitones
    ctrlRef.current?.setSemitones(semitones)
  }, [semitones])

  const subscribeFrame = useCallback((cb: (t: number) => void) => {
    frameSubs.current.add(cb)
    return () => {
      frameSubs.current.delete(cb)
    }
  }, [])

  const open = useStore(store, (s) => s.open)

  // Un sol bucle de frames per a tots els subscriptors, només amb el reproductor obert
  useEffect(() => {
    if (!open) return
    let raf = 0
    const loop = () => {
      const c = ctrlRef.current
      if (c) {
        const t = c.now()
        for (const cb of frameSubs.current) cb(t)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [open])

  // En desmuntar la pàgina, s'apaga tot
  useEffect(
    () => () => {
      ctrlRef.current?.destroy()
      ctrlRef.current = null
    },
    [],
  )

  const actions = useMemo<PlayerActions>(() => {
    const set = (patch: Partial<PlayerUiState>) => store.setState(patch)

    const start = () => {
      const c = ctrlRef.current
      if (c) {
        c.toggle()
        return
      }
      if (store.getState().open) return
      onOpenRef.current?.()
      // Dins el clic: el context d'àudio i el desbloqueig d'iOS
      const ctx = createUnlockedAudioContext()
      const savedMix = readStorage<Partial<Mix>>(MIX_KEY) ?? {}
      set({ open: true, status: "loading", error: null, following: true })
      void loadController().then(async ({ PlayerController }) => {
        if (!store.getState().open) {
          void ctx.close()
          return
        }
        const ctrl = new PlayerController(
          {
            songId: song.id,
            youtubeId: song.youtubeId,
            capo: song.capo,
            fixedStyle: store.getState().fixedStyle,
            onChange: set,
          },
          ctx,
        )
        ctrl.restoreMix(savedMix)
        ctrl.setSemitones(semitonesRef.current)
        ctrlRef.current = ctrl
        set({ mix: ctrl.getMix() })
        if (videoElRef.current) await ctrl.setVideoElement(videoElRef.current)
        await ctrl.load()
      })
    }

    return {
      start,
      close: () => {
        ctrlRef.current?.destroy()
        ctrlRef.current = null
        store.setState({ ...initialState(song), fixedStyle: store.getState().fixedStyle })
      },
      toggle: () => {
        if (ctrlRef.current) ctrlRef.current.toggle()
        else start()
      },
      seek: (ms) => {
        ctrlRef.current?.seek(ms)
        set({ following: true })
      },
      setMode: (m) => ctrlRef.current?.setMode(m),
      setStyle: (s) => ctrlRef.current?.setStyle(s),
      setMix: (m) => {
        const c = ctrlRef.current
        if (!c) return
        c.setMix(m)
        set({ mix: c.getMix() })
        writeStorage(MIX_KEY, c.getMix())
      },
      setRate: (r) => ctrlRef.current?.setRate(r),
      setFollowing: (f) => set({ following: f }),
      setVideoCollapsed: (c) => set({ videoCollapsed: c }),
      setSettingsOpen: (o) => set({ settingsOpen: o }),
      setVideoElement: (el) => {
        videoElRef.current = el
        void ctrlRef.current?.setVideoElement(el)
      },
      fixStyle: async (style) => {
        const t = getT()
        const res = await fetch(`/api/admin/songs/${song.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rhythm: style }),
        })
        if (!res.ok) {
          useToastStore.getState().show(t.common.errors.errorGuardar, { type: "error" })
          return
        }
        set({ fixedStyle: style, styleSource: style ? "fixed" : store.getState().styleSource })
        useToastStore.getState().show(t.public.player.fixaRitmeFet)
      },
      stepSection: (dir) => {
        const c = ctrlRef.current
        const tl = store.getState().timeline
        if (!c || !tl || tl.sections.length === 0) return
        const now = c.now()
        const i = indexAt(tl.sections.map((s) => ({ t: s.start })), now + 300)
        // Enrere: si fa poc que ha començat la secció, a l'anterior; si no, al seu inici
        let target = i + dir
        if (dir === -1 && i >= 0 && now - tl.sections[i].start > 2000) target = i
        target = Math.min(Math.max(target, 0), tl.sections.length - 1)
        c.seek(tl.sections[target].start)
        set({ following: true })
      },
      now: () => ctrlRef.current?.now() ?? 0,
      prefetch: () => {
        void loadController()
      },
    }
  }, [store, song])

  // Mentre es reporta un error (body.report-active, PublicSongCard), la reproducció s'atura
  useEffect(() => {
    if (!open) return
    const body = document.body
    const mo = new MutationObserver(() => {
      if (body.classList.contains("report-active") && ctrlRef.current?.isPlaying()) ctrlRef.current.pause()
    })
    mo.observe(body, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [open])

  // Teclat: Espai (play/pausa) i Maj+fletxes (secció), només amb el reproductor obert
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return
      if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        actions.toggle()
      } else if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault()
        actions.stepSection(e.key === "ArrowLeft" ? -1 : 1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, actions])

  const value = useMemo<PlayerContextValue>(
    () => ({ store, actions, subscribeFrame, song, semitones, flats }),
    [store, actions, subscribeFrame, song, semitones, flats],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

function usePlayerContext(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer fora de PlayerProvider")
  return ctx
}

/** Selector fi sobre l'estat del reproductor. */
export function usePlayer<T>(selector: (s: PlayerUiState) => T): T {
  return useStore(usePlayerContext().store, selector)
}

/** Igual que usePlayer, però retorna undefined fora d'un PlayerProvider (cançons sense reproductor). */
export function usePlayerOptional<T>(selector: (s: PlayerUiState) => T): T | undefined {
  const ctx = useContext(PlayerContext)
  const store = ctx?.store ?? FALLBACK_STORE
  const v = useStore(store, selector)
  return ctx ? v : undefined
}
const FALLBACK_STORE = createStore<PlayerUiState>(() =>
  initialState({ id: 0, content: "", youtubeId: null, capo: 0, rhythm: null }),
)

export function usePlayerActions(): PlayerActions {
  return usePlayerContext().actions
}

export function usePlayerView(): { song: PlayerSong; semitones: number; flats: boolean } {
  const { song, semitones, flats } = usePlayerContext()
  return { song, semitones, flats }
}

/** `cb(t)` a cada frame mentre el reproductor és obert (t = ms de l'àudio original). */
export function usePlayerFrame(cb: (t: number) => void) {
  const { subscribeFrame } = usePlayerContext()
  const cbRef = useRef(cb)
  cbRef.current = cb
  useEffect(() => subscribeFrame((t) => cbRef.current(t)), [subscribeFrame])
}
