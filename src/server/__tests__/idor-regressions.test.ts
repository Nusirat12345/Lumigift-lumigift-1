/**
 * @jest-environment node
 *
 * IDOR (Insecure Direct Object Reference) regression tests (Issue #354).
 * Ownership checks run for real inside the route handlers — only the data
 * layer and external side effects are mocked.
 */

import { createHash } from "crypto";
import { NextRequest } from "next/server";
import type { Gift } from "@/types";

const hash = (p: string) => createHash("sha256").update(p).digest("hex");

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/csrf", () => ({ withCsrf: (h: unknown) => h }));
jest.mock("@/lib/db", () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock("@sentry/nextjs", () => ({ withScope: jest.fn(), captureException: jest.fn() }));
jest.mock("@/server/services/gift.service", () => ({
  getGiftById: jest.fn(),
  getGiftsByRecipient: jest.fn(),
  getGiftsBySender: jest.fn(),
  createGift: jest.fn(),
  hashPhone: (p: string) => createHash("sha256").update(p).digest("hex"),
}));
jest.mock("@/server/services/claim.service", () => ({ claimGift: jest.fn() }));
jest.mock("@/server/services/invitation.service", () => ({
  getInvitationByPhoneAndGift: jest.fn(),
  claimInvitation: jest.fn(),
}));
jest.mock("@/server/services/cancellation.service", () => ({
  cancelGiftForSender: jest.fn(),
  getCancellationEligibility: jest.fn(() => ({ cancellable: true })),
}));
jest.mock("@/server/services/privacy.service", () => ({
  exportUserData: jest.fn(),
  deleteUserData: jest.fn(),
}));
jest.mock("@/server/services/moderation.service", () => ({ reportMessage: jest.fn() }));

import { getServerSession } from "next-auth";
import { getGiftById } from "@/server/services/gift.service";
import { claimGift } from "@/server/services/claim.service";
import { cancelGiftForSender } from "@/server/services/cancellation.service";
import { exportUserData, deleteUserData } from "@/server/services/privacy.service";
import { reportMessage } from "@/server/services/moderation.service";

const mockSession = getServerSession as jest.Mock;
const mockGetGift = getGiftById as jest.Mock;

const GIFT_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const USER_A = { id: "user-a", phone: "+2348011111111" };
const USER_B = { id: "user-b", phone: "+2348022222222" };
const STELLAR_KEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/** A gift sent by user B to user B's own phone — user A has no relation to it. */
function giftOwnedByB(overrides: Partial<Gift> = {}): Gift {
  return {
    id: GIFT_ID,
    senderId: USER_B.id,
    recipientPhoneHash: hash(USER_B.phone),
    recipientName: "Bola",
    amountNgn: 5000,
    amountUsdc: "3.0000000",
    message: "Private message",
    unlockAt: new Date(Date.now() + 86_400_000),
    status: "locked",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function req(url: string, init: { method?: string; body?: unknown } = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const ctx = { params: { id: GIFT_ID } };

beforeEach(() => jest.clearAllMocks());

describe("IDOR: user A cannot read a gift owned by user B", () => {
  it("returns only public claim-page fields", async () => {
    const { GET } = await import("@/app/api/v1/gifts/[id]/route");
    mockSession.mockResolvedValue({ user: USER_A });
    mockGetGift.mockResolvedValue(giftOwnedByB());

    const res = await GET(req(`/api/v1/gifts/${GIFT_ID}`), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual(["id", "recipientName", "status", "unlockAt"]);
    expect(body.data).not.toHaveProperty("senderId");
    expect(body.data).not.toHaveProperty("recipientPhoneHash");
    expect(body.data).not.toHaveProperty("message");
    expect(body.data).not.toHaveProperty("amountUsdc");
  });

  it("does not expose the cancellation preview", async () => {
    const { GET } = await import("@/app/api/v1/gifts/[id]/cancel/route");
    mockSession.mockResolvedValue({ user: USER_A });
    mockGetGift.mockResolvedValue(giftOwnedByB());

    const res = await GET(req(`/api/v1/gifts/${GIFT_ID}/cancel`), ctx);

    expect(res.status).toBe(404);
  });
});

describe("IDOR: user A cannot cancel a gift owned by user B", () => {
  it("returns 404 and never calls the cancellation service", async () => {
    const { DELETE } = await import("@/app/api/v1/gifts/[id]/route");
    mockSession.mockResolvedValue({ user: USER_A });
    mockGetGift.mockResolvedValue(giftOwnedByB());

    const res = await DELETE(req(`/api/v1/gifts/${GIFT_ID}`, { method: "DELETE" }), ctx);

    expect(res.status).toBe(404);
    expect(cancelGiftForSender).not.toHaveBeenCalled();
  });
});

describe("IDOR: user A cannot claim a gift addressed to user B", () => {
  it("returns 404 for a wrong phone hash and never pays out", async () => {
    const { POST } = await import("@/app/api/v1/gifts/[id]/claim/route");
    mockSession.mockResolvedValue({ user: USER_A });
    mockGetGift.mockResolvedValue(giftOwnedByB({ status: "unlocked" }));

    const res = await POST(
      req(`/api/v1/gifts/${GIFT_ID}/claim`, {
        method: "POST",
        body: { recipientStellarKey: STELLAR_KEY },
      }),
      ctx
    );

    expect(res.status).toBe(404);
    expect(claimGift).not.toHaveBeenCalled();
  });
});

describe("Unauthenticated requests to protected endpoints return 401", () => {
  const cases: Array<[string, () => Promise<Response>, jest.Mock[]]> = [
    [
      "GET /api/v1/gifts",
      async () => (await import("@/app/api/v1/gifts/route")).GET(req("/api/v1/gifts")),
      [],
    ],
    [
      "POST /api/v1/gifts",
      async () =>
        (await import("@/app/api/v1/gifts/route")).POST(
          req("/api/v1/gifts", { method: "POST", body: {} })
        ),
      [],
    ],
    [
      "DELETE /api/v1/gifts/[id]",
      async () =>
        (await import("@/app/api/v1/gifts/[id]/route")).DELETE(
          req(`/api/v1/gifts/${GIFT_ID}`, { method: "DELETE" }),
          ctx
        ),
      [cancelGiftForSender as jest.Mock],
    ],
    [
      "GET /api/v1/gifts/[id]/cancel",
      async () =>
        (await import("@/app/api/v1/gifts/[id]/cancel/route")).GET(
          req(`/api/v1/gifts/${GIFT_ID}/cancel`),
          ctx
        ),
      [],
    ],
    [
      "POST /api/v1/gifts/[id]/claim",
      async () =>
        (await import("@/app/api/v1/gifts/[id]/claim/route")).POST(
          req(`/api/v1/gifts/${GIFT_ID}/claim`, {
            method: "POST",
            body: { recipientStellarKey: STELLAR_KEY },
          }),
          ctx
        ),
      [claimGift as jest.Mock],
    ],
    [
      "POST /api/v1/gifts/[id]/report",
      async () =>
        (await import("@/app/api/v1/gifts/[id]/report/route")).POST(
          req(`/api/v1/gifts/${GIFT_ID}/report`, { method: "POST", body: { reason: "spam" } }),
          ctx
        ),
      [reportMessage as jest.Mock],
    ],
    [
      "GET /api/v1/users",
      async () =>
        (await import("@/app/api/v1/users/route")).GET(req("/api/v1/users?phone=%2B2348011111111")),
      [],
    ],
    [
      "GET /api/v1/users/me/export",
      async () =>
        (await import("@/app/api/v1/users/me/export/route")).GET(req("/api/v1/users/me/export")),
      [exportUserData as jest.Mock],
    ],
    [
      "DELETE /api/v1/users/me",
      async () =>
        (await import("@/app/api/v1/users/me/route")).DELETE(
          req("/api/v1/users/me", { method: "DELETE", body: { otp: "123456" } })
        ),
      [deleteUserData as jest.Mock],
    ],
    [
      "POST /api/v1/uploads",
      async () =>
        (await import("@/app/api/v1/uploads/route")).POST(
          req("/api/v1/uploads", { method: "POST" })
        ),
      [],
    ],
    [
      "POST /api/v1/uploads/sign",
      async () =>
        (await import("@/app/api/v1/uploads/sign/route")).POST(
          req("/api/v1/uploads/sign", { method: "POST" })
        ),
      [],
    ],
  ];

  it.each(cases)("%s", async (_name, call, sideEffects) => {
    mockSession.mockResolvedValue(null);
    mockGetGift.mockResolvedValue(giftOwnedByB({ status: "unlocked" }));

    const res = await call();

    expect(res.status).toBe(401);
    for (const fn of sideEffects) expect(fn).not.toHaveBeenCalled();
  });
});
