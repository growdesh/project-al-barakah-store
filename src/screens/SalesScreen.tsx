import {
  ArrowLeft,
  Eye,
  Plus,
  Printer,
  Receipt,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { ModalDialog } from "../components/ModalDialog";
import { useApp } from "../context/AppContext";
import {
  formatDateBn,
  formatMoneyBn,
  parseAmountInput,
  toBn,
} from "../lib/format";
import { navigate } from "../lib/router";
import type { InvoiceStatus, SaleInvoice } from "../types";

function invoiceBadge(status: InvoiceStatus) {
  if (status === "paid") {
    return { label: "পরিশোধিত", cls: "dm-badge dm-badge-emerald" };
  }
  if (status === "partial") {
    return { label: "আংশিক", cls: "dm-badge dm-badge-amber" };
  }
  return { label: "বাকি", cls: "dm-badge dm-badge-rose" };
}

export function SalesScreen() {
  const { user, data, toast, createCollection } = useApp();

  const [search, setSearch] = useState<string>("");
  const deferredSearch = useDeferredValue(search);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [pendingPrint, setPendingPrint] = useState<boolean>(false);

  // Quick inline cash collection modal
  const [collectInvoiceId, setCollectInvoiceId] = useState<string | null>(null);
  const [collectAmountInput, setCollectAmountInput] = useState<string>("");
  const [collectNote, setCollectNote] = useState<string>("");
  const [collectSubmitting, setCollectSubmitting] = useState<boolean>(false);

  const invoices = data?.invoices ?? [];
  const customers = data?.customers ?? [];
  const staffList = data?.staff ?? [];
  const isAdmin = user?.role === "admin";

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staffList) {
      if (
        s.role === "staff" ||
        s.role === "admin" ||
        invoices.some((inv) => inv.staffId === s.id)
      ) {
        map.set(s.id, s.name);
      }
    }
    for (const inv of invoices) {
      if (!map.has(inv.staffId)) {
        map.set(inv.staffId, inv.staffName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [staffList, invoices]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (isAdmin && staffFilter !== "all" && inv.staffId !== staffFilter) {
        return false;
      }
      if (statusFilter !== "all" && inv.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        inv.number.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.customerMobile.toLowerCase().includes(q) ||
        inv.staffName.toLowerCase().includes(q)
      );
    });
  }, [invoices, isAdmin, staffFilter, statusFilter, deferredSearch]);

  const kpis = useMemo(() => {
    let total = 0;
    let paid = 0;
    let due = 0;
    for (const inv of filtered) {
      total += inv.total;
      paid += inv.paid;
      due += inv.due;
    }
    return { total, paid, due };
  }, [filtered]);

  const selectedInvoice = useMemo(
    () =>
      selectedInvoiceId
        ? (invoices.find((inv) => inv.id === selectedInvoiceId) ?? null)
        : null,
    [invoices, selectedInvoiceId],
  );

  const collectInvoice = useMemo(
    () =>
      collectInvoiceId
        ? (invoices.find((inv) => inv.id === collectInvoiceId) ?? null)
        : null,
    [invoices, collectInvoiceId],
  );

  const collectCustomer = useMemo(
    () =>
      collectInvoice
        ? customers.find((c) => c.id === collectInvoice.customerId)
        : undefined,
    [collectInvoice, customers],
  );

  useEffect(() => {
    if (!pendingPrint || !selectedInvoice) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [pendingPrint, selectedInvoice]);

  const openQuickCollect = (inv: SaleInvoice) => {
    const cust = customers.find((c) => c.id === inv.customerId);
    const maxCollect = cust ? Math.min(inv.due, cust.due) : inv.due;
    setCollectInvoiceId(inv.id);
    setCollectAmountInput(String(Math.max(0, maxCollect)));
    setCollectNote("");
  };

  const handleQuickCollectSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!collectInvoice || collectSubmitting) return;

    const amount = Math.round(parseAmountInput(collectAmountInput) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("আদায়ের সঠিক পরিমাণ লিখুন");
      return;
    }
    if (collectCustomer && amount > collectCustomer.due) {
      toast("আদায়ের পরিমাণ কাস্টমারের মোট বকেয়ার চেয়ে বেশি হতে পারবে না");
      return;
    }

    setCollectSubmitting(true);
    try {
      await createCollection({
        customerId: collectInvoice.customerId,
        invoiceId: collectInvoice.id,
        amount,
        note: collectNote.trim() || undefined,
      });
      setCollectInvoiceId(null);
      setCollectAmountInput("");
      setCollectNote("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "বাকি আদায় সংরক্ষণ করা যায়নি");
    } finally {
      setCollectSubmitting(false);
    }
  };

  if (!user || !data) return null;

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
            <h1 className="dm-page-title">
              {isAdmin ? "বিক্রয় ও চালান" : "আমার বিক্রি"}
            </h1>
            <p className="dm-page-sub">
              মোট {toBn(invoices.length)}টি বিক্রয় ইনভয়েস
            </p>
          </div>
        </div>
        <div className="dm-page-actions">
          <button
            type="button"
            onClick={() => navigate("/sales/new")}
            className="dm-btn dm-btn-primary"
            style={{ minHeight: 44 }}
          >
            <Plus size={17} aria-hidden="true" />
            <span>নতুন বিক্রি</span>
          </button>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div className="dm-kpi-grid-3">
        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
            <TrendingUp size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট বিক্রি</span>
            <span className="dm-kpi-value dm-text-blue">
              {formatMoneyBn(kpis.total)}
            </span>
            <span className="dm-kpi-sub">{toBn(filtered.length)}টি চালান</span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
            <Wallet size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">নগদ প্রাপ্তি</span>
            <span className="dm-kpi-value dm-text-emerald">
              {formatMoneyBn(kpis.paid)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-rose" aria-hidden="true">
            <Receipt size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">অবশিষ্ট বাকি</span>
            <span className="dm-kpi-value dm-text-rose">
              {formatMoneyBn(kpis.due)}
            </span>
          </span>
        </div>
      </div>

      {/* Search & Admin Staff Filter */}
      <div className="dm-search-row">
        <div className="dm-search-box">
          <Search size={17} className="dm-search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="ইনভয়েস খুঁজুন"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ইনভয়েস নং, কাস্টমার বা মোবাইল খুঁজুন…"
            className="dm-search-input"
          />
        </div>

        {isAdmin && (
          <select
            aria-label="স্টাফ অনুযায়ী ফিল্টার"
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="dm-select"
            style={{ width: "auto", minWidth: 170, maxWidth: "100%" }}
          >
            <option value="all">সব স্টাফ</option>
            {staffOptions.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Status Filter Pills */}
      <div
        className="dm-pills dm-pills-scroll"
        role="group"
        aria-label="ইনভয়েস অবস্থা ফিল্টার"
      >
        {[
          { id: "all" as const, label: "সব" },
          { id: "paid" as const, label: "পরিশোধিত" },
          { id: "partial" as const, label: "আংশিক" },
          { id: "due" as const, label: "বাকি" },
        ].map((pill) => (
          <button
            key={pill.id}
            type="button"
            aria-pressed={statusFilter === pill.id}
            onClick={() => setStatusFilter(pill.id)}
            className={`dm-pill${statusFilter === pill.id ? " is-active" : ""}`}
            style={{ minHeight: 44 }}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Mobile Card List (< 768px) */}
      <div className="dm-mobile-list" aria-label="বিক্রয় চালানের তালিকা">
        {filtered.length === 0 ? (
          <div className="dm-card dm-empty-inline">
            কোনো বিক্রয় ইনভয়েস পাওয়া যায়নি
          </div>
        ) : (
          filtered.map((inv) => {
            const badge = invoiceBadge(inv.status);
            const canCollect = inv.due > 0 && inv.customerId !== "walk-in";
            return (
              <article key={inv.id} className="dm-mcard">
                <div className="dm-mcard-top">
                  <div className="dm-mcard-head">
                    <strong className="dm-text-emerald">{inv.number}</strong>
                    <span className={badge.cls}>{badge.label}</span>
                  </div>
                  <strong className="dm-mcard-amount dm-num">
                    {formatMoneyBn(inv.total)}
                  </strong>
                </div>
                <div className="dm-mcard-sub">
                  <strong>{inv.customerName}</strong>
                  <span>
                    {inv.customerMobile || "ওয়াক-ইন"} ·{" "}
                    {formatDateBn(inv.date, true)}
                    {isAdmin ? ` · ${inv.staffName}` : ""}
                  </span>
                </div>
                <div className="dm-mcard-metrics">
                  <span>
                    জমা:{" "}
                    <strong className="dm-text-emerald dm-num">
                      {formatMoneyBn(inv.paid)}
                    </strong>
                  </span>
                  <span>
                    বাকি:{" "}
                    <strong
                      className={`${inv.due > 0 ? "dm-text-rose" : "dm-text-muted"} dm-num`}
                    >
                      {formatMoneyBn(inv.due)}
                    </strong>
                  </span>
                </div>
                <div className="dm-mcard-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className="dm-btn dm-btn-outline dm-btn-sm"
                  >
                    <Eye size={15} aria-hidden="true" />
                    <span>দেখুন</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInvoiceId(inv.id);
                      setPendingPrint(true);
                    }}
                    className="dm-btn dm-btn-outline dm-btn-sm"
                  >
                    <Printer size={15} aria-hidden="true" />
                    <span>প্রিন্ট</span>
                  </button>
                  {canCollect && (
                    <button
                      type="button"
                      onClick={() => openQuickCollect(inv)}
                      className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                    >
                      আদায়
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Desktop Invoices Table (>= 768px) */}
      <div
        tabIndex={0}
        role="region"
        aria-label="বিক্রয় চালানের তালিকা"
        className="dm-table-wrap dm-desktop-table"
      >
        <table className="dm-table">
          <thead>
            <tr>
              <th>ইনভয়েস</th>
              <th>কাস্টমার</th>
              {isAdmin && <th>বিক্রয়কারী</th>}
              <th>মোট</th>
              <th>নগদ জমা</th>
              <th>বাকি ও অবস্থা</th>
              <th>কার্যক্রম</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="dm-empty-inline">
                  কোনো বিক্রয় ইনভয়েস পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const badge = invoiceBadge(inv.status);
                const canCollect =
                  inv.due > 0 && inv.customerId !== "walk-in";

                return (
                  <tr key={inv.id}>
                    <td>
                      <strong
                        className="dm-text-emerald"
                        style={{ display: "block" }}
                      >
                        {inv.number}
                      </strong>
                      <small className="dm-text-muted">
                        {formatDateBn(inv.date, true)}
                      </small>
                    </td>
                    <td>
                      <strong style={{ display: "block" }}>
                        {inv.customerName}
                      </strong>
                      <small className="dm-text-muted">
                        {inv.customerMobile || "ওয়াক-ইন"}
                      </small>
                    </td>
                    {isAdmin && <td>{inv.staffName}</td>}
                    <td>
                      <strong>{formatMoneyBn(inv.total)}</strong>
                    </td>
                    <td className="dm-text-emerald" style={{ fontWeight: 700 }}>
                      {formatMoneyBn(inv.paid)}
                    </td>
                    <td>
                      <span
                        className={
                          inv.due > 0 ? "dm-text-rose" : "dm-text-muted"
                        }
                        style={{ fontWeight: 700 }}
                      >
                        {formatMoneyBn(inv.due)}
                      </span>
                      <div style={{ marginTop: 3 }}>
                        <span className={badge.cls}>{badge.label}</span>
                      </div>
                    </td>
                    <td>
                      <div className="dm-table-actions">
                        <button
                          type="button"
                          aria-label={`${inv.number} দেখুন`}
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="dm-btn dm-btn-outline dm-btn-sm"
                          style={{ minHeight: 44 }}
                        >
                          <Eye size={15} aria-hidden="true" />
                          <span>দেখুন</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`${inv.number} প্রিন্ট করুন`}
                          onClick={() => {
                            setSelectedInvoiceId(inv.id);
                            setPendingPrint(true);
                          }}
                          className="dm-btn dm-btn-outline dm-btn-sm"
                          style={{ minHeight: 44 }}
                        >
                          <Printer size={15} aria-hidden="true" />
                          <span>প্রিন্ট</span>
                        </button>
                        {canCollect && (
                          <button
                            type="button"
                            onClick={() => openQuickCollect(inv)}
                            className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                            style={{ minHeight: 44 }}
                          >
                            আদায়
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Invoice Detail Modal */}
      <ModalDialog
        open={Boolean(selectedInvoice)}
        onClose={() => {
          setSelectedInvoiceId(null);
          setPendingPrint(false);
        }}
        size="lg"
        title={selectedInvoice ? `চালান #${selectedInvoice.number}` : ""}
        subtitle={
          selectedInvoice
            ? `${data.store.name} · ${formatDateBn(selectedInvoice.date, true)}`
            : undefined
        }
        footer={
          selectedInvoice && (
            <>
              {selectedInvoice.due > 0 &&
                selectedInvoice.customerId !== "walk-in" && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedInvoice;
                      setSelectedInvoiceId(null);
                      openQuickCollect(target);
                    }}
                    className="dm-btn dm-btn-soft-emerald"
                    style={{ minHeight: 44 }}
                  >
                    বাকি আদায় করুন
                  </button>
                )}
              <button
                type="button"
                onClick={() => window.print()}
                className="dm-btn dm-btn-outline"
                style={{ minHeight: 44 }}
              >
                <Printer size={16} aria-hidden="true" />
                <span>প্রিন্ট / PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvoiceId(null)}
                className="dm-btn dm-btn-primary"
                style={{ minHeight: 44 }}
              >
                বন্ধ করুন
              </button>
            </>
          )
        }
      >
        {selectedInvoice && (
          <div className="dm-stack-sm">
            {/* Store & Invoice Info */}
            <div
              className="dm-card dm-card-pad-sm"
              style={{ background: "var(--dm-surface-tint)" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 8,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--dm-line)",
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: 15 }}>
                    {data.store.name}
                  </strong>
                  <span className="dm-text-muted" style={{ fontSize: 12.5 }}>
                    {data.store.address} · {data.store.phone}
                  </span>
                </div>
                <span className={invoiceBadge(selectedInvoice.status).cls}>
                  {invoiceBadge(selectedInvoice.status).label}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                  fontSize: 13.5,
                }}
              >
                <div>
                  <strong style={{ display: "block" }}>
                    কাস্টমার: {selectedInvoice.customerName}
                  </strong>
                  <span className="dm-text-muted">
                    মোবাইল: {selectedInvoice.customerMobile || "ওয়াক-ইন"}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="dm-text-muted" style={{ display: "block" }}>
                    বিক্রয়কারী
                  </span>
                  <strong>{selectedInvoice.staffName}</strong>
                </div>
              </div>

              {selectedInvoice.note && (
                <p
                  className="dm-text-muted"
                  style={{ marginTop: 6, fontSize: 12.5 }}
                >
                  নোট: {selectedInvoice.note}
                </p>
              )}
            </div>

            {/* Line Items */}
            <div
              tabIndex={0}
              role="region"
              aria-label="চালানের পণ্যের তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>পণ্য</th>
                    <th>পরিমাণ</th>
                    <th>দর</th>
                    <th>মোট</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.length > 0 ? (
                    selectedInvoice.items.map((item, idx) => (
                      <tr key={`${item.productId}-${idx}`}>
                        <td>{item.name}</td>
                        <td>
                          {toBn(item.qty)} {item.unit}
                        </td>
                        <td>{formatMoneyBn(item.rate)}</td>
                        <td>
                          <strong>{formatMoneyBn(item.total)}</strong>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>
                        মোট {toBn(selectedInvoice.itemsCount)}টি পণ্য
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="dm-cart-summary">
              <div className="dm-summary-row">
                <span>উপ-মোট</span>
                <strong>{formatMoneyBn(selectedInvoice.subTotal)}</strong>
              </div>
              {selectedInvoice.discount > 0 && (
                <div className="dm-summary-row">
                  <span>ছাড়</span>
                  <strong className="dm-text-amber">
                    − {formatMoneyBn(selectedInvoice.discount)}
                  </strong>
                </div>
              )}
              <div className="dm-summary-row is-total">
                <span>সর্বমোট</span>
                <span>{formatMoneyBn(selectedInvoice.total)}</span>
              </div>
              <div className="dm-summary-row">
                <span>মোট নগদ জমা</span>
                <strong className="dm-text-emerald">
                  {formatMoneyBn(selectedInvoice.paid)}
                </strong>
              </div>
              <div className="dm-summary-row">
                <span>অবশিষ্ট বাকি</span>
                <strong
                  className={
                    selectedInvoice.due > 0 ? "dm-text-rose" : "dm-text-emerald"
                  }
                >
                  {formatMoneyBn(selectedInvoice.due)}
                </strong>
              </div>
            </div>

            <p
              className="dm-text-muted"
              style={{ fontSize: 12, textAlign: "center", marginTop: 4 }}
            >
              {data.settings.invoiceFooter}
            </p>
          </div>
        )}
      </ModalDialog>

      {/* Quick Inline Cash Collection Modal */}
      <ModalDialog
        open={Boolean(collectInvoice)}
        onClose={() => setCollectInvoiceId(null)}
        title="নগদ বাকি আদায়"
        subtitle={
          collectInvoice
            ? `${collectInvoice.customerName} · চালান ${collectInvoice.number}`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setCollectInvoiceId(null)}
              className="dm-btn dm-btn-outline"
              style={{ minHeight: 44 }}
            >
              বাতিল
            </button>
            <button
              type="submit"
              form="dm-sales-collect-form"
              disabled={collectSubmitting}
              className="dm-btn dm-btn-primary"
              style={{ minHeight: 44 }}
            >
              {collectSubmitting ? "সংরক্ষণ হচ্ছে…" : "নগদ আদায় সংরক্ষণ"}
            </button>
          </>
        }
      >
        {collectInvoice && (
          <form
            id="dm-sales-collect-form"
            onSubmit={handleQuickCollectSubmit}
            className="dm-form-grid"
          >
            <div
              className="dm-card dm-card-pad-sm"
              style={{ background: "var(--dm-surface-tint)" }}
            >
              <div className="dm-summary-row">
                <span>এই চালানের বাকি</span>
                <strong className="dm-text-rose">
                  {formatMoneyBn(collectInvoice.due)}
                </strong>
              </div>
              {collectCustomer && (
                <div className="dm-summary-row" style={{ marginTop: 4 }}>
                  <span>কাস্টমারের মোট বাকি</span>
                  <strong>{formatMoneyBn(collectCustomer.due)}</strong>
                </div>
              )}
            </div>

            <div className="dm-field">
              <label htmlFor="dm-sc-amount">নগদ আদায়ের পরিমাণ (৳) *</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  id="dm-sc-amount"
                  type="text"
                  inputMode="numeric"
                  required
                  value={collectAmountInput}
                  onChange={(e) => setCollectAmountInput(e.target.value)}
                  className="dm-input"
                  style={{ flex: 1, minWidth: 140 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const maxVal = collectCustomer
                      ? Math.min(collectInvoice.due, collectCustomer.due)
                      : collectInvoice.due;
                    setCollectAmountInput(String(maxVal));
                  }}
                  className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                  style={{ minHeight: 44 }}
                >
                  সম্পূর্ণ চালান (
                  {formatMoneyBn(
                    collectCustomer
                      ? Math.min(collectInvoice.due, collectCustomer.due)
                      : collectInvoice.due,
                  )}
                  )
                </button>
              </div>
            </div>

            <div className="dm-field">
              <label htmlFor="dm-sc-note">নোট (ঐচ্ছিক)</label>
              <input
                id="dm-sc-note"
                value={collectNote}
                onChange={(e) => setCollectNote(e.target.value)}
                placeholder="যেমন: নগদ কাউন্টার আদায়"
                className="dm-input"
              />
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}
