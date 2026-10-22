/**
 * GET /api/v1/admin/referrals
 *
 * Returns referral attribution data for the admin dashboard.
 * Shows referrer, referee, status, and credit information.
 *
 * Issue #328 — Admin dashboard shows referral attribution.
 */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/server/middleware";
import { requireAdmin } from "@/server/middleware/admin";
import { setPrivateNoStore } from "@/lib/cache";
import {
  getReferralAttribution,
  type ReferralAttribution,
} from "@/server/services/referral.service";
import type { ApiResponse } from "@/types";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10) || 50;
  const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

  const referrals = await getReferralAttribution(limit, offset);

  return setPrivateNoStore(
    NextResponse.json<ApiResponse<{ referrals: ReferralAttribution[]; count: number }>>({
      success: true,
      data: { referrals, count: referrals.length },
    })
  );
});
