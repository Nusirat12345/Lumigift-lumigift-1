# Escrow Contract Benchmarks

Soroban charges fees based on **CPU instructions** and **storage bytes**.
This document records measured costs and the regression thresholds enforced by CI.

## How to run

```bash
cargo bench --manifest-path contracts/escrow/Cargo.toml
```

---

## Measured costs (Soroban testutils simulation)

| Operation    | CPU instructions | Storage entries      | Ledger entries written |
| ------------ | ---------------- | -------------------- | ---------------------- |
| `initialize` | ~350 000         | 6 (new)              | 6                      |
| `claim`      | ~200 000         | 6 (read) + 1 (write) | 1                      |

> Values are from the Soroban test environment CPU estimator. On-chain costs
> may differ slightly due to host-function overhead.

---

## CI regression thresholds

| Operation    | Threshold (CPU instructions) |
| ------------ | ---------------------------- |
| `initialize` | 500 000                      |
| `claim`      | 300 000                      |

The benchmark binary asserts these limits at runtime. CI fails if either
operation exceeds its threshold.

---

## Estimated XLM fees (typical gift amounts)

Soroban fee approximation (Protocol 21):

```
fee_stroops ≈ cpu_instructions / 10_000
1 XLM = 10_000_000 stroops
```

| Operation    | CPU instructions | Fee (stroops) | Fee (XLM) | Fee (USD @ $0.12/XLM) |
| ------------ | ---------------- | ------------- | --------- | --------------------- |
| `initialize` | 350 000          | 35            | 0.0000035 | ~$0.00000042          |
| `claim`      | 200 000          | 20            | 0.0000020 | ~$0.00000024          |
| **Total**    | 550 000          | 55            | 0.0000055 | ~$0.00000066          |

For a typical gift of **10 USDC** (10 000 000 stroops), the combined on-chain
fee is less than **0.001% of the gift value** — negligible for the end user.

> Note: The fee formula above covers compute only. Storage rent and base
> transaction fees add a small fixed overhead (~100 stroops per transaction).

---

## Boundary: `unlock_time` semantics

The contract uses strict less-than (`now < unlock_time`), so:

- `timestamp == unlock_time` → **claim succeeds** (boundary is inclusive for the recipient)
- `timestamp == unlock_time - 1` → **claim fails** with `StillLocked`

This is verified by the boundary tests in `src/lib.rs` (`boundary_tests` module).

---

## Property tests: time-lock arithmetic (issue #357)

The `time_lock_property_tests` module in `src/lib.rs` runs each property for
**10 000 cases** with `proptest`. The tests are prefixed `fuzz_`, so the
`contract-fuzz` CI job (`cargo test --locked fuzz_`) runs them on every PR.

| Property                                 | Inputs                                                       | Invariant                                                   |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| `fuzz_past_or_near_unlock_time_rejected` | `now` ∈ {0, 3600, near-max, `u64::MAX`, random}              | `unlock_time ≤ now + 3600` → `InvalidUnlockTime`            |
| `fuzz_future_unlock_time_accepted`       | any `now`, `unlock_time` up to `u64::MAX`                    | `unlock_time > now + 3600` passes the time-lock check       |
| `fuzz_edge_amounts_respect_minimum`      | 0, 1, -1, `i128::MIN`, `MIN_AMOUNT ± 1`, `i128::MAX`, random | `amount < MIN_AMOUNT` → `InvalidAmount`; otherwise accepted |
| `fuzz_ttl_covers_lock_period`            | epoch 0 to `u64::MAX`                                        | TTL = buffer once unlocked, else ⌈Δ/5⌉ + buffer, no panic   |
| `fuzz_ttl_monotonic`                     | epoch 0 to `u64::MAX`                                        | TTL is non-decreasing in `unlock_time`                      |

The contract stores amounts as `i128`, so `i128::MAX` is the upper bound tested.
Ledger timestamps are UTC seconds, so DST transitions cannot affect the
comparison; the epoch-0 and `u64::MAX` cases cover the arithmetic boundaries.

**Finding:** `required_ttl_ledgers` rounded up with
`(secs + LEDGER_CLOSE_SECS - 1) / LEDGER_CLOSE_SECS`, which overflows (and
aborts, since `overflow-checks = true`) when `unlock_time - now > u64::MAX - 4`.
It now uses `u64::div_ceil`. No other regressions were found.
