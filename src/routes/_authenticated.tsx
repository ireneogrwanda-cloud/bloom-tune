import { createFileRoute, redirect, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Trust the stored session first: it survives reloads and is refreshed
    // automatically, so a slow or failed network call never signs anyone out.
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const nav = useNavigate();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Only a real sign-out sends you back to the login screen.
      if (event === "SIGNED_OUT") nav({ to: "/login" });
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  async function signOut() {
    await supabase.auth.signOut();
    nav({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white text-sm">M</span>
            My Cycle AI
          </Link>
          <nav className="flex items-center gap-1">
            <NotificationBell />
            <Button asChild variant="ghost" size="sm"><Link to="/dashboard">Dashboard</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link to="/how-it-works">How it works</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link to="/settings">Settings</Link></Button>
            <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-6 py-8"><Outlet /></main>
      <footer className="mt-12 border-t bg-muted/30">
        <div className="container mx-auto px-6 py-4 text-xs text-muted-foreground">
          <strong>My Cycle AI is not medical advice and not a contraceptive method.</strong> Always consult a healthcare provider.
        </div>
      </footer>
    </div>
  );
}
