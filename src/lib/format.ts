const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const BN_TO_EN: Record<string, string> = {
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

export function toBn(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function toEnDigits(value: string | number): string {
  return String(value).replace(/[০-৯]/g, (d) => BN_TO_EN[d] ?? d);
}

export function normalizePhone(val: string | number): string {
  return toEnDigits(val).replace(/[\s\-–—()]+/g, "").trim();
}

export function parseAmountInput(value: string | number): number {
  const normalized = toEnDigits(value).replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatGrouped(value: number, maxDecimals: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatNumberBn(
  n: number | null | undefined,
  opts?: { decimals?: boolean },
): string {
  const safe = Number.isFinite(Number(n)) ? Number(n) : 0;
  return toBn(formatGrouped(safe, opts?.decimals ? 2 : 0));
}

export function formatMoneyBn(
  amount: number | null | undefined,
  opts?: { decimals?: boolean },
): string {
  return `৳ ${formatNumberBn(amount, opts)}`;
}

export function formatDateBn(iso: string, withTime = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const base = `${toBn(date.getDate())} ${MONTHS_BN[date.getMonth()]}`;
  if (!withTime) return base;
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const mins = String(date.getMinutes()).padStart(2, "0");
  return `${base} • ${hours12}:${mins} ${hours24 < 12 ? "am" : "pm"}`;
}

export function getGreetingBn(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "শুভ সকাল";
  if (hour >= 12 && hour < 16) return "শুভ দুপুর";
  if (hour >= 16 && hour < 18) return "শুভ বিকেল";
  if (hour >= 18 && hour < 21) return "শুভ সন্ধ্যা";
  return "শুভ রাত্রি";
}

export function localDayKey(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
