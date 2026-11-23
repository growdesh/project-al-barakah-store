import {
  BarChart3,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  House,
  LayoutGrid,
  LogOut,
  MapPin,
  PlusCircle,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useApp } from "../context/AppContext";
import { formatDateBn, formatMoneyBn, formatNumberBn } from "../lib/format";
import { Link, useRouter } from "../lib/router";
import { ModalDialog } from "./ModalDialog";
import { OfflineIndicator } from "./OfflineIndicator";
import { PWAInstallButton } from "./PWAInstallButton";

interface NavDef {
  label: string;
  to: string;
  icon: typeof House;
}

function isNavActive(
  currentPath: string,
  targetPath: string,
  hasNewSaleTab: boolean,
): boolean {
  if (targetPath === "/") return currentPath === "/";
  if (targetPath === "/sales") {
    return (
      currentPath === "/sales" ||
      (!hasNewSaleTab && currentPath === "/sales/new")
    );
  }
  if (targetPath === "/purchases") {
    return currentPath === "/purchases" || currentPath === "/purchases/new";
  }
  return (
    currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
  );
}

function getUserInitials(name: string, fallback: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^মো\.?$/i.test(w));
  const picked = words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("");
  return picked || fallback || "AB";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data, user, logout, toastMessage } = useApp();
  const { path, navigate } = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [searchKind, setSearchKind] = useState<string>("সব");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileWrapRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === "admin";

  const mainNav = useMemo<NavDef[]>(() => {
    if (isAdmin) {
      return [
        { label: "হোম", to: "/", icon: House },
        { label: "নতুন বিক্রি", to: "/sales/new", icon: PlusCircle },
        { label: "বিক্রি ও চালান", to: "/sales", icon: ShoppingCart },
        { label: "বাকি আদায়", to: "/collections", icon: HandCoins },
        { label: "কাস্টমার", to: "/customers", icon: Users },
        { label: "পণ্য ও স্টক", to: "/stock", icon: Boxes },
      ];
    }
    return [
      { label: "হোম", to: "/", icon: House },
      { label: "নতুন বিক্রি", to: "/sales/new", icon: PlusCircle },
      { label: "আমার বিক্রি", to: "/sales", icon: ShoppingCart },
      { label: "বাকি আদায়", to: "/collections", icon: HandCoins },
      { label: "কাস্টমার", to: "/customers", icon: Users },
    ];
  }, [isAdmin]);

  const managementNav = useMemo<NavDef[]>(() => {
    if (isAdmin) {
      return [
        { label: "ক্রয়", to: "/purchases", icon: ShoppingBag },
        { label: "সাপ্লায়ার", to: "/suppliers", icon: Building2 },
        { label: "স্টাফ", to: "/staff", icon: UserCog },
        { label: "নগদ হিসাব", to: "/money", icon: Wallet },
        { label: "রিপোর্ট", to: "/reports", icon: BarChart3 },
        { label: "আরও", to: "/more", icon: LayoutGrid },
      ];
    }
    return [
      { label: "আমার রিপোর্ট", to: "/reports", icon: BarChart3 },
      { label: "আরও", to: "/more", icon: LayoutGrid },
    ];
  }, [isAdmin]);

  const bottomTabs = useMemo<NavDef[]>(() => {
    if (isAdmin) {
      return [
        { label: "হোম", to: "/", icon: House },
        { label: "বিক্রি", to: "/sales", icon: ShoppingCart },
        { label: "বাকি আদায়", to: "/collections", icon: HandCoins },
        { label: "রিপোর্ট", to: "/reports", icon: BarChart3 },
        { label: "আরও", to: "/more", icon: LayoutGrid },
      ];
    }
    return [
      { label: "হোম", to: "/", icon: House },
      { label: "নতুন বিক্রি", to: "/sales/new", icon: PlusCircle },
      { label: "আমার বিক্রি", to: "/sales", icon: ShoppingCart },
      { label: "বাকি আদায়", to: "/collections", icon: HandCoins },
      { label: "আমার রিপোর্ট", to: "/reports", icon: BarChart3 },
    ];
  }, [isAdmin]);

  useEffect(() => {
    if (!searchOpen) return;
    setSearchTerm("");
    setSearchKind("সব");
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProfileOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable);
      if (editable) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setProfileOpen(false);
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const onOutside = (e: PointerEvent) => {
      if (
        profileWrapRef.current &&
        !profileWrapRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [profileOpen]);

  const searchMatches = useMemo(() => {
    if (!data) return [];
    const q = deferredSearchTerm.trim().toLowerCase();
    if (!q) return [];

    const customers = data.customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.mobile.toLowerCase().includes(q) ||
          c.area.toLowerCase().includes(q),
      )
      .slice(0, 5)
      .map((c) => ({
        key: `cust-${c.id}`,
        kind: "কাস্টমার",
        title: c.name,
        sub: `${c.mobile} · ${c.area}`,
        amount: c.due,
        to: "/customers",
      }));

    const invoices = data.invoices
      .filter(
        (inv) =>
          inv.number.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q) ||
          inv.customerMobile.toLowerCase().includes(q),
      )
      .slice(0, 5)
      .map((inv) => ({
        key: `inv-${inv.id}`,
        kind: "ইনভয়েস",
        title: inv.number,
        sub: `${inv.customerName} · ${formatDateBn(inv.date)}`,
        amount: inv.total,
        to: "/sales",
      }));

    const products = data.products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      )
      .slice(0, 5)
      .map((p) => ({
        key: `prd-${p.id}`,
        kind: "পণ্য",
        title: p.name,
        sub: `${p.sku} · স্টক ${formatNumberBn(p.stock)} ${p.unit}`,
        amount: p.saleRate,
        to: isAdmin ? "/stock" : "/sales/new",
      }));

    const all = [...customers, ...invoices, ...products];
    if (searchKind === "সব") return all.slice(0, 12);
    return all.filter((item) => item.kind === searchKind).slice(0, 12);
  }, [data, deferredSearchTerm, searchKind, isAdmin]);

  if (!data || !user) {
    return null;
  }

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

  const initials = getUserInitials(user.name, data.store.initials || "AB");

  return (
    <div className="dm-root">
      <div className="dm-shell">
        <aside
          aria-label="সাইডবার নেভিগেশন"
          data-navigation={collapsed ? "collapsed" : "expanded"}
          className={`dm-sidebar${collapsed ? " is-collapsed" : ""}`}
        >
          <div className="dm-sidebar-head">
            <Link to="/" className="dm-sidebar-brand">
              <img
                src="/logo.svg"
                alt={data.store.name}
                width={36}
                height={36}
                className="dm-sidebar-logo"
              />
              {!collapsed && (
                <div className="dm-sidebar-brand-text">
                  <span className="dm-sidebar-title">{data.store.name}</span>
                  <span className="dm-sidebar-subtitle">
                    {isAdmin ? "অ্যাডমিন প্যানেল" : "স্টাফ ওয়ার্কস্পেস"}
                  </span>
                </div>
              )}
            </Link>
            <button
              type="button"
              aria-label={
                collapsed ? "সাইডবার বড় করুন" : "সাইডবার ছোট করুন"
              }
              onClick={() => setCollapsed((c) => !c)}
              className="dm-sidebar-toggle"
            >
              {collapsed ? (
                <ChevronRight size={16} aria-hidden="true" />
              ) : (
                <ChevronLeft size={16} aria-hidden="true" />
              )}
            </button>
          </div>

          <nav
            aria-label="প্রধান মেনু"
            data-sidebar-nav="true"
            className="dm-sidebar-nav"
          >
            <div className="dm-nav-group">
              {mainNav.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(path, item.to, true);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`dm-nav-item${active ? " is-active" : ""}`}
                  >
                    {active && <span className="dm-nav-bar" aria-hidden="true" />}
                    <span className="dm-nav-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    {!collapsed && (
                      <span className="dm-nav-label">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="dm-nav-divider">
              {!collapsed ? (
                <p className="dm-nav-group-label">
                  {isAdmin ? "ম্যানেজমেন্ট" : "পারফরম্যান্স"}
                </p>
              ) : (
                <span className="dm-nav-divider-line" aria-hidden="true" />
              )}
              <div className="dm-nav-group">
                {managementNav.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(path, item.to, true);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={`dm-nav-item${active ? " is-active" : ""}`}
                    >
                      {active && (
                        <span className="dm-nav-bar" aria-hidden="true" />
                      )}
                      <span className="dm-nav-icon" aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      {!collapsed && (
                        <span className="dm-nav-label">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>

          {!collapsed && (
            <div className="dm-sidebar-pwa">
              <PWAInstallButton variant="sidebar" />
            </div>
          )}

          <div
            className="dm-sidebar-footer"
            data-sidebar-footer="true"
            style={
              !collapsed
                ? {
                    gridTemplateColumns: isAdmin
                      ? "repeat(2, minmax(0, 1fr))"
                      : "1fr",
                  }
                : undefined
            }
          >
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate("/settings")}
                aria-label="সেটিংস"
                title={collapsed ? "সেটিংস" : undefined}
                className="dm-footer-action"
              >
                <Settings size={16} aria-hidden="true" />
                {!collapsed && <span>সেটিংস</span>}
              </button>
            )}

            <button
              type="button"
              onClick={() => void logout()}
              aria-label="লগআউট"
              title={collapsed ? "লগআউট" : undefined}
              className="dm-footer-action is-danger"
            >
              <LogOut size={16} aria-hidden="true" />
              {!collapsed && <span>লগআউট</span>}
            </button>
          </div>
        </aside>

        <div className="dm-main-col">
          <header className="dm-topbar">
            <div className="dm-topbar-org">
              <Link
                to="/"
                className="dm-mobile-logo"
                aria-label={data.store.name}
              >
                <img
                  src="/logo.svg"
                  alt={data.store.name}
                  width={32}
                  height={32}
                />
              </Link>
              <div className="dm-org-meta">
                <p className="dm-org-title">{data.store.name}</p>
                <p className="dm-org-address">
                  <MapPin size={12} aria-hidden="true" />
                  <span>{data.store.address}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="খুঁজুন"
              className="dm-topbar-search"
            >
              <span className="dm-topbar-search-inner">
                <Search size={15} aria-hidden="true" />
                <span>কাস্টমার, চালান বা পণ্য খুঁজুন…</span>
              </span>
              <kbd className="dm-kbd" aria-hidden="true">
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>

            <div className="dm-topbar-right">
              <PWAInstallButton variant="compact" />

              <span
                className={`dm-role-tag${isAdmin ? "" : " is-staff"}`}
                title={isAdmin ? "অ্যাডমিন" : `স্টাফ · ${user.name}`}
              >
                <span>{isAdmin ? "অ্যাডমিন" : `স্টাফ · ${user.name}`}</span>
              </span>

              <button
                type="button"
                aria-label="খুঁজুন"
                onClick={() => setSearchOpen(true)}
                className="dm-mobile-search-btn"
              >
                <Search size={18} aria-hidden="true" />
              </button>

              <div className="dm-profile-wrap" ref={profileWrapRef}>
                <button
                  type="button"
                  aria-label="প্রোফাইল মেনু"
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                  onClick={() => setProfileOpen((p) => !p)}
                  className="dm-avatar-btn"
                >
                  <span>{initials}</span>
                </button>

                {profileOpen && (
                  <div
                    className="dm-profile-menu"
                    role="menu"
                    aria-label="প্রোফাইল অপশন"
                  >
                    <div className="dm-profile-head">
                      <strong>{user.name}</strong>
                      <span>
                        {isAdmin ? "অ্যাডমিন" : "স্টাফ"} · {user.phone}
                      </span>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        role="menuitem"
                        className="dm-profile-item"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate("/settings");
                        }}
                      >
                        <Settings size={16} aria-hidden="true" />
                        <span>সেটিংস</span>
                      </button>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      className="dm-profile-item is-danger"
                      onClick={() => {
                        setProfileOpen(false);
                        void logout();
                      }}
                    >
                      <LogOut size={16} aria-hidden="true" />
                      <span>লগআউট</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <OfflineIndicator />

          <main className="dm-content">{children}</main>
        </div>
      </div>

      <nav aria-label="মোবাইল নেভিগেশন" className="dm-bottom-nav">
        <div className="dm-bottom-grid">
          {bottomTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isNavActive(path, tab.to, !isAdmin);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={`dm-bottom-tab${active ? " is-active" : ""}`}
              >
                {active && (
                  <span className="dm-bottom-tab-bar" aria-hidden="true" />
                )}
                <span className="dm-bottom-tab-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="dm-bottom-tab-label">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <ModalDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="দ্রুত অনুসন্ধান"
        subtitle="কাস্টমার, ইনভয়েস বা পণ্য খুঁজুন"
        size="lg"
      >
        <input
          ref={searchInputRef}
          type="search"
          aria-label="অনুসন্ধান"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="নাম, মোবাইল, ইনভয়েস নম্বর বা SKU লিখুন…"
          autoFocus
          className="dm-input"
        />

        <div className="dm-pills dm-pills-scroll">
          {(["সব", "কাস্টমার", "ইনভয়েস", "পণ্য"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={searchKind === kind}
              onClick={() => setSearchKind(kind)}
              className={`dm-pill${searchKind === kind ? " is-active" : ""}`}
            >
              {kind}
            </button>
          ))}
        </div>

        <div className="dm-search-results">
          {searchMatches.length === 0 ? (
            <p className="dm-empty-inline">
              {searchTerm.trim()
                ? "কোনো ফলাফল পাওয়া যায়নি"
                : "খুঁজতে উপরের বক্সে নাম বা নম্বর লিখুন…"}
            </p>
          ) : (
            searchMatches.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  navigate(item.to);
                }}
                className="dm-search-result"
              >
                <span className="dm-search-result-meta">
                  <strong>{item.title}</strong>
                  <small>
                    {item.kind} · {item.sub}
                  </small>
                </span>
                <span className="dm-search-result-amount">
                  {formatMoneyBn(item.amount)}
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))
          )}
        </div>
      </ModalDialog>

      {toastMessage && (
        <div className="dm-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
