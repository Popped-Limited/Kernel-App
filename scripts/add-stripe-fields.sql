-- Add Stripe billing fields to organisations
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial';
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
