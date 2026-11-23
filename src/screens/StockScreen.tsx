import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Edit3,
  Package,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { ModalDialog } from "../components/ModalDialog";
import { useApp } from "../context/AppContext";
import {
  formatMoneyBn,
  formatNumberBn,
  parseAmountInput,
  toBn,
} from "../lib/format";
import { navigate } from "../lib/router";
import type { Product } from "../types";

export function StockScreen() {
  const {
    user,
    data,
    toast,
    createProduct,
    updateProduct,
    adjustStock,
    deleteProduct,
  } = useApp();

  const [search, setSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("সব");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");

  // Add Product modal
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [addName, setAddName] = useState<string>("");
  const [addCategory, setAddCategory] = useState<string>("সাধারণ");
  const [addUnit, setAddUnit] = useState<string>("পিস");
  const [addSku, setAddSku] = useState<string>("");
  const [addBarcode, setAddBarcode] = useState<string>("");
  const [addPurchaseRate, setAddPurchaseRate] = useState<string>("");
  const [addSaleRate, setAddSaleRate] = useState<string>("");
  const [addStock, setAddStock] = useState<string>("25");
  const [addMinStock, setAddMinStock] = useState<string>("10");
  const [addSubmitting, setAddSubmitting] = useState<boolean>(false);

  // Edit Product modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editUnit, setEditUnit] = useState<string>("");
  const [editSku, setEditSku] = useState<string>("");
  const [editBarcode, setEditBarcode] = useState<string>("");
  const [editPurchaseRate, setEditPurchaseRate] = useState<string>("");
  const [editSaleRate, setEditSaleRate] = useState<string>("");
  const [editStock, setEditStock] = useState<string>("");
  const [editMinStock, setEditMinStock] = useState<string>("");
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);

  // Quick Stock Adjust modal
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [adjustMode, setAdjustMode] = useState<"add" | "subtract" | "set">(
    "add",
  );
  const [adjustQty, setAdjustQty] = useState<string>("");
  const [adjustSubmitting, setAdjustSubmitting] = useState<boolean>(false);

  // Delete confirmation modal
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState<boolean>(false);

  const products = data?.products ?? [];
  const allowNegativeStock = Boolean(data?.settings?.allowNegativeStock);

  const categories = useMemo(() => {
    const s = new Set(products.map((p) => p.category).filter(Boolean));
    return ["সব", ...Array.from(s)];
  }, [products]);

  const kpis = useMemo(() => {
    const totalUnits = products.reduce(
      (sum, p) => sum + Math.max(0, p.stock),
      0,
    );
    const totalCostValue = products.reduce(
      (sum, p) => sum + Math.max(0, p.stock) * (p.purchaseRate ?? 0),
      0,
    );
    const lowOrOutCount = products.filter((p) => p.stock <= p.minStock).length;
    return {
      productCount: products.length,
      totalUnits,
      totalCostValue,
      lowOrOutCount,
    };
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "সব" && p.category !== categoryFilter) return false;
      if (stockFilter === "low" && !(p.stock > 0 && p.stock <= p.minStock)) {
        return false;
      }
      if (stockFilter === "out" && p.stock > 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryFilter, stockFilter]);

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (addSubmitting) return;

    const name = addName.trim();
    if (!name) {
      toast("পণ্যের নাম লিখুন");
      return;
    }

    const purchaseRate = Math.max(0, parseAmountInput(addPurchaseRate));
    const saleRate = Math.max(0, parseAmountInput(addSaleRate));
    const stock = Math.max(0, parseAmountInput(addStock));
    const minStock = Math.max(0, parseAmountInput(addMinStock));

    if (saleRate <= 0) {
      toast("বিক্রয় মূল্য শূন্যের বেশি হতে হবে");
      return;
    }

    setAddSubmitting(true);
    try {
      await createProduct({
        name,
        category: addCategory.trim() || "সাধারণ",
        unit: addUnit.trim() || "পিস",
        sku: addSku.trim() || undefined,
        barcode: addBarcode.trim() || undefined,
        purchaseRate,
        saleRate,
        stock,
        minStock,
      });
      setAddName("");
      setAddCategory("সাধারণ");
      setAddUnit("পিস");
      setAddSku("");
      setAddBarcode("");
      setAddPurchaseRate("");
      setAddSaleRate("");
      setAddStock("25");
      setAddMinStock("10");
      setAddOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "পণ্য যোগ করা যায়নি");
    } finally {
      setAddSubmitting(false);
    }
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setEditName(p.name);
    setEditCategory(p.category);
    setEditUnit(p.unit);
    setEditSku(p.sku);
    setEditBarcode(p.barcode);
    setEditPurchaseRate(String(p.purchaseRate ?? 0));
    setEditSaleRate(String(p.saleRate));
    setEditStock(String(p.stock));
    setEditMinStock(String(p.minStock));
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct || editSubmitting) return;

    const name = editName.trim();
    if (!name) {
      toast("পণ্যের নাম লিখুন");
      return;
    }

    const purchaseRate = Math.max(0, parseAmountInput(editPurchaseRate));
    const saleRate = Math.max(0, parseAmountInput(editSaleRate));
    const stock = parseAmountInput(editStock);
    const minStock = Math.max(0, parseAmountInput(editMinStock));

    if (saleRate <= 0) {
      toast("বিক্রয় মূল্য শূন্যের বেশি হতে হবে");
      return;
    }
    if (stock < 0 && !allowNegativeStock) {
      toast("স্টক শূন্যের কম হতে পারবে না");
      return;
    }

    setEditSubmitting(true);
    try {
      await updateProduct(editingProduct.id, {
        name,
        category: editCategory.trim() || "সাধারণ",
        unit: editUnit.trim() || "পিস",
        sku: editSku.trim() || undefined,
        barcode: editBarcode.trim(),
        purchaseRate,
        saleRate,
        stock,
        minStock,
      });
      setEditingProduct(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "পণ্য আপডেট করা যায়নি");
    } finally {
      setEditSubmitting(false);
    }
  };

  const openAdjustModal = (p: Product) => {
    setStockProduct(p);
    setAdjustMode("add");
    setAdjustQty("");
  };

  const previewStock = useMemo(() => {
    if (!stockProduct) return 0;
    const qty = Math.max(0, parseAmountInput(adjustQty));
    if (adjustMode === "add") return Math.round((stockProduct.stock + qty) * 100) / 100;
    if (adjustMode === "subtract") {
      return Math.round((stockProduct.stock - qty) * 100) / 100;
    }
    return Math.round(qty * 100) / 100;
  }, [stockProduct, adjustMode, adjustQty]);

  const handleAdjustSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stockProduct || adjustSubmitting) return;

    const qty = parseAmountInput(adjustQty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast("সঠিক পরিমাণ লিখুন");
      return;
    }
    if (adjustMode !== "set" && qty <= 0) {
      toast("পরিমাণ শূন্যের বেশি হতে হবে");
      return;
    }
    if (previewStock < 0 && !allowNegativeStock) {
      toast("স্টক শূন্যের নিচে নামানো যাবে না");
      return;
    }

    setAdjustSubmitting(true);
    try {
      await adjustStock(stockProduct.id, { mode: adjustMode, qty });
      setStockProduct(null);
      setAdjustQty("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "স্টক আপডেট করা যায়নি");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingProduct || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteProduct(deletingProduct.id);
      setDeletingProduct(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "পণ্য মুছে ফেলা যায়নি");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  if (!user || !data) return null;

  if (user.role !== "admin") {
    return (
      <div className="dm-access-denied">
        <h2>এই পেজে প্রবেশের অনুমতি নেই</h2>
        <p>শুধুমাত্র অ্যাডমিন পণ্য ও স্টক পরিচালনা করতে পারবেন।</p>
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
            <h1 className="dm-page-title">পণ্য ও স্টক</h1>
            <p className="dm-page-sub">
              পণ্যের বর্তমান মজুত, ক্রয়-বিক্রয় দর ও ইনভেন্টরি নিয়ন্ত্রণ
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
            <span>নতুন পণ্য</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="dm-kpi-grid-4">
        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
            <Package size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট পণ্য</span>
            <span className="dm-kpi-value dm-text-blue">
              {toBn(kpis.productCount)}টি
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
            <Boxes size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট মজুত</span>
            <span className="dm-kpi-value dm-text-emerald">
              {formatNumberBn(kpis.totalUnits)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-purple" aria-hidden="true">
            <Wallet size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">স্টক ক্রয়মূল্য</span>
            <span className="dm-kpi-value">
              {formatMoneyBn(kpis.totalCostValue)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-amber" aria-hidden="true">
            <AlertTriangle size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">কম / শূন্য স্টক</span>
            <span
              className={`dm-kpi-value ${
                kpis.lowOrOutCount > 0 ? "dm-text-rose" : "dm-text-emerald"
              }`}
            >
              {toBn(kpis.lowOrOutCount)}টি
            </span>
          </span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="dm-search-row">
        <div className="dm-search-box">
          <Search size={17} className="dm-search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="পণ্য খুঁজুন"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="পণ্য, SKU বা বারকোড খুঁজুন…"
            className="dm-search-input"
          />
        </div>
      </div>

      <div
        className="dm-pills dm-pills-scroll"
        aria-label="ক্যাটাগরি ও স্টক ফিল্টার"
      >
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={categoryFilter === cat}
            onClick={() => setCategoryFilter(cat)}
            className={`dm-pill${categoryFilter === cat ? " is-active" : ""}`}
            style={{ minHeight: 44 }}
          >
            {cat}
          </button>
        ))}
        {[
          { id: "all" as const, label: "সব স্টক" },
          { id: "low" as const, label: "কম স্টক" },
          { id: "out" as const, label: "স্টক নেই" },
        ].map((sf) => (
          <button
            key={sf.id}
            type="button"
            aria-pressed={stockFilter === sf.id}
            onClick={() => setStockFilter(sf.id)}
            className={`dm-pill${stockFilter === sf.id ? " is-dark" : ""}`}
            style={{ minHeight: 44 }}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Mobile Product Stock List (< 768px) */}
      <div className="dm-mobile-list" aria-label="পণ্য ও স্টক তালিকা">
        {filtered.length === 0 ? (
          <div className="dm-card dm-empty-inline">কোনো পণ্য পাওয়া যায়নি</div>
        ) : (
          filtered.map((p) => {
            const isOut = p.stock <= 0;
            const isLow = p.stock > 0 && p.stock <= p.minStock;
            const stockValue = Math.max(0, p.stock) * (p.purchaseRate ?? 0);
            return (
              <article key={p.id} className="dm-mcard">
                <div className="dm-mcard-top">
                  <div className="dm-mcard-head">
                    <strong>{p.name}</strong>
                  </div>
                  <span
                    className={`dm-badge ${
                      isOut
                        ? "dm-badge-rose"
                        : isLow
                          ? "dm-badge-amber"
                          : "dm-badge-emerald"
                    }`}
                  >
                    {isOut
                      ? "স্টক নেই"
                      : isLow
                        ? `কম: ${toBn(p.stock)} ${p.unit}`
                        : `${toBn(p.stock)} ${p.unit}`}
                  </span>
                </div>
                <div className="dm-mcard-sub">
                  <span>
                    {p.category} · {p.sku}
                  </span>
                </div>
                <div className="dm-mcard-metrics">
                  <span>
                    বিক্রয়:{" "}
                    <strong className="dm-num">
                      {formatMoneyBn(p.saleRate)}
                    </strong>
                  </span>
                  <span>
                    ক্রয়:{" "}
                    <strong className="dm-text-muted dm-num">
                      {formatMoneyBn(p.purchaseRate ?? 0)}
                    </strong>
                  </span>
                  <span>
                    মূল্য:{" "}
                    <strong className="dm-num">
                      {formatMoneyBn(stockValue)}
                    </strong>
                  </span>
                </div>
                <div className="dm-mcard-actions">
                  <button
                    type="button"
                    onClick={() => openAdjustModal(p)}
                    className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                  >
                    স্টক সমন্বয়
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.name} সম্পাদনা`}
                    onClick={() => openEditModal(p)}
                    className="dm-icon-btn"
                  >
                    <Edit3 size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.name} মুছুন`}
                    onClick={() => setDeletingProduct(p)}
                    className="dm-icon-btn dm-icon-btn-danger"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Desktop Stock Table (>= 768px) */}
      <div
        tabIndex={0}
        role="region"
        aria-label="পণ্য ও স্টক তালিকা"
        className="dm-table-wrap dm-desktop-table"
      >
        <table className="dm-table">
          <thead>
            <tr>
              <th>পণ্য ও SKU</th>
              <th>ক্যাটাগরি</th>
              <th>ক্রয় ও বিক্রয় দর</th>
              <th>মজুত</th>
              <th>স্টক মূল্য</th>
              <th>কার্যক্রম</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="dm-empty-inline">
                  কোনো পণ্য পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const isOut = p.stock <= 0;
                const isLow = p.stock > 0 && p.stock <= p.minStock;
                const stockValue = Math.max(0, p.stock) * (p.purchaseRate ?? 0);

                return (
                  <tr key={p.id}>
                    <td>
                      <strong style={{ display: "block" }}>{p.name}</strong>
                      <small className="dm-text-muted">
                        {p.sku}
                        {p.barcode ? ` · ${p.barcode}` : ""}
                      </small>
                    </td>
                    <td>
                      <span style={{ display: "block", fontWeight: 600 }}>
                        {p.category}
                      </span>
                      <small className="dm-text-muted">
                        ইউনিট: {p.unit}
                      </small>
                    </td>
                    <td>
                      <span style={{ display: "block" }}>
                        বিক্রয়: <strong>{formatMoneyBn(p.saleRate)}</strong>
                      </span>
                      <small className="dm-text-muted">
                        ক্রয়: {formatMoneyBn(p.purchaseRate ?? 0)}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`dm-badge ${
                          isOut
                            ? "dm-badge-rose"
                            : isLow
                              ? "dm-badge-amber"
                              : "dm-badge-emerald"
                        }`}
                      >
                        {isOut
                          ? "স্টক নেই"
                          : isLow
                            ? `কম স্টক: ${toBn(p.stock)} ${p.unit}`
                            : `${toBn(p.stock)} ${p.unit}`}
                      </span>
                    </td>
                    <td>
                      <strong>{formatMoneyBn(stockValue)}</strong>
                    </td>
                    <td>
                      <div className="dm-table-actions">
                        <button
                          type="button"
                          onClick={() => openAdjustModal(p)}
                          className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                          style={{ minHeight: 44 }}
                        >
                          স্টক
                        </button>
                        <button
                          type="button"
                          aria-label={`${p.name} সম্পাদনা`}
                          onClick={() => openEditModal(p)}
                          className="dm-icon-btn"
                          style={{ minWidth: 44, minHeight: 44 }}
                        >
                          <Edit3 size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${p.name} মুছুন`}
                          onClick={() => setDeletingProduct(p)}
                          className="dm-icon-btn"
                          style={{
                            minWidth: 44,
                            minHeight: 44,
                            color: "var(--dm-rose)",
                          }}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Product Modal */}
      <ModalDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="নতুন পণ্য যোগ করুন"
        subtitle="ইনভেন্টরিতে নতুন আইটেম যুক্ত হবে"
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
              form="dm-add-product-form"
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
          id="dm-add-product-form"
          onSubmit={handleAddSubmit}
          className="dm-form-grid"
        >
          <div className="dm-field">
            <label htmlFor="dm-stk-name">পণ্যের নাম *</label>
            <input
              id="dm-stk-name"
              required
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="যেমন: মিনিকেট চাল ৫০ কেজি বস্তা"
              className="dm-input"
            />
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-stk-cat">ক্যাটাগরি</label>
              <input
                id="dm-stk-cat"
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value)}
                placeholder="চাল ও ডাল"
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-stk-unit">ইউনিট</label>
              <input
                id="dm-stk-unit"
                value={addUnit}
                onChange={(e) => setAddUnit(e.target.value)}
                placeholder="বস্তা / কার্টন / পিস"
                className="dm-input"
              />
            </div>
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-stk-sku">SKU (ঐচ্ছিক)</label>
              <input
                id="dm-stk-sku"
                value={addSku}
                onChange={(e) => setAddSku(e.target.value)}
                placeholder="স্বয়ংক্রিয় তৈরি হবে"
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-stk-barcode">বারকোড (ঐচ্ছিক)</label>
              <input
                id="dm-stk-barcode"
                value={addBarcode}
                onChange={(e) => setAddBarcode(e.target.value)}
                placeholder="স্বয়ংক্রিয় তৈরি হবে"
                className="dm-input"
              />
            </div>
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-stk-buy">ক্রয় দর (৳)</label>
              <input
                id="dm-stk-buy"
                type="text"
                inputMode="numeric"
                value={addPurchaseRate}
                onChange={(e) => setAddPurchaseRate(e.target.value)}
                placeholder="3200"
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-stk-sell">বিক্রয় দর (৳) *</label>
              <input
                id="dm-stk-sell"
                type="text"
                inputMode="numeric"
                required
                value={addSaleRate}
                onChange={(e) => setAddSaleRate(e.target.value)}
                placeholder="3450"
                className="dm-input"
              />
            </div>
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-stk-qty">প্রাথমিক স্টক</label>
              <input
                id="dm-stk-qty"
                type="text"
                inputMode="numeric"
                value={addStock}
                onChange={(e) => setAddStock(e.target.value)}
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-stk-min">সর্বনিম্ন স্টক সতর্কতা</label>
              <input
                id="dm-stk-min"
                type="text"
                inputMode="numeric"
                value={addMinStock}
                onChange={(e) => setAddMinStock(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Edit Product Modal */}
      <ModalDialog
        open={Boolean(editingProduct)}
        onClose={() => setEditingProduct(null)}
        title="পণ্যের তথ্য সম্পাদনা"
        subtitle={editingProduct?.name}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingProduct(null)}
              className="dm-btn dm-btn-outline"
              style={{ minHeight: 44 }}
            >
              বাতিল
            </button>
            <button
              type="submit"
              form="dm-edit-product-form"
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
          id="dm-edit-product-form"
          onSubmit={handleEditSubmit}
          className="dm-form-grid"
        >
          <div className="dm-field">
            <label htmlFor="dm-estk-name">পণ্যের নাম *</label>
            <input
              id="dm-estk-name"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="dm-input"
            />
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-estk-cat">ক্যাটাগরি</label>
              <input
                id="dm-estk-cat"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-estk-unit">ইউনিট</label>
              <input
                id="dm-estk-unit"
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-estk-sku">SKU</label>
              <input
                id="dm-estk-sku"
                value={editSku}
                onChange={(e) => setEditSku(e.target.value)}
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-estk-barcode">বারকোড</label>
              <input
                id="dm-estk-barcode"
                value={editBarcode}
                onChange={(e) => setEditBarcode(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-estk-buy">ক্রয় দর (৳)</label>
              <input
                id="dm-estk-buy"
                type="text"
                inputMode="numeric"
                value={editPurchaseRate}
                onChange={(e) => setEditPurchaseRate(e.target.value)}
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-estk-sell">বিক্রয় দর (৳) *</label>
              <input
                id="dm-estk-sell"
                type="text"
                inputMode="numeric"
                required
                value={editSaleRate}
                onChange={(e) => setEditSaleRate(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-estk-qty">বর্তমান স্টক</label>
              <input
                id="dm-estk-qty"
                type="text"
                inputMode="numeric"
                value={editStock}
                onChange={(e) => setEditStock(e.target.value)}
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-estk-min">সর্বনিম্ন স্টক সতর্কতা</label>
              <input
                id="dm-estk-min"
                type="text"
                inputMode="numeric"
                value={editMinStock}
                onChange={(e) => setEditMinStock(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Quick Stock Update Modal */}
      <ModalDialog
        open={Boolean(stockProduct)}
        onClose={() => setStockProduct(null)}
        title="দ্রুত স্টক আপডেট"
        subtitle={
          stockProduct
            ? `${stockProduct.name} · বর্তমান মজুত: ${toBn(stockProduct.stock)} ${stockProduct.unit}`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setStockProduct(null)}
              className="dm-btn dm-btn-outline"
              style={{ minHeight: 44 }}
            >
              বাতিল
            </button>
            <button
              type="submit"
              form="dm-adjust-stock-form"
              disabled={adjustSubmitting}
              className="dm-btn dm-btn-primary"
              style={{ minHeight: 44 }}
            >
              {adjustSubmitting ? "আপডেট হচ্ছে…" : "স্টক আপডেট করুন"}
            </button>
          </>
        }
      >
        {stockProduct && (
          <form
            id="dm-adjust-stock-form"
            onSubmit={handleAdjustSubmit}
            className="dm-form-grid"
          >
            <div
              className="dm-seg-group"
              role="group"
              aria-label="স্টক পরিবর্তনের ধরন"
            >
              <button
                type="button"
                onClick={() => setAdjustMode("add")}
                className={`dm-seg-btn${adjustMode === "add" ? " is-active" : ""}`}
                style={{ minHeight: 44 }}
              >
                যোগ করুন
              </button>
              <button
                type="button"
                onClick={() => setAdjustMode("subtract")}
                className={`dm-seg-btn${adjustMode === "subtract" ? " is-active" : ""}`}
                style={{ minHeight: 44 }}
              >
                কমান
              </button>
              <button
                type="button"
                onClick={() => setAdjustMode("set")}
                className={`dm-seg-btn${adjustMode === "set" ? " is-active" : ""}`}
                style={{ minHeight: 44 }}
              >
                সরাসরি সেট
              </button>
            </div>

            <div className="dm-field">
              <label htmlFor="dm-adj-qty">
                পরিমাণ ({stockProduct.unit}) *
              </label>
              <input
                id="dm-adj-qty"
                type="text"
                inputMode="numeric"
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                placeholder="যেমন: 10"
                className="dm-input"
              />
            </div>

            <div
              className="dm-card dm-card-pad-sm"
              style={{ background: "var(--dm-surface-tint)" }}
            >
              <div className="dm-summary-row">
                <span>বর্তমান মজুত</span>
                <strong>
                  {toBn(stockProduct.stock)} {stockProduct.unit}
                </strong>
              </div>
              <div className="dm-summary-row" style={{ marginTop: 4 }}>
                <span>পরিবর্তনের পর নতুন মজুত</span>
                <strong
                  className={
                    previewStock < 0 ? "dm-text-rose" : "dm-text-emerald"
                  }
                >
                  {toBn(previewStock)} {stockProduct.unit}
                </strong>
              </div>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Delete Product Confirmation Modal */}
      <ModalDialog
        open={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        title="পণ্য মুছে ফেলুন"
        subtitle={
          deletingProduct
            ? `${deletingProduct.name} (${deletingProduct.sku})`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeletingProduct(null)}
              className="dm-btn dm-btn-outline"
              style={{ minHeight: 44 }}
            >
              বাতিল
            </button>
            <button
              type="button"
              disabled={deleteSubmitting}
              onClick={handleDeleteConfirm}
              className="dm-btn dm-btn-danger"
              style={{ minHeight: 44 }}
            >
              {deleteSubmitting ? "মুছে ফেলা হচ্ছে…" : "নিশ্চিত মুছুন"}
            </button>
          </>
        }
      >
        {deletingProduct && (
          <p>
            আপনি কি নিশ্চিত যে <strong>{deletingProduct.name}</strong> (বর্তমান
            মজুত: {toBn(deletingProduct.stock)} {deletingProduct.unit})-কে পণ্য
            তালিকা থেকে স্থায়ীভাবে মুছে ফেলতে চান?
          </p>
        )}
      </ModalDialog>
    </div>
  );
}
