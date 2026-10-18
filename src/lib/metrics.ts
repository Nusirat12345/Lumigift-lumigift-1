/**
 * Lightweight observability metrics for cron jobs and webhooks.
 *
 * Emits structured JSON log lines (via the pino logger) that can be
 * ingested by any log aggregation service (Logtail, Datadog, CloudWatch).
 * Errors are also captured in Sentry with a metric-tagged scope.
 *
 * Design constraints:
 *   - No PII or secrets are ever logged. Fields such as phone numbers,
 *     payment references, and gift amounts are intentionally excluded.
 *   - All values are numeric counters, durations (ms), or safe status
 *     strings so dashboards can be built on top without scrubbing.
 *
 * Usage:
 *   const timer = startTimer();
 *   try {
 *     const result = await doWork();
 *     recordCronSuccess("cron/unlock", timer(), { processed: result });
 *   } catch (err) {
 *     recordCronFailure("cron/unlock", timer(), err);
 *   }
 */

import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import type { Gift, GiftStatus } from "@/types";

// ── Gift funnel metrics (Prometheus) ──────────────────────────────────────────
//
// In-process counters and histograms for the create → pay → lock → claim
// funnel, rendered in Prometheus text format by GET /api/metrics. Values are
// per server instance; Prometheus aggregates across instances with sum().

export type FunnelCounter =
  "gifts_created" | "gifts_paid" | "gifts_locked" | "gifts_claimed" | "gifts_expired";

type FunnelHistogram = "time_to_claim_seconds" | "payment_processing_seconds";

const COUNTER_HELP: Record<FunnelCounter, string> = {
  gifts_created: "Gifts created",
  gifts_paid: "Gifts whose payment was confirmed",
  gifts_locked: "Gifts locked in escrow",
  gifts_claimed: "Gifts claimed by the recipient",
  gifts_expired: "Unlocked gifts that expired unclaimed",
};

const HISTOGRAM_HELP: Record<FunnelHistogram, string> = {
  time_to_claim_seconds: "Seconds from unlock to claim",
  payment_processing_seconds: "Seconds from gift creation to payment confirmation",
};

const HISTOGRAM_BUCKETS: Record<FunnelHistogram, number[]> = {
  // 1 min, 10 min, 1 h, 6 h, 1 d, 3 d, 7 d, 30 d, 90 d
  time_to_claim_seconds: [60, 600, 3600, 21600, 86400, 259200, 604800, 2592000, 7776000],
  // 5 s, 15 s, 30 s, 1 min, 5 min, 15 min, 1 h, 1 d
  payment_processing_seconds: [5, 15, 30, 60, 300, 900, 3600, 86400],
};

const counters = new Map<FunnelCounter, number>();
const histograms = new Map<FunnelHistogram, { buckets: number[]; sum: number; count: number }>();

/** Increments a gift funnel counter. */
export function incrementFunnelCounter(name: FunnelCounter, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

/** Records one observation (in seconds) in a gift funnel histogram. */
export function observeFunnelHistogram(name: FunnelHistogram, seconds: number): void {
  const bounds = HISTOGRAM_BUCKETS[name];
  const h = histograms.get(name) ?? { buckets: bounds.map(() => 0), sum: 0, count: 0 };
  bounds.forEach((le, i) => {
    if (seconds <= le) h.buckets[i]++;
  });
  h.sum += seconds;
  h.count++;
  histograms.set(name, h);
}

/**
 * Updates funnel metrics for a gift status change. Called from the gift
 * service whenever a status transition succeeds.
 */
export function recordFunnelTransition(
  gift: Gift,
  fromStatus: GiftStatus,
  toStatus: GiftStatus
): void {
  const nowMs = Date.now();
  if (fromStatus === "pending_payment" && (toStatus === "funded" || toStatus === "locked")) {
    incrementFunnelCounter("gifts_paid");
    observeFunnelHistogram("payment_processing_seconds", (nowMs - gift.createdAt.getTime()) / 1000);
  }
  if (toStatus === "locked") incrementFunnelCounter("gifts_locked");
  if (toStatus === "claimed") {
    incrementFunnelCounter("gifts_claimed");
    observeFunnelHistogram(
      "time_to_claim_seconds",
      Math.max(0, (nowMs - gift.unlockAt.getTime()) / 1000)
    );
  }
  if (toStatus === "expired") incrementFunnelCounter("gifts_expired");
}

/** Renders all funnel metrics in the Prometheus text exposition format. */
export function renderPrometheusMetrics(): string {
  const lines: string[] = [];
  for (const name of Object.keys(COUNTER_HELP) as FunnelCounter[]) {
    lines.push(`# HELP ${name}_total ${COUNTER_HELP[name]}`, `# TYPE ${name}_total counter`);
    lines.push(`${name}_total ${counters.get(name) ?? 0}`);
  }
  for (const name of Object.keys(HISTOGRAM_HELP) as FunnelHistogram[]) {
    const bounds = HISTOGRAM_BUCKETS[name];
    const h = histograms.get(name) ?? { buckets: bounds.map(() => 0), sum: 0, count: 0 };
    lines.push(`# HELP ${name} ${HISTOGRAM_HELP[name]}`, `# TYPE ${name} histogram`);
    bounds.forEach((le, i) => lines.push(`${name}_bucket{le="${le}"} ${h.buckets[i]}`));
    lines.push(
      `${name}_bucket{le="+Inf"} ${h.count}`,
      `${name}_sum ${h.sum}`,
      `${name}_count ${h.count}`
    );
  }
  return lines.join("\n") + "\n";
}

/** Clears all funnel metrics. Intended for tests. */
export function resetFunnelMetrics(): void {
  counters.clear();
  histograms.clear();
}

// ── Timer ─────────────────────────────────────────────────────────────────────

/**
 * Returns a function that, when called, returns the elapsed time in milliseconds
 * since startTimer() was invoked.
 */
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

// ── Cron metrics ─────────────────────────────────────────────────────────────

/**
 * Records a successful cron run.
 *
 * @param job       - Identifier for the cron job, e.g. "cron/unlock".
 * @param durationMs - Elapsed time in milliseconds.
 * @param data       - Safe numeric or string counters (no PII).
 */
export function recordCronSuccess(
  job: string,
  durationMs: number,
  data?: Record<string, number | string>
): void {
  logger.info({ metric: "cron.run", job, status: "success", durationMs, ...data }, "[cron] run ok");
}

/**
 * Records a failed cron run. The error message is captured but the full
 * stack is kept server-side only via Sentry; nothing sensitive reaches logs.
 *
 * @param job        - Identifier for the cron job.
 * @param durationMs - Elapsed time in milliseconds before the failure.
 * @param err        - The thrown error.
 */
export function recordCronFailure(job: string, durationMs: number, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  logger.error(
    { metric: "cron.run", job, status: "error", durationMs, reason },
    "[cron] run failed"
  );

  Sentry.withScope((scope) => {
    scope.setTag("metric", "cron.run");
    scope.setTag("job", job);
    scope.setExtra("durationMs", durationMs);
    Sentry.captureException(err);
  });
}

// ── Webhook metrics ───────────────────────────────────────────────────────────

/**
 * Records a successfully processed webhook event.
 *
 * @param provider   - Payment provider identifier, e.g. "paystack" or "stripe".
 * @param eventType  - The webhook event type string (safe to log, not PII).
 * @param durationMs - Processing time in milliseconds.
 * @param status     - Outcome of the business logic, e.g. "locked" or "ignored".
 */
export function recordWebhookSuccess(
  provider: string,
  eventType: string,
  durationMs: number,
  status: string
): void {
  logger.info(
    { metric: "webhook.event", provider, eventType, status, durationMs },
    "[webhook] processed ok"
  );
}

/**
 * Records a failed or rejected webhook event.
 *
 * @param provider   - Payment provider identifier.
 * @param eventType  - The webhook event type string (or "unknown" if unparseable).
 * @param durationMs - Processing time before the failure.
 * @param reason     - Short failure reason label (no raw error messages with secrets).
 * @param err        - The underlying error, forwarded to Sentry only.
 */
export function recordWebhookFailure(
  provider: string,
  eventType: string,
  durationMs: number,
  reason: string,
  err?: unknown
): void {
  logger.error(
    { metric: "webhook.event", provider, eventType, status: "error", durationMs, reason },
    "[webhook] processing failed"
  );

  if (err) {
    Sentry.withScope((scope) => {
      scope.setTag("metric", "webhook.event");
      scope.setTag("provider", provider);
      scope.setTag("eventType", eventType);
      scope.setExtra("durationMs", durationMs);
      scope.setExtra("reason", reason);
      Sentry.captureException(err);
    });
  }
}

/**
 * Records a status transition for a gift (e.g. pending_payment → locked).
 * The gift ID is included so events are correlatable in logs, but no
 * personal data (phone, name, amount) is recorded here.
 *
 * @param giftId    - The gift's UUID.
 * @param fromStatus - Previous status.
 * @param toStatus   - New status.
 * @param trigger    - What caused the transition, e.g. "webhook:paystack".
 */
export function recordStatusTransition(
  giftId: string,
  fromStatus: string,
  toStatus: string,
  trigger: string
): void {
  logger.info(
    { metric: "gift.status_transition", giftId, fromStatus, toStatus, trigger },
    "[gift] status changed"
  );
}
