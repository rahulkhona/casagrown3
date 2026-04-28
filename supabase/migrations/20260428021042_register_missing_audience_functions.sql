-- Register the missing CRM audience RPCs that were created in crm_schema but never registered
INSERT INTO crm_audience_functions (name, label, description, is_rpc, is_active)
VALUES
  (
    'crm_audience_has_bought_before',
    'Has Bought Before',
    'Users who have successfully completed at least one purchase on the market.',
    true,
    true
  ),
  (
    'crm_audience_has_sold_before',
    'Has Sold Before',
    'Users who have successfully completed at least one sale on the market.',
    true,
    true
  ),
  (
    'crm_audience_expressed_buying_interest',
    'Expressed Buying Interest',
    'Users who have created a "Want to Buy" listing indicating intent to purchase.',
    true,
    true
  )
ON CONFLICT (name) DO NOTHING;
