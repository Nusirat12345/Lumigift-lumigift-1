/**
 * @jest-environment node
 *
 * Cache-Control header tests — Issue #330
 *
 * Verifies that:
 *  - Exchange rate endpoint returns `Cache-Control: public, max-age=60, stale-while-revalidate=300`
 *  - Gift templates endpoint returns `Cache-Control: public, max-age=3600`
 *  - User-specific endpoints return `Cache-Control: private, no-store`
 *  - Redis is used for server-side caching where appropriate
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

// ─── Mock Redis ──────────────────────────────────────────────────────────────

const mockRedisStore = new Map<string, string>();

jest.mock("@/lib/redis", () => ({
  getRedisClient: jest.fn().mockResolvedValue({
    get: jest.fn(async (key: string) => mockRedisStore.get(key) ?? null),
    setEx: jest.fn(async (key: string, _ttl: number, value: string) => {
      mockRedisStore.set(key, value);
    }),
  }),
}));

// ─── Mock auth ────────────────────────────────────────────────────────────────

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

// ─── Mock exchange rate service ───────────────────────────────────────────────

jest.mock("@/server/services/exchange-rate.service", () => ({
  getExchangeRate: jest.fn().mockResolvedValue({
    ngnPerUsdc: 1600,
    stale: false,
    source: "cache",
  }),
}));

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Issue #330 — API response caching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisStore.clear();
  });

  describe("Exchange rate endpoint (GET /api/v1/exchange-rate/quote)", () => {
    it("returns Cache-Control: public, max-age=60, stale-while-revalidate=300", async () => {
      const { getServerSession } = require("next-auth");
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: "test-user" },
      });

      const { GET } = require("@/app/api/v1/exchange-rate/quote/route");

      const url = new URL("http://localhost:3000/api/v1/exchange-rate/quote?amountNgn=5000");
      const req = new NextRequest(url);
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=60, stale-while-revalidate=300"
      );
    });

    it("serves from Redis cache on subsequent calls (X-Cache: HIT)", async () => {
      const { getRedisClient } = require("@/lib/redis");
      (getRedisClient as jest.Mock).mockResolvedValue({
        get: jest.fn(async (key: string) =>
          key.startsWith("rate:quote:") ? JSON.stringify({ amountNgn: 5000 }) : null
        ),
        setEx: jest.fn(),
      });

      const { getServerSession } = require("next-auth");
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: "test-user" },
      });

      const { GET } = require("@/app/api/v1/exchange-rate/quote/route");

      const url = new URL("http://localhost:3000/api/v1/exchange-rate/quote?amountNgn=5000");
      const req = new NextRequest(url);
      const res = await GET(req);

      expect(res.headers.get("X-Cache")).toBe("HIT");
    });
  });

  describe("Gift templates endpoint (GET /api/v1/gifts/templates)", () => {
    it("returns Cache-Control: public, max-age=3600", async () => {
      const { GET } = require("@/app/api/v1/gifts/templates/route");

      const url = new URL("http://localhost:3000/api/v1/gifts/templates");
      const req = new NextRequest(url);
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    });

    it("returns a non-empty array of templates", async () => {
      const { GET } = require("@/app/api/v1/gifts/templates/route");

      const url = new URL("http://localhost:3000/api/v1/gifts/templates");
      const req = new NextRequest(url);
      const res = await GET(req);
      const body: ApiResponse<any> = await res.json();

      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data!.length).toBeGreaterThan(0);
    });
  });

  describe("User-specific endpoints set Cache-Control: private, no-store", () => {
    it("setPrivateNoStore stamps private, no-store on any response", async () => {
      const { setPrivateNoStore } = require("@/lib/cache");
      const res = NextResponse.json<ApiResponse<{ test: true }>>({
        success: true,
        data: { test: true },
      });
      setPrivateNoStore(res);

      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    });
  });
});
