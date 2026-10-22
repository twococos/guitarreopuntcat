/**
 * src/lib/reports/diff.ts — Diff per línies entre el content actual i el corregit.
 * Pur. Les cançons tenen poques línies: n'hi ha prou amb una LCS quadràtica.
 */

export type DiffLine =
  | { type: "same" | "del" | "add"; text: string }
  | { type: "gap"; count: number }

/**
 * Línies esborrades, afegides i `context` línies iguals al voltant de cada
 * canvi; la resta es resumeix amb `gap`.
 */
export function lineDiff(before: string, after: string, context = 2): DiffLine[] {
  const a = before.split("\n")
  const b = after.split("\n")
  const n = a.length
  const m = b.length

  // lcs[i][j] = longitud de la LCS de a[i..] i b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const full: { type: "same" | "del" | "add"; text: string }[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      full.push({ type: "same", text: a[i] })
      i++
      j++
    } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      full.push({ type: "del", text: a[i] })
      i++
    } else {
      full.push({ type: "add", text: b[j] })
      j++
    }
  }

  // Només es conserven les iguals a prop d'un canvi
  const keep = full.map(() => false)
  full.forEach((l, k) => {
    if (l.type === "same") return
    for (let d = Math.max(0, k - context); d <= Math.min(full.length - 1, k + context); d++) keep[d] = true
  })

  const out: DiffLine[] = []
  let gap = 0
  full.forEach((l, k) => {
    if (keep[k]) {
      if (gap) out.push({ type: "gap", count: gap })
      gap = 0
      out.push(l)
    } else {
      gap++
    }
  })
  if (gap && out.length) out.push({ type: "gap", count: gap })
  return out
}
