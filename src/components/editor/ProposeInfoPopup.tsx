"use client"

interface ProposeInfoPopupProps {
  onAccept: () => void
}

export function ProposeInfoPopup({ onAccept }: ProposeInfoPopupProps) {
  return (
    <div id="propose-info-overlay">
      <div id="propose-info-box">
        <div id="propose-info-logo">🎵</div>
        <h2>Proposa una cançó</h2>
        <p>
          Aquest cançoner és un projecte de passió obert a tothom. Pots col·laborar afegint cançons,
          però per garantir la qualitat cal tenir en compte:
        </p>
        <ul>
          <li>
            🎵 La lletra i els acords han de ser <strong>fidedignes a la cançó original</strong>.
          </li>
          <li>🎸 Ha d&apos;estar en la <strong>tonalitat correcta</strong> (o amb cejilla si escau).</li>
          <li>
            📋 Com més completa sigui la cançó (estrofes, tornades, ponts…),{" "}
            <strong>més probable és que s&apos;accepti</strong>.
          </li>
          <li>✅ Un administrador la revisarà abans de publicar-la.</li>
        </ul>
        <button id="btn-propose-accept" className="btn-primary" onClick={onAccept}>
          Ho entenc, continua
        </button>
      </div>
    </div>
  )
}
