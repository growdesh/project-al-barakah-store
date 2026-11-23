import {
  ArrowLeft,
  CircleHelp,
  Plus,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import type { Product } from "../types";

interface CartLine {
  productId: string;
  name: string;
  unit: string;
  rate: number;
  rateText: string;
  qty: number;
  qtyText: string;
  maxStock: number;
}

export function TradeScreen({ kind }: { kind: "sale" | "purchase" }) {
  const isSale = kind === "sale";
  const {
    user,
    data,
    toast,
    createSale,
    createPurchase,
    createCustomer,
    createSupplier,
    createProduct,
  } = useApp();

  const searchRef = useRef<HTMLInputElement>(null);

  const [selectedPartyId, setSelectedPartyId] = useState<string>(() => {
    if (isSale) {
      return data?.customers[0]?.id ?? "walk-in";
    }
    return data?.suppliers[0]?.id ?? "";
  });

  const [searchQuery, setSearchQuery] = useState<string>("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>("সব");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [payMode, setPayMode] = useState<"full" | "partial" | "due">("full");
  const [partialPaidInput, setPartialPaidInput] = useState<string>("0");
  const [noteInput, setNoteInput] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Modals
  const [rulesOpen, setRulesOpen] = useState<boolean>(false);
  const [quickPartyOpen, setQuickPartyOpen] = useState<boolean>(false);
  const [quickProductOpen, setQuickProductOpen] = useState<boolean>(false);

  // Quick party form
  const [partyNameInput, setPartyNameInput] = useState<string>("");
  const [partyMobileInput, setPartyMobileInput] = useState<string>("");
  const [partyAreaInput, setPartyAreaInput] = useState<string>("");
  const [partyOpeningDueInput, setPartyOpeningDueInput] = useState<string>("0");
  const [partySubmitting, setPartySubmitting] = useState<boolean>(false);

  // Quick product form (Admin only)
  const [prdName, setPrdName] = useState<string>("");
  const [prdCategory, setPrdCategory] = useState<string>("সাধারণ");
  const [prdUnit, setPrdUnit] = useState<string>("পিস");
  const [prdSku, setPrdSku] = useState<string>("");
  const [prdBarcode, setPrdBarcode] = useState<string>("");
  const [prdPurchaseRate, setPrdPurchaseRate] = useState<string>("");
  const [prdSaleRate, setPrdSaleRate] = useState<string>("");
  const [prdStock, setPrdStock] = useState<string>("20");
  const [prdMinStock, setPrdMinStock] = useState<string>("10");
  const [prdSubmitting, setPrdSubmitting] = useState<boolean>(false);

  const products = data?.products ?? [];
  const customers = data?.customers ?? [];
  const suppliers = data?.suppliers ?? [];
  const allowNegativeStock = Boolean(data?.settings?.allowNegativeStock);

  useEffect(() => {
    if (isSale) {
      if (
        selectedPartyId !== "walk-in" &&
        !customers.some((c) => c.id === selectedPartyId)
      ) {
        setSelectedPartyId(customers[0]?.id ?? "walk-in");
      }
    } else if (!suppliers.some((s) => s.id === selectedPartyId)) {
      setSelectedPartyId(suppliers[0]?.id ?? "");
    }
  }, [isSale, customers, suppliers, selectedPartyId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return ["সব", ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== "সব" && p.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, deferredSearchQuery]);

  const selectedCustomer = useMemo(
    () =>
      isSale && selectedPartyId !== "walk-in"
        ? customers.find((c) => c.id === selectedPartyId)
        : undefined,
    [isSale, selectedPartyId, customers],
  );

  const selectedSupplier = useMemo(
    () =>
      !isSale ? suppliers.find((s) => s.id === selectedPartyId) : undefined,
    [isSale, selectedPartyId, suppliers],
  );

  const addToCart = (product: Product) => {
    if (isSale && !allowNegativeStock && product.stock <= 0) {
      toast(`${product.name} স্টকে নেই`);
      return;
    }
    const unitRate = isSale ? product.saleRate : (product.purchaseRate ?? 0);

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        const nextQty = Math.round((existing.qty + 1) * 100) / 100;
        if (isSale && !allowNegativeStock && nextQty > product.stock) {
          toast(`সর্বোচ্চ স্টক ${toBn(product.stock)} ${product.unit}`);
          return prev;
        }
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                qty: nextQty,
                qtyText: String(nextQty),
                maxStock: product.stock,
              }
            : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          rate: unitRate,
          rateText: String(unitRate),
          qty: 1,
          qtyText: "1",
          maxStock: product.stock,
        },
      ];
    });
  };

  const stepCartQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQty = Math.round((item.qty + delta) * 100) / 100;
          if (nextQty <= 0) return null;
          if (isSale && !allowNegativeStock && nextQty > item.maxStock) {
            toast(`সর্বোচ্চ স্টক ${toBn(item.maxStock)} ${item.unit}`);
            return item;
          }
          return { ...item, qty: nextQty, qtyText: String(nextQty) };
        })
        .filter((x): x is CartLine => x !== null),
    );
  };

  const handleQtyTextChange = (productId: string, raw: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        if (raw.trim() === "") {
          return { ...item, qtyText: "", qty: 0 };
        }
        const parsed = parseAmountInput(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return { ...item, qtyText: raw };
        }
        const rounded = Math.round(parsed * 100) / 100;
        if (isSale && !allowNegativeStock && rounded > item.maxStock) {
          toast(`সর্বোচ্চ স্টক ${toBn(item.maxStock)} ${item.unit}`);
          return {
            ...item,
            qty: item.maxStock,
            qtyText: String(item.maxStock),
          };
        }
        return { ...item, qty: rounded, qtyText: raw };
      }),
    );
  };

  const handleQtyBlur = (productId: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const safeQty = item.qty > 0 ? item.qty : 1;
        return { ...item, qty: safeQty, qtyText: String(safeQty) };
      }),
    );
  };

  const handleRateTextChange = (productId: string, raw: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        if (raw.trim() === "") {
          return { ...item, rateText: "", rate: 0 };
        }
        const parsed = parseAmountInput(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return { ...item, rateText: raw };
        }
        const rounded = Math.round(parsed * 100) / 100;
        return { ...item, rate: rounded, rateText: raw };
      }),
    );
  };

  const handleRateBlur = (productId: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const prod = products.find((p) => p.id === item.productId);
        const fallback = isSale
          ? (prod?.saleRate ?? item.rate)
          : (prod?.purchaseRate ?? 0);
        const safeRate =
          isSale && item.rate <= 0
            ? fallback
            : item.rate < 0
              ? fallback
              : item.rate;
        return { ...item, rate: safeRate, rateText: String(safeRate) };
      }),
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const totalQty = useMemo(
    () =>
      Math.round(cart.reduce((sum, item) => sum + item.qty, 0) * 100) / 100,
    [cart],
  );

  const subTotal = useMemo(
    () =>
      Math.round(
        cart.reduce((sum, item) => sum + item.qty * item.rate, 0) * 100,
      ) / 100,
    [cart],
  );

  const discountVal = Math.max(
    0,
    Math.min(subTotal, Math.round(parseAmountInput(discountInput))),
  );
  const grandTotal = Math.max(0, Math.round((subTotal - discountVal) * 100) / 100);

  const paidAmount = useMemo(() => {
    if (payMode === "full") return grandTotal;
    if (payMode === "due") return 0;
    return Math.max(
      0,
      Math.min(grandTotal, Math.round(parseAmountInput(partialPaidInput))),
    );
  }, [payMode, grandTotal, partialPaidInput]);

  const dueAmount = Math.max(
    0,
    Math.round((grandTotal - paidAmount) * 100) / 100,
  );

  const handleBarcodeAction = () => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const exact = products.find(
        (p) => p.barcode.toLowerCase() === q || p.sku.toLowerCase() === q,
      );
      if (exact) {
        addToCart(exact);
        setSearchQuery("");
      } else {
        toast("এই বারকোড বা SKU-তে কোনো পণ্য পাওয়া যায়নি");
      }
      return;
    }
    toast("বারকোড বা SKU লিখে এন্টার চাপুন");
    searchRef.current?.focus();
  };

  const handleSubmitTrade = async () => {
    if (submitting) return;
    if (cart.length === 0) {
      toast("কার্টে অন্তত একটি পণ্য যোগ করুন");
      return;
    }
    if (cart.some((line) => line.qty <= 0)) {
      toast("প্রতিটি পণ্যের পরিমাণ শূন্যের বেশি হতে হবে");
      return;
    }
    if (isSale && cart.some((line) => line.rate <= 0)) {
      toast("প্রতিটি পণ্যের বিক্রয় দর শূন্যের বেশি হতে হবে");
      return;
    }
    if (!isSale && !selectedPartyId) {
      toast("একজন সাপ্লায়ার নির্বাচন করুন");
      return;
    }
    if (isSale && selectedPartyId === "walk-in" && dueAmount > 0) {
      toast("বাকিতে বিক্রির জন্য তালিকা থেকে নিবন্ধিত কাস্টমার নির্বাচন করুন");
      return;
    }

    setSubmitting(true);
    try {
      const items = cart.map((line) => ({
        productId: line.productId,
        qty: line.qty,
        rate: line.rate,
      }));
      const note = noteInput.trim() || undefined;

      if (isSale) {
        await createSale({
          customerId: selectedPartyId,
          items,
          discount: discountVal,
          paid: paidAmount,
          note,
        });
        navigate("/sales");
      } else {
        await createPurchase({
          supplierId: selectedPartyId,
          items,
          discount: discountVal,
          paid: paidAmount,
          note,
        });
        navigate("/purchases");
      }
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "লেনদেন সংরক্ষণ করা যায়নি",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickPartySave = async (e: FormEvent) => {
    e.preventDefault();
    if (partySubmitting) return;

    const name = partyNameInput.trim();
    const mobile = normalizePhone(partyMobileInput);
    const area = partyAreaInput.trim();
    const opening = Math.max(0, Math.round(parseAmountInput(partyOpeningDueInput)));

    if (!name) {
      toast("নাম লিখুন");
      return;
    }
    if (mobile.length < 6) {
      toast("সঠিক মোবাইল নম্বর দিন");
      return;
    }

    setPartySubmitting(true);
    try {
      if (isSale) {
        const created = await createCustomer({
          name,
          mobile,
          area: area || "ঢাকা",
          openingDue: opening,
        });
        setSelectedPartyId(created.id);
      } else {
        const created = await createSupplier({
          name,
          mobile,
          area: area || "ঢাকা",
          due: opening,
        });
        setSelectedPartyId(created.id);
      }
      setPartyNameInput("");
      setPartyMobileInput("");
      setPartyAreaInput("");
      setPartyOpeningDueInput("0");
      setQuickPartyOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "সংরক্ষণ করা যায়নি");
    } finally {
      setPartySubmitting(false);
    }
  };

  const handleQuickProductSave = async (e: FormEvent) => {
    e.preventDefault();
    if (prdSubmitting) return;

    const name = prdName.trim();
    if (!name) {
      toast("পণ্যের নাম লিখুন");
      return;
    }
    const pRate = Math.max(0, parseAmountInput(prdPurchaseRate));
    const sRate = Math.max(0, parseAmountInput(prdSaleRate));
    const stockNum = Math.max(0, Math.round(parseAmountInput(prdStock)));
    const minStockNum = Math.max(0, Math.round(parseAmountInput(prdMinStock)));

    if (sRate <= 0) {
      toast("বিক্রয় দর শূন্যের বেশি হতে হবে");
      return;
    }

    setPrdSubmitting(true);
    try {
      const created = await createProduct({
        name,
        category: prdCategory.trim() || "সাধারণ",
        unit: prdUnit.trim() || "পিস",
        sku: prdSku.trim() || undefined,
        barcode: prdBarcode.trim() || undefined,
        purchaseRate: pRate,
        saleRate: sRate,
        stock: stockNum,
        minStock: minStockNum,
      });
      addToCart(created);
      setPrdName("");
      setPrdCategory("সাধারণ");
      setPrdUnit("পিস");
      setPrdSku("");
      setPrdBarcode("");
      setPrdPurchaseRate("");
      setPrdSaleRate("");
      setPrdStock("20");
      setPrdMinStock("10");
      setQuickProductOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "পণ্য যোগ করা যায়নি");
    } finally {
      setPrdSubmitting(false);
    }
  };

  const todayLabel = useMemo(() => formatDateBn(new Date().toISOString()), []);

  if (!user || !data) return null;

  if (!isSale && user.role !== "admin") {
    return (
      <div className="dm-access-denied">
        <h2>এই পেজে প্রবেশের অনুমতি নেই</h2>
        <p>শুধুমাত্র অ্যাডমিন পণ্য ক্রয় ও সাপ্লায়ার এন্ট্রি করতে পারবেন।</p>
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

  const walkInDueConflict =
    isSale && selectedPartyId === "walk-in" && dueAmount > 0;

  return (
    <div className="dm-stack-md">
      {/* Page Header */}
      <div className="dm-page-head">
        <div className="dm-page-head-left">
          <button
            type="button"
            aria-label="পেছনে যান"
            onClick={() => navigate(isSale ? "/sales" : "/purchases")}
            className="dm-back-btn"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div>
            <h1 className="dm-page-title">
              {isSale ? "নতুন পাইকারি বিক্রয়" : "নতুন পাইকারি ক্রয়"}
            </h1>
            <p className="dm-page-sub">
              {isSale
                ? "কাস্টমার নির্বাচন করে নগদ বা বাকিতে বিক্রয় চালান তৈরি করুন"
                : "সাপ্লায়ার থেকে পণ্য ক্রয় করুন ও গোডাউন স্টক আপডেট করুন"}
            </p>
          </div>
        </div>

        <div className="dm-page-actions">
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="dm-btn dm-btn-soft-emerald dm-btn-sm"
            style={{ minHeight: 44 }}
          >
            <CircleHelp size={16} aria-hidden="true" />
            <span>নিয়ম</span>
          </button>
        </div>
      </div>

      {/* 2-Column POS Layout */}
      <div className="dm-pos-layout">
        {/* Left Catalog Column */}
        <div className="dm-pos-left dm-stack-sm">
          {/* Party Selection */}
          <div className="dm-card dm-card-pad-sm">
            <div className="dm-field">
              <label htmlFor="dm-pos-party">
                {isSale ? "কাস্টমার নির্বাচন" : "সাপ্লায়ার নির্বাচন"}
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  id="dm-pos-party"
                  value={selectedPartyId}
                  onChange={(e) => setSelectedPartyId(e.target.value)}
                  className="dm-select"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {isSale ? (
                    <>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {`${c.name} (${c.mobile}) — বাকি ${formatMoneyBn(c.due)}`}
                        </option>
                      ))}
                      <option value="walk-in">
                        নগদ কাস্টমার (ওয়াক-ইন — শুধু সম্পূর্ণ নগদে)
                      </option>
                    </>
                  ) : suppliers.length === 0 ? (
                    <option value="">কোনো সাপ্লায়ার নেই — নতুন যোগ করুন</option>
                  ) : (
                    suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {`${s.name} (${s.mobile}) — দেনা ${formatMoneyBn(s.due)}`}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => setQuickPartyOpen(true)}
                  className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                  style={{ minHeight: 44, flexShrink: 0 }}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>নতুন</span>
                </button>
              </div>
              {isSale && selectedCustomer && (
                <div
                  className="dm-text-muted"
                  style={{ fontSize: 12.5, marginTop: 4 }}
                >
                  বর্তমান বাকি:{" "}
                  <strong
                    className={
                      selectedCustomer.due > 0
                        ? "dm-text-rose"
                        : "dm-text-emerald"
                    }
                  >
                    {formatMoneyBn(selectedCustomer.due)}
                  </strong>{" "}
                  · {selectedCustomer.area}
                </div>
              )}
              {!isSale && selectedSupplier && (
                <div
                  className="dm-text-muted"
                  style={{ fontSize: 12.5, marginTop: 4 }}
                >
                  বর্তমান দেনা:{" "}
                  <strong
                    className={
                      selectedSupplier.due > 0
                        ? "dm-text-rose"
                        : "dm-text-emerald"
                    }
                  >
                    {formatMoneyBn(selectedSupplier.due)}
                  </strong>{" "}
                  · {selectedSupplier.area}
                </div>
              )}
            </div>
          </div>

          {/* Search & Barcode + Category Pills */}
          <div className="dm-search-row" style={{ marginBottom: 4 }}>
            <div className="dm-search-box">
              <Search size={17} className="dm-search-icon" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                aria-label="পণ্য খুঁজুন"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const q = searchQuery.trim().toLowerCase();
                  const exact = q
                    ? products.find(
                        (p) =>
                          p.barcode.toLowerCase() === q ||
                          p.sku.toLowerCase() === q,
                      )
                    : undefined;
                  if (exact) {
                    addToCart(exact);
                    setSearchQuery("");
                  } else if (filteredProducts.length === 1) {
                    addToCart(filteredProducts[0]);
                  }
                }}
                placeholder="পণ্যের নাম, SKU বা বারকোড দিয়ে খুঁজুন…"
                className="dm-search-input"
              />
            </div>
            <button
              type="button"
              onClick={handleBarcodeAction}
              aria-label="বারকোড স্ক্যান করুন"
              title="বারকোড স্ক্যান করুন"
              className="dm-icon-btn"
              style={{ width: 44, height: 44, minWidth: 44, minHeight: 44 }}
            >
              <ScanBarcode size={19} aria-hidden="true" />
            </button>
          </div>

          <div
            className="dm-pills dm-pills-scroll"
            role="tablist"
            aria-label="পণ্য ক্যাটাগরি"
          >
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat)}
                  className={`dm-pill${active ? " is-active" : ""}`}
                  style={{ minHeight: 44 }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Product List */}
          <div className="dm-pos-products">
            {filteredProducts.length === 0 ? (
              <div className="dm-card dm-empty-state">
                <p>এই নামে কোনো পণ্য পাওয়া যায়নি</p>
              </div>
            ) : (
              filteredProducts.map((product) => {
                const outOfStock = product.stock <= 0;
                const lowStock =
                  product.stock > 0 && product.stock <= product.minStock;
                const rate = isSale
                  ? product.saleRate
                  : (product.purchaseRate ?? 0);

                return (
                  <div key={product.id} className="dm-pos-item">
                    <div className="dm-pos-item-info">
                      <strong>{product.name}</strong>
                      <div className="dm-pos-item-meta">
                        <span
                          className={`dm-badge ${
                            outOfStock
                              ? "dm-badge-rose"
                              : lowStock
                                ? "dm-badge-amber"
                                : "dm-badge-emerald"
                          }`}
                        >
                          {outOfStock
                            ? "স্টক নেই"
                            : lowStock
                              ? `কম স্টক: ${toBn(product.stock)}`
                              : `স্টক: ${toBn(product.stock)}`}
                        </span>
                        <span style={{ fontWeight: 800, color: "var(--dm-ink)" }}>
                          {formatMoneyBn(rate)}
                        </span>
                        <span className="dm-text-muted">/ {product.unit}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isSale && !allowNegativeStock && outOfStock}
                      onClick={() => addToCart(product)}
                      className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                      style={{ minHeight: 44, flexShrink: 0 }}
                    >
                      <Plus size={15} aria-hidden="true" />
                      <span>যোগ করুন</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {user.role === "admin" && (
            <button
              type="button"
              onClick={() => setQuickProductOpen(true)}
              className="dm-btn dm-btn-outline dm-btn-full"
              style={{ marginTop: 4, minHeight: 44 }}
            >
              <Plus size={17} aria-hidden="true" />
              <span>নতুন পণ্য</span>
            </button>
          )}
        </div>

        {/* Right Sticky Cart Column */}
        <aside
          id="dm-pos-cart-panel"
          className="dm-pos-cart dm-card"
          aria-label="শপিং কার্ট ও বিলিং"
        >
          <div className="dm-card-head">
            <h2 className="dm-card-title">কার্ট ({toBn(totalQty)}টি পণ্য)</h2>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="dm-section-link"
                style={{ minHeight: 44, color: "var(--dm-rose)" }}
              >
                খালি করুন
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="dm-empty-state" style={{ paddingBlock: 22 }}>
              <ShoppingCart size={30} aria-hidden="true" />
              <strong>কার্ট খালি</strong>
              <span>তালিকা থেকে পণ্য খুঁজে কার্টে যোগ করুন</span>
            </div>
          ) : (
            <div className="dm-cart-lines">
              {cart.map((line) => (
                <div
                  key={line.productId}
                  className="dm-cart-line"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {line.name}
                      </div>
                      <div className="dm-text-muted" style={{ fontSize: 12 }}>
                        {formatMoneyBn(line.rate)} × {toBn(line.qty)}{" "}
                        {line.unit}
                      </div>
                    </div>
                    <strong
                      style={{
                        color: "var(--dm-ink)",
                        fontSize: 14,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatMoneyBn(
                        Math.round(line.qty * line.rate * 100) / 100,
                      )}
                    </strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                    }}
                  >
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        color: "var(--dm-muted)",
                      }}
                    >
                      <span>দর</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${line.name} একক দর`}
                        value={line.rateText}
                        onChange={(e) =>
                          handleRateTextChange(line.productId, e.target.value)
                        }
                        onBlur={() => handleRateBlur(line.productId)}
                        className="dm-input"
                        style={{
                          width: 78,
                          minHeight: 44,
                          padding: "6px 8px",
                          textAlign: "right",
                          fontSize: 13,
                        }}
                      />
                    </label>

                    <div className="dm-qty-ctrl">
                      <button
                        type="button"
                        aria-label={`${line.name} পরিমাণ কমান`}
                        onClick={() => stepCartQty(line.productId, -1)}
                        className="dm-qty-btn"
                        style={{ minWidth: 44, minHeight: 44 }}
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`${line.name} পরিমাণ`}
                        value={line.qtyText}
                        onChange={(e) =>
                          handleQtyTextChange(line.productId, e.target.value)
                        }
                        onBlur={() => handleQtyBlur(line.productId)}
                        className="dm-input"
                        style={{
                          width: 56,
                          minHeight: 44,
                          padding: "6px 6px",
                          textAlign: "center",
                          fontWeight: 800,
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`${line.name} পরিমাণ বাড়ান`}
                        onClick={() => stepCartQty(line.productId, 1)}
                        className="dm-qty-btn"
                        style={{ minWidth: 44, minHeight: 44 }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        aria-label={`${line.name} সরান`}
                        onClick={() => removeFromCart(line.productId)}
                        className="dm-icon-btn"
                        style={{
                          width: 44,
                          height: 44,
                          minWidth: 44,
                          minHeight: 44,
                          color: "var(--dm-rose)",
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals & Cash Payment Controls */}
          <div className="dm-cart-summary">
            <div className="dm-summary-row">
              <span>মোট</span>
              <strong>{formatMoneyBn(subTotal)}</strong>
            </div>

            <div className="dm-summary-row">
              <label htmlFor="dm-pos-discount">ছাড় (৳)</label>
              <input
                id="dm-pos-discount"
                type="text"
                inputMode="numeric"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="dm-input"
                style={{ width: 116, minHeight: 44, textAlign: "right" }}
              />
            </div>

            <div className="dm-summary-row is-total">
              <span>সর্বমোট</span>
              <span>{formatMoneyBn(grandTotal)}</span>
            </div>

            <div
              className="dm-seg-group"
              role="group"
              aria-label="নগদ পরিশোধের ধরন"
            >
              <button
                type="button"
                onClick={() => setPayMode("full")}
                className={`dm-seg-btn${payMode === "full" ? " is-active" : ""}`}
                style={{ minHeight: 44 }}
              >
                সম্পূর্ণ নগদ
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayMode("partial");
                  if (parseAmountInput(partialPaidInput) <= 0 && grandTotal > 0) {
                    setPartialPaidInput(String(Math.round(grandTotal / 2)));
                  }
                }}
                className={`dm-seg-btn${payMode === "partial" ? " is-active" : ""}`}
                style={{ minHeight: 44 }}
              >
                আংশিক নগদ
              </button>
              <button
                type="button"
                onClick={() => setPayMode("due")}
                className={`dm-seg-btn${payMode === "due" ? " is-active" : ""}`}
                style={{ minHeight: 44 }}
              >
                বাকি
              </button>
            </div>

            {payMode === "partial" && (
              <div className="dm-summary-row">
                <label htmlFor="dm-pos-paid">
                  {isSale ? "নগদ জমা (৳)" : "নগদ পরিশোধ (৳)"}
                </label>
                <input
                  id="dm-pos-paid"
                  type="text"
                  inputMode="numeric"
                  value={partialPaidInput}
                  onChange={(e) => setPartialPaidInput(e.target.value)}
                  className="dm-input"
                  style={{ width: 124, minHeight: 44, textAlign: "right" }}
                />
              </div>
            )}

            <div className="dm-summary-row">
              <span>{isSale ? "নগদ প্রাপ্তি" : "নগদ পরিশোধ"}</span>
              <strong className="dm-text-emerald">
                {formatMoneyBn(paidAmount)}
              </strong>
            </div>

            <div className="dm-summary-row">
              <span>{isSale ? "বাকি" : "দেনা"}</span>
              <strong
                className={dueAmount > 0 ? "dm-text-rose" : "dm-text-emerald"}
              >
                {formatMoneyBn(dueAmount)}
              </strong>
            </div>

            {isSale && selectedCustomer && (
              <div className="dm-summary-row">
                <span>বিক্রির পর কাস্টমারের মোট বাকি</span>
                <strong
                  className={
                    selectedCustomer.due + dueAmount > 0
                      ? "dm-text-rose"
                      : "dm-text-emerald"
                  }
                >
                  {formatMoneyBn(selectedCustomer.due + dueAmount)}
                </strong>
              </div>
            )}

            {!isSale && selectedSupplier && (
              <div className="dm-summary-row">
                <span>ক্রয়ের পর সাপ্লায়ারকে মোট দেনা</span>
                <strong
                  className={
                    selectedSupplier.due + dueAmount > 0
                      ? "dm-text-rose"
                      : "dm-text-emerald"
                  }
                >
                  {formatMoneyBn(selectedSupplier.due + dueAmount)}
                </strong>
              </div>
            )}

            {walkInDueConflict && (
              <div className="dm-alert-error" role="alert">
                ওয়াক-ইন কাস্টমারের ক্ষেত্রে বাকি রাখা যাবে না। সম্পূর্ণ নগদ
                নির্বাচন করুন অথবা তালিকা থেকে নিবন্ধিত কাস্টমার বেছে নিন।
              </div>
            )}

            <div className="dm-field">
              <label htmlFor="dm-pos-note">নোট (ঐচ্ছিক)</label>
              <input
                id="dm-pos-note"
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="সংক্ষিপ্ত মন্তব্য লিখুন…"
                className="dm-input"
                style={{ minHeight: 44 }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 12.5,
                color: "var(--dm-muted)",
              }}
            >
              <span>তারিখ</span>
              <strong style={{ color: "var(--dm-ink)" }}>{todayLabel}</strong>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitTrade}
              className="dm-btn dm-btn-primary dm-btn-full"
              style={{ minHeight: 46 }}
            >
              {submitting
                ? "সংরক্ষণ হচ্ছে…"
                : isSale
                  ? "বিক্রয় সম্পন্ন করুন"
                  : "ক্রয় সম্পন্ন করুন"}
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile Sticky Cart Summary Bar (< 1024px) */}
      {cart.length > 0 && (
        <div className="dm-pos-mobile-bar" role="region" aria-label="কার্ট সারাংশ">
          <div className="dm-pos-mobile-bar-info">
            <span className="dm-pos-mobile-bar-count">
              {toBn(totalQty)}টি পণ্য
            </span>
            <strong className="dm-pos-mobile-bar-total dm-num">
              {formatMoneyBn(grandTotal)}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("dm-pos-cart-panel");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="dm-btn dm-btn-primary dm-btn-sm"
          >
            <ShoppingCart size={15} aria-hidden="true" />
            <span>কার্ট ও বিলিং</span>
          </button>
        </div>
      )}

      {/* Rules Modal */}
      <ModalDialog
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title={isSale ? "বিক্রয় করার নিয়ম" : "ক্রয় করার নিয়ম"}
        subtitle="নগদ ও বাকি বিলিং নির্দেশিকা"
        footer={
          <button
            type="button"
            onClick={() => setRulesOpen(false)}
            className="dm-btn dm-btn-primary"
          >
            বুঝেছি
          </button>
        }
      >
        <p>
          ১. প্রথমে তালিকা থেকে {isSale ? "কাস্টমার" : "সাপ্লায়ার"} নির্বাচন
          করুন অথবা <strong>+ নতুন</strong> বাটনে চাপ দিয়ে দ্রুত যোগ করুন।
        </p>
        <p>
          ২. পণ্যের নাম, SKU বা বারকোড দিয়ে খুঁজে <strong>+ যোগ করুন</strong>{" "}
          বাটনে চাপ দিন।
        </p>
        <p>
          ৩. কার্টে পরিমাণ, একক দর, ছাড় এবং নগদ পরিশোধের ধরন (সম্পূর্ণ নগদ /
          আংশিক নগদ / বাকি) ঠিক করে সম্পন্ন করুন।
        </p>
        {isSale && (
          <p>
            ৪. ওয়াক-ইন নগদ কাস্টমারের ক্ষেত্রে শুধুমাত্র সম্পূর্ণ নগদে বিক্রয়
            করা যাবে; বাকির জন্য নিবন্ধিত কাস্টমার নির্বাচন করুন।
          </p>
        )}
      </ModalDialog>

      {/* Quick Party Modal */}
      <ModalDialog
        open={quickPartyOpen}
        onClose={() => setQuickPartyOpen(false)}
        title={isSale ? "নতুন কাস্টমার" : "নতুন সাপ্লায়ার"}
        subtitle="দ্রুত নতুন তালিকা যুক্ত করুন"
        footer={
          <>
            <button
              type="button"
              onClick={() => setQuickPartyOpen(false)}
              className="dm-btn dm-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              form="dm-quick-party-form"
              disabled={partySubmitting}
              className="dm-btn dm-btn-primary"
            >
              {partySubmitting ? "সংরক্ষণ হচ্ছে…" : "যোগ করুন"}
            </button>
          </>
        }
      >
        <form
          id="dm-quick-party-form"
          onSubmit={handleQuickPartySave}
          className="dm-form-grid"
        >
          <div className="dm-field">
            <label htmlFor="dm-qp-name">নাম *</label>
            <input
              id="dm-qp-name"
              required
              value={partyNameInput}
              onChange={(e) => setPartyNameInput(e.target.value)}
              placeholder={
                isSale ? "যেমন: বিসমিল্লাহ স্টোর" : "যেমন: মেঘনা ডিপো"
              }
              className="dm-input"
            />
          </div>
          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="dm-qp-mobile">মোবাইল *</label>
              <input
                id="dm-qp-mobile"
                type="tel"
                inputMode="tel"
                required
                value={partyMobileInput}
                onChange={(e) => setPartyMobileInput(e.target.value)}
                placeholder="017XXXXXXXX"
                className="dm-input"
              />
            </div>
            <div className="dm-field">
              <label htmlFor="dm-qp-area">এলাকা</label>
              <input
                id="dm-qp-area"
                value={partyAreaInput}
                onChange={(e) => setPartyAreaInput(e.target.value)}
                placeholder="চকবাজার, ঢাকা"
                className="dm-input"
              />
            </div>
          </div>
          <div className="dm-field">
            <label htmlFor="dm-qp-due">
              {isSale ? "প্রারম্ভিক বাকি (৳)" : "পূর্বের দেনা (৳)"}
            </label>
            <input
              id="dm-qp-due"
              type="text"
              inputMode="numeric"
              value={partyOpeningDueInput}
              onChange={(e) => setPartyOpeningDueInput(e.target.value)}
              className="dm-input"
            />
          </div>
        </form>
      </ModalDialog>

      {/* Quick Product Modal (Admin only) */}
      {user.role === "admin" && (
        <ModalDialog
          open={quickProductOpen}
          onClose={() => setQuickProductOpen(false)}
          title="নতুন পণ্য যোগ করুন"
          subtitle="স্টকে যোগ হয়ে সরাসরি কার্টে যুক্ত হবে"
          footer={
            <>
              <button
                type="button"
                onClick={() => setQuickProductOpen(false)}
                className="dm-btn dm-btn-outline"
              >
                বাতিল
              </button>
              <button
                type="submit"
                form="dm-quick-product-form"
                disabled={prdSubmitting}
                className="dm-btn dm-btn-primary"
              >
                {prdSubmitting ? "সংরক্ষণ হচ্ছে…" : "পণ্য সংরক্ষণ"}
              </button>
            </>
          }
        >
          <form
            id="dm-quick-product-form"
            onSubmit={handleQuickProductSave}
            className="dm-form-grid"
          >
            <div className="dm-field">
              <label htmlFor="dm-qprd-name">পণ্যের নাম *</label>
              <input
                id="dm-qprd-name"
                required
                value={prdName}
                onChange={(e) => setPrdName(e.target.value)}
                placeholder="যেমন: মিনিকেট চাল ৫০ কেজি বস্তা"
                className="dm-input"
              />
            </div>
            <div className="dm-form-row-2">
              <div className="dm-field">
                <label htmlFor="dm-qprd-cat">ক্যাটাগরি</label>
                <input
                  id="dm-qprd-cat"
                  value={prdCategory}
                  onChange={(e) => setPrdCategory(e.target.value)}
                  placeholder="চাল ও ডাল"
                  className="dm-input"
                />
              </div>
              <div className="dm-field">
                <label htmlFor="dm-qprd-unit">ইউনিট</label>
                <input
                  id="dm-qprd-unit"
                  value={prdUnit}
                  onChange={(e) => setPrdUnit(e.target.value)}
                  placeholder="বস্তা / কার্টন / পিস"
                  className="dm-input"
                />
              </div>
            </div>
            <div className="dm-form-row-2">
              <div className="dm-field">
                <label htmlFor="dm-qprd-sku">SKU (ঐচ্ছিক)</label>
                <input
                  id="dm-qprd-sku"
                  value={prdSku}
                  onChange={(e) => setPrdSku(e.target.value)}
                  placeholder="স্বয়ংক্রিয় তৈরি হবে"
                  className="dm-input"
                />
              </div>
              <div className="dm-field">
                <label htmlFor="dm-qprd-barcode">বারকোড (ঐচ্ছিক)</label>
                <input
                  id="dm-qprd-barcode"
                  value={prdBarcode}
                  onChange={(e) => setPrdBarcode(e.target.value)}
                  placeholder="স্বয়ংক্রিয় তৈরি হবে"
                  className="dm-input"
                />
              </div>
            </div>
            <div className="dm-form-row-2">
              <div className="dm-field">
                <label htmlFor="dm-qprd-buy">ক্রয় দর (৳)</label>
                <input
                  id="dm-qprd-buy"
                  type="text"
                  inputMode="numeric"
                  value={prdPurchaseRate}
                  onChange={(e) => setPrdPurchaseRate(e.target.value)}
                  placeholder="3200"
                  className="dm-input"
                />
              </div>
              <div className="dm-field">
                <label htmlFor="dm-qprd-sell">বিক্রয় দর (৳) *</label>
                <input
                  id="dm-qprd-sell"
                  type="text"
                  inputMode="numeric"
                  required
                  value={prdSaleRate}
                  onChange={(e) => setPrdSaleRate(e.target.value)}
                  placeholder="3450"
                  className="dm-input"
                />
              </div>
            </div>
            <div className="dm-form-row-2">
              <div className="dm-field">
                <label htmlFor="dm-qprd-stock">প্রাথমিক স্টক</label>
                <input
                  id="dm-qprd-stock"
                  type="text"
                  inputMode="numeric"
                  value={prdStock}
                  onChange={(e) => setPrdStock(e.target.value)}
                  className="dm-input"
                />
              </div>
              <div className="dm-field">
                <label htmlFor="dm-qprd-min">সর্বনিম্ন স্টক সতর্কতা</label>
                <input
                  id="dm-qprd-min"
                  type="text"
                  inputMode="numeric"
                  value={prdMinStock}
                  onChange={(e) => setPrdMinStock(e.target.value)}
                  className="dm-input"
                />
              </div>
            </div>
          </form>
        </ModalDialog>
      )}
    </div>
  );
}
