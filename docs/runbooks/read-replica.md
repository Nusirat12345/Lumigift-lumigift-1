# Runbook: PostgreSQL read replica

Issue #359. Terraform provisions `aws_db_instance.postgres_replica`, an RDS
read replica of the primary `aws_db_instance.postgres`.

## Routing

- `readPool` (`src/lib/db.ts`) connects to `READ_REPLICA_DATABASE_URL`; the
  default export `pool` connects to `DATABASE_URL` (primary).
- GET endpoints that tolerate a few seconds of lag use `readPool`: sender
  dashboard and recipient gift lookup (`gift.db.ts`), notifications list, and
  transaction history / receipts.
- Writes, transactions, and read-after-write lookups (for example
  `findGiftById` after a status change) stay on the primary.
- When `READ_REPLICA_DATABASE_URL` is unset, `readPool` is the primary pool.

## Replication lag alert

CloudWatch alarm `lumigift-<env>-replica-lag` fires when `ReplicaLag` exceeds
**5 seconds** for two consecutive 1-minute periods, notifying the
`lumigift-db-backup-alerts-<env>` SNS topic. Missing data counts as breaching,
so a stopped replica also alerts.

Response: check `ReplicaLag`, `WriteIOPS` on the primary and long-running
queries on the replica (`pg_stat_activity`). If lag persists, unset
`READ_REPLICA_DATABASE_URL` in App Runner to send all reads to the primary.

## Failover drill (replica promotion)

Run in staging before each production change to the database tier.

1. Record the latest gift: `psql "$DATABASE_URL" -c "SELECT max(created_at) FROM gifts;"`.
2. Simulate primary loss: `aws rds stop-db-instance --db-instance-identifier lumigift-staging`
   (or reboot with failover for Multi-AZ).
3. Promote the replica:
   `aws rds promote-read-replica --db-instance-identifier lumigift-staging-replica`
   and wait for `aws rds wait db-instance-available --db-instance-identifier lumigift-staging-replica`.
4. Point both `DATABASE_URL` and `READ_REPLICA_DATABASE_URL` secrets at the
   promoted instance's endpoint and redeploy App Runner.
5. Verify: `/api/health/ready` returns 200, the step-1 row is present, and a
   test gift can be created.
6. Re-import the promoted instance into Terraform as the new primary
   (`terraform state mv`) and re-apply to create a fresh replica.

Record the drill date, time to promote, and any data loss window in the
deployment log.
