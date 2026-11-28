import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  AuthUser,
  BootstrapPayload,
  CashLedgerEntry,
  Customer,
  DueCollection,
  InvoiceItem,
  InvoiceStatus,
  Product,
  PurchaseInvoice,
  SaleInvoice,
  StaffDetailReport,
  StaffHandover,
  StoreProfile,
  StoreSettings,
  Supplier,
  UserRole,
} from "../types";
import { hashPassword, verifyPassword } from "./crypto";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { formatDateBn, toEnDigits } from "./format";
import { computeStaffPerformance, normalizePhoneDigits } from "./handoverCalc";

export { computeStaffPerformance, normalizePhoneDigits };

export class StoreError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

export interface StoredUserRecord {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  passwordHash: string;
  active: boolean;
  note?: string;
  createdAt: string;
}

interface StoredMetaDoc {
  store: StoreProfile;
  settings: StoreSettings;
  openingCash: number;
  updatedAt?: string;
}

interface StoredProduct extends Product {
  purchaseRate: number;
}

interface StoredInvoiceItem extends InvoiceItem {
  purchaseRate: number;
}

interface StoredSaleInvoice extends Omit<SaleInvoice, "items"> {
  items: StoredInvoiceItem[];
}

interface StaffCashState {
  staffId: string;
  cashBalance: number;
  totalHandedOver: number;
  updatedAt: string;
}

interface RawSnapshotState {
  meta: StoredMetaDoc;
  users: StoredUserRecord[];
  products: StoredProduct[];
  customers: Customer[];
  suppliers: Supplier[];
  invoices: StoredSaleInvoice[];
  purchases: PurchaseInvoice[];
  collections: DueCollection[];
  ledger: CashLedgerEntry[];
  handovers: StaffHandover[];
}

const DEFAULT_STORE: StoreProfile = {
  name: "আল-বারাকাহ স্টোর",
  subtitle: "পাইকারি ব্যবসা ব্যবস্থাপনা",
  address: "চকবাজার, ঢাকা",
  phone: "01806476652",
  ownerName: "আল-বারাকাহ অ্যাডমিন",
  initials: "AB",
};

const DEFAULT_SETTINGS: StoreSettings = {
  invoicePrefix: "ABS",
  invoiceFooter: "আল-বারাকাহ স্টোর · নগদ ও বাকি পাইকারি চালান",
  allowNegativeStock: false,
};

const DEFAULT_META: StoredMetaDoc = {
  store: DEFAULT_STORE,
  settings: DEFAULT_SETTINGS,
  openingCash: 0,
};

const SESSION_UID_KEY = "ab_session_uid_v1";

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SESSION_UID_KEY);
  } catch {
    return null;
  }
}

export function setStoredUserId(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_UID_KEY, userId);
  } catch {
    // Ignore storage errors
  }
}

export function clearStoredUserId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_UID_KEY);
  } catch {
    // Ignore storage errors
  }
}

function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = toEnDigits(value).trim();
    if (!trimmed) return Number.NaN;
    return Number(trimmed);
  }
  return Number.NaN;
}

function randomHex(len = 8): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, len);
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(
    0,
    len,
  );
}

function makeId(prefix: string): string {
  return `${prefix}-${randomHex(10)}`;
}

function nextSeqNumber(
  prefix: string,
  existingNumbers: string[],
  minStart = 101,
  padWidth = 4,
): string {
  let maxNum = minStart - 1;
  for (const numStr of existingNumbers) {
    const match = String(numStr || "").match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxNum) {
        maxNum = n;
      }
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(padWidth, "0")}`;
}

function sortByDateDesc<T extends { date?: string; createdAt?: string }>(
  items: T[],
): T[] {
  return items.slice().sort((a, b) => {
    const tA = Date.parse(a.date ?? a.createdAt ?? "") || 0;
    const tB = Date.parse(b.date ?? b.createdAt ?? "") || 0;
    return tB - tA;
  });
}

function sanitizeUser(user: StoredUserRecord): AuthUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    active: Boolean(user.active),
    ...(user.note ? { note: user.note } : {}),
    createdAt: user.createdAt,
  };
}

function sanitizeProductForRole(product: StoredProduct, role: UserRole): Product {
  if (role === "admin") return { ...product };
  const { purchaseRate: _ignored, ...rest } = product;
  return rest;
}

function sanitizeInvoiceForRole(
  invoice: StoredSaleInvoice,
  role: UserRole,
): SaleInvoice {
  if (role === "admin") {
    return {
      ...invoice,
      items: (invoice.items || []).map((item) => ({ ...item })),
    };
  }
  return {
    ...invoice,
    items: (invoice.items || []).map(({ purchaseRate: _ignored, ...rest }) => rest),
  };
}

function buildBootstrapPayload(
  raw: RawSnapshotState,
  user: StoredUserRecord,
): BootstrapPayload {
  const safeUser = sanitizeUser(user);
  const sortedInvoices = sortByDateDesc(raw.invoices);
  const sortedCollections = sortByDateDesc(raw.collections);
  const sortedPurchases = sortByDateDesc(raw.purchases);
  const sortedLedger = sortByDateDesc(raw.ledger);
  const sortedHandovers = sortByDateDesc(raw.handovers);
  const staffPerf = computeStaffPerformance(
    raw.users,
    sortedInvoices,
    sortedCollections,
    sortedHandovers,
  );

  if (user.role === "admin") {
    return {
      user: safeUser,
      store: raw.meta.store ?? DEFAULT_STORE,
      settings: raw.meta.settings ?? DEFAULT_SETTINGS,
      openingCash: Number(raw.meta.openingCash ?? 0),
      products: raw.products,
      customers: raw.customers,
      suppliers: raw.suppliers,
      invoices: sortedInvoices,
      purchases: sortedPurchases,
      collections: sortedCollections,
      ledger: sortedLedger,
      handovers: sortedHandovers,
      staff: staffPerf,
    };
  }

  return {
    user: safeUser,
    store: raw.meta.store ?? DEFAULT_STORE,
    settings: raw.meta.settings ?? DEFAULT_SETTINGS,
    openingCash: 0,
    products: raw.products.map((p) => sanitizeProductForRole(p, "staff")),
    customers: raw.customers,
    suppliers: [],
    invoices: sortedInvoices
      .filter((inv) => inv.staffId === user.id)
      .map((inv) => sanitizeInvoiceForRole(inv, "staff")),
    purchases: [],
    collections: sortedCollections.filter((col) => col.staffId === user.id),
    ledger: sortedLedger.filter((entry) => entry.staffId === user.id),
    handovers: sortedHandovers.filter((h) => h.staffId === user.id),
    staff: staffPerf.filter((s) => s.id === user.id),
  };
}

let seedPromise: Promise<void> | null = null;

export function ensureInitialSeed(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    try {
      const usersSnap = await getDocs(query(collection(db, "users"), limit(1)));
      const metaSnap = await getDoc(doc(db, "meta", "store"));

      const needsUsers = usersSnap.empty;
      const needsMeta = !metaSnap.exists();
      if (!needsUsers && !needsMeta) return;

      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();

      if (needsMeta) {
        batch.set(doc(db, "meta", "store"), {
          store: DEFAULT_STORE,
          settings: DEFAULT_SETTINGS,
          openingCash: 0,
          updatedAt: nowIso,
        });
      }

      if (needsUsers) {
        const [adminHash, staff1Hash, staff2Hash] = await Promise.all([
          hashPassword("01806476652", "seedadmin01806476652"),
          hashPassword("01806476653", "seedstaff101806476653"),
          hashPassword("01806476654", "seedstaff201806476654"),
        ]);

        const seedUsers: StoredUserRecord[] = [
          {
            id: "usr-admin",
            name: "আল-বারাকাহ অ্যাডমিন",
            phone: "01806476652",
            role: "admin",
            passwordHash: adminHash,
            active: true,
            note: "স্বত্বাধিকারী ও মূল অ্যাডমিন",
            createdAt: nowIso,
          },
          {
            id: "usr-staff-1",
            name: "মো. রাশেদুল ইসলাম",
            phone: "01806476653",
            role: "staff",
            passwordHash: staff1Hash,
            active: true,
            note: "পাইকারি বিক্রয় প্রতিনিধি",
            createdAt: nowIso,
          },
          {
            id: "usr-staff-2",
            name: "মো. কামরুল হাসান",
            phone: "01806476654",
            role: "staff",
            passwordHash: staff2Hash,
            active: true,
            note: "কাউন্টার ও কালেকশন স্টাফ",
            createdAt: nowIso,
          },
        ];

        for (const u of seedUsers) {
          batch.set(doc(db, "users", u.id), u);
        }
      }

      await batch.commit();
    } catch (error) {
      seedPromise = null;
      handleFirestoreError(error, OperationType.WRITE, "users");
    }
  })();
  return seedPromise;
}

async function getCurrentUserOrThrow(userId: string | null): Promise<StoredUserRecord> {
  if (!userId) {
    throw new StoreError(401, "লগইন করা প্রয়োজন");
  }
  let snap;
  try {
    snap = await getDoc(doc(db, "users", userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  }
  if (!snap.exists()) {
    throw new StoreError(401, "সেশন মেয়াদ শেষ হয়েছে, আবার লগইন করুন");
  }
  const user = snap.data() as StoredUserRecord;
  if (!user.active) {
    throw new StoreError(
      403,
      "আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
    );
  }
  return user;
}

function requireAdmin(user: StoredUserRecord): void {
  if (user.role !== "admin") {
    throw new StoreError(403, "এই কাজের অনুমতি শুধুমাত্র অ্যাডমিনের জন্য");
  }
}

async function fetchRawState(isAdmin: boolean): Promise<RawSnapshotState> {
  try {
    const [
      metaSnap,
      usersSnap,
      productsSnap,
      customersSnap,
      invoicesSnap,
      collectionsSnap,
      ledgerSnap,
      handoversSnap,
      suppliersSnap,
      purchasesSnap,
    ] = await Promise.all([
      getDoc(doc(db, "meta", "store")),
      getDocs(collection(db, "users")),
      getDocs(collection(db, "products")),
      getDocs(collection(db, "customers")),
      getDocs(collection(db, "invoices")),
      getDocs(collection(db, "collections")),
      getDocs(collection(db, "ledger")),
      getDocs(collection(db, "handovers")),
      isAdmin ? getDocs(collection(db, "suppliers")) : Promise.resolve(null),
      isAdmin ? getDocs(collection(db, "purchases")) : Promise.resolve(null),
    ]);

    return {
      meta: metaSnap.exists()
        ? (metaSnap.data() as StoredMetaDoc)
        : DEFAULT_META,
      users: usersSnap.docs.map((d) => d.data() as StoredUserRecord),
      products: productsSnap.docs.map((d) => d.data() as StoredProduct),
      customers: customersSnap.docs.map((d) => d.data() as Customer),
      suppliers: suppliersSnap
        ? suppliersSnap.docs.map((d) => d.data() as Supplier)
        : [],
      invoices: invoicesSnap.docs.map((d) => d.data() as StoredSaleInvoice),
      purchases: purchasesSnap
        ? purchasesSnap.docs.map((d) => d.data() as PurchaseInvoice)
        : [],
      collections: collectionsSnap.docs.map((d) => d.data() as DueCollection),
      ledger: ledgerSnap.docs.map((d) => d.data() as CashLedgerEntry),
      handovers: handoversSnap.docs.map((d) => d.data() as StaffHandover),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, "bootstrap");
  }
}

function wrapFirestoreFailure(error: unknown): never {
  if (error instanceof StoreError) throw error;
  if (
    error instanceof Error &&
    (error.message.includes("Failed to get document because the client is offline") ||
      error.message.includes("client is offline") ||
      error.message.includes("unavailable"))
  ) {
    throw new StoreError(
      503,
      "ইন্টারনেট সংযোগ না থাকায় এই ট্রানজ্যাকশন সম্পন্ন করা যায়নি। অনলাইনে এসে আবার চেষ্টা করুন।",
    );
  }
  throw error;
}

export const firestoreStore = {
  async login(
    phoneInput: string,
    passwordInput: string,
  ): Promise<{ token: string; user: AuthUser }> {
    await ensureInitialSeed();
    const phone = normalizePhoneDigits(phoneInput);
    const rawPassword =
      typeof passwordInput === "string"
        ? passwordInput
        : String(passwordInput ?? "");

    if (!phone || !rawPassword) {
      throw new StoreError(400, "মোবাইল নম্বর এবং পাসওয়ার্ড দিন");
    }

    let snap;
    try {
      snap = await getDocs(
        query(collection(db, "users"), where("phone", "==", phone)),
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, "users");
    }

    let matched: StoredUserRecord | null = null;
    if (!snap.empty) {
      matched = snap.docs[0].data() as StoredUserRecord;
    } else {
      // Fallback scan in case existing user phone has formatting characters
      try {
        const allUsers = await getDocs(collection(db, "users"));
        for (const d of allUsers.docs) {
          const rec = d.data() as StoredUserRecord;
          if (normalizePhoneDigits(rec.phone) === phone) {
            matched = rec;
            break;
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, "users");
      }
    }

    if (!matched) {
      throw new StoreError(401, "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়");
    }

    const ok = await verifyPassword(rawPassword, matched.passwordHash);
    if (!ok) {
      throw new StoreError(401, "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়");
    }

    if (!matched.active) {
      throw new StoreError(
        403,
        "এই অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
      );
    }

    setStoredUserId(matched.id);
    return { token: matched.id, user: sanitizeUser(matched) };
  },

  async logout(): Promise<{ ok: boolean }> {
    clearStoredUserId();
    return { ok: true };
  },

  async me(userId: string | null): Promise<{ user: AuthUser }> {
    await ensureInitialSeed();
    const user = await getCurrentUserOrThrow(userId);
    return { user: sanitizeUser(user) };
  },

  async bootstrap(userId: string | null): Promise<BootstrapPayload> {
    await ensureInitialSeed();
    const user = await getCurrentUserOrThrow(userId);
    const raw = await fetchRawState(user.role === "admin");
    return buildBootstrapPayload(raw, user);
  },

  subscribeToAppData(
    userId: string,
    onData: (payload: BootstrapPayload) => void,
    onAuthInvalid: (reason?: string) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    const state: RawSnapshotState = {
      meta: DEFAULT_META,
      users: [],
      products: [],
      customers: [],
      suppliers: [],
      invoices: [],
      purchases: [],
      collections: [],
      ledger: [],
      handovers: [],
    };

    const readyKeys = new Set<string>();
    const requiredKeys = [
      "meta",
      "users",
      "products",
      "customers",
      "suppliers",
      "invoices",
      "purchases",
      "collections",
      "ledger",
      "handovers",
    ];
    let disposed = false;

    const emitIfReady = () => {
      if (disposed) return;
      for (const k of requiredKeys) {
        if (!readyKeys.has(k)) return;
      }
      const currentUser = state.users.find((u) => u.id === userId);
      if (!currentUser) {
        onAuthInvalid("ব্যবহারকারী খুঁজে পাওয়া যায়নি, আবার লগইন করুন");
        return;
      }
      if (!currentUser.active) {
        onAuthInvalid("আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে।");
        return;
      }
      onData(buildBootstrapPayload(state, currentUser));
    };

    const handleSnapError = (path: string) => (error: unknown) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    };

    const unsubs: Unsubscribe[] = [];

    unsubs.push(
      onSnapshot(
        doc(db, "meta", "store"),
        (snap) => {
          state.meta = snap.exists()
            ? (snap.data() as StoredMetaDoc)
            : DEFAULT_META;
          readyKeys.add("meta");
          emitIfReady();
        },
        handleSnapError("meta/store"),
      ),
    );

    const watchCollection = <T>(
      colName: string,
      apply: (rows: T[]) => void,
    ) => {
      unsubs.push(
        onSnapshot(
          collection(db, colName),
          (snap) => {
            apply(snap.docs.map((d) => d.data() as T));
            readyKeys.add(colName);
            emitIfReady();
          },
          handleSnapError(colName),
        ),
      );
    };

    watchCollection<StoredUserRecord>("users", (rows) => {
      state.users = rows;
    });
    watchCollection<StoredProduct>("products", (rows) => {
      state.products = rows;
    });
    watchCollection<Customer>("customers", (rows) => {
      state.customers = rows;
    });
    watchCollection<Supplier>("suppliers", (rows) => {
      state.suppliers = rows;
    });
    watchCollection<StoredSaleInvoice>("invoices", (rows) => {
      state.invoices = rows;
    });
    watchCollection<PurchaseInvoice>("purchases", (rows) => {
      state.purchases = rows;
    });
    watchCollection<DueCollection>("collections", (rows) => {
      state.collections = rows;
    });
    watchCollection<CashLedgerEntry>("ledger", (rows) => {
      state.ledger = rows;
    });
    watchCollection<StaffHandover>("handovers", (rows) => {
      state.handovers = rows;
    });

    return () => {
      disposed = true;
      for (const unsub of unsubs) {
        unsub();
      }
    };
  },

  async createSale(
    userId: string | null,
    body: {
      customerId: string;
      items: Array<{ productId: string; qty: number; rate?: number }>;
      discount?: number;
      paid: number;
      note?: string;
    },
  ): Promise<{ invoice: SaleInvoice; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    const customerId =
      typeof body.customerId === "string" ? body.customerId.trim() : "";
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const discountInput =
      body.discount === undefined ? 0 : parseNum(body.discount);
    const paidInput = body.paid === undefined ? 0 : parseNum(body.paid);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!customerId) throw new StoreError(400, "কাস্টমার নির্বাচন করুন");
    if (itemsInput.length === 0) {
      throw new StoreError(400, "কমপক্ষে একটি পণ্য যোগ করুন");
    }
    if (!Number.isFinite(discountInput) || discountInput < 0) {
      throw new StoreError(400, "ডিসকাউন্টের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(paidInput) || paidInput < 0) {
      throw new StoreError(400, "নগদ জমার পরিমাণ সঠিক নয়");
    }

    const existingInvoicesSnap = await getDocs(collection(db, "invoices"));
    const existingInvoiceNumbers = existingInvoicesSnap.docs.map(
      (d) => (d.data() as StoredSaleInvoice).number,
    );

    const uniqueProductIds = Array.from(
      new Set(
        itemsInput
          .map((l) => (typeof l?.productId === "string" ? l.productId.trim() : ""))
          .filter(Boolean),
      ),
    );
    if (uniqueProductIds.length === 0) {
      throw new StoreError(400, "প্রতিটি পণ্যের সঠিক পরিমাণ দিন");
    }

    try {
      const createdInvoice = await runTransaction(db, async (tx) => {
        const metaRef = doc(db, "meta", "store");
        const metaSnap = await tx.get(metaRef);
        const meta = metaSnap.exists()
          ? (metaSnap.data() as StoredMetaDoc)
          : DEFAULT_META;

        const custRef =
          customerId !== "walk-in" ? doc(db, "customers", customerId) : null;
        const custSnap = custRef ? await tx.get(custRef) : null;

        const productSnaps = new Map<string, StoredProduct>();
        for (const pid of uniqueProductIds) {
          const pSnap = await tx.get(doc(db, "products", pid));
          if (pSnap.exists()) {
            productSnaps.set(pid, pSnap.data() as StoredProduct);
          }
        }

        const staffCashRef =
          user.role === "staff" ? doc(db, "staffCash", user.id) : null;
        const staffCashSnap = staffCashRef ? await tx.get(staffCashRef) : null;

        // Validate items and quantities
        const requestedQtyByProduct = new Map<string, number>();
        const invoiceItems: StoredInvoiceItem[] = [];

        for (const line of itemsInput) {
          const productId =
            typeof line?.productId === "string" ? line.productId.trim() : "";
          const qty = parseNum(line?.qty);
          if (!productId || !Number.isFinite(qty) || qty <= 0) {
            throw new StoreError(400, "প্রতিটি পণ্যের সঠিক পরিমাণ দিন");
          }
          const product = productSnaps.get(productId);
          if (!product) {
            throw new StoreError(400, "তালিকাভুক্ত পণ্য খুঁজে পাওয়া যায়নি");
          }

          let rate = product.saleRate;
          if (line.rate !== undefined && line.rate !== null) {
            const customRate = parseNum(line.rate);
            if (!Number.isFinite(customRate) || customRate <= 0) {
              throw new StoreError(
                400,
                `${product.name}-এর বিক্রয় মূল্য সঠিক নয়`,
              );
            }
            rate = round2(customRate);
          }

          requestedQtyByProduct.set(
            product.id,
            round2((requestedQtyByProduct.get(product.id) || 0) + qty),
          );

          invoiceItems.push({
            productId: product.id,
            name: product.name,
            unit: product.unit,
            qty,
            rate,
            purchaseRate: product.purchaseRate,
            total: round2(qty * rate),
          });
        }

        if (!meta.settings?.allowNegativeStock) {
          for (const [productId, totalQty] of requestedQtyByProduct.entries()) {
            const product = productSnaps.get(productId)!;
            if (totalQty > product.stock) {
              throw new StoreError(
                400,
                `${product.name}-এর পর্যাপ্ত স্টক নেই (মজুদ: ${product.stock} ${product.unit})`,
              );
            }
          }
        }

        const subTotal = round2(
          invoiceItems.reduce((sum, item) => sum + item.total, 0),
        );
        const discount = round2(discountInput);
        if (discount > subTotal) {
          throw new StoreError(400, "ডিসকাউন্ট মোট বিলের চেয়ে বেশি হতে পারবে না");
        }

        const total = round2(subTotal - discount);
        const paid = round2(paidInput);
        if (paid > total) {
          throw new StoreError(400, "নগদ জমা মোট বিলের চেয়ে বেশি হতে পারবে না");
        }

        const due = round2(total - paid);
        const status: InvoiceStatus =
          due === 0 ? "paid" : paid > 0 ? "partial" : "due";

        let customerName = "নগদ কাস্টমার";
        let customerMobile = "";

        if (customerId === "walk-in") {
          if (due > 0) {
            throw new StoreError(
              400,
              "বাকিতে বিক্রির জন্য একজন নিবন্ধিত কাস্টমার নির্বাচন করুন",
            );
          }
        } else {
          if (!custSnap || !custSnap.exists()) {
            throw new StoreError(400, "নির্বাচিত কাস্টমার খুঁজে পাওয়া যায়নি");
          }
          const customer = custSnap.data() as Customer;
          customerName = customer.name;
          customerMobile = customer.mobile;
          if (due > 0 && custRef) {
            tx.update(custRef, { due: round2(customer.due + due) });
          }
        }

        for (const [productId, totalQty] of requestedQtyByProduct.entries()) {
          const product = productSnaps.get(productId)!;
          tx.update(doc(db, "products", productId), {
            stock: round2(product.stock - totalQty),
          });
        }

        const nowIso = new Date().toISOString();
        const prefix = meta.settings?.invoicePrefix || "ABS";
        const invoiceId = makeId("inv");
        const invoice: StoredSaleInvoice = {
          id: invoiceId,
          number: nextSeqNumber(prefix, existingInvoiceNumbers),
          date: nowIso,
          customerId,
          customerName,
          customerMobile,
          staffId: user.id,
          staffName: user.name,
          items: invoiceItems,
          itemsCount: round2(invoiceItems.reduce((sum, i) => sum + i.qty, 0)),
          subTotal,
          discount,
          total,
          initialPaid: paid,
          paid,
          due,
          status,
          ...(note ? { note } : {}),
        };

        tx.set(doc(db, "invoices", invoiceId), invoice);

        if (paid > 0) {
          if (user.role === "admin") {
            const ledId = makeId("led");
            const ledgerEntry: CashLedgerEntry = {
              id: ledId,
              date: nowIso,
              party: customerName,
              amount: paid,
              direction: "in",
              kind: "sale",
              category: "নগদ বিক্রি",
              staffId: user.id,
              staffName: user.name,
              refId: invoiceId,
              note: `চালান #${invoice.number} নগদ বিক্রি`,
            };
            tx.set(doc(db, "ledger", ledId), ledgerEntry);
          } else if (staffCashRef) {
            // Staff keeps received cash until admin collects it via Handover
            const prevCash = staffCashSnap?.exists()
              ? (staffCashSnap.data() as StaffCashState)
              : null;
            const nextCashState: StaffCashState = {
              staffId: user.id,
              cashBalance: round2(Number(prevCash?.cashBalance ?? 0) + paid),
              totalHandedOver: round2(Number(prevCash?.totalHandedOver ?? 0)),
              updatedAt: nowIso,
            };
            tx.set(staffCashRef, nextCashState);
          }
        }

        return invoice;
      });

      const bootstrap = await this.bootstrap(userId);
      return {
        invoice: sanitizeInvoiceForRole(createdInvoice, user.role),
        bootstrap,
      };
    } catch (error) {
      wrapFirestoreFailure(error);
    }
  },

  async createCollection(
    userId: string | null,
    body: {
      customerId: string;
      amount: number;
      invoiceId?: string;
      note?: string;
    },
  ): Promise<{ collection: DueCollection; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    const customerId =
      typeof body.customerId === "string" ? body.customerId.trim() : "";
    const invoiceId =
      typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
    const amountInput = parseNum(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!customerId) throw new StoreError(400, "কাস্টমার নির্বাচন করুন");
    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new StoreError(400, "আদায়ের পরিমাণ শূন্যের বেশি হতে হবে");
    }

    const amount = round2(amountInput);

    const [custInvoicesSnap, allColsSnap] = await Promise.all([
      getDocs(
        query(collection(db, "invoices"), where("customerId", "==", customerId)),
      ),
      getDocs(collection(db, "collections")),
    ]);

    const openInvoiceIds = custInvoicesSnap.docs
      .map((d) => d.data() as StoredSaleInvoice)
      .filter((inv) => inv.due > 0)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      .map((inv) => inv.id);

    if (invoiceId && !openInvoiceIds.includes(invoiceId)) {
      openInvoiceIds.unshift(invoiceId);
    }

    const existingReceiptNos = allColsSnap.docs.map(
      (d) => (d.data() as DueCollection).receiptNo,
    );

    try {
      const createdCollection = await runTransaction(db, async (tx) => {
        const custRef = doc(db, "customers", customerId);
        const custSnap = await tx.get(custRef);
        if (!custSnap.exists()) {
          throw new StoreError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
        }
        const customer = custSnap.data() as Customer;
        if (amount > customer.due) {
          throw new StoreError(
            400,
            "আদায়ের পরিমাণ কাস্টমারের মোট বকেয়ার চেয়ে বেশি হতে পারবে না",
          );
        }

        const invSnaps = new Map<string, StoredSaleInvoice>();
        for (const id of openInvoiceIds) {
          const snap = await tx.get(doc(db, "invoices", id));
          if (snap.exists()) {
            invSnaps.set(id, snap.data() as StoredSaleInvoice);
          }
        }

        const staffCashRef =
          user.role === "staff" ? doc(db, "staffCash", user.id) : null;
        const staffCashSnap = staffCashRef ? await tx.get(staffCashRef) : null;

        // Apply due deduction to customer
        tx.update(custRef, { due: round2(customer.due - amount) });

        let remaining = amount;
        let linkedInvoiceId: string | undefined;
        let linkedInvoiceNumber: string | undefined;

        const orderedTargets: StoredSaleInvoice[] = [];
        if (invoiceId && invSnaps.has(invoiceId)) {
          orderedTargets.push(invSnaps.get(invoiceId)!);
        }
        for (const id of openInvoiceIds) {
          if (id === invoiceId) continue;
          const inv = invSnaps.get(id);
          if (inv) orderedTargets.push(inv);
        }

        for (const target of orderedTargets) {
          if (remaining <= 0) break;
          if (target.customerId !== customerId || target.due <= 0) continue;
          const apply = round2(Math.min(remaining, target.due));
          const nextPaid = round2(target.paid + apply);
          const nextDue = round2(target.total - nextPaid);
          const nextStatus: InvoiceStatus =
            nextDue === 0 ? "paid" : nextPaid > 0 ? "partial" : "due";
          tx.update(doc(db, "invoices", target.id), {
            paid: nextPaid,
            due: nextDue,
            status: nextStatus,
          });
          remaining = round2(remaining - apply);
          if (!linkedInvoiceId) {
            linkedInvoiceId = target.id;
            linkedInvoiceNumber = target.number;
          }
        }

        const nowIso = new Date().toISOString();
        const colId = makeId("col");
        const collectionDoc: DueCollection = {
          id: colId,
          receiptNo: nextSeqNumber("COL", existingReceiptNos),
          date: nowIso,
          customerId: customer.id,
          customerName: customer.name,
          customerMobile: customer.mobile,
          ...(linkedInvoiceId
            ? { invoiceId: linkedInvoiceId, invoiceNumber: linkedInvoiceNumber }
            : {}),
          amount,
          staffId: user.id,
          staffName: user.name,
          ...(note ? { note } : {}),
        };

        tx.set(doc(db, "collections", colId), collectionDoc);

        if (user.role === "admin") {
          const ledId = makeId("led");
          const ledgerEntry: CashLedgerEntry = {
            id: ledId,
            date: nowIso,
            party: customer.name,
            amount,
            direction: "in",
            kind: "collection",
            category: "বাকি আদায়",
            staffId: user.id,
            staffName: user.name,
            refId: colId,
            note: `${collectionDoc.receiptNo}${linkedInvoiceNumber ? ` · ${linkedInvoiceNumber}` : " · বকেয়া আদায়"}`,
          };
          tx.set(doc(db, "ledger", ledId), ledgerEntry);
        } else if (staffCashRef) {
          const prevCash = staffCashSnap?.exists()
            ? (staffCashSnap.data() as StaffCashState)
            : null;
          const nextCashState: StaffCashState = {
            staffId: user.id,
            cashBalance: round2(Number(prevCash?.cashBalance ?? 0) + amount),
            totalHandedOver: round2(Number(prevCash?.totalHandedOver ?? 0)),
            updatedAt: nowIso,
          };
          tx.set(staffCashRef, nextCashState);
        }

        return collectionDoc;
      });

      const bootstrap = await this.bootstrap(userId);
      return { collection: createdCollection, bootstrap };
    } catch (error) {
      wrapFirestoreFailure(error);
    }
  },

  async createHandover(
    adminUserId: string | null,
    body: { staffId: string; amount: number; note?: string },
  ): Promise<{ handover: StaffHandover; bootstrap: BootstrapPayload }> {
    const admin = await getCurrentUserOrThrow(adminUserId);
    requireAdmin(admin);

    const staffId = typeof body.staffId === "string" ? body.staffId.trim() : "";
    const amountInput = parseNum(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!staffId) throw new StoreError(400, "স্টাফ নির্বাচন করুন");
    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new StoreError(400, "গ্রহণের পরিমাণ শূন্যের বেশি হতে হবে");
    }
    const amount = round2(amountInput);

    // Pre-read current collections for reconciliation fallback if staffCash doc wasn't initialized yet
    const [staffInvSnap, staffColSnap, staffHandSnap] = await Promise.all([
      getDocs(query(collection(db, "invoices"), where("staffId", "==", staffId))),
      getDocs(query(collection(db, "collections"), where("staffId", "==", staffId))),
      getDocs(query(collection(db, "handovers"), where("staffId", "==", staffId))),
    ]);

    const computedSaleCash = staffInvSnap.docs.reduce(
      (sum, d) => sum + Number((d.data() as StoredSaleInvoice).initialPaid || 0),
      0,
    );
    const computedColCash = staffColSnap.docs.reduce(
      (sum, d) => sum + Number((d.data() as DueCollection).amount || 0),
      0,
    );
    const computedHandedOver = staffHandSnap.docs.reduce(
      (sum, d) => sum + Number((d.data() as StaffHandover).amount || 0),
      0,
    );
    const fallbackBalance = round2(
      Math.max(0, computedSaleCash + computedColCash - computedHandedOver),
    );

    try {
      const createdHandover = await runTransaction(db, async (tx) => {
        const staffUserRef = doc(db, "users", staffId);
        const staffCashRef = doc(db, "staffCash", staffId);

        const [staffUserSnap, staffCashSnap] = await Promise.all([
          tx.get(staffUserRef),
          tx.get(staffCashRef),
        ]);

        if (!staffUserSnap.exists()) {
          throw new StoreError(404, "স্টাফ খুঁজে পাওয়া যায়নি");
        }
        const staffUser = staffUserSnap.data() as StoredUserRecord;

        const existingCash = staffCashSnap.exists()
          ? (staffCashSnap.data() as StaffCashState)
          : null;

        const balanceBefore = existingCash
          ? round2(Number(existingCash.cashBalance ?? 0))
          : fallbackBalance;
        const prevHandedOver = existingCash
          ? round2(Number(existingCash.totalHandedOver ?? 0))
          : round2(computedHandedOver);

        if (balanceBefore <= 0) {
          throw new StoreError(400, "এই স্টাফের কাছে কোনো নগদ টাকা নেই");
        }
        if (amount > balanceBefore) {
          throw new StoreError(
            400,
            "গ্রহণের পরিমাণ স্টাফের কাছে থাকা টাকার চেয়ে বেশি হতে পারবে না",
          );
        }

        const balanceAfter = round2(balanceBefore - amount);
        const nowIso = new Date().toISOString();
        const handoverId = makeId("hnd");

        const handoverRecord: StaffHandover = {
          id: handoverId,
          staffId: staffUser.id,
          staffName: staffUser.name,
          amount,
          balanceBefore,
          balanceAfter,
          ...(note ? { note } : {}),
          takenBy: admin.id,
          takenByName: admin.name,
          createdAt: nowIso,
        };

        const nextCashState: StaffCashState = {
          staffId: staffUser.id,
          cashBalance: balanceAfter,
          totalHandedOver: round2(prevHandedOver + amount),
          updatedAt: nowIso,
        };

        const ledId = makeId("led");
        const ledgerEntry: CashLedgerEntry = {
          id: ledId,
          date: nowIso,
          party: staffUser.name,
          amount,
          direction: "in",
          kind: "staff_handover",
          category: "স্টাফ থেকে টাকা গ্রহণ",
          staffId: staffUser.id,
          staffName: staffUser.name,
          refId: handoverId,
          note: note || "স্টাফ থেকে টাকা গ্রহণ",
        };

        tx.set(staffCashRef, nextCashState);
        tx.set(doc(db, "handovers", handoverId), handoverRecord);
        tx.set(doc(db, "ledger", ledId), ledgerEntry);

        return handoverRecord;
      });

      const bootstrap = await this.bootstrap(adminUserId);
      return { handover: createdHandover, bootstrap };
    } catch (error) {
      wrapFirestoreFailure(error);
    }
  },

  async createCustomer(
    userId: string | null,
    body: {
      name: string;
      mobile: string;
      area?: string;
      openingDue?: number;
    },
  ): Promise<{ customer: Customer; bootstrap: BootstrapPayload }> {
    await getCurrentUserOrThrow(userId);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mobile = normalizePhoneDigits(body.mobile);
    const area = typeof body.area === "string" ? body.area.trim() : "";
    const openingDueInput =
      body.openingDue === undefined ? 0 : parseNum(body.openingDue);

    if (!name) throw new StoreError(400, "কাস্টমারের নাম লিখুন");
    if (mobile.length < 6) throw new StoreError(400, "সঠিক মোবাইল নম্বর দিন");
    if (!Number.isFinite(openingDueInput) || openingDueInput < 0) {
      throw new StoreError(400, "পূর্বের বকেয়ার পরিমাণ সঠিক নয়");
    }

    const openingDue = round2(openingDueInput);
    const id = makeId("cust");
    const customer: Customer = {
      id,
      name,
      mobile,
      area: area || "ঢাকা",
      openingDue,
      due: openingDue,
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "customers", id), customer);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `customers/${id}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { customer, bootstrap };
  },

  async updateCustomer(
    userId: string | null,
    customerId: string,
    body: { name?: string; mobile?: string; area?: string },
  ): Promise<{ customer: Customer; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const custRef = doc(db, "customers", customerId);
    const snap = await getDoc(custRef);
    if (!snap.exists()) {
      throw new StoreError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
    }
    const customer = { ...(snap.data() as Customer) };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new StoreError(400, "কাস্টমারের নাম খালি রাখা যাবে না");
      customer.name = name;
    }
    if (body.mobile !== undefined) {
      const mobile = normalizePhoneDigits(body.mobile);
      if (mobile.length < 6) throw new StoreError(400, "সঠিক মোবাইল নম্বর দিন");
      customer.mobile = mobile;
    }
    if (body.area !== undefined) {
      customer.area = String(body.area).trim() || customer.area;
    }

    const [invsSnap, colsSnap] = await Promise.all([
      getDocs(query(collection(db, "invoices"), where("customerId", "==", customerId))),
      getDocs(query(collection(db, "collections"), where("customerId", "==", customerId))),
    ]);

    const batch = writeBatch(db);
    batch.set(custRef, customer);
    for (const d of invsSnap.docs) {
      batch.update(d.ref, {
        customerName: customer.name,
        customerMobile: customer.mobile,
      });
    }
    for (const d of colsSnap.docs) {
      batch.update(d.ref, {
        customerName: customer.name,
        customerMobile: customer.mobile,
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `customers/${customerId}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { customer, bootstrap };
  },

  async deleteCustomer(
    userId: string | null,
    customerId: string,
  ): Promise<{ bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const custRef = doc(db, "customers", customerId);
    const snap = await getDoc(custRef);
    if (!snap.exists()) {
      throw new StoreError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
    }
    const customer = snap.data() as Customer;
    if (customer.due > 0) {
      throw new StoreError(
        400,
        "বাকি বকেয়া থাকায় এই কাস্টমার মুছে ফেলা যাবে না",
      );
    }

    try {
      await deleteDoc(custRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customers/${customerId}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { bootstrap };
  },

  async createProduct(
    userId: string | null,
    body: {
      name: string;
      sku?: string;
      barcode?: string;
      category: string;
      unit: string;
      purchaseRate: number;
      saleRate: number;
      stock: number;
      minStock?: number;
    },
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const skuInput = typeof body.sku === "string" ? body.sku.trim() : "";
    const barcodeInput =
      typeof body.barcode === "string" ? body.barcode.trim() : "";
    const category =
      typeof body.category === "string" ? body.category.trim() : "";
    const unit = typeof body.unit === "string" ? body.unit.trim() : "";
    const purchaseRate = parseNum(body.purchaseRate);
    const saleRate = parseNum(body.saleRate);
    const stock = body.stock === undefined ? 0 : parseNum(body.stock);
    const minStock = body.minStock === undefined ? 10 : parseNum(body.minStock);

    if (!name) throw new StoreError(400, "পণ্যের নাম লিখুন");
    if (!Number.isFinite(purchaseRate) || purchaseRate < 0) {
      throw new StoreError(400, "সঠিক ক্রয় মূল্য দিন");
    }
    if (!Number.isFinite(saleRate) || saleRate <= 0) {
      throw new StoreError(400, "বিক্রয় মূল্য শূন্যের বেশি হতে হবে");
    }
    if (!Number.isFinite(stock) || stock < 0) {
      throw new StoreError(400, "স্টকের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(minStock) || minStock < 0) {
      throw new StoreError(400, "সর্বনিম্ন স্টকের পরিমাণ সঠিক নয়");
    }

    const [metaSnap, prodSnap] = await Promise.all([
      getDoc(doc(db, "meta", "store")),
      getDocs(collection(db, "products")),
    ]);
    const meta = metaSnap.exists()
      ? (metaSnap.data() as StoredMetaDoc)
      : DEFAULT_META;
    const existingProducts = prodSnap.docs.map((d) => d.data() as StoredProduct);

    const sku =
      skuInput ||
      nextSeqNumber(
        meta.settings?.invoicePrefix || "ABS",
        existingProducts.map((p) => p.sku),
        1001,
        4,
      );
    const barcode =
      barcodeInput ||
      String(
        8942200200101 +
          existingProducts.length +
          Math.floor(Math.random() * 900),
      );

    const id = makeId("prod");
    const product: StoredProduct = {
      id,
      name,
      sku,
      barcode,
      category: category || "সাধারণ",
      unit: unit || "পিস",
      purchaseRate: round2(purchaseRate),
      saleRate: round2(saleRate),
      stock: round2(stock),
      minStock: round2(minStock),
    };

    try {
      await setDoc(doc(db, "products", id), product);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `products/${id}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { product, bootstrap };
  },

  async updateProduct(
    userId: string | null,
    productId: string,
    body: {
      name?: string;
      sku?: string;
      barcode?: string;
      category?: string;
      unit?: string;
      purchaseRate?: number;
      saleRate?: number;
      stock?: number;
      minStock?: number;
    },
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const [metaSnap, prodSnap] = await Promise.all([
      getDoc(doc(db, "meta", "store")),
      getDoc(doc(db, "products", productId)),
    ]);
    if (!prodSnap.exists()) {
      throw new StoreError(404, "পণ্য খুঁজে পাওয়া যায়নি");
    }
    const meta = metaSnap.exists()
      ? (metaSnap.data() as StoredMetaDoc)
      : DEFAULT_META;
    const product = { ...(prodSnap.data() as StoredProduct) };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new StoreError(400, "পণ্যের নাম খালি রাখা যাবে না");
      product.name = name;
    }
    if (body.sku !== undefined) {
      const sku = String(body.sku).trim();
      if (sku) product.sku = sku;
    }
    if (body.barcode !== undefined) {
      product.barcode = String(body.barcode).trim();
    }
    if (body.category !== undefined) {
      const category = String(body.category).trim();
      if (category) product.category = category;
    }
    if (body.unit !== undefined) {
      const unit = String(body.unit).trim();
      if (unit) product.unit = unit;
    }
    if (body.purchaseRate !== undefined) {
      const val = parseNum(body.purchaseRate);
      if (!Number.isFinite(val) || val < 0) {
        throw new StoreError(400, "সঠিক ক্রয় মূল্য দিন");
      }
      product.purchaseRate = round2(val);
    }
    if (body.saleRate !== undefined) {
      const val = parseNum(body.saleRate);
      if (!Number.isFinite(val) || val <= 0) {
        throw new StoreError(400, "বিক্রয় মূল্য শূন্যের বেশি হতে হবে");
      }
      product.saleRate = round2(val);
    }
    if (body.stock !== undefined) {
      const val = parseNum(body.stock);
      if (
        !Number.isFinite(val) ||
        (val < 0 && !meta.settings?.allowNegativeStock)
      ) {
        throw new StoreError(400, "স্টকের পরিমাণ সঠিক নয়");
      }
      product.stock = round2(val);
    }
    if (body.minStock !== undefined) {
      const val = parseNum(body.minStock);
      if (!Number.isFinite(val) || val < 0) {
        throw new StoreError(400, "সর্বনিম্ন স্টকের পরিমাণ সঠিক নয়");
      }
      product.minStock = round2(val);
    }

    try {
      await setDoc(doc(db, "products", productId), product);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${productId}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { product, bootstrap };
  },

  async adjustStock(
    userId: string | null,
    productId: string,
    body: { mode: "add" | "subtract" | "set"; qty: number },
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const mode = typeof body.mode === "string" ? body.mode.trim() : "";
    const qty = parseNum(body.qty);

    if (!["add", "subtract", "set"].includes(mode)) {
      throw new StoreError(400, "স্টক পরিবর্তনের ধরন সঠিক নয়");
    }
    if (!Number.isFinite(qty) || qty < 0) {
      throw new StoreError(400, "স্টকের সঠিক পরিমাণ দিন");
    }

    try {
      const updated = await runTransaction(db, async (tx) => {
        const [metaSnap, prodSnap] = await Promise.all([
          tx.get(doc(db, "meta", "store")),
          tx.get(doc(db, "products", productId)),
        ]);
        if (!prodSnap.exists()) {
          throw new StoreError(404, "পণ্য খুঁজে পাওয়া যায়নি");
        }
        const meta = metaSnap.exists()
          ? (metaSnap.data() as StoredMetaDoc)
          : DEFAULT_META;
        const product = { ...(prodSnap.data() as StoredProduct) };

        let nextStock = product.stock;
        if (mode === "add") nextStock = round2(product.stock + qty);
        if (mode === "subtract") nextStock = round2(product.stock - qty);
        if (mode === "set") nextStock = round2(qty);

        if (nextStock < 0 && !meta.settings?.allowNegativeStock) {
          throw new StoreError(400, "স্টক শূন্যের নিচে নামানো যাবে না");
        }
        product.stock = nextStock;
        tx.update(doc(db, "products", productId), { stock: nextStock });
        return product;
      });

      const bootstrap = await this.bootstrap(userId);
      return { product: updated, bootstrap };
    } catch (error) {
      wrapFirestoreFailure(error);
    }
  },

  async deleteProduct(
    userId: string | null,
    productId: string,
  ): Promise<{ bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const ref = doc(db, "products", productId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new StoreError(404, "পণ্য খুঁজে পাওয়া যায়নি");
    }
    try {
      await deleteDoc(ref);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
    const bootstrap = await this.bootstrap(userId);
    return { bootstrap };
  },

  async createPurchase(
    userId: string | null,
    body: {
      supplierId: string;
      items: Array<{ productId: string; qty: number; rate?: number }>;
      discount?: number;
      paid: number;
      note?: string;
    },
  ): Promise<{ purchase: PurchaseInvoice; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const supplierId =
      typeof body.supplierId === "string" ? body.supplierId.trim() : "";
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const discountInput =
      body.discount === undefined ? 0 : parseNum(body.discount);
    const paidInput = body.paid === undefined ? 0 : parseNum(body.paid);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!supplierId) throw new StoreError(400, "সরবরাহকারী নির্বাচন করুন");
    if (itemsInput.length === 0) {
      throw new StoreError(400, "কমপক্ষে একটি পণ্য যোগ করুন");
    }
    if (!Number.isFinite(discountInput) || discountInput < 0) {
      throw new StoreError(400, "ডিসকাউন্টের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(paidInput) || paidInput < 0) {
      throw new StoreError(400, "নগদ পরিশোধের পরিমাণ সঠিক নয়");
    }

    const existingPurchasesSnap = await getDocs(collection(db, "purchases"));
    const existingPurNumbers = existingPurchasesSnap.docs.map(
      (d) => (d.data() as PurchaseInvoice).number,
    );

    const uniqueProductIds = Array.from(
      new Set(
        itemsInput
          .map((l) => (typeof l?.productId === "string" ? l.productId.trim() : ""))
          .filter(Boolean),
      ),
    );

    try {
      const createdPurchase = await runTransaction(db, async (tx) => {
        const metaSnap = await tx.get(doc(db, "meta", "store"));
        const meta = metaSnap.exists()
          ? (metaSnap.data() as StoredMetaDoc)
          : DEFAULT_META;

        const supRef = doc(db, "suppliers", supplierId);
        const supSnap = await tx.get(supRef);
        if (!supSnap.exists()) {
          throw new StoreError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
        }
        const supplier = supSnap.data() as Supplier;

        const productSnaps = new Map<string, StoredProduct>();
        for (const pid of uniqueProductIds) {
          const pSnap = await tx.get(doc(db, "products", pid));
          if (pSnap.exists()) {
            productSnaps.set(pid, pSnap.data() as StoredProduct);
          }
        }

        const purchaseItems: InvoiceItem[] = [];
        const addQtyByProduct = new Map<string, number>();

        for (const line of itemsInput) {
          const productId =
            typeof line?.productId === "string" ? line.productId.trim() : "";
          const qty = parseNum(line?.qty);
          if (!productId || !Number.isFinite(qty) || qty <= 0) {
            throw new StoreError(400, "প্রতিটি পণ্যের সঠিক পরিমাণ দিন");
          }
          const product = productSnaps.get(productId);
          if (!product) {
            throw new StoreError(400, "তালিকাভুক্ত পণ্য খুঁজে পাওয়া যায়নি");
          }

          let rate = product.purchaseRate;
          if (line.rate !== undefined && line.rate !== null) {
            const customRate = parseNum(line.rate);
            if (!Number.isFinite(customRate) || customRate < 0) {
              throw new StoreError(
                400,
                `${product.name}-এর ক্রয় মূল্য সঠিক নয়`,
              );
            }
            rate = round2(customRate);
          }

          addQtyByProduct.set(
            product.id,
            round2((addQtyByProduct.get(product.id) || 0) + qty),
          );

          purchaseItems.push({
            productId: product.id,
            name: product.name,
            unit: product.unit,
            qty,
            rate,
            purchaseRate: rate,
            total: round2(qty * rate),
          });
        }

        const subTotal = round2(
          purchaseItems.reduce((sum, i) => sum + i.total, 0),
        );
        const discount = round2(discountInput);
        if (discount > subTotal) {
          throw new StoreError(
            400,
            "ডিসকাউন্ট মোট ক্রয় বিলের চেয়ে বেশি হতে পারবে না",
          );
        }

        const total = round2(subTotal - discount);
        const paid = round2(paidInput);
        if (paid > total) {
          throw new StoreError(
            400,
            "নগদ পরিশোধ মোট ক্রয় বিলের চেয়ে বেশি হতে পারবে না",
          );
        }

        const due = round2(total - paid);
        const status: InvoiceStatus =
          due === 0 ? "paid" : paid > 0 ? "partial" : "due";

        for (const [productId, qtyToAdd] of addQtyByProduct.entries()) {
          const product = productSnaps.get(productId)!;
          tx.update(doc(db, "products", productId), {
            stock: round2(product.stock + qtyToAdd),
          });
        }

        const nowIso = new Date().toISOString();
        tx.update(supRef, {
          due: round2(supplier.due + due),
          lastTxn: formatDateBn(nowIso),
        });

        const prefix = `PUR-${meta.settings?.invoicePrefix || "ABS"}`;
        const purId = makeId("pur");
        const purchase: PurchaseInvoice = {
          id: purId,
          number: nextSeqNumber(prefix, existingPurNumbers),
          date: nowIso,
          supplierId: supplier.id,
          supplierName: supplier.name,
          supplierMobile: supplier.mobile,
          items: purchaseItems,
          itemsCount: round2(purchaseItems.reduce((sum, i) => sum + i.qty, 0)),
          subTotal,
          discount,
          total,
          paid,
          due,
          status,
          ...(note ? { note } : {}),
        };

        tx.set(doc(db, "purchases", purId), purchase);

        if (paid > 0) {
          const ledId = makeId("led");
          const ledgerEntry: CashLedgerEntry = {
            id: ledId,
            date: nowIso,
            party: supplier.name,
            amount: paid,
            direction: "out",
            kind: "purchase",
            category: "পণ্য ক্রয়",
            staffId: user.id,
            staffName: user.name,
            refId: purId,
            note: `ক্রয় চালান #${purchase.number} নগদ পরিশোধ`,
          };
          tx.set(doc(db, "ledger", ledId), ledgerEntry);
        }

        return purchase;
      });

      const bootstrap = await this.bootstrap(userId);
      return { purchase: createdPurchase, bootstrap };
    } catch (error) {
      wrapFirestoreFailure(error);
    }
  },

  async createSupplier(
    userId: string | null,
    body: { name: string; mobile: string; area?: string; due?: number },
  ): Promise<{ supplier: Supplier; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mobile = normalizePhoneDigits(body.mobile);
    const area = typeof body.area === "string" ? body.area.trim() : "";
    const dueInput = body.due === undefined ? 0 : parseNum(body.due);

    if (!name) throw new StoreError(400, "সরবরাহকারীর নাম লিখুন");
    if (mobile.length < 6) throw new StoreError(400, "সঠিক মোবাইল নম্বর দিন");
    if (!Number.isFinite(dueInput) || dueInput < 0) {
      throw new StoreError(400, "বকেয়ার পরিমাণ সঠিক নয়");
    }

    const due = round2(dueInput);
    const nowIso = new Date().toISOString();
    const id = makeId("sup");
    const supplier: Supplier = {
      id,
      name,
      mobile,
      area: area || "ঢাকা",
      due,
      lastTxn: due > 0 ? formatDateBn(nowIso) : "এখনো লেনদেন নেই",
    };

    try {
      await setDoc(doc(db, "suppliers", id), supplier);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `suppliers/${id}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { supplier, bootstrap };
  },

  async updateSupplier(
    userId: string | null,
    supplierId: string,
    body: { name?: string; mobile?: string; area?: string },
  ): Promise<{ supplier: Supplier; bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const supRef = doc(db, "suppliers", supplierId);
    const snap = await getDoc(supRef);
    if (!snap.exists()) {
      throw new StoreError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
    }
    const supplier = { ...(snap.data() as Supplier) };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        throw new StoreError(400, "সরবরাহকারীর নাম খালি রাখা যাবে না");
      }
      supplier.name = name;
    }
    if (body.mobile !== undefined) {
      const mobile = normalizePhoneDigits(body.mobile);
      if (mobile.length < 6) throw new StoreError(400, "সঠিক মোবাইল নম্বর দিন");
      supplier.mobile = mobile;
    }
    if (body.area !== undefined) {
      supplier.area = String(body.area).trim() || supplier.area;
    }

    const purSnap = await getDocs(
      query(collection(db, "purchases"), where("supplierId", "==", supplierId)),
    );
    const batch = writeBatch(db);
    batch.set(supRef, supplier);
    for (const d of purSnap.docs) {
      batch.update(d.ref, {
        supplierName: supplier.name,
        supplierMobile: supplier.mobile,
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `suppliers/${supplierId}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { supplier, bootstrap };
  },

  async paySupplier(
    userId: string | null,
    supplierId: string,
    body: { amount: number; note?: string },
  ): Promise<{ bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const amountInput = parseNum(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new StoreError(400, "পরিশোধের পরিমাণ শূন্যের বেশি হতে হবে");
    }
    const amount = round2(amountInput);

    try {
      await runTransaction(db, async (tx) => {
        const supRef = doc(db, "suppliers", supplierId);
        const supSnap = await tx.get(supRef);
        if (!supSnap.exists()) {
          throw new StoreError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
        }
        const supplier = supSnap.data() as Supplier;
        if (amount > supplier.due) {
          throw new StoreError(
            400,
            "পরিশোধের পরিমাণ সরবরাহকারীর বকেয়ার চেয়ে বেশি হতে পারবে না",
          );
        }

        const nowIso = new Date().toISOString();
        tx.update(supRef, {
          due: round2(supplier.due - amount),
          lastTxn: formatDateBn(nowIso),
        });

        const ledId = makeId("led");
        const ledgerEntry: CashLedgerEntry = {
          id: ledId,
          date: nowIso,
          party: supplier.name,
          amount,
          direction: "out",
          kind: "supplier_payment",
          category: "সাপ্লায়ার পরিশোধ",
          staffId: user.id,
          staffName: user.name,
          refId: supplier.id,
          note: note || "সরবরাহকারীকে বকেয়া পরিশোধ",
        };
        tx.set(doc(db, "ledger", ledId), ledgerEntry);
      });

      const bootstrap = await this.bootstrap(userId);
      return { bootstrap };
    } catch (error) {
      wrapFirestoreFailure(error);
    }
  },

  async createLedger(
    userId: string | null,
    body: {
      party: string;
      amount: number;
      direction: "in" | "out";
      kind: "expense" | "adjustment";
      note?: string;
    },
  ): Promise<{ bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const party = typeof body.party === "string" ? body.party.trim() : "";
    const amountInput = parseNum(body.amount);
    const direction =
      typeof body.direction === "string" ? body.direction.trim() : "";
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!party) throw new StoreError(400, "খাত বা বিবরণের নাম লিখুন");
    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new StoreError(400, "টাকার পরিমাণ শূন্যের বেশি হতে হবে");
    }
    if (direction !== "in" && direction !== "out") {
      throw new StoreError(400, "লেনদেনের দিক সঠিক নয়");
    }
    if (kind !== "expense" && kind !== "adjustment") {
      throw new StoreError(400, "লেনদেনের ধরন সঠিক নয়");
    }

    const id = makeId("led");
    const entry: CashLedgerEntry = {
      id,
      date: new Date().toISOString(),
      party,
      amount: round2(amountInput),
      direction,
      kind,
      category: kind === "expense" ? "দোকান খরচ" : "নগদ সমন্বয়",
      staffId: user.id,
      staffName: user.name,
      ...(note ? { note } : {}),
    };

    try {
      await setDoc(doc(db, "ledger", id), entry);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `ledger/${id}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { bootstrap };
  },

  async getStaffReport(
    userId: string | null,
    targetId: string,
  ): Promise<StaffDetailReport> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const raw = await fetchRawState(true);
    const sortedInvoices = sortByDateDesc(raw.invoices);
    const sortedCollections = sortByDateDesc(raw.collections);
    const sortedHandovers = sortByDateDesc(raw.handovers);
    const perfList = computeStaffPerformance(
      raw.users,
      sortedInvoices,
      sortedCollections,
      sortedHandovers,
    );
    const staffPerf = perfList.find((s) => s.id === targetId);
    if (!staffPerf) {
      throw new StoreError(404, "স্টাফ খুঁজে পাওয়া যায়নি");
    }

    return {
      staff: staffPerf,
      invoices: sortedInvoices.filter((inv) => inv.staffId === targetId),
      collections: sortedCollections.filter((col) => col.staffId === targetId),
      handovers: sortedHandovers.filter((h) => h.staffId === targetId),
    };
  },

  async createStaff(
    userId: string | null,
    body: { name: string; phone: string; password: string; note?: string },
  ): Promise<{ bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = normalizePhoneDigits(body.phone);
    const password =
      typeof body.password === "string"
        ? body.password.trim()
        : String(body.password ?? "").trim();
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!name) throw new StoreError(400, "স্টাফের নাম লিখুন");
    if (phone.length < 6) throw new StoreError(400, "সঠিক মোবাইল নম্বর দিন");
    if (password.length < 6) {
      throw new StoreError(400, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
    }

    const usersSnap = await getDocs(collection(db, "users"));
    const duplicate = usersSnap.docs.some(
      (d) => normalizePhoneDigits((d.data() as StoredUserRecord).phone) === phone,
    );
    if (duplicate) {
      throw new StoreError(
        400,
        "এই মোবাইল নম্বর দিয়ে ইতোমধ্যে একটি অ্যাকাউন্ট আছে",
      );
    }

    const id = makeId("usr-staff");
    const passwordHash = await hashPassword(password);
    const newStaff: StoredUserRecord = {
      id,
      name,
      phone,
      role: "staff",
      passwordHash,
      active: true,
      ...(note ? { note } : {}),
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "users", id), newStaff);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${id}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { bootstrap };
  },

  async updateStaff(
    userId: string | null,
    targetId: string,
    body: {
      name?: string;
      phone?: string;
      password?: string;
      active?: boolean;
      note?: string;
    },
  ): Promise<{ bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const targetRef = doc(db, "users", targetId);
    const snap = await getDoc(targetRef);
    if (!snap.exists()) {
      throw new StoreError(404, "স্টাফ খুঁজে পাওয়া যায়নি");
    }
    const target = { ...(snap.data() as StoredUserRecord) };
    let nameChanged = false;

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new StoreError(400, "স্টাফের নাম খালি রাখা যাবে না");
      if (name !== target.name) {
        target.name = name;
        nameChanged = true;
      }
    }

    if (body.phone !== undefined) {
      const phone = normalizePhoneDigits(body.phone);
      if (phone.length < 6) throw new StoreError(400, "সঠিক মোবাইল নম্বর দিন");
      const usersSnap = await getDocs(collection(db, "users"));
      const duplicate = usersSnap.docs.some((d) => {
        const u = d.data() as StoredUserRecord;
        return u.id !== target.id && normalizePhoneDigits(u.phone) === phone;
      });
      if (duplicate) {
        throw new StoreError(
          400,
          "এই মোবাইল নম্বর অন্য অ্যাকাউন্টে ব্যবহৃত হচ্ছে",
        );
      }
      target.phone = phone;
    }

    if (body.active !== undefined) {
      const nextActive = Boolean(body.active);
      if (target.id === user.id && !nextActive) {
        throw new StoreError(
          400,
          "নিজের অ্যাডমিন অ্যাকাউন্ট নিষ্ক্রিয় করা যাবে না",
        );
      }
      target.active = nextActive;
    }

    if (body.note !== undefined) {
      const note = String(body.note).trim();
      if (note) {
        target.note = note;
      } else {
        delete target.note;
      }
    }

    if (body.password !== undefined) {
      const password = String(body.password).trim();
      if (password) {
        if (password.length < 6) {
          throw new StoreError(400, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
        }
        target.passwordHash = await hashPassword(password);
      }
    }

    const batch = writeBatch(db);
    batch.set(targetRef, target);

    if (nameChanged) {
      const [invsSnap, colsSnap, ledSnap, hndSnap] = await Promise.all([
        getDocs(query(collection(db, "invoices"), where("staffId", "==", target.id))),
        getDocs(query(collection(db, "collections"), where("staffId", "==", target.id))),
        getDocs(query(collection(db, "ledger"), where("staffId", "==", target.id))),
        getDocs(query(collection(db, "handovers"), where("staffId", "==", target.id))),
      ]);
      for (const d of invsSnap.docs) batch.update(d.ref, { staffName: target.name });
      for (const d of colsSnap.docs) batch.update(d.ref, { staffName: target.name });
      for (const d of ledSnap.docs) batch.update(d.ref, { staffName: target.name });
      for (const d of hndSnap.docs) batch.update(d.ref, { staffName: target.name });
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetId}`);
    }

    const bootstrap = await this.bootstrap(userId);
    return { bootstrap };
  },

  async changeStaffPassword(
    adminUserId: string | null,
    targetStaffId: string,
    newPassword: string,
  ): Promise<{ bootstrap: BootstrapPayload }> {
    const admin = await getCurrentUserOrThrow(adminUserId);
    requireAdmin(admin);

    const trimmed = String(newPassword ?? "").trim();
    if (trimmed.length < 6) {
      throw new StoreError(400, "নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
    }

    const targetRef = doc(db, "users", targetStaffId);
    const snap = await getDoc(targetRef);
    if (!snap.exists()) {
      throw new StoreError(404, "স্টাফ খুঁজে পাওয়া যায়নি");
    }

    const passwordHash = await hashPassword(trimmed);
    try {
      await updateDoc(targetRef, { passwordHash });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `users/${targetStaffId}`,
      );
    }

    const bootstrap = await this.bootstrap(adminUserId);
    return { bootstrap };
  },

  async changeOwnPassword(
    userId: string | null,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await getCurrentUserOrThrow(userId);
    const oldPwd = String(oldPassword ?? "");
    const nextPwd = String(newPassword ?? "").trim();

    if (!oldPwd) {
      throw new StoreError(400, "বর্তমান পাসওয়ার্ড লিখুন");
    }
    if (nextPwd.length < 6) {
      throw new StoreError(400, "নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
    }

    const matches = await verifyPassword(oldPwd, user.passwordHash);
    if (!matches) {
      throw new StoreError(401, "বর্তমান পাসওয়ার্ড সঠিক নয়");
    }

    const passwordHash = await hashPassword(nextPwd);
    try {
      await updateDoc(doc(db, "users", user.id), { passwordHash });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
    }
  },

  async updateSettings(
    userId: string | null,
    body: {
      store?: Partial<StoreProfile>;
      settings?: Partial<StoreSettings>;
      adminPassword?: string;
    },
  ): Promise<{ bootstrap: BootstrapPayload }> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);

    const metaRef = doc(db, "meta", "store");
    const metaSnap = await getDoc(metaRef);
    const current = metaSnap.exists()
      ? (metaSnap.data() as StoredMetaDoc)
      : { ...DEFAULT_META };

    const nextStore: StoreProfile = { ...current.store };
    const nextSettings: StoreSettings = { ...current.settings };

    if (body.store && typeof body.store === "object") {
      const s = body.store;
      if (s.name !== undefined && String(s.name).trim()) {
        nextStore.name = String(s.name).trim();
      }
      if (s.subtitle !== undefined) {
        nextStore.subtitle = String(s.subtitle).trim();
      }
      if (s.address !== undefined) {
        nextStore.address = String(s.address).trim();
      }
      if (s.phone !== undefined) {
        const phone = normalizePhoneDigits(s.phone);
        if (phone) nextStore.phone = phone;
      }
      if (s.ownerName !== undefined) {
        nextStore.ownerName = String(s.ownerName).trim();
      }
      if (s.initials !== undefined && String(s.initials).trim()) {
        nextStore.initials = String(s.initials).trim();
      }
    }

    if (body.settings && typeof body.settings === "object") {
      const st = body.settings;
      if (st.invoicePrefix !== undefined && String(st.invoicePrefix).trim()) {
        nextSettings.invoicePrefix = String(st.invoicePrefix).trim();
      }
      if (st.invoiceFooter !== undefined) {
        nextSettings.invoiceFooter = String(st.invoiceFooter).trim();
      }
      if (st.allowNegativeStock !== undefined) {
        nextSettings.allowNegativeStock = Boolean(st.allowNegativeStock);
      }
    }

    const batch = writeBatch(db);
    batch.set(metaRef, {
      store: nextStore,
      settings: nextSettings,
      openingCash: Number(current.openingCash ?? 0),
      updatedAt: new Date().toISOString(),
    });

    if (body.adminPassword !== undefined) {
      const nextPass = String(body.adminPassword).trim();
      if (nextPass) {
        if (nextPass.length < 6) {
          throw new StoreError(400, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
        }
        const passwordHash = await hashPassword(nextPass);
        batch.update(doc(db, "users", user.id), { passwordHash });
      }
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "meta/store");
    }

    const bootstrap = await this.bootstrap(userId);
    return { bootstrap };
  },

  async exportBackupJson(userId: string | null): Promise<string> {
    const user = await getCurrentUserOrThrow(userId);
    requireAdmin(user);
    const raw = await fetchRawState(true);
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      store: raw.meta.store,
      settings: raw.meta.settings,
      openingCash: raw.meta.openingCash,
      users: raw.users.map(sanitizeUser),
      products: raw.products,
      customers: raw.customers,
      suppliers: raw.suppliers,
      invoices: sortByDateDesc(raw.invoices),
      purchases: sortByDateDesc(raw.purchases),
      collections: sortByDateDesc(raw.collections),
      ledger: sortByDateDesc(raw.ledger),
      handovers: sortByDateDesc(raw.handovers),
    };
    return JSON.stringify(exportPayload, null, 2);
  },
};
