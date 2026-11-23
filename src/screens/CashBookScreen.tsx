import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  Building2,
  Receipt,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { ModalDialog } from "../components/ModalDialog";
import { useApp } from "../context/AppContext";
import {
  formatDateBn,
  formatMoneyBn,
  parseAmountInput,
  toBn,
} from "../lib/format";
import { navigate } from "../lib/router";
import type { CashLedgerKind } from "../types";

type LedgerFilter =
  | "all"
  | "sale"
  | "collection"
  | "purchase_pay"
  | "expense";

function kindMeta(kind: CashLedgerKind) {
  switch (kind) {
    case "sale":
      return { label: "নগদ বিক্রি", cls: "dm-badge dm-badge-emerald" };
    case "collection":
      return { label: "বাকি আদায়", cls: "dm-badge dm-badge-blue" };
    case "purchase":
      return { label: "পণ্য ক্রয়", cls: "dm-badge dm-badge-amber" };
    case "supplier_payment":
      return { label: "সাপ্লায়ার পরিশোধ", cls: "dm-badge dm-badge-amber" };
    case "expense":
      return { label: "দোকান খরচ", cls: "dm-badge dm-badge-rose" };
    case "adjustment":
      return { label: "নগদ সমন্বয়", cls: "dm-badge dm-badge-slate" };
  }
}

export function CashBookScreen() {
  const { user, data, createLedger } = useApp();

  const [filter, setFilter] = useState<LedgerFilter>("all");

  // Expense Modal
  const [expenseOpen, setExpenseOpen] = useState<boolean>(false);
  const [expParty, setExpParty] = useState<string>("");
  const [expAmount, setExpAmount] = useState<string>("");
  const [expNote, setExpNote] = useState<string>("");
  const [expError, setExpError] = useState<string | null>(null);
  const [expSaving, setExpSaving] = useState<boolean>(false);

  // Cash Adjustment Modal
  const [adjOpen, setAdjOpen] = useState<boolean>(false);
  const [adjDirection, setAdjDirection] = useState<"in" | "out">("in");
  const [adjParty, setAdjParty] = useState<string>("");
  const [adjAmount, setAdjAmount] = useState<string>("");
  const [adjNote, setAdjNote] = useState<string>("");
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSaving, setAdjSaving] = useState<boolean>(false);

  const expenseFormId = useId();
  const adjFormId = useId();

  const metrics = useMemo(() => {
    const ledger = data?.ledger ?? [];
    const customers = data?.customers ?? [];
    const openingCash = data?.openingCash ?? 0;

    const totalCashIn = ledger
      .filter((l) => l.direction === "in")
      .reduce((sum, l) => sum + l.amount, 0);
    const totalCashOut = ledger
      .filter((l) => l.direction === "out")
      .reduce((sum, l) => sum + l.amount, 0);
    const currentCash = openingCash + totalCashIn - totalCashOut;
    const customerDue = customers.reduce((sum, c) => sum + c.due, 0);

    return {
      openingCash,
      totalCashIn,
      totalCashOut,
      currentCash,
      customerDue,
    };
  }, [data?.ledger, data?.customers, data?.openingCash]);

  const filteredLedger = useMemo(() => {
    const ledger = data?.ledger ?? [];
    return ledger.filter((entry) => {
      if (filter === "all") return true;
      if (filter === "sale") return entry.kind === "sale";
      if (filter === "collection") return entry.kind === "collection";
      if (filter === "purchase_pay") {
        return entry.kind === "purchase" || entry.kind === "supplier_payment";
      }
      return entry.kind === "expense";
    });
  }, [data?.ledger, filter]);

  if (!data || !user) return null;

  if (user.role !== "admin") {
    return (
      <div className="dm-access-denied">
        <ShieldAlert size={36} className="dm-text-rose" aria-hidden="true" />
        <h2>এই পেজে প্রবেশের অনুমতি নেই</h2>
        <p>শুধুমাত্র অ্যাডমিন দোকানের নগদ হিসাব দেখতে পারবেন।</p>
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

  const openExpenseModal = () => {
    setExpParty("");
    setExpAmount("");
    setExpNote("");
    setExpError(null);
    setExpenseOpen(true);
  };

  const handleSaveExpense = async (e: FormEvent) => {
    e.preventDefault();
    setExpError(null);
    const party = expParty.trim();
    const amount = Math.round(parseAmountInput(expAmount) * 100) / 100;
    const note = expNote.trim();

    if (!party) {
      setExpError("খরচের খাত বা বিবরণ লিখুন");
      return;
    }
    if (amount <= 0) {
      setExpError("সঠিক টাকার পরিমাণ লিখুন");
      return;
    }

    setExpSaving(true);
    try {
      await createLedger({
        party,
        amount,
        direction: "out",
        kind: "expense",
        ...(note ? { note } : {}),
      });
      setExpenseOpen(false);
    } catch (err) {
      setExpError(
        err instanceof Error ? err.message : "খরচ সংরক্ষণ করা যায়নি",
      );
    } finally {
      setExpSaving(false);
    }
  };

  const openAdjModal = () => {
    setAdjDirection("in");
    setAdjParty("");
    setAdjAmount("");
    setAdjNote("");
    setAdjError(null);
    setAdjOpen(true);
  };

  const handleSaveAdjustment = async (e: FormEvent) => {
    e.preventDefault();
    setAdjError(null);
    const party = adjParty.trim();
    const amount = Math.round(parseAmountInput(adjAmount) * 100) / 100;
    const note = adjNote.trim();

    if (!party) {
      setAdjError("সমন্বয়ের বিবরণ লিখুন");
      return;
    }
    if (amount <= 0) {
      setAdjError("সঠিক টাকার পরিমাণ লিখুন");
      return;
    }

    setAdjSaving(true);
    try {
      await createLedger({
        party,
        amount,
        direction: adjDirection,
        kind: "adjustment",
        ...(note ? { note } : {}),
      });
      setAdjOpen(false);
    } catch (err) {
      setAdjError(
        err instanceof Error ? err.message : "নগদ সমন্বয় সংরক্ষণ করা যায়নি",
      );
    } finally {
      setAdjSaving(false);
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
            <h1 className="dm-page-title">নগদ হিসাব</h1>
            <p className="dm-page-sub">
              দৈনিক নগদ জমা, খরচ ও ক্যাশ ব্যালেন্স
            </p>
          </div>
        </div>
      </div>

      {/* 4 Cash KPIs */}
      <div className="dm-kpi-grid-4">
        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
            <Banknote size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">বর্তমান নগদ ক্যাশ</span>
            <span className="dm-kpi-value dm-text-emerald">
              {formatMoneyBn(metrics.currentCash)}
            </span>
            <span className="dm-kpi-sub">
              প্রারম্ভিক ক্যাশ: {formatMoneyBn(metrics.openingCash)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-teal" aria-hidden="true">
            <Wallet size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট নগদ জমা</span>
            <span className="dm-kpi-value dm-text-emerald">
              {formatMoneyBn(metrics.totalCashIn)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-rose" aria-hidden="true">
            <Receipt size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট নগদ খরচ ও পরিশোধ</span>
            <span className="dm-kpi-value dm-text-rose">
              {formatMoneyBn(metrics.totalCashOut)}
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
            <Users size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">কাস্টমারের কাছে পাওনা</span>
            <span className="dm-kpi-value dm-text-blue">
              {formatMoneyBn(metrics.customerDue)}
            </span>
          </span>
        </div>
      </div>

      {/* 4 Quick Action Tiles */}
      <div className="dm-actions-grid">
        <button
          type="button"
          onClick={() => navigate("/collections")}
          className="dm-action-tile"
        >
          <span className="dm-action-icon dm-tone-emerald" aria-hidden="true">
            <Wallet size={20} />
          </span>
          <span className="dm-action-label">বাকি আদায়</span>
        </button>

        <button
          type="button"
          onClick={openExpenseModal}
          className="dm-action-tile"
        >
          <span className="dm-action-icon dm-tone-rose" aria-hidden="true">
            <Receipt size={20} />
          </span>
          <span className="dm-action-label">খরচ লিখুন</span>
        </button>

        <button
          type="button"
          onClick={openAdjModal}
          className="dm-action-tile"
        >
          <span className="dm-action-icon dm-tone-amber" aria-hidden="true">
            <ArrowRightLeft size={20} />
          </span>
          <span className="dm-action-label">নগদ সমন্বয়</span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/suppliers")}
          className="dm-action-tile"
        >
          <span className="dm-action-icon dm-tone-blue" aria-hidden="true">
            <Building2 size={20} />
          </span>
          <span className="dm-action-label">সাপ্লায়ার পরিশোধ</span>
        </button>
      </div>

      {/* Filter Pills */}
      <div className="dm-section-head" style={{ marginBottom: 4 }}>
        <h2>নগদ লেনদেনের খাতা ({toBn(filteredLedger.length)}টি)</h2>
      </div>

      <div
        className="dm-pills dm-pills-scroll"
        role="group"
        aria-label="নগদ লেনদেন ফিল্টার"
      >
        {[
          { id: "all" as const, label: "সব" },
          { id: "sale" as const, label: "বিক্রি" },
          { id: "collection" as const, label: "বাকি আদায়" },
          { id: "purchase_pay" as const, label: "ক্রয় ও পরিশোধ" },
          { id: "expense" as const, label: "খরচ" },
        ].map((pill) => (
          <button
            key={pill.id}
            type="button"
            aria-pressed={filter === pill.id}
            onClick={() => setFilter(pill.id)}
            className={`dm-pill${filter === pill.id ? " is-active" : ""}`}
            style={{ minHeight: 44 }}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Cash Ledger Table */}
      <div
        tabIndex={0}
        role="region"
        aria-label="নগদ লেনদেনের খাতা"
        className="dm-table-wrap"
      >
        <table className="dm-table">
          <thead>
            <tr>
              <th>বিবরণ / পক্ষ</th>
              <th>ধরন</th>
              <th>তারিখ</th>
              <th>স্টাফ</th>
              <th>নোট</th>
              <th>পরিমাণ</th>
            </tr>
          </thead>
          <tbody>
            {filteredLedger.length === 0 ? (
              <tr>
                <td colSpan={6} className="dm-empty-inline">
                  কোনো নগদ লেনদেন পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              filteredLedger.map((entry) => {
                const isIn = entry.direction === "in";
                const meta = kindMeta(entry.kind);
                return (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.party}</strong>
                    </td>
                    <td>
                      <span className={meta.cls}>{meta.label}</span>
                    </td>
                    <td className="dm-text-muted">
                      {formatDateBn(entry.date, true)}
                    </td>
                    <td>{entry.staffName ?? "অ্যাডমিন"}</td>
                    <td className="dm-text-muted">{entry.note ?? "—"}</td>
                    <td>
                      <strong
                        className={isIn ? "dm-text-emerald" : "dm-text-rose"}
                        style={{
                          fontSize: 15,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isIn ? "+" : "−"} {formatMoneyBn(entry.amount)}
                      </strong>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Expense Modal */}
      <ModalDialog
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title="খরচ লিখুন"
        subtitle="দোকান বা ব্যবসার দৈনন্দিন নগদ খরচ রেকর্ড করুন"
        footer={
          <>
            <button
              type="button"
              onClick={() => setExpenseOpen(false)}
              className="dm-btn dm-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              form={expenseFormId}
              disabled={expSaving}
              className="dm-btn dm-btn-primary"
            >
              {expSaving ? "সংরক্ষণ হচ্ছে…" : "খরচ সংরক্ষণ করুন"}
            </button>
          </>
        }
      >
        <form
          id={expenseFormId}
          onSubmit={handleSaveExpense}
          className="dm-form-grid"
        >
          {expError && (
            <div className="dm-alert-error" role="alert">
              <span>{expError}</span>
            </div>
          )}

          <div className="dm-field">
            <label htmlFor="cash-exp-party">খরচের খাত / বিবরণ *</label>
            <input
              id="cash-exp-party"
              required
              value={expParty}
              onChange={(e) => setExpParty(e.target.value)}
              placeholder="যেমন: গুদাম ভাড়া, বিদ্যুৎ বিল, পরিবহন"
              className="dm-input"
            />
          </div>

          <div className="dm-field">
            <label htmlFor="cash-exp-amount">নগদ টাকার পরিমাণ (৳) *</label>
            <input
              id="cash-exp-amount"
              required
              inputMode="decimal"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="2500"
              className="dm-input"
            />
          </div>

          <div className="dm-field">
            <label htmlFor="cash-exp-note">নোট (ঐচ্ছিক)</label>
            <input
              id="cash-exp-note"
              value={expNote}
              onChange={(e) => setExpNote(e.target.value)}
              placeholder="খরচের সংক্ষিপ্ত বিবরণ"
              className="dm-input"
            />
          </div>
        </form>
      </ModalDialog>

      {/* Cash Adjustment Modal */}
      <ModalDialog
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        title="নগদ সমন্বয়"
        subtitle="ক্যাশ বাক্সে নগদ জমা বা উত্তোলন লিখুন"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAdjOpen(false)}
              className="dm-btn dm-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              form={adjFormId}
              disabled={adjSaving}
              className="dm-btn dm-btn-primary"
            >
              {adjSaving ? "সংরক্ষণ হচ্ছে…" : "সমন্বয় সংরক্ষণ করুন"}
            </button>
          </>
        }
      >
        <form
          id={adjFormId}
          onSubmit={handleSaveAdjustment}
          className="dm-form-grid"
        >
          {adjError && (
            <div className="dm-alert-error" role="alert">
              <span>{adjError}</span>
            </div>
          )}

          <div className="dm-field">
            <label>সমন্বয়ের ধরন</label>
            <div
              className="dm-seg-group"
              style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
            >
              <button
                type="button"
                aria-pressed={adjDirection === "in"}
                onClick={() => setAdjDirection("in")}
                className={`dm-seg-btn${adjDirection === "in" ? " is-active" : ""}`}
              >
                নগদ জমা (Cash In)
              </button>
              <button
                type="button"
                aria-pressed={adjDirection === "out"}
                onClick={() => setAdjDirection("out")}
                className={`dm-seg-btn${adjDirection === "out" ? " is-active" : ""}`}
              >
                নগদ উত্তোলন (Cash Out)
              </button>
            </div>
          </div>

          <div className="dm-field">
            <label htmlFor="cash-adj-party">বিবরণ *</label>
            <input
              id="cash-adj-party"
              required
              value={adjParty}
              onChange={(e) => setAdjParty(e.target.value)}
              placeholder={
                adjDirection === "in"
                  ? "যেমন: মালিক মূলধন জমা"
                  : "যেমন: মালিক নগদ উত্তোলন"
              }
              className="dm-input"
            />
          </div>

          <div className="dm-field">
            <label htmlFor="cash-adj-amount">নগদ টাকার পরিমাণ (৳) *</label>
            <input
              id="cash-adj-amount"
              required
              inputMode="decimal"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              placeholder="5000"
              className="dm-input"
            />
          </div>

          <div className="dm-field">
            <label htmlFor="cash-adj-note">নোট (ঐচ্ছিক)</label>
            <input
              id="cash-adj-note"
              value={adjNote}
              onChange={(e) => setAdjNote(e.target.value)}
              placeholder="সমন্বয়ের সংক্ষিপ্ত নোট"
              className="dm-input"
            />
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
