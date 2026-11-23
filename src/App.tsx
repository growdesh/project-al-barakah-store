import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { useApp } from "./context/AppContext";
import { normalizePath, useRouter } from "./lib/router";
import { CashBookScreen } from "./screens/CashBookScreen";
import { CollectionsScreen } from "./screens/CollectionsScreen";
import { CustomersScreen } from "./screens/CustomersScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { LoginScreen } from "./screens/LoginScreen";
import {
  PurchasesScreen,
  SuppliersScreen,
} from "./screens/PurchasesSuppliersScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { SalesScreen } from "./screens/SalesScreen";
import { MoreScreen, SettingsScreen } from "./screens/SettingsMoreScreens";
import { StaffScreen } from "./screens/StaffScreen";
import { StockScreen } from "./screens/StockScreen";
import { TradeScreen } from "./screens/TradeScreen";

export function App() {
  const { loading, user, data } = useApp();
  const { path, navigate } = useRouter();

  if (loading) {
    return (
      <div className="dm-login-page">
        <div
          className="dm-card"
          role="status"
          aria-live="polite"
          style={{ textAlign: "center", minWidth: 260 }}
        >
          লোড হচ্ছে…
        </div>
      </div>
    );
  }

  if (!user || !data) {
    return <LoginScreen />;
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

  return <AppShell>{screen}</AppShell>;
}

export default App;
