import {
  ArrowLeft,
  Boxes,
  Building2,
  Printer,
  Receipt,
  ShoppingCart,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ModalDialog } from "../components/ModalDialog";
import { useApp } from "../context/AppContext";
import {
  formatDateBn,
  formatMoneyBn,
  formatNumberBn,
  localDayKey,
  toBn,
} from "../lib/format";
import { navigate } from "../lib/router";
import type {
  CashLedgerEntry,
  Customer,
  DueCollection,
  InvoiceStatus,
  Product,
  PurchaseInvoice,
  SaleInvoice,
  StaffPerformance,
} from "../types";

type PeriodKey = "all" | "today" | "week" | "month";
type StaffReportTab = "invoices" | "collections";
type AdminReportKey =
  | "sales"
  | "collections"
  | "staff"
  | "receivables"
  | "stock"
  | "purchases_suppliers"
  | "expenses"
  | "pnl";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: "সব সময়",
  today: "আজ",
  week: "সপ্তাহ",
  month: "মাস",
};

function isInPeriod(iso: string, period: PeriodKey): boolean {
  if (period === "all") return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;
  if (period === "today") {
    return localDayKey(iso) === localDayKey(new Date().toISOString());
  }
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (period === "week" ? 6 : 29));
  return date >= cutoff;
}

function invoiceBadge(status: InvoiceStatus) {
  if (status === "paid") {
    return { label: "পরিশোধিত", cls: "dm-badge dm-badge-emerald" };
  }
  if (status === "partial") {
    return { label: "আংশিক", cls: "dm-badge dm-badge-amber" };
  }
  return { label: "বাকি", cls: "dm-badge dm-badge-rose" };
}

export function ReportsScreen() {
  const { user, data } = useApp();
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [staffTab, setStaffTab] = useState<StaffReportTab>("invoices");
  const [activeReport, setActiveReport] = useState<AdminReportKey | null>(null);

  const productMap = useMemo(
    () => new Map((data?.products ?? []).map((p) => [p.id, p])),
    [data?.products],
  );

  // Staff-scoped filtered datasets
  const staffFiltered = useMemo(() => {
    if (!data || !user) {
      return {
        invoices: [] as SaleInvoice[],
        collections: [] as DueCollection[],
        totalSales: 0,
        saleCash: 0,
        dueCollected: 0,
        totalDue: 0,
        totalCash: 0,
      };
    }
    const ownInvoices = data.invoices.filter(
      (inv) => inv.staffId === user.id && isInPeriod(inv.date, period),
    );
    const ownCollections = data.collections.filter(
      (col) => col.staffId === user.id && isInPeriod(col.date, period),
    );
    const totalSales = ownInvoices.reduce((s, i) => s + i.total, 0);
    const saleCash = ownInvoices.reduce((s, i) => s + i.initialPaid, 0);
    const dueCollected = ownCollections.reduce((s, c) => s + c.amount, 0);
    const totalDue = ownInvoices.reduce((s, i) => s + i.due, 0);
    return {
      invoices: ownInvoices,
      collections: ownCollections,
      totalSales,
      saleCash,
      dueCollected,
      totalDue,
      totalCash: saleCash + dueCollected,
    };
  }, [data, user, period]);

  // Admin-scoped filtered datasets & analytics
  const adminMetrics = useMemo(() => {
    if (!data) {
      return {
        filteredInvoices: [] as SaleInvoice[],
        filteredCollections: [] as DueCollection[],
        filteredPurchases: [] as PurchaseInvoice[],
        filteredExpenses: [] as CashLedgerEntry[],
        totalSales: 0,
        totalSaleCash: 0,
        totalDueCollected: 0,
        totalCashReceived: 0,
        totalCustomerDue: 0,
        totalExpenses: 0,
        totalPurchases: 0,
        totalPurchasePaid: 0,
        totalSupplierDue: 0,
        stockCostValue: 0,
        stockSaleValue: 0,
        lowOrOutProducts: [] as Product[],
        dueCustomers: [] as Customer[],
        staffRows: [] as Array<{
          member: StaffPerformance;
          salesCount: number;
          totalSales: number;
          saleCashReceived: number;
          dueCashCollected: number;
          totalCashReceived: number;
          outstandingDue: number;
          collectionRate: number;
        }>,
        cogs: 0,
        grossProfit: 0,
        netProfit: 0,
      };
    }

    const filteredInvoices = data.invoices.filter((i) =>
      isInPeriod(i.date, period),
    );
    const filteredCollections = data.collections.filter((c) =>
      isInPeriod(c.date, period),
    );
    const filteredPurchases = data.purchases.filter((p) =>
      isInPeriod(p.date, period),
    );
    const filteredExpenses = data.ledger.filter(
      (l) => l.kind === "expense" && isInPeriod(l.date, period),
    );

    const totalSales = filteredInvoices.reduce((s, i) => s + i.total, 0);
    const totalSaleCash = filteredInvoices.reduce(
      (s, i) => s + i.initialPaid,
      0,
    );
    const totalDueCollected = filteredCollections.reduce(
      (s, c) => s + c.amount,
      0,
    );
    const totalCashReceived = totalSaleCash + totalDueCollected;
    const totalCustomerDue = data.customers.reduce((s, c) => s + c.due, 0);
    const totalExpenses = filteredExpenses.reduce((s, l) => s + l.amount, 0);

    const totalPurchases = filteredPurchases.reduce((s, p) => s + p.total, 0);
    const totalPurchasePaid = filteredPurchases.reduce((s, p) => s + p.paid, 0);
    const totalSupplierDue = data.suppliers.reduce((s, sp) => s + sp.due, 0);

    const stockCostValue = data.products.reduce(
      (s, p) => s + Math.max(0, p.stock) * (p.purchaseRate ?? 0),
      0,
    );
    const stockSaleValue = data.products.reduce(
      (s, p) => s + Math.max(0, p.stock) * p.saleRate,
      0,
    );
    const lowOrOutProducts = data.products.filter(
      (p) => p.stock <= p.minStock,
    );

    const dueCustomers = [...data.customers]
      .filter((c) => c.due > 0)
      .sort((a, b) => b.due - a.due);

    const staffRows = [...data.staff]
      .sort((a, b) => {
        if (a.role === b.role) return 0;
        return a.role === "staff" ? -1 : 1;
      })
      .map((member) => {
        const mInvoices = filteredInvoices.filter(
          (inv) => inv.staffId === member.id,
        );
        const mCollections = filteredCollections.filter(
          (col) => col.staffId === member.id,
        );
        const salesCount = mInvoices.length;
        const mTotalSales = mInvoices.reduce((s, inv) => s + inv.total, 0);
        const mSaleCash = mInvoices.reduce((s, inv) => s + inv.initialPaid, 0);
        const mDueCollected = mCollections.reduce((s, col) => s + col.amount, 0);
        const mTotalCash = mSaleCash + mDueCollected;
        const mOutstandingDue = mInvoices.reduce((s, inv) => s + inv.due, 0);
        const collectionRate =
          mTotalSales > 0
            ? Math.min(100, Math.round((mTotalCash / mTotalSales) * 100))
            : mTotalCash > 0
              ? 100
              : 0;
        return {
          member,
          salesCount,
          totalSales: mTotalSales,
          saleCashReceived: mSaleCash,
          dueCashCollected: mDueCollected,
          totalCashReceived: mTotalCash,
          outstandingDue: mOutstandingDue,
          collectionRate,
        };
      });

    const cogs = filteredInvoices.reduce((sum, inv) => {
      const invCost = inv.items.reduce((itemSum, item) => {
        const unitCost =
          item.purchaseRate ?? productMap.get(item.productId)?.purchaseRate ?? 0;
        return itemSum + unitCost * item.qty;
      }, 0);
      return sum + invCost;
    }, 0);

    const grossProfit = totalSales - cogs;
    const netProfit = grossProfit - totalExpenses;

    return {
      filteredInvoices,
      filteredCollections,
      filteredPurchases,
      filteredExpenses,
      totalSales,
      totalSaleCash,
      totalDueCollected,
      totalCashReceived,
      totalCustomerDue,
      totalExpenses,
      totalPurchases,
      totalPurchasePaid,
      totalSupplierDue,
      stockCostValue,
      stockSaleValue,
      lowOrOutProducts,
      dueCustomers,
      staffRows,
      cogs,
      grossProfit,
      netProfit,
    };
  }, [data, period, productMap]);

  if (!data || !user) return null;

  const periodFilterBar = (
    <div className="dm-pills dm-pills-scroll" role="group" aria-label="সময়কাল">
      {(["all", "today", "week", "month"] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={period === key}
          onClick={() => setPeriod(key)}
          className={`dm-pill${period === key ? " is-active" : ""}`}
          style={{ minHeight: 44 }}
        >
          {PERIOD_LABELS[key]}
        </button>
      ))}
    </div>
  );

  // ────────────────────── STAFF VIEW ──────────────────────
  if (user.role === "staff") {
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
              <h1 className="dm-page-title">আমার পারফরম্যান্স রিপোর্ট</h1>
              <p className="dm-page-sub">
                {user.name} · আমার বিক্রি ও নগদ আদায় হিসাব
              </p>
            </div>
          </div>
          <div className="dm-page-actions">
            <button
              type="button"
              onClick={() => window.print()}
              className="dm-btn dm-btn-outline dm-btn-sm"
              style={{ minHeight: 44 }}
            >
              <Printer size={16} aria-hidden="true" />
              <span>প্রিন্ট</span>
            </button>
          </div>
        </div>

        {periodFilterBar}

        <div className="dm-kpi-grid-4">
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
              <ShoppingCart size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">আমার মোট বিক্রি</span>
              <span className="dm-kpi-value dm-text-blue">
                {formatMoneyBn(staffFiltered.totalSales)}
              </span>
              <span className="dm-kpi-sub">
                {toBn(staffFiltered.invoices.length)}টি চালান
              </span>
            </span>
          </div>

          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
              <Wallet size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">বিক্রি থেকে নগদ</span>
              <span className="dm-kpi-value dm-text-emerald">
                {formatMoneyBn(staffFiltered.saleCash)}
              </span>
            </span>
          </div>

          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-teal" aria-hidden="true">
              <TrendingUp size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">বাকি আদায়</span>
              <span className="dm-kpi-value dm-text-emerald">
                {formatMoneyBn(staffFiltered.dueCollected)}
              </span>
              <span className="dm-kpi-sub">
                {toBn(staffFiltered.collections.length)}টি রসিদ
              </span>
            </span>
          </div>

          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-rose" aria-hidden="true">
              <Receipt size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">বিক্রির বাকি</span>
              <span className="dm-kpi-value dm-text-rose">
                {formatMoneyBn(staffFiltered.totalDue)}
              </span>
            </span>
          </div>
        </div>

        {/* Highlight Banner */}
        <div
          className="dm-card"
          style={{
            background: "var(--dm-brand-50)",
            borderColor: "var(--dm-brand-200)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <strong
              className="dm-text-emerald"
              style={{ display: "block", fontSize: 16 }}
            >
              আমার মোট নগদ প্রাপ্তি ({PERIOD_LABELS[period]})
            </strong>
            <small className="dm-text-muted">
              বিক্রি থেকে নগদ ({formatMoneyBn(staffFiltered.saleCash)}) + বাকি
              আদায় ({formatMoneyBn(staffFiltered.dueCollected)})
            </small>
          </div>
          <strong
            className="dm-text-emerald"
            style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}
          >
            {formatMoneyBn(staffFiltered.totalCash)}
          </strong>
        </div>

        {/* Staff Tabs */}
        <div
          className="dm-tabs"
          role="tablist"
          aria-label="আমার লেনদেনের ইতিহাস"
        >
          <button
            type="button"
            role="tab"
            aria-selected={staffTab === "invoices"}
            onClick={() => setStaffTab("invoices")}
            className={`dm-tab${staffTab === "invoices" ? " is-active" : ""}`}
          >
            আমার বিক্রির ইতিহাস ({toBn(staffFiltered.invoices.length)})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={staffTab === "collections"}
            onClick={() => setStaffTab("collections")}
            className={`dm-tab${staffTab === "collections" ? " is-active" : ""}`}
          >
            আমার বাকি আদায়ের ইতিহাস ({toBn(staffFiltered.collections.length)})
          </button>
        </div>

        {staffTab === "invoices" ? (
          <div
            tabIndex={0}
            role="region"
            aria-label="আমার বিক্রির ইতিহাস"
            className="dm-table-wrap"
          >
            <table className="dm-table">
              <thead>
                <tr>
                  <th>চালান</th>
                  <th>তারিখ</th>
                  <th>কাস্টমার</th>
                  <th>মোট বিল</th>
                  <th>বিক্রি নগদ</th>
                  <th>বাকি</th>
                  <th>অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {staffFiltered.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="dm-empty-inline">
                      নির্বাচিত সময়ে কোনো বিক্রয় চালান নেই
                    </td>
                  </tr>
                ) : (
                  staffFiltered.invoices.map((inv) => {
                    const badge = invoiceBadge(inv.status);
                    return (
                      <tr key={inv.id}>
                        <td>
                          <strong className="dm-text-emerald">
                            {inv.number}
                          </strong>
                        </td>
                        <td className="dm-text-muted">
                          {formatDateBn(inv.date)}
                        </td>
                        <td>
                          <strong style={{ display: "block" }}>
                            {inv.customerName}
                          </strong>
                          {inv.customerMobile && (
                            <small className="dm-text-muted">
                              {inv.customerMobile}
                            </small>
                          )}
                        </td>
                        <td>
                          <strong>{formatMoneyBn(inv.total)}</strong>
                        </td>
                        <td className="dm-text-emerald" style={{ fontWeight: 700 }}>
                          {formatMoneyBn(inv.initialPaid)}
                        </td>
                        <td
                          className={
                            inv.due > 0 ? "dm-text-rose" : "dm-text-muted"
                          }
                          style={{ fontWeight: 700 }}
                        >
                          {formatMoneyBn(inv.due)}
                        </td>
                        <td>
                          <span className={badge.cls}>{badge.label}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-label="আমার বাকি আদায়ের ইতিহাস"
            className="dm-table-wrap"
          >
            <table className="dm-table">
              <thead>
                <tr>
                  <th>রসিদ</th>
                  <th>তারিখ</th>
                  <th>কাস্টমার</th>
                  <th>চালান</th>
                  <th>নগদ আদায়</th>
                  <th>নোট</th>
                </tr>
              </thead>
              <tbody>
                {staffFiltered.collections.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="dm-empty-inline">
                      নির্বাচিত সময়ে কোনো বাকি আদায় নেই
                    </td>
                  </tr>
                ) : (
                  staffFiltered.collections.map((col) => (
                    <tr key={col.id}>
                      <td>
                        <strong className="dm-text-blue">
                          {col.receiptNo}
                        </strong>
                      </td>
                      <td className="dm-text-muted">
                        {formatDateBn(col.date)}
                      </td>
                      <td>
                        <strong style={{ display: "block" }}>
                          {col.customerName}
                        </strong>
                        <small className="dm-text-muted">
                          {col.customerMobile}
                        </small>
                      </td>
                      <td>{col.invoiceNumber ?? "সাধারণ বকেয়া"}</td>
                      <td className="dm-text-emerald" style={{ fontWeight: 700 }}>
                        {formatMoneyBn(col.amount)}
                      </td>
                      <td className="dm-text-muted">{col.note ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ────────────────────── ADMIN VIEW ──────────────────────
  const reportTiles: {
    key: AdminReportKey;
    label: string;
    tone: string;
    icon: typeof ShoppingCart;
  }[] = [
    {
      key: "sales",
      label: "বিক্রয় রিপোর্ট",
      tone: "dm-tone-emerald",
      icon: ShoppingCart,
    },
    {
      key: "collections",
      label: "বাকি আদায় রিপোর্ট",
      tone: "dm-tone-teal",
      icon: Wallet,
    },
    {
      key: "staff",
      label: "স্টাফ পারফরম্যান্স",
      tone: "dm-tone-blue",
      icon: UserCheck,
    },
    {
      key: "receivables",
      label: "বাকি ও পাওনা",
      tone: "dm-tone-rose",
      icon: Users,
    },
    {
      key: "stock",
      label: "স্টক রিপোর্ট",
      tone: "dm-tone-amber",
      icon: Boxes,
    },
    {
      key: "purchases_suppliers",
      label: "ক্রয় ও সাপ্লায়ার",
      tone: "dm-tone-purple",
      icon: Building2,
    },
    {
      key: "expenses",
      label: "খরচের রিপোর্ট",
      tone: "dm-tone-orange",
      icon: Receipt,
    },
    {
      key: "pnl",
      label: "লাভ-ক্ষতি (P&L)",
      tone: "dm-tone-indigo",
      icon: TrendingUp,
    },
  ];

  const activeTitle =
    reportTiles.find((t) => t.key === activeReport)?.label ?? "রিপোর্ট বিস্তারিত";

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
            <h1 className="dm-page-title">ব্যবসা ও স্টাফ রিপোর্ট</h1>
            <p className="dm-page-sub">
              বিক্রি, নগদ আদায়, স্টাফ তুলনা ও লাভ-ক্ষতি বিশ্লেষণ
            </p>
          </div>
        </div>
        <div className="dm-page-actions">
          <button
            type="button"
            onClick={() => window.print()}
            className="dm-btn dm-btn-outline dm-btn-sm"
            style={{ minHeight: 44 }}
          >
            <Printer size={16} aria-hidden="true" />
            <span>প্রিন্ট</span>
          </button>
        </div>
      </div>

      {periodFilterBar}

      {/* 4 Admin Summary KPI Cards */}
      <div className="dm-kpi-grid-4">
        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
            <ShoppingCart size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট বিক্রি</span>
            <span className="dm-kpi-value dm-text-blue">
              {formatMoneyBn(adminMetrics.totalSales)}
            </span>
            <span className="dm-kpi-sub">
              {toBn(adminMetrics.filteredInvoices.length)}টি চালান
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
            <Wallet size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট নগদ প্রাপ্তি</span>
            <span className="dm-kpi-value dm-text-emerald">
              {formatMoneyBn(adminMetrics.totalCashReceived)}
            </span>
            <span className="dm-kpi-sub">
              বিক্রি নগদ + বাকি আদায়
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-rose" aria-hidden="true">
            <Users size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট বাকি পাওনা</span>
            <span className="dm-kpi-value dm-text-rose">
              {formatMoneyBn(adminMetrics.totalCustomerDue)}
            </span>
            <span className="dm-kpi-sub">
              {toBn(adminMetrics.dueCustomers.length)}জন কাস্টমার
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-amber" aria-hidden="true">
            <Receipt size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট খরচ</span>
            <span className="dm-kpi-value dm-text-amber">
              {formatMoneyBn(adminMetrics.totalExpenses)}
            </span>
            <span className="dm-kpi-sub">
              {toBn(adminMetrics.filteredExpenses.length)}টি এন্ট্রি
            </span>
          </span>
        </div>
      </div>

      {/* Directly Visible Staff Performance Comparison Card */}
      <div className="dm-card dm-stack-sm">
        <div className="dm-card-head" style={{ marginBottom: 4 }}>
          <div>
            <h2 className="dm-card-title">
              স্টাফ-ভিত্তিক বিক্রয় ও নগদ পারফরম্যান্স
            </h2>
            <p className="dm-page-sub">
              সময়কাল: {PERIOD_LABELS[period]} · বিক্রি, নগদ ও বাকি আদায় তুলনা
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/staff")}
            className="dm-section-link"
          >
            স্টাফ ম্যানেজমেন্ট →
          </button>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label="স্টাফ-ভিত্তিক বিক্রয় ও নগদ পারফরম্যান্স"
          className="dm-table-wrap"
        >
          <table className="dm-table">
            <thead>
              <tr>
                <th>স্টাফ</th>
                <th>বিক্রির সংখ্যা</th>
                <th>মোট বিক্রি</th>
                <th>নগদ প্রাপ্তি</th>
                <th>বাকি আদায়</th>
                <th>বাকি পাওনা</th>
                <th>নগদ আদায় হার</th>
              </tr>
            </thead>
            <tbody>
              {adminMetrics.staffRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="dm-empty-inline">
                    কোনো স্টাফ তথ্য পাওয়া যায়নি
                  </td>
                </tr>
              ) : (
                adminMetrics.staffRows.map((row) => {
                  const barTone =
                    row.collectionRate >= 70
                      ? ""
                      : row.collectionRate >= 40
                        ? " is-amber"
                        : " is-rose";
                  return (
                    <tr key={row.member.id}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <strong>{row.member.name}</strong>
                          <span
                            className={`dm-badge ${
                              row.member.role === "admin"
                                ? "dm-badge-amber"
                                : "dm-badge-blue"
                            }`}
                          >
                            {row.member.role === "admin"
                              ? "অ্যাডমিন"
                              : "স্টাফ"}
                          </span>
                        </div>
                        <small className="dm-text-muted">
                          {row.member.phone}
                        </small>
                      </td>
                      <td>{toBn(row.salesCount)}টি</td>
                      <td>
                        <strong>{formatMoneyBn(row.totalSales)}</strong>
                      </td>
                      <td className="dm-text-emerald" style={{ fontWeight: 700 }}>
                        {formatMoneyBn(row.totalCashReceived)}
                      </td>
                      <td className="dm-text-blue" style={{ fontWeight: 700 }}>
                        {formatMoneyBn(row.dueCashCollected)}
                      </td>
                      <td
                        className={
                          row.outstandingDue > 0
                            ? "dm-text-rose"
                            : "dm-text-muted"
                        }
                        style={{ fontWeight: 700 }}
                      >
                        {formatMoneyBn(row.outstandingDue)}
                      </td>
                      <td style={{ minWidth: 130 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            marginBottom: 4,
                            fontSize: 12.5,
                            fontWeight: 700,
                          }}
                        >
                          <span>{toBn(row.collectionRate)}%</span>
                        </div>
                        <div className="dm-progress-track">
                          <div
                            className={`dm-progress-fill${barTone}`}
                            style={{ width: `${row.collectionRate}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 8 Report Cards Grid */}
      <div>
        <div className="dm-section-head" style={{ marginTop: 4 }}>
          <h2>বিস্তারিত রিপোর্ট</h2>
        </div>
        <div className="dm-tiles-grid">
          {reportTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() => setActiveReport(tile.key)}
                className="dm-module-tile"
              >
                <span
                  className={`dm-action-icon ${tile.tone}`}
                  aria-hidden="true"
                >
                  <Icon size={21} />
                </span>
                <strong>{tile.label}</strong>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Report Modal */}
      <ModalDialog
        open={Boolean(activeReport)}
        onClose={() => setActiveReport(null)}
        title={activeTitle}
        subtitle={`${data.store.name} · সময়কাল: ${PERIOD_LABELS[period]}`}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => window.print()}
              className="dm-btn dm-btn-outline"
            >
              <Printer size={16} aria-hidden="true" />
              <span>প্রিন্ট</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveReport(null)}
              className="dm-btn dm-btn-primary"
            >
              বন্ধ করুন
            </button>
          </>
        }
      >
        {activeReport === "sales" && (
          <div className="dm-stack-sm">
            <div className="dm-feed-item">
              <span>
                মোট বিক্রয় ({toBn(adminMetrics.filteredInvoices.length)}টি চালান)
              </span>
              <strong className="dm-text-emerald">
                {formatMoneyBn(adminMetrics.totalSales)}
              </strong>
            </div>
            <div
              tabIndex={0}
              role="region"
              aria-label="বিক্রয় রিপোর্ট তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>চালান</th>
                    <th>তারিখ</th>
                    <th>কাস্টমার</th>
                    <th>স্টাফ</th>
                    <th>মোট বিল</th>
                    <th>বিক্রি নগদ</th>
                    <th>বাকি</th>
                  </tr>
                </thead>
                <tbody>
                  {adminMetrics.filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="dm-empty-inline">
                        নির্বাচিত সময়ে কোনো বিক্রয় চালান নেই
                      </td>
                    </tr>
                  ) : (
                    adminMetrics.filteredInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <strong className="dm-text-emerald">
                            {inv.number}
                          </strong>
                        </td>
                        <td className="dm-text-muted">
                          {formatDateBn(inv.date)}
                        </td>
                        <td>{inv.customerName}</td>
                        <td>{inv.staffName}</td>
                        <td>
                          <strong>{formatMoneyBn(inv.total)}</strong>
                        </td>
                        <td className="dm-text-emerald">
                          {formatMoneyBn(inv.initialPaid)}
                        </td>
                        <td
                          className={
                            inv.due > 0 ? "dm-text-rose" : "dm-text-muted"
                          }
                        >
                          {formatMoneyBn(inv.due)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeReport === "collections" && (
          <div className="dm-stack-sm">
            <div className="dm-feed-item">
              <span>
                মোট বাকি আদায় ({toBn(adminMetrics.filteredCollections.length)}টি
                রসিদ)
              </span>
              <strong className="dm-text-emerald">
                {formatMoneyBn(adminMetrics.totalDueCollected)}
              </strong>
            </div>
            <div
              tabIndex={0}
              role="region"
              aria-label="বাকি আদায় রিপোর্ট তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>রসিদ</th>
                    <th>তারিখ</th>
                    <th>কাস্টমার</th>
                    <th>স্টাফ</th>
                    <th>চালান</th>
                    <th>নগদ আদায়</th>
                  </tr>
                </thead>
                <tbody>
                  {adminMetrics.filteredCollections.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="dm-empty-inline">
                        নির্বাচিত সময়ে কোনো বাকি আদায় নেই
                      </td>
                    </tr>
                  ) : (
                    adminMetrics.filteredCollections.map((col) => (
                      <tr key={col.id}>
                        <td>
                          <strong className="dm-text-blue">
                            {col.receiptNo}
                          </strong>
                        </td>
                        <td className="dm-text-muted">
                          {formatDateBn(col.date)}
                        </td>
                        <td>{col.customerName}</td>
                        <td>{col.staffName}</td>
                        <td>{col.invoiceNumber ?? "সাধারণ বকেয়া"}</td>
                        <td className="dm-text-emerald" style={{ fontWeight: 700 }}>
                          {formatMoneyBn(col.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeReport === "staff" && (
          <div
            tabIndex={0}
            role="region"
            aria-label="স্টাফ পারফরম্যান্স বিস্তারিত"
            className="dm-table-wrap"
          >
            <table className="dm-table">
              <thead>
                <tr>
                  <th>স্টাফ</th>
                  <th>বিক্রি সংখ্যা</th>
                  <th>মোট বিক্রি</th>
                  <th>বিক্রি নগদ</th>
                  <th>বাকি আদায়</th>
                  <th>মোট নগদ প্রাপ্তি</th>
                  <th>বাকি পাওনা</th>
                </tr>
              </thead>
              <tbody>
                {adminMetrics.staffRows.map((row) => (
                  <tr key={row.member.id}>
                    <td>
                      <strong style={{ display: "block" }}>
                        {row.member.name}
                      </strong>
                      <small className="dm-text-muted">
                        {row.member.role === "admin" ? "অ্যাডমিন" : "স্টাফ"} ·{" "}
                        {row.member.phone}
                      </small>
                    </td>
                    <td>{toBn(row.salesCount)}টি</td>
                    <td>
                      <strong>{formatMoneyBn(row.totalSales)}</strong>
                    </td>
                    <td>{formatMoneyBn(row.saleCashReceived)}</td>
                    <td className="dm-text-blue">
                      {formatMoneyBn(row.dueCashCollected)}
                    </td>
                    <td className="dm-text-emerald" style={{ fontWeight: 800 }}>
                      {formatMoneyBn(row.totalCashReceived)}
                    </td>
                    <td
                      className={
                        row.outstandingDue > 0
                          ? "dm-text-rose"
                          : "dm-text-muted"
                      }
                      style={{ fontWeight: 700 }}
                    >
                      {formatMoneyBn(row.outstandingDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeReport === "receivables" && (
          <div className="dm-stack-sm">
            <div className="dm-feed-item">
              <span>
                বকেয়া থাকা কাস্টমার ({toBn(adminMetrics.dueCustomers.length)}জন)
              </span>
              <strong className="dm-text-rose">
                {formatMoneyBn(adminMetrics.totalCustomerDue)}
              </strong>
            </div>
            <div
              tabIndex={0}
              role="region"
              aria-label="কাস্টমার বাকি ও পাওনা তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>কাস্টমার</th>
                    <th>মোবাইল</th>
                    <th>এলাকা</th>
                    <th>পাওনা</th>
                  </tr>
                </thead>
                <tbody>
                  {adminMetrics.dueCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="dm-empty-inline">
                        কোনো কাস্টমারের কাছে বকেয়া নেই
                      </td>
                    </tr>
                  ) : (
                    adminMetrics.dueCustomers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td>{c.mobile}</td>
                        <td className="dm-text-muted">{c.area}</td>
                        <td className="dm-text-rose" style={{ fontWeight: 700 }}>
                          {formatMoneyBn(c.due)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeReport === "stock" && (
          <div className="dm-stack-sm">
            <div className="dm-feed-list">
              <div className="dm-feed-item">
                <span>মোট পণ্য সংখ্যা</span>
                <strong>{formatNumberBn(data.products.length)}টি</strong>
              </div>
              <div className="dm-feed-item">
                <span>ক্রয় মূল্য অনুযায়ী বর্তমান স্টক মূল্য</span>
                <strong>{formatMoneyBn(adminMetrics.stockCostValue)}</strong>
              </div>
              <div className="dm-feed-item">
                <span>বিক্রয় মূল্য অনুযায়ী সম্ভাব্য বিক্রি</span>
                <strong className="dm-text-emerald">
                  {formatMoneyBn(adminMetrics.stockSaleValue)}
                </strong>
              </div>
            </div>

            <div className="dm-section-head" style={{ margin: "6px 0 2px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>
                কম স্টক ও স্টক শেষ পণ্য ({toBn(adminMetrics.lowOrOutProducts.length)}টি)
              </h3>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-label="কম স্টক ও স্টক শেষ পণ্যের তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>পণ্য</th>
                    <th>ক্যাটাগরি</th>
                    <th>বর্তমান স্টক</th>
                    <th>সর্বনিম্ন স্টক</th>
                    <th>অবস্থা</th>
                  </tr>
                </thead>
                <tbody>
                  {adminMetrics.lowOrOutProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="dm-empty-inline">
                        সব পণ্যের পর্যাপ্ত স্টক আছে
                      </td>
                    </tr>
                  ) : (
                    adminMetrics.lowOrOutProducts.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong style={{ display: "block" }}>{p.name}</strong>
                          <small className="dm-text-muted">{p.sku}</small>
                        </td>
                        <td>{p.category}</td>
                        <td
                          className={
                            p.stock <= 0 ? "dm-text-rose" : "dm-text-amber"
                          }
                          style={{ fontWeight: 700 }}
                        >
                          {toBn(p.stock)} {p.unit}
                        </td>
                        <td>
                          {toBn(p.minStock)} {p.unit}
                        </td>
                        <td>
                          <span
                            className={`dm-badge ${
                              p.stock <= 0 ? "dm-badge-rose" : "dm-badge-amber"
                            }`}
                          >
                            {p.stock <= 0 ? "স্টক শেষ" : "কম স্টক"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeReport === "purchases_suppliers" && (
          <div className="dm-stack-md">
            <div className="dm-feed-list">
              <div className="dm-feed-item">
                <span>
                  নির্বাচিত সময়ে মোট ক্রয় ({toBn(adminMetrics.filteredPurchases.length)}টি)
                </span>
                <strong>{formatMoneyBn(adminMetrics.totalPurchases)}</strong>
              </div>
              <div className="dm-feed-item">
                <span>ক্রয়ের নগদ পরিশোধ</span>
                <strong className="dm-text-emerald">
                  {formatMoneyBn(adminMetrics.totalPurchasePaid)}
                </strong>
              </div>
              <div className="dm-feed-item">
                <span>মোট সাপ্লায়ার দেনা (বর্তমান)</span>
                <strong className="dm-text-rose">
                  {formatMoneyBn(adminMetrics.totalSupplierDue)}
                </strong>
              </div>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-label="ক্রয় চালানের তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>ক্রয় নং</th>
                    <th>তারিখ</th>
                    <th>সাপ্লায়ার</th>
                    <th>মোট বিল</th>
                    <th>পরিশোধ</th>
                    <th>দেনা</th>
                  </tr>
                </thead>
                <tbody>
                  {adminMetrics.filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="dm-empty-inline">
                        নির্বাচিত সময়ে কোনো ক্রয় রেকর্ড নেই
                      </td>
                    </tr>
                  ) : (
                    adminMetrics.filteredPurchases.map((pur) => (
                      <tr key={pur.id}>
                        <td>
                          <strong className="dm-text-blue">{pur.number}</strong>
                        </td>
                        <td className="dm-text-muted">
                          {formatDateBn(pur.date)}
                        </td>
                        <td>{pur.supplierName}</td>
                        <td>{formatMoneyBn(pur.total)}</td>
                        <td className="dm-text-emerald">
                          {formatMoneyBn(pur.paid)}
                        </td>
                        <td
                          className={
                            pur.due > 0 ? "dm-text-rose" : "dm-text-muted"
                          }
                        >
                          {formatMoneyBn(pur.due)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-label="সাপ্লায়ার বকেয়া তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>সাপ্লায়ার</th>
                    <th>মোবাইল</th>
                    <th>এলাকা</th>
                    <th>দেনা</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suppliers.map((sup) => (
                    <tr key={sup.id}>
                      <td>
                        <strong>{sup.name}</strong>
                      </td>
                      <td>{sup.mobile}</td>
                      <td className="dm-text-muted">{sup.area}</td>
                      <td
                        className={
                          sup.due > 0 ? "dm-text-rose" : "dm-text-emerald"
                        }
                        style={{ fontWeight: 700 }}
                      >
                        {formatMoneyBn(sup.due)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeReport === "expenses" && (
          <div className="dm-stack-sm">
            <div className="dm-feed-item">
              <span>
                নির্বাচিত সময়ের মোট খরচ ({toBn(adminMetrics.filteredExpenses.length)}টি)
              </span>
              <strong className="dm-text-rose">
                − {formatMoneyBn(adminMetrics.totalExpenses)}
              </strong>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-label="খরচের তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>তারিখ</th>
                    <th>খাত / বিবরণ</th>
                    <th>নোট</th>
                    <th>পরিমাণ</th>
                  </tr>
                </thead>
                <tbody>
                  {adminMetrics.filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="dm-empty-inline">
                        নির্বাচিত সময়ে কোনো খরচ এন্ট্রি নেই
                      </td>
                    </tr>
                  ) : (
                    adminMetrics.filteredExpenses.map((exp) => (
                      <tr key={exp.id}>
                        <td className="dm-text-muted">
                          {formatDateBn(exp.date)}
                        </td>
                        <td>
                          <strong>{exp.party}</strong>
                        </td>
                        <td className="dm-text-muted">{exp.note ?? "—"}</td>
                        <td className="dm-text-rose" style={{ fontWeight: 700 }}>
                          − {formatMoneyBn(exp.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeReport === "pnl" && (
          <div className="dm-stack-sm">
            <div className="dm-feed-list">
              <div className="dm-feed-item">
                <span>বিক্রয় আয় (Sales Revenue)</span>
                <strong>{formatMoneyBn(adminMetrics.totalSales)}</strong>
              </div>
              <div className="dm-feed-item">
                <span>বিক্রিত পণ্যের ক্রয় মূল্য (COGS)</span>
                <strong className="dm-text-rose">
                  − {formatMoneyBn(adminMetrics.cogs)}
                </strong>
              </div>
              <div className="dm-feed-item">
                <strong>মোট গ্রস লাভ (Gross Profit)</strong>
                <strong
                  className={
                    adminMetrics.grossProfit >= 0
                      ? "dm-text-emerald"
                      : "dm-text-rose"
                  }
                >
                  {formatMoneyBn(adminMetrics.grossProfit)}
                </strong>
              </div>
              <div className="dm-feed-item">
                <span>পরিচালনা ও দোকান খরচ</span>
                <strong className="dm-text-rose">
                  − {formatMoneyBn(adminMetrics.totalExpenses)}
                </strong>
              </div>
              <div
                className="dm-feed-item"
                style={{
                  background:
                    adminMetrics.netProfit >= 0
                      ? "var(--dm-brand-50)"
                      : "var(--dm-rose-50)",
                  borderColor:
                    adminMetrics.netProfit >= 0
                      ? "var(--dm-brand-200)"
                      : "var(--dm-rose-200)",
                }}
              >
                <strong style={{ fontSize: 15 }}>
                  নিট {adminMetrics.netProfit >= 0 ? "লাভ" : "ক্ষতি"} (Net P&amp;L)
                </strong>
                <strong
                  className={
                    adminMetrics.netProfit >= 0
                      ? "dm-text-emerald"
                      : "dm-text-rose"
                  }
                  style={{ fontSize: 18 }}
                >
                  {formatMoneyBn(adminMetrics.netProfit)}
                </strong>
              </div>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
