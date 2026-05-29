"use client"
import { signIn } from "next-auth/react"
import { useEffect } from "react"

interface Props {
  onClose: () => void
}

export function LoginPopup({ onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  function onOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleGoogleLogin() {
    const callbackUrl =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/"
    signIn("google", { callbackUrl })
  }

  return (
    <div id="auth-popup-overlay" onClick={onOverlayClick}>
      <div id="auth-popup">
        <button id="auth-popup-close" aria-label="Tancar" onClick={onClose}>
          ✕
        </button>
        <div id="auth-popup-logo">🎵</div>
        <h2>Benvingut al Cançoner</h2>
        <p>Inicia sessió per guardar els teus cançoners i molt més.</p>
        <div id="auth-popup-methods">
          <button id="btn-google-login" onClick={handleGoogleLogin}>
            <img src="/img/google.svg" alt="" />
            Continua amb Google
          </button>
        </div>
        <p className="auth-popup-note">En iniciar sessió acceptes els termes d&apos;ús.</p>
      </div>
    </div>
  )
}
