import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { dehydrate, hydrate, useQuery, useQueryClient, type DehydratedState } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getDashboard } from "@/lib/profile.functions";
import { logTemperatureViaBot } from "@/lib/chat.functions";
import { isoDate } from "@/lib/fertility";
import { acknowledgeTemperature, cachedOwner, clearOfflineOwner, mergeTemperatures, offlineKey, OWNER_KEY, pendingTemperatures, queueTemperature, readLocal, type PendingTemperature, type TemperatureEntry } from "@/lib/offline-store";

type OfflineContext = {
  owner: string;
  online: boolean;
  pending: PendingTemperature[];
  syncing: boolean;
  syncError: boolean;
  saveTemperature: (entry: TemperatureEntry) => Promise<void>;
  retrySync: () => void;
  forget: () => void;
};
const Offline = createContext<OfflineContext | null>(null);
export function useOffline() {
  const value = useContext(Offline);
  if (!value) throw new Error("OfflineProvider is required");
  return value;
}

const PERSISTED = new Set(["dashboard", "profile", "chat-history", "notifications"]);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const sendTemp = useServerFn(logTemperatureViaBot);
  const [owner, setOwner] = useState("");
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<PendingTemperature[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const syncingRef = useRef(false);
  const ownerRef = useRef("");

  useEffect(() => {
    let disposed = false;
    function activate(id: string) {
      if (disposed || (ownerRef.current === id && id)) return;
      if (ownerRef.current) {
        qc.clear();
        // Keep unsent readings isolated to their owner on an account switch.
      }
      ownerRef.current = id;
      setOwner(id);
      if (id) {
        localStorage.setItem(OWNER_KEY, id);
        const saved = readLocal<{ savedAt: number; state: DehydratedState } | null>(offlineKey(id, "queries"), null);
        if (saved && Date.now() - saved.savedAt < 30 * 86400000)
          hydrate(qc, { ...saved.state, queries: saved.state.queries.filter((q) => q.queryKey[1] === id && PERSISTED.has(String(q.queryKey[0]))) });
        setPending(pendingTemperatures(id));
      } else { setPending([]); }
      setReady(true);
    }
    setOnline(navigator.onLine);
    // A saved owner permits only local access when there is no network; it is
    // never passed as authorization to any server function.
    const previous = cachedOwner();
    if (!navigator.onLine && previous) activate(previous);
    void supabase.auth.getSession().then(({ data }) => activate(data.session?.user.id ?? (!navigator.onLine ? previous ?? "" : "")))
      .catch(() => activate(!navigator.onLine ? previous ?? "" : ""));
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (ownerRef.current) clearOfflineOwner(ownerRef.current);
        qc.clear();
        activate("");
      } else if (session) activate(session.user.id);
    });
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      disposed = true;
      subscription.subscription.unsubscribe();
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [qc]);

  useEffect(() => {
    if (!owner || !ready) return;
    const persist = () => {
      if (ownerRef.current !== owner) return;
      const state = dehydrate(qc, { shouldDehydrateMutation: () => false, shouldDehydrateQuery: (q) =>
        q.state.status === "success" && q.queryKey[1] === owner && PERSISTED.has(String(q.queryKey[0])) });
      try { localStorage.setItem(offlineKey(owner, "queries"), JSON.stringify({ savedAt: Date.now(), state })); } catch { /* Do not interfere with online use. */ }
    };
    const stop = qc.getQueryCache().subscribe(persist);
    persist();
    return stop;
  }, [owner, ready, qc]);

  const retrySync = useCallback(() => {
    if (!owner || !navigator.onLine || syncingRef.current) return;
    const syncingOwner = owner;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(false);
    void (async () => {
      try {
        // All synchronization still goes through the authenticated server function.
        const { data, error } = await supabase.auth.getSession();
        if (error || data.session?.user.id !== syncingOwner) throw new Error("Sign in to sync");
        for (const entry of pendingTemperatures(syncingOwner)) {
          if (!navigator.onLine || ownerRef.current !== syncingOwner) break;
          await sendTemp({ data: { ...entry, requestId: entry.revision } });
          const remaining = acknowledgeTemperature(syncingOwner, entry.revision);
          if (ownerRef.current === syncingOwner) setPending(remaining);
        }
        if (ownerRef.current === syncingOwner) {
          await Promise.all(["dashboard", "chat-history", "notifications"].map((kind) => qc.invalidateQueries({ queryKey: [kind, syncingOwner] })));
        }
      } catch {
        // Keep every unacknowledged entry for an explicit or timed retry.
        if (ownerRef.current === syncingOwner) setSyncError(true);
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    })();
  }, [owner, sendTemp, qc]);

  useEffect(() => {
    if (online && pending.length) retrySync();
    const timer = window.setInterval(() => {
      if (navigator.onLine && owner && pendingTemperatures(owner).length) retrySync();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [online, owner, pending.length, retrySync]);

  const saveTemperature = useCallback(async (entry: TemperatureEntry) => {
    if (!owner) throw new Error("Sign in before saving a temperature.");
    const next = queueTemperature(owner, entry, isoDate(new Date()));
    setPending(next);
  }, [owner]);

  const forget = useCallback(() => {
    if (owner) clearOfflineOwner(owner);
    qc.clear();
    setPending([]);
  }, [owner, qc]);
  const value = useMemo(() => ({ owner, online, pending, syncing, syncError, saveTemperature, retrySync, forget }), [owner, online, pending, syncing, syncError, saveTemperature, retrySync, forget]);
  if (!ready) return <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>;
  return <Offline.Provider value={value}>{children}</Offline.Provider>;
}

export function useOfflineDashboard() {
  const { owner, online, pending } = useOffline();
  const fetchDash = useServerFn(getDashboard);
  const query = useQuery({ queryKey: ["dashboard", owner], queryFn: () => fetchDash(), enabled: !!owner && online });
  const data = useMemo(() => query.data ? mergeTemperatures(query.data, pending) : undefined, [query.data, pending]);
  return { ...query, data, isLoading: query.isLoading || (!data && query.isFetching) };
}