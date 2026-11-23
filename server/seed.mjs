const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const MONTHS_BN = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

function toBn(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function formatDateBn(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return `${toBn(date.getDate())} ${MONTHS_BN[date.getMonth()]}`;
}

function daysAgoIso(daysAgo, hour = 11, minute = 20) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function createSeedDb() {
  const store = {
    name: "আল-বারাকাহ স্টোর",
    subtitle: "পাইকারি ব্যবসা ব্যবস্থাপনা",
    address: "চকবাজার, ঢাকা",
    phone: "01806476652",
    ownerName: "আল-বারাকাহ অ্যাডমিন",
    initials: "AB",
  };

  const settings = {
    invoicePrefix: "ABS",
    invoiceFooter: "আল-বারাকাহ স্টোর · নগদ ও বাকি পাইকারি চালান",
    allowNegativeStock: false,
  };

  const openingCash = 250000;

  const users = [
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

  const products = [
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

  const customers = [
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

  const suppliers = [
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

  function buildSaleInvoice(spec) {
    const cust = customerMap.get(spec.customerId);
    const staff = userMap.get(spec.staffId);
    const items = spec.items.map((line) => {
      const prod = productMap.get(line.productId);
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
    const status = due === 0 ? "paid" : paid > 0 ? "partial" : "due";

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

  const invoices = [
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

  function buildCollection(spec) {
    const cust = customerMap.get(spec.customerId);
    const staff = userMap.get(spec.staffId);
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

  const collections = [
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

  // Reconcile every invoice from initialPaid + linked collections
  for (const inv of invoices) {
    const linkedSum = collections
      .filter((c) => c.invoiceId === inv.id)
      .reduce((sum, c) => sum + c.amount, 0);
    inv.paid = inv.initialPaid + linkedSum;
    inv.due = inv.total - inv.paid;
    inv.status = inv.due === 0 ? "paid" : inv.paid > 0 ? "partial" : "due";
    if (inv.due < 0 || inv.paid !== inv.initialPaid + linkedSum) {
      throw new Error(`Invoice reconciliation failed for ${inv.id}`);
    }
  }

  // Reconcile every customer's due = openingDue + sum(invoices where due > 0)
  for (const cust of customers) {
    const invoiceDueSum = invoices
      .filter((inv) => inv.customerId === cust.id && inv.due > 0)
      .reduce((sum, inv) => sum + inv.due, 0);
    cust.due = cust.openingDue + invoiceDueSum;
  }

  function buildPurchase(spec) {
    const sup = supplierMap.get(spec.supplierId);
    const items = spec.items.map((line) => {
      const prod = productMap.get(line.productId);
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
    const status = due === 0 ? "paid" : paid > 0 ? "partial" : "due";
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

  const purchases = [
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

  const adminUser = userMap.get("usr-admin");

  const ledger = [];
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

  const sortByDateDesc = (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime();
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
