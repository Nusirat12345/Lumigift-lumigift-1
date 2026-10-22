import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types";
import { getRedisClient } from "@/lib/redis";

/**
 * Server-side cache helpers backed by Redis.
 *
 * These utilities implement the caching strategy required by issue #330:
 * - Public endpoints (exchange-rate, templates) use `Cache-Control: public, max-age=...`
 * - User-specific endpoints use `Cache-Control: private, no-store`
 */

/**
 * Wraps a handler and sets the response `Cache-Control` header to the given
 * directive. Use for public, cacheable endpoints (exchange-rate, templates).
 *
 * @param directive - Full Cache-Control header value, e.g. `"public, max-age=3600"`.
 * @returns A wrapper that stamps the header on every successful response.
 */
export function withCacheControl(directive: string) {
  return function <T extends typeof NextResponse>(handler: () => Promise<T>): Promise<T> {
    return handler().then((res) => {
      res.headers.set("Cache-Control", directive);
      return res;
    });
  };
}

/**
 * Adds `Cache-Control: private, no-store` to a response.
 * Use for user-specific endpoints that must never be cached in shared caches.
 */
export function setPrivateNoStore<T>(
  res: NextResponse<ApiResponse<T>>
): NextResponse<ApiResponse<T>> {
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

/**
 * Redis-backed server-side cache wrapper for GET endpoints.
 *
 * If a cached response exists for `key`, it is returned immediately with the
 * stored `Cache-Control` header. Otherwise, `fetcher` is called, its response
 * JSON is cached in Redis with `ttlSec`, and the response is returned with the
 * provided `cacheControl` directive.
 *
 * @param key - Redis cache key (should include any request-varying params).
 * @param ttlSec - Time-to-live for the Redis entry, in seconds.
 * @param cacheControl - `Cache-Control` header value to set on the response.
 * @param fetcher - Function that produces the response body when cache misses.
 * @returns A NextResponse with the cached or freshly-fetched body.
 */
export async function cachedJsonResponse<T>(
  key: string,
  ttlSec: number,
  cacheControl: string,
  fetcher: () => Promise<T>
): Promise<NextResponse<ApiResponse<T>>> {
  try {
    const redis = await getRedisClient();
    const hit = await redis.get(key);
    if (hit) {
      const res = NextResponse.json<ApiResponse<T>>({ success: true, data: hit as unknown as T });
      res.headers.set("Cache-Control", cacheControl);
      res.headers.set("X-Cache", "HIT");
      return res;
    }
  } catch {
    // Redis unavailable — fall through to live fetch
  }

  const data = await fetcher();

  // Store in Redis (best-effort; don't block response on cache write failures)
  try {
    const redis = await getRedisClient();
    await redis.setEx(key, ttlSec, JSON.stringify(data));
  } catch {
    // Cache write failed — response still served live
  }

  const res = NextResponse.json<ApiResponse<T>>({ success: true, data });
  res.headers.set("Cache-Control", cacheControl);
  res.headers.set("X-Cache", "MISS");
  return res;
}
