import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Errors that must never be retried — retrying them only burns main-thread time. */
function isTerminalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("not found") ||
    message.includes("invalid") ||
    message.includes("permission")
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Server state is shared across routes; a short stale window removes the
        // duplicate refetch storm on every navigation.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchIntervalInBackground: false,
        retry: (failureCount, error) => (isTerminalError(error) ? false : failureCount < 1),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        // Publishing mutations must never be replayed automatically.
        retry: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 100,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
