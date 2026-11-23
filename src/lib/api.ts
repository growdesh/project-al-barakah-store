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

const TOKEN_KEY = "ab_auth_token";

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

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  const token = getStoredToken();
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

  const res = await fetch(path, {
    ...opts,
    headers,
    credentials: "include",
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errMsg =
      data &&
      typeof data === "object" &&
      "error" in data &&
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
  login(
    phone: string,
    password: string,
  ): Promise<{ token: string; user: AuthUser }> {
    return apiRequest<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    });
  },

  async logout(): Promise<void> {
    await apiRequest<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    });
  },

  me(): Promise<{ user: AuthUser }> {
    return apiRequest<{ user: AuthUser }>("/api/auth/me");
  },

  bootstrap(): Promise<BootstrapPayload> {
    return apiRequest<BootstrapPayload>("/api/bootstrap");
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
    );
  },

  createCollection(
    body: CollectionCreateInput,
  ): Promise<{ collection: DueCollection; bootstrap: BootstrapPayload }> {
    return apiRequest<{
      collection: DueCollection;
      bootstrap: BootstrapPayload;
    }>("/api/collections", {
      method: "POST",
      body: JSON.stringify(body),
    });
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
    );
  },

  deleteCustomer(id: string): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      `/api/customers/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
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
    );
  },

  deleteProduct(id: string): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>(
      `/api/products/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
  },

  createPurchase(
    body: PurchaseCreateInput,
  ): Promise<{ purchase: PurchaseInvoice; bootstrap: BootstrapPayload }> {
    return apiRequest<{
      purchase: PurchaseInvoice;
      bootstrap: BootstrapPayload;
    }>("/api/purchases", {
      method: "POST",
      body: JSON.stringify(body),
    });
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
    );
  },

  createLedger(body: {
    party: string;
    amount: number;
    direction: "in" | "out";
    kind: "expense" | "adjustment";
    note?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>("/api/ledger", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getStaffReport(id: string): Promise<StaffDetailReport> {
    return apiRequest<StaffDetailReport>(
      `/api/staff/${encodeURIComponent(id)}/report`,
    );
  },

  createStaff(body: {
    name: string;
    phone: string;
    password: string;
    note?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>("/api/staff", {
      method: "POST",
      body: JSON.stringify(body),
    });
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
    );
  },

  updateSettings(body: {
    store?: Partial<StoreProfile>;
    settings?: Partial<StoreSettings>;
    adminPassword?: string;
  }): Promise<{ bootstrap: BootstrapPayload }> {
    return apiRequest<{ bootstrap: BootstrapPayload }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  downloadBackupUrl(): string {
    return "/api/backup";
  },
};
