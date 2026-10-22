import { NextRequest, NextResponse } from "next/server";
import { verifyPayment } from "@/lib/paystack";
import { updateGiftStatus } from "@/server/services/gift.service";
import { validateSlippage } from "@/server/services/exchange-rate.service";
import { creditReferralOnFirstPayment } from "@/server/services/referral.service";
import { withErrorHandler } from "@/server/middleware";

/** Paystack redirects here after payment. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");
  const giftId = searchParams.get("giftId");

  if (!reference || !giftId) {
    return NextResponse.redirect(new URL("/error?code=bad_callback", req.url));
  }

  const result = await verifyPayment(reference);

  if (result.status === "success") {
    // Validate slippage before locking funds
    const slippage = await validateSlippage(giftId);
    if (!slippage.valid) {
      await updateGiftStatus(giftId, "pending_payment");
      const reason = slippage.reason === "rate_expired" ? "rate_expired" : "rate_slippage";
      return NextResponse.redirect(
        new URL(`/gift/${giftId}/payment-failed?reason=${reason}`, req.url)
      );
    }

    await updateGiftStatus(giftId, "locked");

    // ── Referral credit (Issue #328) ──────────────────────────────────────────
    // After the first gift payment is confirmed, credit both the referrer
    // and the referee ₦500 if a referral relationship exists.
    try {
      const pool = (await import("@/lib/db")).default;
      const { rows } = await pool.query<{ sender_id: string }>(
        "SELECT sender_id FROM gifts WHERE id = $1 LIMIT 1",
        [giftId]
      );
      if (rows.length > 0) {
        await creditReferralOnFirstPayment(rows[0].sender_id);
      }
    } catch (err) {
      // Don't block the payment flow on referral credit failure
      console.error("[payments/callback] Referral credit failed:", err);
    }

    return NextResponse.redirect(new URL(`/gift/${giftId}/success`, req.url));
  }

  await updateGiftStatus(giftId, "pending_payment");
  return NextResponse.redirect(new URL(`/gift/${giftId}/payment-failed`, req.url));
});
