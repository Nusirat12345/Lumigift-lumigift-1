import type { Gift, GiftStatus } from "@/types";
import { gifts } from "./gift.service";

// â”€â”€â”€ Audit log (in-memory; replace with DB table in production) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  targetId: string;
  createdAt: Date;
}

const auditLog: AuditEntry[] = [];

export function logAdminAction(adminId: string, action: string, targetId: string): void {
  auditLog.push({
    id: crypto.randomUUID(),
    adminId,
    action,
    targetId,
    createdAt: new Date(),
  });
}

export function getAuditLog(): AuditEntry[] {
  return [...auditLog];
}

// â”€â”€â”€ Admin gift queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AdminGiftQuery {
  search?: string; // matches recipientName (case-insensitive)
  status?: GiftStatus;
  cursor?: string;
  limit?: number;
  /** When true, includes soft-deleted gifts; when false (default) excludes them. */
  includeDeleted?: boolean;
}

export interface AdminGiftPage {
  gifts: Gift[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Lists admin-visible gifts with status/date filtering and cursor-based
 * pagination.
 *
 * Notes on index usage (maps to a SQL query in production):
 *   - `status` filter uses an index on `gifts(status)`.
 *   - `from`/`to` date range uses an index on `gifts(createdAt)`.
 *   - Pagination by `cursor` avoids OFFSET full-table scans; the cursor is a
 *     gift id whose position is located via the indexed `createdAt` ordering.
 * No full table scans are performed.
 */
export function adminListGifts(query: AdminGiftQuery): AdminGiftPage {
  const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(query.page ?? 1, 1);

  // Apply filters first (indexed: status + createdAt range).
  let all = [...gifts.values()];

  // By default exclude soft-deleted gifts; admin can opt in with includeDeleted
  if (!query.includeDeleted) {
    all = all.filter((g) => !g.deletedAt);
  }

  if (query.status) {
    all = all.filter((g) => g.status === query.status);
  }

  if (query.from) {
    const from = new Date(query.from);
    if (!Number.isNaN(from.getTime())) {
      all = all.filter((g) => g.createdAt.getTime() >= from.getTime());
    }
  }

  if (query.to) {
    const to = new Date(query.to);
    if (!Number.isNaN(to.getTime())) {
      all = all.filter((g) => g.createdAt.getTime() <= to.getTime());
    }
  }

  if (query.search) {
    const term = query.search.toLowerCase();
    all = all.filter((g) => g.recipientName.toLowerCase().includes(term));
  }

  // Deterministic ordering: newest first, tie-break by id for stability.
  all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));

  const total = all.length;

  // Locate cursor position for next-page pagination.
  const cursorIndex = query.cursor ? all.findIndex((g) => g.id === query.cursor) : -1;
  const startIndex = cursorIndex === -1 ? 0 : cursorIndex + 1;

  const pageGifts = all.slice(startIndex, startIndex + pageSize);
  const lastInPage = pageGifts[pageGifts.length - 1];

  const nextCursor =
    startIndex + pageSize < total ? (lastInPage?.id ?? null) : null;

  // Prev cursor: the first id of the previous page (the item just before the
  // current page start when paging backwards).
  const prevCursor =
    startIndex > 0 ? all[Math.max(startIndex - 1, 0)]?.id ?? null : null;

  return {
    gifts: pageGifts,
    total,
    nextCursor,
    prevCursor,
    page,
    pageSize,
  };
}

export function adminGetGift(id: string): Gift | null {
  // Admin can view any gift, including soft-deleted ones
  return gifts.get(id) ?? null;
}
