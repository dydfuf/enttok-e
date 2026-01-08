import { z } from "zod";

export const ClaudeSpawnRequestSchema = z.object({
  args: z.array(z.string()).optional(),
  prompt: z.string().optional(),
  stdin: z.string().optional(),
  session_id: z.string().optional(),
  timeout_ms: z.number().optional(),
});

export type ClaudeSpawnRequestInput = z.infer<typeof ClaudeSpawnRequestSchema>;

export interface ClaudeSessionResponse {
  session_id: string;
}
