import type {
  DueCollection,
  SaleInvoice,
  StaffHandover,
  StaffPerformance,
  UserRole,
} from "../types";
import { toEnDigits } from "./format";

export interface StaffUserSummary {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  active: boolean;
  note?: string;
  createdAt: string;
}

function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizePhoneDigits(phone: unknown): string {
  const digits = toEnDigits(String(phone ?? "")).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("8801")) {
    return digits.slice(2);
  }
  return digits;
}

/**
 * Pure per-staff performance & cash-in-hand balance calculator.
 *
 * Rule: Staff do NOT take credit/due ("baki").
 * cashInHand = (cash actually received by that staff in sales: initialPaid)
 *            + (due collections received by that staff: amount)
 *            - (total handovers already collected by admin from that staff)
 * Unpaid/due amounts are NEVER counted in cashInHand.
 */
export function computeStaffPerformance(
  users: StaffUserSummary[],
  invoices: Array<Pick<SaleInvoice, "staffId" | "total" | "initialPaid" | "due">>,
  collections: Array<Pick<DueCollection, "staffId" | "amount">>,
  handovers: Array<Pick<StaffHandover, "staffId" | "amount">>,
): StaffPerformance[] {
  return users.map((u) => {
    const userInvoices = invoices.filter((inv) => inv.staffId === u.id);
    const userCollections = collections.filter((col) => col.staffId === u.id);
    const userHandovers = handovers.filter((h) => h.staffId === u.id);

    const salesCount = userInvoices.length;
    const totalSales = round2(
      userInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0),
    );
    const saleCashReceived = round2(
      userInvoices.reduce((sum, inv) => sum + Number(inv.initialPaid || 0), 0),
    );
    const dueCollectionCount = userCollections.length;
    const dueCashCollected = round2(
      userCollections.reduce((sum, col) => sum + Number(col.amount || 0), 0),
    );
    const totalCashReceived = round2(saleCashReceived + dueCashCollected);
    const totalHandedOver = round2(
      userHandovers.reduce((sum, h) => sum + Number(h.amount || 0), 0),
    );
    const cashInHand = round2(
      Math.max(0, totalCashReceived - totalHandedOver),
    );
    const outstandingDue = round2(
      userInvoices.reduce((sum, inv) => sum + Number(inv.due || 0), 0),
    );

    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      active: Boolean(u.active),
      ...(u.note ? { note: u.note } : {}),
      createdAt: u.createdAt,
      salesCount,
      totalSales,
      saleCashReceived,
      dueCollectionCount,
      dueCashCollected,
      totalCashReceived,
      totalHandedOver,
      cashInHand,
      outstandingDue,
    };
  });
}
