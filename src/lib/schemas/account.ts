import { z } from "zod"

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(80),
})

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
