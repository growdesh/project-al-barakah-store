import { ShieldAlert } from "lucide-react";
import { Suspense, lazy, type ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineGate } from "./components/OfflineGate";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { useApp } from "./context/AppContext";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { normalizePath, useRouter } from "./lib/router";
import { DashboardScreen } from "./screens/DashboardScreen";
import { LoginScreen } from "./screens/LoginScreen";

// Code-split secondary modules for faster initial smartphone load
const CashBookScreen = lazy(() =>
  import("./screens/CashBookScreen").then((m) => ({
    default: m.CashBookScreen,
  })),
);
const CollectionsScreen = lazy(() =>
  import("./screens/CollectionsScreen").then((m) => ({
    default: m.CollectionsScreen,
  })),
);
const CustomersScreen = lazy(() =>
  import("./screens/CustomersScreen").then((m) => ({
    default: m.CustomersScreen,
  })),
);
const PurchasesScreen = lazy(() =>
  import("./screens/PurchasesSuppliersScreen").then((m) => ({
    default: m.PurchasesScreen,
  })),
);
const SuppliersScreen = lazy(() =>
  import("./screens/PurchasesSuppliersScreen").then((m) => ({
    default: m.SuppliersScreen,
  })),
);
const ReportsScreen = lazy(() =>
  import("./screens/ReportsScreen").then((m) => ({ default: m.ReportsScreen })),
);
const SalesScreen = lazy(() =>
  import("./screens/SalesScreen").then((m) => ({ default: m.SalesScreen })),
);
const MoreScreen = lazy(() =>
  import("./screens/SettingsMoreScreens").then((m) => ({
    default: m.MoreScreen,
  })),
);
const SettingsScreen = lazy(() =>
  import("./screens/SettingsMoreScreens").then((m) => ({
    default: m.SettingsScreen,
  })),
);
const StaffScreen = lazy(() =>
  import("./screens/StaffScreen").then((m) => ({ default: m.StaffScreen })),
);
const StockScreen = lazy(() =>
  import("./screens/StockScreen").then((m) => ({ default: m.StockScreen })),
);
const TradeScreen = lazy(() =>
  import("./screens/TradeScreen").then((m) => ({ default: m.TradeScreen })),
);

function ScreenSkeleton() {
  return (
    <div className="dm-screen-loader" role="status" aria-live="polite">
      <div className="dm-skeleton dm-skeleton-title" />
      <div className="dm-skeleton-grid">
        <div className="dm-skeleton dm-skeleton-card" />
        <div className="dm-skeleton dm-skeleton-card" />
        <div className="dm-skeleton dm-skeleton-card" />
        <div className="dm-skeleton dm-skeleton-card" />
      </div>
      <div className="dm-skeleton dm-skeleton-table" />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const isOnline = useOnlineStatus();
  const { loading, user, data } = useApp();
  const { path, navigate } = useRouter();

  if (!isOnline) {
    return <OfflineGate />;
  }

  if (loading) {
    return (
      <div className="dm-login-page">
        <div
          className="dm-boot-card"
          role="status"
          aria-live="polite"
        >
          <img
            src="/logo.svg"
            alt=""
            width={44}
            height={44}
            className="dm-boot-logo"
          />
          <div className="dm-boot-spinner" aria-hidden="true" />
          <p>আল-বারাকাহ স্টোর লোড হচ্ছে…</p>
        </div>
      </div>
    );
  }

  if (!user || !data) {
    return (
      <>
        <OfflineIndicator />
        <LoginScreen />
      </>
    );
  }

  const route = normalizePath(path);
  const isAdmin = user.role === "admin";

  let screen: ReactNode;

  if (route === "/") {
    screen = <DashboardScreen />;
  } else if (route === "/sales") {
    screen = <SalesScreen />;
  } else if (route === "/sales/new") {
    screen = <TradeScreen key="sale" kind="sale" />;
  } else if (route === "/collections") {
    screen = <CollectionsScreen />;
  } else if (route === "/customers") {
    screen = <CustomersScreen />;
  } else if (route === "/reports") {
    screen = <ReportsScreen />;
  } else if (route === "/more") {
    screen = <MoreScreen />;
  } else if (
    route === "/stock" ||
    route === "/purchases" ||
    route === "/purchases/new" ||
    route === "/suppliers" ||
    route === "/staff" ||
    route === "/money" ||
    route === "/settings"
  ) {
    if (!isAdmin) {
      screen = (
        <div className="dm-access-denied" role="alert">
          <ShieldAlert size={36} className="dm-text-rose" aria-hidden="true" />
          <h2>এই পেজে প্রবেশের অনুমতি নেই</h2>
          <p>শুধুমাত্র অ্যাডমিন এই মডিউলটি ব্যবহার করতে পারবেন।</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="dm-btn dm-btn-primary"
          >
            ড্যাশবোর্ডে ফিরুন
          </button>
        </div>
      );
    } else if (route === "/stock") {
      screen = <StockScreen />;
    } else if (route === "/purchases") {
      screen = <PurchasesScreen />;
    } else if (route === "/purchases/new") {
      screen = <TradeScreen key="purchase" kind="purchase" />;
    } else if (route === "/suppliers") {
      screen = <SuppliersScreen />;
    } else if (route === "/staff") {
      screen = <StaffScreen />;
    } else if (route === "/money") {
      screen = <CashBookScreen />;
    } else {
      screen = <SettingsScreen />;
    }
  } else {
    screen = <DashboardScreen />;
  }

  return (
    <AppShell>
      <Suspense fallback={<ScreenSkeleton />}>{screen}</Suspense>
    </AppShell>
  );
}

export default App;
