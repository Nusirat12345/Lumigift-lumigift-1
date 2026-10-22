/**
 * GET /api/v1/exchange-rate/quote
 *
 * Returns a real-time NGN → USDC conversion quote using the existing
 * exchange rate service.  The quote is valid for 60 seconds.
 *
 * Query params:
 *   amountNgn — Amount in Nigerian Naira (required, positive number)
 *
 * Response:
 *   amountNgn    — The input amount in NGN
 *   amountUsdc   — Equivalent amount in USDC (4 decimal places)
 *   ngnPerUsdc   — Exchange rate used
 *   fetchedAt    — ISO 8601 timestamp when the rate was fetched
 *   expiresAt    — ISO 8601 timestamp 60 seconds after fetchedAt
 *   provider     — Rate source ('cache' | 'horizon' | 'fallback-provider' | 'fallback')
 *
 * Issue #151 — Multi-currency pricing display.
 */
import { NextRequest } from "next/server";
import { withAuth, withErrorHandler, AppError, ERROR_CODES } from "@/server/middleware";
import { getExchangeRate } from "@/server/services/exchange-rate.service";
import { cachedJsonResponse } from "@/lib/cache";

/** Quote response shape. */
export interface ExchangeRateQuote {
  amountNgn: number;
  amountUsdc: number;
  ngnPerUsdc: number;
  fetchedAt: string;
  expiresAt: string;
  provider: string;
}

/** Quote validity window in seconds. */
const QUOTE_TTL_SEC = 60;

export const GET = withErrorHandler(
  withAuth(async (req: NextRequest) => {
    const { searchParams } = req.nextUrl;

    const rawAmount = searchParams.get("amountNgn");
    if (!rawAmount) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, "amountNgn is required", 400);
    }

    const amountNgn = parseFloat(rawAmount);
    if (!isFinite(amountNgn) || amountNgn <= 0) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, "amountNgn must be a positive number", 400);
    }

    // Redis server-side cache keyed by amount — avoids redundant rate fetches + DB calls
    return cachedJsonResponse<ExchangeRateQuote>(
      `rate:quote:${amountNgn}`,
      QUOTE_TTL_SEC,
      "public, max-age=60, stale-while-revalidate=300",
      async () => {
        const rateResult = await getExchangeRate();

        const fetchedAt = new Date();
        const expiresAt = new Date(fetchedAt.getTime() + QUOTE_TTL_SEC * 1000);

        const amountUsdc = parseFloat((amountNgn / rateResult.ngnPerUsdc).toFixed(4));

        return {
          amountNgn,
          amountUsdc,
          ngnPerUsdc: rateResult.ngnPerUsdc,
          fetchedAt: fetchedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          provider: rateResult.source,
        };
      }
    );
  })
);
