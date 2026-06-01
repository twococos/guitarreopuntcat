"use client"
import { useUiStore } from "@/hooks/useUi"
import { LoginPopup } from "@/components/LoginPopup"
import { getT } from "@/lib/i18n"

export function ProposeLoginToast() {
  const t = getT()
  const proposeLoginVisible = useUiStore((s) => s.proposeLoginVisible)
  const loginPopupVisible = useUiStore((s) => s.loginPopupVisible)
  const setProposeLogin = useUiStore((s) => s.setProposeLogin)
  const setLoginPopup = useUiStore((s) => s.setLoginPopup)

  return (
    <>
      {proposeLoginVisible && (
        <div id="propose-login-toast" className="propose-toast">
          <span>🔒</span>
          <p>{t.app.songbook.proposeLoginToast.missatge}</p>
          <button
            id="propose-login-btn"
            onClick={() => {
              setLoginPopup(true)
              setProposeLogin(false)
            }}
          >
            {t.app.songbook.proposeLoginToast.iniciaSessio}
          </button>
          <button id="propose-toast-close" onClick={() => setProposeLogin(false)}>
            ✕
          </button>
        </div>
      )}
      {loginPopupVisible && <LoginPopup onClose={() => setLoginPopup(false)} />}
    </>
  )
}
