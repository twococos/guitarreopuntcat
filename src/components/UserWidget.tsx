"use client"
import { signOut, useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { LoginPopup } from "./LoginPopup"
import { IconLibrary, IconSettings } from "./shared/Icons"
import { guardMobileApp } from "@/components/public/MobileGateLink"
import { getT } from "@/lib/i18n"

export function UserWidget() {
  const t = getT()
  const { data: session, status } = useSession()
  const pathname = usePathname() || "/"
  const [showLogin, setShowLogin] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // A les pàgines públiques, oferim un accés ràpid a l'editor de cançoners
  // com a primera opció del menú, ja que des d'allà no s'hi accedeix per nav.
  const isPublic = !pathname.startsWith("/app")

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("click", onDocClick)
    return () => document.removeEventListener("click", onDocClick)
  }, [open])

  if (status === "loading") {
    return <div className="user-widget-loading" aria-hidden />
  }

  const user = session?.user
  if (!user) {
    return (
      <>
        <button className="btn-login" onClick={() => setShowLogin(true)}>
          <img src="/img/google.svg" alt="" />
          {t.app.userWidget.iniciaSessio}
        </button>
        {showLogin && <LoginPopup onClose={() => setShowLogin(false)} />}
      </>
    )
  }

  const isAdmin = user.role === "admin"
  const firstName = user.name?.split(" ")[0] ?? user.email

  return (
    <div className="user-widget" ref={wrapRef}>
      <button
        className="user-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {user.image && (
          <img src={user.image} className="user-avatar" alt={user.name ?? ""} />
        )}
        <span className="user-name">{firstName}</span>
        {isAdmin && <span className="badge-admin">{t.app.userWidget.badgeAdmin}</span>}
        <span className="user-chevron">▾</span>
      </button>
      {open && (
        <div className="user-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="user-dropdown-header">
            {user.image && (
              <img src={user.image} className="user-avatar-lg" alt="" />
            )}
            <div>
              <div className="user-dropdown-name">{user.name}</div>
              <div className="user-dropdown-email">{user.email}</div>
            </div>
          </div>
          <div className="user-dropdown-sep" />
          {isPublic && (
            <a
              href="/app"
              className="user-dropdown-item"
              onClick={(e) => {
                if (guardMobileApp()) {
                  e.preventDefault()
                  setOpen(false)
                }
              }}
            >
              <IconLibrary />
              <span>{t.app.userWidget.editorDeCancoers}</span>
            </a>
          )}
          <a href="/app/library" className="user-dropdown-item">
            <IconLibrary />
            <span>{t.app.userWidget.bibliotetica}</span>
          </a>
          {isAdmin && (
            <a href="/app/admin" className="user-dropdown-item">
              <IconSettings />
              <span>{t.app.userWidget.panellAdministracio}</span>
            </a>
          )}
          <div className="user-dropdown-sep" />
          <button
            className="user-dropdown-item user-dropdown-logout"
            onClick={() => {
              // Si estem dins de l'app, tornem a /app (la portada de l'app);
              // altrament quedem-nos a la mateixa pàgina pública.
              const path =
                typeof window !== "undefined" ? window.location.pathname : "/"
              const callbackUrl = path.startsWith("/app") ? "/app" : path
              signOut({ callbackUrl })
            }}
          >
            {t.app.userWidget.tancarSessio}
          </button>
        </div>
      )}
    </div>
  )
}
