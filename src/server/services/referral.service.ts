/**
 * referral.service.ts — Referral programme business logic
 *
 * Issue #328: Referral programme for new user acquisition.
 *
 * Features:
 *  - Unique referral code generation per user
 *  - Referral tracked via URL param (`?ref=CODE`) on signup
 *  - Both referrer and referee credited ₦500 after first gift payment
 *  - Credit applied as discount on next gift, not withdrawable
 *  - Fraud detection: same device, same IP, same name
 *  - Admin attribution data
 */

import { randomUUID } from "crypto";
import pool from "@/lib/db";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Bonus amount in NGN credited to both referrer and referee. */
export const REFERRAL_BONUS_NGN = 500;

/** Length of the referral code (alphanumeric, uppercase). */
const CODE_LENGTH = 8;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReferralStatus = "pending" | "eligible" | "credited" | "flagged" | "rejected";

export interface Referral {
  id: string;
  referrerId: string;
  refereeId: string;
  referralCode: string;
  status: ReferralStatus;
  creditedAt: Date | null;
  signupIp: string | null;
  signupUserAgent: string | null;
  signupDeviceFingerprint: string | null;
  fraudFlags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferralAttribution {
  referrerId: string;
  referrerName: string;
  refereeId: string;
  refereeName: string;
  referralCode: string;
  status: ReferralStatus;
  creditedAt: Date | null;
  createdAt: Date;
}

// ─── Referral Code Generation ────────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars (0/O, 1/I)

/**
 * Generates a unique referral code for a user.
 *
 * The code is 8 characters long, using unambiguous alphanumeric characters
 * (no 0/O or 1/I) to avoid transcription errors.
 *
 * @returns A unique 8-character referral code.
 */
export function generateReferralCode(): string {
  const bytes = randomUUID().replace(/-/g, "");
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = parseInt(bytes[i], 16) % CODE_CHARS.length;
    code += CODE_CHARS[idx];
  }
  return code;
}

/**
 * Gets or creates a referral code for the given user.
 * Each user gets exactly one code that persists across sessions.
 *
 * @param userId - The user's UUID.
 * @returns The user's referral code.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  // Check if user already has a referral code
  const { rows } = await pool.query<{ referral_code: string }>(
    "SELECT referral_code FROM referrals WHERE referrer_id = $1 LIMIT 1",
    [userId]
  );

  if (rows.length > 0 && rows[0].referral_code) {
    return rows[0].referral_code;
  }

  // Generate a new unique code (retry on collision)
  let code = generateReferralCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await pool.query("SELECT 1 FROM referrals WHERE referral_code = $1", [code]);
    if (existing.rows.length === 0) break;
    code = generateReferralCode();
  }

  return code;
}

// ─── Signup Tracking ─────────────────────────────────────────────────────────

export interface SignupContext {
  refereeId: string;
  referralCode: string;
  signupIp?: string;
  signupUserAgent?: string;
  signupDeviceFingerprint?: string;
  refereeName?: string;
}

/**
 * Tracks a referral at signup time. Called when a new user registers with
 * a `?ref=CODE` URL parameter.
 *
 * Performs fraud detection before creating the referral record:
 *  - Same device fingerprint as the referrer
 *  - Same IP address as the referrer's signup
 *  - Same display name as the referrer
 *
 * @param ctx - Signup context including the referral code and device info.
 * @returns The created referral, or null if the code is invalid.
 */
export async function trackReferralAtSignup(ctx: SignupContext): Promise<Referral | null> {
  // Look up the referrer by their code
  const { rows: referrerRows } = await pool.query<{ referrer_id: string }>(
    "SELECT referrer_id FROM referrals WHERE referral_code = $1 LIMIT 1",
    [ctx.referralCode]
  );

  if (referrerRows.length === 0) {
    return null; // Invalid code — no referrer found
  }

  const referrerId = referrerRows[0].referrer_id;

  // Self-referral check
  if (referrerId === ctx.refereeId) {
    return null;
  }

  // ── Fraud detection ───────────────────────────────────────────────────────
  const fraudFlags: string[] = [];

  // Check if the referrer and referee have the same device fingerprint
  if (ctx.signupDeviceFingerprint) {
    const { rows: deviceRows } = await pool.query(
      "SELECT 1 FROM referrals WHERE referrer_id = $1 AND signup_device_fingerprint = $2 LIMIT 1",
      [referrerId, ctx.signupDeviceFingerprint]
    );
    if (deviceRows.length > 0) {
      fraudFlags.push("same_device");
    }
  }

  // Check if the referrer and referee signed up from the same IP
  if (ctx.signupIp) {
    const { rows: ipRows } = await pool.query(
      "SELECT 1 FROM referrals WHERE referrer_id = $1 AND signup_ip = $2 LIMIT 1",
      [referrerId, ctx.signupIp]
    );
    if (ipRows.length > 0) {
      fraudFlags.push("same_ip");
    }
  }

  // Check if the referrer and referee have the same display name
  if (ctx.refereeName) {
    const { rows: nameRows } = await pool.query<{ display_name: string }>(
      "SELECT display_name FROM users WHERE id = $1 LIMIT 1",
      [referrerId]
    );
    if (nameRows.length > 0 && nameRows[0].display_name === ctx.refereeName) {
      fraudFlags.push("same_name");
    }
  }

  const status: ReferralStatus = fraudFlags.length > 0 ? "flagged" : "pending";

  const id = randomUUID();
  const { rows } = await pool.query(
    "INSERT INTO referrals (id, referrer_id, referee_id, referral_code, status, signup_ip, signup_user_agent, signup_device_fingerprint, fraud_flags) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
    [
      id,
      referrerId,
      ctx.refereeId,
      ctx.referralCode,
      status,
      ctx.signupIp ?? null,
      ctx.signupUserAgent ?? null,
      ctx.signupDeviceFingerprint ?? null,
      fraudFlags,
    ]
  );

  // Log fraud detection event
  if (fraudFlags.length > 0) {
    await pool.query(
      "INSERT INTO referral_audit (id, referral_id, event, details) VALUES ($1, $2, 'fraud_detected', $3)",
      [randomUUID(), id, JSON.stringify({ flags: fraudFlags })]
    );
  }

  return mapReferralRow(rows[0]);
}

// ─── Credit on First Gift Payment ────────────────────────────────────────────

/**
 * Credits both the referrer and the referee ₦500 after the referee completes
 * their first gift payment.
 *
 * The credit is stored as a referral_credits entry and can only be used as a
 * discount on a future gift — it is never withdrawable.
 *
 * @param refereeId - The user who was referred.
 * @returns true if credits were applied, false if the referral was not eligible.
 */
export async function creditReferralOnFirstPayment(refereeId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find the pending referral for this referee
    const { rows: referralRows } = await client.query(
      "SELECT * FROM referrals WHERE referee_id = $1 AND status = 'pending' LIMIT 1",
      [refereeId]
    );

    if (referralRows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const referral = referralRows[0];

    // Check that this is the referee's first gift payment
    const { rows: giftRows } = await client.query(
      "SELECT COUNT(*) as count FROM gifts WHERE sender_id = $1 AND status IN ('funded', 'locked', 'unlocked', 'claimed')",
      [refereeId]
    );

    if (parseInt(giftRows[0].count, 10) > 1) {
      // Not the first payment — already credited or not eligible
      await client.query("ROLLBACK");
      return false;
    }

    // Credit the referrer ₦500
    await client.query(
      "INSERT INTO referral_credits (id, user_id, amount_ngn, source_referral_id, type, expires_at) VALUES ($1, $2, $3, $4, 'referral_bonus', NOW() + INTERVAL '90 days')",
      [randomUUID(), referral.referrer_id, REFERRAL_BONUS_NGN, referral.id]
    );

    // Credit the referee ₦500
    await client.query(
      "INSERT INTO referral_credits (id, user_id, amount_ngn, source_referral_id, type, expires_at) VALUES ($1, $2, $3, $4, 'referral_bonus', NOW() + INTERVAL '90 days')",
      [randomUUID(), referral.referee_id, REFERRAL_BONUS_NGN, referral.id]
    );

    // Mark referral as credited
    await client.query(
      "UPDATE referrals SET status = 'credited', credited_at = NOW(), updated_at = NOW() WHERE id = $1",
      [referral.id]
    );

    // Audit log
    await client.query(
      "INSERT INTO referral_audit (id, referral_id, event, details) VALUES ($1, $2, 'credit', $3)",
      [randomUUID(), referral.id, JSON.stringify({ amount: REFERRAL_BONUS_NGN })]
    );

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[referral] creditReferralOnFirstPayment failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

// ─── Credit Usage ────────────────────────────────────────────────────────────

/**
 * Retrieves the available (unused, unexpired) referral credit balance for a user.
 *
 * @param userId - The user's UUID.
 * @returns Available credit amount in NGN.
 */
export async function getAvailableCredit(userId: string): Promise<number> {
  const { rows } = await pool.query(
    "SELECT COALESCE(SUM(amount_ngn), 0) as total FROM referral_credits WHERE user_id = $1 AND used_on_gift_id IS NULL AND (expires_at IS NULL OR expires_at > NOW())",
    [userId]
  );
  return parseFloat(rows[0].total);
}

/**
 * Applies available referral credit as a discount on a gift.
 * Marks the credit rows as used.
 *
 * @param userId - The user applying the credit.
 * @param giftId - The gift being discounted.
 * @returns The amount of credit applied (may be less than available if gift is smaller).
 */
export async function applyCreditToGift(userId: string, giftId: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: creditRows } = await client.query(
      "SELECT id, amount_ngn FROM referral_credits WHERE user_id = $1 AND used_on_gift_id IS NULL AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at ASC",
      [userId]
    );

    if (creditRows.length === 0) {
      await client.query("ROLLBACK");
      return 0;
    }

    // Get gift amount to cap the credit
    const { rows: giftRows } = await client.query<{ amount_ngn: string }>(
      "SELECT amount_ngn FROM gifts WHERE id = $1 AND sender_id = $2",
      [giftId, userId]
    );

    if (giftRows.length === 0) {
      await client.query("ROLLBACK");
      return 0;
    }

    const giftAmount = parseFloat(giftRows[0].amount_ngn);
    let applied = 0;

    for (const credit of creditRows) {
      if (applied >= giftAmount) break;
      const creditAmount = parseFloat(credit.amount_ngn);
      const remaining = giftAmount - applied;
      const useAmount = Math.min(creditAmount, remaining);
      applied += useAmount;

      await client.query("UPDATE referral_credits SET used_on_gift_id = $1 WHERE id = $2", [
        giftId,
        credit.id,
      ]);
    }

    await client.query("COMMIT");
    return applied;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[referral] applyCreditToGift failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

// ─── Admin: Referral Attribution ─────────────────────────────────────────────

/**
 * Returns referral attribution data for the admin dashboard.
 * Shows all referrals with referrer and referee names, statuses, and dates.
 *
 * @param limit - Maximum number of records to return (default 50, max 100).
 * @param offset - Pagination offset.
 * @returns Array of referral attribution records.
 */
export async function getReferralAttribution(
  limit: number = 50,
  offset: number = 0
): Promise<ReferralAttribution[]> {
  const safeLimit = Math.min(100, Math.max(1, limit));
  const { rows } = await pool.query(
    "SELECT r.referrer_id, ru.display_name as referrer_name, r.referee_id, fu.display_name as referee_name, r.referral_code, r.status, r.credited_at, r.created_at FROM referrals r JOIN users ru ON ru.id = r.referrer_id JOIN users fu ON fu.id = r.referee_id ORDER BY r.created_at DESC LIMIT $1 OFFSET $2",
    [safeLimit, offset]
  );

  return rows.map((row) => ({
    referrerId: row.referrer_id,
    referrerName: row.referrer_name,
    refereeId: row.referee_id,
    refereeName: row.referee_name,
    referralCode: row.referral_code,
    status: row.status,
    creditedAt: row.credited_at,
    createdAt: new Date(row.created_at),
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapReferralRow(row: Record<string, unknown>): Referral {
  return {
    id: row.id as string,
    referrerId: row.referrer_id as string,
    refereeId: row.referee_id as string,
    referralCode: row.referral_code as string,
    status: row.status as ReferralStatus,
    creditedAt: row.credited_at ? new Date(row.credited_at as string) : null,
    signupIp: (row.signup_ip as string) ?? null,
    signupUserAgent: (row.signup_user_agent as string) ?? null,
    signupDeviceFingerprint: (row.signup_device_fingerprint as string) ?? null,
    fraudFlags: (row.fraud_flags as string[]) ?? [],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
