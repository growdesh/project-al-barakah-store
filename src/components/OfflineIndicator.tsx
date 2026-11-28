import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      console.warn("[PWA] Service worker registration skipped:", err);
    },
  });

  if (!isOnline || !needRefresh) return null;

  return (
    <div className="dm-pwa-banners" role="region" aria-label="অ্যাপ আপডেট">
      <div className="dm-update-bar" role="status" aria-live="polite">
        <span>অ্যাপের নতুন ভার্সন প্রস্তুত আছে</span>
        <div className="dm-update-bar-actions">
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="dm-btn dm-btn-primary dm-btn-sm"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>আপডেট করুন</span>
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="dm-btn dm-btn-ghost dm-btn-sm"
          >
            পরে
          </button>
        </div>
      </div>
    </div>
  );
}
