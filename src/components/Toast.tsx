"use client"
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
