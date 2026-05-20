"use client"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type KeyboardEvent,
} from "react"

interface Props {
  value: string
  onChange: (value: string) => void
  /** Crida quan l'usuari fa pausa d'escriptura (commit a l'historial). */
  onCommit?: (value: string) => void
  onUndo?: () => void
  onRedo?: () => void
  onContextMenuOpen?: (clientX: number, clientY: number) => void
  placeholder?: string
}

export interface ChordEditorHandle {
  insertAtCursor: (text: string) => void
  insertSection: () => void
  insertEmptyChord: () => void
  getTextarea: () => HTMLTextAreaElement | null
}

function escHTML(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function syntaxHighlight(raw: string): string {
  return escHTML(raw)
    .replace(
      /&lt;sec&gt;(.*?)&lt;\/sec&gt;/g,
      '<span class="hl-tag">&lt;sec&gt;</span><span class="hl-sec">$1</span><span class="hl-tag">&lt;/sec&gt;</span>',
    )
    .replace(
      /&lt;ch&gt;(.*?)&lt;\/ch&gt;/g,
      '<span class="hl-tag">&lt;ch&gt;</span><span class="hl-ch">$1</span><span class="hl-tag">&lt;/ch&gt;</span>',
    )
}

export const ChordEditor = forwardRef<ChordEditorHandle, Props>(function ChordEditor(
  { value, onChange, onCommit, onUndo, onRedo, onContextMenuOpen, placeholder },
  ref,
) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const hlRef = useRef<HTMLPreElement>(null)

  // Sincronitzar scroll entre textarea i overlay
  const syncScroll = useCallback(() => {
    if (taRef.current && hlRef.current) {
      hlRef.current.scrollTop = taRef.current.scrollTop
      hlRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }, [])

  useEffect(() => {
    syncScroll()
  }, [value, syncScroll])

  /** Insereix `text` allà on és el cursor, actualitza valor i historial. */
  const insertAtCursor = useCallback(
    (text: string) => {
      const ta = taRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = value.slice(0, start) + text + value.slice(end)
      onChange(next)
      onCommit?.(next)
      // Reposicionar el cursor després de l'actualització.
      // Cal esperar el render perquè value es propagui al DOM.
      requestAnimationFrame(() => {
        const pos = start + text.length
        ta.setSelectionRange(pos, pos)
        ta.focus()
      })
    },
    [value, onChange, onCommit],
  )

  /** Insereix `<sec>...</sec>`. Si hi ha selecció, l'embolica; si no, deixa cursor a dins. */
  const insertSection = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = value.slice(start, end).trim()

    let next: string
    let cursorStart: number
    let cursorEnd: number
    if (sel) {
      const repl = `<sec>${sel}</sec>`
      next = value.slice(0, start) + repl + value.slice(end)
      cursorStart = start + 5
      cursorEnd = start + 5 + sel.length
    } else {
      const tag = "<sec></sec>"
      next = value.slice(0, start) + tag + value.slice(end)
      cursorStart = start + 5
      cursorEnd = start + 5
    }
    onChange(next)
    onCommit?.(next)
    requestAnimationFrame(() => {
      ta.setSelectionRange(cursorStart, cursorEnd)
      ta.focus()
    })
  }, [value, onChange, onCommit])

  /** Insereix `<ch>...</ch>` amb selecció a dins (o buit). */
  const insertEmptyChord = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = value.slice(start, end).trim()
    if (sel) {
      insertAtCursor(`<ch>${sel}</ch>`)
      return
    }
    const tag = "<ch></ch>"
    const next = value.slice(0, start) + tag + value.slice(start)
    onChange(next)
    onCommit?.(next)
    requestAnimationFrame(() => {
      const pos = start + 4 // <ch>|</ch>
      ta.setSelectionRange(pos, pos)
      ta.focus()
    })
  }, [value, onChange, onCommit, insertAtCursor])

  useImperativeHandle(ref, () => ({
    insertAtCursor,
    insertSection,
    insertEmptyChord,
    getTextarea: () => taRef.current,
  }))

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab → dos espais
      if (e.key === "Tab") {
        e.preventDefault()
        insertAtCursor("  ")
        return
      }
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault()
        onUndo?.()
        return
      }
      if (ctrl && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault()
        onRedo?.()
        return
      }
    },
    [insertAtCursor, onUndo, onRedo],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      if (!onContextMenuOpen) return
      e.preventDefault()
      onContextMenuOpen(e.clientX, e.clientY)
    },
    [onContextMenuOpen],
  )

  const highlighted = useMemo(() => syntaxHighlight(value) + "\n", [value])

  return (
    <div id="editor-wrap">
      <textarea
        ref={taRef}
        id="editor"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
      />
      <pre
        id="editor-highlight"
        ref={hlRef}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
})
