-- Create country_refund_fees matrix for dynamic fallback cost calculations
CREATE TABLE country_refund_fees (
    country_iso_3 text PRIMARY KEY,
    stripe_identity_fee_cents integer NOT NULL,
    transaction_fee_percent numeric NOT NULL,
    transaction_fee_fixed_cents integer NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE country_refund_fees ENABLE ROW LEVEL SECURITY;

-- Allow public read access (used by Edge Functions and UI to display explicit fee warnings)
CREATE POLICY "Public can view country refund fees" ON country_refund_fees
    FOR SELECT
    USING (true);

-- Allow only authenticated admins to modify the fee structural matrix
CREATE POLICY "Admins can manage country refund fees" ON country_refund_fees
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM staff_members
            WHERE staff_members.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM staff_members
            WHERE staff_members.user_id = auth.uid()
        )
    );

-- Seed defaults for the United States (USA)
-- Stripe Identity: roughly $1.50 - $2.50 in practice. We'll set a baseline of 250 cents to cover manual ops.
-- Standard CC %: 2.9
-- Standard Fixed: 30 cents
INSERT INTO country_refund_fees (
    country_iso_3,
    stripe_identity_fee_cents,
    transaction_fee_percent,
    transaction_fee_fixed_cents
) VALUES (
    'USA',
    250,
    2.9,
    30
);
