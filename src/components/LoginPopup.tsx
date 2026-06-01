"use client"
import { signIn } from "next-auth/react"
import { useEffect } from "react"
import { getT } from "@/lib/i18n"
import { IconX, IconMusic } from "@/components/shared/Icons"

interface Props {
  onClose: () => void
}

export function LoginPopup({ onClose }: Props) {
  const t = getT()
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
        <button id="auth-popup-close" aria-label={t.public.loginPopup.tancarAriaLabel} onClick={onClose}>
          <IconX />
        </button>
        <div id="auth-popup-logo"><IconMusic /></div>
        <h2>{t.public.loginPopup.benvingut}</h2>
        <p>{t.public.loginPopup.descripcio}</p>
        <div id="auth-popup-methods">
          <button id="btn-google-login" onClick={handleGoogleLogin}>
            <img src="/img/google.svg" alt="" />
            {t.public.loginPopup.continuaAmbGoogle}
          </button>
        </div>
        <p className="auth-popup-note">{t.public.loginPopup.notaTermes}</p>
      </div>
    </div>
  )
}
