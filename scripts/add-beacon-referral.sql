-- Track referral source on organisations (e.g. 'beacon' for Beacon Compliance referrals)
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS referral_source text;
