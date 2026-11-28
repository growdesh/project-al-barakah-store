import type {
  AuthUser,
  BootstrapPayload,
  Customer,
  DueCollection,
  Product,
  PurchaseInvoice,
  SaleInvoice,
  StaffDetailReport,
  StaffHandover,
  StoreProfile,
  StoreSettings,
  Supplier,
} from "../types";
import {
  StoreError,
  clearStoredUserId,
  firestoreStore,
  getStoredUserId,
  setStoredUserId,
} from "./firestoreStore";

export function getStoredToken(): string | null {
  return getStoredUserId();
}

export function setStoredToken(token: string): void {
  setStoredUserId(token);
}

export function clearStoredToken(): void {
  clearStoredUserId();
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function assertOnline(): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ApiError(
      503,
      "ইন্টারনেট সংযোগ নেই। এই সফটওয়্যারটি শুধুমাত্র অনলাইনে কাজ করে।",
    );
  }
}

async function runStore<T>(
  fn: () => Promise<T>,
  requireInternet = true,
): Promise<T> {
  if (requireInternet) {
    assertOnline();
  }
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StoreError) {
      throw new ApiError(err.status, err.message);
    }
    throw err;
  }
}

export interface SaleCreateInput {
  customerId: string;
  items: Array<{ productId: string; qty: number; rate?: number }>;
  discount?: number;
  paid: number;
  note?: string;
}

export interface CollectionCreateInput {
  customerId: string;
  amount: number;
  invoiceId?: string;
  note?: string;
}

export interface HandoverCreateInput {
  staffId: string;
  amount: number;
  note?: string;
}

export interface CustomerCreateInput {
  name: string;
  mobile: string;
  area?: string;
  openingDue?: number;
}

export interface CustomerUpdateInput {
  name?: string;
  mobile?: string;
  area?: string;
}

export interface ProductCreateInput {
  name: string;
  sku?: string;
  barcode?: string;
  category: string;
  unit: string;
  purchaseRate: number;
  saleRate: number;
  stock: number;
  minStock?: number;
}

export interface ProductUpdateInput {
  name?: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit?: string;
  purchaseRate?: number;
  saleRate?: number;
  stock?: number;
  minStock?: number;
}

export interface PurchaseCreateInput {
  supplierId: string;
  items: Array<{ productId: string; qty: number; rate?: number }>;
  discount?: number;
  paid: number;
  note?: string;
}

export interface SupplierCreateInput {
  name: string;
  mobile: string;
  area?: string;
  due?: number;
}

export interface SupplierUpdateInput {
  name?: string;
  mobile?: string;
  area?: string;
}

export const api = {
  login(
    phone: string,
    password: string,
  ): Promise<{ token: string; user: AuthUser }> {
    return runStore(() => firestoreStore.login(phone, password));
  },

  async logout(): Promise<void> {
    await runStore(() => firestoreStore.logout(), false);
  },

  me(): Promise<{ user: AuthUser }> {
    return runStore(() => firestoreStore.me(getStoredToken()));
  },

  bootstrap(): Promise<BootstrapPayload> {
    return runStore(() => firestoreStore.bootstrap(getStoredToken()));
  },

  subscribe(
    userId: string,
    onData: (payload: BootstrapPayload) => void,
    onAuthInvalid: (reason?: string) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return firestoreStore.subscribeToAppData(
      userId,
      onData,
      onAuthInvalid,
      onError,
    );
  },

  createSale(
    body: SaleCreateInput,
  ): Promise<{ invoice: SaleInvoice; bootstrap: BootstrapPayload }> {
    return runStore(() => firestoreStore.createSale(getStoredToken(), body));
  },

  createCollection(
    body: CollectionCreateInput,
  ): Promise<{ collection: DueCollection; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.createCollection(getStoredToken(), body),
    );
  },

  createHandover(
    body: HandoverCreateInput,
  ): Promise<{ handover: StaffHandover; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.createHandover(getStoredToken(), body),
    );
  },

  createCustomer(
    body: CustomerCreateInput,
  ): Promise<{ customer: Customer; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.createCustomer(getStoredToken(), body),
    );
  },

  updateCustomer(
    id: string,
    body: CustomerUpdateInput,
  ): Promise<{ customer: Customer; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.updateCustomer(getStoredToken(), id, body),
    );
  },

  deleteCustomer(id: string): Promise<{ bootstrap: BootstrapPayload }> {
    return runStore(() => firestoreStore.deleteCustomer(getStoredToken(), id));
  },

  createProduct(
    body: ProductCreateInput,
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    return runStore(() => firestoreStore.createProduct(getStoredToken(), body));
  },

  updateProduct(
    id: string,
    body: ProductUpdateInput,
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.updateProduct(getStoredToken(), id, body),
    );
  },

  adjustStock(
    id: string,
    body: { mode: "add" | "subtract" | "set"; qty: number },
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.adjustStock(getStoredToken(), id, body),
    );
  },

  deleteProduct(id: string): Promise<{ bootstrap: BootstrapPayload }> {
    return runStore(() => firestoreStore.deleteProduct(getStoredToken(), id));
  },

  createPurchase(
    body: PurchaseCreateInput,
  ): Promise<{ purchase: PurchaseInvoice; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.createPurchase(getStoredToken(), body),
    );
  },

  createSupplier(
    body: SupplierCreateInput,
  ): Promise<{ supplier: Supplier; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.createSupplier(getStoredToken(), body),
    );
  },

  updateSupplier(
    id: string,
    body: SupplierUpdateInput,
  ): Promise<{ supplier: Supplier; bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.updateSupplier(getStoredToken(), id, body),
    );
  },

  paySupplier(
    id: string,
    body: { amount: number; note?: string },
  ): Promise<{ bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.paySupplier(getStoredToken(), id, body),
    );
  },

  createLedger(body: {
    party: string;
    amount: number;
    direction: "in" | "out";
    kind: "expense" | "adjustment";
    note?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return runStore(() => firestoreStore.createLedger(getStoredToken(), body));
  },

  getStaffReport(id: string): Promise<StaffDetailReport> {
    return runStore(() => firestoreStore.getStaffReport(getStoredToken(), id));
  },

  createStaff(body: {
    name: string;
    phone: string;
    password: string;
    note?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return runStore(() => firestoreStore.createStaff(getStoredToken(), body));
  },

  updateStaff(
    id: string,
    body: {
      name?: string;
      phone?: string;
      password?: string;
      active?: boolean;
      note?: string;
    },
  ): Promise<{ bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.updateStaff(getStoredToken(), id, body),
    );
  },

  changeStaffPassword(
    id: string,
    newPassword: string,
  ): Promise<{ bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.changeStaffPassword(getStoredToken(), id, newPassword),
    );
  },

  changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
    return runStore(() =>
      firestoreStore.changeOwnPassword(
        getStoredToken(),
        oldPassword,
        newPassword,
      ),
    );
  },

  updateSettings(body: {
    store?: Partial<StoreProfile>;
    settings?: Partial<StoreSettings>;
    adminPassword?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return runStore(() =>
      firestoreStore.updateSettings(getStoredToken(), body),
    );
  },

  async downloadBackupBlob(): Promise<Blob> {
    const json = await runStore(() =>
      firestoreStore.exportBackupJson(getStoredToken()),
    );
    return new Blob([json], { type: "application/json;charset=utf-8" });
  },
};
