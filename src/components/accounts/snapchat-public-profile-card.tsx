// Accounts page: Snapchat automatic publishing (Public Profile API).
// The state shown here always comes from a real capability check against
// Snapchat — never from an environment flag.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  disconnectSnapchatPublicProfile,
  getSnapchatPublicProfileStatus,
  selectSnapchatPublicProfile,
  startSnapchatPublicProfileAuth,
  verifySnapchatPublicProfile,
} from "@/lib/snapchat-public-profile.functions";
import { SNAPCHAT_DESTINATION_LABEL } from "@/lib/snapchat-media-validation";
import { snapchatErrorMessage } from "@/lib/snapchat-errors";

export function SnapchatPublicProfileCard() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getSnapchatPublicProfileStatus);
  const start = useServerFn(startSnapchatPublicProfileAuth);
  const verify = useServerFn(verifySnapchatPublicProfile);
  const select = useServerFn(selectSnapchatPublicProfile);
  const disconnect = useServerFn(disconnectSnapchatPublicProfile);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["snapchat-public-profile-status"],
    queryFn: () => fetchStatus({ data: undefined }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["snapchat-public-profile-status"] });

  const verifyMutation = useMutation({
    mutationFn: () => verify({ data: undefined }),
    onSuccess: (report) => {
      refresh();
      toast[report.available ? "success" : "message"](
        report.available
          ? "Snapchat automatic publishing verified."
          : (snapchatErrorMessage(report.reason) ??
              "Automatic Snapchat publishing is not available for this connection yet."),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function connect() {
    setBusy(true);
    try {
      const { authorizeUrl } = await start({ data: { origin: window.location.origin } });
      window.location.href = authorizeUrl;
    } catch (error) {
      setBusy(false);
      toast.error((error as Error).message);
    }
  }

  if (!data?.configured) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-4 text-sm">
        <h3 className="font-semibold">Snapchat automatic publishing</h3>
        <p className="pt-1 text-xs text-muted-foreground">
          Not configured on the server. Snapchat posts use manual sharing.
        </p>
      </section>
    );
  }

  const status = data.connected
    ? data.apiAvailable
      ? "automatic"
      : data.connectionStatus === "reconnect_required"
        ? "reconnect"
        : "manual"
    : "disconnected";

  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Snapchat automatic publishing</h3>
          {status === "automatic" && (
            <p className="pt-1 text-xs text-muted-foreground">
              Connected · Public Profile: {data.publicProfileName ?? data.publicProfileId} ·{" "}
              Automatic publishing enabled
              {data.destinations.length > 0 && (
                <> · {data.destinations.map((d) => SNAPCHAT_DESTINATION_LABEL[d]).join(", ")}</>
              )}
            </p>
          )}
          {status === "manual" && (
            <p className="pt-1 text-xs text-muted-foreground">
              Connected · Manual sharing only. Automatic Snapchat publishing is not currently
              available for this connection.
            </p>
          )}
          {status === "reconnect" && (
            <p className="pt-1 text-xs text-destructive">
              Reconnect required.{" "}
              {snapchatErrorMessage(data.lastErrorCode) ?? "Your Snapchat connection expired."}
            </p>
          )}
          {status === "disconnected" && (
            <p className="pt-1 text-xs text-muted-foreground">
              Connect your Snapchat Public Profile to publish Stories and Spotlight automatically.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {status === "disconnected" ? "Connect" : "Reconnect"}
          </button>
          {data.connected && (
            <>
              <button
                type="button"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-60"
              >
                {verifyMutation.isPending ? "Checking…" : "Verify capability"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await disconnect({ data: undefined });
                  refresh();
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {data.profiles.length > 1 && (
        <label className="mt-3 block text-xs">
          <span className="font-semibold">Default publishing profile</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            value={data.publicProfileId ?? ""}
            onChange={async (event) => {
              await select({ data: { profileId: event.target.value } });
              refresh();
            }}
          >
            <option value="">Select a Public Profile…</option>
            {data.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
