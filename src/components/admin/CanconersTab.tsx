"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { getT } from "@/lib/i18n"
import { useToastStore } from "@/hooks/useToasts"
import { IconGlobe, IconLink } from "@/components/shared/Icons"
import { BadgeMenu } from "./BadgeMenu"

interface CanconerRow {
  id: number
  title: string
  owner_name: string
  song_count: number
  share_token: string | null
  visibility: number
  slug: string | null
  updated_at: string | null
}

export function CanconersTab() {
  const t = getT()
  const [canconers, setCanconers] = useState<CanconerRow[]>([])
  const [query, setQuery] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/canconers")
    if (!res.ok) return
    const data = (await res.json()) as CanconerRow[]
    setCanconers(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleQueryChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // filtering is done client-side since the API returns all
    }, 250)
  }

  const filtered = query
    ? canconers.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.owner_name.toLowerCase().includes(query.toLowerCase()),
      )
    : canconers

  async function handleUnpublish(c: CanconerRow) {
    if (!confirm(t.admin.canconersTab.confirmRetirar(c.title))) return
    const res = await fetch(`/api/canconers/${c.id}/visibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: 0 }),
    })
    if (!res.ok) return
    await load()
  }

  async function handleCopyPublic(c: CanconerRow) {
    if (!confirm(t.admin.canconersTab.confirmCopiaPublica(c.title, c.owner_name))) return
    const res = await fetch(`/api/admin/canconers/${c.id}/copy`, { method: "POST" })
    if (!res.ok) {
      useToastStore.getState().show(t.admin.canconersTab.toastError, { type: "error" })
      return
    }
    useToastStore.getState().show(t.admin.canconersTab.toastCopiaCreada, { type: "success" })
    await load()
  }

  function handleVisibilityMenu(c: CanconerRow, action: string) {
    if (action === "open") window.open(`/songbooks/${c.id}/${c.slug ?? ""}`, "_blank", "noreferrer")
    else if (action === "unpublish") void handleUnpublish(c)
    else if (action === "copy") void handleCopyPublic(c)
  }

  async function handleDelete(id: number, title: string, ownerName: string) {
    if (!confirm(t.admin.canconersTab.confirmEliminar(title, ownerName))) return
    const res = await fetch(`/api/admin/canconers/${id}`, { method: "DELETE" })
    if (!res.ok) return
    await load()
  }

  return (
    <>
      <div className="panel-toolbar">
        <input
          type="text"
          placeholder={t.admin.canconersTab.cercaPlaceholder}
          style={{ maxWidth: 260 }}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>{t.admin.canconersTab.colTitol}</th>
            <th>{t.admin.canconersTab.colUsuari}</th>
            <th>{t.admin.canconersTab.colCancons}</th>
            <th>{t.admin.canconersTab.colVisibilitat}</th>
            <th>{t.admin.canconersTab.colCompartit}</th>
            <th>{t.admin.canconersTab.colActualitzat}</th>
            <th>{t.admin.canconersTab.colAccions}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}
              >
                {t.admin.canconersTab.capCanconerTrobat}
              </td>
            </tr>
          ) : (
            filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  <a
                    href={`/app/library/canconers/${c.id}/preview?from=admin`}
                    className="admin-song-title"
                    title={t.admin.canconersTab.previsualitzar}
                  >
                    {c.title}
                  </a>
                </td>
                <td style={{ fontSize: ".82rem" }}>{c.owner_name}</td>
                <td style={{ textAlign: "center" }}>{c.song_count}</td>
                <td style={{ textAlign: "center" }}>
                  <BadgeMenu
                    label={
                      c.visibility === 1 ? (
                        <>
                          <IconGlobe /> {t.admin.canconersTab.public}
                        </>
                      ) : (
                        t.admin.canconersTab.privat
                      )
                    }
                    badgeClass={`badge ${c.visibility === 1 ? "badge-public" : "badge-user"}`}
                    title={t.admin.canconersTab.canviarVisibilitatTitle}
                    options={
                      c.visibility === 1
                        ? [
                            { value: "open", label: t.admin.canconersTab.veureALaWeb },
                            { value: "unpublish", label: t.admin.canconersTab.retirarDeLaWeb },
                          ]
                        : [
                            {
                              value: "copy",
                              label: t.admin.canconersTab.ferCopiaPublica,
                              hint: t.admin.canconersTab.hintCopiaPublica,
                            },
                          ]
                    }
                    onSelect={(v) => handleVisibilityMenu(c, v)}
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  {c.share_token ? (
                    <a
                      href={`/c/${c.share_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-xs success"
                    >
                      <IconLink /> {t.admin.canconersTab.veure}
                    </a>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: ".78rem" }}>{t.admin.canconersTab.no}</span>
                  )}
                </td>
                <td style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                  {new Date(c.updated_at ?? "").toLocaleDateString("ca-ES")}
                </td>
                <td className="td-actions">
                  <button
                    className="btn-xs danger"
                    onClick={() => handleDelete(c.id, c.title, c.owner_name)}
                  >
                    {t.admin.canconersTab.eliminar}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  )
}
