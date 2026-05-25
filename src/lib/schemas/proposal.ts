import { z } from "zod"

export const proposalInputSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  key: z.string().min(1),
  capo: z.number().int().default(0),
  content: z.string().min(1),
  language: z.string().default("ca"),
  tags: z.string().default(""),
})

export type ProposalInput = z.infer<typeof proposalInputSchema>

export const proposalReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().default(""),
  songUpdate: proposalInputSchema.optional(),
})

export type ProposalReview = z.infer<typeof proposalReviewSchema>
