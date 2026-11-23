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
  StaffPerformance,
  StoreProfile,
  StoreSettings,
  Supplier,
  UserRole,
} from "../types";
import { formatDateBn, toEnDigits } from "./format";

const DB_STORAGE_KEY = "ab_local_db_v1";
const SESSIONS_STORAGE_KEY = "ab_local_sessions_v1";

export class LocalStoreError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "LocalStoreError";
    this.status = status;
  }
}

interface StoredUser {
  id: string;
  name: string;
  phone: string;
  password: string;
  role: UserRole;
  active: boolean;
  note?: string;
  createdAt: string;
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

interface StoredDb {
  store: StoreProfile;
  settings: StoreSettings;
  openingCash: number;
  users: StoredUser[];
  products: StoredProduct[];
  customers: Customer[];
  suppliers: Supplier[];
  invoices: StoredSaleInvoice[];
  purchases: PurchaseInvoice[];
  collections: DueCollection[];
  ledger: CashLedgerEntry[];
}

interface LocalSession {
  userId: string;
  createdAt: string;
}

type SessionsMap = Record<string, LocalSession>;

let memoryDb: StoredDb | null = null;
let memorySessions: SessionsMap = {};

function normalizePhoneDigits(phone: unknown): string {
  const digits = toEnDigits(String(phone ?? "")).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("8801")) {
    return digits.slice(2);
  }
  return digits;
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
  return `${prefix}-${randomHex(8)}`;
}

function makeLocalToken(): string {
  return `local-${randomHex(16)}${randomHex(16)}`;
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

function daysAgoIso(daysAgo: number, hour = 11, minute = 20): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function createSeedDb(): StoredDb {
  const store: StoreProfile = {
    name: "আল-বারাকাহ স্টোর",
    subtitle: "পাইকারি ব্যবসা ব্যবস্থাপনা",
    address: "চকবাজার, ঢাকা",
    phone: "01806476652",
    ownerName: "আল-বারাকাহ অ্যাডমিন",
    initials: "AB",
  };

  const settings: StoreSettings = {
    invoicePrefix: "ABS",
    invoiceFooter: "আল-বারাকাহ স্টোর · নগদ ও বাকি পাইকারি চালান",
    allowNegativeStock: false,
  };

  const openingCash = 250000;

  const users: StoredUser[] = [
    {
      id: "usr-admin",
      name: "আল-বারাকাহ অ্যাডমিন",
      phone: "01806476652",
      password: "01806476652",
      role: "admin",
      active: true,
      note: "স্বত্বাধিকারী ও মূল অ্যাডমিন",
      createdAt: daysAgoIso(45, 9, 0),
    },
    {
      id: "usr-staff-1",
      name: "মো. রাশেদুল ইসলাম",
      phone: "01806476653",
      password: "01806476653",
      role: "staff",
      active: true,
      note: "পাইকারি বিক্রয় প্রতিনিধি",
      createdAt: daysAgoIso(35, 9, 30),
    },
    {
      id: "usr-staff-2",
      name: "মো. কামরুল হাসান",
      phone: "01806476654",
      password: "01806476654",
      role: "staff",
      active: true,
      note: "কাউন্টার ও কালেকশন স্টাফ",
      createdAt: daysAgoIso(25, 10, 0),
    },
  ];

  const userMap = new Map(users.map((u) => [u.id, u]));

  const products: StoredProduct[] = [
    {
      id: "prod-1",
      name: "মিনিকেট চাল ৫০ কেজি বস্তা",
      sku: "ABS-1001",
      barcode: "8942200200101",
      category: "চাল ও ডাল",
      unit: "বস্তা",
      purchaseRate: 3250,
      saleRate: 3480,
      stock: 145,
      minStock: 30,
    },
    {
      id: "prod-2",
      name: "নাজিরশাইল প্রিমিয়াম চাল ৫০ কেজি",
      sku: "ABS-1002",
      barcode: "8942200200102",
      category: "চাল ও ডাল",
      unit: "বস্তা",
      purchaseRate: 3580,
      saleRate: 3820,
      stock: 88,
      minStock: 25,
    },
    {
      id: "prod-3",
      name: "তীর সয়াবিন তেল (৪x৫ লিটার কার্টন)",
      sku: "ABS-1003",
      barcode: "8942200200103",
      category: "ভোজ্যতেল",
      unit: "কার্টন",
      purchaseRate: 3240,
      saleRate: 3420,
      stock: 62,
      minStock: 15,
    },
    {
      id: "prod-4",
      name: "ফ্রেশ পাম অয়েল (১৬ লিটার ড্রাম)",
      sku: "ABS-1004",
      barcode: "8942200200104",
      category: "ভোজ্যতেল",
      unit: "ড্রাম",
      purchaseRate: 2290,
      saleRate: 2450,
      stock: 14,
      minStock: 20,
    },
    {
      id: "prod-5",
      name: "দেশি মসুর ডাল ৫০ কেজি বস্তা",
      sku: "ABS-1005",
      barcode: "8942200200105",
      category: "চাল ও ডাল",
      unit: "বস্তা",
      purchaseRate: 5750,
      saleRate: 6150,
      stock: 38,
      minStock: 12,
    },
    {
      id: "prod-6",
      name: "ফ্রেশ রিফাইন্ড চিনি ৫০ কেজি",
      sku: "ABS-1006",
      barcode: "8942200200106",
      category: "চিনি ও আটা",
      unit: "বস্তা",
      purchaseRate: 5950,
      saleRate: 6320,
      stock: 52,
      minStock: 15,
    },
    {
      id: "prod-7",
      name: "তীর আটা ২ কেজি (২০ প্যাক বস্তা)",
      sku: "ABS-1007",
      barcode: "8942200200107",
      category: "চিনি ও আটা",
      unit: "বস্তা",
      purchaseRate: 1860,
      saleRate: 2020,
      stock: 74,
      minStock: 20,
    },
    {
      id: "prod-8",
      name: "প্রাণ ম্যাঙ্গো জুস ২৫০ মিলি (২৪ পিস)",
      sku: "ABS-1008",
      barcode: "8942200200108",
      category: "প্যাকেজড পণ্য",
      unit: "কার্টন",
      purchaseRate: 540,
      saleRate: 590,
      stock: 110,
      minStock: 30,
    },
    {
      id: "prod-9",
      name: "লাক্স সাবান (৭২ পিস কার্টন)",
      sku: "ABS-1009",
      barcode: "8942200200109",
      category: "প্যাকেজড পণ্য",
      unit: "কার্টন",
      purchaseRate: 3880,
      saleRate: 4180,
      stock: 9,
      minStock: 12,
    },
    {
      id: "prod-10",
      name: "রাঁধুনি মিক্স মশলা ডজন প্যাক",
      sku: "ABS-1010",
      barcode: "8942200200110",
      category: "মশলা ও লবণ",
      unit: "ডজন",
      purchaseRate: 980,
      saleRate: 1090,
      stock: 64,
      minStock: 15,
    },
    {
      id: "prod-11",
      name: "মোল্লা সুপার সল্ট ২৫ কেজি বস্তা",
      sku: "ABS-1011",
      barcode: "8942200200111",
      category: "মশলা ও লবণ",
      unit: "বস্তা",
      purchaseRate: 780,
      saleRate: 875,
      stock: 95,
      minStock: 25,
    },
    {
      id: "prod-12",
      name: "বসুন্ধরা টিস্যু (৪৮ বক্স কার্টন)",
      sku: "ABS-1012",
      barcode: "8942200200112",
      category: "প্যাকেজড পণ্য",
      unit: "কার্টন",
      purchaseRate: 2150,
      saleRate: 2340,
      stock: 0,
      minStock: 10,
    },
  ];

  const productMap = new Map(products.map((p) => [p.id, p]));

  const customers: Customer[] = [
    {
      id: "cust-1",
      name: "বিসমিল্লাহ ভ্যারাইটিজ স্টোর",
      mobile: "01712340101",
      area: "চকবাজার, ঢাকা",
      openingDue: 5000,
      due: 0,
      createdAt: daysAgoIso(30, 10, 0),
    },
    {
      id: "cust-2",
      name: "আমানত গ্রোসারি মার্ট",
      mobile: "01812340102",
      area: "মোহাম্মদপুর, ঢাকা",
      openingDue: 0,
      due: 0,
      createdAt: daysAgoIso(28, 11, 15),
    },
    {
      id: "cust-3",
      name: "মদিনা বাজার ডিপার্টমেন্টাল",
      mobile: "01912340103",
      area: "মিরপুর-১, ঢাকা",
      openingDue: 3500,
      due: 0,
      createdAt: daysAgoIso(24, 12, 0),
    },
    {
      id: "cust-4",
      name: "সততা সুপার স্টোর",
      mobile: "01612340104",
      area: "উত্তরা, ঢাকা",
      openingDue: 0,
      due: 0,
      createdAt: daysAgoIso(22, 14, 0),
    },
    {
      id: "cust-5",
      name: "নিউ ঢাকা ট্রেডার্স",
      mobile: "01712340105",
      area: "যাত্রাবাড়ী, ঢাকা",
      openingDue: 0,
      due: 0,
      createdAt: daysAgoIso(19, 15, 20),
    },
    {
      id: "cust-6",
      name: "হাজী এন্টারপ্রাইজ",
      mobile: "01812340106",
      area: "কেরানীগঞ্জ, ঢাকা",
      openingDue: 0,
      due: 0,
      createdAt: daysAgoIso(18, 10, 45),
    },
    {
      id: "cust-7",
      name: "রহিম জেনারেল স্টোর",
      mobile: "01912340107",
      area: "সাভার, ঢাকা",
      openingDue: 2000,
      due: 0,
      createdAt: daysAgoIso(15, 16, 0),
    },
    {
      id: "cust-8",
      name: "আশুলিয়া বাজার স্টোর",
      mobile: "01712340108",
      area: "আশুলিয়া, ঢাকা",
      openingDue: 0,
      due: 0,
      createdAt: daysAgoIso(12, 11, 30),
    },
  ];

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const suppliers: Supplier[] = [
    {
      id: "sup-1",
      name: "সিটি গ্রুপ",
      mobile: "01700991101",
      area: "তেজগাঁও, ঢাকা",
      due: 17200,
      lastTxn: formatDateBn(daysAgoIso(1, 10, 0)),
    },
    {
      id: "sup-2",
      name: "নূরজাহান রাইস মিল",
      mobile: "01700991102",
      area: "শেরপুর, বগুড়া",
      due: 32500,
      lastTxn: formatDateBn(daysAgoIso(3, 11, 30)),
    },
    {
      id: "sup-3",
      name: "মেঘনা এডিবল অয়েল",
      mobile: "01700991103",
      area: "সোনারগাঁও, নারায়ণগঞ্জ",
      due: 0,
      lastTxn: formatDateBn(daysAgoIso(5, 15, 15)),
    },
    {
      id: "sup-4",
      name: "প্রাণ ডিস্ট্রিবিউশন",
      mobile: "01700991104",
      area: "বাড্ডা, ঢাকা",
      due: 0,
      lastTxn: formatDateBn(daysAgoIso(8, 14, 10)),
    },
    {
      id: "sup-5",
      name: "বসুন্ধরা কনজ্যুমার প্রোডাক্টস",
      mobile: "01700991105",
      area: "বসুন্ধরা, ঢাকা",
      due: 13000,
      lastTxn: formatDateBn(daysAgoIso(12, 13, 0)),
    },
  ];

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  function buildSaleInvoice(spec: {
    id: string;
    number: string;
    date: string;
    customerId: string;
    staffId: string;
    items: Array<{ productId: string; qty: number; rate?: number }>;
    discount?: number;
    initialPaid: number;
    note?: string;
  }): StoredSaleInvoice {
    const cust = customerMap.get(spec.customerId)!;
    const staff = userMap.get(spec.staffId)!;
    const items: StoredInvoiceItem[] = spec.items.map((line) => {
      const prod = productMap.get(line.productId)!;
      const rate = line.rate ?? prod.saleRate;
      return {
        productId: prod.id,
        name: prod.name,
        unit: prod.unit,
        qty: line.qty,
        rate,
        purchaseRate: prod.purchaseRate,
        total: line.qty * rate,
      };
    });
    const subTotal = items.reduce((sum, i) => sum + i.total, 0);
    const discount = spec.discount ?? 0;
    const total = subTotal - discount;
    const initialPaid = spec.initialPaid;
    const paid = initialPaid;
    const due = total - paid;
    const status: InvoiceStatus =
      due === 0 ? "paid" : paid > 0 ? "partial" : "due";

    return {
      id: spec.id,
      number: spec.number,
      date: spec.date,
      customerId: cust.id,
      customerName: cust.name,
      customerMobile: cust.mobile,
      staffId: staff.id,
      staffName: staff.name,
      items,
      itemsCount: items.reduce((sum, i) => sum + i.qty, 0),
      subTotal,
      discount,
      total,
      initialPaid,
      paid,
      due,
      status,
      ...(spec.note ? { note: spec.note } : {}),
    };
  }

  const invoices: StoredSaleInvoice[] = [
    buildSaleInvoice({
      id: "inv-1",
      number: "ABS-0109",
      date: daysAgoIso(0, 11, 30),
      customerId: "cust-1",
      staffId: "usr-staff-1",
      items: [
        { productId: "prod-1", qty: 10 },
        { productId: "prod-3", qty: 5 },
      ],
      discount: 0,
      initialPaid: 40000,
      note: "সকালের পাইকারি চালান",
    }),
    buildSaleInvoice({
      id: "inv-2",
      number: "ABS-0108",
      date: daysAgoIso(0, 15, 10),
      customerId: "cust-6",
      staffId: "usr-staff-2",
      items: [
        { productId: "prod-1", qty: 10 },
        { productId: "prod-11", qty: 10 },
      ],
      discount: 550,
      initialPaid: 43000,
      note: "সম্পূর্ণ নগদ পরিশোধ",
    }),
    buildSaleInvoice({
      id: "inv-3",
      number: "ABS-0107",
      date: daysAgoIso(1, 16, 40),
      customerId: "cust-2",
      staffId: "usr-admin",
      items: [
        { productId: "prod-6", qty: 6 },
        { productId: "prod-8", qty: 12 },
      ],
      discount: 0,
      initialPaid: 25000,
    }),
    buildSaleInvoice({
      id: "inv-4",
      number: "ABS-0106",
      date: daysAgoIso(2, 14, 20),
      customerId: "cust-3",
      staffId: "usr-staff-1",
      items: [
        { productId: "prod-2", qty: 8 },
        { productId: "prod-7", qty: 10 },
      ],
      discount: 0,
      initialPaid: 30000,
    }),
    buildSaleInvoice({
      id: "inv-5",
      number: "ABS-0105",
      date: daysAgoIso(3, 11, 15),
      customerId: "cust-4",
      staffId: "usr-staff-2",
      items: [
        { productId: "prod-5", qty: 5 },
        { productId: "prod-11", qty: 15 },
      ],
      discount: 0,
      initialPaid: 20000,
    }),
    buildSaleInvoice({
      id: "inv-6",
      number: "ABS-0104",
      date: daysAgoIso(4, 17, 5),
      customerId: "cust-5",
      staffId: "usr-staff-1",
      items: [
        { productId: "prod-4", qty: 8 },
        { productId: "prod-10", qty: 10 },
      ],
      discount: 0,
      initialPaid: 15000,
    }),
    buildSaleInvoice({
      id: "inv-7",
      number: "ABS-0103",
      date: daysAgoIso(5, 13, 50),
      customerId: "cust-6",
      staffId: "usr-admin",
      items: [{ productId: "prod-1", qty: 15 }],
      discount: 0,
      initialPaid: 52200,
    }),
    buildSaleInvoice({
      id: "inv-8",
      number: "ABS-0102",
      date: daysAgoIso(6, 15, 30),
      customerId: "cust-7",
      staffId: "usr-staff-2",
      items: [
        { productId: "prod-9", qty: 4 },
        { productId: "prod-8", qty: 15 },
      ],
      discount: 0,
      initialPaid: 0,
      note: "সাপ্তাহিক বাকিতে চালান",
    }),
    buildSaleInvoice({
      id: "inv-9",
      number: "ABS-0101",
      date: daysAgoIso(9, 12, 20),
      customerId: "cust-8",
      staffId: "usr-staff-1",
      items: [{ productId: "prod-3", qty: 10 }],
      discount: 0,
      initialPaid: 20000,
    }),
  ];

  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

  function buildCollection(spec: {
    id: string;
    receiptNo: string;
    date: string;
    customerId: string;
    invoiceId?: string;
    amount: number;
    staffId: string;
    note?: string;
  }): DueCollection {
    const cust = customerMap.get(spec.customerId)!;
    const staff = userMap.get(spec.staffId)!;
    const inv = spec.invoiceId ? invoiceMap.get(spec.invoiceId) : undefined;
    return {
      id: spec.id,
      receiptNo: spec.receiptNo,
      date: spec.date,
      customerId: cust.id,
      customerName: cust.name,
      customerMobile: cust.mobile,
      ...(inv ? { invoiceId: inv.id, invoiceNumber: inv.number } : {}),
      amount: spec.amount,
      staffId: staff.id,
      staffName: staff.name,
      ...(spec.note ? { note: spec.note } : {}),
    };
  }

  const collections: DueCollection[] = [
    buildCollection({
      id: "col-5",
      receiptNo: "COL-0105",
      date: daysAgoIso(0, 12, 45),
      customerId: "cust-2",
      invoiceId: "inv-3",
      amount: 10000,
      staffId: "usr-staff-2",
      note: "আংশিক বকেয়া নগদ আদায়",
    }),
    buildCollection({
      id: "col-4",
      receiptNo: "COL-0104",
      date: daysAgoIso(1, 13, 15),
      customerId: "cust-3",
      invoiceId: "inv-4",
      amount: 10000,
      staffId: "usr-staff-1",
      note: "বকেয়া কিস্তি জমা",
    }),
    buildCollection({
      id: "col-3",
      receiptNo: "COL-0103",
      date: daysAgoIso(2, 16, 10),
      customerId: "cust-4",
      invoiceId: "inv-5",
      amount: 23875,
      staffId: "usr-staff-2",
      note: "পূর্ণ বকেয়া পরিশোধ",
    }),
    buildCollection({
      id: "col-2",
      receiptNo: "COL-0102",
      date: daysAgoIso(2, 11, 50),
      customerId: "cust-5",
      invoiceId: "inv-6",
      amount: 5000,
      staffId: "usr-admin",
      note: "কাউন্টার নগদ আদায়",
    }),
    buildCollection({
      id: "col-1",
      receiptNo: "COL-0101",
      date: daysAgoIso(4, 15, 0),
      customerId: "cust-8",
      invoiceId: "inv-9",
      amount: 14200,
      staffId: "usr-staff-1",
      note: "চালান সম্পূর্ণ পরিশোধ",
    }),
  ];

  for (const inv of invoices) {
    const linkedSum = collections
      .filter((c) => c.invoiceId === inv.id)
      .reduce((sum, c) => sum + c.amount, 0);
    inv.paid = inv.initialPaid + linkedSum;
    inv.due = inv.total - inv.paid;
    inv.status = inv.due === 0 ? "paid" : inv.paid > 0 ? "partial" : "due";
  }

  for (const cust of customers) {
    const invoiceDueSum = invoices
      .filter((inv) => inv.customerId === cust.id && inv.due > 0)
      .reduce((sum, inv) => sum + inv.due, 0);
    cust.due = cust.openingDue + invoiceDueSum;
  }

  function buildPurchase(spec: {
    id: string;
    number: string;
    date: string;
    supplierId: string;
    items: Array<{ productId: string; qty: number; rate?: number }>;
    discount?: number;
    paid: number;
    note?: string;
  }): PurchaseInvoice {
    const sup = supplierMap.get(spec.supplierId)!;
    const items: InvoiceItem[] = spec.items.map((line) => {
      const prod = productMap.get(line.productId)!;
      const rate = line.rate ?? prod.purchaseRate;
      return {
        productId: prod.id,
        name: prod.name,
        unit: prod.unit,
        qty: line.qty,
        rate,
        purchaseRate: rate,
        total: line.qty * rate,
      };
    });
    const subTotal = items.reduce((sum, i) => sum + i.total, 0);
    const discount = spec.discount ?? 0;
    const total = subTotal - discount;
    const paid = spec.paid;
    const due = total - paid;
    const status: InvoiceStatus =
      due === 0 ? "paid" : paid > 0 ? "partial" : "due";

    return {
      id: spec.id,
      number: spec.number,
      date: spec.date,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierMobile: sup.mobile,
      items,
      itemsCount: items.reduce((sum, i) => sum + i.qty, 0),
      subTotal,
      discount,
      total,
      paid,
      due,
      status,
      ...(spec.note ? { note: spec.note } : {}),
    };
  }

  const purchases: PurchaseInvoice[] = [
    buildPurchase({
      id: "pur-1",
      number: "PUR-ABS-0104",
      date: daysAgoIso(1, 10, 0),
      supplierId: "sup-1",
      items: [{ productId: "prod-3", qty: 30 }],
      discount: 0,
      paid: 80000,
      note: "সয়াবিন তেল মজুদ ক্রয়",
    }),
    buildPurchase({
      id: "pur-2",
      number: "PUR-ABS-0103",
      date: daysAgoIso(3, 11, 30),
      supplierId: "sup-2",
      items: [{ productId: "prod-1", qty: 50 }],
      discount: 0,
      paid: 130000,
      note: "মিনিকেট চাল ট্রাক লোড",
    }),
    buildPurchase({
      id: "pur-3",
      number: "PUR-ABS-0102",
      date: daysAgoIso(5, 15, 15),
      supplierId: "sup-3",
      items: [{ productId: "prod-6", qty: 20 }],
      discount: 0,
      paid: 119000,
    }),
    buildPurchase({
      id: "pur-4",
      number: "PUR-ABS-0101",
      date: daysAgoIso(8, 14, 10),
      supplierId: "sup-4",
      items: [{ productId: "prod-8", qty: 60 }],
      discount: 0,
      paid: 32400,
    }),
  ];

  const adminUser = userMap.get("usr-admin")!;
  const ledger: CashLedgerEntry[] = [];
  let ledSeq = 1;

  for (const inv of invoices) {
    if (inv.initialPaid > 0) {
      ledger.push({
        id: `led-${ledSeq++}`,
        date: inv.date,
        party: inv.customerName,
        amount: inv.initialPaid,
        direction: "in",
        kind: "sale",
        staffId: inv.staffId,
        staffName: inv.staffName,
        refId: inv.id,
        note: `চালান #${inv.number} নগদ বিক্রি`,
      });
    }
  }

  for (const col of collections) {
    ledger.push({
      id: `led-${ledSeq++}`,
      date: col.date,
      party: col.customerName,
      amount: col.amount,
      direction: "in",
      kind: "collection",
      staffId: col.staffId,
      staffName: col.staffName,
      refId: col.id,
      note: `${col.receiptNo}${col.invoiceNumber ? ` · ${col.invoiceNumber}` : ""}`,
    });
  }

  for (const pur of purchases) {
    if (pur.paid > 0) {
      ledger.push({
        id: `led-${ledSeq++}`,
        date: pur.date,
        party: pur.supplierName,
        amount: pur.paid,
        direction: "out",
        kind: "purchase",
        staffId: adminUser.id,
        staffName: adminUser.name,
        refId: pur.id,
        note: `ক্রয় চালান #${pur.number} নগদ পরিশোধ`,
      });
    }
  }

  ledger.push(
    {
      id: `led-${ledSeq++}`,
      date: daysAgoIso(2, 17, 15),
      party: "গুদাম ভাড়া ও লেবার",
      amount: 18500,
      direction: "out",
      kind: "expense",
      staffId: adminUser.id,
      staffName: adminUser.name,
      note: "মাসিক গুদাম ভাড়া ও লোডিং-আনলোডিং",
    },
    {
      id: `led-${ledSeq++}`,
      date: daysAgoIso(4, 18, 0),
      party: "পরিবহন খরচ (ট্রাক ভাড়া)",
      amount: 9500,
      direction: "out",
      kind: "expense",
      staffId: adminUser.id,
      staffName: adminUser.name,
      note: "বগুড়া থেকে চাল পরিবহন",
    },
  );

  const sortByDateDesc = <T extends { date: string }>(a: T, b: T) =>
    new Date(b.date).getTime() - new Date(a.date).getTime();

  invoices.sort(sortByDateDesc);
  collections.sort(sortByDateDesc);
  purchases.sort(sortByDateDesc);
  ledger.sort(sortByDateDesc);

  return {
    store,
    settings,
    openingCash,
    users,
    products,
    customers,
    suppliers,
    invoices,
    purchases,
    collections,
    ledger,
  };
}

function readDb(): StoredDb {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredDb;
        if (parsed && Array.isArray(parsed.users) && parsed.store) {
          memoryDb = parsed;
          return parsed;
        }
      }
    } catch {
      // Fallback to in-memory or seed DB
    }
  }

  if (memoryDb) return memoryDb;

  const seed = createSeedDb();
  writeDb(seed);
  return seed;
}

function writeDb(db: StoredDb): void {
  memoryDb = db;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore storage quota errors
    }
  }
}

function mutateDb<T>(mutator: (draft: StoredDb) => T): { db: StoredDb; result: T } {
  const current = readDb();
  const draft = JSON.parse(JSON.stringify(current)) as StoredDb;
  const result = mutator(draft);
  writeDb(draft);
  return { db: draft, result };
}

function readSessions(): SessionsMap {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SessionsMap;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          memorySessions = parsed;
          return parsed;
        }
      }
    } catch {
      // Fallback to memory sessions
    }
  }
  return memorySessions;
}

function writeSessions(sessions: SessionsMap): void {
  memorySessions = sessions;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Ignore storage errors
    }
  }
}

function sanitizeUser(user: StoredUser): AuthUser {
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
      items: invoice.items.map((item) => ({ ...item })),
    };
  }
  return {
    ...invoice,
    items: invoice.items.map(({ purchaseRate: _ignored, ...rest }) => rest),
  };
}

function computeStaffPerformance(db: StoredDb): StaffPerformance[] {
  const invoices = Array.isArray(db.invoices) ? db.invoices : [];
  const collections = Array.isArray(db.collections) ? db.collections : [];

  return (db.users || []).map((u) => {
    const userInvoices = invoices.filter((inv) => inv.staffId === u.id);
    const userCollections = collections.filter((col) => col.staffId === u.id);

    const salesCount = userInvoices.length;
    const totalSales = userInvoices.reduce(
      (sum, inv) => sum + Number(inv.total || 0),
      0,
    );
    const saleCashReceived = userInvoices.reduce(
      (sum, inv) => sum + Number(inv.initialPaid || 0),
      0,
    );
    const dueCollectionCount = userCollections.length;
    const dueCashCollected = userCollections.reduce(
      (sum, col) => sum + Number(col.amount || 0),
      0,
    );
    const totalCashReceived = saleCashReceived + dueCashCollected;
    const outstandingDue = userInvoices.reduce(
      (sum, inv) => sum + Number(inv.due || 0),
      0,
    );

    return {
      ...sanitizeUser(u),
      salesCount,
      totalSales,
      saleCashReceived,
      dueCollectionCount,
      dueCashCollected,
      totalCashReceived,
      outstandingDue,
    };
  });
}

function buildBootstrapPayload(db: StoredDb, user: StoredUser): BootstrapPayload {
  const safeUser = sanitizeUser(user);
  const staffPerf = computeStaffPerformance(db);

  if (user.role === "admin") {
    return {
      user: safeUser,
      store: db.store,
      settings: db.settings,
      openingCash: db.openingCash,
      products: db.products,
      customers: db.customers,
      suppliers: db.suppliers,
      invoices: db.invoices,
      purchases: db.purchases,
      collections: db.collections,
      ledger: db.ledger,
      staff: staffPerf,
    };
  }

  return {
    user: safeUser,
    store: db.store,
    settings: db.settings,
    openingCash: 0,
    products: db.products.map((p) => sanitizeProductForRole(p, "staff")),
    customers: db.customers,
    suppliers: [],
    invoices: db.invoices
      .filter((inv) => inv.staffId === user.id)
      .map((inv) => sanitizeInvoiceForRole(inv, "staff")),
    purchases: [],
    collections: db.collections.filter((col) => col.staffId === user.id),
    ledger: db.ledger.filter((entry) => entry.staffId === user.id),
    staff: staffPerf.filter((s) => s.id === user.id),
  };
}

function authenticate(token: string | null): { user: StoredUser; db: StoredDb } {
  if (!token) {
    throw new LocalStoreError(401, "লগইন করা প্রয়োজন");
  }

  const sessions = readSessions();
  const session = sessions[token];
  if (!session || !session.userId) {
    throw new LocalStoreError(
      401,
      "সেশন মেয়াদ শেষ হয়েছে, অনুগ্রহ করে আবার লগইন করুন",
    );
  }

  const db = readDb();
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) {
    const nextSessions = { ...sessions };
    delete nextSessions[token];
    writeSessions(nextSessions);
    throw new LocalStoreError(
      401,
      "ব্যবহারকারী খুঁজে পাওয়া যায়নি, আবার লগইন করুন",
    );
  }

  if (!user.active) {
    const nextSessions = { ...sessions };
    delete nextSessions[token];
    writeSessions(nextSessions);
    throw new LocalStoreError(
      403,
      "আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
    );
  }

  return { user, db };
}

function requireAdmin(user: StoredUser): void {
  if (user.role !== "admin") {
    throw new LocalStoreError(403, "এই কাজের অনুমতি শুধুমাত্র অ্যাডমিনের জন্য");
  }
}

export const localStore = {
  login(phoneInput: string, passwordInput: string): { token: string; user: AuthUser } {
    const phone = normalizePhoneDigits(phoneInput);
    const rawPassword =
      typeof passwordInput === "string"
        ? passwordInput
        : String(passwordInput ?? "");

    if (!phone || !rawPassword) {
      throw new LocalStoreError(400, "মোবাইল নম্বর এবং পাসওয়ার্ড দিন");
    }

    const db = readDb();
    const user = db.users.find((u) => normalizePhoneDigits(u.phone) === phone);
    if (!user) {
      throw new LocalStoreError(401, "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়");
    }

    const passwordMatches =
      user.password === rawPassword ||
      user.password === toEnDigits(rawPassword) ||
      user.password === rawPassword.trim() ||
      user.password === toEnDigits(rawPassword.trim());

    if (!passwordMatches) {
      throw new LocalStoreError(401, "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়");
    }

    if (!user.active) {
      throw new LocalStoreError(
        403,
        "এই অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
      );
    }

    const token = makeLocalToken();
    const sessions = { ...readSessions() };
    sessions[token] = {
      userId: user.id,
      createdAt: new Date().toISOString(),
    };
    writeSessions(sessions);

    return { token, user: sanitizeUser(user) };
  },

  logout(token: string | null): { ok: boolean } {
    if (token) {
      const sessions = { ...readSessions() };
      delete sessions[token];
      writeSessions(sessions);
    }
    return { ok: true };
  },

  me(token: string | null): { user: AuthUser } {
    const { user } = authenticate(token);
    return { user: sanitizeUser(user) };
  },

  bootstrap(token: string | null): BootstrapPayload {
    const { user, db } = authenticate(token);
    return buildBootstrapPayload(db, user);
  },

  createSale(
    token: string | null,
    body: {
      customerId: string;
      items: Array<{ productId: string; qty: number; rate?: number }>;
      discount?: number;
      paid: number;
      note?: string;
    },
  ): { invoice: SaleInvoice; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    const customerId =
      typeof body.customerId === "string" ? body.customerId.trim() : "";
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const discountInput =
      body.discount === undefined ? 0 : parseNum(body.discount);
    const paidInput = body.paid === undefined ? 0 : parseNum(body.paid);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!customerId) {
      throw new LocalStoreError(400, "কাস্টমার নির্বাচন করুন");
    }
    if (itemsInput.length === 0) {
      throw new LocalStoreError(400, "কমপক্ষে একটি পণ্য যোগ করুন");
    }
    if (!Number.isFinite(discountInput) || discountInput < 0) {
      throw new LocalStoreError(400, "ডিসকাউন্টের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(paidInput) || paidInput < 0) {
      throw new LocalStoreError(400, "নগদ জমার পরিমাণ সঠিক নয়");
    }

    const { db, result } = mutateDb((draft) => {
      const productMap = new Map(draft.products.map((p) => [p.id, p]));
      const requestedQtyByProduct = new Map<string, number>();
      const invoiceItems: StoredInvoiceItem[] = [];

      for (const line of itemsInput) {
        const productId =
          typeof line?.productId === "string" ? line.productId.trim() : "";
        const qty = parseNum(line?.qty);
        if (!productId || !Number.isFinite(qty) || qty <= 0) {
          throw new LocalStoreError(400, "প্রতিটি পণ্যের সঠিক পরিমাণ দিন");
        }
        const product = productMap.get(productId);
        if (!product) {
          throw new LocalStoreError(400, "তালিকাভুক্ত পণ্য খুঁজে পাওয়া যায়নি");
        }

        let rate = product.saleRate;
        if (line.rate !== undefined && line.rate !== null) {
          const customRate = parseNum(line.rate);
          if (!Number.isFinite(customRate) || customRate <= 0) {
            throw new LocalStoreError(
              400,
              `${product.name}-এর বিক্রয় মূল্য সঠিক নয়`,
            );
          }
          rate = round2(customRate);
        }

        requestedQtyByProduct.set(
          product.id,
          (requestedQtyByProduct.get(product.id) || 0) + qty,
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

      if (!draft.settings?.allowNegativeStock) {
        for (const [productId, totalQty] of requestedQtyByProduct.entries()) {
          const product = productMap.get(productId)!;
          if (totalQty > product.stock) {
            throw new LocalStoreError(
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
        throw new LocalStoreError(
          400,
          "ডিসকাউন্ট মোট বিলের চেয়ে বেশি হতে পারবে না",
        );
      }

      const total = round2(subTotal - discount);
      const paid = round2(paidInput);
      if (paid > total) {
        throw new LocalStoreError(
          400,
          "নগদ জমা মোট বিলের চেয়ে বেশি হতে পারবে না",
        );
      }

      const due = round2(total - paid);
      const status: InvoiceStatus =
        due === 0 ? "paid" : paid > 0 ? "partial" : "due";

      let customerName = "নগদ কাস্টমার";
      let customerMobile = "";

      if (customerId === "walk-in") {
        if (due > 0) {
          throw new LocalStoreError(
            400,
            "বাকিতে বিক্রির জন্য একজন নিবন্ধিত কাস্টমার নির্বাচন করুন",
          );
        }
      } else {
        const customer = draft.customers.find((c) => c.id === customerId);
        if (!customer) {
          throw new LocalStoreError(400, "নির্বাচিত কাস্টমার খুঁজে পাওয়া যায়নি");
        }
        customerName = customer.name;
        customerMobile = customer.mobile;
        customer.due = round2(customer.due + due);
      }

      for (const [productId, totalQty] of requestedQtyByProduct.entries()) {
        const product = productMap.get(productId)!;
        product.stock = round2(product.stock - totalQty);
      }

      const nowIso = new Date().toISOString();
      const prefix = draft.settings?.invoicePrefix || "ABS";
      const invoice: StoredSaleInvoice = {
        id: makeId("inv"),
        number: nextSeqNumber(
          prefix,
          draft.invoices.map((i) => i.number),
        ),
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

      draft.invoices.unshift(invoice);

      if (paid > 0) {
        draft.ledger.unshift({
          id: makeId("led"),
          date: nowIso,
          party: customerName,
          amount: paid,
          direction: "in",
          kind: "sale",
          staffId: user.id,
          staffName: user.name,
          refId: invoice.id,
          note: `চালান #${invoice.number} নগদ বিক্রি`,
        });
      }

      return invoice;
    });

    return {
      invoice: sanitizeInvoiceForRole(result, user.role),
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  createCollection(
    token: string | null,
    body: {
      customerId: string;
      amount: number;
      invoiceId?: string;
      note?: string;
    },
  ): { collection: DueCollection; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    const customerId =
      typeof body.customerId === "string" ? body.customerId.trim() : "";
    const invoiceId =
      typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
    const amountInput = parseNum(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!customerId) {
      throw new LocalStoreError(400, "কাস্টমার নির্বাচন করুন");
    }
    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new LocalStoreError(400, "আদায়ের পরিমাণ শূন্যের বেশি হতে হবে");
    }

    const amount = round2(amountInput);

    const { db, result } = mutateDb((draft) => {
      const customer = draft.customers.find((c) => c.id === customerId);
      if (!customer) {
        throw new LocalStoreError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
      }
      if (amount > customer.due) {
        throw new LocalStoreError(
          400,
          "আদায়ের পরিমাণ কাস্টমারের মোট বকেয়ার চেয়ে বেশি হতে পারবে না",
        );
      }

      customer.due = round2(customer.due - amount);

      let remaining = amount;
      let linkedInvoiceId: string | undefined;
      let linkedInvoiceNumber: string | undefined;

      if (invoiceId) {
        const target = draft.invoices.find(
          (inv) =>
            inv.id === invoiceId &&
            inv.customerId === customerId &&
            inv.due > 0,
        );
        if (target) {
          const apply = round2(Math.min(remaining, target.due));
          target.paid = round2(target.paid + apply);
          target.due = round2(target.total - target.paid);
          target.status =
            target.due === 0 ? "paid" : target.paid > 0 ? "partial" : "due";
          remaining = round2(remaining - apply);
          linkedInvoiceId = target.id;
          linkedInvoiceNumber = target.number;
        }
      }

      if (remaining > 0) {
        const openInvoices = draft.invoices
          .filter((inv) => inv.customerId === customerId && inv.due > 0)
          .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );

        for (const inv of openInvoices) {
          if (remaining <= 0) break;
          const apply = round2(Math.min(remaining, inv.due));
          inv.paid = round2(inv.paid + apply);
          inv.due = round2(inv.total - inv.paid);
          inv.status =
            inv.due === 0 ? "paid" : inv.paid > 0 ? "partial" : "due";
          remaining = round2(remaining - apply);
          if (!linkedInvoiceId) {
            linkedInvoiceId = inv.id;
            linkedInvoiceNumber = inv.number;
          }
        }
      }

      const nowIso = new Date().toISOString();
      const collection: DueCollection = {
        id: makeId("col"),
        receiptNo: nextSeqNumber(
          "COL",
          draft.collections.map((c) => c.receiptNo),
        ),
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

      draft.collections.unshift(collection);

      draft.ledger.unshift({
        id: makeId("led"),
        date: nowIso,
        party: customer.name,
        amount,
        direction: "in",
        kind: "collection",
        staffId: user.id,
        staffName: user.name,
        refId: collection.id,
        note: `${collection.receiptNo}${linkedInvoiceNumber ? ` · ${linkedInvoiceNumber}` : " · বকেয়া আদায়"}`,
      });

      return collection;
    });

    return {
      collection: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  createCustomer(
    token: string | null,
    body: {
      name: string;
      mobile: string;
      area?: string;
      openingDue?: number;
    },
  ): { customer: Customer; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mobile = normalizePhoneDigits(body.mobile);
    const area = typeof body.area === "string" ? body.area.trim() : "";
    const openingDueInput =
      body.openingDue === undefined ? 0 : parseNum(body.openingDue);

    if (!name) {
      throw new LocalStoreError(400, "কাস্টমারের নাম লিখুন");
    }
    if (mobile.length < 6) {
      throw new LocalStoreError(400, "সঠিক মোবাইল নম্বর দিন");
    }
    if (!Number.isFinite(openingDueInput) || openingDueInput < 0) {
      throw new LocalStoreError(400, "পূর্বের বকেয়ার পরিমাণ সঠিক নয়");
    }

    const openingDue = round2(openingDueInput);
    const { db, result } = mutateDb((draft) => {
      const customer: Customer = {
        id: makeId("cust"),
        name,
        mobile,
        area: area || "ঢাকা",
        openingDue,
        due: openingDue,
        createdAt: new Date().toISOString(),
      };
      draft.customers.unshift(customer);
      return customer;
    });

    return {
      customer: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  updateCustomer(
    token: string | null,
    customerId: string,
    body: { name?: string; mobile?: string; area?: string },
  ): { customer: Customer; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const { db, result } = mutateDb((draft) => {
      const customer = draft.customers.find((c) => c.id === customerId);
      if (!customer) {
        throw new LocalStoreError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
      }
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) {
          throw new LocalStoreError(400, "কাস্টমারের নাম খালি রাখা যাবে না");
        }
        customer.name = name;
      }
      if (body.mobile !== undefined) {
        const mobile = normalizePhoneDigits(body.mobile);
        if (mobile.length < 6) {
          throw new LocalStoreError(400, "সঠিক মোবাইল নম্বর দিন");
        }
        customer.mobile = mobile;
      }
      if (body.area !== undefined) {
        customer.area = String(body.area).trim() || customer.area;
      }

      for (const inv of draft.invoices) {
        if (inv.customerId === customer.id) {
          inv.customerName = customer.name;
          inv.customerMobile = customer.mobile;
        }
      }
      for (const col of draft.collections) {
        if (col.customerId === customer.id) {
          col.customerName = customer.name;
          col.customerMobile = customer.mobile;
        }
      }

      return customer;
    });

    return {
      customer: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  deleteCustomer(
    token: string | null,
    customerId: string,
  ): { bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const { db } = mutateDb((draft) => {
      const idx = draft.customers.findIndex((c) => c.id === customerId);
      if (idx === -1) {
        throw new LocalStoreError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
      }
      if (draft.customers[idx].due > 0) {
        throw new LocalStoreError(
          400,
          "বাকি বকেয়া থাকায় এই কাস্টমার মুছে ফেলা যাবে না",
        );
      }
      draft.customers.splice(idx, 1);
    });

    return { bootstrap: buildBootstrapPayload(db, user) };
  },

  createProduct(
    token: string | null,
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
  ): { product: Product; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
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

    if (!name) throw new LocalStoreError(400, "পণ্যের নাম লিখুন");
    if (!Number.isFinite(purchaseRate) || purchaseRate < 0) {
      throw new LocalStoreError(400, "সঠিক ক্রয় মূল্য দিন");
    }
    if (!Number.isFinite(saleRate) || saleRate <= 0) {
      throw new LocalStoreError(400, "বিক্রয় মূল্য শূন্যের বেশি হতে হবে");
    }
    if (!Number.isFinite(stock) || stock < 0) {
      throw new LocalStoreError(400, "স্টকের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(minStock) || minStock < 0) {
      throw new LocalStoreError(400, "সর্বনিম্ন স্টকের পরিমাণ সঠিক নয়");
    }

    const { db, result } = mutateDb((draft) => {
      const sku =
        skuInput ||
        nextSeqNumber(
          draft.settings?.invoicePrefix || "ABS",
          draft.products.map((p) => p.sku),
          1001,
          4,
        );
      const barcode =
        barcodeInput ||
        String(
          8942200200101 +
            draft.products.length +
            Math.floor(Math.random() * 900),
        );

      const product: StoredProduct = {
        id: makeId("prod"),
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
      draft.products.unshift(product);
      return product;
    });

    return {
      product: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  updateProduct(
    token: string | null,
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
  ): { product: Product; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const { db, result } = mutateDb((draft) => {
      const product = draft.products.find((p) => p.id === productId);
      if (!product) {
        throw new LocalStoreError(404, "পণ্য খুঁজে পাওয়া যায়নি");
      }

      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) throw new LocalStoreError(400, "পণ্যের নাম খালি রাখা যাবে না");
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
          throw new LocalStoreError(400, "সঠিক ক্রয় মূল্য দিন");
        }
        product.purchaseRate = round2(val);
      }
      if (body.saleRate !== undefined) {
        const val = parseNum(body.saleRate);
        if (!Number.isFinite(val) || val <= 0) {
          throw new LocalStoreError(400, "বিক্রয় মূল্য শূন্যের বেশি হতে হবে");
        }
        product.saleRate = round2(val);
      }
      if (body.stock !== undefined) {
        const val = parseNum(body.stock);
        if (
          !Number.isFinite(val) ||
          (val < 0 && !draft.settings?.allowNegativeStock)
        ) {
          throw new LocalStoreError(400, "স্টকের পরিমাণ সঠিক নয়");
        }
        product.stock = round2(val);
      }
      if (body.minStock !== undefined) {
        const val = parseNum(body.minStock);
        if (!Number.isFinite(val) || val < 0) {
          throw new LocalStoreError(400, "সর্বনিম্ন স্টকের পরিমাণ সঠিক নয়");
        }
        product.minStock = round2(val);
      }

      return product;
    });

    return {
      product: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  adjustStock(
    token: string | null,
    productId: string,
    body: { mode: "add" | "subtract" | "set"; qty: number },
  ): { product: Product; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const mode = typeof body.mode === "string" ? body.mode.trim() : "";
    const qty = parseNum(body.qty);

    if (!["add", "subtract", "set"].includes(mode)) {
      throw new LocalStoreError(400, "স্টক পরিবর্তনের ধরন সঠিক নয়");
    }
    if (!Number.isFinite(qty) || qty < 0) {
      throw new LocalStoreError(400, "স্টকের সঠিক পরিমাণ দিন");
    }

    const { db, result } = mutateDb((draft) => {
      const product = draft.products.find((p) => p.id === productId);
      if (!product) {
        throw new LocalStoreError(404, "পণ্য খুঁজে পাওয়া যায়নি");
      }

      let nextStock = product.stock;
      if (mode === "add") nextStock = round2(product.stock + qty);
      if (mode === "subtract") nextStock = round2(product.stock - qty);
      if (mode === "set") nextStock = round2(qty);

      if (nextStock < 0 && !draft.settings?.allowNegativeStock) {
        throw new LocalStoreError(400, "স্টক শূন্যের নিচে নামানো যাবে না");
      }

      product.stock = nextStock;
      return product;
    });

    return {
      product: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  deleteProduct(
    token: string | null,
    productId: string,
  ): { bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const { db } = mutateDb((draft) => {
      const idx = draft.products.findIndex((p) => p.id === productId);
      if (idx === -1) {
        throw new LocalStoreError(404, "পণ্য খুঁজে পাওয়া যায়নি");
      }
      draft.products.splice(idx, 1);
    });

    return { bootstrap: buildBootstrapPayload(db, user) };
  },

  createPurchase(
    token: string | null,
    body: {
      supplierId: string;
      items: Array<{ productId: string; qty: number; rate?: number }>;
      discount?: number;
      paid: number;
      note?: string;
    },
  ): { purchase: PurchaseInvoice; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const supplierId =
      typeof body.supplierId === "string" ? body.supplierId.trim() : "";
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const discountInput =
      body.discount === undefined ? 0 : parseNum(body.discount);
    const paidInput = body.paid === undefined ? 0 : parseNum(body.paid);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!supplierId) {
      throw new LocalStoreError(400, "সরবরাহকারী নির্বাচন করুন");
    }
    if (itemsInput.length === 0) {
      throw new LocalStoreError(400, "কমপক্ষে একটি পণ্য যোগ করুন");
    }
    if (!Number.isFinite(discountInput) || discountInput < 0) {
      throw new LocalStoreError(400, "ডিসকাউন্টের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(paidInput) || paidInput < 0) {
      throw new LocalStoreError(400, "নগদ পরিশোধের পরিমাণ সঠিক নয়");
    }

    const { db, result } = mutateDb((draft) => {
      const supplier = draft.suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        throw new LocalStoreError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
      }

      const productMap = new Map(draft.products.map((p) => [p.id, p]));
      const purchaseItems: InvoiceItem[] = [];

      for (const line of itemsInput) {
        const productId =
          typeof line?.productId === "string" ? line.productId.trim() : "";
        const qty = parseNum(line?.qty);
        if (!productId || !Number.isFinite(qty) || qty <= 0) {
          throw new LocalStoreError(400, "প্রতিটি পণ্যের সঠিক পরিমাণ দিন");
        }
        const product = productMap.get(productId);
        if (!product) {
          throw new LocalStoreError(400, "তালিকাভুক্ত পণ্য খুঁজে পাওয়া যায়নি");
        }

        let rate = product.purchaseRate;
        if (line.rate !== undefined && line.rate !== null) {
          const customRate = parseNum(line.rate);
          if (!Number.isFinite(customRate) || customRate < 0) {
            throw new LocalStoreError(
              400,
              `${product.name}-এর ক্রয় মূল্য সঠিক নয়`,
            );
          }
          rate = round2(customRate);
        }

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
        throw new LocalStoreError(
          400,
          "ডিসকাউন্ট মোট ক্রয় বিলের চেয়ে বেশি হতে পারবে না",
        );
      }

      const total = round2(subTotal - discount);
      const paid = round2(paidInput);
      if (paid > total) {
        throw new LocalStoreError(
          400,
          "নগদ পরিশোধ মোট ক্রয় বিলের চেয়ে বেশি হতে পারবে না",
        );
      }

      const due = round2(total - paid);
      const status: InvoiceStatus =
        due === 0 ? "paid" : paid > 0 ? "partial" : "due";

      for (const item of purchaseItems) {
        const product = productMap.get(item.productId)!;
        product.stock = round2(product.stock + item.qty);
      }

      const nowIso = new Date().toISOString();
      supplier.due = round2(supplier.due + due);
      supplier.lastTxn = formatDateBn(nowIso);

      const prefix = `PUR-${draft.settings?.invoicePrefix || "ABS"}`;
      const purchase: PurchaseInvoice = {
        id: makeId("pur"),
        number: nextSeqNumber(
          prefix,
          draft.purchases.map((p) => p.number),
        ),
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

      draft.purchases.unshift(purchase);

      if (paid > 0) {
        draft.ledger.unshift({
          id: makeId("led"),
          date: nowIso,
          party: supplier.name,
          amount: paid,
          direction: "out",
          kind: "purchase",
          staffId: user.id,
          staffName: user.name,
          refId: purchase.id,
          note: `ক্রয় চালান #${purchase.number} নগদ পরিশোধ`,
        });
      }

      return purchase;
    });

    return {
      purchase: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  createSupplier(
    token: string | null,
    body: { name: string; mobile: string; area?: string; due?: number },
  ): { supplier: Supplier; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mobile = normalizePhoneDigits(body.mobile);
    const area = typeof body.area === "string" ? body.area.trim() : "";
    const dueInput = body.due === undefined ? 0 : parseNum(body.due);

    if (!name) throw new LocalStoreError(400, "সরবরাহকারীর নাম লিখুন");
    if (mobile.length < 6) {
      throw new LocalStoreError(400, "সঠিক মোবাইল নম্বর দিন");
    }
    if (!Number.isFinite(dueInput) || dueInput < 0) {
      throw new LocalStoreError(400, "বকেয়ার পরিমাণ সঠিক নয়");
    }

    const due = round2(dueInput);
    const nowIso = new Date().toISOString();

    const { db, result } = mutateDb((draft) => {
      const supplier: Supplier = {
        id: makeId("sup"),
        name,
        mobile,
        area: area || "ঢাকা",
        due,
        lastTxn: due > 0 ? formatDateBn(nowIso) : "এখনো লেনদেন নেই",
      };
      draft.suppliers.unshift(supplier);
      return supplier;
    });

    return {
      supplier: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  updateSupplier(
    token: string | null,
    supplierId: string,
    body: { name?: string; mobile?: string; area?: string },
  ): { supplier: Supplier; bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const { db, result } = mutateDb((draft) => {
      const supplier = draft.suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        throw new LocalStoreError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
      }
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) {
          throw new LocalStoreError(400, "সরবরাহকারীর নাম খালি রাখা যাবে না");
        }
        supplier.name = name;
      }
      if (body.mobile !== undefined) {
        const mobile = normalizePhoneDigits(body.mobile);
        if (mobile.length < 6) {
          throw new LocalStoreError(400, "সঠিক মোবাইল নম্বর দিন");
        }
        supplier.mobile = mobile;
      }
      if (body.area !== undefined) {
        supplier.area = String(body.area).trim() || supplier.area;
      }

      for (const pur of draft.purchases) {
        if (pur.supplierId === supplier.id) {
          pur.supplierName = supplier.name;
          pur.supplierMobile = supplier.mobile;
        }
      }

      return supplier;
    });

    return {
      supplier: result,
      bootstrap: buildBootstrapPayload(db, user),
    };
  },

  paySupplier(
    token: string | null,
    supplierId: string,
    body: { amount: number; note?: string },
  ): { bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const amountInput = parseNum(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new LocalStoreError(400, "পরিশোধের পরিমাণ শূন্যের বেশি হতে হবে");
    }
    const amount = round2(amountInput);

    const { db } = mutateDb((draft) => {
      const supplier = draft.suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        throw new LocalStoreError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
      }
      if (amount > supplier.due) {
        throw new LocalStoreError(
          400,
          "পরিশোধের পরিমাণ সরবরাহকারীর বকেয়ার চেয়ে বেশি হতে পারবে না",
        );
      }

      const nowIso = new Date().toISOString();
      supplier.due = round2(supplier.due - amount);
      supplier.lastTxn = formatDateBn(nowIso);

      draft.ledger.unshift({
        id: makeId("led"),
        date: nowIso,
        party: supplier.name,
        amount,
        direction: "out",
        kind: "supplier_payment",
        staffId: user.id,
        staffName: user.name,
        refId: supplier.id,
        note: note || "সরবরাহকারীকে বকেয়া পরিশোধ",
      });
    });

    return { bootstrap: buildBootstrapPayload(db, user) };
  },

  createLedger(
    token: string | null,
    body: {
      party: string;
      amount: number;
      direction: "in" | "out";
      kind: "expense" | "adjustment";
      note?: string;
    },
  ): { bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const party = typeof body.party === "string" ? body.party.trim() : "";
    const amountInput = parseNum(body.amount);
    const direction =
      typeof body.direction === "string" ? body.direction.trim() : "";
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!party) throw new LocalStoreError(400, "খাত বা বিবরণের নাম লিখুন");
    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new LocalStoreError(400, "টাকার পরিমাণ শূন্যের বেশি হতে হবে");
    }
    if (direction !== "in" && direction !== "out") {
      throw new LocalStoreError(400, "লেনদেনের দিক সঠিক নয়");
    }
    if (kind !== "expense" && kind !== "adjustment") {
      throw new LocalStoreError(400, "লেনদেনের ধরন সঠিক নয়");
    }

    const amount = round2(amountInput);
    const { db } = mutateDb((draft) => {
      draft.ledger.unshift({
        id: makeId("led"),
        date: new Date().toISOString(),
        party,
        amount,
        direction,
        kind,
        staffId: user.id,
        staffName: user.name,
        ...(note ? { note } : {}),
      });
    });

    return { bootstrap: buildBootstrapPayload(db, user) };
  },

  getStaffReport(token: string | null, targetId: string): StaffDetailReport {
    const { user, db } = authenticate(token);
    requireAdmin(user);

    const perfList = computeStaffPerformance(db);
    const staffPerf = perfList.find((s) => s.id === targetId);
    if (!staffPerf) {
      throw new LocalStoreError(404, "স্টাফ খুঁজে পাওয়া যায়নি");
    }

    const invoices = db.invoices.filter((inv) => inv.staffId === targetId);
    const collections = db.collections.filter(
      (col) => col.staffId === targetId,
    );

    return {
      staff: staffPerf,
      invoices,
      collections,
    };
  },

  createStaff(
    token: string | null,
    body: { name: string; phone: string; password: string; note?: string },
  ): { bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = normalizePhoneDigits(body.phone);
    const password =
      typeof body.password === "string"
        ? body.password.trim()
        : String(body.password ?? "").trim();
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!name) throw new LocalStoreError(400, "স্টাফের নাম লিখুন");
    if (phone.length < 6) {
      throw new LocalStoreError(400, "সঠিক মোবাইল নম্বর দিন");
    }
    if (!password) throw new LocalStoreError(400, "পাসওয়ার্ড দিন");

    const { db } = mutateDb((draft) => {
      const duplicate = draft.users.some(
        (u) => normalizePhoneDigits(u.phone) === phone,
      );
      if (duplicate) {
        throw new LocalStoreError(
          400,
          "এই মোবাইল নম্বর দিয়ে ইতোমধ্যে একটি অ্যাকাউন্ট আছে",
        );
      }

      draft.users.push({
        id: makeId("usr-staff"),
        name,
        phone,
        password,
        role: "staff",
        active: true,
        ...(note ? { note } : {}),
        createdAt: new Date().toISOString(),
      });
    });

    return { bootstrap: buildBootstrapPayload(db, user) };
  },

  updateStaff(
    token: string | null,
    targetId: string,
    body: {
      name?: string;
      phone?: string;
      password?: string;
      active?: boolean;
      note?: string;
    },
  ): { bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    let deactivated = false;

    const { db } = mutateDb((draft) => {
      const target = draft.users.find((u) => u.id === targetId);
      if (!target) {
        throw new LocalStoreError(404, "স্টাফ খুঁজে পাওয়া যায়নি");
      }

      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) {
          throw new LocalStoreError(400, "স্টাফের নাম খালি রাখা যাবে না");
        }
        target.name = name;
        for (const inv of draft.invoices) {
          if (inv.staffId === target.id) inv.staffName = name;
        }
        for (const col of draft.collections) {
          if (col.staffId === target.id) col.staffName = name;
        }
        for (const entry of draft.ledger) {
          if (entry.staffId === target.id) entry.staffName = name;
        }
      }

      if (body.phone !== undefined) {
        const phone = normalizePhoneDigits(body.phone);
        if (phone.length < 6) {
          throw new LocalStoreError(400, "সঠিক মোবাইল নম্বর দিন");
        }
        const duplicate = draft.users.some(
          (u) => u.id !== target.id && normalizePhoneDigits(u.phone) === phone,
        );
        if (duplicate) {
          throw new LocalStoreError(
            400,
            "এই মোবাইল নম্বর অন্য অ্যাকাউন্টে ব্যবহৃত হচ্ছে",
          );
        }
        target.phone = phone;
      }

      if (body.active !== undefined) {
        const nextActive = Boolean(body.active);
        if (target.id === user.id && !nextActive) {
          throw new LocalStoreError(
            400,
            "নিজের অ্যাডমিন অ্যাকাউন্ট নিষ্ক্রিয় করা যাবে না",
          );
        }
        target.active = nextActive;
        if (!nextActive) {
          deactivated = true;
        }
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
          target.password = password;
        }
      }
    });

    if (deactivated) {
      const sessions = { ...readSessions() };
      for (const [tok, sess] of Object.entries(sessions)) {
        if (sess?.userId === targetId) {
          delete sessions[tok];
        }
      }
      writeSessions(sessions);
    }

    const updatedCurrentUser =
      db.users.find((u) => u.id === user.id) || user;
    return { bootstrap: buildBootstrapPayload(db, updatedCurrentUser) };
  },

  updateSettings(
    token: string | null,
    body: {
      store?: Partial<StoreProfile>;
      settings?: Partial<StoreSettings>;
      adminPassword?: string;
    },
  ): { bootstrap: BootstrapPayload } {
    const { user } = authenticate(token);
    requireAdmin(user);

    const { db } = mutateDb((draft) => {
      if (body.store && typeof body.store === "object") {
        const s = body.store;
        if (s.name !== undefined && String(s.name).trim()) {
          draft.store.name = String(s.name).trim();
        }
        if (s.subtitle !== undefined) {
          draft.store.subtitle = String(s.subtitle).trim();
        }
        if (s.address !== undefined) {
          draft.store.address = String(s.address).trim();
        }
        if (s.phone !== undefined) {
          const phone = normalizePhoneDigits(s.phone);
          if (phone) draft.store.phone = phone;
        }
        if (s.ownerName !== undefined) {
          draft.store.ownerName = String(s.ownerName).trim();
        }
        if (s.initials !== undefined && String(s.initials).trim()) {
          draft.store.initials = String(s.initials).trim();
        }
      }

      if (body.settings && typeof body.settings === "object") {
        const st = body.settings;
        if (
          st.invoicePrefix !== undefined &&
          String(st.invoicePrefix).trim()
        ) {
          draft.settings.invoicePrefix = String(st.invoicePrefix).trim();
        }
        if (st.invoiceFooter !== undefined) {
          draft.settings.invoiceFooter = String(st.invoiceFooter).trim();
        }
        if (st.allowNegativeStock !== undefined) {
          draft.settings.allowNegativeStock = Boolean(st.allowNegativeStock);
        }
      }

      if (body.adminPassword !== undefined) {
        const nextPass = String(body.adminPassword).trim();
        if (nextPass) {
          const adminRecord = draft.users.find((u) => u.id === user.id);
          if (adminRecord) {
            adminRecord.password = nextPass;
          }
        }
      }
    });

    const updatedAdmin = db.users.find((u) => u.id === user.id) || user;
    return { bootstrap: buildBootstrapPayload(db, updatedAdmin) };
  },

  exportBackupJson(token: string | null): string {
    const { user, db } = authenticate(token);
    requireAdmin(user);
    return JSON.stringify(db, null, 2);
  },
};
