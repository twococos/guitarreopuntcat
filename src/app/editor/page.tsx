"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { UserWidget } from "@/components/UserWidget"
import { ChordEditor, type ChordEditorHandle } from "@/components/editor/ChordEditor"
import { SongMetadataForm, type SongMetadata } from "@/components/editor/SongMetadataForm"
import { ChordPalette } from "@/components/editor/ChordPalette"
import { ChordContextMenu } from "@/components/editor/ChordContextMenu"
import { EditorToolbar } from "@/components/editor/EditorToolbar"
import { ProposeInfoPopup } from "@/components/editor/ProposeInfoPopup"
import { useEditorHistory } from "@/hooks/useEditorHistory"

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
}

const DEFAULT_META: SongMetadata = {
  title: "",
  artist: "",
  key: "Am",
  capo: 0,
  language: "ca",
  tags: "",
}

export default function EditorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  const editId = searchParams.get("id")
  const isEdit = !!editId

  const isAdmin = session?.user?.role === "admin"

  const editor = useEditorHistory("")
  const editorRef = useRef<ChordEditorHandle>(null)

  const [meta, setMeta] = useState<SongMetadata>(DEFAULT_META)
  const [menu, setMenu] = useState({ open: false, x: 0, y: 0 })
  const [previewOn, setPreviewOn] = useState(false)
  const [status2, setStatus2] = useState({ msg: "", cls: "" })
  const [showProposeInfo, setShowProposeInfo] = useState(false)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auth gate
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/")
    }
  }, [status, router])

  // Load song for edit mode OR restore draft for create mode
  useEffect(() => {
    if (status !== "authenticated") return

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
          })
          editor.reset(song.content)
        })
        .catch(() => {
          alert("No s'ha pogut carregar la cançó.")
          router.replace("/")
        })
    } else {
      // Restore draft
      if (typeof window !== "undefined") {
        const raw = sessionStorage.getItem(DRAFT_KEY)
        if (raw) {
          try {
            const d = JSON.parse(raw) as DraftData
            setMeta({
              title: d.title ?? "",
              artist: d.artist ?? "",
              key: d.key ?? "Am",
              capo: d.capo ?? 0,
              language: d.language ?? "ca",
              tags: d.tags ?? "",
            })
            if (d.content) {
              editor.reset(d.content)
            }
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
      }
    }
    // editor.reset is stable (useCallback), isEdit and editId are derived from URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isEdit, editId, isAdmin])

  // Auto-save draft (create mode only) with debounce
  useEffect(() => {
    if (isEdit) return
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
      }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    }, 250)

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [isEdit, meta, editor.value])

  const setStatusMsg = useCallback((msg: string, cls: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    setStatus2({ msg, cls })
    statusTimerRef.current = setTimeout(() => {
      setStatus2({ msg: "", cls: "" })
      statusTimerRef.current = null
    }, 5000)
  }, [])

  // Cleanup status timer on unmount
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [])

  // Editor handlers
  function handleEditorChange(next: string) {
    editor.setValue(next)
    editor.scheduleCommit(next)
  }

  function handleEditorCommit(next: string) {
    editor.commit(next)
  }

  // Context menu
  function openMenu(x: number, y: number) {
    setMenu({ open: true, x, y })
  }

  function closeMenu() {
    setMenu((m) => ({ ...m, open: false }))
  }

  // Insertions via palette / toolbar / context menu
  function onInsertChordChip(chord: string) {
    editorRef.current?.insertAtCursor(`<ch>${chord}</ch>`)
  }

  function onMenuInsertSection() {
    editorRef.current?.insertSection()
  }

  function onMenuInsertChord(chord: string) {
    editorRef.current?.insertAtCursor(`<ch>${chord}</ch>`)
  }

  function onToolbarInsertSection() {
    editorRef.current?.insertSection()
  }

  function onToolbarInsertChord() {
    editorRef.current?.insertEmptyChord()
  }

  // Save handler
  async function handleSave() {
    const title = meta.title.trim()
    const artist = meta.artist.trim()
    const content = editor.value.trim()

    if (!title || !artist || !content) {
      setStatusMsg("⚠ Títol, artista i contingut són obligatoris.", "err")
      return
    }

    const body = {
      title,
      artist,
      key: meta.key,
      capo: meta.capo,
      content,
      language: meta.language,
      tags: meta.tags.trim(),
    }

    try {
      let res: Response
      if (isEdit && editId) {
        res = await fetch(`/api/songs/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        setStatusMsg("✓ Cançó actualitzada!", "ok")
      } else if (isAdmin) {
        res = await fetch("/api/songs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        if (typeof window !== "undefined") sessionStorage.removeItem(DRAFT_KEY)
        setStatusMsg("✓ Cançó guardada!", "ok")
      } else {
        res = await fetch("/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        if (typeof window !== "undefined") sessionStorage.removeItem(DRAFT_KEY)
        setStatusMsg("✓ Proposta enviada! Un admin la revisarà aviat.", "ok")
      }
    } catch {
      setStatusMsg("✕ Error en guardar.", "err")
    }
  }

  // Derive titles and button text
  let pageTitle: string
  let pageSubtitle: string
  let saveButtonText: string

  if (isEdit) {
    pageTitle = "✏️ Editar cançó"
    pageSubtitle = "Modifica i guarda els canvis"
    saveButtonText = "💾 Guardar canvis"
  } else {
    pageTitle = "✏️ Nova cançó"
    pageSubtitle = "Escriu la lletra, clic dret per inserir acords"
    saveButtonText = isAdmin ? "💾 Guardar cançó" : "📤 Enviar proposta"
  }

  const placeholder = `Escriu aquí la lletra de la cançó.\nClic dret per inserir acords.\n\nExemple:\n<sec>Estrofa 1</sec>\n<ch>Am</ch> En un lloc de la <ch>F</ch> Manxa...`

  // Loading state
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
        <a href="/" className="back-link">
          ← Cançoner
        </a>
        <h1 id="editor-title">{pageTitle}</h1>
        <p className="subtitle" id="editor-subtitle">
          {pageSubtitle}
        </p>
        <div className="header-actions">
          <UserWidget />
        </div>
      </header>

      <div id="editor-layout">
        <aside id="meta-panel">
          <h2>Metadades</h2>
          <SongMetadataForm value={meta} onChange={setMeta} />
          <hr />
          <h2>Acords del to</h2>
          <p className="hint">
            Clic dret a l&apos;editor per inserir-ne un.
            <br />
            Referència ràpida:
          </p>
          <ChordPalette chordKey={meta.key} onInsert={onInsertChordChip} />
          <hr />
          <button id="btn-save" className="btn-primary" onClick={handleSave}>
            {saveButtonText}
          </button>
          <p id="save-status" className={status2.cls}>
            {status2.msg}
          </p>
        </aside>

        <div id="editor-main">
          <div id="editor-section">
            <EditorToolbar
              onInsertSection={onToolbarInsertSection}
              onInsertChord={onToolbarInsertChord}
              onUndo={editor.undo}
              onRedo={editor.redo}
              canUndo={editor.canUndo}
              canRedo={editor.canRedo}
              previewOn={previewOn}
              onTogglePreview={setPreviewOn}
            />
            <ChordEditor
              ref={editorRef}
              value={editor.value}
              onChange={handleEditorChange}
              onCommit={handleEditorCommit}
              onUndo={editor.undo}
              onRedo={editor.redo}
              onContextMenuOpen={openMenu}
              placeholder={placeholder}
            />
          </div>
          {previewOn && (
            <div id="preview-panel">
              <h3>Vista prèvia</h3>
              {/* eslint-disable-next-line react/no-danger */}
              <div id="preview-body" dangerouslySetInnerHTML={{ __html: editor.value }} />
            </div>
          )}
        </div>
      </div>

      <ChordContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        chordKey={meta.key}
        onInsertSection={onMenuInsertSection}
        onInsertChord={onMenuInsertChord}
        onClose={closeMenu}
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
    </>
  )
}
