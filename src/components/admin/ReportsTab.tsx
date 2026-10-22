"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getT } from "@/lib/i18n"
import { useToastStore } from "@/hooks/useToasts"
import { describeItem } from "@/lib/reports/describe"
import { buildReportableHtml } from "@/lib/reports/render"
import type { DiffLine } from "@/lib/reports/diff"
import type { ReportItem } from "@/lib/schemas/report"
import { ALL_SHARPS } from "@/lib/transpose"
import { IconLink, IconPencil } from "@/components/shared/Icons"
import { AdminDialog } from "./AdminDialog"

interface SongRow {
  song_id: number
  title: string
  artist: string
  href: string | null
  reports: number
  items: number
  pending_items: number
  pending_groups: number
  last_at: string | null
}

interface Group {
  dedupe_key: string
  kind: ReportItem["kind"]
  category: string
  status: "pending" | "applied" | "rejected"
  item: ReportItem
  item_ids: number[]
  count: number
  comments: string[]
  users: string[]
  last_at: string | null
  current_block: number | null
  apply_status: string | null
  content_changed: boolean
}

interface SongDetail {
  song: {
    id: number
    title: string
    artist: string
    key: string
    content: string
    href: string | null
  }
  groups: Group[]
}

interface Preview {
  diff: DiffLine[]
  applied: number[]
  failed: { id: number; reason: string }[]
  changes: Record<string, string | number | null>
}

/**
 * Pestanya «Errors» de l'admin: cançons amb reports i, per a cadascuna, les
 * correccions agrupades (duplicats junts) per aplicar-les, rebutjar-les o
 * obrir l'editor a la línia afectada.
 */
export function ReportsTab({ onChange }: { onChange?: () => void }) {
  const t = getT().admin.reportsTab
  const [status, setStatus] = useState<"pending" | "resolved">("pending")
  const [rows, setRows] = useState<SongRow[] | null>(null)
  const [songId, setSongId] = useState<number | null>(null)

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/admin/reports?status=${status}`)
    if (res.ok) setRows((await res.json()) as SongRow[])
  }, [status])

  useEffect(() => {
    void loadList()
  }, [loadList])

  if (songId !== null) {
    return (
      <ReportSongDetail
        songId={songId}
        onBack={() => {
          setSongId(null)
          void loadList()
        }}
        onChange={onChange}
      />
    )
  }

  return (
    <>
      <div className="panel-toolbar">
        <div className="rp-admin-toggle" role="tablist">
          {(["pending", "resolved"] as const).map((s) => (
            <button key={s} type="button" className={`btn-xs${status === s ? " active" : ""}`} onClick={() => setStatus(s)}>
              {s === "pending" ? t.pendents : t.resolts}
            </button>
          ))}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t.colCanco}</th>
            <th>{t.colCorreccions}</th>
            <th>{t.colReports}</th>
            <th>{t.colDarrer}</th>
          </tr>
        </thead>
        <tbody>
          {rows && rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}>
                {status === "pending" ? t.capPendent : t.capResolt}
              </td>
            </tr>
          ) : (
            rows?.map((r) => (
              <tr key={r.song_id} className="rp-admin-row" onClick={() => setSongId(r.song_id)}>
                <td>
                  <button type="button" className="admin-song-title rp-admin-link">
                    {r.title}
                  </button>
                  <div style={{ fontSize: ".78rem", color: "var(--muted)" }}>{r.artist}</div>
                </td>
                <td style={{ textAlign: "center" }}>
                  {status === "pending" ? <span className="badge badge-draft">{r.pending_groups}</span> : r.items}
                </td>
                <td style={{ textAlign: "center" }}>{r.reports}</td>
                <td style={{ fontSize: ".78rem", color: "var(--muted)" }}>{formatDate(r.last_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  )
}

type Decision = "accept" | "reject"

/** Ordre a la cançó: primer les de tota la cançó (to, dades…), després per línia i posició. */
function songOrder(g: Group): [number, number] {
  const it = g.item
  if (!("block" in it)) return [-1, 0]
  const second = "start" in it ? it.start : "offset" in it ? it.offset : "chord_idx" in it ? it.chord_idx : 0
  return [g.current_block ?? Number.MAX_SAFE_INTEGER, second]
}

function ReportSongDetail({ songId, onBack, onChange }: { songId: number; onBack: () => void; onChange?: () => void }) {
  const t = getT().admin.reportsTab
  const [data, setData] = useState<SongDetail | null>(null)
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map())
  const [focused, setFocused] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ accepted: Group[]; rejected: Group[]; result: Preview | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const cardsRef = useRef<HTMLDivElement>(null)
  const songRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/reports/song/${songId}`)
    if (!res.ok) return
    setData((await res.json()) as SongDetail)
    setDecisions(new Map())
    setFocused(null)
  }, [songId])

  useEffect(() => {
    void load()
  }, [load])

  const pending = useMemo(() => {
    const list = data?.groups.filter((g) => g.status === "pending") ?? []
    return [...list].sort((a, b) => {
      const [ab, ao] = songOrder(a)
      const [bb, bo] = songOrder(b)
      return ab - bb || ao - bo
    })
  }, [data])
  const reviewed = useMemo(() => data?.groups.filter((g) => g.status !== "pending") ?? [], [data])

  // A la cançó, les pendents que es poden aplicar i no s'han rebutjat
  const shown = useMemo(
    () => pending.filter((g) => g.apply_status === "ok" && decisions.get(g.dedupe_key) !== "reject"),
    [pending, decisions],
  )
  const html = useMemo(() => {
    if (!data) return ""
    const focusIdx = shown.findIndex((g) => g.dedupe_key === focused)
    return buildReportableHtml(
      data.song.content,
      shown.map((g) => g.item),
      { semitones: 0, notation: ALL_SHARPS, focusItem: focusIdx >= 0 ? focusIdx : null },
    )
  }, [data, shown, focused])

  // En seleccionar una correcció, porta-la a la vista a la cançó (scroll propi de la columna)
  useEffect(() => {
    const box = songRef.current
    const el = box?.querySelector<HTMLElement>(".rp-focus")
    if (box && el) scrollIntoBox(box, el)
  }, [html])

  if (!data) return null

  const editorHref = (block: number | null) =>
    `/app/editor?id=${data.song.id}${block !== null ? `&line=${block}` : ""}`
  const ids = (groups: Group[]) => groups.map((g) => g.item_ids[0])
  const accepted = pending.filter((g) => decisions.get(g.dedupe_key) === "accept")
  const rejected = pending.filter((g) => decisions.get(g.dedupe_key) === "reject")

  function decide(key: string, d: Decision) {
    const next = new Map(decisions)
    if (next.get(key) === d) next.delete(key)
    else next.set(key, d)
    setDecisions(next)
  }

  /** Clic a una correcció de la cançó → selecciona la targeta i la porta a la vista. */
  function onSongClick(e: React.MouseEvent) {
    const el = (e.target as Element).closest<HTMLElement>("[data-ri]")
    const g = el ? shown[Number(el.dataset.ri)] : undefined
    if (!g) return
    setFocused(g.dedupe_key)
    const card = cardsRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(g.dedupe_key)}"]`)
    if (cardsRef.current && card) scrollIntoBox(cardsRef.current, card)
  }

  async function openApply() {
    if (!accepted.length && !rejected.length) return
    if (!accepted.length) {
      setPreview({ accepted, rejected, result: null })
      return
    }
    setBusy(true)
    const res = await fetch("/api/admin/reports/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId, item_ids: ids(accepted), preview: true }),
    })
    setBusy(false)
    if (!res.ok) {
      useToastStore.getState().show(t.toastError, { type: "error" })
      return
    }
    setPreview({ accepted, rejected, result: (await res.json()) as Preview })
  }

  async function confirmApply() {
    if (!preview) return
    setBusy(true)
    let ok = true
    let applied = 0
    if (preview.accepted.length) {
      const res = await fetch("/api/admin/reports/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song_id: songId, item_ids: ids(preview.accepted) }),
      })
      ok = res.ok
      if (res.ok) applied = ((await res.json()) as { applied: number[] }).applied.length
    }
    if (ok && preview.rejected.length) {
      const res = await fetch("/api/admin/reports/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: ids(preview.rejected), status: "rejected" }),
      })
      ok = res.ok
    }
    setBusy(false)
    setPreview(null)
    if (!ok) {
      useToastStore.getState().show(t.toastError, { type: "error" })
    } else {
      useToastStore.getState().show(applied ? t.toastAplicades(applied) : t.toastRevisades, { type: "success" })
    }
    onChange?.()
    await load()
  }

  return (
    <div className="rp-admin">
      {/* Capçalera en una sola fila, amb les mateixes columnes que el contingut:
          cada meitat queda alineada amb la seva columna (targetes | cançó) */}
      <div className="rp-admin-grid rp-admin-head">
        <div className="rp-admin-col-head">
          <button type="button" className="btn-xs" onClick={onBack}>
            {t.tornar}
          </button>
          <h2>
            {data.song.title} <small>{data.song.artist}</small>
          </h2>
          <span className="rp-hint">{t.decisions(accepted.length, rejected.length)}</span>
          <button
            type="button"
            className="btn-xs success"
            title={t.aplicarCanvisTitle}
            disabled={(!accepted.length && !rejected.length) || busy}
            onClick={openApply}
          >
            {t.aplicarCanvis}
          </button>
        </div>
        <div className="rp-admin-col-head">
          <span className="rp-label">{t.previsualitzacio}</span>
          {data.song.href && (
            <a className="btn-xs" href={data.song.href} target="_blank" rel="noreferrer">
              <IconLink /> {t.veureWeb}
            </a>
          )}
          <a className="btn-xs" href={editorHref(null)} target="_blank" rel="noreferrer">
            <IconPencil /> {t.obreEditor}
          </a>
        </div>
      </div>

      <div className="rp-admin-grid">
        <div className="rp-admin-col">
          <div className="rp-admin-scroll" ref={cardsRef}>
            <ul className="rp-admin-groups">
              {pending.map((g) => (
                <GroupCard
                  key={g.dedupe_key}
                  group={g}
                  focused={focused === g.dedupe_key}
                  decision={decisions.get(g.dedupe_key)}
                  onSelect={() => setFocused(g.dedupe_key)}
                  onDecide={(d) => decide(g.dedupe_key, d)}
                  editorHref={editorHref(g.current_block)}
                />
              ))}
            </ul>

            {reviewed.length > 0 && (
              <details className="rp-admin-history">
                <summary>
                  {t.historial} ({reviewed.length})
                </summary>
                <ul className="rp-admin-groups">
                  {reviewed.map((g) => (
                    <GroupCard key={`${g.status}-${g.dedupe_key}`} group={g} editorHref={editorHref(g.current_block)} />
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>

        <div className="rp-admin-col">
          <div className="rp-admin-scroll rp-admin-preview" ref={songRef}>
            <article className="song" data-style="classic">
              <div
                className="song-body rp-body rp-admin-body"
                onClick={onSongClick}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </article>
          </div>
        </div>
      </div>

      {preview && (
        <AdminDialog
          title={t.confirmaTitol}
          description={preview.result ? t.diffDesc : undefined}
          onClose={() => setPreview(null)}
          footer={
            <>
              <button type="button" className="btn-xs" onClick={() => setPreview(null)}>
                {t.cancel}
              </button>
              <button type="button" className="btn-xs success" disabled={busy} onClick={confirmApply}>
                {t.aplica}
              </button>
            </>
          }
        >
          {preview.result ? (
            <>
              {preview.result.diff.length ? (
                <pre className="rp-diff">
                  {preview.result.diff.map((l, i) =>
                    l.type === "gap" ? (
                      <div key={i} className="rp-diff-gap">
                        {t.diffLiniesIguals(l.count)}
                      </div>
                    ) : (
                      <div key={i} className={`rp-diff-${l.type}`}>
                        {l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}
                        {l.text}
                      </div>
                    ),
                  )}
                </pre>
              ) : (
                <p className="rp-hint">{t.diffSenseCanvis}</p>
              )}
              {Object.keys(preview.result.changes).length > 0 && (
                <>
                  <p className="rp-hint">{t.altresCanvis}</p>
                  <ul className="rp-diff-changes">
                    {Object.entries(preview.result.changes).map(([k, v]) => (
                      <li key={k}>
                        <strong>{k}</strong>: {v === null ? "—" : String(v)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {preview.result.failed.length > 0 && (
                <p className="rp-error">{t.noEsPodenAplicar(preview.result.failed.length)}</p>
              )}
            </>
          ) : (
            <p className="rp-hint">{t.senseAcceptades}</p>
          )}
          {preview.rejected.length > 0 && <p className="rp-hint">{t.rebutjadesEsDescarten(preview.rejected.length)}</p>}
        </AdminDialog>
      )}
    </div>
  )
}

/** Fa scroll dins `box` (no de la pàgina) perquè `el` quedi al mig. */
function scrollIntoBox(box: HTMLElement, el: HTMLElement) {
  const b = box.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.top >= b.top && r.bottom <= b.bottom) return
  box.scrollBy({ top: r.top - b.top - b.height / 2 + r.height / 2, behavior: "smooth" })
}

function GroupCard({
  group: g,
  focused,
  decision,
  onSelect,
  onDecide,
  editorHref,
}: {
  group: Group
  focused?: boolean
  decision?: Decision
  onSelect?: () => void
  onDecide?: (d: Decision) => void
  editorHref: string
}) {
  const t = getT().admin.reportsTab
  const tr = getT().public.report
  const applicable = g.status === "pending" && g.apply_status === "ok"
  const context = "line" in g.item ? g.item.line.replace(/<ch>([^<]*)<\/ch>/g, "[$1]").replace(/<\/?sec>/g, "") : null
  const cls = [
    "rp-admin-group",
    `rp-admin-group-${g.status}`,
    focused ? "is-focused" : "",
    decision ? `is-${decision}` : "",
    onSelect ? "is-selectable" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <li className={cls} data-key={g.dedupe_key} onClick={onSelect}>
      <div className="rp-admin-group-body">
        <div className="rp-admin-group-title">
          <span className="badge badge-user">{tr.categories[g.category as keyof typeof tr.categories]}</span>
          <strong>{describeItem(g.item)}</strong>
          {g.count > 1 && <span className="badge badge-draft">{t.persones(g.count)}</span>}
          {g.status === "applied" && <span className="badge badge-public">{t.aplicada}</span>}
          {g.status === "rejected" && <span className="badge badge-inactive">{t.rebutjada}</span>}
        </div>
        {context !== null && (
          <div className="rp-admin-context">
            {t.linia} {(g.current_block ?? 0) + 1}: <code>{context || "∅"}</code>
          </div>
        )}
        {g.status === "pending" && g.apply_status !== "ok" && g.apply_status && (
          <div className="rp-error">{t.noAplicable[g.apply_status] ?? g.apply_status}</div>
        )}
        {g.status === "pending" && g.content_changed && g.apply_status === "ok" && (
          <div className="rp-hint">{t.contentCanviat}</div>
        )}
        {g.comments.length > 0 && (
          <ul className="rp-admin-comments">
            {g.comments.map((c, i) => (
              <li key={i}>«{c}»</li>
            ))}
          </ul>
        )}
        <div className="rp-hint">
          {formatDate(g.last_at)} · {t.perUsuari(g.users.length ? g.users.join(", ") : t.anonim)}
        </div>
      </div>
      {onDecide && (
        <div className="rp-admin-group-actions" onClick={(e) => e.stopPropagation()}>
          <a className="btn-xs" href={editorHref} target="_blank" rel="noreferrer">
            <IconPencil /> {t.obreEditor}
          </a>
          <div className="rp-admin-switch" role="radiogroup" aria-label={t.decisio}>
            <button
              type="button"
              role="radio"
              aria-checked={decision === "accept"}
              className={`rp-admin-switch-opt is-accept${decision === "accept" ? " is-on" : ""}`}
              disabled={!applicable}
              onClick={() => onDecide("accept")}
            >
              {t.accepta}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={decision === "reject"}
              className={`rp-admin-switch-opt is-reject${decision === "reject" ? " is-on" : ""}`}
              onClick={() => onDecide("reject")}
            >
              {t.rebutja}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  // SQLite desa UTC sense zona
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`)
  return d.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" })
}
