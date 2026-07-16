-- Register /create-listing-wizard as a CRM landing page
INSERT INTO crm_landing_pages (slug, title, is_active)
VALUES ('/create-listing-wizard', 'Standard Listing Wizard', true)
ON CONFLICT (slug) DO NOTHING;
