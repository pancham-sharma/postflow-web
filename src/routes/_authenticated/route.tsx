import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isAuthAvailabilityError, logAuthFailure } from "@/lib/supabase-auth-errors";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) throw redirect({ to: "/login" });

    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };

    // A temporary Auth endpoint/network failure should not throw away a valid
    // session immediately after OAuth. Database RLS and server functions still
    // enforce authorization for every protected operation.
    if (error && isAuthAvailabilityError(error)) {
      logAuthFailure("protected_route_get_user", error);
      return { user: sessionData.session.user };
    }

    if (error) logAuthFailure("protected_route_invalid_session", error);

    throw redirect({ to: "/login" });
  },
  component: () => <Outlet />,
});
