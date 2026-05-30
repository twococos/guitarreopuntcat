"use client"
import { usePathname } from "next/navigation"
import { useToastStore } from "@/hooks/useToasts"

export function ToastHost() {
  const items = useToastStore((s) => s.items)
  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className={`toast${t.type === "error" ? " toast-error" : ""}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

/** Variant per al layout arrel: només pinta toasts fora de /app, on les
 *  pàgines ja inclouen el seu propi <ToastHost />. Evita renderitzats
 *  duplicats sense canviar la firma del component existent. */
export function PublicToastHost() {
  const pathname = usePathname() || "/"
  if (pathname.startsWith("/app")) return null
  return <ToastHost />
}
