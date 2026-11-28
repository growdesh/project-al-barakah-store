import {
  ArrowLeft,
  Banknote,
  Eye,
  EyeOff,
  FileBarChart2,
  HandCoins,
  History,
  KeyRound,
  Pencil,
  Printer,
  Search,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { ModalDialog } from "../components/ModalDialog";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import {
  formatDateBn,
  formatMoneyBn,
  normalizePhone,
  parseAmountInput,
  toBn,
} from "../lib/format";
import { navigate } from "../lib/router";
import type {
  InvoiceStatus,
  StaffDetailReport,
  StaffPerformance,
} from "../types";

type StatusFilter = "all" | "active" | "inactive";
type ReportTab = "invoices" | "collections" | "handovers";

function invoiceBadge(status: InvoiceStatus) {
  if (status === "paid") {
    return { label: "পরিশোধিত", cls: "dm-badge dm-badge-emerald" };
  }
  if (status === "partial") {
    return { label: "আংশিক", cls: "dm-badge dm-badge-amber" };
  }
  return { label: "বাকি", cls: "dm-badge dm-badge-rose" };
}

export function StaffScreen() {
  const {
    user,
    data,
    toast,
    createStaff,
    updateStaff,
    createHandover,
    changeStaffPassword,
  } = useApp();

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [historyStaffFilter, setHistoryStaffFilter] = useState<string>("all");

  // Add Staff Modal State
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [addName, setAddName] = useState<string>("");
  const [addPhone, setAddPhone] = useState<string>("");
  const [addPassword, setAddPassword] = useState<string>("");
  const [showAddPwd, setShowAddPwd] = useState<boolean>(false);
  const [addNote, setAddNote] = useState<string>("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState<boolean>(false);

  // Edit Staff Modal State
  const [editMember, setEditMember] = useState<StaffPerformance | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editPhone, setEditPhone] = useState<string>("");
  const [editActive, setEditActive] = useState<boolean>(true);
  const [editNote, setEditNote] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);

  // Handover Modal State ("টাকা নিন")
  const [handoverMember, setHandoverMember] = useState<StaffPerformance | null>(
    null,
  );
  const [handoverAmount, setHandoverAmount] = useState<string>("");
  const [handoverNote, setHandoverNote] = useState<string>("");
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [handoverSaving, setHandoverSaving] = useState<boolean>(false);

  // Change Staff Password Modal State ("পাসওয়ার্ড পরিবর্তন")
  const [pwdMember, setPwdMember] = useState<StaffPerformance | null>(null);
  const [newStaffPwd, setNewStaffPwd] = useState<string>("");
  const [confirmStaffPwd, setConfirmStaffPwd] = useState<string>("");
  const [showNewStaffPwd, setShowNewStaffPwd] = useState<boolean>(false);
  const [showConfirmStaffPwd, setShowConfirmStaffPwd] =
    useState<boolean>(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState<boolean>(false);

  // Staff Detail Report Modal State
  const [reportMember, setReportMember] = useState<StaffPerformance | null>(
    null,
  );
  const [reportData, setReportData] = useState<StaffDetailReport | null>(null);
  const [reportLoading, setReportLoading] = useState<boolean>(false);
  const [reportTab, setReportTab] = useState<ReportTab>("invoices");

  const addFormId = useId();
  const editFormId = useId();
  const handoverFormId = useId();
  const pwdFormId = useId();

  const staffOnly = useMemo(
    () => (data?.staff ?? []).filter((m) => m.role === "staff"),
    [data?.staff],
  );

  const kpis = useMemo(() => {
    const activeCount = staffOnly.filter((m) => m.active).length;
    const totalSales = staffOnly.reduce((sum, m) => sum + m.totalSales, 0);
    const totalCashInHand = staffOnly.reduce((sum, m) => sum + m.cashInHand, 0);
    const totalHandedOver = staffOnly.reduce(
      (sum, m) => sum + m.totalHandedOver,
      0,
    );
    return {
      totalStaff: staffOnly.length,
      activeCount,
      totalSales,
      totalCashInHand,
      totalHandedOver,
    };
  }, [staffOnly]);

  const filteredStaff = useMemo(() => {
    const all = [...(data?.staff ?? [])].sort((a, b) => {
      if (a.role === b.role) return 0;
      return a.role === "staff" ? -1 : 1;
    });
    const q = search.trim().toLowerCase();
    const normQ = normalizePhone(search);
    return all.filter((m) => {
      if (statusFilter === "active" && !m.active) return false;
      if (statusFilter === "inactive" && m.active) return false;
      if (!q) return true;
      const matchesName = m.name.toLowerCase().includes(q);
      const matchesPhone =
        m.phone.toLowerCase().includes(q) ||
        (normQ.length > 0 && normalizePhone(m.phone).includes(normQ));
      return matchesName || matchesPhone;
    });
  }, [data?.staff, search, statusFilter]);

  const filteredHandovers = useMemo(() => {
    const list = data?.handovers ?? [];
    if (historyStaffFilter === "all") return list;
    return list.filter((h) => h.staffId === historyStaffFilter);
  }, [data?.handovers, historyStaffFilter]);

  if (!data || !user) return null;

  if (user.role !== "admin") {
    return (
      <div className="dm-access-denied">
        <ShieldAlert size={36} className="dm-text-rose" aria-hidden="true" />
        <h2>এই পেজে প্রবেশের অনুমতি নেই</h2>
        <p>শুধুমাত্র অ্যাডমিন স্টাফ ম্যানেজমেন্ট ব্যবহার করতে পারবেন।</p>
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
    setAddName("");
    setAddPhone("");
    setAddPassword("");
    setShowAddPwd(false);
    setAddNote("");
    setAddError(null);
    setAddOpen(true);
  };

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const name = addName.trim();
    const phone = normalizePhone(addPhone);
    const password = addPassword.trim();
    const note = addNote.trim();

    if (!name) {
      setAddError("স্টাফের নাম লিখুন");
      return;
    }
    if (phone.length < 6) {
      setAddError("সঠিক মোবাইল নম্বর দিন");
      return;
    }
    if (password.length < 6) {
      setAddError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }

    setAdding(true);
    try {
      await createStaff({
        name,
        phone,
        password,
        ...(note ? { note } : {}),
      });
      setAddOpen(false);
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "নতুন স্টাফ যোগ করা যায়নি",
      );
    } finally {
      setAdding(false);
    }
  };

  const openEditModal = (member: StaffPerformance) => {
    setEditMember(member);
    setEditName(member.name);
    setEditPhone(member.phone);
    setEditActive(member.active);
    setEditNote(member.note ?? "");
    setEditError(null);
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editMember) return;
    setEditError(null);

    const name = editName.trim();
    const phone = normalizePhone(editPhone);
    const note = editNote.trim();

    if (!name) {
      setEditError("স্টাফের নাম খালি রাখা যাবে না");
      return;
    }
    if (phone.length < 6) {
      setEditError("সঠিক মোবাইল নম্বর দিন");
      return;
    }

    setEditing(true);
    try {
      await updateStaff(editMember.id, {
        name,
        phone,
        active: editMember.role === "admin" ? true : editActive,
        note,
      });
      setEditMember(null);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "স্টাফের তথ্য আপডেট করা যায়নি",
      );
    } finally {
      setEditing(false);
    }
  };

  const openHandoverModal = (member: StaffPerformance) => {
    if (member.cashInHand <= 0) return;
    setHandoverMember(member);
    setHandoverAmount(String(member.cashInHand));
    setHandoverNote("");
    setHandoverError(null);
  };

  const parsedHandoverAmount =
    Math.round(parseAmountInput(handoverAmount) * 100) / 100;
  const remainingAfterHandover = handoverMember
    ? Math.max(0, Math.round((handoverMember.cashInHand - parsedHandoverAmount) * 100) / 100)
    : 0;

  const handleHandoverSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!handoverMember) return;
    setHandoverError(null);

    const amount = Math.round(parseAmountInput(handoverAmount) * 100) / 100;
    const note = handoverNote.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      setHandoverError("গ্রহণের পরিমাণ ০ টাকার বেশি হতে হবে");
      return;
    }
    if (amount > handoverMember.cashInHand + 0.001) {
      setHandoverError(
        `সর্বোচ্চ ${formatMoneyBn(handoverMember.cashInHand)} গ্রহণ করা যাবে`,
      );
      return;
    }

    setHandoverSaving(true);
    try {
      await createHandover({
        staffId: handoverMember.id,
        amount,
        ...(note ? { note } : {}),
      });
      setHandoverMember(null);
    } catch (err) {
      setHandoverError(
        err instanceof Error
          ? err.message
          : "স্টাফ থেকে টাকা গ্রহণ সম্পন্ন করা যায়নি",
      );
    } finally {
      setHandoverSaving(false);
    }
  };

  const openPasswordModal = (member: StaffPerformance) => {
    setPwdMember(member);
    setNewStaffPwd("");
    setConfirmStaffPwd("");
    setShowNewStaffPwd(false);
    setShowConfirmStaffPwd(false);
    setPwdError(null);
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pwdMember) return;
    setPwdError(null);

    const next = newStaffPwd.trim();
    const confirm = confirmStaffPwd.trim();

    if (next.length < 6) {
      setPwdError("নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }
    if (next !== confirm) {
      setPwdError("নতুন পাসওয়ার্ড এবং নিশ্চিতকরণ পাসওয়ার্ড মিলছে না");
      return;
    }

    setPwdSaving(true);
    try {
      await changeStaffPassword(pwdMember.id, next);
      setPwdMember(null);
    } catch (err) {
      setPwdError(
        err instanceof Error
          ? err.message
          : "পাসওয়ার্ড পরিবর্তন করা যায়নি",
      );
    } finally {
      setPwdSaving(false);
    }
  };

  const openStaffReport = async (
    member: StaffPerformance,
    initialTab: ReportTab = "invoices",
  ) => {
    setReportMember(member);
    setReportData(null);
    setReportTab(initialTab);
    setReportLoading(true);
    try {
      const res = await api.getStaffReport(member.id);
      setReportData(res);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "স্টাফ রিপোর্ট লোড করা যায়নি",
      );
      setReportMember(null);
    } finally {
      setReportLoading(false);
    }
  };

  const activeReportStaff = reportData?.staff ?? reportMember;
  const reportInvoices = reportData?.invoices ?? [];
  const reportCollections = reportData?.collections ?? [];
  const reportHandovers = reportData?.handovers ?? [];

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
            <h1 className="dm-page-title">স্টাফ ম্যানেজমেন্ট</h1>
            <p className="dm-page-sub">
              স্টাফ অ্যাকাউন্ট, নগদ হ্যান্ডওভার ও বিক্রি পারফরম্যান্স
            </p>
          </div>
        </div>
        <div className="dm-page-actions">
          <button
            type="button"
            onClick={openAddModal}
            className="dm-btn dm-btn-primary"
          >
            <UserPlus size={17} aria-hidden="true" />
            <span>+ নতুন স্টাফ</span>
          </button>
        </div>
      </div>

      {/* 4 KPIs */}
      <div className="dm-kpi-grid-4">
        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-blue" aria-hidden="true">
            <Users size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট স্টাফ</span>
            <span className="dm-kpi-value dm-text-blue dm-num">
              {toBn(kpis.totalStaff)}জন
            </span>
            <span className="dm-kpi-sub">
              {toBn(kpis.activeCount)}জন সক্রিয়
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-amber" aria-hidden="true">
            <Banknote size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">স্টাফদের কাছে এখন আছে</span>
            <span className="dm-kpi-value dm-text-amber dm-num">
              {formatMoneyBn(kpis.totalCashInHand)}
            </span>
            <span className="dm-kpi-sub">সংগ্রহের জন্য প্রস্তুত নগদ</span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-teal" aria-hidden="true">
            <HandCoins size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">মোট হ্যান্ডওভার গ্রহণ</span>
            <span className="dm-kpi-value dm-text-emerald dm-num">
              {formatMoneyBn(kpis.totalHandedOver)}
            </span>
            <span className="dm-kpi-sub">
              {toBn((data.handovers ?? []).length)}টি লেনদেন
            </span>
          </span>
        </div>

        <div className="dm-kpi-card">
          <span className="dm-kpi-icon dm-tone-emerald" aria-hidden="true">
            <TrendingUp size={19} />
          </span>
          <span className="dm-kpi-meta">
            <span className="dm-kpi-label">স্টাফদের মোট বিক্রি</span>
            <span className="dm-kpi-value dm-text-emerald dm-num">
              {formatMoneyBn(kpis.totalSales)}
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="স্টাফের নাম বা মোবাইল নম্বর খুঁজুন…"
            aria-label="স্টাফের নাম বা মোবাইল নম্বর খুঁজুন"
            className="dm-search-input"
          />
        </div>
      </div>

      <div
        className="dm-pills dm-pills-scroll"
        role="group"
        aria-label="স্টাফ অবস্থা ফিল্টার"
      >
        {[
          { id: "all" as const, label: "সব" },
          { id: "active" as const, label: "সক্রিয়" },
          { id: "inactive" as const, label: "নিষ্ক্রিয়" },
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

      {/* Mobile Staff Card List (< 768px) */}
      <div className="dm-mobile-list" aria-label="স্টাফ তালিকা ও পারফরম্যান্স">
        {filteredStaff.length === 0 ? (
          <div className="dm-card dm-empty-inline">
            কোনো স্টাফ অ্যাকাউন্ট পাওয়া যায়নি
          </div>
        ) : (
          filteredStaff.map((member) => {
            const isStaffRole = member.role === "staff";
            const canTakeCash = isStaffRole && member.cashInHand > 0;
            return (
              <article key={member.id} className="dm-mcard">
                <div className="dm-mcard-top">
                  <div className="dm-mcard-head">
                    <strong>{member.name}</strong>
                    <span className="dm-meta-tag">
                      {member.role === "admin" ? "অ্যাডমিন" : "স্টাফ"}
                    </span>
                  </div>
                  <span
                    className={`dm-badge ${
                      member.active ? "dm-badge-emerald" : "dm-badge-rose"
                    }`}
                  >
                    {member.active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                  </span>
                </div>

                <div className="dm-mcard-sub">
                  <span>
                    {member.phone}
                    {member.note ? ` · ${member.note}` : ""}
                  </span>
                </div>

                {/* Staff Cash-In-Hand Highlight Badge */}
                {isStaffRole && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background:
                        member.cashInHand > 0
                          ? "var(--dm-brand-50)"
                          : "var(--dm-surface-tint)",
                      border: `1px solid ${
                        member.cashInHand > 0
                          ? "var(--dm-brand-200)"
                          : "var(--dm-border)"
                      }`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color:
                          member.cashInHand > 0
                            ? "var(--dm-brand-700)"
                            : "var(--dm-text-muted)",
                      }}
                      className="dm-num"
                    >
                      স্টাফের কাছে এখন আছে: {formatMoneyBn(member.cashInHand)}
                    </span>
                    <button
                      type="button"
                      disabled={!canTakeCash}
                      aria-label={`টাকা নিন — ${member.name}`}
                      onClick={() => openHandoverModal(member)}
                      className="dm-btn dm-btn-primary dm-btn-sm"
                      style={{ minHeight: 38 }}
                    >
                      <HandCoins size={15} aria-hidden="true" />
                      <span>টাকা নিন</span>
                    </button>
                  </div>
                )}

                <div className="dm-mcard-metrics">
                  <span>
                    বিক্রি:{" "}
                    <strong className="dm-num">
                      {formatMoneyBn(member.totalSales)}
                    </strong>
                  </span>
                  <span>
                    মোট নগদ:{" "}
                    <strong className="dm-text-emerald dm-num">
                      {formatMoneyBn(member.totalCashReceived)}
                    </strong>
                  </span>
                  <span>
                    জমা দিয়েছে:{" "}
                    <strong className="dm-text-blue dm-num">
                      {formatMoneyBn(member.totalHandedOver)}
                    </strong>
                  </span>
                </div>

                <div className="dm-mcard-actions" style={{ flexWrap: "wrap" }}>
                  <button
                    type="button"
                    aria-label={`রিপোর্ট — ${member.name}`}
                    onClick={() => openStaffReport(member, "invoices")}
                    className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                  >
                    <FileBarChart2 size={15} aria-hidden="true" />
                    <span>রিপোর্ট</span>
                  </button>
                  {isStaffRole && (
                    <button
                      type="button"
                      aria-label={`হ্যান্ডওভার ইতিহাস — ${member.name}`}
                      onClick={() => openStaffReport(member, "handovers")}
                      className="dm-btn dm-btn-outline dm-btn-sm"
                    >
                      <History size={14} aria-hidden="true" />
                      <span>হ্যান্ডওভার</span>
                    </button>
                  )}
                  {isStaffRole && (
                    <button
                      type="button"
                      aria-label={`পাসওয়ার্ড পরিবর্তন — ${member.name}`}
                      onClick={() => openPasswordModal(member)}
                      className="dm-btn dm-btn-outline dm-btn-sm"
                    >
                      <KeyRound size={14} aria-hidden="true" />
                      <span>পাসওয়ার্ড পরিবর্তন</span>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`সম্পাদনা — ${member.name}`}
                    onClick={() => openEditModal(member)}
                    className="dm-btn dm-btn-outline dm-btn-sm"
                  >
                    <Pencil size={14} aria-hidden="true" />
                    <span>সম্পাদনা</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Desktop Staff Performance Table (>= 768px) */}
      <div
        tabIndex={0}
        role="region"
        aria-label="স্টাফ তালিকা ও পারফরম্যান্স"
        className="dm-table-wrap dm-desktop-table"
      >
        <table className="dm-table">
          <thead>
            <tr>
              <th>স্টাফ ও মোবাইল</th>
              <th>অবস্থা</th>
              <th>স্টাফের কাছে এখন আছে</th>
              <th>মোট বিক্রি</th>
              <th>মোট নগদ প্রাপ্তি</th>
              <th>জমা দিয়েছে</th>
              <th>কার্যক্রম</th>
            </tr>
          </thead>
          <tbody>
            {filteredStaff.length === 0 ? (
              <tr>
                <td colSpan={7} className="dm-empty-inline">
                  কোনো স্টাফ অ্যাকাউন্ট পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              filteredStaff.map((member) => {
                const isStaffRole = member.role === "staff";
                const canTakeCash = isStaffRole && member.cashInHand > 0;
                return (
                  <tr key={member.id}>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <strong>{member.name}</strong>
                        <span
                          className={`dm-badge ${
                            member.role === "admin"
                              ? "dm-badge-amber"
                              : "dm-badge-blue"
                          }`}
                        >
                          {member.role === "admin" ? "অ্যাডমিন" : "স্টাফ"}
                        </span>
                      </div>
                      <small
                        className="dm-text-muted"
                        style={{ display: "block", marginTop: 2 }}
                      >
                        {member.phone}
                        {member.note ? ` · ${member.note}` : ""}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`dm-badge ${
                          member.active ? "dm-badge-emerald" : "dm-badge-rose"
                        }`}
                      >
                        {member.active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                      </span>
                    </td>
                    <td>
                      {isStaffRole ? (
                        <span
                          className={`dm-badge dm-num ${
                            member.cashInHand > 0
                              ? "dm-badge-emerald"
                              : "dm-badge-slate"
                          }`}
                          style={{ fontSize: 12.5, whiteSpace: "nowrap" }}
                        >
                          স্টাফের কাছে এখন আছে:{" "}
                          {formatMoneyBn(member.cashInHand)}
                        </span>
                      ) : (
                        <span className="dm-text-muted">দোকানের ক্যাশ</span>
                      )}
                    </td>
                    <td className="dm-num">
                      <strong style={{ display: "block" }}>
                        {formatMoneyBn(member.totalSales)}
                      </strong>
                      <small className="dm-text-muted">
                        {toBn(member.salesCount)}টি চালান
                      </small>
                    </td>
                    <td className="dm-num">
                      <strong
                        className="dm-text-emerald"
                        style={{ display: "block", whiteSpace: "nowrap" }}
                      >
                        {formatMoneyBn(member.totalCashReceived)}
                      </strong>
                      <small
                        className="dm-text-muted"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        বিক্রি {formatMoneyBn(member.saleCashReceived)} + আদায়{" "}
                        {formatMoneyBn(member.dueCashCollected)}
                      </small>
                    </td>
                    <td
                      className="dm-text-blue dm-num"
                      style={{ fontWeight: 700, whiteSpace: "nowrap" }}
                    >
                      {formatMoneyBn(member.totalHandedOver)}
                    </td>
                    <td>
                      <div
                        className="dm-table-actions"
                        style={{ flexWrap: "wrap" }}
                      >
                        {isStaffRole && (
                          <button
                            type="button"
                            disabled={!canTakeCash}
                            aria-label={`টাকা নিন — ${member.name}`}
                            onClick={() => openHandoverModal(member)}
                            className="dm-btn dm-btn-primary dm-btn-sm"
                            style={{ minHeight: 40 }}
                          >
                            <HandCoins size={15} aria-hidden="true" />
                            <span>টাকা নিন</span>
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`রিপোর্ট — ${member.name}`}
                          onClick={() => openStaffReport(member, "invoices")}
                          className="dm-btn dm-btn-soft-emerald dm-btn-sm"
                          style={{ minHeight: 40 }}
                        >
                          <FileBarChart2 size={15} aria-hidden="true" />
                          <span>রিপোর্ট</span>
                        </button>
                        {isStaffRole && (
                          <button
                            type="button"
                            aria-label={`পাসওয়ার্ড পরিবর্তন — ${member.name}`}
                            onClick={() => openPasswordModal(member)}
                            className="dm-btn dm-btn-outline dm-btn-sm"
                            style={{ minHeight: 40 }}
                          >
                            <KeyRound size={14} aria-hidden="true" />
                            <span>পাসওয়ার্ড পরিবর্তন</span>
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`সম্পাদনা — ${member.name}`}
                          onClick={() => openEditModal(member)}
                          className="dm-btn dm-btn-outline dm-btn-sm"
                          style={{ minHeight: 40 }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          <span>সম্পাদনা</span>
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

      {/* Handover History Section ("হ্যান্ডওভার ইতিহাস") */}
      <section className="dm-stack-sm" aria-label="হ্যান্ডওভার ইতিহাস">
        <div className="dm-section-head" style={{ marginBottom: 2 }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <History size={18} aria-hidden="true" />
            <span>
              হ্যান্ডওভার ইতিহাস ({toBn(filteredHandovers.length)}টি)
            </span>
          </h2>
        </div>

        {/* Per-Staff Filter Pills for Handover History */}
        <div
          className="dm-pills dm-pills-scroll"
          role="group"
          aria-label="হ্যান্ডওভার ইতিহাস স্টাফ ফিল্টার"
        >
          <button
            type="button"
            aria-pressed={historyStaffFilter === "all"}
            onClick={() => setHistoryStaffFilter("all")}
            className={`dm-pill${historyStaffFilter === "all" ? " is-active" : ""}`}
            style={{ minHeight: 40 }}
          >
            সব স্টাফ
          </button>
          {staffOnly.map((member) => (
            <button
              key={member.id}
              type="button"
              aria-pressed={historyStaffFilter === member.id}
              onClick={() => setHistoryStaffFilter(member.id)}
              className={`dm-pill${historyStaffFilter === member.id ? " is-active" : ""}`}
              style={{ minHeight: 40 }}
            >
              {member.name}
            </button>
          ))}
        </div>

        {/* Mobile Handover History Cards (< 768px) */}
        <div className="dm-mobile-list">
          {filteredHandovers.length === 0 ? (
            <div className="dm-card dm-empty-inline">
              এখনো কোনো হ্যান্ডওভার ইতিহাস নেই
            </div>
          ) : (
            filteredHandovers.map((item) => (
              <article key={item.id} className="dm-mcard">
                <div className="dm-mcard-top">
                  <div className="dm-mcard-head">
                    <strong>{item.staffName}</strong>
                    <span className="dm-badge dm-badge-teal">
                      স্টাফ থেকে টাকা গ্রহণ
                    </span>
                  </div>
                  <strong className="dm-mcard-amount dm-text-emerald dm-num">
                    {formatMoneyBn(item.amount)}
                  </strong>
                </div>
                <div className="dm-mcard-sub dm-num">
                  <span>{formatDateBn(item.createdAt, true)}</span>
                  <span>
                    আগে: {formatMoneyBn(item.balanceBefore)} → পরে:{" "}
                    {formatMoneyBn(item.balanceAfter)}
                  </span>
                </div>
                {item.note && (
                  <div className="dm-mcard-sub">
                    <span className="dm-mcard-note">নোট: {item.note}</span>
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        {/* Desktop Handover History Table (>= 768px) */}
        <div
          tabIndex={0}
          role="region"
          aria-label="হ্যান্ডওভার ইতিহাস টেবিল"
          className="dm-table-wrap dm-desktop-table"
        >
          <table className="dm-table">
            <thead>
              <tr>
                <th>তারিখ ও সময়</th>
                <th>স্টাফ</th>
                <th>গ্রহণের পরিমাণ</th>
                <th>আগের ব্যালেন্স</th>
                <th>পরের ব্যালেন্স</th>
                <th>নোট</th>
              </tr>
            </thead>
            <tbody>
              {filteredHandovers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="dm-empty-inline">
                    এখনো কোনো হ্যান্ডওভার ইতিহাস নেই
                  </td>
                </tr>
              ) : (
                filteredHandovers.map((item) => (
                  <tr key={item.id}>
                    <td className="dm-text-muted">
                      {formatDateBn(item.createdAt, true)}
                    </td>
                    <td>
                      <strong>{item.staffName}</strong>
                    </td>
                    <td
                      className="dm-text-emerald dm-num"
                      style={{ fontWeight: 800, whiteSpace: "nowrap" }}
                    >
                      {formatMoneyBn(item.amount)}
                    </td>
                    <td className="dm-num" style={{ whiteSpace: "nowrap" }}>
                      {formatMoneyBn(item.balanceBefore)}
                    </td>
                    <td
                      className="dm-num dm-text-muted"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {formatMoneyBn(item.balanceAfter)}
                    </td>
                    <td className="dm-text-muted">{item.note ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Handover Modal ("টাকা নিন") */}
      <ModalDialog
        open={Boolean(handoverMember)}
        onClose={() => setHandoverMember(null)}
        title="স্টাফ থেকে টাকা নিন"
        subtitle="নগদ গ্রহণ নিশ্চিত হলে স্টাফের ব্যালেন্স কমে দোকানের নগদ হিসাবে যোগ হবে"
        footer={
          <>
            <button
              type="button"
              onClick={() => setHandoverMember(null)}
              className="dm-btn dm-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              form={handoverFormId}
              disabled={handoverSaving}
              className="dm-btn dm-btn-primary"
            >
              {handoverSaving ? "সংরক্ষণ হচ্ছে…" : "নিশ্চিত করুন"}
            </button>
          </>
        }
      >
        {handoverMember && (
          <form
            id={handoverFormId}
            onSubmit={handleHandoverSubmit}
            className="dm-form-grid"
          >
            {handoverError && (
              <div className="dm-alert-error" role="alert">
                <span>{handoverError}</span>
              </div>
            )}

            <div
              className="dm-card dm-card-pad-sm"
              style={{
                background: "var(--dm-brand-50)",
                borderColor: "var(--dm-brand-200)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <strong style={{ display: "block", fontSize: 15 }}>
                  {handoverMember.name}
                </strong>
                <small className="dm-text-muted">{handoverMember.phone}</small>
              </div>
              <div style={{ textAlign: "right" }}>
                <small
                  className="dm-text-muted"
                  style={{ display: "block", fontWeight: 600 }}
                >
                  স্টাফের কাছে এখন আছে
                </small>
                <strong
                  className="dm-text-emerald dm-num"
                  style={{ fontSize: 20 }}
                >
                  {formatMoneyBn(handoverMember.cashInHand)}
                </strong>
              </div>
            </div>

            <div className="dm-field">
              <label htmlFor="handover-amount">গ্রহণের পরিমাণ (৳) *</label>
              <input
                id="handover-amount"
                type="text"
                inputMode="decimal"
                required
                value={handoverAmount}
                onChange={(e) => setHandoverAmount(e.target.value)}
                placeholder="টাকার পরিমাণ লিখুন"
                className="dm-input dm-num"
              />
              <small className="dm-text-muted dm-num">
                আংশিক বা সম্পূর্ণ টাকা নিতে পারবেন · গ্রহণের পর স্টাফের কাছে থাকবে:{" "}
                <strong>{formatMoneyBn(remainingAfterHandover)}</strong>
              </small>
            </div>

            <div className="dm-field">
              <label htmlFor="handover-note">নোট (ঐচ্ছিক)</label>
              <input
                id="handover-note"
                value={handoverNote}
                onChange={(e) => setHandoverNote(e.target.value)}
                placeholder="যেমন: দুপুরের নগদ জমা বা দিনের শেষ হিসাব"
                className="dm-input"
              />
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Change Staff Password Modal ("পাসওয়ার্ড পরিবর্তন") */}
      <ModalDialog
        open={Boolean(pwdMember)}
        onClose={() => setPwdMember(null)}
        title="পাসওয়ার্ড পরিবর্তন"
        subtitle={
          pwdMember ? `${pwdMember.name} (${pwdMember.phone})` : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setPwdMember(null)}
              className="dm-btn dm-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              form={pwdFormId}
              disabled={pwdSaving}
              className="dm-btn dm-btn-primary"
            >
              {pwdSaving ? "আপডেট হচ্ছে…" : "পাসওয়ার্ড সংরক্ষণ করুন"}
            </button>
          </>
        }
      >
        <form
          id={pwdFormId}
          onSubmit={handlePasswordSubmit}
          className="dm-form-grid"
        >
          {pwdError && (
            <div className="dm-alert-error" role="alert">
              <span>{pwdError}</span>
            </div>
          )}

          <div className="dm-field">
            <label htmlFor="staff-new-pwd">নতুন পাসওয়ার্ড *</label>
            <div className="dm-password-wrap">
              <input
                id="staff-new-pwd"
                type={showNewStaffPwd ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                value={newStaffPwd}
                onChange={(e) => setNewStaffPwd(e.target.value)}
                placeholder="কমপক্ষে ৬ অক্ষরের নতুন পাসওয়ার্ড"
                className="dm-input"
              />
              <button
                type="button"
                onClick={() => setShowNewStaffPwd((v) => !v)}
                aria-label={
                  showNewStaffPwd ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"
                }
                className="dm-password-toggle"
              >
                {showNewStaffPwd ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="dm-field">
            <label htmlFor="staff-confirm-pwd">পাসওয়ার্ড নিশ্চিত করুন *</label>
            <div className="dm-password-wrap">
              <input
                id="staff-confirm-pwd"
                type={showConfirmStaffPwd ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmStaffPwd}
                onChange={(e) => setConfirmStaffPwd(e.target.value)}
                placeholder="নতুন পাসওয়ার্ড আবার লিখুন"
                className="dm-input"
              />
              <button
                type="button"
                onClick={() => setShowConfirmStaffPwd((v) => !v)}
                aria-label={
                  showConfirmStaffPwd ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"
                }
                className="dm-password-toggle"
              >
                {showConfirmStaffPwd ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* Add Staff Modal */}
      <ModalDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="নতুন স্টাফ যোগ করুন"
        subtitle="নতুন স্টাফের লগইন অ্যাকাউন্ট তৈরি করুন"
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
              {adding ? "সংরক্ষণ হচ্ছে…" : "স্টাফ যোগ করুন"}
            </button>
          </>
        }
      >
        <form
          id={addFormId}
          onSubmit={handleAddSubmit}
          className="dm-form-grid"
        >
          {addError && (
            <div className="dm-alert-error" role="alert">
              <span>{addError}</span>
            </div>
          )}

          <div className="dm-field">
            <label htmlFor="staff-add-name">স্টাফের নাম *</label>
            <input
              id="staff-add-name"
              required
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="যেমন: মো. তানভীর আহমেদ"
              className="dm-input"
            />
          </div>

          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="staff-add-phone">মোবাইল নম্বর *</label>
              <input
                id="staff-add-phone"
                type="tel"
                inputMode="tel"
                required
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="018XXXXXXXX"
                className="dm-input"
              />
            </div>

            <div className="dm-field">
              <label htmlFor="staff-add-pwd">পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর) *</label>
              <div className="dm-password-wrap">
                <input
                  id="staff-add-pwd"
                  type={showAddPwd ? "text" : "password"}
                  required
                  minLength={6}
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="কমপক্ষে ৬ অক্ষর"
                  className="dm-input"
                />
                <button
                  type="button"
                  onClick={() => setShowAddPwd((v) => !v)}
                  aria-label={
                    showAddPwd ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"
                  }
                  className="dm-password-toggle"
                >
                  {showAddPwd ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="dm-field">
            <label htmlFor="staff-add-note">পদবি / নোট (ঐচ্ছিক)</label>
            <input
              id="staff-add-note"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
              placeholder="যেমন: পাইকারি বিক্রয় ও কালেকশন স্টাফ"
              className="dm-input"
            />
          </div>
        </form>
      </ModalDialog>

      {/* Edit Staff Modal */}
      <ModalDialog
        open={Boolean(editMember)}
        onClose={() => setEditMember(null)}
        title="স্টাফ তথ্য সম্পাদনা"
        subtitle={
          editMember
            ? `${editMember.name} · ${editMember.role === "admin" ? "অ্যাডমিন অ্যাকাউন্ট" : "স্টাফ অ্যাকাউন্ট"}`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditMember(null)}
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
              {editing ? "আপডেট হচ্ছে…" : "পরিবর্তন সংরক্ষণ"}
            </button>
          </>
        }
      >
        <form
          id={editFormId}
          onSubmit={handleEditSubmit}
          className="dm-form-grid"
        >
          {editError && (
            <div className="dm-alert-error" role="alert">
              <span>{editError}</span>
            </div>
          )}

          <div className="dm-form-row-2">
            <div className="dm-field">
              <label htmlFor="staff-edit-name">নাম *</label>
              <input
                id="staff-edit-name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="dm-input"
              />
            </div>

            <div className="dm-field">
              <label htmlFor="staff-edit-phone">মোবাইল নম্বর *</label>
              <input
                id="staff-edit-phone"
                type="tel"
                inputMode="tel"
                required
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="dm-input"
              />
            </div>
          </div>

          <div className="dm-field">
            <label>অ্যাকাউন্ট অবস্থা</label>
            <div
              className="dm-seg-group"
              style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
            >
              <button
                type="button"
                disabled={editMember?.role === "admin"}
                aria-pressed={editActive}
                onClick={() => setEditActive(true)}
                className={`dm-seg-btn${editActive ? " is-active" : ""}`}
              >
                সক্রিয়
              </button>
              <button
                type="button"
                disabled={editMember?.role === "admin"}
                aria-pressed={!editActive}
                onClick={() => setEditActive(false)}
                className={`dm-seg-btn${!editActive ? " is-active" : ""}`}
              >
                নিষ্ক্রিয়
              </button>
            </div>
            {editMember?.role === "admin" && (
              <small className="dm-text-muted">
                অ্যাডমিন অ্যাকাউন্ট নিষ্ক্রিয় করা যাবে না।
              </small>
            )}
          </div>

          <div className="dm-field">
            <label htmlFor="staff-edit-note">পদবি / নোট</label>
            <input
              id="staff-edit-note"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="সংক্ষিপ্ত তথ্য বা দায়িত্ব"
              className="dm-input"
            />
          </div>
        </form>
      </ModalDialog>

      {/* Individual Staff Performance Report Modal */}
      <ModalDialog
        open={Boolean(reportMember)}
        onClose={() => {
          setReportMember(null);
          setReportData(null);
        }}
        title={
          activeReportStaff
            ? `${activeReportStaff.name} — পারফরম্যান্স রিপোর্ট`
            : "স্টাফ পারফরম্যান্স রিপোর্ট"
        }
        subtitle={
          activeReportStaff
            ? `${activeReportStaff.phone} · ${activeReportStaff.role === "admin" ? "অ্যাডমিন" : "স্টাফ"}`
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
              onClick={() => {
                setReportMember(null);
                setReportData(null);
              }}
              className="dm-btn dm-btn-primary"
            >
              বন্ধ করুন
            </button>
          </>
        }
      >
        {reportLoading || !activeReportStaff ? (
          <div className="dm-empty-state">
            <p>স্টাফ রিপোর্ট লোড হচ্ছে…</p>
          </div>
        ) : (
          <div className="dm-stack-md">
            {/* Member Summary Card */}
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
                  <strong style={{ display: "block", fontSize: 15 }}>
                    {activeReportStaff.name}
                  </strong>
                  <small className="dm-text-muted">
                    মোবাইল: {activeReportStaff.phone}
                    {activeReportStaff.note
                      ? ` · ${activeReportStaff.note}`
                      : ""}
                  </small>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span
                    className={`dm-badge ${
                      activeReportStaff.role === "admin"
                        ? "dm-badge-amber"
                        : "dm-badge-blue"
                    }`}
                  >
                    {activeReportStaff.role === "admin" ? "অ্যাডমিন" : "স্টাফ"}
                  </span>
                  <span
                    className={`dm-badge ${
                      activeReportStaff.active
                        ? "dm-badge-emerald"
                        : "dm-badge-rose"
                    }`}
                  >
                    {activeReportStaff.active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 KPI Cards */}
            <div className="dm-kpi-grid">
              <div className="dm-kpi-card">
                <span className="dm-kpi-meta">
                  <span className="dm-kpi-label">মোট বিক্রি</span>
                  <span className="dm-kpi-value dm-text-slate dm-num">
                    {formatMoneyBn(activeReportStaff.totalSales)}
                  </span>
                  <span className="dm-kpi-sub">
                    {toBn(activeReportStaff.salesCount)}টি চালান
                  </span>
                </span>
              </div>

              <div className="dm-kpi-card">
                <span className="dm-kpi-meta">
                  <span className="dm-kpi-label">বিক্রি থেকে নগদ</span>
                  <span className="dm-kpi-value dm-text-emerald dm-num">
                    {formatMoneyBn(activeReportStaff.saleCashReceived)}
                  </span>
                </span>
              </div>

              <div className="dm-kpi-card">
                <span className="dm-kpi-meta">
                  <span className="dm-kpi-label">
                    বাকি আদায় ({toBn(activeReportStaff.dueCollectionCount)}টি)
                  </span>
                  <span className="dm-kpi-value dm-text-blue dm-num">
                    {formatMoneyBn(activeReportStaff.dueCashCollected)}
                  </span>
                </span>
              </div>

              <div className="dm-kpi-card">
                <span className="dm-kpi-meta">
                  <span className="dm-kpi-label">মোট হ্যান্ডওভার জমা</span>
                  <span className="dm-kpi-value dm-text-blue dm-num">
                    {formatMoneyBn(activeReportStaff.totalHandedOver)}
                  </span>
                </span>
              </div>
            </div>

            {/* Cash In Hand Banner */}
            {activeReportStaff.role === "staff" && (
              <div
                className="dm-card dm-card-pad-sm"
                style={{
                  background: "var(--dm-brand-50)",
                  borderColor: "var(--dm-brand-200)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <strong
                    className="dm-text-emerald"
                    style={{ display: "block" }}
                  >
                    স্টাফের কাছে এখন আছে
                  </strong>
                  <small className="dm-text-muted dm-num">
                    নগদ প্রাপ্তি ({formatMoneyBn(activeReportStaff.totalCashReceived)})
                    − হ্যান্ডওভার ({formatMoneyBn(activeReportStaff.totalHandedOver)})
                  </small>
                </div>
                <strong
                  className="dm-text-emerald dm-num"
                  style={{ fontSize: 20 }}
                >
                  {formatMoneyBn(activeReportStaff.cashInHand)}
                </strong>
              </div>
            )}

            {/* Modal Tabs */}
            <div
              className="dm-tabs"
              role="tablist"
              aria-label="স্টাফ লেনদেনের ইতিহাস"
            >
              <button
                type="button"
                role="tab"
                aria-selected={reportTab === "invoices"}
                onClick={() => setReportTab("invoices")}
                className={`dm-tab${reportTab === "invoices" ? " is-active" : ""}`}
              >
                বিক্রির ইতিহাস ({toBn(reportInvoices.length)})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reportTab === "collections"}
                onClick={() => setReportTab("collections")}
                className={`dm-tab${reportTab === "collections" ? " is-active" : ""}`}
              >
                বাকি আদায় ({toBn(reportCollections.length)})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reportTab === "handovers"}
                onClick={() => setReportTab("handovers")}
                className={`dm-tab${reportTab === "handovers" ? " is-active" : ""}`}
              >
                হ্যান্ডওভার ইতিহাস ({toBn(reportHandovers.length)})
              </button>
            </div>

            {reportTab === "invoices" ? (
              <div
                tabIndex={0}
                role="region"
                aria-label="স্টাফের বিক্রির ইতিহাস"
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
                    {reportInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="dm-empty-inline">
                          কোনো বিক্রয় চালান পাওয়া যায়নি
                        </td>
                      </tr>
                    ) : (
                      reportInvoices.map((inv) => {
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
                            <td className="dm-num">
                              <strong>{formatMoneyBn(inv.total)}</strong>
                            </td>
                            <td
                              className="dm-text-emerald dm-num"
                              style={{ fontWeight: 700 }}
                            >
                              {formatMoneyBn(inv.initialPaid)}
                            </td>
                            <td
                              className={`dm-num ${
                                inv.due > 0 ? "dm-text-rose" : "dm-text-muted"
                              }`}
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
            ) : reportTab === "collections" ? (
              <div
                tabIndex={0}
                role="region"
                aria-label="স্টাফের বাকি আদায়ের ইতিহাস"
                className="dm-table-wrap"
              >
                <table className="dm-table">
                  <thead>
                    <tr>
                      <th>রসিদ</th>
                      <th>তারিখ</th>
                      <th>কাস্টমার</th>
                      <th>চালান</th>
                      <th>আদায় (নগদ)</th>
                      <th>নোট</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportCollections.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="dm-empty-inline">
                          কোনো বাকি আদায়ের রেকর্ড পাওয়া যায়নি
                        </td>
                      </tr>
                    ) : (
                      reportCollections.map((col) => (
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
                          <td
                            className="dm-text-emerald dm-num"
                            style={{ fontWeight: 700 }}
                          >
                            {formatMoneyBn(col.amount)}
                          </td>
                          <td className="dm-text-muted">{col.note ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-label="স্টাফের হ্যান্ডওভার ইতিহাস"
                className="dm-table-wrap"
              >
                <table className="dm-table">
                  <thead>
                    <tr>
                      <th>তারিখ ও সময়</th>
                      <th>গ্রহণের পরিমাণ</th>
                      <th>আগের ব্যালেন্স</th>
                      <th>পরের ব্যালেন্স</th>
                      <th>নোট</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportHandovers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="dm-empty-inline">
                          কোনো হ্যান্ডওভার রেকর্ড পাওয়া যায়নি
                        </td>
                      </tr>
                    ) : (
                      reportHandovers.map((h) => (
                        <tr key={h.id}>
                          <td className="dm-text-muted">
                            {formatDateBn(h.createdAt, true)}
                          </td>
                          <td
                            className="dm-text-emerald dm-num"
                            style={{ fontWeight: 800, whiteSpace: "nowrap" }}
                          >
                            {formatMoneyBn(h.amount)}
                          </td>
                          <td className="dm-num">
                            {formatMoneyBn(h.balanceBefore)}
                          </td>
                          <td className="dm-num dm-text-muted">
                            {formatMoneyBn(h.balanceAfter)}
                          </td>
                          <td className="dm-text-muted">{h.note ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
