/**
 * GET /api/v1/referrals/code
 *
 * Returns the authenticated user's unique referral code.
 * Creates one on first request if the user doesn't have one yet.
 *
 * Issue #328 — Referral programme for new user acquisition.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandler } from "@/server/middleware";
import { setPrivateNoStore } from "@/lib/cache";
import { getOrCreateReferralCode, getAvailableCredit } from "@/server/services/referral.service";
import type { ApiResponse } from "@/types";

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const referralCode = await getOrCreateReferralCode(userId);
  const availableCredit = await getAvailableCredit(userId);

  return setPrivateNoStore(
    NextResponse.json<
      ApiResponse<{ referralCode: string; availableCreditNgn: number; bonusNgn: number }>
    >({
      success: true,
      data: {
        referralCode,
        availableCreditNgn: availableCredit,
        bonusNgn: 500,
      },
    })
  );
});
