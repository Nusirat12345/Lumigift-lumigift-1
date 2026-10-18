import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { withErrorHandler, withCsrf, validateBody } from "@/server/middleware";
import { validateInvitationToken, acceptInvitation } from "@/server/services/invitation.service";
import { trackReferralAtSignup } from "@/server/services/referral.service";
import { randomUUID } from "crypto";
import { registerSchema } from "@/types/schemas";
import type { ApiResponse } from "@/types";

export const POST = withErrorHandler(
  withCsrf(async (req: NextRequest) => {
    const validation = await validateBody(req, registerSchema);
    if (!validation.success) return validation.response;
    const { phone, displayName, invitationToken, referralCode } = validation.data;

    // Check if phone is already registered
    const { rows: existingUsers } = await pool.query(
      "SELECT 1 FROM users WHERE phone = $1 LIMIT 1",
      [phone]
    );

    if (existingUsers.length > 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "This phone number is already registered" },
        { status: 409 }
      );
    }

    // If invitation token is provided, validate it
    let invitationId: string | null = null;
    if (invitationToken) {
      const invitation = await validateInvitationToken(invitationToken);
      if (!invitation) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: "Invalid or expired invitation" },
          { status: 400 }
        );
      }

      // Verify the phone matches the invitation
      if (invitation.recipientPhone !== phone) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: "Phone number does not match invitation" },
          { status: 400 }
        );
      }

      invitationId = invitation.id;
    }

    // Create the user
    const userId = randomUUID();
    try {
      await pool.query("INSERT INTO users (id, phone, display_name) VALUES ($1, $2, $3)", [
        userId,
        phone,
        displayName,
      ]);

      // If there was an invitation, mark it as accepted
      if (invitationId) {
        await acceptInvitation(invitationId);
      }

      // ── Referral tracking (Issue #328) ──────────────────────────────────────
      // If a referral code was provided, track the referral relationship.
      // Credits are applied after the referee's first gift payment.
      if (referralCode) {
        try {
          const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
          const userAgent = req.headers.get("user-agent") ?? undefined;

          await trackReferralAtSignup({
            refereeId: userId,
            referralCode,
            signupIp: ip,
            signupUserAgent: userAgent,
            refereeName: displayName,
          });
        } catch (err) {
          // Don't block registration on referral tracking failure
          console.error("[register] Referral tracking failed:", err);
        }
      }

      return NextResponse.json<ApiResponse<{ userId: string; phone: string }>>(
        {
          success: true,
          data: { userId, phone },
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("[register] Error creating user:", error);
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Failed to create user account" },
        { status: 500 }
      );
    }
  })
);
