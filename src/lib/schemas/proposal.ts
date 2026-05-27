import { z } from "zod"

export const proposalInputSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  key: z.string().min(1),
  capo: z.number().int().default(0),
  content: z.string().min(1),
  language: z.string().default("ca"),
  tags: z.string().default(""),
  album: z.string().max(200).nullable().optional(),
  year: z.number().int().min(1000).max(2100).nullable().optional(),
  youtubeUrl: z
    .string()
    .min(1, "Link de YouTube obligatori")
    .regex(/^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be)\//, "URL de YouTube no vàlida"),
  spotifyUrl: z
    .string()
    .min(1, "Link de Spotify obligatori")
    .regex(/^https?:\/\/open\.spotify\.com\//, "URL de Spotify no vàlida"),
})

export type ProposalInput = z.infer<typeof proposalInputSchema>

export const proposalReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().default(""),
  songUpdate: proposalInputSchema.optional(),
})

export type ProposalReview = z.infer<typeof proposalReviewSchema>

// Schema per a modificacions del propietari de la proposta (re-enviament).
// Reutilitza els mateixos camps que crear una proposta.
export const proposalUpdateSchema = proposalInputSchema

export type ProposalUpdate = z.infer<typeof proposalUpdateSchema>
