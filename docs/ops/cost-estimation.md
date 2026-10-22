# Cost Estimation Guide for Running Lumigift in Production

> **Last updated:** October 2026
>
> This guide helps operators and potential enterprise users understand the
> cost of running Lumigift in production. It breaks down fees by provider and
> estimates monthly costs at different scales.
>
> **Disclaimer:** External prices may change at any time. Always verify with
> each provider's official pricing page (links provided below) before making
> budget decisions. The figures in this guide were accurate at the time of
> writing but are not guaranteed.

---

## 1. Provider Fee Breakdown

### Stellar Network (On-Chain)

Stellar is one of the cheapest blockchain networks for USDC transfers.

| Item                            | Cost                                 |
| ------------------------------- | ------------------------------------ |
| Base fee per operation          | 0.00001 XLM (~$0.00001)              |
| Base reserve (per ledger entry) | 0.5 XLM (~$0.08)                     |
| Account minimum balance         | 2 × base reserve = 1 XLM (~$0.16)    |
| USDC payment (1 operation)      | ~$0.00001                            |
| Soroban contract invocation     | ~$0.0001–$0.001 (resource-dependent) |

A typical Lumigift gift lifecycle involves:

- 1 USDC payment to escrow (funding) — ~$0.00001
- 1 Soroban contract invocation (lock) — ~$0.001
- 1 USDC payment to recipient (claim) — ~$0.00001
- 1 Soroban contract invocation (unlock) — ~$0.001

**Per-gift on-chain cost: ~$0.002**

🔗 [Stellar fee documentation](https://developers.stellar.org/docs/learn/fundamentals/fees-and-reserves)

---

### Paystack (NGN On-Ramp)

Paystack processes Nigerian Naira card payments.

| Item                      | Cost                                     |
| ------------------------- | ---------------------------------------- |
| Local card transactions   | 1.5% + ₦100, capped at ₦2,000            |
| Transactions under ₦2,500 | 1.5% (₦100 fee waived)                   |
| International cards       | 3.9%                                     |
| Bank transfer             | ₦100 flat (stamp duty applies ≥ ₦10,000) |

For a ₦5,000 gift paid by local card:

- Fee = 1.5% × ₦5,000 + ₦100 = ₦75 + ₦100 = ₦175

🔗 [Paystack pricing](https://paystack.com/pricing)

---

### Stripe (International On-Ramp)

Stripe handles international card payments (non-Nigerian users).

| Item                   | Cost                       |
| ---------------------- | -------------------------- |
| Domestic cards (US)    | 2.9% + $0.30               |
| International cards    | 2.9% + $0.30 + 1.5% = 4.4% |
| Currency conversion    | +1%                        |
| Disputes (chargebacks) | $15 per dispute            |

For a $50 gift paid by international card:

- Fee = 2.9% × $50 + $0.30 = $1.45 + $0.30 = $1.75

🔗 [Stripe pricing](https://stripe.com/pricing)

---

### Termii (SMS / OTP)

Termii delivers OTP codes and gift invitation SMS messages.

| Item                      | Cost                             |
| ------------------------- | -------------------------------- |
| SMS (per page, 160 chars) | ₦1.80 – ₦6.00 (volume-dependent) |
| OTP delivery (SMS)        | ₦2.00 – ₦4.00 per message        |
| Voice OTP                 | ₦15.00 – ₦25.00 per call         |

A typical Lumigift flow sends 1 OTP per signup and 1 invitation SMS per gift
to an unregistered recipient.

🔗 [Termii pricing](https://termii.com/pricing)

---

### PostgreSQL

| Deployment                            | Estimated Monthly Cost |
| ------------------------------------- | ---------------------- |
| Self-hosted (small VM)                | $5 – $20 (VM cost)     |
| Managed (RDS/Cloud SQL, db.t3.micro)  | ~$15 – $25             |
| Managed (RDS/Cloud SQL, db.t3.small)  | ~$35 – $55             |
| Managed (RDS/Cloud SQL, db.t3.medium) | ~$70 – $120            |

🔗 [AWS RDS pricing](https://aws.amazon.com/rds/pricing/)
🔗 [Google Cloud SQL pricing](https://cloud.google.com/sql/pricing)

---

### Redis

| Deployment                            | Estimated Monthly Cost   |
| ------------------------------------- | ------------------------ |
| Self-hosted (same VM as app)          | $0 (shared)              |
| Managed (ElastiCache, cache.t3.micro) | ~$12 – $20               |
| Managed (ElastiCache, cache.t3.small) | ~$25 – $40               |
| Upstash (serverless, pay-per-request) | ~$0.20 per 100K commands |

🔗 [AWS ElastiCache pricing](https://aws.amazon.com/elasticache/pricing/)
🔗 [Upstash pricing](https://upstash.com/pricing)

---

### CDN (Static Assets)

| Provider                       | Estimated Monthly Cost         |
| ------------------------------ | ------------------------------ |
| Cloudflare (free tier)         | $0 (up to unlimited bandwidth) |
| Cloudflare Pro                 | $20                            |
| AWS CloudFront (1 TB egress)   | ~$85                           |
| Vercel (included with hosting) | $0 – $20 (plan-dependent)      |

🔗 [Cloudflare pricing](https://www.cloudflare.com/plans/)
🔗 [AWS CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)

---

### Application Hosting

| Provider                    | Estimated Monthly Cost           |
| --------------------------- | -------------------------------- |
| Vercel (Pro, single team)   | $20 – $100 (bandwidth-dependent) |
| Railway / Render (small)    | $5 – $20                         |
| AWS EC2 (t3.small)          | ~$15 – $20                       |
| DigitalOcean Droplet (2 GB) | $12                              |

---

## 2. Monthly Cost Estimates by Scale

The following tables estimate the total monthly operating cost for Lumigift
at three different gift volumes. These assume a single-region deployment and
do not include one-time setup costs or development expenses.

### Assumptions

- Average gift amount: ₦5,000 (~$3.13 at ₦1,600/USD)
- 80% of recipients are unregistered (requiring SMS invitation)
- 1 OTP SMS per new user signup
- Payment route: 90% Paystack (local), 10% Stripe (international)
- Stellar on-chain cost: ~$0.002 per gift
- Redis and PostgreSQL are managed services

### 100 Gifts / Month

| Component                          | Monthly Cost     |
| ---------------------------------- | ---------------- |
| Paystack fees (90 gifts)           | ₦15,750 (~$9.84) |
| Stripe fees (10 gifts)             | ~$17.50          |
| Stellar on-chain                   | ~$0.20           |
| Termii SMS (80 invites + ~50 OTPs) | ₦260 (~$0.16)    |
| PostgreSQL (managed micro)         | ~$20             |
| Redis (managed micro)              | ~$15             |
| CDN (Cloudflare free)              | $0               |
| App hosting (Vercel Pro)           | ~$20             |
| **Total**                          | **~$83**         |

### 1,000 Gifts / Month

| Component                            | Monthly Cost       |
| ------------------------------------ | ------------------ |
| Paystack fees (900 gifts)            | ₦157,500 (~$98.44) |
| Stripe fees (100 gifts)              | ~$175              |
| Stellar on-chain                     | ~$2                |
| Termii SMS (800 invites + ~500 OTPs) | ₦2,600 (~$1.63)    |
| PostgreSQL (managed small)           | ~$50               |
| Redis (managed small)                | ~$30               |
| CDN (Cloudflare free)                | $0                 |
| App hosting (Vercel Pro)             | ~$100              |
| **Total**                            | **~$457**          |

### 10,000 Gifts / Month

| Component                                | Monthly Cost          |
| ---------------------------------------- | --------------------- |
| Paystack fees (9,000 gifts)              | ₦1,575,000 (~$984.38) |
| Stripe fees (1,000 gifts)                | ~$1,750               |
| Stellar on-chain                         | ~$20                  |
| Termii SMS (8,000 invites + ~5,000 OTPs) | ₦26,000 (~$16.25)     |
| PostgreSQL (managed medium)              | ~$120                 |
| Redis (managed small)                    | ~$40                  |
| CDN (Cloudflare Pro)                     | ~$20                  |
| App hosting (Vercel Pro + bandwidth)     | ~$200                 |
| **Total**                                | **~$3,150**           |

---

## 3. Cost Optimization Tips

1. **Paystack fee cap:** The ₦2,000 cap means gifts above ₦126,667 pay a
   flat ₦2,000 fee (1.5% × ₦126,667 + ₦100 = ₦2,000). High-value gifts are
   proportionally cheaper to process.

2. **SMS routing:** Use Termii's Smart SMS routing to deliver via WhatsApp
   when the recipient has WhatsApp — costs less than SMS.

3. **Redis caching:** The exchange-rate cache (60 s TTL) and gift template
   cache (1 hour TTL) reduce redundant network calls. Ensure Redis is
   always available to avoid falling back to live rate fetches.

4. **Stellar fee bumping:** Stellar's base fee is a suggestion, not a
   requirement. During network congestion, transactions with higher fees are
   prioritised. For non-urgent gifts, use the minimum base fee.

5. **Referral programme:** The ₦500 referral credit (Issue #328) applies as a
   discount on the next gift. This is a customer acquisition cost, not an
   infrastructure cost, but it should be factored into unit economics.

6. **Managed vs self-hosted:** At low volume (< 500 gifts/month), managed
   services cost more than self-hosting but eliminate operational overhead.
   At high volume (> 5,000 gifts/month), self-hosting on a dedicated VM
   can reduce database and Redis costs by 50–70%.

---

## 4. Provider Pricing Pages

Always verify current pricing before budget planning:

- [Paystack pricing](https://paystack.com/pricing)
- [Stripe pricing](https://stripe.com/pricing)
- [Termii pricing](https://termii.com/pricing)
- [Stellar fees](https://developers.stellar.org/docs/learn/fundamentals/fees-and-reserves)
- [AWS RDS (PostgreSQL) pricing](https://aws.amazon.com/rds/pricing/)
- [Google Cloud SQL pricing](https://cloud.google.com/sql/pricing)
- [AWS ElastiCache (Redis) pricing](https://aws.amazon.com/elasticache/pricing/)
- [Upstash (serverless Redis) pricing](https://upstash.com/pricing)
- [Cloudflare pricing](https://www.cloudflare.com/plans/)
- [Vercel pricing](https://vercel.com/pricing)

---

## 5. Summary

Lumigift's cost structure is dominated by payment processing fees (Paystack
and Stripe), which scale linearly with gift volume. Infrastructure costs
(PostgreSQL, Redis, hosting, CDN) are relatively fixed and become negligible
at scale. On-chain Stellar fees are effectively zero.

At 100 gifts/month, expect to spend ~$83/month total. At 10,000 gifts/month,
expect ~$3,150/month — of which ~$2,734 is payment processing fees (87% of
total cost).
