-- Migration: add referral programme tables
-- Issue #328: Referral programme for new user acquisition
--
-- Tables:
--   referrals          — tracks referral relationships (referrer → referee)
--   referral_credits   — stores credit balances and usage
--   referral_audit     — logs fraud detection signals and credit events

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL,
  referee_id TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, eligible, credited, flagged, rejected
  credited_at TIMESTAMPTZ,
  signup_ip TEXT,
  signup_user_agent TEXT,
  signup_device_fingerprint TEXT,
  fraud_flags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_referrals_referee UNIQUE (referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

CREATE TABLE IF NOT EXISTS referral_credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_ngn NUMERIC(12, 2) NOT NULL DEFAULT 0,
  source_referral_id TEXT,
  type TEXT NOT NULL DEFAULT 'referral_bonus',  -- referral_bonus, referral_credit
  used_on_gift_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_referral_credits_referrer FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_credits_user_id ON referral_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_credits_source ON referral_credits(source_referral_id);

CREATE TABLE IF NOT EXISTS referral_audit (
  id TEXT PRIMARY KEY,
  referral_id TEXT,
  event TEXT NOT NULL,  -- signup, credit, fraud_detected, rejected
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_audit_referral_id ON referral_audit(referral_id);

COMMENT ON TABLE referrals IS 'Tracks referral relationships between users (referrer → referee)';
COMMENT ON COLUMN referrals.status IS 'Lifecycle: pending → eligible (first payment) → credited | flagged → rejected';
COMMENT ON TABLE referral_credits IS 'Stores ₦500 referral credits; applied as discount on next gift, not withdrawable';
COMMENT ON TABLE referral_audit IS 'Logs referral fraud detection signals and credit events';
