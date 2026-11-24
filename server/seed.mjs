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

export function createSeedDb() {
  const nowIso = new Date().toISOString();

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

  const users = [
    {
      id: "usr-admin",
      name: "আল-বারাকাহ অ্যাডমিন",
      phone: "01806476652",
      password: "01806476652",
      role: "admin",
      active: true,
      note: "স্বত্বাধিকারী ও মূল অ্যাডমিন",
      createdAt: nowIso,
    },
    {
      id: "usr-staff-1",
      name: "মো. রাশেদুল ইসলাম",
      phone: "01806476653",
      password: "01806476653",
      role: "staff",
      active: true,
      note: "পাইকারি বিক্রয় প্রতিনিধি",
      createdAt: nowIso,
    },
    {
      id: "usr-staff-2",
      name: "মো. কামরুল হাসান",
      phone: "01806476654",
      password: "01806476654",
      role: "staff",
      active: true,
      note: "কাউন্টার ও কালেকশন স্টাফ",
      createdAt: nowIso,
    },
  ];

  return {
    store,
    settings,
    openingCash: 0,
    users,
    products: [],
    customers: [],
    suppliers: [],
    invoices: [],
    purchases: [],
    collections: [],
    ledger: [],
  };
}
