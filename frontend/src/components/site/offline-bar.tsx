"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const isOnline = () => navigator.onLine;
const serverOnline = () => true;

export function OfflineBar() {
  const online = useSyncExternalStore(subscribe, isOnline, serverOnline);
  if (online) return null;
  return (
    <div
      role="status"
      className="glass-frosted fixed inset-x-3 top-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-ink shadow-elev-2"
    >
      <WifiOff aria-hidden className="size-4 shrink-0 text-danger" />
      You&apos;re offline. Pages you have already opened still work.
    </div>
  );
}
