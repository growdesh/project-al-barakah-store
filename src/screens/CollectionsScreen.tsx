import {
  ArrowLeft,
  Banknote,
  CalendarCheck,
  Plus,
  Receipt,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ModalDialog } from "../components/ModalDialog";
import { useApp } from "../context/AppContext";
import {
  formatDateBn,
  formatMoneyBn,
  localDayKey,
  parseAmountInput,
  toBn,
} from "../lib/format";
import { navigate } from "../lib/router";

export function CollectionsScreen() {
  const { user, data, toast, createCollection } = useApp();

  const [search, setSearch] = useState<string>("");
  const [staffFilter, setStaffFilter] = useState<string>("all");

  // Collect Due modal
  const [collectOpen, setCollectOpen] = useState<boolean>(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [amountInput, setAmountInput] = useState<string>("");
  const [noteInput, setNoteInput] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const customers = data?.customers ?? [];
  const collections = data?.collections ?? [];
  const invoices = data?.invoices ?? [];
  const staffList = data?.staff ?? [];
  const isAdmin = user?.role === "admin";

  const dueCustomers = useMemo(
    () => customers.filter((c) => c.due > 0),
    [customers],
  );

  useEffect(() => {
    if (!collectOpen) return;
    if (!dueCustomers.some((c) => c.id === selectedCustomerId)) {
      setSelectedCustomerId(dueCustomers[0]?.id ?? "");
      setSelectedInvoiceId("");
    }
  }, [collectOpen, dueCustomers, selectedCustomerId]);

  const selectedCustomer = useMemo(
    () => dueCustomers.find((c) => c.id === selectedCustomerId),
    [dueCustomers, selectedCustomerId],
  );

  const customerOpenInvoices = useMemo(() => {
    if (!selectedCustomerId) return [];
    return invoices.filter(
      (inv) => inv.customerId === selectedCustomerId && inv.due > 0,
    );
  }, [invoices, selectedCustomerId]);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staffList) {
      if (
        s.role === "staff" ||
        s.role === "admin" ||
        collections.some((c) => c.staffId === s.id)
      ) {
        map.set(s.id, s.name);
      }
    }
    for (const col of collections) {
      if (!map.has(col.staffId)) {
        map.set(col.staffId, col.staffName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [staffList, collections]);

  const stats = useMemo(() => {
    const todayKey = localDayKey(new Date().toISOString());
    const totalReceivable = customers.reduce((sum, c) => sum + c.due, 0);
    const totalCollected = collections.reduce((sum, c) => sum + c.amount, 0);
    const todayCollected = collections
      .filter((c) => localDayKey(c.date) === todayKey)
      .reduce((sum, c) => sum + c.amount, 0);
    return {
      totalReceivable,
      totalCollected,
      todayCollected,
      dueCustomerCount: dueCustomers.length,
    };
  }, [customers, collections, dueCustomers.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return collections.filter((col) => {
      if (isAdmin && staffFilter !== "all" && col.staffId !== staffFilter) {
        return false;
      }
      if (!q) return true;
      return (
        col.receiptNo.toLowerCase().includes(q) ||
        col.customerName.toLowerCase().includes(q) ||
        col.customerMobile.toLowerCase().includes(q) ||
        (col.invoiceNumber ?? "").toLowerCase().includes(q) ||
        (col.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [collections, isAdmin, staffFilter, search]);

  const openCollectModal = () => {
    const first = dueCustomers[0];
    setSelectedCustomerId(first?.id ?? "");
    setSelectedInvoiceId("");
    setAmountInput("");
    setNoteInput("");
    setCollectOpen(true);
  };

  const handleCollectSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!selectedCustomer) {
      toast("বকেয়া আছে এমন একজন কাস্টমার নির্বাচন করুন");
      return;
    }

    const amount = Math.round(parseAmountInput(amountInput) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("আদায়ের পরিমাণ শূন্যের বেশি হতে হবে");
      return;
    }
    if (amount > selectedCustomer.due) {
      toast("আদায়ের পরিমাণ কাস্টমারের মোট বকেয়ার চেয়ে বেশি হতে পারবে না");
      return;
    }

    setSubmitting(true);
    try {
      await createCollection({
        customerId: selectedCustomer.id,
        amount,
        invoiceId: selectedInvoiceId || undefined,
        note: noteInput.trim() || undefined,
      });
      setAmountInput("");
      setNoteInput("");
      setSelectedInvoiceId("");
      setCollectOpen(false);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "বাকি আদায় সংরক্ষণ করা যায়নি",
      );
    } finally {
      setSubmitting(false);
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
            <h1 className="dm-page-title">বাকি আদায়</h1>
            <p className="dm-page-sub">
              কাস্টমারের বকেয়া থেকে নগদ টাকা গ্রহণ ও ইতিহাস
            </p>
          </div>
        </div>
        <div className="dm-page-actions">
          <button
            type="button"
            onClick={openCollectModal}
            className="dm-btn dm-btn-primary"
            style={{ minHeight: 44 }}
          >
            <Plus size={17} aria-hidden="true" />
            <span>নগদ বাকি আদায়</span>
          </button>
        </div>
      </div>

      {/* Role-scoped KPIs */}
      {isAdmin ? (
        <div className="dm-kpi-grid">
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-rose" aria-hidden="true">
              <Wallet size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">মোট বাকি পাওনা</span>
              <span className="dm-kpi-value dm-text-rose">
                {formatMoneyBn(stats.totalReceivable)}
              </span>
            </span>
          </div>
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
              <Banknote size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">মোট বকেয়া আদায়</span>
              <span className="dm-kpi-value dm-text-emerald">
                {formatMoneyBn(stats.totalCollected)}
              </span>
            </span>
          </div>
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
              <CalendarCheck size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">আজকের আদায়</span>
              <span className="dm-kpi-value dm-text-blue">
                {formatMoneyBn(stats.todayCollected)}
              </span>
            </span>
          </div>
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-amber" aria-hidden="true">
              <Users size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">বাকি আছে</span>
              <span className="dm-kpi-value dm-text-amber">
                {toBn(stats.dueCustomerCount)}জন
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="dm-kpi-grid">
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
              <Banknote size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">আমার মোট বাকি আদায়</span>
              <span className="dm-kpi-value dm-text-emerald">
                {formatMoneyBn(stats.totalCollected)}
              </span>
            </span>
          </div>
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
              <CalendarCheck size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">আজকের আদায়</span>
              <span className="dm-kpi-value dm-text-blue">
                {formatMoneyBn(stats.todayCollected)}
              </span>
            </span>
          </div>
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-purple" aria-hidden="true">
              <Receipt size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">আদায়ের সংখ্যা</span>
              <span className="dm-kpi-value">
                {toBn(collections.length)}টি
              </span>
            </span>
          </div>
          <div className="dm-kpi-card">
            <span className="dm-kpi-icon dm-tone-amber" aria-hidden="true">
              <Users size={19} />
            </span>
            <span className="dm-kpi-meta">
              <span className="dm-kpi-label">বাকি আছে কাস্টমার</span>
              <span className="dm-kpi-value dm-text-amber">
                {toBn(stats.dueCustomerCount)}জন
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Search & Admin Staff Filter */}
      <div className="dm-search-row">
        <div className="dm-search-box">
          <Search size={17} className="dm-search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="রসিদ বা কাস্টমার খুঁজুন"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="রসিদ নং, কাস্টমার, মোবাইল বা ইনভয়েস খুঁজুন…"
            className="dm-search-input"
          />
        </div>

        {isAdmin && (
          <select
            aria-label="আদায়কারী স্টাফ ফিল্টার"
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

      {/* Collections Table */}
      <div
        tabIndex={0}
        role="region"
        aria-label="নগদ বাকি আদায়ের তালিকা"
        className="dm-table-wrap"
      >
        <table className="dm-table">
          <thead>
            <tr>
              <th>রসিদ ও তারিখ</th>
              <th>কাস্টমার</th>
              <th>ইনভয়েস / নোট</th>
              {isAdmin && <th>আদায়কারী</th>}
              <th>নগদ আদায়</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="dm-empty-inline">
                  কোনো বাকি আদায়ের রেকর্ড পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              filtered.map((col) => (
                <tr key={col.id}>
                  <td>
                    <strong
                      className="dm-text-emerald"
                      style={{ display: "block" }}
                    >
                      {col.receiptNo}
                    </strong>
                    <small className="dm-text-muted">
                      {formatDateBn(col.date, true)}
                    </small>
                  </td>
                  <td>
                    <strong style={{ display: "block" }}>
                      {col.customerName}
                    </strong>
                    <small className="dm-text-muted">{col.customerMobile}</small>
                  </td>
                  <td>
                    {col.invoiceNumber ? (
                      <span
                        className="dm-badge dm-badge-blue"
                        style={{ marginBottom: col.note ? 4 : 0 }}
                      >
                        {col.invoiceNumber}
                      </span>
                    ) : (
                      <span className="dm-badge dm-badge-slate">
                        বকেয়া সমন্বয়
                      </span>
                    )}
                    {col.note && (
                      <div
                        className="dm-text-muted"
                        style={{ fontSize: 12, marginTop: 2 }}
                      >
                        {col.note}
                      </div>
                    )}
                  </td>
                  {isAdmin && <td>{col.staffName}</td>}
                  <td>
                    <strong className="dm-text-emerald">
                      + {formatMoneyBn(col.amount)}
                    </strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Collect Due Modal (CASH ONLY) */}
      <ModalDialog
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        title="নগদ বাকি আদায়"
        subtitle="কাস্টমারের বকেয়া থেকে নগদ টাকা গ্রহণ করুন"
        footer={
          dueCustomers.length === 0 ? (
            <button
              type="button"
              onClick={() => setCollectOpen(false)}
              className="dm-btn dm-btn-primary"
              style={{ minHeight: 44 }}
            >
              বন্ধ করুন
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCollectOpen(false)}
                className="dm-btn dm-btn-outline"
                style={{ minHeight: 44 }}
              >
                বাতিল
              </button>
              <button
                type="submit"
                form="dm-collect-due-form"
                disabled={submitting}
                className="dm-btn dm-btn-primary"
                style={{ minHeight: 44 }}
              >
                {submitting ? "সংরক্ষণ হচ্ছে…" : "নগদ আদায় সংরক্ষণ"}
              </button>
            </>
          )
        }
      >
        {dueCustomers.length === 0 ? (
          <div className="dm-empty-state" style={{ paddingBlock: 18 }}>
            <Wallet size={30} aria-hidden="true" />
            <strong>কোনো বকেয়া পাওনা নেই</strong>
            <span>সব কাস্টমারের বকেয়া সম্পূর্ণ পরিশোধিত রয়েছে।</span>
          </div>
        ) : (
          <form
            id="dm-collect-due-form"
            onSubmit={handleCollectSubmit}
            className="dm-form-grid"
          >
            <div className="dm-field">
              <label htmlFor="dm-col-customer">কাস্টমার নির্বাচন *</label>
              <select
                id="dm-col-customer"
                required
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setSelectedInvoiceId("");
                }}
                className="dm-select"
              >
                {dueCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${c.name} (${c.mobile}) — বাকি: ${formatMoneyBn(c.due)}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="dm-field">
              <label htmlFor="dm-col-invoice">নির্দিষ্ট ইনভয়েস (ঐচ্ছিক)</label>
              <select
                id="dm-col-invoice"
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="dm-select"
              >
                <option value="">স্বয়ংক্রিয়ভাবে বকেয়া সমন্বয়</option>
                {customerOpenInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {`${inv.number} (${formatDateBn(inv.date)}) — বাকি ${formatMoneyBn(inv.due)}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="dm-field">
              <label htmlFor="dm-col-amount">নগদ আদায়ের পরিমাণ (৳) *</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  id="dm-col-amount"
                  type="text"
                  inputMode="numeric"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="যেমন: 5000"
                  className="dm-input"
                  style={{ flex: 1, minWidth: 140 }}
                />
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => setAmountInput(String(selectedCustomer.due))}
                    className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                    style={{ minHeight: 44 }}
                  >
                    সম্পূর্ণ বাকি ({formatMoneyBn(selectedCustomer.due)})
                  </button>
                )}
              </div>
            </div>

            <div className="dm-field">
              <label htmlFor="dm-col-note">নোট (ঐচ্ছিক)</label>
              <input
                id="dm-col-note"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="সংক্ষিপ্ত মন্তব্য লিখুন…"
                className="dm-input"
              />
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}
