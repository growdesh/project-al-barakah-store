import {
  ArrowLeft,
  Building2,
  Eye,
  Pencil,
  Printer,
  Search,
  ShieldAlert,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { ModalDialog } from "../components/ModalDialog";
import { useApp } from "../context/AppContext";
import {
  formatDateBn,
  formatMoneyBn,
  normalizePhone,
  parseAmountInput,
  toBn,
} from "../lib/format";
import { navigate } from "../lib/router";
import type { InvoiceStatus, PurchaseInvoice, Supplier } from "../types";

function purchaseStatusBadge(status: InvoiceStatus) {
  if (status === "paid") {
    return { label: "পরিশোধিত", cls: "dm-badge dm-badge-emerald" };
  }
  if (status === "partial") {
    return { label: "আংশিক", cls: "dm-badge dm-badge-amber" };
  }
  return { label: "দেনা", cls: "dm-badge dm-badge-rose" };
}

/* ─────────────────────────── 1. PurchasesScreen ─────────────────────────── */

export function PurchasesScreen() {
  const { user, data } = useApp();
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>(
    "all",
  );
  const [selectedPurchase, setSelectedPurchase] =
    useState<PurchaseInvoice | null>(null);

  const kpis = useMemo(() => {
    const purchases = data?.purchases ?? [];
    const suppliers = data?.suppliers ?? [];
    const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
    const totalPaid = purchases.reduce((sum, p) => sum + p.paid, 0);
    const purchaseDue = purchases.reduce((sum, p) => sum + p.due, 0);
    const supplierDue = suppliers.reduce((sum, s) => sum + s.due, 0);
    return {
      count: purchases.length,
      totalPurchases,
      totalPaid,
      purchaseDue,
      supplierDue,
    };
  }, [data?.purchases, data?.suppliers]);

  const filtered = useMemo(() => {
    const purchases = data?.purchases ?? [];
    const q = search.trim().toLowerCase();
    const normQ = normalizePhone(search);
    return purchases.filter((pur) => {
      if (statusFilter !== "all" && pur.status !== statusFilter) return false;
      if (!q) return true;
      return (
        pur.number.toLowerCase().includes(q) ||
        pur.supplierName.toLowerCase().includes(q) ||
        pur.supplierMobile.toLowerCase().includes(q) ||
        (normQ.length > 0 && normalizePhone(pur.supplierMobile).includes(normQ))
      );
    });
  }, [data?.purchases, search, statusFilter]);

  if (!data || !user) return null;

  if (user.role !== "admin") {
    return (
      <div className="dm-access-denied">
        <ShieldAlert size={36} className="dm-text-rose" aria-hidden="true" />
        <h2>এই পেজে প্রবেশের অনুমতি নেই</h2>
        <p>শুধুমাত্র অ্যাডমিন ক্রয় হিসাব দেখতে পারবেন।</p>
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
            <h1 className="dm-page-title">ক্রয় হিসাব</h1>
            <p className="dm-page-sub">
              মোট {toBn(kpis.count)}টি ক্রয় চালান
            </p>
          </div>
        </div>
        <div className="dm-page-actions">
          <button
            type="button"
            onClick={() => navigate("/purchases/new")}
            className="dm-btn dm-btn-primary"
          >
            <ShoppingBag size={17} aria-hidden="true" />
            <span>+ নতুন ক্রয়</span>
          </button>
        </div>
      </div>

      {/* 3 KPIs */}
      <div className="dm-kpi-grid-3">
        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-purple" aria-hidden="true">
            <ShoppingBag size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট ক্রয়</span>
            <span className="dm-kpi-value dm-text-blue">
              {formatMoneyBn(kpis.totalPurchases)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
            <Wallet size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">নগদ পরিশোধ</span>
            <span className="dm-kpi-value dm-text-emerald">
              {formatMoneyBn(kpis.totalPaid)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-rose" aria-hidden="true">
            <Building2 size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">সাপ্লায়ার দেনা</span>
            <span className="dm-kpi-value dm-text-rose">
              {formatMoneyBn(kpis.supplierDue)}
            </span>
            <span className="dm-kpi-sub">
              ক্রয় চালান বাকি: {formatMoneyBn(kpis.purchaseDue)}
            </span>
          </span>
        </div>
      </div>

      {/* Search & Status Pills */}
      <div className="dm-search-row">
        <div className="dm-search-box">
          <Search size={17} className="dm-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ক্রয় নং, সাপ্লায়ার বা মোবাইল খুঁজুন…"
            aria-label="ক্রয় নং, সাপ্লায়ার বা মোবাইল খুঁজুন"
            className="dm-search-input"
          />
        </div>
      </div>

      <div
        className="dm-pills dm-pills-scroll"
        role="group"
        aria-label="ক্রয় অবস্থা ফিল্টার"
      >
        {[
          { id: "all" as const, label: "সব" },
          { id: "paid" as const, label: "পরিশোধিত" },
          { id: "partial" as const, label: "আংশিক" },
          { id: "due" as const, label: "দেনা" },
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

      {/* Purchases Table */}
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
              <th>সাপ্লায়ার</th>
              <th>মোট বিল</th>
              <th>নগদ পরিশোধ</th>
              <th>দেনা</th>
              <th>অবস্থা</th>
              <th>কার্যক্রম</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="dm-empty-inline">
                  কোনো ক্রয় চালান পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              filtered.map((pur) => {
                const badge = purchaseStatusBadge(pur.status);
                return (
                  <tr key={pur.id}>
                    <td>
                      <strong
                        className="dm-text-blue"
                        style={{ display: "block" }}
                      >
                        {pur.number}
                      </strong>
                      <small className="dm-text-muted">
                        {formatDateBn(pur.date)}
                      </small>
                    </td>
                    <td>
                      <strong style={{ display: "block" }}>
                        {pur.supplierName}
                      </strong>
                      <small className="dm-text-muted">
                        {pur.supplierMobile}
                      </small>
                    </td>
                    <td>
                      <strong>{formatMoneyBn(pur.total)}</strong>
                    </td>
                    <td className="dm-text-emerald" style={{ fontWeight: 700 }}>
                      {formatMoneyBn(pur.paid)}
                    </td>
                    <td
                      className={
                        pur.due > 0 ? "dm-text-rose" : "dm-text-muted"
                      }
                      style={{ fontWeight: 700 }}
                    >
                      {formatMoneyBn(pur.due)}
                    </td>
                    <td>
                      <span className={badge.cls}>{badge.label}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedPurchase(pur)}
                        className="dm-btn dm-btn-outline dm-btn-sm"
                        style={{ minHeight: 44 }}
                      >
                        <Eye size={14} aria-hidden="true" />
                        <span>বিস্তারিত</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Purchase Detail Modal */}
      <ModalDialog
        open={Boolean(selectedPurchase)}
        onClose={() => setSelectedPurchase(null)}
        title={selectedPurchase ? selectedPurchase.number : "ক্রয় বিস্তারিত"}
        subtitle={
          selectedPurchase
            ? `${data.store.name} · ${formatDateBn(selectedPurchase.date, true)}`
            : undefined
        }
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
              onClick={() => setSelectedPurchase(null)}
              className="dm-btn dm-btn-primary"
            >
              বন্ধ করুন
            </button>
          </>
        }
      >
        {selectedPurchase && (
          <div className="dm-stack-md">
            <div
              className="dm-card dm-card-pad-sm"
              style={{ background: "var(--dm-surface-tint)" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <strong style={{ display: "block" }}>
                    সাপ্লায়ার: {selectedPurchase.supplierName}
                  </strong>
                  <span className="dm-text-muted">
                    মোবাইল: {selectedPurchase.supplierMobile}
                  </span>
                </div>
                <span
                  className={purchaseStatusBadge(selectedPurchase.status).cls}
                >
                  {purchaseStatusBadge(selectedPurchase.status).label}
                </span>
              </div>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-label="ক্রয়কৃত পণ্যের তালিকা"
              className="dm-table-wrap"
            >
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>পণ্য</th>
                    <th>পরিমাণ</th>
                    <th>ক্রয় দর</th>
                    <th>মোট</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchase.items.map((item, idx) => (
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
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dm-cart-summary">
              <div className="dm-summary-row">
                <span>সাবটোটাল ({toBn(selectedPurchase.itemsCount)}টি)</span>
                <strong>{formatMoneyBn(selectedPurchase.subTotal)}</strong>
              </div>
              {selectedPurchase.discount > 0 && (
                <div className="dm-summary-row">
                  <span>ডিসকাউন্ট</span>
                  <strong className="dm-text-amber">
                    − {formatMoneyBn(selectedPurchase.discount)}
                  </strong>
                </div>
              )}
              <div className="dm-summary-row is-total">
                <span>মোট ক্রয় বিল</span>
                <span>{formatMoneyBn(selectedPurchase.total)}</span>
              </div>
              <div className="dm-summary-row">
                <span>নগদ পরিশোধ</span>
                <strong className="dm-text-emerald">
                  {formatMoneyBn(selectedPurchase.paid)}
                </strong>
              </div>
              <div className="dm-summary-row">
                <span>বাকি দেনা</span>
                <strong
                  className={
                    selectedPurchase.due > 0
                      ? "dm-text-rose"
                      : "dm-text-emerald"
                  }
                >
                  {formatMoneyBn(selectedPurchase.due)}
                </strong>
              </div>
            </div>

            {selectedPurchase.note && (
              <p className="dm-text-muted" style={{ fontSize: 13 }}>
                নোট: {selectedPurchase.note}
              </p>
            )}
          </div>
        )}
      </ModalDialog>
    </div>
  );
}

/* ─────────────────────────── 2. SuppliersScreen ─────────────────────────── */

export function SuppliersScreen() {
  const { user, data, createSupplier, updateSupplier, paySupplier } = useApp();

  const [search, setSearch] = useState<string>("");
  const [tab, setTab] = useState<"all" | "due" | "paid">("all");

  // Add Supplier Modal
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [sName, setSName] = useState<string>("");
  const [sMobile, setSMobile] = useState<string>("");
  const [sArea, setSArea] = useState<string>("");
  const [sDue, setSDue] = useState<string>("0");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState<boolean>(false);

  // Edit Supplier Modal
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [eName, setEName] = useState<string>("");
  const [eMobile, setEMobile] = useState<string>("");
  const [eArea, setEArea] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);

  // Pay Supplier Cash Modal
  const [payTarget, setPayTarget] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payNote, setPayNote] = useState<string>("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState<boolean>(false);

  const addFormId = useId();
  const editFormId = useId();
  const payFormId = useId();

  const stats = useMemo(() => {
    const suppliers = data?.suppliers ?? [];
    const totalDue = suppliers.reduce((sum, s) => sum + s.due, 0);
    const dueCount = suppliers.filter((s) => s.due > 0).length;
    const paidCount = suppliers.filter((s) => s.due <= 0).length;
    return {
      totalCount: suppliers.length,
      totalDue,
      dueCount,
      paidCount,
    };
  }, [data?.suppliers]);

  const filtered = useMemo(() => {
    const suppliers = data?.suppliers ?? [];
    const q = search.trim().toLowerCase();
    const normQ = normalizePhone(search);
    return suppliers.filter((s) => {
      if (tab === "due" && s.due <= 0) return false;
      if (tab === "paid" && s.due > 0) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.mobile.toLowerCase().includes(q) ||
        s.area.toLowerCase().includes(q) ||
        (normQ.length > 0 && normalizePhone(s.mobile).includes(normQ))
      );
    });
  }, [data?.suppliers, search, tab]);

  if (!data || !user) return null;

  if (user.role !== "admin") {
    return (
      <div className="dm-access-denied">
        <ShieldAlert size={36} className="dm-text-rose" aria-hidden="true" />
        <h2>এই পেজে প্রবেশের অনুমতি নেই</h2>
        <p>শুধুমাত্র অ্যাডমিন সাপ্লায়ার হিসাব পরিচালনা করতে পারবেন।</p>
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

  const openAddModal = () => {
    setSName("");
    setSMobile("");
    setSArea("");
    setSDue("0");
    setAddError(null);
    setAddOpen(true);
  };

  const handleAddSupplier = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const name = sName.trim();
    const mobile = normalizePhone(sMobile);
    const area = sArea.trim();
    const due = Math.max(0, Math.round(parseAmountInput(sDue)));

    if (!name) {
      setAddError("সাপ্লায়ারের নাম লিখুন");
      return;
    }
    if (mobile.length < 6) {
      setAddError("সঠিক মোবাইল নম্বর দিন");
      return;
    }

    setAdding(true);
    try {
      await createSupplier({
        name,
        mobile,
        ...(area ? { area } : {}),
        due,
      });
      setAddOpen(false);
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "সাপ্লায়ার যোগ করা যায়নি",
      );
    } finally {
      setAdding(false);
    }
  };

  const openEditModal = (sup: Supplier) => {
    setEditTarget(sup);
    setEName(sup.name);
    setEMobile(sup.mobile);
    setEArea(sup.area);
    setEditError(null);
  };

  const handleEditSupplier = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);

    const name = eName.trim();
    const mobile = normalizePhone(eMobile);
    const area = eArea.trim();

    if (!name) {
      setEditError("সাপ্লায়ারের নাম খালি রাখা যাবে না");
      return;
    }
    if (mobile.length < 6) {
      setEditError("সঠিক মোবাইল নম্বর দিন");
      return;
    }

    setEditing(true);
    try {
      await updateSupplier(editTarget.id, {
        name,
        mobile,
        ...(area ? { area } : {}),
      });
      setEditTarget(null);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "সাপ্লায়ার তথ্য আপডেট হয়নি",
      );
    } finally {
      setEditing(false);
    }
  };

  const openPayModal = (sup: Supplier) => {
    setPayTarget(sup);
    setPayAmount(String(sup.due));
    setPayNote("");
    setPayError(null);
  };

  const handlePaySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    setPayError(null);

    const amount = Math.round(parseAmountInput(payAmount) * 100) / 100;
    if (amount <= 0) {
      setPayError("পরিশোধের পরিমাণ শূন্যের বেশি হতে হবে");
      return;
    }
    if (amount > payTarget.due) {
      setPayError("পরিশোধের পরিমাণ বর্তমান দেনার চেয়ে বেশি হতে পারবে না");
      return;
    }

    setPaying(true);
    try {
      await paySupplier(payTarget.id, {
        amount,
        ...(payNote.trim() ? { note: payNote.trim() } : {}),
      });
      setPayTarget(null);
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : "নগদ পরিশোধ সম্পন্ন হয়নি",
      );
    } finally {
      setPaying(false);
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
            <h1 className="dm-page-title">সাপ্লায়ার</h1>
            <p className="dm-page-sub">
              মোট {toBn(stats.totalCount)}জন সরবরাহকারী ও দেনা হিসাব
            </p>
          </div>
        </div>
        <div className="dm-page-actions">
          <button
            type="button"
            onClick={openAddModal}
            className="dm-btn dm-btn-primary"
          >
            <Building2 size={17} aria-hidden="true" />
            <span>+ নতুন সাপ্লায়ার</span>
          </button>
        </div>
      </div>

      {/* 3 KPIs */}
      <div className="dm-kpi-grid-3">
        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-indigo" aria-hidden="true">
            <Building2 size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট সাপ্লায়ার</span>
            <span className="dm-kpi-value dm-text-blue">
              {toBn(stats.totalCount)}জন
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-rose" aria-hidden="true">
            <Wallet size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট দেনা</span>
            <span className="dm-kpi-value dm-text-rose">
              {formatMoneyBn(stats.totalDue)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-amber" aria-hidden="true">
            <Wallet size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">দেনা আছে জন</span>
            <span className="dm-kpi-value dm-text-amber">
              {toBn(stats.dueCount)}জন
            </span>
            <span className="dm-kpi-sub">
              পরিশোধিত: {toBn(stats.paidCount)}জন
            </span>
          </span>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="dm-search-row">
        <div className="dm-search-box">
          <Search size={17} className="dm-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="সাপ্লায়ার, মোবাইল বা এলাকা খুঁজুন…"
            aria-label="সাপ্লায়ার, মোবাইল বা এলাকা খুঁজুন"
            className="dm-search-input"
          />
        </div>
      </div>

      <div className="dm-tabs" role="tablist" aria-label="সাপ্লায়ার ফিল্টার">
        {[
          { id: "all" as const, label: "সব" },
          { id: "due" as const, label: "দেনা আছে" },
          { id: "paid" as const, label: "পরিশোধিত" },
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

      {/* Suppliers Table */}
      <div
        tabIndex={0}
        role="region"
        aria-label="সাপ্লায়ার তালিকা"
        className="dm-table-wrap"
      >
        <table className="dm-table">
          <thead>
            <tr>
              <th>সাপ্লায়ার</th>
              <th>মোবাইল</th>
              <th>এলাকা</th>
              <th>দেনা</th>
              <th>শেষ লেনদেন</th>
              <th>কার্যক্রম</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="dm-empty-inline">
                  কোনো সাপ্লায়ার পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong className="dm-text-emerald">{s.name}</strong>
                  </td>
                  <td>{s.mobile}</td>
                  <td className="dm-text-muted">{s.area}</td>
                  <td
                    className={
                      s.due > 0 ? "dm-text-rose" : "dm-text-emerald"
                    }
                    style={{ fontWeight: 700 }}
                  >
                    {formatMoneyBn(s.due)}
                  </td>
                  <td className="dm-text-muted">{s.lastTxn}</td>
                  <td>
                    <div className="dm-table-actions">
                      {s.due > 0 && (
                        <button
                          type="button"
                          onClick={() => openPayModal(s)}
                          className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                          style={{ minHeight: 44 }}
                        >
                          <Wallet size={14} aria-hidden="true" />
                          <span>নগদ পরিশোধ</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(s)}
                        className="dm-btn dm-btn-outline dm-btn-sm"
                        style={{ minHeight: 44 }}
                      >
                        <Pencil size={14} aria-hidden="true" />
                        <span>সম্পাদনা</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      <ModalDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="নতুন সাপ্লায়ার যোগ করুন"
        subtitle="সরবরাহকারীর নাম, মোবাইল ও পূর্বের দেনা সংরক্ষণ করুন"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="dm-btn dm-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              form={addFormId}
              disabled={adding}
              className="dm-btn dm-btn-primary"
            >
              {adding ? "যোগ হচ্ছে…" : "যোগ করুন"}
            </button>
          </>
        }
      >
        <form
          id={addFormId}
          onSubmit={handleAddSupplier}
          className="dm-form-grid"
        >
          {addError && (
            <div className="dm-alert-error" role="alert">
              <span>{addError}</span>
            </div>
          )}

          <div className="dm-field">
            <label htmlFor="sup-add-name">প্রতিষ্ঠানের নাম *</label>
            <input
              id="sup-add-name"
              required
              value={sName}
              onChange={(e) => setSName(e.target.value)}
              placeholder="যেমন: মেঘনা গ্রুপ অব ইন্ডাস্ট্রিজ"
              className="dm-input"
            />
          </div>

          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="sup-add-mobile">মোবাইল নম্বর *</label>
              <input
                id="sup-add-mobile"
                type="tel"
                inputMode="tel"
                required
                value={sMobile}
                onChange={(e) => setSMobile(e.target.value)}
                placeholder="017XXXXXXXX"
                className="dm-input"
              />
            </div>

            <div className="dm-field">
              <label htmlFor="sup-add-area">এলাকা</label>
              <input
                id="sup-add-area"
                value={sArea}
                onChange={(e) => setSArea(e.target.value)}
                placeholder="ঢাকা"
                className="dm-input"
              />
            </div>
          </div>

          <div className="dm-field">
            <label htmlFor="sup-add-due">পূর্বের দেনা (৳)</label>
            <input
              id="sup-add-due"
              inputMode="decimal"
              value={sDue}
              onChange={(e) => setSDue(e.target.value)}
              className="dm-input"
            />
          </div>
        </form>
      </ModalDialog>

      {/* Edit Supplier Modal */}
      <ModalDialog
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="সাপ্লায়ার তথ্য সম্পাদনা"
        subtitle={editTarget?.name}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="dm-btn dm-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              form={editFormId}
              disabled={editing}
              className="dm-btn dm-btn-primary"
            >
              {editing ? "সংরক্ষণ হচ্ছে…" : "আপডেট করুন"}
            </button>
          </>
        }
      >
        <form
          id={editFormId}
          onSubmit={handleEditSupplier}
          className="dm-form-grid"
        >
          {editError && (
            <div className="dm-alert-error" role="alert">
              <span>{editError}</span>
            </div>
          )}

          <div className="dm-field">
            <label htmlFor="sup-edit-name">প্রতিষ্ঠানের নাম *</label>
            <input
              id="sup-edit-name"
              required
              value={eName}
              onChange={(e) => setEName(e.target.value)}
              className="dm-input"
            />
          </div>

          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="sup-edit-mobile">মোবাইল নম্বর *</label>
              <input
                id="sup-edit-mobile"
                type="tel"
                inputMode="tel"
                required
                value={eMobile}
                onChange={(e) => setEMobile(e.target.value)}
                className="dm-input"
              />
            </div>

            <div className="dm-field">
              <label htmlFor="sup-edit-area">এলাকা</label>
              <input
                id="sup-edit-area"
                value={eArea}
                onChange={(e) => setEArea(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Pay Supplier Cash Modal (CASH ONLY) */}
      <ModalDialog
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="সাপ্লায়ার নগদ পরিশোধ"
        subtitle={
          payTarget ? `${payTarget.name} · নগদ বকেয়া সমন্বয়` : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setPayTarget(null)}
              className="dm-btn dm-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              form={payFormId}
              disabled={paying}
              className="dm-btn dm-btn-primary"
            >
              {paying ? "পরিশোধ হচ্ছে…" : "নগদ পরিশোধ নিশ্চিত করুন"}
            </button>
          </>
        }
      >
        {payTarget && (
          <form
            id={payFormId}
            onSubmit={handlePaySubmit}
            className="dm-form-grid"
          >
            {payError && (
              <div className="dm-alert-error" role="alert">
                <span>{payError}</span>
              </div>
            )}

            <div
              className="dm-feed-item"
              style={{ background: "var(--dm-surface-tint)" }}
            >
              <div>
                <strong style={{ display: "block" }}>{payTarget.name}</strong>
                <small className="dm-text-muted">{payTarget.mobile}</small>
              </div>
              <div style={{ textAlign: "right" }}>
                <small className="dm-text-muted" style={{ display: "block" }}>
                  বর্তমান দেনা
                </small>
                <strong className="dm-text-rose" style={{ fontSize: 16 }}>
                  {formatMoneyBn(payTarget.due)}
                </strong>
              </div>
            </div>

            <div className="dm-field">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <label htmlFor="sup-pay-amt">নগদ পরিশোধের পরিমাণ (৳) *</label>
                <button
                  type="button"
                  onClick={() => setPayAmount(String(payTarget.due))}
                  className="dm-section-link"
                >
                  সম্পূর্ণ পরিশোধ
                </button>
              </div>
              <input
                id="sup-pay-amt"
                required
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="যেমন: 10000"
                className="dm-input"
              />
            </div>

            <div className="dm-field">
              <label htmlFor="sup-pay-note">নোট (ঐচ্ছিক)</label>
              <input
                id="sup-pay-note"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="যেমন: চালানের বকেয়া নগদ পরিশোধ"
                className="dm-input"
              />
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}
