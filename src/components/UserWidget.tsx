"use client"
import { signOut, useSession } from "next-auth/react"
import { useEffect, useRef, useState } from "react"
import { LoginPopup } from "./LoginPopup"
import { IconLibrary, IconSettings } from "./shared/Icons"

export function UserWidget() {
  const { data: session, status } = useSession()
  const [showLogin, setShowLogin] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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
          Inicia sessió
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
        {isAdmin && <span className="badge-admin">admin</span>}
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
          <a href="/library" className="user-dropdown-item">
            <IconLibrary />
            <span>La teva Biblioteca</span>
          </a>
          {isAdmin && (
            <a href="/admin" className="user-dropdown-item">
              <IconSettings />
              <span>Panell d&apos;administració</span>
            </a>
          )}
          <div className="user-dropdown-sep" />
          <button
            className="user-dropdown-item user-dropdown-logout"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Tancar sessió
          </button>
        </div>
      )}
    </div>
  )
}
