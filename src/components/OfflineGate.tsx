import { RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";
import { checkServerConnection } from "../lib/firebase";

interface OfflineGateProps {
  onRecovered?: () => void;
}

export function OfflineGate({ onRecovered }: OfflineGateProps) {
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    setStillOffline(false);
    try {
      const ok = await checkServerConnection();
      if (ok) {
        onRecovered?.();
        window.location.reload();
      } else {
        setStillOffline(true);
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="dm-login-page">
      <main
        className="dm-login-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="offline-gate-title"
        aria-describedby="offline-gate-desc"
        style={{ textAlign: "center" }}
      >
        <div
          style={{
            display: "grid",
            justifyItems: "center",
            gap: 14,
            padding: "8px 0",
          }}
        >
          <span
            className="dm-kpi-icon dm-tone-rose"
            style={{ width: 60, height: 60, borderRadius: 16 }}
            aria-hidden="true"
          >
            <WifiOff size={30} />
          </span>

          <div style={{ display: "grid", gap: 6 }}>
            <h1
              id="offline-gate-title"
              style={{ margin: 0, fontSize: 22, fontWeight: 800 }}
            >
              ইন্টারনেট সংযোগ নেই
            </h1>
            <p
              id="offline-gate-desc"
              className="dm-text-muted"
              style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}
            >
              এই সফটওয়্যারটি শুধুমাত্র অনলাইনে কাজ করে। ইন্টারনেট সংযোগ ছাড়া
              কোনো কাজ করা যাবে না। অনুগ্রহ করে ওয়াই-ফাই বা মোবাইল ডাটা চালু
              করুন।
            </p>
          </div>

          {stillOffline && (
            <div
              className="dm-alert-error"
              role="alert"
              style={{ width: "100%", textAlign: "left" }}
            >
              <span>
                এখনো ইন্টারনেট সংযোগ পাওয়া যায়নি। সংযোগ চালু করে আবার চেষ্টা
                করুন।
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={checking}
            onClick={handleRetry}
            className="dm-btn dm-btn-primary dm-btn-full"
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>{checking ? "সংযোগ যাচাই হচ্ছে…" : "পুনরায় চেষ্টা করুন"}</span>
          </button>
        </div>
      </main>
    </div>
  );
}
