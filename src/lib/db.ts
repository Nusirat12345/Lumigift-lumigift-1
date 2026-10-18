import { Pool } from "pg";
import { serverConfig } from "@/server/config";

const pool = new Pool({
  connectionString: serverConfig.database.url,
  min: serverConfig.database.poolMin,
  max: serverConfig.database.poolMax,
  idleTimeoutMillis: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMillis: serverConfig.database.connectionTimeoutMs,
});

pool.on("connect", () => {
  // Fires for each new physical connection added to the pool
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

/**
 * Logs the current connection pool configuration to stdout.
 * Useful for verifying pool settings on application startup.
 */
export function logPoolMetrics() {
  console.log(
    `[db] Pool ready — min: ${serverConfig.database.poolMin}, max: ${serverConfig.database.poolMax}, ` +
      `idleTimeout: ${serverConfig.database.idleTimeoutMs}ms, connectionTimeout: ${serverConfig.database.connectionTimeoutMs}ms`
  );
}

/**
 * Gracefully drains and closes all connections in the pool.
 * Should be called during application shutdown to avoid connection leaks.
 *
 * @returns Resolves when all connections have been closed.
 */
export async function closePool() {
  await pool.end();
  if (readPool !== pool) await readPool.end();
  console.log("[db] Pool closed.");
}

/**
 * Read-only pool for GET endpoints (dashboard, gift lookup). Connects to
 * READ_REPLICA_DATABASE_URL when set; otherwise it is the primary pool, so
 * local dev and single-instance deployments need no extra configuration.
 * Never use it for writes or for reads that must see a just-committed write.
 */
export const readPool = serverConfig.database.readReplicaUrl
  ? new Pool({
      connectionString: serverConfig.database.readReplicaUrl,
      min: serverConfig.database.poolMin,
      max: serverConfig.database.poolMax,
      idleTimeoutMillis: serverConfig.database.idleTimeoutMs,
      connectionTimeoutMillis: serverConfig.database.connectionTimeoutMs,
    })
  : pool;

if (readPool !== pool) {
  readPool.on("error", (err) => {
    console.error("[db] Unexpected read replica pool error:", err.message);
  });
}

export default pool;
