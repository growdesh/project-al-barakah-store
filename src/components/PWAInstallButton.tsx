import { Download, PlusSquare, Share, Smartphone } from "lucide-react";
import { useState } from "react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { ModalDialog } from "./ModalDialog";

interface PWAInstallButtonProps {
  variant?: "compact" | "card" | "sidebar";
}

export function PWAInstallButton({
  variant = "compact",
}: PWAInstallButtonProps) {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (isInstalled) return null;
  if (!canInstall && !isIOS) return null;

  const handleAction = async () => {
    if (canInstall) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === "card" ? (
        <div className="dm-install-card">
          <div className="dm-install-card-icon" aria-hidden="true">
            <Smartphone size={20} />
          </div>
          <div className="dm-install-card-copy">
            <strong>মোবাইল ও ডেস্কটপ অ্যাপ ইনস্টল</strong>
            <p>
              হোম স্ক্রিনে যোগ করে ফুল-স্ক্রিন ও দ্রুত অ্যাপের মতো ব্যবহার করুন
            </p>
          </div>
          <button
            type="button"
            onClick={handleAction}
            disabled={installing}
            className="dm-btn dm-btn-primary dm-btn-sm"
          >
            {canInstall ? <Download size={15} /> : <Share size={15} />}
            <span>
              {installing
                ? "ইনস্টল হচ্ছে…"
                : canInstall
                  ? "অ্যাপ ইনস্টল"
                  : "হোম স্ক্রিনে যোগ"}
            </span>
          </button>
        </div>
      ) : variant === "sidebar" ? (
        <button
          type="button"
          onClick={handleAction}
          disabled={installing}
          className="dm-sidebar-install-btn"
        >
          {canInstall ? <Download size={16} /> : <Share size={16} />}
          <span>
            {installing
              ? "ইনস্টল হচ্ছে…"
              : canInstall
                ? "অ্যাপ ইনস্টল করুন"
                : "হোম স্ক্রিনে যোগ করুন"}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleAction}
          disabled={installing}
          className="dm-btn dm-btn-soft dm-btn-sm dm-install-chip"
          title="হোম স্ক্রিনে অ্যাপ হিসেবে ইনস্টল করুন"
        >
          {canInstall ? <Download size={15} /> : <Share size={15} />}
          <span>{canInstall ? "ইনস্টল" : "অ্যাপ যোগ"}</span>
        </button>
      )}

      <ModalDialog
        open={showIOSGuide}
        onClose={() => setShowIOSGuide(false)}
        title="হোম স্ক্রিনে অ্যাপ যোগ করুন"
        subtitle="iPhone ও iPad-এ আল-বারাকাহ স্টোর অ্যাপ ইনস্টল নির্দেশিকা"
        size="sm"
        footer={
          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            className="dm-btn dm-btn-primary"
          >
            বুঝেছি
          </button>
        }
      >
        <ol className="dm-ios-steps">
          <li>
            <span className="dm-ios-step-num">১</span>
            <div>
              <strong>Safari-এর নিচের Share বাটনে ট্যাপ করুন</strong>
              <p>
                ব্রাউজারের নিচে বা উপরে থাকা{" "}
                <Share size={14} className="dm-inline-icon" aria-hidden="true" />{" "}
                আইকনটি চাপুন।
              </p>
            </div>
          </li>
          <li>
            <span className="dm-ios-step-num">২</span>
            <div>
              <strong>“Add to Home Screen” নির্বাচন করুন</strong>
              <p>
                মেনু স্ক্রল করে{" "}
                <PlusSquare
                  size={14}
                  className="dm-inline-icon"
                  aria-hidden="true"
                />{" "}
                <strong>Add to Home Screen</strong> অপশনে ট্যাপ করুন।
              </p>
            </div>
          </li>
          <li>
            <span className="dm-ios-step-num">৩</span>
            <div>
              <strong>উপরে ডানদিকে “Add” বাটনে চাপ দিন</strong>
              <p>
                এখন হোম স্ক্রিন থেকেই সরাসরি ফুল-স্ক্রিন অ্যাপ হিসেবে চালু করতে
                পারবেন।
              </p>
            </div>
          </li>
        </ol>
      </ModalDialog>
    </>
  );
}
