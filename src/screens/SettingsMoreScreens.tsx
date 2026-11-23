import {
  ArrowLeft,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  LogOut,
  Settings,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PWAInstallButton } from "../components/PWAInstallButton";
import { useApp } from "../context/AppContext";
import { api, getStoredToken } from "../lib/api";
import { normalizePhone, toBn } from "../lib/format";
import { navigate } from "../lib/router";

type SettingsTab = "store" | "invoice" | "password" | "backup";

/* ─────────────────────────── 1. SettingsScreen ─────────────────────────── */

export function SettingsScreen() {
  const { user, data, toast, updateSettings } = useApp();

  const [tab, setTab] = useState<SettingsTab>("store");

  // Tab 1: স্টোর তথ্য
  const [storeName, setStoreName] = useState<string>(data?.store.name ?? "");
  const [storeSubtitle, setStoreSubtitle] = useState<string>(
    data?.store.subtitle ?? "",
  );
  const [storePhone, setStorePhone] = useState<string>(data?.store.phone ?? "");
  const [storeAddress, setStoreAddress] = useState<string>(
    data?.store.address ?? "",
  );
  const [storeOwner, setStoreOwner] = useState<string>(
    data?.store.ownerName ?? "",
  );
  const [savingStore, setSavingStore] = useState<boolean>(false);

  // Tab 2: ইনভয়েস ও স্টক
  const [invPrefix, setInvPrefix] = useState<string>(
    data?.settings.invoicePrefix ?? "ABS",
  );
  const [invFooter, setInvFooter] = useState<string>(
    data?.settings.invoiceFooter ?? "",
  );
  const [allowNegativeStock, setAllowNegativeStock] = useState<boolean>(
    Boolean(data?.settings.allowNegativeStock),
  );
  const [savingInvoice, setSavingInvoice] = useState<boolean>(false);

  // Tab 3: অ্যাডমিন পাসওয়ার্ড
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showNewPwd, setShowNewPwd] = useState<boolean>(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState<boolean>(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [savingPwd, setSavingPwd] = useState<boolean>(false);

  // Tab 4: ডাটা ব্যাকআপ
  const [downloadingBackup, setDownloadingBackup] = useState<boolean>(false);

  useEffect(() => {
    if (!data) return;
    setStoreName(data.store.name);
    setStoreSubtitle(data.store.subtitle);
    setStorePhone(data.store.phone);
    setStoreAddress(data.store.address);
    setStoreOwner(data.store.ownerName);
    setInvPrefix(data.settings.invoicePrefix);
    setInvFooter(data.settings.invoiceFooter);
    setAllowNegativeStock(Boolean(data.settings.allowNegativeStock));
  }, [data]);

  if (!data || !user) return null;

  if (user.role !== "admin") {
    return (
      <div className="dm-access-denied">
        <ShieldAlert size={36} className="dm-text-rose" aria-hidden="true" />
        <h2>এই পেজে প্রবেশের অনুমতি নেই</h2>
        <p>শুধুমাত্র অ্যাডমিন স্টোর সেটিংস পরিবর্তন করতে পারবেন।</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="dm-btn dm-btn-primary"
        >
          ড্যাশবোর্ডে ফিরুন
        </button>
      </div>
    );
  }

  const staffOnlyCount = data.staff.filter((s) => s.role === "staff").length;

  const handleSaveStore = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = storeName.trim();
    if (!trimmedName) {
      toast("স্টোরের নাম লিখুন");
      return;
    }

    setSavingStore(true);
    try {
      await updateSettings({
        store: {
          name: trimmedName,
          subtitle: storeSubtitle.trim(),
          phone: normalizePhone(storePhone) || data.store.phone,
          address: storeAddress.trim(),
          ownerName: storeOwner.trim(),
        },
      });
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "স্টোর তথ্য সংরক্ষণ করা যায়নি",
      );
    } finally {
      setSavingStore(false);
    }
  };

  const handleSaveInvoiceSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingInvoice(true);
    try {
      await updateSettings({
        settings: {
          invoicePrefix: invPrefix.trim() || "ABS",
          invoiceFooter: invFooter.trim(),
          allowNegativeStock,
        },
      });
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : "ইনভয়েস ও স্টক সেটিংস সংরক্ষণ করা যায়নি",
      );
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwdError(null);

    const next = newPassword.trim();
    const confirm = confirmPassword.trim();
    if (!next) {
      setPwdError("নতুন পাসওয়ার্ড লিখুন");
      return;
    }
    if (next.length < 4) {
      setPwdError("পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে");
      return;
    }
    if (next !== confirm) {
      setPwdError("নতুন পাসওয়ার্ড এবং নিশ্চিতকরণ পাসওয়ার্ড মিলছে না");
      return;
    }

    setSavingPwd(true);
    try {
      await updateSettings({ adminPassword: next });
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPwd(false);
      setShowConfirmPwd(false);
    } catch (err) {
      setPwdError(
        err instanceof Error ? err.message : "পাসওয়ার্ড আপডেট করা যায়নি",
      );
    } finally {
      setSavingPwd(false);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      const token = getStoredToken();
      const headers = new Headers();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      const res = await fetch(api.downloadBackupUrl(), {
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("ডাটা ব্যাকআপ ডাউনলোড ব্যর্থ হয়েছে");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "al-barakah-store-backup.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast("JSON ব্যাকআপ ডাউনলোড সম্পন্ন হয়েছে");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "ব্যাকআপ ডাউনলোড করা যায়নি",
      );
    } finally {
      setDownloadingBackup(false);
    }
  };

  return (
    <div className="dm-stack-md">
      <div className="dm-page-head">
        <div className="dm-page-head-left">
          <button
            type="button"
            aria-label="হোমে ফিরুন"
            onClick={() => navigate("/")}
            className="dm-back-btn"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div>
            <h1 className="dm-page-title">সেটিংস</h1>
            <p className="dm-page-sub">
              স্টোর তথ্য, ইনভয়েস ও স্টক, পাসওয়ার্ড এবং ডাটা ব্যাকআপ
            </p>
          </div>
        </div>
      </div>

      {/* 4 Tabs */}
      <div className="dm-tabs" role="tablist" aria-label="সেটিংস সেকশন">
        {[
          { id: "store" as const, label: "স্টোর তথ্য" },
          { id: "invoice" as const, label: "ইনভয়েস ও স্টক" },
          { id: "password" as const, label: "অ্যাডমিন পাসওয়ার্ড" },
          { id: "backup" as const, label: "ডাটা ব্যাকআপ" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`dm-tab${tab === item.id ? " is-active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Tab 1: স্টোর তথ্য */}
      {tab === "store" && (
        <form onSubmit={handleSaveStore} className="dm-card dm-form-grid">
          <h2 className="dm-card-title">স্টোরের তথ্য</h2>

          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="set-store-name">স্টোরের নাম *</label>
              <input
                id="set-store-name"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="dm-input"
              />
            </div>

            <div className="dm-field">
              <label htmlFor="set-store-subtitle">সাবটাইটেল</label>
              <input
                id="set-store-subtitle"
                value={storeSubtitle}
                onChange={(e) => setStoreSubtitle(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>

          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="set-store-phone">মোবাইল নম্বর</label>
              <input
                id="set-store-phone"
                type="tel"
                inputMode="tel"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                className="dm-input"
              />
            </div>

            <div className="dm-field">
              <label htmlFor="set-store-owner">স্বত্বাধিকারী / অ্যাডমিন নাম</label>
              <input
                id="set-store-owner"
                value={storeOwner}
                onChange={(e) => setStoreOwner(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>

          <div className="dm-field">
            <label htmlFor="set-store-address">ঠিকানা</label>
            <input
              id="set-store-address"
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
              className="dm-input"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={savingStore}
              className="dm-btn dm-btn-primary"
            >
              {savingStore ? "সংরক্ষণ হচ্ছে…" : "স্টোর তথ্য সংরক্ষণ করুন"}
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: ইনভয়েস ও স্টক */}
      {tab === "invoice" && (
        <form
          onSubmit={handleSaveInvoiceSettings}
          className="dm-card dm-form-grid"
        >
          <h2 className="dm-card-title">ইনভয়েস ও স্টক নিয়ম</h2>

          <div className="dm-field">
            <label htmlFor="set-inv-prefix">ইনভয়েস প্রিফিক্স</label>
            <input
              id="set-inv-prefix"
              value={invPrefix}
              onChange={(e) => setInvPrefix(e.target.value)}
              placeholder="ABS"
              className="dm-input"
            />
          </div>

          <div className="dm-field">
            <label htmlFor="set-inv-footer">ইনভয়েস ফুটার নোট</label>
            <textarea
              id="set-inv-footer"
              value={invFooter}
              onChange={(e) => setInvFooter(e.target.value)}
              className="dm-textarea"
            />
          </div>

          <label
            className="dm-toggle-row"
            style={{ cursor: "pointer", minHeight: 52 }}
          >
            <div>
              <strong style={{ display: "block" }}>নেগেটিভ স্টক অনুমোদন</strong>
              <small className="dm-text-muted">
                চালু থাকলে পণ্যের মজুদ শূন্য হলেও বিক্রি সম্পন্ন করা যাবে
              </small>
            </div>
            <input
              type="checkbox"
              checked={allowNegativeStock}
              onChange={(e) => setAllowNegativeStock(e.target.checked)}
              style={{ width: 22, height: 22, flexShrink: 0 }}
            />
          </label>

          <div>
            <button
              type="submit"
              disabled={savingInvoice}
              className="dm-btn dm-btn-primary"
            >
              {savingInvoice
                ? "সংরক্ষণ হচ্ছে…"
                : "ইনভয়েস ও স্টক সেটিংস সংরক্ষণ"}
            </button>
          </div>
        </form>
      )}

      {/* Tab 3: অ্যাডমিন পাসওয়ার্ড */}
      {tab === "password" && (
        <form onSubmit={handleSavePassword} className="dm-card dm-form-grid">
          <h2 className="dm-card-title">অ্যাডমিন পাসওয়ার্ড পরিবর্তন</h2>

          {pwdError && (
            <div className="dm-alert-error" role="alert">
              <span>{pwdError}</span>
            </div>
          )}

          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="set-new-pwd">নতুন পাসওয়ার্ড *</label>
              <div className="dm-password-wrap">
                <input
                  id="set-new-pwd"
                  type={showNewPwd ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="নতুন পাসওয়ার্ড লিখুন"
                  className="dm-input"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd((v) => !v)}
                  aria-label={
                    showNewPwd ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"
                  }
                  className="dm-password-toggle"
                >
                  {showNewPwd ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="dm-field">
              <label htmlFor="set-confirm-pwd">নিশ্চিত করুন *</label>
              <div className="dm-password-wrap">
                <input
                  id="set-confirm-pwd"
                  type={showConfirmPwd ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="পুনরায় পাসওয়ার্ড লিখুন"
                  className="dm-input"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd((v) => !v)}
                  aria-label={
                    showConfirmPwd ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"
                  }
                  className="dm-password-toggle"
                >
                  {showConfirmPwd ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={savingPwd}
              className="dm-btn dm-btn-primary"
            >
              {savingPwd ? "আপডেট হচ্ছে…" : "পাসওয়ার্ড আপডেট করুন"}
            </button>
          </div>
        </form>
      )}

      {/* Tab 4: ডাটা ব্যাকআপ */}
      {tab === "backup" && (
        <div className="dm-card dm-stack-md">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
                <Database size={19} />
              </span>
              <div>
                <h2 className="dm-card-title">ব্যবসার সম্পূর্ণ ডাটা ব্যাকআপ</h2>
                <p className="dm-page-sub">
                  পণ্য, কাস্টমার, চালান ও হিসাবের সম্পূর্ণ কপি JSON ফাইলে সংরক্ষণ করুন
                </p>
              </div>
            </div>
          </div>

          <div className="dm-feed-list">
            <div className="dm-feed-item">
              <span>মোট পণ্য</span>
              <strong>{toBn(data.products.length)}টি</strong>
            </div>
            <div className="dm-feed-item">
              <span>মোট কাস্টমার</span>
              <strong>{toBn(data.customers.length)}জন</strong>
            </div>
            <div className="dm-feed-item">
              <span>মোট বিক্রয় চালান</span>
              <strong>{toBn(data.invoices.length)}টি</strong>
            </div>
            <div className="dm-feed-item">
              <span>মোট বাকি আদায়</span>
              <strong>{toBn(data.collections.length)}টি</strong>
            </div>
            <div className="dm-feed-item">
              <span>মোট স্টাফ অ্যাকাউন্ট</span>
              <strong>{toBn(staffOnlyCount)}জন</strong>
            </div>
          </div>

          <div>
            <button
              type="button"
              disabled={downloadingBackup}
              onClick={handleDownloadBackup}
              className="dm-btn dm-btn-primary"
            >
              <Download size={17} aria-hidden="true" />
              <span>
                {downloadingBackup
                  ? "ডাউনলোড হচ্ছে…"
                  : "JSON ব্যাকআপ ডাউনলোড"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── 2. MoreScreen ─────────────────────────── */

export function MoreScreen() {
  const { user, logout } = useApp();

  const modules = useMemo(() => {
    if (!user) return [];
    if (user.role === "admin") {
      return [
        {
          label: "নতুন বিক্রি",
          to: "/sales/new",
          tone: "dm-tone-emerald",
          icon: ShoppingCart,
        },
        {
          label: "বিক্রি ও চালান",
          to: "/sales",
          tone: "dm-tone-blue",
          icon: FileText,
        },
        {
          label: "বাকি আদায়",
          to: "/collections",
          tone: "dm-tone-teal",
          icon: Wallet,
        },
        {
          label: "কাস্টমার",
          to: "/customers",
          tone: "dm-tone-indigo",
          icon: Users,
        },
        {
          label: "পণ্য ও স্টক",
          to: "/stock",
          tone: "dm-tone-amber",
          icon: Boxes,
        },
        {
          label: "ক্রয়",
          to: "/purchases",
          tone: "dm-tone-purple",
          icon: ShoppingBag,
        },
        {
          label: "সাপ্লায়ার",
          to: "/suppliers",
          tone: "dm-tone-orange",
          icon: Building2,
        },
        {
          label: "স্টাফ",
          to: "/staff",
          tone: "dm-tone-blue",
          icon: UserCheck,
        },
        {
          label: "নগদ হিসাব",
          to: "/money",
          tone: "dm-tone-emerald",
          icon: Banknote,
        },
        {
          label: "রিপোর্ট",
          to: "/reports",
          tone: "dm-tone-purple",
          icon: BarChart3,
        },
        {
          label: "সেটিংস",
          to: "/settings",
          tone: "dm-tone-slate",
          icon: Settings,
        },
      ];
    }

    return [
      {
        label: "নতুন বিক্রি",
        to: "/sales/new",
        tone: "dm-tone-emerald",
        icon: ShoppingCart,
      },
      {
        label: "আমার বিক্রি",
        to: "/sales",
        tone: "dm-tone-blue",
        icon: FileText,
      },
      {
        label: "বাকি আদায়",
        to: "/collections",
        tone: "dm-tone-teal",
        icon: Wallet,
      },
      {
        label: "কাস্টমার",
        to: "/customers",
        tone: "dm-tone-indigo",
        icon: Users,
      },
      {
        label: "আমার রিপোর্ট",
        to: "/reports",
        tone: "dm-tone-purple",
        icon: BarChart3,
      },
    ];
  }, [user]);

  if (!user) return null;

  return (
    <div className="dm-stack-md">
      <div className="dm-page-head">
        <div className="dm-page-head-left">
          <button
            type="button"
            aria-label="হোমে ফিরুন"
            onClick={() => navigate("/")}
            className="dm-back-btn"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div>
            <h1 className="dm-page-title">আরও</h1>
            <p className="dm-page-sub">
              সকল মডিউল ও অ্যাকাউন্ট নিয়ন্ত্রণ
            </p>
          </div>
        </div>
      </div>

      {/* Role-Scoped Pastel Module Tile Grid */}
      <div className="dm-tiles-grid">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.to}
              type="button"
              onClick={() => navigate(mod.to)}
              className="dm-module-tile"
            >
              <span
                className={`dm-action-icon ${mod.tone}`}
                aria-hidden="true"
              >
                <Icon size={21} />
              </span>
              <strong>{mod.label}</strong>
            </button>
          );
        })}
      </div>

      {/* PWA App Install Card (shown when installable or on iOS Safari) */}
      <PWAInstallButton variant="card" />

      {/* Clean Logout Button */}
      <button
        type="button"
        onClick={logout}
        className="dm-btn dm-btn-danger dm-btn-full"
      >
        <LogOut size={17} aria-hidden="true" />
        <span>লগআউট</span>
      </button>
    </div>
  );
}
