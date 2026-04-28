-- Seed the remaining built-in audience functions into the saved crm_audiences table
-- This allows them to show up directly in the "Saved Audiences" dropdown without manual creation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_audiences WHERE audience_rpc_name = 'crm_audience_leads_only') THEN
    INSERT INTO crm_audiences (name, description, recipient_type, audience_rpc_name)
    VALUES ('Leads Only', 'Only contacts from form submissions and external leads.', 'leads', 'crm_audience_leads_only');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_audiences WHERE audience_rpc_name = 'crm_audience_users_only') THEN
    INSERT INTO crm_audiences (name, description, recipient_type, audience_rpc_name)
    VALUES ('Registered Users Only', 'Only contacts who have created a CasaGrown account.', 'users', 'crm_audience_users_only');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_audiences WHERE audience_rpc_name = 'crm_audience_has_bought_before') THEN
    INSERT INTO crm_audiences (name, description, recipient_type, audience_rpc_name)
    VALUES ('Has Bought Before', 'Users who have successfully completed at least one purchase.', 'users', 'crm_audience_has_bought_before');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_audiences WHERE audience_rpc_name = 'crm_audience_has_sold_before') THEN
    INSERT INTO crm_audiences (name, description, recipient_type, audience_rpc_name)
    VALUES ('Has Sold Before', 'Users who have successfully completed at least one sale.', 'users', 'crm_audience_has_sold_before');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_audiences WHERE audience_rpc_name = 'crm_audience_expressed_buying_interest') THEN
    INSERT INTO crm_audiences (name, description, recipient_type, audience_rpc_name)
    VALUES ('Expressed Buying Interest', 'Users who have created a "Want to Buy" listing.', 'users', 'crm_audience_expressed_buying_interest');
  END IF;
END $$;
