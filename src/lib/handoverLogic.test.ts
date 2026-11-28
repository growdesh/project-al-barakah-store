import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./crypto";
import { computeStaffPerformance, normalizePhoneDigits } from "./handoverCalc";

test("salted SHA-256 password hashing and verification", async () => {
  const hash1 = await hashPassword("01806476652");
  const hash2 = await hashPassword("01806476652");

  // Unique random salts produce different stored hashes for same plaintext
  assert.notEqual(hash1, hash2);
  assert.equal(hash1.startsWith("sha256$"), true);

  assert.equal(await verifyPassword("01806476652", hash1), true);
  assert.equal(await verifyPassword("01806476652", hash2), true);
  // Bengali digits normalized to English digits
  assert.equal(await verifyPassword("০১৮০৬৪৭৬৬৫২", hash1), true);
  // Wrong password rejected
  assert.equal(await verifyPassword("01806476653", hash1), false);
});

test("phone number normalizes Bengali digits and +880 prefix", () => {
  assert.equal(normalizePhoneDigits("০১৮০৬৪৭৬৬৫২"), "01806476652");
  assert.equal(normalizePhoneDigits("+8801806476653"), "01806476653");
  assert.equal(normalizePhoneDigits(" 01806-476-654 "), "01806476654");
});

test("computeStaffPerformance excludes unpaid/due amounts from cashInHand", () => {
  const users = [
    {
      id: "usr-staff-1",
      name: "মো. রাশেদুল ইসলাম",
      phone: "01806476653",
      role: "staff" as const,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "usr-staff-2",
      name: "মো. কামরুল হাসান",
      phone: "01806476654",
      role: "staff" as const,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  // Staff 1 sells ৳1000 (৳600 cash paid, ৳400 due) + ৳500 (৳0 paid, ৳500 due)
  // Staff 1 collects ৳200 due from customer
  // Admin takes ৳500 handover from Staff 1
  // Expected Staff 1 cashInHand = 600 + 200 - 500 = 300 (NEVER counting 900 due!)
  const invoices = [
    { staffId: "usr-staff-1", total: 1000, initialPaid: 600, due: 400 },
    { staffId: "usr-staff-1", total: 500, initialPaid: 0, due: 500 },
    { staffId: "usr-staff-2", total: 750, initialPaid: 0, due: 750 },
  ];
  const collections = [{ staffId: "usr-staff-1", amount: 200 }];
  const handovers = [{ staffId: "usr-staff-1", amount: 500 }];

  const perf = computeStaffPerformance(users, invoices, collections, handovers);
  const s1 = perf.find((p) => p.id === "usr-staff-1");
  const s2 = perf.find((p) => p.id === "usr-staff-2");

  assert.ok(s1);
  assert.equal(s1.totalSales, 1500);
  assert.equal(s1.saleCashReceived, 600);
  assert.equal(s1.dueCashCollected, 200);
  assert.equal(s1.totalCashReceived, 800);
  assert.equal(s1.totalHandedOver, 500);
  assert.equal(s1.cashInHand, 300);
  assert.equal(s1.outstandingDue, 900);

  // Staff 2 only made a credit sale (৳0 paid, ৳750 due) => cashInHand MUST be 0
  assert.ok(s2);
  assert.equal(s2.totalSales, 750);
  assert.equal(s2.cashInHand, 0);
  assert.equal(s2.outstandingDue, 750);
});
