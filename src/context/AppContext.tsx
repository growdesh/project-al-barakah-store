import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearStoredToken,
  setStoredToken,
  type CollectionCreateInput,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type ProductCreateInput,
  type ProductUpdateInput,
  type PurchaseCreateInput,
  type SaleCreateInput,
  type SupplierCreateInput,
  type SupplierUpdateInput,
} from "../lib/api";
import { normalizePhone } from "../lib/format";
import { navigate } from "../lib/router";
import type {
  AuthUser,
  BootstrapPayload,
  Customer,
  DueCollection,
  Product,
  PurchaseInvoice,
  SaleInvoice,
  StoreProfile,
  StoreSettings,
  Supplier,
} from "../types";

export interface AppContextValue {
  loading: boolean;
  data: BootstrapPayload | null;
  user: AuthUser | null;
  toastMessage: string | null;
  toast: (msg: string) => void;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<BootstrapPayload>;
  createSale: (input: SaleCreateInput) => Promise<SaleInvoice>;
  createCollection: (input: CollectionCreateInput) => Promise<DueCollection>;
  createCustomer: (input: CustomerCreateInput) => Promise<Customer>;
  updateCustomer: (id: string, input: CustomerUpdateInput) => Promise<Customer>;
  deleteCustomer: (id: string) => Promise<void>;
  createProduct: (input: ProductCreateInput) => Promise<Product>;
  updateProduct: (id: string, input: ProductUpdateInput) => Promise<Product>;
  adjustStock: (
    id: string,
    input: { mode: "add" | "subtract" | "set"; qty: number },
  ) => Promise<Product>;
  deleteProduct: (id: string) => Promise<void>;
  createPurchase: (input: PurchaseCreateInput) => Promise<PurchaseInvoice>;
  createSupplier: (input: SupplierCreateInput) => Promise<Supplier>;
  updateSupplier: (id: string, input: SupplierUpdateInput) => Promise<Supplier>;
  paySupplier: (
    id: string,
    input: { amount: number; note?: string },
  ) => Promise<void>;
  createLedger: (input: {
    party: string;
    amount: number;
    direction: "in" | "out";
    kind: "expense" | "adjustment";
    note?: string;
  }) => Promise<void>;
  createStaff: (input: {
    name: string;
    phone: string;
    password: string;
    note?: string;
  }) => Promise<void>;
  updateStaff: (
    id: string,
    input: {
      name?: string;
      phone?: string;
      password?: string;
      active?: boolean;
      note?: string;
    },
  ) => Promise<void>;
  updateSettings: (input: {
    store?: Partial<StoreProfile>;
    settings?: Partial<StoreSettings>;
    adminPassword?: string;
  }) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await api.bootstrap();
        if (active) {
          setData(payload);
        }
      } catch {
        clearStoredToken();
        if (active) {
          setData(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const res = await api.login(normalizePhone(phone), password);
    setStoredToken(res.token);
    try {
      const payload = await api.bootstrap();
      setData(payload);
    } catch (err) {
      clearStoredToken();
      setData(null);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout transport failures and clear local session state cleanly.
    } finally {
      clearStoredToken();
      setData(null);
      navigate("/", { replace: true });
    }
  }, []);

  const refresh = useCallback(async () => {
    const payload = await api.bootstrap();
    setData(payload);
    return payload;
  }, []);

  const createSale = useCallback(
    async (input: SaleCreateInput) => {
      const res = await api.createSale(input);
      setData(res.bootstrap);
      toast(`বিক্রয় সম্পন্ন হয়েছে (${res.invoice.number})`);
      return res.invoice;
    },
    [toast],
  );

  const createCollection = useCallback(
    async (input: CollectionCreateInput) => {
      const res = await api.createCollection(input);
      setData(res.bootstrap);
      toast(`বকেয়া আদায় সম্পন্ন (${res.collection.receiptNo})`);
      return res.collection;
    },
    [toast],
  );

  const createCustomer = useCallback(
    async (input: CustomerCreateInput) => {
      const res = await api.createCustomer(input);
      setData(res.bootstrap);
      toast(`নতুন কাস্টমার যোগ হয়েছে: ${res.customer.name}`);
      return res.customer;
    },
    [toast],
  );

  const updateCustomer = useCallback(
    async (id: string, input: CustomerUpdateInput) => {
      const res = await api.updateCustomer(id, input);
      setData(res.bootstrap);
      toast("কাস্টমার তথ্য আপডেট হয়েছে");
      return res.customer;
    },
    [toast],
  );

  const deleteCustomer = useCallback(
    async (id: string) => {
      const res = await api.deleteCustomer(id);
      setData(res.bootstrap);
      toast("কাস্টমার মুছে ফেলা হয়েছে");
    },
    [toast],
  );

  const createProduct = useCallback(
    async (input: ProductCreateInput) => {
      const res = await api.createProduct(input);
      setData(res.bootstrap);
      toast(`নতুন পণ্য যোগ হয়েছে: ${res.product.name}`);
      return res.product;
    },
    [toast],
  );

  const updateProduct = useCallback(
    async (id: string, input: ProductUpdateInput) => {
      const res = await api.updateProduct(id, input);
      setData(res.bootstrap);
      toast("পণ্যের তথ্য আপডেট হয়েছে");
      return res.product;
    },
    [toast],
  );

  const adjustStock = useCallback(
    async (
      id: string,
      input: { mode: "add" | "subtract" | "set"; qty: number },
    ) => {
      const res = await api.adjustStock(id, input);
      setData(res.bootstrap);
      toast("স্টক আপডেট হয়েছে");
      return res.product;
    },
    [toast],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const res = await api.deleteProduct(id);
      setData(res.bootstrap);
      toast("পণ্য মুছে ফেলা হয়েছে");
    },
    [toast],
  );

  const createPurchase = useCallback(
    async (input: PurchaseCreateInput) => {
      const res = await api.createPurchase(input);
      setData(res.bootstrap);
      toast(`ক্রয় সম্পন্ন হয়েছে (${res.purchase.number})`);
      return res.purchase;
    },
    [toast],
  );

  const createSupplier = useCallback(
    async (input: SupplierCreateInput) => {
      const res = await api.createSupplier(input);
      setData(res.bootstrap);
      toast(`নতুন সাপ্লায়ার যোগ হয়েছে: ${res.supplier.name}`);
      return res.supplier;
    },
    [toast],
  );

  const updateSupplier = useCallback(
    async (id: string, input: SupplierUpdateInput) => {
      const res = await api.updateSupplier(id, input);
      setData(res.bootstrap);
      toast("সাপ্লায়ার তথ্য আপডেট হয়েছে");
      return res.supplier;
    },
    [toast],
  );

  const paySupplier = useCallback(
    async (id: string, input: { amount: number; note?: string }) => {
      const res = await api.paySupplier(id, input);
      setData(res.bootstrap);
      toast("সাপ্লায়ার বকেয়া পরিশোধ সম্পন্ন");
    },
    [toast],
  );

  const createLedger = useCallback(
    async (input: {
      party: string;
      amount: number;
      direction: "in" | "out";
      kind: "expense" | "adjustment";
      note?: string;
    }) => {
      const res = await api.createLedger(input);
      setData(res.bootstrap);
      toast("হিসাবের এন্ট্রি সংরক্ষণ হয়েছে");
    },
    [toast],
  );

  const createStaff = useCallback(
    async (input: {
      name: string;
      phone: string;
      password: string;
      note?: string;
    }) => {
      const res = await api.createStaff(input);
      setData(res.bootstrap);
      toast("নতুন স্টাফ যোগ হয়েছে");
    },
    [toast],
  );

  const updateStaff = useCallback(
    async (
      id: string,
      input: {
        name?: string;
        phone?: string;
        password?: string;
        active?: boolean;
        note?: string;
      },
    ) => {
      const res = await api.updateStaff(id, input);
      setData(res.bootstrap);
      toast("স্টাফের তথ্য আপডেট হয়েছে");
    },
    [toast],
  );

  const updateSettings = useCallback(
    async (input: {
      store?: Partial<StoreProfile>;
      settings?: Partial<StoreSettings>;
      adminPassword?: string;
    }) => {
      const res = await api.updateSettings(input);
      setData(res.bootstrap);
      toast("সেটিংস সংরক্ষণ হয়েছে");
    },
    [toast],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      loading,
      data,
      user: data?.user ?? null,
      toastMessage,
      toast,
      login,
      logout,
      refresh,
      createSale,
      createCollection,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      createProduct,
      updateProduct,
      adjustStock,
      deleteProduct,
      createPurchase,
      createSupplier,
      updateSupplier,
      paySupplier,
      createLedger,
      createStaff,
      updateStaff,
      updateSettings,
    }),
    [
      loading,
      data,
      toastMessage,
      toast,
      login,
      logout,
      refresh,
      createSale,
      createCollection,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      createProduct,
      updateProduct,
      adjustStock,
      deleteProduct,
      createPurchase,
      createSupplier,
      updateSupplier,
      paySupplier,
      createLedger,
      createStaff,
      updateStaff,
      updateSettings,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used inside <AppProvider>");
  }
  return ctx;
}
