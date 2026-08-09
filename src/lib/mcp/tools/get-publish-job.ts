import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_publish_job",
  title: "Get publish job detail",
  description:
    "Get one PostFlow publish job belonging to the signed-in user, including its attempt history and event timeline.",
  inputSchema: { jobId: z.string().uuid().describe("The publish job id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ jobId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const { data: job, error } = await supabase
      .from("publish_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!job) {
      return { content: [{ type: "text", text: "No such job for this account." }], isError: true };
    }

    const [{ data: attempts }, { data: events }] = await Promise.all([
      supabase
        .from("publish_job_attempts")
        .select("*")
        .eq("job_id", jobId)
        .order("attempt_number"),
      supabase
        .from("publish_job_events")
        .select("*")
        .eq("job_id", jobId)
        .order("occurred_at"),
    ]);

    const detail = { job, attempts: attempts ?? [], events: events ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
      structuredContent: detail,
    };
  },
});
