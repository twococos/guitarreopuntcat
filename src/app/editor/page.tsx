"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
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

type ConfirmKind = "reset" | "save" | "accept"

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

export default function EditorPage() {
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

  const editor = useEditorHistory("")
  const editorRef = useRef<WysiwygEditorHandle>(null)
  const initialSnapshotRef = useRef<string | null>(null)

  const [meta, setMeta] = useState<SongMetadata>(DEFAULT_META)
  const [showProposeInfo, setShowProposeInfo] = useState(false)
  const [showStartPopup, setShowStartPopup] = useState(false)
  const [showRejectPopup, setShowRejectPopup] = useState(false)
  const [proposalMeta, setProposalMeta] = useState<ProposalMeta | null>(null)
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind } | null>(null)
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
      useToastStore.getState().show("Cal ser administrador per a revisar propostes.", {
        type: "error",
      })
      router.replace("/")
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
            useToastStore.getState().show("Proposta no trobada.", { type: "error" })
            router.replace("/library?tab=proposals")
            return
          }
          if (session?.user?.id && Number(session.user.id) !== p.user_id) {
            useToastStore.getState().show("No ets el propietari d'aquesta proposta.", {
              type: "error",
            })
            router.replace("/library?tab=proposals")
            return
          }
          if (p.status !== "pending" && p.status !== "rejected") {
            useToastStore.getState().show("Aquesta proposta ja no es pot modificar.", {
              type: "error",
            })
            router.replace("/library?tab=proposals")
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
          useToastStore.getState().show("No s'ha pogut carregar la proposta.", {
            type: "error",
          })
          router.replace("/library?tab=proposals")
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
            useToastStore.getState().show("Proposta no trobada.", { type: "error" })
            router.replace("/admin?tab=proposals")
            return
          }
          if (p.status !== "pending") {
            useToastStore.getState().show("Aquesta proposta ja ha estat revisada.", {
              type: "error",
            })
            router.replace("/admin?tab=proposals")
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
          useToastStore.getState().show("No s'ha pogut carregar la proposta.", {
            type: "error",
          })
          router.replace("/admin?tab=proposals")
        }
      })()
      return
    }

    if (isEdit && editId) {
      fetch(`/api/songs/${editId}`)
        .then((res) => {
          if (!res.ok) throw new Error()
          return res.json() as Promise<{
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
          }>
        })
        .then((song) => {
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
          useToastStore.getState().show("No s'ha pogut carregar la cançó.", {
            type: "error",
          })
          router.replace("/")
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
      // Show propose info popup if not admin and not accepted
      if (!isAdmin) {
        if (typeof window !== "undefined") {
          const accepted = sessionStorage.getItem(PROPOSE_INFO_KEY)
          if (!accepted) {
            setShowProposeInfo(true)
          }
        }
      } else if (!hasDraft) {
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

  // Lògica de desat (sense validació: ja la fa handleToolbarSave)
  const doSave = useCallback(async () => {
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

    try {
      let res: Response
      if (isModify && proposalId !== null) {
        res = await fetch(`/api/proposals/${proposalId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        useToastStore
          .getState()
          .show("Proposta modificada i re-enviada!", { type: "success" })
        router.push("/library?tab=proposals")
        return
      } else if (isEdit && editId) {
        res = await fetch(`/api/songs/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        useToastStore.getState().show("Cançó actualitzada!", { type: "success" })
        router.push("/admin?tab=songs")
        return
      } else if (isAdmin) {
        res = await fetch("/api/songs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        resetEditor()
        setShowStartPopup(true)
        useToastStore.getState().show("Cançó guardada!", { type: "success" })
      } else {
        res = await fetch("/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        resetEditor()
        useToastStore
          .getState()
          .show("Proposta enviada! Un admin la revisarà aviat.", {
            type: "success",
          })
      }
    } catch {
      useToastStore.getState().show("Error en guardar.", { type: "error" })
    }
  }, [meta, editor.value, isEdit, editId, isAdmin, isModify, proposalId, resetEditor, router])

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
      useToastStore.getState().show("Proposta acceptada!", { type: "success" })
      router.push("/admin?tab=proposals")
    } catch {
      useToastStore.getState().show("Error en acceptar la proposta.", {
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
        useToastStore.getState().show("Proposta rebutjada.", { type: "success" })
        router.push("/admin?tab=proposals")
      } catch {
        useToastStore.getState().show("Error en rebutjar la proposta.", {
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

  function handleToolbarSave() {
    // Validació prèvia abans d'obrir el toast de confirmació
    if (
      !meta.title.trim() ||
      !meta.artist.trim() ||
      !editor.value.trim()
    ) {
      useToastStore
        .getState()
        .show("Títol, artista i contingut són obligatoris.", { type: "error" })
      return
    }
    // Validació de format dels links (si s'han omplert)
    const yt = meta.youtubeUrl.trim()
    const sp = meta.spotifyUrl.trim()
    if (yt && !YOUTUBE_URL_REGEX.test(yt)) {
      useToastStore.getState().show("Link de YouTube no vàlid.", { type: "error" })
      return
    }
    if (sp && !SPOTIFY_URL_REGEX.test(sp)) {
      useToastStore.getState().show("Link de Spotify no vàlid.", { type: "error" })
      return
    }
    // Propostes (no-admin): els dos links són obligatoris.
    // També s'aplica al mode modify (re-enviar la proposta).
    if (isModify || (!isAdmin && !isEdit)) {
      if (!yt || !sp) {
        useToastStore
          .getState()
          .show("Cal omplir els links de YouTube i Spotify per a enviar una proposta.", {
            type: "error",
          })
        return
      }
    }
    setConfirm({ kind: "save" })
  }

  function handleToolbarAccept() {
    if (
      !meta.title.trim() ||
      !meta.artist.trim() ||
      !editor.value.trim()
    ) {
      useToastStore
        .getState()
        .show("Títol, artista i contingut són obligatoris.", { type: "error" })
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
          useToastStore.getState().show("Proposta cancel·lada.", { type: "success" })
          router.push("/library?tab=proposals")
        } catch {
          useToastStore
            .getState()
            .show("Error en cancel·lar la proposta.", { type: "error" })
        } finally {
          setSaving(false)
          setConfirm(null)
        }
        return
      }
      if (isEdit) {
        // En mode edit, "Descartar canvis" → tornar a /admin sense desar res.
        setConfirm(null)
        router.push("/admin?tab=songs")
        return
      }
      resetEditor()
      if (isAdmin) {
        setShowStartPopup(true)
      }
      setConfirm(null)
      useToastStore.getState().show("Progrés esborrat.")
      return
    }
    if (confirm?.kind === "save") {
      setSaving(true)
      try {
        await doSave()
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

  let pageTitle: string
  let pageSubtitle: string
  let saveButtonText: string

  if (isModify) {
    pageTitle = "✏️ Modificar proposta"
    pageSubtitle =
      "Modifica la teva proposta i torna a enviar-la perquè un admin la revisi."
    saveButtonText = "Modificar Proposta"
  } else if (isReview) {
    pageTitle = "✏️ Revisar proposta"
    pageSubtitle = proposalMeta
      ? `Proposta de ${proposalMeta.proposerName}`
      : "Carregant proposta…"
    saveButtonText = "Acceptar"
  } else if (isEdit) {
    pageTitle = "✏️ Editar cançó"
    pageSubtitle = "Modifica i guarda els canvis"
    saveButtonText = "Guardar canvis"
  } else {
    pageTitle = "✏️ Nova cançó"
    pageSubtitle = "Escriu la lletra de la cançó"
    saveButtonText = isAdmin ? "Guardar cançó" : "Enviar proposta"
  }

  // Missatge i etiquetes del ConfirmToast segons l'acció
  let confirmMessage = ""
  let confirmActionLabel = ""
  let confirmVariant: "primary" | "danger" = "primary"
  if (confirm?.kind === "reset") {
    if (isModify) {
      confirmMessage =
        "Cancel·lar la proposta sencera? Es perdrà i no apareixerà a la teva llista."
      confirmActionLabel = "Sí, cancel·lar"
    } else if (isEdit) {
      confirmMessage =
        "Descartar els canvis i tornar al panell admin? Es perdran les modificacions no guardades."
      confirmActionLabel = "Sí, descartar"
    } else {
      confirmMessage =
        "Esborrar tot el progrés? Es perdran títol, artista i contingut."
      confirmActionLabel = "Sí, esborrar"
    }
    confirmVariant = "danger"
  } else if (confirm?.kind === "save") {
    if (isModify) {
      confirmMessage =
        "Re-enviar la proposta modificada perquè un admin la torni a revisar?"
      confirmActionLabel = "Sí, re-enviar"
    } else if (isEdit) {
      confirmMessage = "Actualitzar la cançó a la base de dades pública?"
      confirmActionLabel = "Sí, actualitzar"
    } else if (isAdmin) {
      confirmMessage = "Guardar la cançó a la base de dades pública?"
      confirmActionLabel = "Sí, guardar"
    } else {
      confirmMessage = "Enviar la proposta perquè un admin la revisi?"
      confirmActionLabel = "Sí, enviar"
    }
    confirmVariant = "primary"
  } else if (confirm?.kind === "accept") {
    confirmMessage =
      "Acceptar la proposta i guardar la cançó a la base de dades?"
    confirmActionLabel = "Sí, acceptar"
    confirmVariant = "primary"
  }

  const placeholder = `Escriu aquí la lletra de la cançó.
Clic dret per inserir acords, clic mig per inserir seccions.`

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
    backHref = "/library?tab=proposals"
    backLabel = "← Les meves propostes"
  } else if (isReview) {
    backHref = "/admin?tab=proposals"
    backLabel = "← Panell admin"
  } else {
    backHref = "/"
    backLabel = "← Cançoner"
  }

  // ── Estats de càrrega / no autenticat ────────────────────────

  if (status === "loading") {
    return (
      <div id="editor-loading" aria-busy="true" style={{ padding: "2rem" }}>
        Carregant…
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
        <h1 id="editor-title">{pageTitle}</h1>
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
            <strong>La teva proposta va ser rebutjada.</strong>
            <p>Retroacció de l&apos;administrador: {rejectionNotes}</p>
          </div>
        )}
        <div className="editor-stack">
          <SongHeader value={meta} onChange={setMeta} isAdmin={isAdmin} />
          <EditorToolbar
            onInsertSection={handleToolbarInsertSection}
            onInsertChord={handleToolbarInsertChord}
            onUndo={editor.undo}
            onRedo={editor.redo}
            canUndo={editor.canUndo}
            canRedo={editor.canRedo}
            saveLabel={saveButtonText}
            onSave={handleToolbarSave}
            onReset={handleToolbarReset}
            resetLabel={
              isModify ? "Cancel·lar" : isEdit ? "Descartar canvis" : "Reset"
            }
            saving={saving}
            disabledReason={
              !meta.key
                ? "Selecciona la tonalitat per a començar la cançó"
                : undefined
            }
            mode={isReview ? "review" : "normal"}
            onAccept={handleToolbarAccept}
            onReject={handleToolbarReject}
            saveDisabledHint={
              isModify && !hasChanges
                ? "No s'ha modificat res encara"
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
                ? "Selecciona la tonalitat per a començar la cançó"
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
                  title="Reproductor YouTube"
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
        cancelLabel="Cancel·lar"
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
