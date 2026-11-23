import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  HandCoins,
  Package,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import {
  formatDateBn,
  formatMoneyBn,
  getGreetingBn,
  localDayKey,
  toBn,
} from "../lib/format";
import { navigate } from "../lib/router";
import type { SaleInvoice } from "../types";

interface SalesTrendChartProps {
  title: string;
  subtitle: string;
  invoices: SaleInvoice[];
}

function SalesTrendChart({ title, subtitle, invoices }: SalesTrendChartProps) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [activePointIdx, setActivePointIdx] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const weekdaysBn = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];
    const byDay = new Map<string, number>();
    const countByDay = new Map<string, number>();

    for (const inv of invoices) {
      const k = localDayKey(inv.date);
      byDay.set(k, (byDay.get(k) ?? 0) + inv.total);
      countByDay.set(k, (countByDay.get(k) ?? 0) + 1);
    }

    const anchor = new Date();
    const weekPoints = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() - (6 - idx));
      const key = localDayKey(d.toISOString());
      return {
        label: weekdaysBn[d.getDay()],
        fullLabel: formatDateBn(d.toISOString()),
        value: byDay.get(key) ?? 0,
        count: countByDay.get(key) ?? 0,
      };
    });

    const monthPoints = [0, 1, 2, 3].map((bucket) => {
      let sum = 0;
      let count = 0;
      const endOffset = (3 - bucket) * 7;
      const startOffset = endOffset + 6;
      for (let back = startOffset; back >= endOffset; back--) {
        const d = new Date(anchor);
        d.setDate(anchor.getDate() - back);
        const key = localDayKey(d.toISOString());
        sum += byDay.get(key) ?? 0;
        count += countByDay.get(key) ?? 0;
      }
      return {
        label: `সপ্তাহ ${toBn(bucket + 1)}`,
        fullLabel: `সপ্তাহ ${toBn(bucket + 1)} (৭ দিন)`,
        value: sum,
        count,
      };
    });

    const series = period === "week" ? weekPoints : monthPoints;
    const periodTotal = series.reduce((sum, p) => sum + p.value, 0);
    const invoiceCount = series.reduce((sum, p) => sum + p.count, 0);
    const dailyAvg = Math.round(periodTotal / (period === "week" ? 7 : 28));

    const rawMax = Math.max(...series.map((s) => s.value), 0);
    const maxVal = rawMax > 0 ? Math.ceil(rawMax / 1000) * 1000 : 1000;

    const width = 640;
    const height = 196;
    const padX = 88;
    const padY = 28;

    const points = series.map((item, i) => {
      const x =
        padX + (i * (width - padX - 24)) / Math.max(1, series.length - 1);
      const y = height - padY - (item.value / maxVal) * (height - padY * 2);
      return { ...item, x, y };
    });

    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }

    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

    return {
      points,
      linePath,
      areaPath,
      width,
      height,
      padX,
      padY,
      maxVal,
      periodTotal,
      dailyAvg,
      invoiceCount,
    };
  }, [period, invoices]);

  const activePoint =
    activePointIdx !== null && chartData.points[activePointIdx]
      ? chartData.points[activePointIdx]
      : null;

  return (
    <div className="dm-card">
      <div className="dm-card-head">
        <div>
          <h2 className="dm-card-title">{title}</h2>
          <p className="dm-page-sub">{subtitle}</p>
        </div>
        <select
          aria-label={`${title} সময়কাল`}
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as "week" | "month");
            setActivePointIdx(null);
          }}
          className="dm-select"
          style={{ width: "auto", minWidth: 128 }}
        >
          <option value="week">এই সপ্তাহ</option>
          <option value="month">এই মাস</option>
        </select>
      </div>

      <div className="dm-chart-wrap">
        <svg
          viewBox={`0 0 ${chartData.width} ${chartData.height}`}
          className="dm-chart-svg"
          role="img"
          aria-label={`${title} চার্ট`}
        >
          <defs>
            <linearGradient id="abSalesTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.33, 0.66, 1].map((ratio, idx) => {
            const y =
              chartData.padY + ratio * (chartData.height - chartData.padY * 2);
            return (
              <line
                key={idx}
                x1={chartData.padX - 6}
                y1={y}
                x2={chartData.width - 14}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}

          <text
            x={chartData.padX - 10}
            y={chartData.padY + 4}
            textAnchor="end"
            fill="#475569"
            fontSize="11.5"
            fontWeight="700"
          >
            {formatMoneyBn(chartData.maxVal)}
          </text>
          <text
            x={chartData.padX - 10}
            y={chartData.height / 2 + 4}
            textAnchor="end"
            fill="#475569"
            fontSize="11.5"
            fontWeight="700"
          >
            {formatMoneyBn(Math.round(chartData.maxVal / 2))}
          </text>
          <text
            x={chartData.padX - 10}
            y={chartData.height - chartData.padY + 4}
            textAnchor="end"
            fill="#475569"
            fontSize="11.5"
            fontWeight="700"
          >
            ৳ ০
          </text>

          <path d={chartData.areaPath} fill="url(#abSalesTrendGrad)" />

          {activePoint && (
            <line
              x1={activePoint.x}
              y1={chartData.padY}
              x2={activePoint.x}
              y2={chartData.height - chartData.padY}
              stroke="#0f172a"
              strokeOpacity="0.3"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          )}

          <path
            d={chartData.linePath}
            fill="none"
            stroke="#059669"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {chartData.points.map((pt, idx) => {
            const isHovered = activePointIdx === idx;
            const tipX = Math.min(
              chartData.width - 118,
              Math.max(chartData.padX, pt.x - 56),
            );
            const tipY = Math.max(4, pt.y - 34);

            return (
              <g
                key={pt.label}
                onMouseEnter={() => setActivePointIdx(idx)}
                onMouseLeave={() => setActivePointIdx(null)}
                onClick={() =>
                  setActivePointIdx((cur) => (cur === idx ? null : idx))
                }
                style={{ cursor: "pointer" }}
              >
                <circle cx={pt.x} cy={pt.y} r={18} fill="transparent" />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6.5 : 4.2}
                  fill="#ffffff"
                  stroke="#059669"
                  strokeWidth={isHovered ? 3.2 : 2.5}
                />
                {isHovered && (
                  <g>
                    <rect
                      x={tipX}
                      y={tipY}
                      width={112}
                      height={25}
                      rx={8}
                      fill="#0f172a"
                    />
                    <text
                      x={tipX + 56}
                      y={tipY + 16.5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="11.5"
                      fontWeight="700"
                    >
                      {formatMoneyBn(pt.value)}
                    </text>
                  </g>
                )}
                <text
                  x={pt.x}
                  y={chartData.height - 5}
                  textAnchor="middle"
                  fill={isHovered ? "#0f172a" : "#64748b"}
                  fontSize="11.5"
                  fontWeight="700"
                >
                  {pt.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {activePoint && (
        <div className="dm-chart-tooltip">
          <span>{activePoint.fullLabel}:</span>
          <span>{formatMoneyBn(activePoint.value)}</span>
          <span>({toBn(activePoint.count)}টি ইনভয়েস)</span>
        </div>
      )}

      <div className="dm-chart-stats">
        <span>
          {period === "week" ? "সপ্তাহের মোট:" : "মাসের মোট:"}{" "}
          <strong>{formatMoneyBn(chartData.periodTotal)}</strong>
        </span>
        <span>
          দৈনিক গড়: <strong>{formatMoneyBn(chartData.dailyAvg)}</strong>
        </span>
        <span>
          মোট ইনভয়েস: <strong>{toBn(chartData.invoiceCount)}টি</strong>
        </span>
      </div>
    </div>
  );
}

export function DashboardScreen() {
  const { data, user } = useApp();

  const todayIso = useMemo(() => new Date().toISOString(), []);
  const todayKey = useMemo(() => localDayKey(todayIso), [todayIso]);

  const adminStats = useMemo(() => {
    if (!data) {
      return {
        totalSales: 0,
        totalCashReceived: 0,
        totalDue: 0,
        dueCustomerCount: 0,
        lowStockCount: 0,
        staffOnlyCount: 0,
        activeStaffCount: 0,
        todaySales: 0,
        todayCash: 0,
        rankedStaff: [],
        topStaffSales: 1,
      };
    }

    const totalSales = data.invoices.reduce((sum, inv) => sum + inv.total, 0);
    const saleCash = data.invoices.reduce(
      (sum, inv) => sum + inv.initialPaid,
      0,
    );
    const collectionCash = data.collections.reduce(
      (sum, col) => sum + col.amount,
      0,
    );
    const totalCashReceived = saleCash + collectionCash;

    const totalDue = data.customers.reduce((sum, c) => sum + c.due, 0);
    const dueCustomerCount = data.customers.filter((c) => c.due > 0).length;
    const lowStockCount = data.products.filter(
      (p) => p.stock <= p.minStock,
    ).length;

    const staffOnly = data.staff.filter((s) => s.role === "staff");
    const activeStaffCount = staffOnly.filter((s) => s.active).length;

    const todayInvoices = data.invoices.filter(
      (inv) => localDayKey(inv.date) === todayKey,
    );
    const todayCollections = data.collections.filter(
      (col) => localDayKey(col.date) === todayKey,
    );
    const todaySales = todayInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const todayCash =
      todayInvoices.reduce((sum, inv) => sum + inv.initialPaid, 0) +
      todayCollections.reduce((sum, col) => sum + col.amount, 0);

    const rankedStaff = data.staff
      .filter(
        (s) =>
          s.role === "staff" || s.totalSales > 0 || s.totalCashReceived > 0,
      )
      .slice()
      .sort(
        (a, b) =>
          b.totalSales - a.totalSales ||
          b.totalCashReceived - a.totalCashReceived,
      );

    const topStaffSales = Math.max(
      1,
      ...rankedStaff.map((s) => s.totalSales),
    );

    return {
      totalSales,
      totalCashReceived,
      totalDue,
      dueCustomerCount,
      lowStockCount,
      staffOnlyCount: staffOnly.length,
      activeStaffCount,
      todaySales,
      todayCash,
      rankedStaff,
      topStaffSales,
    };
  }, [data, todayKey]);

  const staffStats = useMemo(() => {
    if (!data) {
      return {
        myTotalSales: 0,
        myTotalCash: 0,
        myCollectionsTotal: 0,
        myOutstandingDue: 0,
        dueInvCount: 0,
        recentActivity: [],
      };
    }

    const myTotalSales = data.invoices.reduce(
      (sum, inv) => sum + inv.total,
      0,
    );
    const mySaleCash = data.invoices.reduce(
      (sum, inv) => sum + inv.initialPaid,
      0,
    );
    const myCollectionsTotal = data.collections.reduce(
      (sum, col) => sum + col.amount,
      0,
    );
    const myTotalCash = mySaleCash + myCollectionsTotal;
    const myOutstandingDue = data.invoices.reduce(
      (sum, inv) => sum + inv.due,
      0,
    );
    const dueInvCount = data.invoices.filter((inv) => inv.due > 0).length;

    const activityItems = [
      ...data.invoices.map((inv) => ({
        key: `inv-${inv.id}`,
        kind: "বিক্রি" as const,
        title: `${inv.number} · ${inv.customerName}`,
        date: inv.date,
        amount: inv.total,
        to: "/sales",
        badgeCls: "dm-badge dm-badge-emerald",
        icon: ShoppingCart,
        tone: "dm-tone-emerald",
      })),
      ...data.collections.map((col) => ({
        key: `col-${col.id}`,
        kind: "বাকি আদায়" as const,
        title: `${col.receiptNo} · ${col.customerName}`,
        date: col.date,
        amount: col.amount,
        to: "/collections",
        badgeCls: "dm-badge dm-badge-blue",
        icon: HandCoins,
        tone: "dm-tone-blue",
      })),
    ]
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 5);

    return {
      myTotalSales,
      myTotalCash,
      myCollectionsTotal,
      myOutstandingDue,
      dueInvCount,
      recentActivity: activityItems,
    };
  }, [data]);

  if (!data || !user) return null;

  if (user.role !== "admin") {
    const staffKpis = [
      {
        label: "আমার মোট বিক্রি",
        value: formatMoneyBn(staffStats.myTotalSales),
        sub: `${toBn(data.invoices.length)}টি চালান`,
        to: "/sales",
        icon: ShoppingCart,
        tone: "emerald",
      },
      {
        label: "আমার নগদ প্রাপ্তি",
        value: formatMoneyBn(staffStats.myTotalCash),
        sub: "বিক্রি ও বাকি আদায়",
        to: "/reports",
        icon: Wallet,
        tone: "blue",
      },
      {
        label: "আমার বাকি আদায়",
        value: formatMoneyBn(staffStats.myCollectionsTotal),
        sub: `${toBn(data.collections.length)}টি রসিদ`,
        to: "/collections",
        icon: HandCoins,
        tone: "teal",
      },
      {
        label: "আমার বিক্রির বাকি",
        value: formatMoneyBn(staffStats.myOutstandingDue),
        sub: `বকেয়া থাকা চালান: ${toBn(staffStats.dueInvCount)}টি`,
        to: "/sales",
        icon: Clock,
        tone: "amber",
      },
    ];

    const staffQuickActions = [
      {
        label: "নতুন বিক্রি",
        to: "/sales/new",
        icon: ShoppingCart,
        tone: "dm-tone-emerald",
        featured: true,
      },
      {
        label: "বাকি আদায়",
        to: "/collections",
        icon: HandCoins,
        tone: "dm-tone-teal",
      },
      {
        label: "আমার বিক্রি",
        to: "/sales",
        icon: TrendingUp,
        tone: "dm-tone-blue",
      },
      {
        label: "কাস্টমার",
        to: "/customers",
        icon: Users,
        tone: "dm-tone-indigo",
      },
      {
        label: "আমার রিপোর্ট",
        to: "/reports",
        icon: BarChart3,
        tone: "dm-tone-purple",
      },
    ];

    return (
      <div className="dm-stack-md">
        <header className="dm-greeting">
          <h1>
            {getGreetingBn()}, {user.name}
          </h1>
          <p>
            আমার বিক্রি ও বাকি আদায় ড্যাশবোর্ড · {formatDateBn(todayIso)}
          </p>
        </header>

        <section className="dm-kpi-grid" aria-label="আমার পারফরম্যান্স সূচক">
          {staffKpis.map(({ label, value, sub, to, icon: Icon, tone }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(to)}
              className="dm-kpi-card"
            >
              <span
                className={`dm-kpi-icon dm-tone-${tone}`}
                aria-hidden="true"
              >
                <Icon size={20} />
              </span>
              <span className="dm-kpi-meta">
                <span className="dm-kpi-label">{label}</span>
                <span className="dm-kpi-value">{value}</span>
                <span className="dm-kpi-sub">{sub}</span>
              </span>
            </button>
          ))}
        </section>

        <section aria-label="দ্রুত কাজ">
          <div className="dm-section-head">
            <h2>দ্রুত কাজ</h2>
          </div>
          <div className="dm-actions-grid">
            {staffQuickActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className={`dm-action-tile${item.featured ? " is-featured" : ""}`}
                >
                  <span
                    className={`dm-action-icon ${item.tone}`}
                    aria-hidden="true"
                  >
                    <Icon size={20} />
                  </span>
                  <span className="dm-action-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="dm-dash-split"
          aria-label="আমার বিক্রির প্রবণতা ও সাম্প্রতিক কার্যক্রম"
        >
          <SalesTrendChart
            title="আমার বিক্রির প্রবণতা"
            subtitle="সাম্প্রতিক বিক্রয় কার্যক্রমের গ্রাফ"
            invoices={data.invoices}
          />

          <div className="dm-card">
            <div className="dm-card-head">
              <div>
                <h2 className="dm-card-title">সাম্প্রতিক কার্যক্রম</h2>
                <p className="dm-page-sub">সর্বশেষ বিক্রি ও বাকি আদায়</p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/reports")}
                className="dm-section-link"
              >
                সব দেখুন →
              </button>
            </div>

            {staffStats.recentActivity.length === 0 ? (
              <div className="dm-empty-state">
                <CheckCircle2
                  size={30}
                  className="dm-text-emerald"
                  aria-hidden="true"
                />
                <p>এখনো কোনো কার্যক্রম নেই</p>
              </div>
            ) : (
              <div className="dm-checklist">
                {staffStats.recentActivity.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => navigate(item.to)}
                      className="dm-check-row"
                    >
                      <span className="dm-check-row-left">
                        <span
                          className={`dm-kpi-icon ${item.tone}`}
                          aria-hidden="true"
                        >
                          <Icon size={17} />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block" }}>{item.title}</span>
                          <small
                            className="dm-text-muted"
                            style={{ fontWeight: 500 }}
                          >
                            {formatDateBn(item.date, true)}
                          </small>
                        </span>
                      </span>
                      <span className="dm-table-actions" style={{ flexShrink: 0 }}>
                        <span className={item.badgeCls}>{item.kind}</span>
                        <strong style={{ whiteSpace: "nowrap" }}>
                          {formatMoneyBn(item.amount)}
                        </strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  const adminKpis = [
    {
      label: "মোট বিক্রি",
      value: formatMoneyBn(adminStats.totalSales),
      sub: `${toBn(data.invoices.length)}টি চালান`,
      to: "/sales",
      icon: ShoppingCart,
      tone: "emerald",
    },
    {
      label: "মোট নগদ প্রাপ্তি",
      value: formatMoneyBn(adminStats.totalCashReceived),
      sub: "বিক্রি + বাকি আদায়",
      to: "/money",
      icon: Wallet,
      tone: "blue",
    },
    {
      label: "মোট বাকি পাওনা",
      value: formatMoneyBn(adminStats.totalDue),
      sub: `${toBn(adminStats.dueCustomerCount)}জন কাস্টমার`,
      to: "/collections",
      icon: HandCoins,
      tone: "amber",
    },
    {
      label: "মোট পণ্য",
      value: `${toBn(data.products.length)}টি`,
      sub: `${toBn(adminStats.lowStockCount)}টি কম স্টক`,
      to: "/stock",
      icon: Package,
      tone: adminStats.lowStockCount > 0 ? "rose" : "teal",
    },
    {
      label: "মোট স্টাফ",
      value: `${toBn(adminStats.staffOnlyCount)}জন`,
      sub: `${toBn(adminStats.activeStaffCount)}জন সক্রিয়`,
      to: "/staff",
      icon: UserCog,
      tone: "indigo",
    },
    {
      label: "আজকের বিক্রি",
      value: formatMoneyBn(adminStats.todaySales),
      sub: `নগদ প্রাপ্তি ${formatMoneyBn(adminStats.todayCash)}`,
      to: "/sales",
      icon: TrendingUp,
      tone: "emerald",
    },
  ];

  const adminQuickActions = [
    {
      label: "নতুন বিক্রি",
      to: "/sales/new",
      icon: ShoppingCart,
      tone: "dm-tone-emerald",
      featured: true,
    },
    {
      label: "বাকি আদায়",
      to: "/collections",
      icon: HandCoins,
      tone: "dm-tone-teal",
    },
    {
      label: "নতুন ক্রয়",
      to: "/purchases/new",
      icon: ShoppingBag,
      tone: "dm-tone-purple",
    },
    {
      label: "পণ্য ও স্টক",
      to: "/stock",
      icon: Boxes,
      tone: "dm-tone-amber",
    },
    {
      label: "কাস্টমার",
      to: "/customers",
      icon: Users,
      tone: "dm-tone-blue",
    },
    {
      label: "স্টাফ",
      to: "/staff",
      icon: UserCog,
      tone: "dm-tone-indigo",
    },
    {
      label: "সাপ্লায়ার",
      to: "/suppliers",
      icon: Building2,
      tone: "dm-tone-slate",
    },
    {
      label: "রিপোর্ট",
      to: "/reports",
      icon: BarChart3,
      tone: "dm-tone-purple",
    },
  ];

  return (
    <div className="dm-stack-md">
      <header className="dm-greeting">
        <h1>আল-বারাকাহ স্টোর ড্যাশবোর্ড</h1>
        <p>
          {data.store.address} · {formatDateBn(todayIso)}
        </p>
      </header>

      <section className="dm-kpi-grid-3" aria-label="মূল ব্যবসার সূচক">
        {adminKpis.map(({ label, value, sub, to, icon: Icon, tone }) => (
          <button
            key={label}
            type="button"
            onClick={() => navigate(to)}
            className="dm-kpi-card"
          >
            <span
              className={`dm-kpi-icon dm-tone-${tone}`}
              aria-hidden="true"
            >
              <Icon size={20} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">{label}</span>
              <span className="dm-kpi-value">{value}</span>
              <span className="dm-kpi-sub">{sub}</span>
            </span>
          </button>
        ))}
      </section>

      <section aria-label="দ্রুত কাজ">
        <div className="dm-section-head">
          <h2>দ্রুত কাজ</h2>
        </div>

        <div className="dm-actions-grid">
          {adminQuickActions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.to)}
                className={`dm-action-tile${item.featured ? " is-featured" : ""}`}
              >
                <span
                  className={`dm-action-icon ${item.tone}`}
                  aria-hidden="true"
                >
                  <Icon size={20} />
                </span>
                <span className="dm-action-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="dm-dash-split"
        aria-label="বিক্রির প্রবণতা ও স্টাফ পারফরম্যান্স"
      >
        <SalesTrendChart
          title="বিক্রির প্রবণতা"
          subtitle="সাম্প্রতিক বিক্রয় কার্যক্রমের গ্রাফ"
          invoices={data.invoices}
        />

        <div className="dm-card">
          <div className="dm-card-head">
            <div>
              <h2 className="dm-card-title">স্টাফ পারফরম্যান্স সারাংশ</h2>
              <p className="dm-page-sub">বিক্রি ও নগদ প্রাপ্তি অনুযায়ী</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/staff")}
              className="dm-section-link"
            >
              সব দেখুন →
            </button>
          </div>

          <div className="dm-stack-sm">
            {adminStats.rankedStaff.map((member, index) => {
              const pct = Math.min(
                100,
                Math.round((member.totalSales / adminStats.topStaffSales) * 100),
              );
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => navigate("/staff")}
                  className="dm-check-row"
                  style={{ display: "grid", gap: 8 }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <span className="dm-badge dm-badge-slate">
                        #{toBn(index + 1)}
                      </span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {member.name}
                      </span>
                      {member.role === "admin" && (
                        <span className="dm-badge dm-badge-emerald">
                          অ্যাডমিন
                        </span>
                      )}
                      {!member.active && (
                        <span className="dm-badge dm-badge-rose">
                          নিষ্ক্রিয়
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        fontSize: 12.5,
                        flexShrink: 0,
                      }}
                    >
                      <strong>{formatMoneyBn(member.totalSales)}</strong>
                      <span
                        className="dm-text-emerald"
                        style={{ display: "block", fontSize: 11.5 }}
                      >
                        নগদ {formatMoneyBn(member.totalCashReceived)}
                      </span>
                    </span>
                  </span>

                  <span className="dm-progress-track" aria-hidden="true">
                    <span
                      className="dm-progress-fill"
                      style={{ display: "block", width: `${pct}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {(adminStats.lowStockCount > 0 || adminStats.dueCustomerCount > 0) && (
            <div className="dm-checklist" style={{ marginTop: 14 }}>
              {adminStats.lowStockCount > 0 && (
                <button
                  type="button"
                  onClick={() => navigate("/stock")}
                  className="dm-check-row"
                >
                  <span className="dm-check-row-left">
                    <span
                      className="dm-kpi-icon dm-tone-rose"
                      aria-hidden="true"
                    >
                      <AlertTriangle size={17} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block" }}>কম / শূন্য স্টক</span>
                      <small
                        className="dm-text-muted"
                        style={{ fontWeight: 500 }}
                      >
                        পণ্য মজুতে সতর্কতা স্তরে আছে
                      </small>
                    </span>
                  </span>
                  <span className="dm-table-actions">
                    <span className="dm-badge dm-badge-rose">
                      {toBn(adminStats.lowStockCount)}টি
                    </span>
                    <ChevronRight
                      size={16}
                      className="dm-text-muted"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              )}

              {adminStats.dueCustomerCount > 0 && (
                <button
                  type="button"
                  onClick={() => navigate("/collections")}
                  className="dm-check-row"
                >
                  <span className="dm-check-row-left">
                    <span
                      className="dm-kpi-icon dm-tone-amber"
                      aria-hidden="true"
                    >
                      <HandCoins size={17} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block" }}>বাকি আদায়যোগ্য</span>
                      <small
                        className="dm-text-muted"
                        style={{ fontWeight: 500 }}
                      >
                        মোট পাওনা {formatMoneyBn(adminStats.totalDue)}
                      </small>
                    </span>
                  </span>
                  <span className="dm-table-actions">
                    <span className="dm-badge dm-badge-amber">
                      {toBn(adminStats.dueCustomerCount)}জন
                    </span>
                    <ChevronRight
                      size={16}
                      className="dm-text-muted"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
