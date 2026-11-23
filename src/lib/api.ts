import type {
  AuthUser,
  BootstrapPayload,
  Customer,
  DueCollection,
  Product,
  PurchaseInvoice,
  SaleInvoice,
  StaffDetailReport,
  StoreProfile,
  StoreSettings,
  Supplier,
} from "../types";
import { LocalStoreError, localStore } from "./localStore";

const TOKEN_KEY = "ab_auth_token";

let staticModeDetected = false;
let liveServerConfirmed = false;

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage errors in restricted browsing modes.
  }
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function isLocalMode(): boolean {
  if (staticModeDetected) return true;
  const token = getStoredToken();
  return Boolean(token && token.startsWith("local-"));
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function runLocal<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LocalStoreError) {
      throw new ApiError(err.status, err.message);
    }
    throw err;
  }
}

export async function apiRequest<T>(
  path: string,
  opts: RequestInit = {},
  localFallback?: (token: string | null) => T,
): Promise<T> {
  const token = getStoredToken();

  if (localFallback && isLocalMode()) {
    return runLocal(() => localFallback(token));
  }

  const headers = new Headers(opts.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (
    opts.body !== undefined &&
    !(opts.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...opts,
      headers,
      credentials: "include",
    });
  } catch {
    if (localFallback && !liveServerConfirmed) {
      staticModeDetected = true;
      return runLocal(() => localFallback(token));
    }
    throw new ApiError(
      0,
      "সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।",
    );
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  let data: unknown = null;
  let parsedOk = false;
  if (text) {
    try {
      data = JSON.parse(text);
      parsedOk = true;
    } catch {
      data = null;
      parsedOk = false;
    }
  }

  const isJsonApiResponse =
    contentType.includes("application/json") &&
    parsedOk &&
    data !== null &&
    typeof data === "object";

  // Static hosting (e.g. Hostinger) serves HTML 404/405/index.html for /api/* instead of JSON.
  if (!isJsonApiResponse) {
    if (localFallback) {
      staticModeDetected = true;
      return runLocal(() => localFallback(token));
    }
    throw new ApiError(res.status || 500, "অনুরোধ ব্যর্থ হয়েছে");
  }

  liveServerConfirmed = true;

  if (!res.ok) {
    const errMsg =
      "error" in (data as Record<string, unknown>) &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "অনুরোধ ব্যর্থ হয়েছে";
    throw new ApiError(res.status, errMsg);
  }

  return data as T;
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
  isLocalMode,

  login(
    phone: string,
    password: string,
  ): Promise<{ token: string; user: AuthUser }> {
    return apiRequest<{ token: string; user: AuthUser }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      },
      () => localStore.login(phone, password),
    );
  },

  async logout(): Promise<void> {
    await apiRequest<{ ok: boolean }>(
      "/api/auth/logout",
      { method: "POST" },
      (token) => localStore.logout(token),
    );
  },

  me(): Promise<{ user: AuthUser }> {
    return apiRequest<{ user: AuthUser }>("/api/auth/me", {}, (token) =>
      localStore.me(token),
    );
  },

  bootstrap(): Promise<BootstrapPayload> {
    return apiRequest<BootstrapPayload>("/api/bootstrap", {}, (token) =>
      localStore.bootstrap(token),
    );
  },

  createSale(
    body: SaleCreateInput,
  ): Promise<{ invoice: SaleInvoice; bootstrap: BootstrapPayload }> {
    return apiRequest<{ invoice: SaleInvoice; bootstrap: BootstrapPayload }>(
      "/api/sales",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.createSale(token, body),
    );
  },

  createCollection(
    body: CollectionCreateInput,
  ): Promise<{ collection: DueCollection; bootstrap: BootstrapPayload }> {
    return apiRequest<{
      collection: DueCollection;
      bootstrap: BootstrapPayload;
    }>(
      "/api/collections",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.createCollection(token, body),
    );
  },

  createCustomer(
    body: CustomerCreateInput,
  ): Promise<{ customer: Customer; bootstrap: BootstrapPayload }> {
    return apiRequest<{ customer: Customer; bootstrap: BootstrapPayload }>(
      "/api/customers",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.createCustomer(token, body),
    );
  },

  updateCustomer(
    id: string,
    body: CustomerUpdateInput,
  ): Promise<{ customer: Customer; bootstrap: BootstrapPayload }> {
    return apiRequest<{ customer: Customer; bootstrap: BootstrapPayload }>(
      `/api/customers/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
      (token) => localStore.updateCustomer(token, id, body),
    );
  },

  deleteCustomer(id: string): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      `/api/customers/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      (token) => localStore.deleteCustomer(token, id),
    );
  },

  createProduct(
    body: ProductCreateInput,
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    return apiRequest<{ product: Product; bootstrap: BootstrapPayload }>(
      "/api/products",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.createProduct(token, body),
    );
  },

  updateProduct(
    id: string,
    body: ProductUpdateInput,
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    return apiRequest<{ product: Product; bootstrap: BootstrapPayload }>(
      `/api/products/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
      (token) => localStore.updateProduct(token, id, body),
    );
  },

  adjustStock(
    id: string,
    body: { mode: "add" | "subtract" | "set"; qty: number },
  ): Promise<{ product: Product; bootstrap: BootstrapPayload }> {
    return apiRequest<{ product: Product; bootstrap: BootstrapPayload }>(
      `/api/products/${encodeURIComponent(id)}/stock`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
      (token) => localStore.adjustStock(token, id, body),
    );
  },

  deleteProduct(id: string): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      `/api/products/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      (token) => localStore.deleteProduct(token, id),
    );
  },

  createPurchase(
    body: PurchaseCreateInput,
  ): Promise<{ purchase: PurchaseInvoice; bootstrap: BootstrapPayload }> {
    return apiRequest<{
      purchase: PurchaseInvoice;
      bootstrap: BootstrapPayload;
    }>(
      "/api/purchases",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.createPurchase(token, body),
    );
  },

  createSupplier(
    body: SupplierCreateInput,
  ): Promise<{ supplier: Supplier; bootstrap: BootstrapPayload }> {
    return apiRequest<{ supplier: Supplier; bootstrap: BootstrapPayload }>(
      "/api/suppliers",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.createSupplier(token, body),
    );
  },

  updateSupplier(
    id: string,
    body: SupplierUpdateInput,
  ): Promise<{ supplier: Supplier; bootstrap: BootstrapPayload }> {
    return apiRequest<{ supplier: Supplier; bootstrap: BootstrapPayload }>(
      `/api/suppliers/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
      (token) => localStore.updateSupplier(token, id, body),
    );
  },

  paySupplier(
    id: string,
    body: { amount: number; note?: string },
  ): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      `/api/suppliers/${encodeURIComponent(id)}/pay`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.paySupplier(token, id, body),
    );
  },

  createLedger(body: {
    party: string;
    amount: number;
    direction: "in" | "out";
    kind: "expense" | "adjustment";
    note?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      "/api/ledger",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.createLedger(token, body),
    );
  },

  getStaffReport(id: string): Promise<StaffDetailReport> {
    return apiRequest<StaffDetailReport>(
      `/api/staff/${encodeURIComponent(id)}/report`,
      {},
      (token) => localStore.getStaffReport(token, id),
    );
  },

  createStaff(body: {
    name: string;
    phone: string;
    password: string;
    note?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      "/api/staff",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      (token) => localStore.createStaff(token, body),
    );
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
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      `/api/staff/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
      (token) => localStore.updateStaff(token, id, body),
    );
  },

  updateSettings(body: {
    store?: Partial<StoreProfile>;
    settings?: Partial<StoreSettings>;
    adminPassword?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      "/api/settings",
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
      (token) => localStore.updateSettings(token, body),
    );
  },

  downloadBackupUrl(): string {
    return "/api/backup";
  },

  async downloadBackupBlob(): Promise<Blob> {
    const token = getStoredToken();
    if (isLocalMode()) {
      const json = runLocal(() => localStore.exportBackupJson(token));
      return new Blob([json], { type: "application/json;charset=utf-8" });
    }

    const headers = new Headers();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    try {
      const res = await fetch("/api/backup", {
        headers,
        credentials: "include",
      });
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (res.ok && contentType.includes("application/json")) {
        return await res.blob();
      }
      if (!contentType.includes("application/json")) {
        staticModeDetected = true;
        const json = runLocal(() => localStore.exportBackupJson(token));
        return new Blob([json], { type: "application/json;charset=utf-8" });
      }
    } catch {
      if (!liveServerConfirmed) {
        staticModeDetected = true;
        const json = runLocal(() => localStore.exportBackupJson(token));
        return new Blob([json], { type: "application/json;charset=utf-8" });
      }
    }
    throw new Error("ডাটা ব্যাকআপ ডাউনলোড ব্যর্থ হয়েছে");
  },
};
