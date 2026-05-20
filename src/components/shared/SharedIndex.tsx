"use client"
import { useEffect, useRef, useState } from "react"

interface Props {
  ids: string[]
  titles: string[]
}

export function SharedIndex({ ids, titles }: Props) {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (ids.length === 0) return

    observerRef.current?.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    )

    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observerRef.current.observe(el)
    }

    return () => {
      observerRef.current?.disconnect()
    }
  }, [ids])

  return (
    <ol>
      {ids.map((id, i) => (
        <li key={id}>
          <a href={`#${id}`} className={activeId === id ? "active" : ""}>
            {titles[i]}
          </a>
        </li>
      ))}
    </ol>
  )
}
