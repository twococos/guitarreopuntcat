"use client"

// Component de gràfica de sèrie temporal per al panell d'analítica

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"

type TimeseriesPoint = { date: string; value: number }

type Props = {
  points: TimeseriesPoint[]
  label: string
  color?: string
  height?: number
}

function formatDateLabel(date: string): string {
  const day = date.slice(8, 10)
  const mon = date.slice(5, 7)
  return `${day}/${mon}`
}

export function TimeseriesChart({
  points,
  label,
  color = "#4f8df1",
  height = 240,
}: Props) {
  if (points.length === 0) {
    return <p className="muted">Sense dades</p>
  }

  const data = points.map((p) => ({
    date: formatDateLabel(p.date),
    value: p.value,
  }))

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
          tickFormatter={(v: number) => String(Math.round(v))}
          width={36}
        />
        <Tooltip
          formatter={(value: number) => [value, label]}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={label}
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
