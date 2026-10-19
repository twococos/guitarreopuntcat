"use client"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { getT } from "@/lib/i18n"
import { UserWidget } from "@/components/UserWidget"
import {
  WysiwygEditor,
  type WysiwygEditorHandle,
} from "@/components/editor/WysiwygEditor"
import {
  SongHeader,
  type SongMetadata,
  YOUTUBE_URL_REGEX,
  SPOTIFY_URL_REGEX,
} from "@/components/editor/SongHeader"
import { youtubeVideoId } from "@/lib/youtube"
import { EditorToolbar } from "@/components/editor/EditorToolbar"
import { ConfirmToast } from "@/components/editor/ConfirmToast"
import { ProposeInfoPopup } from "@/components/editor/ProposeInfoPopup"
import { NewSongStartPopup } from "@/components/editor/NewSongStartPopup"
import { RejectProposalPopup } from "@/components/editor/RejectProposalPopup"
import { IconPencil } from "@/components/shared/Icons"
import { useEditorHistory } from "@/hooks/useEditorHistory"
import { useToastStore } from "@/hooks/useToasts"
import type { ImportResult } from "@/lib/importers"

const DRAFT_KEY = "editor_draft"
const PROPOSE_INFO_KEY = "propose_info_accepted"

interface DraftData {
  title?: string
  artist?: string
  key?: string
  capo?: number
  language?: string
  tags?: string
  content?: string
  album?: string
  year?: number | null
  youtubeUrl?: string
  spotifyUrl?: string
}

const DEFAULT_META: SongMetadata = {
  title: "",
  artist: "",
  key: "",
  capo: 0,
  language: "ca",
  tags: "",
  album: "",
  year: null,
  youtubeUrl: "",
  spotifyUrl: "",
}

/**
 * Accions de desat. Quines s'ofereixen depèn del mode i de la cançó (vegeu
 * `saveActions` més avall i .claude/PLAN_VISIBILITAT.md, Fase 2):
 *   publish          admin, nova → pública
 *   savePrivate      nova → privada pròpia
 *   propose          nova → proposta (POST /api/proposals)
 *   update           ?id= → PUT (admin, o propietari d'una privada)
 *   saveArrangement  ?id= d'una pública → còpia privada amb l'original
 *   proposeExisting  ?id= d'una privada pròpia → proposta
 *   resubmit         ?proposal=&mode=modify → torna a enviar la proposta
 */
type SaveAction =
  | "publish"
  | "savePrivate"
  | "propose"
  | "update"
  | "saveArrangement"
  | "proposeExisting"
  | "resubmit"

const PROPOSE_ACTIONS: ReadonlySet<SaveAction> = new Set(["propose", "proposeExisting", "resubmit"])

type ConfirmState = { kind: "reset" } | { kind: "accept" } | { kind: "save"; action: SaveAction }

/** Dades de la cançó carregada en mode `?id=` que decideixen els botons. */
interface EditInfo {
  kind: "public" | "private" | "arrangement" | "proposal"
  ownerId: number | null
  originalSongId: number | null
  originalTitle: string | null
  publicHref: string | null
}

interface LoadedSong {
  title: string
  artist: string
  key: string
  capo: number
  language: string
  tags: string
  content: string
  album: string | null
  year: number | null
  youtube_url: string | null
  spotify_url: string | null
  kind?: EditInfo["kind"]
  owner_id?: number | null
  original_song_id?: number | null
  artist_slug?: string | null
  song_slug?: string | null
}

interface ProposalMeta {
  id: number
  songId: number
  proposerName: string
  status?: string
  notes?: string | null
}

function snapshotOf(meta: SongMetadata, content: string): string {
  return JSON.stringify({
    meta: {
      title: meta.title.trim(),
      artist: meta.artist.trim(),
      key: meta.key,
      capo: meta.capo,
      language: meta.language,
      tags: meta.tags.trim(),
      album: meta.album.trim(),
      year: meta.year,
      youtubeUrl: meta.youtubeUrl.trim(),
      spotifyUrl: meta.spotifyUrl.trim(),
    },
    content: content.trim(),
  })
}

// `useSearchParams` obliga a renderitzar al client. Next no pot prerenderitzar
// aquest arbre estàticament, així que el contingut va dins d'un <Suspense> amb
// el mateix estat de càrrega que s'usa mentre la sessió es resol.
export default function EditorPage() {
  const t = getT()
  return (
    <Suspense
      fallback={
        <div id="editor-loading" aria-busy="true" style={{ padding: "2rem" }}>
          {t.editor.page.carregant}
        </div>
      }
    >
      <EditorPageContent />
    </Suspense>
  )
}

function EditorPageContent() {
  const t = getT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  const editId = searchParams.get("id")
  const isEdit = !!editId

  const proposalIdRaw = searchParams.get("proposal")
  const proposalId =
    proposalIdRaw && Number.isFinite(Number(proposalIdRaw))
      ? Number(proposalIdRaw)
      : null
  const modeParam = searchParams.get("mode")
  const isModify = proposalId !== null && modeParam === "modify"
  const isReview = proposalId !== null && !isModify

  const isAdmin = session?.user?.role === "admin"
  const myId = session?.user?.id ? Number(session.user.id) : null

  const editor = useEditorHistory("")
  const editorRef = useRef<WysiwygEditorHandle>(null)
  const initialSnapshotRef = useRef<string | null>(null)

  const [meta, setMeta] = useState<SongMetadata>(DEFAULT_META)
  const [showProposeInfo, setShowProposeInfo] = useState(false)
  const [showStartPopup, setShowStartPopup] = useState(false)
  const [showRejectPopup, setShowRejectPopup] = useState(false)
  const [proposalMeta, setProposalMeta] = useState<ProposalMeta | null>(null)
  const [editInfo, setEditInfo] = useState<EditInfo | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  // Acció de proposta que espera que l'usuari accepti el ProposeInfoPopup
  const [pendingPropose, setPendingPropose] = useState<SaveAction | null>(null)
  const [saving, setSaving] = useState(false)

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auth gate
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/")
    }
  }, [status, router])

  // Gate admin per a mode revisió
  useEffect(() => {
    if (status !== "authenticated") return
    if (isReview && !isAdmin) {
      useToastStore.getState().show(t.editor.toasts.calSerAdmin, {
        type: "error",
      })
      router.replace("/app")
    }
  }, [status, isReview, isAdmin, router])

  // Load song for edit mode OR restore draft for create mode OR load proposal for review/modify
  useEffect(() => {
    if (status !== "authenticated") return

    if (isModify && proposalId !== null) {
      ;(async () => {
        try {
          const propsRes = await fetch("/api/proposals")
          if (!propsRes.ok) throw new Error()
          const proposals = (await propsRes.json()) as Array<{
            id: number
            user_id: number
            song_id: number
            status: string
            notes: string | null
            proposer_name: string
          }>
          const p = proposals.find((x) => x.id === proposalId)
          if (!p) {
            useToastStore.getState().show(t.editor.toasts.propostaNoTrobada, { type: "error" })
            router.replace("/app/library?tab=proposals")
            return
          }
          if (session?.user?.id && Number(session.user.id) !== p.user_id) {
            useToastStore.getState().show(t.editor.toasts.noEtsElPropietari, {
              type: "error",
            })
            router.replace("/app/library?tab=proposals")
            return
          }
          if (p.status !== "pending" && p.status !== "rejected") {
            useToastStore.getState().show(t.editor.toasts.propostaNoEsPotModificar, {
              type: "error",
            })
            router.replace("/app/library?tab=proposals")
            return
          }
          setProposalMeta({
            id: p.id,
            songId: p.song_id,
            proposerName: p.proposer_name,
            status: p.status,
            notes: p.notes,
          })

          const songRes = await fetch(`/api/songs/${p.song_id}`)
          if (!songRes.ok) throw new Error()
          const song = (await songRes.json()) as {
            title: string
            artist: string
            key: string
            capo: number
            language: string
            tags: string
            content: string
            album: string | null
            year: number | null
            youtube_url: string | null
            spotify_url: string | null
          }
          const loadedMeta: SongMetadata = {
            title: song.title,
            artist: song.artist,
            key: song.key,
            capo: song.capo ?? 0,
            language: song.language ?? "ca",
            tags: song.tags ?? "",
            album: song.album ?? "",
            year: song.year,
            youtubeUrl: song.youtube_url ?? "",
            spotifyUrl: song.spotify_url ?? "",
          }
          setMeta(loadedMeta)
          editor.reset(song.content)
          initialSnapshotRef.current = snapshotOf(loadedMeta, song.content)
        } catch {
          useToastStore.getState().show(t.editor.toasts.noSHaPogutCarregarProposta, {
            type: "error",
          })
          router.replace("/app/library?tab=proposals")
        }
      })()
      return
    }

    if (isReview && proposalId !== null) {
      if (!isAdmin) return
      ;(async () => {
        try {
          const propsRes = await fetch("/api/proposals")
          if (!propsRes.ok) throw new Error()
          const proposals = (await propsRes.json()) as Array<{
            id: number
            song_id: number
            status: string
            proposer_name: string
          }>
          const p = proposals.find((x) => x.id === proposalId)
          if (!p) {
            useToastStore.getState().show(t.editor.toasts.propostaNoTrobada, { type: "error" })
            router.replace("/app/admin?tab=proposals")
            return
          }
          if (p.status !== "pending") {
            useToastStore.getState().show(t.editor.toasts.propostaJaRevisada, {
              type: "error",
            })
            router.replace("/app/admin?tab=proposals")
            return
          }
          setProposalMeta({
            id: p.id,
            songId: p.song_id,
            proposerName: p.proposer_name,
          })

          const songRes = await fetch(`/api/songs/${p.song_id}`)
          if (!songRes.ok) throw new Error()
          const song = (await songRes.json()) as {
            title: string
            artist: string
            key: string
            capo: number
            language: string
            tags: string
            content: string
            album: string | null
            year: number | null
            youtube_url: string | null
            spotify_url: string | null
          }
          setMeta({
            title: song.title,
            artist: song.artist,
            key: song.key,
            capo: song.capo ?? 0,
            language: song.language ?? "ca",
            tags: song.tags ?? "",
            album: song.album ?? "",
            year: song.year,
            youtubeUrl: song.youtube_url ?? "",
            spotifyUrl: song.spotify_url ?? "",
          })
          editor.reset(song.content)
        } catch {
          useToastStore.getState().show(t.editor.toasts.noSHaPogutCarregarProposta, {
            type: "error",
          })
          router.replace("/app/admin?tab=proposals")
        }
      })()
      return
    }

    if (isEdit && editId) {
      fetch(`/api/songs/${editId}`)
        .then((res) => {
          if (!res.ok) throw new Error()
          return res.json() as Promise<LoadedSong>
        })
        .then(async (song) => {
          let originalTitle: string | null = null
          if (song.original_song_id) {
            const o = await fetch(`/api/songs/${song.original_song_id}`).catch(() => null)
            if (o?.ok) originalTitle = ((await o.json()) as { title: string }).title
          }
          setEditInfo({
            kind: song.kind ?? "public",
            ownerId: song.owner_id ?? null,
            originalSongId: song.original_song_id ?? null,
            originalTitle,
            publicHref:
              song.kind === "public" && song.artist_slug && song.song_slug
                ? `/songs/${song.artist_slug}/${song.song_slug}`
                : null,
          })
          setMeta({
            title: song.title,
            artist: song.artist,
            key: song.key,
            capo: song.capo ?? 0,
            language: song.language ?? "ca",
            tags: song.tags ?? "",
            album: song.album ?? "",
            year: song.year,
            youtubeUrl: song.youtube_url ?? "",
            spotifyUrl: song.spotify_url ?? "",
          })
          editor.reset(song.content)
        })
        .catch(() => {
          useToastStore.getState().show(t.editor.toasts.noSHaPogutCarregarCanco, {
            type: "error",
          })
          router.replace("/app")
        })
    } else {
      // Restore draft
      let hasDraft = false
      if (typeof window !== "undefined") {
        const raw = sessionStorage.getItem(DRAFT_KEY)
        if (raw) {
          try {
            const d = JSON.parse(raw) as DraftData
            setMeta({
              title: d.title ?? "",
              artist: d.artist ?? "",
              key: d.key ?? "",
              capo: d.capo ?? 0,
              language: d.language ?? "ca",
              tags: d.tags ?? "",
              album: d.album ?? "",
              year: d.year ?? null,
              youtubeUrl: d.youtubeUrl ?? "",
              spotifyUrl: d.spotifyUrl ?? "",
            })
            if (d.content) {
              editor.reset(d.content)
            }
            hasDraft = !!(d.title || d.artist || d.content)
          } catch {
            // ignore malformed draft
          }
        }
      }
      // L'avís de propostes (ProposeInfoPopup) ja no surt en obrir: només
      // quan l'usuari tria proposar (desar com a privada no el necessita).
      if (isAdmin && !hasDraft) {
        // Admin sense draft pendent: mostra el popup d'inici (URL o manual)
        setShowStartPopup(true)
      }
    }
    // editor.reset is stable (useCallback), isEdit and editId are derived from URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isEdit, editId, isAdmin, isReview, isModify, proposalId, session?.user?.id])

  // Auto-save draft (create mode only) with debounce
  useEffect(() => {
    if (isEdit || isReview || isModify) return
    if (typeof window === "undefined") return

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      const draft: DraftData = {
        title: meta.title,
        artist: meta.artist,
        key: meta.key,
        capo: meta.capo,
        language: meta.language,
        tags: meta.tags,
        content: editor.value,
        album: meta.album,
        year: meta.year,
        youtubeUrl: meta.youtubeUrl,
        spotifyUrl: meta.spotifyUrl,
      }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    }, 250)

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [isEdit, isReview, isModify, meta, editor.value])

  // Reset complet de l'editor (després de guardar/proposar o per acció manual)
  const resetEditor = useCallback(() => {
    setMeta(DEFAULT_META)
    editor.reset("")
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(DRAFT_KEY)
    }
  }, [editor])

  function handleImported(data: ImportResult) {
    setMeta({
      title: data.title,
      artist: data.artist,
      key: data.key,
      capo: data.capo,
      language: data.language,
      tags: data.tags,
      album: data.album ?? "",
      year: data.year ?? null,
      youtubeUrl: data.youtubeUrl ?? "",
      spotifyUrl: data.spotifyUrl ?? "",
    })
    editor.reset(data.content)
    setShowStartPopup(false)
  }

  function handleManual() {
    setShowStartPopup(false)
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [])

  // Diff respecte l'estat inicial carregat (només mode modify)
  const hasChanges = useMemo(() => {
    if (!isModify) return false
    if (initialSnapshotRef.current === null) return false
    return snapshotOf(meta, editor.value) !== initialSnapshotRef.current
  }, [isModify, meta, editor.value])

  // On tornar després de desar o descartar en mode `?id=`
  const editBackHref = !editInfo
    ? "/app"
    : editInfo.ownerId !== null && editInfo.ownerId === myId
      ? "/app/library?tab=songs"
      : isAdmin
        ? "/app/admin?tab=songs"
        : (editInfo.publicHref ?? "/app")

  // Lògica de desat (sense validació: ja la fa requestSave)
  const doSave = useCallback(async (action: SaveAction) => {
    const body = {
      title: meta.title.trim(),
      artist: meta.artist.trim(),
      key: meta.key,
      capo: meta.capo,
      content: editor.value.trim(),
      language: meta.language,
      tags: meta.tags.trim(),
      album: meta.album.trim() || null,
      year: meta.year,
      youtubeUrl: meta.youtubeUrl.trim() || null,
      spotifyUrl: meta.spotifyUrl.trim() || null,
    }

    const send = (url: string, method: "POST" | "PUT", payload: object) =>
      fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((res) => {
        if (!res.ok) throw new Error()
        return res.json() as Promise<{ id?: number }>
      })
    const toast = (msg: string) => useToastStore.getState().show(msg, { type: "success" })

    try {
      switch (action) {
        case "resubmit":
          await send(`/api/proposals/${proposalId}`, "PUT", body)
          toast(t.editor.toasts.propostaModificadaReenviada)
          router.push("/app/library?tab=proposals")
          return
        case "update":
          await send(`/api/songs/${editId}`, "PUT", body)
          toast(t.editor.toasts.cancoActualitzada)
          router.push(editBackHref)
          return
        case "saveArrangement": {
          const res = await send(`/api/songs/${editId}/arrangement`, "POST", body)
          toast(t.editor.toasts.arranjamentDesat)
          router.push(isAdmin ? `/app/admin?tab=songs&focus=${res.id}` : "/app/library?tab=songs")
          return
        }
        case "proposeExisting":
          await send(`/api/songs/${editId}/propose`, "POST", body)
          toast(t.editor.toasts.propostaEnviada)
          router.push("/app/library?tab=proposals")
          return
        case "publish":
          await send("/api/songs", "POST", { ...body, visibility: "public" })
          resetEditor()
          setShowStartPopup(true)
          toast(t.editor.toasts.cancoGuardada)
          return
        case "savePrivate":
          await send("/api/songs", "POST", { ...body, visibility: "private" })
          resetEditor()
          if (isAdmin) setShowStartPopup(true)
          toast(t.editor.toasts.privadaDesada)
          return
        case "propose":
          await send("/api/proposals", "POST", body)
          resetEditor()
          toast(t.editor.toasts.propostaEnviada)
          return
      }
    } catch {
      useToastStore.getState().show(t.editor.toasts.errorGuardar, { type: "error" })
    }
  }, [meta, editor.value, editId, isAdmin, proposalId, resetEditor, router, editBackHref])

  // Botons de desat segons el mode i la cançó carregada
  const saveActions = useMemo((): { primary: SaveAction; secondary: SaveAction | null } => {
    if (isModify) return { primary: "resubmit", secondary: null }
    if (isEdit) {
      if (!editInfo) return { primary: "update", secondary: null }
      if (editInfo.kind === "public") {
        return isAdmin
          ? { primary: "update", secondary: "saveArrangement" }
          : { primary: "saveArrangement", secondary: null }
      }
      const isOwner = editInfo.ownerId !== null && editInfo.ownerId === myId
      if (isOwner && editInfo.kind === "private") return { primary: "update", secondary: "proposeExisting" }
      return { primary: "update", secondary: null }
    }
    return isAdmin
      ? { primary: "publish", secondary: "savePrivate" }
      : { primary: "savePrivate", secondary: "propose" }
  }, [isModify, isEdit, editInfo, isAdmin, myId])

  // ── Accions de revisió de propostes ─────────────────────────

  const doAccept = useCallback(async () => {
    if (!proposalMeta) return
    const body = {
      status: "approved" as const,
      notes: "",
      songUpdate: {
        title: meta.title.trim(),
        artist: meta.artist.trim(),
        key: meta.key,
        capo: meta.capo,
        content: editor.value.trim(),
        language: meta.language,
        tags: meta.tags.trim(),
        album: meta.album.trim() || null,
        year: meta.year,
        youtubeUrl: meta.youtubeUrl.trim(),
        spotifyUrl: meta.spotifyUrl.trim(),
      },
    }
    try {
      const res = await fetch(`/api/proposals/${proposalMeta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      useToastStore.getState().show(t.editor.toasts.propostaAcceptada, { type: "success" })
      router.push("/app/admin?tab=proposals")
    } catch {
      useToastStore.getState().show(t.editor.toasts.errorAcceptarProposta, {
        type: "error",
      })
    }
  }, [proposalMeta, meta, editor.value, router])

  const doReject = useCallback(
    async (reason: string) => {
      if (!proposalMeta) return
      try {
        const res = await fetch(`/api/proposals/${proposalMeta.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected", notes: reason }),
        })
        if (!res.ok) throw new Error()
        useToastStore.getState().show(t.editor.toasts.propostaRebutjada, { type: "success" })
        router.push("/app/admin?tab=proposals")
      } catch {
        useToastStore.getState().show(t.editor.toasts.errorRebutjarProposta, {
          type: "error",
        })
      }
    },
    [proposalMeta, router],
  )

  // ── Handlers de toolbar ──────────────────────────────────────

  function handleToolbarReset() {
    setConfirm({ kind: "reset" })
  }

  function requestSave(action: SaveAction) {
    // Validació prèvia abans d'obrir el toast de confirmació
    if (
      !meta.title.trim() ||
      !meta.artist.trim() ||
      !editor.value.trim()
    ) {
      useToastStore
        .getState()
        .show(t.editor.toasts.titolArtistaContingutObligatoris, { type: "error" })
      return
    }
    // Validació de format dels links (si s'han omplert)
    const yt = meta.youtubeUrl.trim()
    const sp = meta.spotifyUrl.trim()
    if (yt && !YOUTUBE_URL_REGEX.test(yt)) {
      useToastStore.getState().show(t.editor.toasts.youtubeNoValid, { type: "error" })
      return
    }
    if (sp && !SPOTIFY_URL_REGEX.test(sp)) {
      useToastStore.getState().show(t.editor.toasts.spotifyNoValid, { type: "error" })
      return
    }
    // Propostes: els dos links són obligatoris (també en re-enviar-la).
    if (PROPOSE_ACTIONS.has(action)) {
      if (!yt || !sp) {
        useToastStore
          .getState()
          .show(t.editor.toasts.calOmplirLinksPerProposta, {
            type: "error",
          })
        return
      }
      // Primera proposta de la sessió: abans, l'avís de com funcionen
      if (action !== "resubmit" && typeof window !== "undefined" && !sessionStorage.getItem(PROPOSE_INFO_KEY)) {
        setPendingPropose(action)
        setShowProposeInfo(true)
        return
      }
    }
    setConfirm({ kind: "save", action })
  }

  function handleToolbarAccept() {
    if (
      !meta.title.trim() ||
      !meta.artist.trim() ||
      !editor.value.trim()
    ) {
      useToastStore
        .getState()
        .show(t.editor.toasts.titolArtistaContingutObligatoris, { type: "error" })
      return
    }
    setConfirm({ kind: "accept" })
  }

  function handleToolbarReject() {
    setShowRejectPopup(true)
  }

  function handleToolbarInsertSection() {
    editorRef.current?.openSectionMenuAtCursor()
  }

  function handleToolbarInsertChord() {
    editorRef.current?.openChordMenuAtCursor()
  }

  // ── Handlers del ConfirmToast ────────────────────────────────

  async function handleConfirmConfirm() {
    if (confirm?.kind === "reset") {
      if (isModify && proposalId !== null) {
        setSaving(true)
        try {
          const res = await fetch(`/api/proposals/${proposalId}/cancel`, {
            method: "POST",
          })
          if (!res.ok) throw new Error()
          useToastStore.getState().show(t.editor.toasts.propostaCancellada, { type: "success" })
          router.push("/app/library?tab=proposals")
        } catch {
          useToastStore
            .getState()
            .show(t.editor.toasts.errorCancellarProposta, { type: "error" })
        } finally {
          setSaving(false)
          setConfirm(null)
        }
        return
      }
      if (isEdit) {
        // En mode edit, "Descartar canvis" → tornar enrere sense desar res.
        setConfirm(null)
        router.push(editBackHref)
        return
      }
      resetEditor()
      if (isAdmin) {
        setShowStartPopup(true)
      }
      setConfirm(null)
      useToastStore.getState().show(t.editor.toasts.progresEsborrat)
      return
    }
    if (confirm?.kind === "save") {
      setSaving(true)
      try {
        await doSave(confirm.action)
      } finally {
        setSaving(false)
        setConfirm(null)
      }
      return
    }
    if (confirm?.kind === "accept") {
      setSaving(true)
      try {
        await doAccept()
      } finally {
        setSaving(false)
        setConfirm(null)
      }
      return
    }
    setConfirm(null)
  }

  function handleConfirmCancel() {
    setConfirm(null)
  }

  async function handleRejectSubmit(reason: string) {
    setSaving(true)
    try {
      await doReject(reason)
    } finally {
      setSaving(false)
      setShowRejectPopup(false)
    }
  }

  // ── Derive titles and button text ────────────────────────────

  const sb = t.editor.page.saveButtons
  const ACTION_LABELS: Record<SaveAction, string> = {
    publish: sb.publicar,
    savePrivate: sb.desarPrivada,
    propose: sb.proposarPublica,
    update: editInfo?.kind === "public" && isAdmin ? sb.modificarCanco : sb.desar,
    saveArrangement: isAdmin ? sb.desarArranjament : sb.desarVersioPropia,
    proposeExisting: sb.proposarPublica,
    resubmit: sb.modificarProposta,
  }
  const ct = t.editor.confirmToast
  const ACTION_CONFIRMS: Record<SaveAction, { missatge: string; accio: string }> = {
    publish: ct.guardarCanco,
    savePrivate: ct.desarPrivada,
    propose: ct.proposarPublica,
    update: editInfo?.kind === "public" ? ct.actualitzarCanco : ct.desarCanvisPrivada,
    saveArrangement: ct.desarArranjament,
    proposeExisting: ct.proposarPublica,
    resubmit: ct.reEnviarProposta,
  }

  let pageTitle: string
  let pageSubtitle: string

  if (isModify) {
    pageTitle = t.editor.page.titols.modificarPropostaTitol
    pageSubtitle = t.editor.page.titols.modificarPropostaSubtitol
  } else if (isReview) {
    pageTitle = t.editor.page.titols.revisarPropostaTitol
    pageSubtitle = proposalMeta
      ? t.editor.page.titols.revisarPropostaDe(proposalMeta.proposerName)
      : t.editor.page.titols.revisarPropostaCarregant
  } else if (isEdit && editInfo?.kind === "public" && !isAdmin) {
    pageTitle = t.editor.page.titols.versioPropiaTitol
    pageSubtitle = t.editor.page.titols.versioPropiaSubtitol
  } else if (isEdit) {
    pageTitle = t.editor.page.titols.editarCancoTitol
    pageSubtitle =
      editInfo?.kind === "arrangement"
        ? t.editor.page.titols.editarArranjamentSubtitol(editInfo.originalTitle ?? `#${editInfo.originalSongId}`)
        : editInfo?.kind === "private"
          ? t.editor.page.titols.editarPrivadaSubtitol
          : t.editor.page.titols.editarCancoSubtitol
  } else {
    pageTitle = t.editor.page.titols.novaCancoTitol
    pageSubtitle = t.editor.page.titols.novaCancoSubtitol
  }

  // Missatge i etiquetes del ConfirmToast segons l'acció
  let confirmMessage = ""
  let confirmActionLabel = ""
  let confirmVariant: "primary" | "danger" = "primary"
  if (confirm?.kind === "reset") {
    if (isModify) {
      confirmMessage = t.editor.confirmToast.cancellarProposta.missatge
      confirmActionLabel = t.editor.confirmToast.cancellarProposta.accio
    } else if (isEdit) {
      confirmMessage = t.editor.confirmToast.descartarCanvis.missatge
      confirmActionLabel = t.editor.confirmToast.descartarCanvis.accio
    } else {
      confirmMessage = t.editor.confirmToast.esborrarProgres.missatge
      confirmActionLabel = t.editor.confirmToast.esborrarProgres.accio
    }
    confirmVariant = "danger"
  } else if (confirm?.kind === "save") {
    confirmMessage = ACTION_CONFIRMS[confirm.action].missatge
    confirmActionLabel = ACTION_CONFIRMS[confirm.action].accio
    confirmVariant = "primary"
  } else if (confirm?.kind === "accept") {
    confirmMessage = t.editor.confirmToast.acceptarProposta.missatge
    confirmActionLabel = t.editor.confirmToast.acceptarProposta.accio
    confirmVariant = "primary"
  }

  const placeholder = t.editor.page.placeholder

  const rejectionNotes =
    isModify &&
    proposalMeta?.status === "rejected" &&
    proposalMeta.notes &&
    proposalMeta.notes.trim() !== ""
      ? proposalMeta.notes
      : null

  let backHref: string
  let backLabel: string
  if (isModify) {
    backHref = "/app/library?tab=proposals"
    backLabel = t.editor.page.backLinks.lesMevesPropostes
  } else if (isReview) {
    backHref = "/app/admin?tab=proposals"
    backLabel = t.editor.page.backLinks.panellAdmin
  } else if (isEdit && editInfo) {
    backHref = editBackHref
    backLabel =
      editBackHref === "/app/library?tab=songs"
        ? t.editor.page.backLinks.lesMevesCancons
        : editBackHref === "/app/admin?tab=songs"
          ? t.editor.page.backLinks.panellCancons
          : t.editor.page.backLinks.canconer
  } else {
    backHref = "/app"
    backLabel = t.editor.page.backLinks.canconer
  }

  // ── Estats de càrrega / no autenticat ────────────────────────

  if (status === "loading") {
    return (
      <div id="editor-loading" aria-busy="true" style={{ padding: "2rem" }}>
        {t.editor.page.carregant}
      </div>
    )
  }

  if (status === "unauthenticated") {
    return null
  }

  return (
    <>
      <header>
        <a href={backHref} className="back-link">
          {backLabel}
        </a>
        <h1 id="editor-title"><IconPencil /> {pageTitle}</h1>
        <p className="subtitle" id="editor-subtitle">
          {pageSubtitle}
        </p>
        <div className="header-actions">
          <UserWidget />
        </div>
      </header>

      <main className="editor-page">
        {isModify && rejectionNotes && (
          <div className="editor-rejection-banner">
            <strong>{t.editor.page.bannerPropostaRebutjada}</strong>
            <p>{t.editor.page.retroaccioAdmin} {rejectionNotes}</p>
          </div>
        )}
        <div className="editor-stack">
          <SongHeader value={meta} onChange={setMeta} linksRequired={isModify} />
          <EditorToolbar
            onInsertSection={handleToolbarInsertSection}
            onInsertChord={handleToolbarInsertChord}
            onUndo={editor.undo}
            onRedo={editor.redo}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            saveLabel={ACTION_LABELS[saveActions.primary]}
            onSave={() => requestSave(saveActions.primary)}
            secondaryLabel={saveActions.secondary ? ACTION_LABELS[saveActions.secondary] : undefined}
            onSecondary={
              saveActions.secondary
                ? () => requestSave(saveActions.secondary as SaveAction)
                : undefined
            }
            onReset={handleToolbarReset}
            resetLabel={
              isModify ? t.editor.page.resetLabels.cancellarProposta : isEdit ? t.editor.page.resetLabels.descartarCanvis : t.editor.page.resetLabels.reset
            }
            saving={saving}
            disabledReason={
              !meta.key
                ? t.editor.page.seleccionaTonalitat
                : undefined
            }
            mode={isReview ? "review" : "normal"}
            onAccept={handleToolbarAccept}
            onReject={handleToolbarReject}
            saveDisabledHint={
              isModify && !hasChanges
                ? t.editor.page.noSHaModificatRes
                : undefined
            }
          />
          <WysiwygEditor
            ref={editorRef}
            value={editor.value}
            onChange={(v) => {
              editor.setValue(v)
              editor.scheduleCommit(v)
            }}
            onCommit={editor.commit}
            onUndo={editor.undo}
            onRedo={editor.redo}
            chordKey={meta.key}
            placeholder={placeholder}
            disabledReason={
              !meta.key
                ? t.editor.page.seleccionaTonalitat
                : undefined
            }
          />
          {(() => {
            const yt = meta.youtubeUrl.trim()
            if (!yt || !YOUTUBE_URL_REGEX.test(yt)) return null
            const id = youtubeVideoId(yt)
            if (!id) return null
            return (
              <div className="song-yt-embed">
                <iframe
                  src={`https://www.youtube.com/embed/${id}`}
                  title={t.editor.wysiwyg.reproductorYoutube}
                  allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )
          })()}
        </div>
      </main>

      <ConfirmToast
        open={confirm !== null}
        message={confirmMessage}
        confirmLabel={confirmActionLabel}
        cancelLabel={t.common.accions.cancellar}
        confirmVariant={confirmVariant}
        onConfirm={handleConfirmConfirm}
        onCancel={handleConfirmCancel}
      />

      {showProposeInfo && (
        <ProposeInfoPopup
          onAccept={() => {
            if (typeof window !== "undefined") {
              sessionStorage.setItem(PROPOSE_INFO_KEY, "1")
            }
            setShowProposeInfo(false)
            if (pendingPropose) {
              setConfirm({ kind: "save", action: pendingPropose })
              setPendingPropose(null)
            }
          }}
        />
      )}

      {showStartPopup && (
        <NewSongStartPopup
          onManual={handleManual}
          onImported={handleImported}
        />
      )}

      {showRejectPopup && proposalMeta && (
        <RejectProposalPopup
          proposerName={proposalMeta.proposerName}
          saving={saving}
          onCancel={() => setShowRejectPopup(false)}
          onSubmit={handleRejectSubmit}
        />
      )}
    </>
  )
}
