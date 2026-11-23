import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT_DIR = process.cwd();
const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function toBn(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

function formatMoneyBn(amount) {
  const num = Number(amount) || 0;
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Math.round(num));
  return `৳ ${toBn(formatted)}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("Could not determine free port")));
        return;
      }
      const { port } = addr;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function waitForHealth(baseUrl, childLogs, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        const body = await res.json();
        if (body && body.ok === true) return;
      }
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `Server failed healthcheck within ${timeoutMs}ms.\nServer logs:\n${childLogs.join("")}`,
  );
}

async function startServer(port, dataDir) {
  const logs = [];
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      API_PORT: String(port),
      DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr?.on("data", (chunk) => logs.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl, logs);
  } catch (err) {
    await stopServer(child);
    throw err;
  }

  return { child, baseUrl, logs };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    child.once("exit", done);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!settled) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        done();
      }
    }, 4000);
  });
}

async function readDbFile(dataDir) {
  const raw = await fs.readFile(path.join(dataDir, "db.json"), "utf8");
  return JSON.parse(raw);
}

async function loginViaForm(page, phone, password) {
  await page.locator('input[type="tel"][autocomplete="username"]').fill(phone);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.locator(".dm-shell").waitFor({ state: "visible", timeout: 10000 });
}

async function logoutViaSidebar(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .locator('aside.dm-sidebar button[aria-label="লগআউট"]')
    .click();
  await page
    .locator('input[type="tel"][autocomplete="username"]')
    .waitFor({ state: "visible", timeout: 10000 });
}

async function main() {
  const dataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "al-barakah-verify-"),
  );
  const port = await getFreePort();
  let server = null;
  let browser = null;

  const pageErrors = [];
  const consoleErrors = [];
  const networkFailures = [];
  const server5xx = [];
  const strict4xx = [];

  let strictMode = false;

  const onSignal = async () => {
    await browser?.close().catch(() => {});
    await stopServer(server?.child);
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    process.exit(1);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    console.log(`Starting isolated server on port ${port} with DATA_DIR=${dataDir}`);
    server = await startServer(port, dataDir);
    const { baseUrl } = server;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    page.on("pageerror", (err) => {
      pageErrors.push(`pageerror: ${err.message}`);
    });
    page.on("requestfailed", (req) => {
      const errText = req.failure()?.errorText || "unknown";
      if (!errText.includes("ERR_ABORTED")) {
        networkFailures.push(`requestfailed ${req.url()}: ${errText}`);
      }
    });
    page.on("response", (res) => {
      const status = res.status();
      if (status >= 500) {
        server5xx.push(`HTTP ${status} on ${res.url()}`);
      } else if (strictMode && status >= 400) {
        strict4xx.push(`HTTP ${status} on ${res.url()}`);
      }
    });
    page.on("console", (msg) => {
      if (msg.type() === "error" && strictMode) {
        consoleErrors.push(`console.error: ${msg.text()}`);
      }
    });

    const assertNoRuntimeErrors = (label) => {
      assert(
        pageErrors.length === 0,
        `${label}: pageErrors -> ${pageErrors.join(" | ")}`,
      );
      assert(
        server5xx.length === 0,
        `${label}: server5xx -> ${server5xx.join(" | ")}`,
      );
      assert(
        networkFailures.length === 0,
        `${label}: networkFailures -> ${networkFailures.join(" | ")}`,
      );
      assert(
        strict4xx.length === 0,
        `${label}: unexpected 4xx -> ${strict4xx.join(" | ")}`,
      );
      assert(
        consoleErrors.length === 0,
        `${label}: consoleErrors -> ${consoleErrors.join(" | ")}`,
      );
    };

    // ─── 3a. Login & Accessibility ───
    console.log("Step 3a: Login & Accessibility checks...");
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const formCount = await page.locator("form").count();
    assert(formCount >= 1, "Login page must render a <form>");

    const telInput = page.locator('input[type="tel"][autocomplete="username"]');
    const pwdInput = page.locator(
      'input[type="password"][autocomplete="current-password"]',
    );
    await telInput.waitFor({ state: "visible" });
    await pwdInput.waitFor({ state: "visible" });

    const toggleBtn = page.locator('.dm-password-wrap button[type="button"]');
    await toggleBtn.waitFor({ state: "visible" });
    await toggleBtn.click();
    assert(
      (await page
        .locator('input[autocomplete="current-password"]')
        .getAttribute("type")) === "text",
      "Password toggle must reveal password (type=text)",
    );
    assert(
      (await toggleBtn.getAttribute("aria-pressed")) === "true",
      "Password toggle must set aria-pressed=true when shown",
    );
    await toggleBtn.click();
    assert(
      (await page
        .locator('input[autocomplete="current-password"]')
        .getAttribute("type")) === "password",
      "Password toggle must hide password again (type=password)",
    );

    const loginScreenText = await page.locator("body").innerText();
    for (const forbidden of ["01806476652", "01806476653", "01806476654"]) {
      assert(
        !loginScreenText.includes(forbidden),
        `Login screen must NOT display hardcoded credentials (${forbidden})`,
      );
    }

    // Invalid login test
    await telInput.fill("01806476652");
    await page.locator('input[autocomplete="current-password"]').fill("wrong");
    await page.locator('form button[type="submit"]').click();
    const alertBox = page.locator('[role="alert"]');
    await alertBox.waitFor({ state: "visible", timeout: 5000 });
    const alertText = (await alertBox.innerText()).trim();
    assert(alertText.length > 0, "Invalid login alert must show error message");

    // ─── 3b. Admin Flow ───
    console.log("Step 3b: Admin login & Desktop/Mobile route sweeps...");
    await loginViaForm(page, "01806476652", "01806476652");
    strictMode = true;

    const adminRoutes = [
      "/",
      "/sales",
      "/sales/new",
      "/collections",
      "/customers",
      "/stock",
      "/purchases",
      "/suppliers",
      "/staff",
      "/money",
      "/reports",
      "/settings",
      "/more",
    ];
    const viewports = [
      { name: "desktop", width: 1280, height: 800 },
      { name: "mobile", width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of adminRoutes) {
        await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
        await page.locator("main.dm-content").waitFor({ state: "visible" });
        await page.waitForTimeout(100);
        const dims = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        assert(
          dims.scrollWidth <= dims.innerWidth,
          `Horizontal overflow on ${vp.name} (${vp.width}x${vp.height}) at ${route}: scrollWidth=${dims.scrollWidth} > innerWidth=${dims.innerWidth}`,
        );
      }
    }
    assertNoRuntimeErrors("Admin Desktop & Mobile route sweeps");

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    // Verify Admin Dashboard KPIs
    const dashText = await page.locator("main.dm-content").innerText();
    for (const kpi of [
      "মোট বিক্রি",
      "মোট নগদ প্রাপ্তি",
      "মোট বাকি পাওনা",
      "মোট পণ্য",
      "মোট স্টাফ",
    ]) {
      assert(
        dashText.includes(kpi),
        `Admin Dashboard must show KPI "${kpi}"`,
      );
    }

    // Add product on /stock, reload, verify UI & db.json
    console.log("Step 3b: Creating product on /stock & checking reload persistence...");
    await page.goto(`${baseUrl}/stock`, { waitUntil: "networkidle" });
    await page.locator('button:has-text("নতুন পণ্য")').click();
    await page.locator("dialog[open]").waitFor({ state: "visible" });

    const testProductName = "ভেরিফাই টেস্ট সরিষার তেল ৫ লিটার";
    await page.locator("#dm-stk-name").fill(testProductName);
    await page.locator("#dm-stk-cat").fill("ভোজ্যতেল");
    await page.locator("#dm-stk-unit").fill("বোতল");
    await page.locator("#dm-stk-buy").fill("800");
    await page.locator("#dm-stk-sell").fill("950");
    await page.locator("#dm-stk-qty").fill("40");
    await page.locator("#dm-stk-min").fill("10");
    await page.locator('button[form="dm-add-product-form"]').click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });

    await page
      .locator(`table.dm-table td:has-text("${testProductName}")`)
      .waitFor({ state: "visible" });
    await page.reload({ waitUntil: "networkidle" });
    await page
      .locator(`table.dm-table td:has-text("${testProductName}")`)
      .waitFor({ state: "visible" });

    let db = await readDbFile(dataDir);
    const createdProduct = db.products.find((p) => p.name === testProductName);
    assert(
      createdProduct && createdProduct.saleRate === 950 && createdProduct.stock === 40,
      "Created product must persist in <DATA_DIR>/db.json",
    );

    // Add staff & edit staff name + password on /staff
    console.log("Step 3b: Adding and editing staff on /staff...");
    await page.goto(`${baseUrl}/staff`, { waitUntil: "networkidle" });
    await page.locator('button:has-text("+ নতুন স্টাফ")').click();
    await page.locator("dialog[open]").waitFor({ state: "visible" });

    await page.locator("#staff-add-name").fill("টেস্ট স্টাফ");
    await page.locator("#staff-add-phone").fill("01806476699");
    await page.locator("#staff-add-pwd").fill("test1234");
    await page.locator('dialog[open] button:has-text("স্টাফ যোগ করুন")').click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });

    const newStaffRow = page.locator("table.dm-table tbody tr", {
      hasText: "01806476699",
    });
    await newStaffRow.waitFor({ state: "visible" });
    assert(
      (await newStaffRow.innerText()).includes("টেস্ট স্টাফ"),
      "Added staff must render in staff table",
    );

    await newStaffRow.locator('button:has-text("সম্পাদনা")').click();
    await page.locator("dialog[open]").waitFor({ state: "visible" });
    await page.locator("#staff-edit-name").fill("টেস্ট স্টাফ আপডেট");
    await page.locator("#staff-edit-pwd").fill("test5678");
    await page
      .locator('dialog[open] button:has-text("পরিবর্তন সংরক্ষণ")')
      .click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });

    await page
      .locator("table.dm-table tbody tr", { hasText: "টেস্ট স্টাফ আপডেট" })
      .waitFor({ state: "visible" });

    // Navigate to /sales/new: verify NO payment method selector, create partial cash sale
    console.log("Step 3b: Creating partial cash sale on /sales/new...");
    await page.goto(`${baseUrl}/sales/new`, { waitUntil: "networkidle" });
    const posBodyText = await page.locator("body").innerText();
    assert(
      !/পেমেন্ট মাধ্যম|bkash|nagad|rocket|ব্যাংক/i.test(posBodyText),
      "Sales screen must NOT show any payment method selector or bKash/Nagad/Rocket/Bank",
    );

    db = await readDbFile(dataDir);
    const preCust1Due = db.customers.find((c) => c.id === "cust-1").due;
    const preInvoiceIds = new Set(db.invoices.map((i) => i.id));

    await page.selectOption("#dm-pos-party", "cust-1");
    const productItemCard = page.locator(".dm-pos-item", {
      hasText: testProductName,
    });
    await productItemCard.locator('button:has-text("যোগ করুন")').click();
    await productItemCard.locator('button:has-text("যোগ করুন")').click(); // qty 2 * 950 = 1900

    await page.locator('button:has-text("আংশিক নগদ")').click();
    await page.locator("#dm-pos-paid").fill("700");
    await page.locator('button:has-text("বিক্রয় সম্পন্ন করুন")').click();

    await page.waitForURL((u) => u.pathname === "/sales", { timeout: 10000 });
    await page.locator('h1:has-text("বিক্রয় ও চালান")').waitFor({ state: "visible" });

    db = await readDbFile(dataDir);
    const newAdminInv = db.invoices.find((i) => !preInvoiceIds.has(i.id));
    assert(newAdminInv, "New Admin sale invoice must persist in db.json");
    assert(
      newAdminInv.total === 1900 &&
        newAdminInv.paid === 700 &&
        newAdminInv.due === 1200 &&
        newAdminInv.status === "partial",
      `Expected 1900 total / 700 paid / 1200 due, got ${JSON.stringify(newAdminInv)}`,
    );
    const afterSaleCust1Due = db.customers.find((c) => c.id === "cust-1").due;
    assert(
      afterSaleCust1Due === preCust1Due + 1200,
      `Customer due must increase by 1200 (${preCust1Due} -> ${afterSaleCust1Due})`,
    );

    await page
      .locator(`table.dm-table tbody tr:has-text("${newAdminInv.number}")`)
      .waitFor({ state: "visible" });

    // Collect cash due on /collections & verify customer due + invoice due decrease
    console.log("Step 3b: Collecting due on /collections...");
    const preCollectionIds = new Set(db.collections.map((c) => c.id));
    await page.goto(`${baseUrl}/collections`, { waitUntil: "networkidle" });
    await page.locator('button:has-text("নগদ বাকি আদায়")').click();
    await page.locator("dialog[open]").waitFor({ state: "visible" });

    await page.selectOption("#dm-col-customer", "cust-1");
    await page.selectOption("#dm-col-invoice", newAdminInv.id);
    await page.locator("#dm-col-amount").fill("400");
    await page
      .locator('dialog[open] button:has-text("নগদ আদায় সংরক্ষণ")')
      .click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });

    db = await readDbFile(dataDir);
    const newAdminCol = db.collections.find((c) => !preCollectionIds.has(c.id));
    assert(newAdminCol && newAdminCol.amount === 400, "Admin collection must persist in db.json");

    const updatedAdminInv = db.invoices.find((i) => i.id === newAdminInv.id);
    const afterColCust1Due = db.customers.find((c) => c.id === "cust-1").due;
    assert(
      updatedAdminInv.due === 800 && updatedAdminInv.paid === 1100,
      `Invoice due must decrease to 800 and paid to 1100, got due=${updatedAdminInv.due}, paid=${updatedAdminInv.paid}`,
    );
    assert(
      afterColCust1Due === afterSaleCust1Due - 400,
      `Customer due must decrease by 400 (${afterSaleCust1Due} -> ${afterColCust1Due})`,
    );

    await page
      .locator(`table.dm-table tbody tr:has-text("${newAdminCol.receiptNo}")`)
      .waitFor({ state: "visible" });

    // Verify updated invoice due on /sales UI
    await page.goto(`${baseUrl}/sales`, { waitUntil: "networkidle" });
    const adminInvRowText = await page
      .locator(`table.dm-table tbody tr:has-text("${newAdminInv.number}")`)
      .innerText();
    assert(
      adminInvRowText.includes("৮০০"),
      `Sales table must show updated invoice due ৳ ৮০০ for ${newAdminInv.number}`,
    );

    // Check /reports and /staff Individual Staff Performance modal
    console.log("Step 3b: Checking /reports and Individual Staff Performance modal...");
    await page.goto(`${baseUrl}/reports`, { waitUntil: "networkidle" });
    const reportsTable = page.locator(
      'div[aria-label="স্টাফ-ভিত্তিক বিক্রয় ও নগদ পারফরম্যান্স"]',
    );
    await reportsTable.waitFor({ state: "visible" });
    const reportsTableText = await reportsTable.innerText();
    assert(
      reportsTableText.includes("মো. রাশেদুল ইসলাম") &&
        reportsTableText.includes("টেস্ট স্টাফ আপডেট"),
      "Reports staff performance table must include staff members",
    );

    await page.goto(`${baseUrl}/staff`, { waitUntil: "networkidle" });
    const rashedRow = page.locator("table.dm-table tbody tr", {
      hasText: "মো. রাশেদুল ইসলাম",
    });
    await rashedRow.locator('button:has-text("রিপোর্ট")').click();
    const staffReportModal = page.locator("dialog[open]");
    await staffReportModal.waitFor({ state: "visible" });
    const modalText = await staffReportModal.innerText();
    assert(
      modalText.includes("মো. রাশেদুল ইসলাম — পারফরম্যান্স রিপোর্ট") &&
        modalText.includes("সর্বমোট নগদ প্রাপ্তি"),
      "Individual Staff Performance modal must display member KPIs and totals",
    );
    await staffReportModal
      .locator('button[role="tab"]:has-text("বাকি আদায়ের ইতিহাস")')
      .click();
    await staffReportModal.locator('button:has-text("বন্ধ করুন")').click();
    await staffReportModal.waitFor({ state: "hidden" });

    assertNoRuntimeErrors("Admin CRUD, sales, collections & reports");
    strictMode = false;
    await logoutViaSidebar(page);

    // ─── 3c. Default Staff Flow (01806476653 / 01806476653) ───
    console.log("Step 3c: Default Staff flow & strict isolation checks...");
    await loginViaForm(page, "01806476653", "01806476653");
    strictMode = true;

    const staffDashText = await page.locator("main.dm-content").innerText();
    for (const label of [
      "আমার মোট বিক্রি",
      "আমার নগদ প্রাপ্তি",
      "আমার বাকি আদায়",
      "আমার বিক্রির বাকি",
    ]) {
      assert(
        staffDashText.includes(label),
        `Staff dashboard must show personal KPI "${label}"`,
      );
    }
    assert(
      !staffDashText.includes("মোট স্টাফ") && !staffDashText.includes("মোট পণ্য"),
      "Staff dashboard must NOT display Admin-only overall KPIs",
    );

    // Confirm staff dashboard totalSales matches staff-1's personal sales, NOT admin's overall total
    db = await readDbFile(dataDir);
    const staff1PersonalSales = db.invoices
      .filter((i) => i.staffId === "usr-staff-1")
      .reduce((sum, i) => sum + i.total, 0);
    const adminOverallSales = db.invoices.reduce((sum, i) => sum + i.total, 0);
    assert(
      staffDashText.includes(formatMoneyBn(staff1PersonalSales)) &&
        !staffDashText.includes(formatMoneyBn(adminOverallSales)),
      "Staff dashboard must show personal sales total rather than Admin overall total",
    );

    // Check sidebar & bottom nav do NOT expose Admin links
    const navHrefs = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll(
          "aside.dm-sidebar a[href], nav.dm-bottom-nav a[href]",
        ),
      );
      return links.map((a) => a.getAttribute("href"));
    });
    for (const adminRoute of [
      "/staff",
      "/stock",
      "/purchases",
      "/suppliers",
      "/money",
      "/settings",
    ]) {
      assert(
        !navHrefs.includes(adminRoute),
        `Admin nav route ${adminRoute} must NOT be visible in Staff navigation`,
      );
    }

    // Navigate directly to /staff, /stock, /settings -> confirm .dm-access-denied
    for (const restrictedRoute of ["/staff", "/stock", "/settings"]) {
      await page.goto(`${baseUrl}${restrictedRoute}`, {
        waitUntil: "networkidle",
      });
      await page.locator(".dm-access-denied").waitFor({ state: "visible" });
    }

    // Verify fetch("/api/staff") returns 403 with staff session
    strictMode = false;
    const staffApiStatus = await page.evaluate(async () => {
      const token = window.localStorage.getItem("ab_auth_token");
      const res = await fetch("/api/staff", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      return res.status;
    });
    assert(
      staffApiStatus === 403,
      `Expected HTTP 403 for Staff calling /api/staff, got ${staffApiStatus}`,
    );
    strict4xx.length = 0;
    consoleErrors.length = 0;
    strictMode = true;

    // On /sales and /collections, confirm ZERO invoices/collections of other staff/admin appear
    await page.goto(`${baseUrl}/sales`, { waitUntil: "networkidle" });
    const staffSalesText = await page.locator("main.dm-content").innerText();
    assert(
      !staffSalesText.includes("মো. কামরুল হাসান") &&
        !staffSalesText.includes("আল-বারাকাহ অ্যাডমিন"),
      "Staff /sales must NOT display invoices of other staff or Admin",
    );

    await page.goto(`${baseUrl}/collections`, { waitUntil: "networkidle" });
    const staffColText = await page.locator("main.dm-content").innerText();
    assert(
      !staffColText.includes("মো. কামরুল হাসান") &&
        !staffColText.includes("আল-বারাকাহ অ্যাডমিন"),
      "Staff /collections must NOT display collections of other staff or Admin",
    );

    const staffBootstrapCheck = await page.evaluate(async () => {
      const token = window.localStorage.getItem("ab_auth_token");
      const res = await fetch("/api/bootstrap", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      return res.json();
    });
    assert(
      staffBootstrapCheck.invoices.every((i) => i.staffId === "usr-staff-1") &&
        staffBootstrapCheck.collections.every((c) => c.staffId === "usr-staff-1"),
      "Staff /api/bootstrap must strictly filter invoices and collections to own staffId",
    );

    // Staff creates partial cash sale & collects due
    console.log("Step 3c: Staff creates partial sale & collects due...");
    db = await readDbFile(dataDir);
    const preStaffInvIds = new Set(db.invoices.map((i) => i.id));
    const preStaffColIds = new Set(db.collections.map((c) => c.id));

    await page.goto(`${baseUrl}/sales/new`, { waitUntil: "networkidle" });
    await page.selectOption("#dm-pos-party", "cust-2");
    await page
      .locator(".dm-pos-item", { hasText: testProductName })
      .locator('button:has-text("যোগ করুন")')
      .click(); // 1 * 950 = 950
    await page.locator('button:has-text("আংশিক নগদ")').click();
    await page.locator("#dm-pos-paid").fill("350"); // due = 600
    await page.locator('button:has-text("বিক্রয় সম্পন্ন করুন")').click();

    await page.waitForURL((u) => u.pathname === "/sales", { timeout: 10000 });
    db = await readDbFile(dataDir);
    const newStaffInv = db.invoices.find((i) => !preStaffInvIds.has(i.id));
    assert(
      newStaffInv &&
        newStaffInv.staffId === "usr-staff-1" &&
        newStaffInv.total === 950 &&
        newStaffInv.paid === 350 &&
        newStaffInv.due === 600,
      "Staff partial sale must persist with usr-staff-1",
    );
    await page
      .locator(`table.dm-table tbody tr:has-text("${newStaffInv.number}")`)
      .waitFor({ state: "visible" });

    // Staff collects cash due
    await page.goto(`${baseUrl}/collections`, { waitUntil: "networkidle" });
    await page.locator('button:has-text("নগদ বাকি আদায়")').click();
    await page.locator("dialog[open]").waitFor({ state: "visible" });
    await page.selectOption("#dm-col-customer", "cust-2");
    await page.selectOption("#dm-col-invoice", newStaffInv.id);
    await page.locator("#dm-col-amount").fill("150");
    await page
      .locator('dialog[open] button:has-text("নগদ আদায় সংরক্ষণ")')
      .click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });

    db = await readDbFile(dataDir);
    const newStaffCol = db.collections.find((c) => !preStaffColIds.has(c.id));
    assert(
      newStaffCol &&
        newStaffCol.staffId === "usr-staff-1" &&
        newStaffCol.amount === 150,
      "Staff collection must persist with usr-staff-1",
    );
    await page
      .locator(`table.dm-table tbody tr:has-text("${newStaffCol.receiptNo}")`)
      .waitFor({ state: "visible" });

    // Verify both appear on Staff's /reports
    await page.goto(`${baseUrl}/reports`, { waitUntil: "networkidle" });
    await page
      .locator(`table.dm-table tbody tr:has-text("${newStaffInv.number}")`)
      .waitFor({ state: "visible" });
    await page
      .locator('button[role="tab"]:has-text("বাকি আদায়ের ইতিহাস")')
      .click();
    await page
      .locator(`table.dm-table tbody tr:has-text("${newStaffCol.receiptNo}")`)
      .waitFor({ state: "visible" });

    assertNoRuntimeErrors("Default Staff flow");
    strictMode = false;
    await logoutViaSidebar(page);

    // ─── 3d. Edited Staff Credential Test ───
    console.log("Step 3d: Testing edited staff credentials (01806476699 / test5678)...");
    await loginViaForm(page, "01806476699", "test5678");
    strictMode = true;
    const editedStaffText = await page.locator("body").innerText();
    assert(
      editedStaffText.includes("টেস্ট স্টাফ আপডেট"),
      "Edited staff dashboard must show updated name টেস্ট স্টাফ আপডেট",
    );
    assertNoRuntimeErrors("Edited Staff credential check");
    strictMode = false;
    await logoutViaSidebar(page);

    // ─── 3e. Admin Cross-Verification & Server Restart Persistence ───
    console.log("Step 3e: Admin cross-verification & server restart persistence...");
    await loginViaForm(page, "01806476652", "01806476652");
    strictMode = true;

    db = await readDbFile(dataDir);
    const staff1Invoices = db.invoices.filter((i) => i.staffId === "usr-staff-1");
    const staff1Collections = db.collections.filter(
      (c) => c.staffId === "usr-staff-1",
    );
    const expectedStaff1TotalSales = staff1Invoices.reduce(
      (s, i) => s + i.total,
      0,
    );
    const expectedStaff1Cash =
      staff1Invoices.reduce((s, i) => s + i.initialPaid, 0) +
      staff1Collections.reduce((s, c) => s + c.amount, 0);
    const expectedOverallSales = db.invoices.reduce((s, i) => s + i.total, 0);

    await page.goto(`${baseUrl}/staff`, { waitUntil: "networkidle" });
    const staff1AdminRow = page.locator("table.dm-table tbody tr", {
      hasText: "মো. রাশেদুল ইসলাম",
    });
    const staff1AdminRowText = await staff1AdminRow.innerText();
    assert(
      staff1AdminRowText.includes(formatMoneyBn(expectedStaff1TotalSales)) &&
        staff1AdminRowText.includes(formatMoneyBn(expectedStaff1Cash)),
      `Admin staff table must show মো. রাশেদুল ইসলাম updated sales (${formatMoneyBn(expectedStaff1TotalSales)}) & cash (${formatMoneyBn(expectedStaff1Cash)})`,
    );

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const expectedOverallCash =
      db.invoices.reduce((s, i) => s + i.initialPaid, 0) +
      db.collections.reduce((s, c) => s + c.amount, 0);
    const expectedOverallDue = db.customers.reduce((s, c) => s + c.due, 0);

    const finalAdminDashText = await page.locator("main.dm-content").innerText();
    assert(
      finalAdminDashText.includes(formatMoneyBn(expectedOverallSales)) &&
        finalAdminDashText.includes(formatMoneyBn(expectedOverallCash)) &&
        finalAdminDashText.includes(formatMoneyBn(expectedOverallDue)),
      `Admin dashboard KPIs must include overall sales (${formatMoneyBn(expectedOverallSales)}), cash (${formatMoneyBn(expectedOverallCash)}), and due (${formatMoneyBn(expectedOverallDue)})`,
    );

    // Kill and restart server pointing to SAME DATA_DIR, then reload browser
    console.log("Step 3e: Restarting server with same DATA_DIR & reloading browser...");
    await stopServer(server.child);
    server = await startServer(port, dataDir);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".dm-shell").waitFor({ state: "visible" });
    const reloadedDashText = await page.locator("main.dm-content").innerText();
    assert(
      reloadedDashText.includes(formatMoneyBn(expectedOverallSales)),
      "Reloaded Admin dashboard after server restart must still show updated overall sales",
    );

    await page.goto(`${baseUrl}/stock`, { waitUntil: "networkidle" });
    await page
      .locator(`table.dm-table td:has-text("${testProductName}")`)
      .waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/staff`, { waitUntil: "networkidle" });
    await page
      .locator("table.dm-table tbody tr", { hasText: "টেস্ট স্টাফ আপডেট" })
      .waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/sales`, { waitUntil: "networkidle" });
    await page
      .locator(`table.dm-table tbody tr:has-text("${newAdminInv.number}")`)
      .waitFor({ state: "visible" });
    await page
      .locator(`table.dm-table tbody tr:has-text("${newStaffInv.number}")`)
      .waitFor({ state: "visible" });

    await page.goto(`${baseUrl}/collections`, { waitUntil: "networkidle" });
    await page
      .locator(`table.dm-table tbody tr:has-text("${newAdminCol.receiptNo}")`)
      .waitFor({ state: "visible" });
    await page
      .locator(`table.dm-table tbody tr:has-text("${newStaffCol.receiptNo}")`)
      .waitFor({ state: "visible" });

    assertNoRuntimeErrors("Admin cross-verification & restart persistence");

    console.log("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!");
  } finally {
    await browser?.close().catch(() => {});
    await stopServer(server?.child);
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
