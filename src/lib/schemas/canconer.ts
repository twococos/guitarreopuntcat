import { z } from "zod"

export const canconerSaveSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().min(1).default("El meu cançoner"),
  songs: z.array(
    z.object({
      id: z.number().int(),
      semitones: z.number().int().default(0),
    }),
  ),
})

export type CanconerSave = z.infer<typeof canconerSaveSchema>

export const shareActionSchema = z.object({
  action: z.enum(["enable", "disable"]).default("enable"),
})

export type ShareAction = z.infer<typeof shareActionSchema>
