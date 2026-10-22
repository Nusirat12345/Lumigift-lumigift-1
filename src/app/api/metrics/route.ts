import { NextRequest, NextResponse } from "next/server";
import { renderPrometheusMetrics } from "@/lib/metrics";
import { isAuthorizedCronRequest } from "@/server/cron-auth";

/**
 * GET /api/metrics
 *
 * Internal-only Prometheus scrape endpoint for gift funnel metrics.
 * Requires `Authorization: Bearer <METRICS_TOKEN>`; fails closed when the
 * token is unset, so the endpoint is never publicly readable.
 */
export const dynamic = "force-dynamic";

export const GET = async (req: NextRequest) => {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"), process.env.METRICS_TOKEN)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return new NextResponse(renderPrometheusMetrics(), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
