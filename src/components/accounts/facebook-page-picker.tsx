// Facebook organic publishing requires a Page. This picker stores the Page and
// its page-scoped token on the connection so publishing stops failing with
// "missing_page_id".
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listFacebookPages, selectFacebookPage } from "@/lib/facebook-pages.functions";

export function FacebookPagePicker({ connectionId }: { connectionId: string }) {
  const queryClient = useQueryClient();
  const fetchPages = useServerFn(listFacebookPages);
  const choosePage = useServerFn(selectFacebookPage);
  const [manualId, setManualId] = useState("");

  const pages = useQuery({
    queryKey: ["facebook-pages", connectionId],
    queryFn: () => fetchPages({ data: { connectionId } }),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (pageId: string) => choosePage({ data: { connectionId, pageId } }),
    onSuccess: (result) => {
      toast.success(`Publishing to ${result.pageName || "the selected Page"}.`);
      setManualId("");
      void queryClient.invalidateQueries({ queryKey: ["facebook-pages", connectionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = pages.data?.selectedPageId ?? "";
  const hasPages = (pages.data?.pages.length ?? 0) > 0;

  return (
    <div className="mt-4 rounded-xl border border-border p-3 text-xs">
      <p className="font-semibold">Facebook Page</p>
      <p className="mt-0.5 text-muted-foreground">
        Posts are published to a Page, never to a personal profile.
      </p>
      {pages.isLoading ? (
        <p className="mt-2 text-muted-foreground">Loading your Pages…</p>
      ) : (
        <>
          <select
            aria-label="Facebook Page to publish to"
            value={selected}
            disabled={save.isPending || (pages.data?.pages.length ?? 0) === 0}
            onChange={(e) => e.target.value && save.mutate(e.target.value)}
            className="mt-2 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs font-semibold disabled:opacity-60"
          >
            <option value="">Select a Page…</option>
            {(pages.data?.pages ?? []).map((page) => (
              <option key={page.id} value={page.id}>
                {page.name}
                {page.category ? ` · ${page.category}` : ""}
                {page.canPublish ? "" : " (no publishing rights)"}
              </option>
            ))}
          </select>
          {pages.data?.error && <p className="mt-2 text-muted-foreground">{pages.data.error}</p>}
          {!hasPages && !pages.isLoading && (
            <div className="mt-2 flex gap-2">
              <input
                aria-label="Facebook Page ID"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="Paste Page ID"
                className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs"
              />
              <button
                type="button"
                disabled={!manualId.trim() || save.isPending}
                onClick={() => save.mutate(manualId.trim())}
                className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                Link Page
              </button>
            </div>
          )}
          {selected && !save.isPending && (
            <p className="mt-2 text-muted-foreground">Page linked — Facebook publishing is ready.</p>
          )}
          {save.isPending && <p className="mt-2 text-muted-foreground">Saving Page…</p>}
        </>
      )}
    </div>
  );
}