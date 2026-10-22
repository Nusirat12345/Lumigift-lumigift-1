/**
 * @jest-environment node
 *
 * Unit tests for src/server/services/notification-preferences.service.ts (Issue #358).
 */

import { readFileSync } from "fs";
import { join } from "path";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock("../audit.service", () => ({ createAuditLog: jest.fn() }));

import pool from "@/lib/db";
import { createAuditLog } from "../audit.service";
import {
  buildDefaultPreferences,
  getPreferences,
  isDeliverable,
  updatePreferences,
} from "../notification-preferences.service";

const mockQuery = pool.query as jest.Mock;
const mockAudit = createAuditLog as jest.Mock;

/**
 * In-memory stand-in for the user_notification_preferences table. It lives
 * outside the service module, so it survives module re-imports ("restarts").
 */
type Row = { channel: string; category: string; enabled: boolean; updated_at: Date };
let table: Map<string, Row>;

function installFakeDb() {
  table = new Map();
  mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.trim().startsWith("SELECT channel")) {
      return { rows: [...table.values()] };
    }
    if (sql.trim().startsWith("SELECT enabled")) {
      const row = table.get(`${params[1]}:${params[2]}`);
      return { rows: row ? [{ enabled: row.enabled }] : [] };
    }
    if (sql.includes("INSERT INTO user_notification_preferences")) {
      const overwrite = sql.includes("DO UPDATE");
      for (let i = 1; i < params.length; i += 3) {
        const key = `${params[i]}:${params[i + 1]}`;
        if (overwrite || !table.has(key)) {
          table.set(key, {
            channel: params[i] as string,
            category: params[i + 1] as string,
            enabled: params[i + 2] as boolean,
            updated_at: new Date(),
          });
        }
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  installFakeDb();
});

describe("buildDefaultPreferences", () => {
  it("covers every channel × category with marketing disabled", () => {
    const defaults = buildDefaultPreferences();
    expect(defaults).toHaveLength(9);
    for (const entry of defaults) {
      expect(entry.enabled).toBe(entry.category !== "marketing");
    }
  });
});

describe("getPreferences", () => {
  it("seeds and returns defaults when the user has no rows", async () => {
    const prefs = await getPreferences("user-1");
    expect(prefs.userId).toBe("user-1");
    expect(prefs.preferences).toHaveLength(9);
    expect(prefs.preferences.filter((p) => p.enabled)).toHaveLength(6);
    expect(prefs.updatedAt).toBeInstanceOf(Date);
  });

  it("returns stored rows without re-seeding", async () => {
    await getPreferences("user-1");
    mockQuery.mockClear();
    await getPreferences("user-1");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe("updatePreferences", () => {
  it("applies changes and writes an audit log", async () => {
    await getPreferences("user-1");
    const prefs = await updatePreferences(
      "user-1",
      [{ channel: "email", category: "marketing", enabled: true }],
      "user-1"
    );
    expect(prefs.preferences).toContainEqual({
      channel: "email",
      category: "marketing",
      enabled: true,
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "notification_preferences_updated",
        metadata: expect.objectContaining({ updatesApplied: 1, skippedMandatory: 0 }),
      })
    );
  });

  it("ignores attempts to disable security notifications", async () => {
    await getPreferences("user-1");
    const prefs = await updatePreferences(
      "user-1",
      [{ channel: "sms", category: "security", enabled: false }],
      "user-1"
    );
    expect(prefs.preferences).toContainEqual({
      channel: "sms",
      category: "security",
      enabled: true,
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ skippedMandatory: 1 }) })
    );
  });
});

describe("isDeliverable", () => {
  it("does not deliver to opted-out users", async () => {
    await updatePreferences(
      "user-1",
      [{ channel: "sms", category: "lifecycle", enabled: false }],
      "user-1"
    );
    expect(await isDeliverable("user-1", "sms", "lifecycle")).toBe(false);
  });

  it("always delivers security messages without a DB lookup", async () => {
    expect(await isDeliverable("user-1", "push", "security")).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("falls back to defaults when no row is stored", async () => {
    expect(await isDeliverable("user-1", "email", "lifecycle")).toBe(true);
    expect(await isDeliverable("user-1", "email", "marketing")).toBe(false);
  });
});

describe("persistence across service restarts", () => {
  it("reads previously saved preferences after the module is reloaded", async () => {
    await updatePreferences(
      "user-1",
      [{ channel: "push", category: "lifecycle", enabled: false }],
      "user-1"
    );

    let reloaded!: typeof import("../notification-preferences.service");
    jest.isolateModules(() => {
      reloaded = jest.requireActual("../notification-preferences.service");
    });

    expect(await reloaded.isDeliverable("user-1", "push", "lifecycle")).toBe(false);
  });
});

describe("migration 0007_notification_preferences.sql", () => {
  const sql = readFileSync(
    join(process.cwd(), "migrations", "0007_notification_preferences.sql"),
    "utf8"
  );

  it("defines channel and category enums matching the service types", () => {
    expect(sql).toMatch(/CREATE TYPE notification_channel AS ENUM \('sms', 'email', 'push'\)/);
    expect(sql).toMatch(
      /CREATE TYPE notification_category AS ENUM \('security', 'lifecycle', 'marketing'\)/
    );
  });

  it("creates the table idempotently with the upsert unique constraint", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_notification_preferences/);
    expect(sql).toMatch(/UNIQUE \(user_id, channel, category\)/);
    expect(sql).toMatch(/enabled\s+BOOLEAN\s+NOT NULL/);
  });

  it("indexes user_id and maintains updated_at via trigger", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_notif_prefs_user_id/);
    expect(sql).toMatch(/CREATE TRIGGER trg_notif_prefs_updated_at/);
  });

  it("seeds marketing as disabled for existing users", () => {
    expect(sql).toMatch(/WHEN cat\.category = 'marketing' THEN FALSE/);
    expect(sql).toMatch(/ON CONFLICT \(user_id, channel, category\) DO NOTHING/);
  });
});
