# Dependency Integrity Verification

CI (`.github/workflows/vulnerability-scan.yml`) enforces the following on every
push/PR to `main`/`develop`, weekly, and on the 1st of every month.

| Check                    | Command                                                    | Fails on                                              |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| Lockfile integrity       | `lockfile-lint --validate-https --validate-integrity`      | Non-registry host, plain HTTP, missing sha512         |
| Package signatures       | `npm audit signatures`                                     | Installed tarball doesn't match registry signature    |
| npm audit                | `npm audit --audit-level=high`                             | Any high/critical CVE                                 |
| Snyk (secondary scanner) | `snyk test --severity-threshold=high`                      | Any high/critical CVE (runs when `SNYK_TOKEN` is set) |
| Exception registry       | `scripts/validate-security-exceptions.ts` + `.nsprc` check | Expired or undocumented exceptions                    |

`npm ci` additionally refuses to install when `package-lock.json` and
`package.json` disagree, and verifies each tarball against its lockfile
`integrity` hash.

## `.nsprc` exceptions

Every exception must carry a justification (`notes`) and an `expiry` date; CI
fails if either is missing or the expiry has passed.

```json
{
  "exceptions": [],
  "1234567": {
    "active": true,
    "notes": "Dev-only dependency; vulnerable code path not reachable at runtime. Owner: @handle",
    "expiry": "2026-12-31"
  }
}
```

Keep expiries at most 90 days out.

## Monthly review

The scheduled run on the 1st of each month re-validates `.nsprc` and
`.security-exceptions.json`. Security owners should then:

1. Re-run `npm audit` and check whether a fix is now available for each exception.
2. Remove exceptions that are no longer needed.
3. Extend the expiry only with an updated justification in `notes`.

## Enabling Snyk

Add a `SNYK_TOKEN` repository secret. Without it, the Snyk step is skipped.
