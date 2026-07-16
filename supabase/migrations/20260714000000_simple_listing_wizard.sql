-- Register /create-listing-simple as a CRM landing page
INSERT INTO crm_landing_pages (slug, title, is_active)
VALUES ('/create-listing-simple', 'Simple Listing Wizard', true)
ON CONFLICT (slug) DO NOTHING;
