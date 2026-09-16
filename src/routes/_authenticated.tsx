import { createFileRoute, redirect, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, BookOpen, History, HeartPulse, Settings, LayoutGrid, Bot, LogOut } from "lucide-react";

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

const MENU = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/how-it-works", label: "How it works", icon: BookOpen },
  { to: "/history", label: "History", icon: History },
  { to: "/fertility", label: "Fertility explained", icon: HeartPulse },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthLayout() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

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
      <header className="sticky top-0 z-20 shadow-sm">
        <div className="h-12 bg-background" />
        <div className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center gap-3 px-4 py-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button aria-label="Open menu" className="rounded-full p-3 hover:bg-primary-foreground/10">
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b bg-primary px-5 py-6 text-primary-foreground">
                <SheetTitle className="text-primary-foreground">My Cycle AI</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col p-2">
                {MENU.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-accent"
                  >
                    <Icon className="h-4 w-4 text-primary" /> {label}
                  </Link>
                ))}
                <button
                  onClick={signOut}
                  className="mt-2 flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/dashboard" className="flex min-w-0 flex-1 items-center gap-3 text-lg font-semibold">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-base text-accent-foreground">
              M
            </span>
            <span className="truncate">My Cycle AI</span>
          </Link>

          <NotificationBell tone="dark" />
          <Button
            asChild
            variant="secondary"
            className="gap-2 rounded-full px-4 py-2"
            aria-label="Ask the AI assistant"
          >
            <Link to="/assistant">
              <Bot className="h-5 w-5" />
              <span className="hidden sm:inline">Ask AI</span>
            </Link>
          </Button>
        </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6"><Outlet /></main>
      <footer className="mt-12 border-t bg-muted/30">
        <div className="container mx-auto px-6 py-4 text-xs text-muted-foreground">
          <strong>My Cycle AI is not medical advice and not a contraceptive method.</strong> Always consult a healthcare provider.
        </div>
      </footer>
    </div>
  );
}
