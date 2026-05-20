"use client"
import { useUiStore } from "@/hooks/useUi"
import { LoginPopup } from "@/components/LoginPopup"

export function ProposeLoginToast() {
  const proposeLoginVisible = useUiStore((s) => s.proposeLoginVisible)
  const loginPopupVisible = useUiStore((s) => s.loginPopupVisible)
  const setProposeLogin = useUiStore((s) => s.setProposeLogin)
  const setLoginPopup = useUiStore((s) => s.setLoginPopup)

  return (
    <>
      {proposeLoginVisible && (
        <div id="propose-login-toast" className="propose-toast">
          <span>🔒</span>
          <p>Inicia sessió per poder proposar noves cançons.</p>
          <button
            id="propose-login-btn"
            onClick={() => {
              setLoginPopup(true)
              setProposeLogin(false)
            }}
          >
            Inicia sessió
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
