/**
 * GET /api/v1/gifts/[id]/download
 *
 * Returns an accessible, text-based PDF gift card for download.
 *
 * The card includes: sender name, amount (revealed at unlock), personalised
 * message, and a QR code linking to the gift claim page.
 *
 * Issue #329 — Gift card physical print and digital download option.
 *
 * Access control:
 *  - The sender can download the card at any time.
 *  - The recipient can download only after the gift has unlocked.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGiftById, hashPhone } from "@/server/services/gift.service";
import { withErrorHandler } from "@/server/middleware";
import { generateGiftCardPdf } from "@/lib/gift-card-pdf";
import type { ApiResponse } from "@/types";

export const GET = withErrorHandler(async (_req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };
  const gift = await getGiftById(params.id);

  if (!gift) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Gift not found" },
      { status: 404 }
    );
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const phone = (session?.user as { phone?: string } | undefined)?.phone;
  const recipientPhoneHash = phone ? hashPhone(phone) : undefined;

  const isSender = !!userId && gift.senderId === userId;
  const isRecipient = !!recipientPhoneHash && gift.recipientPhoneHash === recipientPhoneHash;

  // Unauthenticated or unrelated users cannot download
  if (!isSender && !isRecipient) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Recipients can only download after unlock (amount is hidden until then)
  const unlocked = gift.status === "unlocked" || gift.status === "claimed";
  if (isRecipient && !unlocked) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Gift is not yet unlocked" },
      { status: 403 }
    );
  }

  // Fetch sender display name
  let senderName = "Someone";
  try {
    const pool = (await import("@/lib/db")).default;
    const { rows } = await pool.query<{ display_name: string }>(
      "SELECT display_name FROM users WHERE id = $1",
      [gift.senderId]
    );
    if (rows[0]?.display_name) senderName = rows[0].display_name;
  } catch {
    // Fall back to "Someone" if DB query fails
  }

  const pdfBytes = generateGiftCardPdf({
    senderName,
    recipientName: gift.recipientName,
    amountNgn: gift.amountNgn,
    message: gift.message,
    unlockAt: new Date(gift.unlockAt),
    giftId: gift.id,
  });

  // Convert Uint8Array to Buffer for the response body
  const pdfBuffer = Buffer.from(pdfBytes);

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="lumigift-card-${gift.id}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
      // PDF is user-specific — never cache in shared caches
      "Cache-Control": "private, no-store",
    },
  });
});
