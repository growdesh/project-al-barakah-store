import {
  ArrowLeft,
  Edit3,
  Eye,
  Plus,
  Search,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
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
import type { Customer, InvoiceStatus } from "../types";

function invoiceBadge(status: InvoiceStatus) {
  if (status === "paid") {
    return { label: "পরিশোধিত", cls: "dm-badge dm-badge-emerald" };
  }
  if (status === "partial") {
    return { label: "আংশিক", cls: "dm-badge dm-badge-amber" };
  }
  return { label: "বাকি", cls: "dm-badge dm-badge-rose" };
}

export function CustomersScreen() {
  const {
    user,
    data,
    toast,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    createCollection,
  } = useApp();

  const [search, setSearch] = useState<string>("");
  const [tab, setTab] = useState<"all" | "due" | "paid">("all");

  // Add customer modal
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [cName, setCName] = useState<string>("");
  const [cMobile, setCMobile] = useState<string>("");
  const [cArea, setCArea] = useState<string>("");
  const [cOpeningDue, setCOpeningDue] = useState<string>("0");
  const [addSubmitting, setAddSubmitting] = useState<boolean>(false);

  // Edit customer modal (Admin only)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editMobile, setEditMobile] = useState<string>("");
  const [editArea, setEditArea] = useState<string>("");
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);

  // Delete confirmation modal (Admin only)
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(
    null,
  );
  const [deleteSubmitting, setDeleteSubmitting] = useState<boolean>(false);

  // Detail modal
  const [viewCustomerId, setViewCustomerId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"invoices" | "collections">(
    "invoices",
  );
  const [inlineAmount, setInlineAmount] = useState<string>("");
  const [inlineNote, setInlineNote] = useState<string>("");
  const [inlineSubmitting, setInlineSubmitting] = useState<boolean>(false);

  const customers = data?.customers ?? [];
  const invoices = data?.invoices ?? [];
  const collections = data?.collections ?? [];
  const isAdmin = user?.role === "admin";

  const stats = useMemo(() => {
    const totalDue = customers.reduce((sum, c) => sum + c.due, 0);
    const dueCount = customers.filter((c) => c.due > 0).length;
    return { totalCount: customers.length, totalDue, dueCount };
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (tab === "due" && c.due <= 0) return false;
      if (tab === "paid" && c.due > 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q) ||
        c.area.toLowerCase().includes(q)
      );
    });
  }, [customers, search, tab]);

  const viewCustomer = useMemo(
    () =>
      viewCustomerId
        ? (customers.find((c) => c.id === viewCustomerId) ?? null)
        : null,
    [customers, viewCustomerId],
  );

  const customerInvoices = useMemo(
    () =>
      viewCustomer
        ? invoices.filter((inv) => inv.customerId === viewCustomer.id)
        : [],
    [invoices, viewCustomer],
  );

  const customerCollections = useMemo(
    () =>
      viewCustomer
        ? collections.filter((col) => col.customerId === viewCustomer.id)
        : [],
    [collections, viewCustomer],
  );

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (addSubmitting) return;

    const name = cName.trim();
    const mobile = normalizePhone(cMobile);
    const area = cArea.trim();
    const openingDue = Math.max(0, Math.round(parseAmountInput(cOpeningDue)));

    if (!name) {
      toast("কাস্টমারের নাম লিখুন");
      return;
    }
    if (mobile.length < 6) {
      toast("সঠিক মোবাইল নম্বর দিন");
      return;
    }

    setAddSubmitting(true);
    try {
      await createCustomer({
        name,
        mobile,
        area: area || "ঢাকা",
        openingDue,
      });
      setCName("");
      setCMobile("");
      setCArea("");
      setCOpeningDue("0");
      setAddOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "কাস্টমার যোগ করা যায়নি");
    } finally {
      setAddSubmitting(false);
    }
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setEditName(c.name);
    setEditMobile(c.mobile);
    setEditArea(c.area);
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || editSubmitting) return;

    const name = editName.trim();
    const mobile = normalizePhone(editMobile);
    const area = editArea.trim();

    if (!name) {
      toast("কাস্টমারের নাম লিখুন");
      return;
    }
    if (mobile.length < 6) {
      toast("সঠিক মোবাইল নম্বর দিন");
      return;
    }

    setEditSubmitting(true);
    try {
      await updateCustomer(editingCustomer.id, {
        name,
        mobile,
        area: area || "ঢাকা",
      });
      setEditingCustomer(null);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "কাস্টমার তথ্য আপডেট করা যায়নি",
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCustomer || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteCustomer(deletingCustomer.id);
      if (viewCustomerId === deletingCustomer.id) {
        setViewCustomerId(null);
      }
      setDeletingCustomer(null);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "কাস্টমার মুছে ফেলা যায়নি",
      );
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openDetailModal = (c: Customer) => {
    setViewCustomerId(c.id);
    setDetailTab("invoices");
    setInlineAmount("");
    setInlineNote("");
  };

  const handleInlineCollect = async (e: FormEvent) => {
    e.preventDefault();
    if (!viewCustomer || inlineSubmitting) return;

    const amount = Math.round(parseAmountInput(inlineAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("আদায়ের পরিমাণ শূন্যের বেশি হতে হবে");
      return;
    }
    if (amount > viewCustomer.due) {
      toast("আদায়ের পরিমাণ কাস্টমারের মোট বকেয়ার চেয়ে বেশি হতে পারবে না");
      return;
    }

    setInlineSubmitting(true);
    try {
      await createCollection({
        customerId: viewCustomer.id,
        amount,
        note: inlineNote.trim() || undefined,
      });
      setInlineAmount("");
      setInlineNote("");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "বাকি আদায় সংরক্ষণ করা যায়নি",
      );
    } finally {
      setInlineSubmitting(false);
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
            <h1 className="dm-page-title">কাস্টমার</h1>
            <p className="dm-page-sub">
              মোট {toBn(stats.totalCount)}জন নিবন্ধিত কাস্টমার
            </p>
          </div>
        </div>
        <div className="dm-page-actions">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="dm-btn dm-btn-primary"
            style={{ minHeight: 44 }}
          >
            <Plus size={17} aria-hidden="true" />
            <span>নতুন কাস্টমার</span>
          </button>
        </div>
      </div>

      {/* 3 KPIs */}
      <div className="dm-kpi-grid-3">
        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
            <Users size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট কাস্টমার</span>
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
            <span className="dm-kpi-label">মোট পাওনা</span>
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
            <span className="dm-kpi-label">বাকি আছে</span>
            <span className="dm-kpi-value dm-text-amber">
              {toBn(stats.dueCount)}জন
            </span>
          </span>
        </div>
      </div>

      {/* Search & Filter Pills */}
      <div className="dm-search-row">
        <div className="dm-search-box">
          <Search size={17} className="dm-search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="কাস্টমার খুঁজুন"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="নাম, মোবাইল বা এলাকা খুঁজুন…"
            className="dm-search-input"
          />
        </div>
      </div>

      <div
        className="dm-pills dm-pills-scroll"
        role="tablist"
        aria-label="কাস্টমার ফিল্টার"
      >
        {[
          { id: "all" as const, label: "সব" },
          { id: "due" as const, label: "বাকি আছে" },
          { id: "paid" as const, label: "পরিশোধিত" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`dm-pill${tab === item.id ? " is-active" : ""}`}
            style={{ minHeight: 44 }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Customers Table */}
      <div
        tabIndex={0}
        role="region"
        aria-label="কাস্টমার তালিকা"
        className="dm-table-wrap"
      >
        <table className="dm-table">
          <thead>
            <tr>
              <th>কাস্টমার</th>
              <th>মোবাইল</th>
              <th>এলাকা</th>
              <th>বাকি</th>
              <th>কার্যক্রম</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="dm-empty-inline">
                  কোনো কাস্টমার পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong className="dm-text-emerald">{c.name}</strong>
                  </td>
                  <td>{c.mobile}</td>
                  <td>{c.area || "—"}</td>
                  <td
                    className={c.due > 0 ? "dm-text-rose" : "dm-text-emerald"}
                    style={{ fontWeight: 700 }}
                  >
                    {formatMoneyBn(c.due)}
                  </td>
                  <td>
                    <div className="dm-table-actions">
                      <button
                        type="button"
                        aria-label={`${c.name} দেখুন`}
                        onClick={() => openDetailModal(c)}
                        className="dm-btn dm-btn-outline dm-btn-sm"
                        style={{ minHeight: 44 }}
                      >
                        <Eye size={15} aria-hidden="true" />
                        <span>দেখুন</span>
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            aria-label={`${c.name} সম্পাদনা`}
                            onClick={() => openEditModal(c)}
                            className="dm-icon-btn"
                            style={{ minWidth: 44, minHeight: 44 }}
                          >
                            <Edit3 size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`${c.name} মুছুন`}
                            onClick={() => setDeletingCustomer(c)}
                            className="dm-icon-btn"
                            style={{
                              minWidth: 44,
                              minHeight: 44,
                              color: "var(--dm-rose)",
                            }}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Customer Modal (Admin & Staff) */}
      <ModalDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="নতুন কাস্টমার যোগ করুন"
        subtitle="বাকি হিসাব ও লেজারে যুক্ত হবে"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="dm-btn dm-btn-outline"
              style={{ minHeight: 44 }}
            >
              বাতিল
            </button>
            <button
              type="submit"
              form="dm-add-customer-form"
              disabled={addSubmitting}
              className="dm-btn dm-btn-primary"
              style={{ minHeight: 44 }}
            >
              {addSubmitting ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </button>
          </>
        }
      >
        <form
          id="dm-add-customer-form"
          onSubmit={handleAddSubmit}
          className="dm-form-grid"
        >
          <div className="dm-field">
            <label htmlFor="dm-cust-name">নাম *</label>
            <input
              id="dm-cust-name"
              required
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="কাস্টমার বা দোকানের নাম"
              className="dm-input"
            />
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-cust-mobile">মোবাইল *</label>
              <input
                id="dm-cust-mobile"
                type="tel"
                inputMode="tel"
                required
                value={cMobile}
                onChange={(e) => setCMobile(e.target.value)}
                placeholder="017XXXXXXXX"
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-cust-area">এলাকা</label>
              <input
                id="dm-cust-area"
                value={cArea}
                onChange={(e) => setCArea(e.target.value)}
                placeholder="চকবাজার, ঢাকা"
                className="dm-input"
              />
            </div>
          </div>
          <div className="dm-field">
            <label htmlFor="dm-cust-due">প্রারম্ভিক বাকি (৳)</label>
            <input
              id="dm-cust-due"
              type="text"
              inputMode="numeric"
              value={cOpeningDue}
              onChange={(e) => setCOpeningDue(e.target.value)}
              className="dm-input"
            />
          </div>
        </form>
      </ModalDialog>

      {/* Edit Customer Modal (Admin only) */}
      {isAdmin && (
        <ModalDialog
          open={Boolean(editingCustomer)}
          onClose={() => setEditingCustomer(null)}
          title="কাস্টমার তথ্য সম্পাদনা"
          subtitle={editingCustomer?.name}
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="dm-btn dm-btn-outline"
                style={{ minHeight: 44 }}
              >
                বাতিল
              </button>
              <button
                type="submit"
                form="dm-edit-customer-form"
                disabled={editSubmitting}
                className="dm-btn dm-btn-primary"
                style={{ minHeight: 44 }}
              >
                {editSubmitting ? "আপডেট হচ্ছে…" : "আপডেট করুন"}
              </button>
            </>
          }
        >
          <form
            id="dm-edit-customer-form"
            onSubmit={handleEditSubmit}
            className="dm-form-grid"
          >
            <div className="dm-field">
              <label htmlFor="dm-edit-cust-name">নাম *</label>
              <input
                id="dm-edit-cust-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="dm-input"
              />
            </div>
            <div className="dm-form-row-2">
              <div className="dm-field">
                <label htmlFor="dm-edit-cust-mobile">মোবাইল *</label>
                <input
                  id="dm-edit-cust-mobile"
                  type="tel"
                  inputMode="tel"
                  required
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value)}
                  className="dm-input"
                />
              </div>
              <div className="dm-field">
                <label htmlFor="dm-edit-cust-area">এলাকা</label>
                <input
                  id="dm-edit-cust-area"
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value)}
                  className="dm-input"
                />
              </div>
            </div>
          </form>
        </ModalDialog>
      )}

      {/* Delete Customer Confirmation Modal (Admin only) */}
      {isAdmin && (
        <ModalDialog
          open={Boolean(deletingCustomer)}
          onClose={() => setDeletingCustomer(null)}
          title="কাস্টমার মুছে ফেলুন"
          subtitle={
            deletingCustomer
              ? `${deletingCustomer.name} · ${deletingCustomer.mobile}`
              : undefined
          }
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                className="dm-btn dm-btn-outline"
                style={{ minHeight: 44 }}
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={
                  deleteSubmitting || (deletingCustomer?.due ?? 0) > 0
                }
                onClick={handleDeleteConfirm}
                className="dm-btn dm-btn-danger"
                style={{ minHeight: 44 }}
              >
                {deleteSubmitting ? "মুছে ফেলা হচ্ছে…" : "নিশ্চিত মুছুন"}
              </button>
            </>
          }
        >
          {deletingCustomer && (
            <div className="dm-stack-sm">
              {deletingCustomer.due > 0 ? (
                <div className="dm-alert-error" role="alert">
                  সতর্কতা: এই কাস্টমারের নামে{" "}
                  {formatMoneyBn(deletingCustomer.due)} বাকি পাওনা রয়েছে।
                  বকেয়া শূন্য না হওয়া পর্যন্ত কাস্টমার মুছে ফেলা যাবে না।
                </div>
              ) : (
                <p>
                  আপনি কি নিশ্চিত যে{" "}
                  <strong>{deletingCustomer.name}</strong>-কে কাস্টমার তালিকা
                  থেকে স্থায়ীভাবে মুছে ফেলতে চান?
                </p>
              )}
            </div>
          )}
        </ModalDialog>
      )}

      {/* Customer Detail Modal (with inline Cash Collection & history) */}
      <ModalDialog
        open={Boolean(viewCustomer)}
        onClose={() => setViewCustomerId(null)}
        size="lg"
        title={viewCustomer?.name ?? ""}
        subtitle={
          viewCustomer
            ? `${viewCustomer.mobile} · ${viewCustomer.area || "ঢাকা"}`
            : undefined
        }
        footer={
          <button
            type="button"
            onClick={() => setViewCustomerId(null)}
            className="dm-btn dm-btn-primary"
            style={{ minHeight: 44 }}
          >
            বন্ধ করুন
          </button>
        }
      >
        {viewCustomer && (
          <div className="dm-stack-md">
            <div
              className="dm-card dm-card-pad-sm"
              style={{ background: "var(--dm-surface-tint)" }}
            >
              <div className="dm-summary-row">
                <span>প্রারম্ভিক বাকি</span>
                <strong>{formatMoneyBn(viewCustomer.openingDue)}</strong>
              </div>
              <div className="dm-summary-row" style={{ marginTop: 6 }}>
                <span>বর্তমান মোট বাকি</span>
                <strong
                  className={
                    viewCustomer.due > 0 ? "dm-text-rose" : "dm-text-emerald"
                  }
                  style={{ fontSize: 18 }}
                >
                  {formatMoneyBn(viewCustomer.due)}
                </strong>
              </div>
            </div>

            {/* Inline Cash Due Collection when due > 0 */}
            {viewCustomer.due > 0 && (
              <form
                onSubmit={handleInlineCollect}
                className="dm-card dm-card-pad-sm dm-form-grid"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <strong style={{ fontSize: 14.5 }}>
                    দ্রুত নগদ বাকি আদায়
                  </strong>
                  <button
                    type="button"
                    onClick={() => setInlineAmount(String(viewCustomer.due))}
                    className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                    style={{ minHeight: 44 }}
                  >
                    পূর্ণ বাকি ({formatMoneyBn(viewCustomer.due)})
                  </button>
                </div>

                <div className="dm-form-row-2">
                  <div className="dm-field">
                    <label htmlFor="dm-cust-inline-amt">
                      নগদ আদায়ের পরিমাণ (৳) *
                    </label>
                    <input
                      id="dm-cust-inline-amt"
                      type="text"
                      inputMode="numeric"
                      required
                      value={inlineAmount}
                      onChange={(e) => setInlineAmount(e.target.value)}
                      placeholder="টাকার পরিমাণ"
                      className="dm-input"
                    />
                  </div>
                  <div className="dm-field">
                    <label htmlFor="dm-cust-inline-note">নোট (ঐচ্ছিক)</label>
                    <input
                      id="dm-cust-inline-note"
                      value={inlineNote}
                      onChange={(e) => setInlineNote(e.target.value)}
                      placeholder="সংক্ষিপ্ত নোট"
                      className="dm-input"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={inlineSubmitting}
                  className="dm-btn dm-btn-primary"
                  style={{ minHeight: 44 }}
                >
                  {inlineSubmitting
                    ? "সংরক্ষণ হচ্ছে…"
                    : "নগদ আদায় সংরক্ষণ করুন"}
                </button>
              </form>
            )}

            {/* Tabs for Customer Invoices & Collections */}
            <div>
              <div
                className="dm-tabs"
                role="tablist"
                aria-label="কাস্টমার লেনদেন ইতিহাস"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === "invoices"}
                  onClick={() => setDetailTab("invoices")}
                  className={`dm-tab${detailTab === "invoices" ? " is-active" : ""}`}
                >
                  বিক্রয় চালান ({toBn(customerInvoices.length)})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === "collections"}
                  onClick={() => setDetailTab("collections")}
                  className={`dm-tab${detailTab === "collections" ? " is-active" : ""}`}
                >
                  বাকি আদায় ({toBn(customerCollections.length)})
                </button>
              </div>

              {detailTab === "invoices" ? (
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="কাস্টমারের বিক্রয় চালান"
                  className="dm-table-wrap"
                >
                  <table className="dm-table">
                    <thead>
                      <tr>
                        <th>চালান</th>
                        <th>মোট</th>
                        <th>নগদ জমা</th>
                        <th>বাকি</th>
                        <th>অবস্থা</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="dm-empty-inline">
                            কোনো বিক্রয় চালান নেই
                          </td>
                        </tr>
                      ) : (
                        customerInvoices.map((inv) => {
                          const badge = invoiceBadge(inv.status);
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
                                <strong>{formatMoneyBn(inv.total)}</strong>
                              </td>
                              <td className="dm-text-emerald">
                                {formatMoneyBn(inv.paid)}
                              </td>
                              <td
                                className={
                                  inv.due > 0 ? "dm-text-rose" : "dm-text-muted"
                                }
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
                  aria-label="কাস্টমারের বাকি আদায় ইতিহাস"
                  className="dm-table-wrap"
                >
                  <table className="dm-table">
                    <thead>
                      <tr>
                        <th>রসিদ ও তারিখ</th>
                        <th>ইনভয়েস / নোট</th>
                        <th>আদায়কারী</th>
                        <th>পরিমাণ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerCollections.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="dm-empty-inline">
                            কোনো বাকি আদায় রেকর্ড নেই
                          </td>
                        </tr>
                      ) : (
                        customerCollections.map((col) => (
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
                              {col.invoiceNumber || "বকেয়া সমন্বয়"}
                              {col.note ? ` · ${col.note}` : ""}
                            </td>
                            <td>{col.staffName}</td>
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
              )}
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
