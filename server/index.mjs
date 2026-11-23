import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  buildBootstrapPayload,
  computeStaffPerformance,
  mutateDb,
  mutateSessions,
  normalizePhone,
  readDb,
  readSessions,
  sanitizeInvoiceForRole,
  sanitizeUser,
  toEnDigits,
} from "./db.mjs";
import { formatDateBn } from "./seed.mjs";

const PORT = Number(process.env.API_PORT || process.env.PORT || 3000);
const DIST_DIR = path.resolve(process.cwd(), "dist");
const SESSION_COOKIE = "ab_session";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const NOINDEX_HEADER = "noindex, nofollow, noarchive, nosnippet";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseNum(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = toEnDigits(value).trim();
    if (!trimmed) return Number.NaN;
    return Number(trimmed);
  }
  return Number.NaN;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function nextSeqNumber(prefix, existingNumbers, minStart = 101, padWidth = 4) {
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

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": NOINDEX_HEADER,
    ...extraHeaders,
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, "অনুরোধের তথ্য অনেক বড়");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HttpError(400, "সঠিক JSON তথ্য পাঠান");
    }
    return parsed;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "সঠিক JSON তথ্য পাঠান");
  }
}

async function authenticate(req) {
  const token = extractToken(req);
  if (!token) {
    throw new HttpError(401, "লগইন করা প্রয়োজন");
  }

  const sessions = await readSessions();
  const session = sessions[token];
  if (!session || !session.userId) {
    throw new HttpError(401, "সেশন মেয়াদ শেষ হয়েছে, অনুগ্রহ করে আবার লগইন করুন");
  }

  const db = await readDb();
  const user = (db.users || []).find((u) => u.id === session.userId);
  if (!user) {
    await mutateSessions((draft) => {
      delete draft[token];
    });
    throw new HttpError(401, "ব্যবহারকারী খুঁজে পাওয়া যায়নি, আবার লগইন করুন");
  }

  if (!user.active) {
    await mutateSessions((draft) => {
      delete draft[token];
    });
    throw new HttpError(403, "আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।");
  }

  return { token, user, db };
}

function requireAdmin(user) {
  if (user.role !== "admin") {
    throw new HttpError(403, "এই কাজের অনুমতি শুধুমাত্র অ্যাডমিনের জন্য");
  }
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 404, { error: "রিসোর্স পাওয়া যায়নি" });
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: "অবৈধ ঠিকানা" });
    return;
  }

  const relPath = decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(DIST_DIR, relPath || "index.html");
  if (!candidate.startsWith(DIST_DIR + path.sep) && candidate !== DIST_DIR) {
    sendJson(res, 403, { error: "অনুমতি নেই" });
    return;
  }

  async function trySendFile(filePath, isFallbackHtml = false) {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return false;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const isImmutable =
        !isFallbackHtml &&
        (relPath.startsWith("assets/") || relPath.startsWith("fonts/"));
      const data = req.method === "HEAD" ? null : await fs.readFile(filePath);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Cache-Control": isImmutable ? "public, max-age=31536000, immutable" : "no-cache",
        "X-Robots-Tag": NOINDEX_HEADER,
      });
      res.end(data);
      return true;
    } catch {
      return false;
    }
  }

  if (relPath && (await trySendFile(candidate))) {
    return;
  }

  const indexFile = path.join(DIST_DIR, "index.html");
  if (await trySendFile(indexFile, true)) {
    return;
  }

  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Robots-Tag": NOINDEX_HEADER,
  });
  res.end("Frontend build (dist/) পাওয়া যায়নি। ডেভেলপমেন্ট মোডে Vite সার্ভার ব্যবহার করুন।");
}

async function handleApi(req, res, pathname) {
  const method = req.method || "GET";

  // Health
  if (method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true });
  }

  // Auth: Login
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    const phone = normalizePhone(body.phone);
    const rawPassword = typeof body.password === "string" ? body.password : String(body.password ?? "");

    if (!phone || !rawPassword) {
      throw new HttpError(400, "মোবাইল নম্বর এবং পাসওয়ার্ড দিন");
    }

    const db = await readDb();
    const user = (db.users || []).find((u) => normalizePhone(u.phone) === phone);
    if (!user) {
      throw new HttpError(401, "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়");
    }

    const passwordMatches =
      user.password === rawPassword || user.password === toEnDigits(rawPassword);
    if (!passwordMatches) {
      throw new HttpError(401, "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়");
    }

    if (!user.active) {
      throw new HttpError(403, "এই অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।");
    }

    const token = crypto.randomBytes(32).toString("hex");
    await mutateSessions((sessions) => {
      sessions[token] = {
        userId: user.id,
        createdAt: new Date().toISOString(),
      };
    });

    return sendJson(
      res,
      200,
      { token, user: sanitizeUser(user) },
      {
        "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`,
      },
    );
  }

  // Auth: Logout
  if (method === "POST" && pathname === "/api/auth/logout") {
    const token = extractToken(req);
    if (token) {
      await mutateSessions((sessions) => {
        delete sessions[token];
      });
    }
    return sendJson(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
      },
    );
  }

  // Protected routes below
  const { user, db: currentDb } = await authenticate(req);

  // Auth: Me
  if (method === "GET" && pathname === "/api/auth/me") {
    return sendJson(res, 200, { user: sanitizeUser(user) });
  }

  // Bootstrap
  if (method === "GET" && pathname === "/api/bootstrap") {
    return sendJson(res, 200, buildBootstrapPayload(currentDb, user));
  }

  // Sales (Admin & Staff)
  if (method === "POST" && pathname === "/api/sales") {
    const body = await readJsonBody(req);
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const discountInput = body.discount === undefined ? 0 : parseNum(body.discount);
    const paidInput = body.paid === undefined ? 0 : parseNum(body.paid);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!customerId) {
      throw new HttpError(400, "কাস্টমার নির্বাচন করুন");
    }
    if (itemsInput.length === 0) {
      throw new HttpError(400, "কমপক্ষে একটি পণ্য যোগ করুন");
    }
    if (!Number.isFinite(discountInput) || discountInput < 0) {
      throw new HttpError(400, "ডিসকাউন্টের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(paidInput) || paidInput < 0) {
      throw new HttpError(400, "নগদ জমার পরিমাণ সঠিক নয়");
    }

    const { db, result } = await mutateDb((draft) => {
      const productMap = new Map(draft.products.map((p) => [p.id, p]));
      const requestedQtyByProduct = new Map();
      const invoiceItems = [];

      for (const line of itemsInput) {
        const productId = typeof line?.productId === "string" ? line.productId.trim() : "";
        const qty = parseNum(line?.qty);
        if (!productId || !Number.isFinite(qty) || qty <= 0) {
          throw new HttpError(400, "প্রতিটি পণ্যের সঠিক পরিমাণ দিন");
        }
        const product = productMap.get(productId);
        if (!product) {
          throw new HttpError(400, "তালিকাভুক্ত পণ্য খুঁজে পাওয়া যায়নি");
        }

        let rate = product.saleRate;
        if (line.rate !== undefined && line.rate !== null && line.rate !== "") {
          const customRate = parseNum(line.rate);
          if (!Number.isFinite(customRate) || customRate <= 0) {
            throw new HttpError(400, `${product.name}-এর বিক্রয় মূল্য সঠিক নয়`);
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
          const product = productMap.get(productId);
          if (totalQty > product.stock) {
            throw new HttpError(
              400,
              `${product.name}-এর পর্যাপ্ত স্টক নেই (মজুদ: ${product.stock} ${product.unit})`,
            );
          }
        }
      }

      const subTotal = round2(invoiceItems.reduce((sum, item) => sum + item.total, 0));
      const discount = round2(discountInput);
      if (discount > subTotal) {
        throw new HttpError(400, "ডিসকাউন্ট মোট বিলের চেয়ে বেশি হতে পারবে না");
      }

      const total = round2(subTotal - discount);
      const paid = round2(paidInput);
      if (paid > total) {
        throw new HttpError(400, "নগদ জমা মোট বিলের চেয়ে বেশি হতে পারবে না");
      }

      const due = round2(total - paid);
      const status = due === 0 ? "paid" : paid > 0 ? "partial" : "due";

      let customerName = "নগদ কাস্টমার";
      let customerMobile = "";

      if (customerId === "walk-in") {
        if (due > 0) {
          throw new HttpError(400, "বাকিতে বিক্রির জন্য একজন নিবন্ধিত কাস্টমার নির্বাচন করুন");
        }
      } else {
        const customer = draft.customers.find((c) => c.id === customerId);
        if (!customer) {
          throw new HttpError(400, "নির্বাচিত কাস্টমার খুঁজে পাওয়া যায়নি");
        }
        customerName = customer.name;
        customerMobile = customer.mobile;
        customer.due = round2(customer.due + due);
      }

      for (const [productId, totalQty] of requestedQtyByProduct.entries()) {
        const product = productMap.get(productId);
        product.stock = round2(product.stock - totalQty);
      }

      const nowIso = new Date().toISOString();
      const prefix = draft.settings?.invoicePrefix || "ABS";
      const invoice = {
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

    return sendJson(res, 201, {
      invoice: sanitizeInvoiceForRole(result, user.role),
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Due Collections (Admin & Staff)
  if (method === "POST" && pathname === "/api/collections") {
    const body = await readJsonBody(req);
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
    const amountInput = parseNum(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!customerId) {
      throw new HttpError(400, "কাস্টমার নির্বাচন করুন");
    }
    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new HttpError(400, "আদায়ের পরিমাণ শূন্যের বেশি হতে হবে");
    }

    const amount = round2(amountInput);

    const { db, result } = await mutateDb((draft) => {
      const customer = draft.customers.find((c) => c.id === customerId);
      if (!customer) {
        throw new HttpError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
      }
      if (amount > customer.due) {
        throw new HttpError(
          400,
          "আদায়ের পরিমাণ কাস্টমারের মোট বকেয়ার চেয়ে বেশি হতে পারবে না",
        );
      }

      customer.due = round2(customer.due - amount);

      let remaining = amount;
      let linkedInvoiceId;
      let linkedInvoiceNumber;

      if (invoiceId) {
        const target = draft.invoices.find(
          (inv) => inv.id === invoiceId && inv.customerId === customerId && inv.due > 0,
        );
        if (target) {
          const apply = round2(Math.min(remaining, target.due));
          target.paid = round2(target.paid + apply);
          target.due = round2(target.total - target.paid);
          target.status = target.due === 0 ? "paid" : target.paid > 0 ? "partial" : "due";
          remaining = round2(remaining - apply);
          linkedInvoiceId = target.id;
          linkedInvoiceNumber = target.number;
        }
      }

      if (remaining > 0) {
        const openInvoices = draft.invoices
          .filter((inv) => inv.customerId === customerId && inv.due > 0)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (const inv of openInvoices) {
          if (remaining <= 0) break;
          const apply = round2(Math.min(remaining, inv.due));
          inv.paid = round2(inv.paid + apply);
          inv.due = round2(inv.total - inv.paid);
          inv.status = inv.due === 0 ? "paid" : inv.paid > 0 ? "partial" : "due";
          remaining = round2(remaining - apply);
          if (!linkedInvoiceId) {
            linkedInvoiceId = inv.id;
            linkedInvoiceNumber = inv.number;
          }
        }
      }

      const nowIso = new Date().toISOString();
      const collection = {
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

    return sendJson(res, 201, {
      collection: result,
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Customers: Create (Admin & Staff)
  if (method === "POST" && pathname === "/api/customers") {
    const body = await readJsonBody(req);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mobile = normalizePhone(body.mobile);
    const area = typeof body.area === "string" ? body.area.trim() : "";
    const openingDueInput = body.openingDue === undefined ? 0 : parseNum(body.openingDue);

    if (!name) {
      throw new HttpError(400, "কাস্টমারের নাম লিখুন");
    }
    if (mobile.length < 6) {
      throw new HttpError(400, "সঠিক মোবাইল নম্বর দিন");
    }
    if (!Number.isFinite(openingDueInput) || openingDueInput < 0) {
      throw new HttpError(400, "পূর্বের বকেয়ার পরিমাণ সঠিক নয়");
    }

    const openingDue = round2(openingDueInput);
    const { db, result } = await mutateDb((draft) => {
      const customer = {
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

    return sendJson(res, 201, {
      customer: result,
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Customers: Update & Delete (Admin only)
  const customerMatch = pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch) {
    const customerId = decodeURIComponent(customerMatch[1]);

    if (method === "PUT") {
      requireAdmin(user);
      const body = await readJsonBody(req);
      const { db, result } = await mutateDb((draft) => {
        const customer = draft.customers.find((c) => c.id === customerId);
        if (!customer) {
          throw new HttpError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
        }
        if (body.name !== undefined) {
          const name = String(body.name).trim();
          if (!name) throw new HttpError(400, "কাস্টমারের নাম খালি রাখা যাবে না");
          customer.name = name;
        }
        if (body.mobile !== undefined) {
          const mobile = normalizePhone(body.mobile);
          if (mobile.length < 6) throw new HttpError(400, "সঠিক মোবাইল নম্বর দিন");
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

      return sendJson(res, 200, {
        customer: result,
        bootstrap: buildBootstrapPayload(db, user),
      });
    }

    if (method === "DELETE") {
      requireAdmin(user);
      const { db } = await mutateDb((draft) => {
        const idx = draft.customers.findIndex((c) => c.id === customerId);
        if (idx === -1) {
          throw new HttpError(404, "কাস্টমার খুঁজে পাওয়া যায়নি");
        }
        if (draft.customers[idx].due > 0) {
          throw new HttpError(400, "বাকি বকেয়া থাকায় এই কাস্টমার মুছে ফেলা যাবে না");
        }
        draft.customers.splice(idx, 1);
      });

      return sendJson(res, 200, {
        bootstrap: buildBootstrapPayload(db, user),
      });
    }
  }

  // Products: Create (Admin only)
  if (method === "POST" && pathname === "/api/products") {
    requireAdmin(user);
    const body = await readJsonBody(req);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const skuInput = typeof body.sku === "string" ? body.sku.trim() : "";
    const barcodeInput = typeof body.barcode === "string" ? body.barcode.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const unit = typeof body.unit === "string" ? body.unit.trim() : "";
    const purchaseRate = parseNum(body.purchaseRate);
    const saleRate = parseNum(body.saleRate);
    const stock = body.stock === undefined ? 0 : parseNum(body.stock);
    const minStock = body.minStock === undefined ? 10 : parseNum(body.minStock);

    if (!name) {
      throw new HttpError(400, "পণ্যের নাম লিখুন");
    }
    if (!Number.isFinite(purchaseRate) || purchaseRate < 0) {
      throw new HttpError(400, "সঠিক ক্রয় মূল্য দিন");
    }
    if (!Number.isFinite(saleRate) || saleRate <= 0) {
      throw new HttpError(400, "বিক্রয় মূল্য শূন্যের বেশি হতে হবে");
    }
    if (!Number.isFinite(stock) || stock < 0) {
      throw new HttpError(400, "স্টকের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(minStock) || minStock < 0) {
      throw new HttpError(400, "সর্বনিম্ন স্টকের পরিমাণ সঠিক নয়");
    }

    const { db, result } = await mutateDb((draft) => {
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
        String(8942200200101 + draft.products.length + Math.floor(Math.random() * 900));

      const product = {
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

    return sendJson(res, 201, {
      product: result,
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Products: Stock Patch (Admin only)
  const productStockMatch = pathname.match(/^\/api\/products\/([^/]+)\/stock$/);
  if (method === "PATCH" && productStockMatch) {
    requireAdmin(user);
    const productId = decodeURIComponent(productStockMatch[1]);
    const body = await readJsonBody(req);
    const mode = typeof body.mode === "string" ? body.mode.trim() : "";
    const qty = parseNum(body.qty);

    if (!["add", "subtract", "set"].includes(mode)) {
      throw new HttpError(400, "স্টক পরিবর্তনের ধরন সঠিক নয়");
    }
    if (!Number.isFinite(qty) || qty < 0) {
      throw new HttpError(400, "স্টকের সঠিক পরিমাণ দিন");
    }

    const { db, result } = await mutateDb((draft) => {
      const product = draft.products.find((p) => p.id === productId);
      if (!product) {
        throw new HttpError(404, "পণ্য খুঁজে পাওয়া যায়নি");
      }

      let nextStock = product.stock;
      if (mode === "add") nextStock = round2(product.stock + qty);
      if (mode === "subtract") nextStock = round2(product.stock - qty);
      if (mode === "set") nextStock = round2(qty);

      if (nextStock < 0 && !draft.settings?.allowNegativeStock) {
        throw new HttpError(400, "স্টক শূন্যের নিচে নামানো যাবে না");
      }

      product.stock = nextStock;
      return product;
    });

    return sendJson(res, 200, {
      product: result,
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Products: Update & Delete (Admin only)
  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch) {
    const productId = decodeURIComponent(productMatch[1]);

    if (method === "PUT") {
      requireAdmin(user);
      const body = await readJsonBody(req);
      const { db, result } = await mutateDb((draft) => {
        const product = draft.products.find((p) => p.id === productId);
        if (!product) {
          throw new HttpError(404, "পণ্য খুঁজে পাওয়া যায়নি");
        }

        if (body.name !== undefined) {
          const name = String(body.name).trim();
          if (!name) throw new HttpError(400, "পণ্যের নাম খালি রাখা যাবে না");
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
          if (!Number.isFinite(val) || val < 0) throw new HttpError(400, "সঠিক ক্রয় মূল্য দিন");
          product.purchaseRate = round2(val);
        }
        if (body.saleRate !== undefined) {
          const val = parseNum(body.saleRate);
          if (!Number.isFinite(val) || val <= 0) {
            throw new HttpError(400, "বিক্রয় মূল্য শূন্যের বেশি হতে হবে");
          }
          product.saleRate = round2(val);
        }
        if (body.stock !== undefined) {
          const val = parseNum(body.stock);
          if (!Number.isFinite(val) || (val < 0 && !draft.settings?.allowNegativeStock)) {
            throw new HttpError(400, "স্টকের পরিমাণ সঠিক নয়");
          }
          product.stock = round2(val);
        }
        if (body.minStock !== undefined) {
          const val = parseNum(body.minStock);
          if (!Number.isFinite(val) || val < 0) {
            throw new HttpError(400, "সর্বনিম্ন স্টকের পরিমাণ সঠিক নয়");
          }
          product.minStock = round2(val);
        }

        return product;
      });

      return sendJson(res, 200, {
        product: result,
        bootstrap: buildBootstrapPayload(db, user),
      });
    }

    if (method === "DELETE") {
      requireAdmin(user);
      const { db } = await mutateDb((draft) => {
        const idx = draft.products.findIndex((p) => p.id === productId);
        if (idx === -1) {
          throw new HttpError(404, "পণ্য খুঁজে পাওয়া যায়নি");
        }
        draft.products.splice(idx, 1);
      });

      return sendJson(res, 200, {
        bootstrap: buildBootstrapPayload(db, user),
      });
    }
  }

  // Purchases (Admin only)
  if (method === "POST" && pathname === "/api/purchases") {
    requireAdmin(user);
    const body = await readJsonBody(req);
    const supplierId = typeof body.supplierId === "string" ? body.supplierId.trim() : "";
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const discountInput = body.discount === undefined ? 0 : parseNum(body.discount);
    const paidInput = body.paid === undefined ? 0 : parseNum(body.paid);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!supplierId) {
      throw new HttpError(400, "সরবরাহকারী নির্বাচন করুন");
    }
    if (itemsInput.length === 0) {
      throw new HttpError(400, "কমপক্ষে একটি পণ্য যোগ করুন");
    }
    if (!Number.isFinite(discountInput) || discountInput < 0) {
      throw new HttpError(400, "ডিসকাউন্টের পরিমাণ সঠিক নয়");
    }
    if (!Number.isFinite(paidInput) || paidInput < 0) {
      throw new HttpError(400, "নগদ পরিশোধের পরিমাণ সঠিক নয়");
    }

    const { db, result } = await mutateDb((draft) => {
      const supplier = draft.suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        throw new HttpError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
      }

      const productMap = new Map(draft.products.map((p) => [p.id, p]));
      const purchaseItems = [];

      for (const line of itemsInput) {
        const productId = typeof line?.productId === "string" ? line.productId.trim() : "";
        const qty = parseNum(line?.qty);
        if (!productId || !Number.isFinite(qty) || qty <= 0) {
          throw new HttpError(400, "প্রতিটি পণ্যের সঠিক পরিমাণ দিন");
        }
        const product = productMap.get(productId);
        if (!product) {
          throw new HttpError(400, "তালিকাভুক্ত পণ্য খুঁজে পাওয়া যায়নি");
        }

        let rate = product.purchaseRate;
        if (line.rate !== undefined && line.rate !== null && line.rate !== "") {
          const customRate = parseNum(line.rate);
          if (!Number.isFinite(customRate) || customRate < 0) {
            throw new HttpError(400, `${product.name}-এর ক্রয় মূল্য সঠিক নয়`);
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

      const subTotal = round2(purchaseItems.reduce((sum, i) => sum + i.total, 0));
      const discount = round2(discountInput);
      if (discount > subTotal) {
        throw new HttpError(400, "ডিসকাউন্ট মোট ক্রয় বিলের চেয়ে বেশি হতে পারবে না");
      }

      const total = round2(subTotal - discount);
      const paid = round2(paidInput);
      if (paid > total) {
        throw new HttpError(400, "নগদ পরিশোধ মোট ক্রয় বিলের চেয়ে বেশি হতে পারবে না");
      }

      const due = round2(total - paid);
      const status = due === 0 ? "paid" : paid > 0 ? "partial" : "due";

      for (const item of purchaseItems) {
        const product = productMap.get(item.productId);
        product.stock = round2(product.stock + item.qty);
      }

      const nowIso = new Date().toISOString();
      supplier.due = round2(supplier.due + due);
      supplier.lastTxn = formatDateBn(nowIso);

      const prefix = `PUR-${draft.settings?.invoicePrefix || "ABS"}`;
      const purchase = {
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

    return sendJson(res, 201, {
      purchase: result,
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Suppliers: Create (Admin only)
  if (method === "POST" && pathname === "/api/suppliers") {
    requireAdmin(user);
    const body = await readJsonBody(req);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mobile = normalizePhone(body.mobile);
    const area = typeof body.area === "string" ? body.area.trim() : "";
    const dueInput = body.due === undefined ? 0 : parseNum(body.due);

    if (!name) {
      throw new HttpError(400, "সরবরাহকারীর নাম লিখুন");
    }
    if (mobile.length < 6) {
      throw new HttpError(400, "সঠিক মোবাইল নম্বর দিন");
    }
    if (!Number.isFinite(dueInput) || dueInput < 0) {
      throw new HttpError(400, "বকেয়ার পরিমাণ সঠিক নয়");
    }

    const due = round2(dueInput);
    const nowIso = new Date().toISOString();

    const { db, result } = await mutateDb((draft) => {
      const supplier = {
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

    return sendJson(res, 201, {
      supplier: result,
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Suppliers: Pay Due (Admin only)
  const supplierPayMatch = pathname.match(/^\/api\/suppliers\/([^/]+)\/pay$/);
  if (method === "POST" && supplierPayMatch) {
    requireAdmin(user);
    const supplierId = decodeURIComponent(supplierPayMatch[1]);
    const body = await readJsonBody(req);
    const amountInput = parseNum(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new HttpError(400, "পরিশোধের পরিমাণ শূন্যের বেশি হতে হবে");
    }
    const amount = round2(amountInput);

    const { db } = await mutateDb((draft) => {
      const supplier = draft.suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        throw new HttpError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
      }
      if (amount > supplier.due) {
        throw new HttpError(
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

    return sendJson(res, 200, {
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Suppliers: Update (Admin only)
  const supplierMatch = pathname.match(/^\/api\/suppliers\/([^/]+)$/);
  if (method === "PUT" && supplierMatch) {
    requireAdmin(user);
    const supplierId = decodeURIComponent(supplierMatch[1]);
    const body = await readJsonBody(req);

    const { db, result } = await mutateDb((draft) => {
      const supplier = draft.suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        throw new HttpError(404, "সরবরাহকারী খুঁজে পাওয়া যায়নি");
      }
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) throw new HttpError(400, "সরবরাহকারীর নাম খালি রাখা যাবে না");
        supplier.name = name;
      }
      if (body.mobile !== undefined) {
        const mobile = normalizePhone(body.mobile);
        if (mobile.length < 6) throw new HttpError(400, "সঠিক মোবাইল নম্বর দিন");
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

    return sendJson(res, 200, {
      supplier: result,
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Cash Ledger: Expense / Adjustment (Admin only)
  if (method === "POST" && pathname === "/api/ledger") {
    requireAdmin(user);
    const body = await readJsonBody(req);
    const party = typeof body.party === "string" ? body.party.trim() : "";
    const amountInput = parseNum(body.amount);
    const direction = typeof body.direction === "string" ? body.direction.trim() : "";
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!party) {
      throw new HttpError(400, "খাত বা বিবরণের নাম লিখুন");
    }
    if (!Number.isFinite(amountInput) || amountInput <= 0) {
      throw new HttpError(400, "টাকার পরিমাণ শূন্যের বেশি হতে হবে");
    }
    if (!["in", "out"].includes(direction)) {
      throw new HttpError(400, "লেনদেনের দিক সঠিক নয়");
    }
    if (!["expense", "adjustment"].includes(kind)) {
      throw new HttpError(400, "লেনদেনের ধরন সঠিক নয়");
    }

    const amount = round2(amountInput);
    const { db } = await mutateDb((draft) => {
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

    return sendJson(res, 201, {
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Staff: List (Admin only)
  if (method === "GET" && pathname === "/api/staff") {
    requireAdmin(user);
    return sendJson(res, 200, {
      staff: computeStaffPerformance(currentDb),
    });
  }

  // Staff Detail Report (Admin only)
  const staffReportMatch = pathname.match(/^\/api\/staff\/([^/]+)\/report$/);
  if (method === "GET" && staffReportMatch) {
    requireAdmin(user);
    const targetId = decodeURIComponent(staffReportMatch[1]);
    const perfList = computeStaffPerformance(currentDb);
    const staffPerf = perfList.find((s) => s.id === targetId);
    if (!staffPerf) {
      throw new HttpError(404, "স্টাফ খুঁজে পাওয়া যায়নি");
    }

    const invoices = (currentDb.invoices || []).filter((inv) => inv.staffId === targetId);
    const collections = (currentDb.collections || []).filter((col) => col.staffId === targetId);

    return sendJson(res, 200, {
      staff: staffPerf,
      invoices,
      collections,
    });
  }

  // Staff: Create (Admin only)
  if (method === "POST" && pathname === "/api/staff") {
    requireAdmin(user);
    const body = await readJsonBody(req);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = normalizePhone(body.phone);
    const password = typeof body.password === "string" ? body.password.trim() : String(body.password ?? "").trim();
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!name) {
      throw new HttpError(400, "স্টাফের নাম লিখুন");
    }
    if (phone.length < 6) {
      throw new HttpError(400, "সঠিক মোবাইল নম্বর দিন");
    }
    if (!password) {
      throw new HttpError(400, "পাসওয়ার্ড দিন");
    }

    const { db } = await mutateDb((draft) => {
      const duplicate = draft.users.some((u) => normalizePhone(u.phone) === phone);
      if (duplicate) {
        throw new HttpError(400, "এই মোবাইল নম্বর দিয়ে ইতোমধ্যে একটি অ্যাকাউন্ট আছে");
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

    return sendJson(res, 201, {
      bootstrap: buildBootstrapPayload(db, user),
    });
  }

  // Staff: Update (Admin only)
  const staffMatch = pathname.match(/^\/api\/staff\/([^/]+)$/);
  if (method === "PUT" && staffMatch) {
    requireAdmin(user);
    const targetId = decodeURIComponent(staffMatch[1]);
    const body = await readJsonBody(req);

    let deactivated = false;

    const { db } = await mutateDb((draft) => {
      const target = draft.users.find((u) => u.id === targetId);
      if (!target) {
        throw new HttpError(404, "স্টাফ খুঁজে পাওয়া যায়নি");
      }

      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) {
          throw new HttpError(400, "স্টাফের নাম খালি রাখা যাবে না");
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
        const phone = normalizePhone(body.phone);
        if (phone.length < 6) {
          throw new HttpError(400, "সঠিক মোবাইল নম্বর দিন");
        }
        const duplicate = draft.users.some(
          (u) => u.id !== target.id && normalizePhone(u.phone) === phone,
        );
        if (duplicate) {
          throw new HttpError(400, "এই মোবাইল নম্বর অন্য অ্যাকাউন্টে ব্যবহৃত হচ্ছে");
        }
        target.phone = phone;
      }

      if (body.active !== undefined) {
        const nextActive = Boolean(body.active);
        if (target.id === user.id && !nextActive) {
          throw new HttpError(400, "নিজের অ্যাডমিন অ্যাকাউন্ট নিষ্ক্রিয় করা যাবে না");
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
      await mutateSessions((sessions) => {
        for (const [tok, sess] of Object.entries(sessions)) {
          if (sess?.userId === targetId) {
            delete sessions[tok];
          }
        }
      });
    }

    const updatedCurrentUser = db.users.find((u) => u.id === user.id) || user;
    return sendJson(res, 200, {
      bootstrap: buildBootstrapPayload(db, updatedCurrentUser),
    });
  }

  // Settings (Admin only)
  if (method === "PUT" && pathname === "/api/settings") {
    requireAdmin(user);
    const body = await readJsonBody(req);

    const { db } = await mutateDb((draft) => {
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
          const phone = normalizePhone(s.phone);
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
        if (st.invoicePrefix !== undefined && String(st.invoicePrefix).trim()) {
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
    return sendJson(res, 200, {
      bootstrap: buildBootstrapPayload(db, updatedAdmin),
    });
  }

  // Backup Download (Admin only)
  if (method === "GET" && pathname === "/api/backup") {
    requireAdmin(user);
    const formatted = JSON.stringify(currentDb, null, 2);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="al-barakah-store-backup.json"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": NOINDEX_HEADER,
    });
    return res.end(formatted);
  }

  throw new HttpError(404, "এপিআই রুট পাওয়া যায়নি");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (err) {
    if (err instanceof HttpError) {
      return sendJson(res, err.status, { error: err.message });
    }
    console.error("[al-barakah-store] Server error:", err);
    return sendJson(res, 500, { error: "সার্ভারে অপ্রত্যাশিত সমস্যা হয়েছে" });
  }
});

server.listen(PORT, () => {
  console.log(`আল-বারাকাহ স্টোর সার্ভার চালু হয়েছে: http://127.0.0.1:${PORT}`);
});
