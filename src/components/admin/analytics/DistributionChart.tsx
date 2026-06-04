"use client"

// Gràfica multi-línia: cada línia és un path (cançó/artista) i el valor
// és el % del total diari de la seva categoria.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts"

export type DistributionSeries = {
  key: string       // path (clau interna)
  label: string     // text a la llegenda
  color: string
  points: Array<{ date: string; pct: number }>
}

type Props = {
  series: DistributionSeries[]
  height?: number
}

function formatDateLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

export function DistributionChart({ series, height = 280 }: Props) {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return <p className="muted">Sense dades</p>
  }

  // Agrupem per data: una fila per data amb un camp per cada series.key
  const allDates = new Set<string>()
  for (const s of series) for (const p of s.points) allDates.add(p.date)
  const sortedDates = [...allDates].sort()

  const data = sortedDates.map((date) => {
    const row: Record<string, number | string> = { date: formatDateLabel(date) }
    for (const s of series) {
      const p = s.points.find((pp) => pp.date === date)
      row[s.key] = p ? p.pct : 0
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}%`}
          width={42}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            const s = series.find((x) => x.key === name)
            return [`${value}%`, s?.label ?? name]
          }}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => {
            const s = series.find((x) => x.key === value)
            return s?.label ?? value
          }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
