import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { ToastHost } from "@/components/Toast"
import type { ReactNode } from "react"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (!user || user.role !== "admin") {
    redirect("/")
  }

  return (
    <>
      {children}
      <ToastHost />
    </>
  )
}
