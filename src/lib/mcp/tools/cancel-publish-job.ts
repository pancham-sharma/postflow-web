import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "cancel_publish_job",
  title: "Cancel a publish job",
  description:
    "Cancel one of the signed-in user's queued PostFlow publish jobs so it will not be published.",
  inputSchema: { jobId: z.string().uuid().describe("The queued publish job id to cancel.") },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ jobId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("publish_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["queued", "failed"])
      .select("id, platform, post_title, status")
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [
          { type: "text", text: "No cancellable job with that id for this account." },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: `Cancelled job ${data.id} (${data.platform}).` }],
      structuredContent: { job: data },
    };
  },
});
