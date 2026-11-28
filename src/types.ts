export type UserRole = "admin" | "staff";

export type InvoiceStatus = "paid" | "partial" | "due";

export type CashLedgerKind =
  | "sale"
  | "collection"
  | "purchase"
  | "supplier_payment"
  | "expense"
  | "adjustment"
  | "staff_handover";

export interface StoreProfile {
  name: string;
  subtitle: string;
  address: string;
  phone: string;
  ownerName: string;
  initials: string;
}

export interface StoreSettings {
  invoicePrefix: string;
  invoiceFooter: string;
  allowNegativeStock: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
  note?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  purchaseRate?: number;
  saleRate: number;
  stock: number;
  minStock: number;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  area: string;
  openingDue: number;
  due: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  mobile: string;
  area: string;
  due: number;
  lastTxn: string;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  purchaseRate?: number;
  total: number;
}

export interface SaleInvoice {
  id: string;
  number: string;
  date: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  staffId: string;
  staffName: string;
  items: InvoiceItem[];
  itemsCount: number;
  subTotal: number;
  discount: number;
  total: number;
  initialPaid: number;
  paid: number;
  due: number;
  status: InvoiceStatus;
  note?: string;
}

export interface PurchaseInvoice {
  id: string;
  number: string;
  date: string;
  supplierId: string;
  supplierName: string;
  supplierMobile: string;
  items: InvoiceItem[];
  itemsCount: number;
  subTotal: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  status: InvoiceStatus;
  note?: string;
}

export interface DueCollection {
  id: string;
  receiptNo: string;
  date: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  staffId: string;
  staffName: string;
  note?: string;
}

export interface CashLedgerEntry {
  id: string;
  date: string;
  party: string;
  amount: number;
  direction: "in" | "out";
  kind: CashLedgerKind;
  category?: string;
  staffId?: string;
  staffName?: string;
  refId?: string;
  note?: string;
}

export interface StaffHandover {
  id: string;
  staffId: string;
  staffName: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string;
  takenBy: string;
  takenByName?: string;
  createdAt: string;
}

export interface StaffPerformance {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
  note?: string;
  createdAt: string;
  salesCount: number;
  totalSales: number;
  saleCashReceived: number;
  dueCollectionCount: number;
  dueCashCollected: number;
  totalCashReceived: number;
  totalHandedOver: number;
  cashInHand: number;
  outstandingDue: number;
}

export interface StaffDetailReport {
  staff: StaffPerformance;
  invoices: SaleInvoice[];
  collections: DueCollection[];
  handovers: StaffHandover[];
}

export interface BootstrapPayload {
  user: AuthUser;
  store: StoreProfile;
  settings: StoreSettings;
  openingCash: number;
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  invoices: SaleInvoice[];
  purchases: PurchaseInvoice[];
  collections: DueCollection[];
  ledger: CashLedgerEntry[];
  handovers: StaffHandover[];
  staff: StaffPerformance[];
}
