import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createSeedDb } from "./seed.mjs";

const BN_TO_EN = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

export function toEnDigits(value) {
  return String(value ?? "").replace(/[০-৯]/g, (d) => BN_TO_EN[d] ?? d);
}

export function normalizePhone(phone) {
  return toEnDigits(phone).replace(/\D/g, "");
}

export function getDataDir() {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), "data");
}

function getDbPath() {
  return path.join(getDataDir(), "db.json");
}

function getSessionsPath() {
  return path.join(getDataDir(), "sessions.json");
}

function createMutex() {
  let chain = Promise.resolve();
  return function runExclusive(fn) {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
}

const dbMutex = createMutex();
const sessionsMutex = createMutex();

async function atomicWriteJson(targetPath, data) {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${targetPath}.tmp.${process.pid}.${crypto.randomUUID()}`;
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, payload, "utf8");
  await fs.rename(tmpPath, targetPath);
}

async function readOrInitDbUnsafe() {
  const dbPath = getDbPath();
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      const seed = createSeedDb();
      await atomicWriteJson(dbPath, seed);
      return seed;
    }
    throw err;
  }
}

export function readDb() {
  return dbMutex(() => readOrInitDbUnsafe());
}

export function mutateDb(mutator) {
  return dbMutex(async () => {
    const current = await readOrInitDbUnsafe();
    const draft = structuredClone(current);
    const result = await mutator(draft);
    await atomicWriteJson(getDbPath(), draft);
    return { db: draft, result };
  });
}

async function readSessionsUnsafe() {
  const sessionsPath = getSessionsPath();
  try {
    const raw = await fs.readFile(sessionsPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

export function readSessions() {
  return sessionsMutex(() => readSessionsUnsafe());
}

export function mutateSessions(mutator) {
  return sessionsMutex(async () => {
    const current = await readSessionsUnsafe();
    const draft = structuredClone(current);
    const result = await mutator(draft);
    await atomicWriteJson(getSessionsPath(), draft);
    return { sessions: draft, result };
  });
}

export function sanitizeUser(user) {
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

export function sanitizeProductForRole(product, role) {
  if (role === "admin") return product;
  const { purchaseRate: _ignored, ...rest } = product;
  return rest;
}

export function sanitizeInvoiceForRole(invoice, role) {
  if (role === "admin") return invoice;
  return {
    ...invoice,
    items: (invoice.items || []).map(({ purchaseRate: _ignored, ...rest }) => rest),
  };
}

export function computeStaffPerformance(db) {
  const invoices = Array.isArray(db.invoices) ? db.invoices : [];
  const collections = Array.isArray(db.collections) ? db.collections : [];

  return (db.users || []).map((u) => {
    const userInvoices = invoices.filter((inv) => inv.staffId === u.id);
    const userCollections = collections.filter((col) => col.staffId === u.id);

    const salesCount = userInvoices.length;
    const totalSales = userInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
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
    const outstandingDue = userInvoices.reduce((sum, inv) => sum + Number(inv.due || 0), 0);

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

export function buildBootstrapPayload(db, user) {
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
    products: (db.products || []).map((p) => sanitizeProductForRole(p, "staff")),
    customers: db.customers || [],
    suppliers: [],
    invoices: (db.invoices || [])
      .filter((inv) => inv.staffId === user.id)
      .map((inv) => sanitizeInvoiceForRole(inv, "staff")),
    purchases: [],
    collections: (db.collections || []).filter((col) => col.staffId === user.id),
    ledger: (db.ledger || []).filter((entry) => entry.staffId === user.id),
    staff: staffPerf.filter((s) => s.id === user.id),
  };
}
