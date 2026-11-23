import { RefreshCw, WifiOff } from "lucide-react";
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

  if (isOnline && !needRefresh) return null;

  return (
    <div className="dm-pwa-banners" role="region" aria-label="অ্যাপ সংযোগ ও আপডেট">
      {!isOnline && (
        <div className="dm-offline-bar" role="status" aria-live="polite">
          <WifiOff size={15} aria-hidden="true" />
          <span>
            অফলাইন মোড — সংরক্ষিত তথ্য দেখানো হচ্ছে। ইন্টারনেট ফিরলে নতুন এন্ট্রি
            সংরক্ষণ করতে পারবেন।
          </span>
        </div>
      )}

      {needRefresh && (
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
      )}
    </div>
  );
}
