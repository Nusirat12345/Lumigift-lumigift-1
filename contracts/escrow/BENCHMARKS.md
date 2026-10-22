# Escrow Contract Benchmarks

Soroban charges fees based on **CPU instructions** and **storage bytes**.
This document records measured costs and the regression thresholds enforced by CI.

## How to run

```bash
cargo bench --manifest-path contracts/escrow/Cargo.toml
```

---

## Baseline (Soroban testutils budget tracker)

Deterministic CPU-instruction and memory counts for each state-changing entry
point, measured in isolation (budget tracker reset before the call).
`initialize` is the deposit — it transfers the gift amount into escrow.

<!-- baseline:start -->

| Operation    | CPU instructions | Memory bytes |
| ------------ | ---------------- | ------------ |
| `initialize` | 156075           | 64103        |
| `claim`      | 177399           | 70918        |
| `cancel`     | 160986           | 66156        |

<!-- baseline:end -->

> Values come from the Soroban test environment with a minimal mock USDC
> token. On-chain costs differ slightly (real SAC token, host overhead).
>
> The contract has no `set_paused` entry point, so there is nothing to
> benchmark for it; add a row here and an entry in `OPERATIONS` in
> `benches/escrow_bench.rs` if one is introduced.

---

## CI regression gate

The `Contract Resource Budget` job in `.github/workflows/ci.yml` runs
`cargo bench`. Before the Criterion timing run, the bench binary measures each
operation and compares it with the baseline table above (parsed between the
`baseline:start`/`baseline:end` markers):

- Any CPU or memory value more than **10%** above baseline fails the job.
- A Markdown report (`contracts/target/escrow-bench-report.md`) is posted to
  the PR as a single, updated-in-place comment.

When a change intentionally increases cost, update the baseline table in the
same PR so reviewers see the new numbers.

---

## Estimated XLM fees (typical gift amounts)

Soroban fee approximation (Protocol 21):

```
fee_stroops ≈ cpu_instructions / 10_000
1 XLM = 10_000_000 stroops
```

| Operation    | CPU instructions | Fee (stroops) | Fee (XLM) | Fee (USD @ $0.12/XLM) |
| ------------ | ---------------- | ------------- | --------- | --------------------- |
| `initialize` | 156 075          | 16            | 0.0000016 | ~$0.00000019          |
| `claim`      | 177 399          | 18            | 0.0000018 | ~$0.00000022          |
| `cancel`     | 160 986          | 16            | 0.0000016 | ~$0.00000019          |

For a typical gift of **10 USDC** (10 000 000 stroops), the on-chain fee of
any single operation is less than **0.001% of the gift value** — negligible for the end user.

> Note: The fee formula above covers compute only. Storage rent and base
> transaction fees add a small fixed overhead (~100 stroops per transaction).

---

## Boundary: `unlock_time` semantics

The contract uses strict less-than (`now < unlock_time`), so:

- `timestamp == unlock_time` → **claim succeeds** (boundary is inclusive for the recipient)
- `timestamp == unlock_time - 1` → **claim fails** with `StillLocked`

This is verified by the boundary tests in `src/lib.rs` (`boundary_tests` module).
