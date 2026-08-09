import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listConnectedAccounts from "./tools/list-connected-accounts";
import listPublishJobs from "./tools/list-publish-jobs";
import getPublishJob from "./tools/get-publish-job";
import schedulePost from "./tools/schedule-post";
import cancelPublishJob from "./tools/cancel-publish-job";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged, and Vite inlines it at build time.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "postflow-your-social-storyteller",
  title: "PostFlow: Your Social Storyteller",
  version: "0.1.0",
  instructions:
    "Tools for PostFlow, a multi-platform social publisher. Use `list_connected_accounts` to see which social accounts the user has linked, `schedule_post` to queue a post for a connected platform, `list_publish_jobs` and `get_publish_job` to inspect publishing status and failures, and `cancel_publish_job` to stop a queued or failed job. All tools act as the signed-in PostFlow user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  // Cast: these tools declare no outputSchema, which the SDK's tool type treats
  // as a required-but-undefined property under exactOptionalPropertyTypes.
  tools: [
    listConnectedAccounts,
    listPublishJobs,
    getPublishJob,
    schedulePost,
    cancelPublishJob,
  ] as unknown as Parameters<typeof defineMcp>[0]["tools"],
});
