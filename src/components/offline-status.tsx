import { CloudOff, LoaderCircle, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOffline } from "@/lib/offline";
import { useT } from "@/lib/i18n";

export function OfflineStatus() {
  const { online, pending, syncing, syncError, retrySync } = useOffline();
  const { t } = useT();
  if (online && !pending.length && !syncError) return null;
  return <div role="status" className="border-b bg-accent text-accent-foreground">
    <div className="container mx-auto flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
      {!online ? <CloudOff className="h-4 w-4 shrink-0" /> : syncing ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> : <CloudUpload className="h-4 w-4 shrink-0" />}
      <span>{t(!online ? "Offline · saved cycle data" : syncing ? "Syncing temperatures…" : "Temperatures waiting to sync")}</span>
      {!!pending.length && <span>{pending.length} {t("saved on this device")}</span>}
      {syncError && online && <Button variant="outline" size="sm" onClick={retrySync}>{t("Retry sync")}</Button>}
    </div>
  </div>;
}