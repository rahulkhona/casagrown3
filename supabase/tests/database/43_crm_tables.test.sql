-- 43_crm_tables.test.sql
-- pgTAP suite: CRM schema tables, RPCs, and data integrity

begin;

select plan(33);

-- ════════════════════════════════════════════════════════════════
-- 1. Table existence checks
-- ════════════════════════════════════════════════════════════════

select has_table('public', 'crm_leads',         '01 crm_leads table exists');
select has_table('public', 'crm_landing_pages',  '02 crm_landing_pages table exists');
select has_table('public', 'crm_page_visits',    '03 crm_page_visits table exists');
select has_table('public', 'crm_page_events',    '04 crm_page_events table exists');
select has_table('public', 'crm_assets',         '05 crm_assets table exists');
select has_table('public', 'crm_audiences',      '06 crm_audiences table exists');
select has_table('public', 'crm_campaigns',      '07 crm_campaigns table exists');
select has_table('public', 'crm_campaign_sends', '08 crm_campaign_sends table exists');
select has_table('public', 'crm_short_links',    '09 crm_short_links table exists');

-- ════════════════════════════════════════════════════════════════
-- 2. Column existence — crm_leads
-- ════════════════════════════════════════════════════════════════

select has_column('public', 'crm_leads', 'id',              '10 crm_leads.id exists');
select has_column('public', 'crm_leads', 'email',           '11 crm_leads.email exists');
select has_column('public', 'crm_leads', 'source_platform', '12 crm_leads.source_platform exists');
select has_column('public', 'crm_leads', 'accepts_email',   '13 crm_leads.accepts_email exists');
select has_column('public', 'crm_leads', 'status',          '14 crm_leads.status exists');

-- ════════════════════════════════════════════════════════════════
-- 3. RPC existence
-- ════════════════════════════════════════════════════════════════

select has_function('public', 'crm_audience_all',
  '15 crm_audience_all RPC exists');

select has_function('public', 'crm_audience_has_bought_before',
  '16 crm_audience_has_bought_before RPC exists');

select has_function('public', 'crm_audience_has_sold_before',
  '17 crm_audience_has_sold_before RPC exists');

select has_function('public', 'crm_audience_expressed_buying_interest',
  '18 crm_audience_expressed_buying_interest RPC exists');

select has_function('public', 'metrics_crm_landing_pages',
  '19 metrics_crm_landing_pages RPC exists');

select has_function('public', 'metrics_crm_traffic_sources',
  '20 metrics_crm_traffic_sources RPC exists');

select has_function('public', 'metrics_crm_ab_results',
  '21 metrics_crm_ab_results RPC exists');

select has_function('public', 'metrics_crm_lead_funnel',
  '22 metrics_crm_lead_funnel RPC exists');

select has_function('public', 'metrics_crm_campaigns',
  '23 metrics_crm_campaigns RPC exists');

-- ════════════════════════════════════════════════════════════════
-- 4. Data integrity — crm_leads defaults
-- ════════════════════════════════════════════════════════════════

insert into public.crm_leads (name, email, accepts_email, accepts_sms)
values ('Test Lead', 'pgtest_crm@casagrown.local', true, false);

select results_eq(
  $$ select status from public.crm_leads where email = 'pgtest_crm@casagrown.local' $$,
  $$ values ('new'::text) $$,
  '24 crm_leads.status defaults to new'
);

select results_eq(
  $$ select accepts_email from public.crm_leads where email = 'pgtest_crm@casagrown.local' $$,
  $$ values (true) $$,
  '25 crm_leads.accepts_email stored correctly'
);

-- ════════════════════════════════════════════════════════════════
-- 5. crm_short_links — unique token constraint
-- ════════════════════════════════════════════════════════════════

insert into public.crm_short_links (token, destination_url)
values ('testtkn1', 'https://casagrown.com/market');

select results_eq(
  $$ select destination_url from public.crm_short_links where token = 'testtkn1' $$,
  $$ values ('https://casagrown.com/market'::text) $$,
  '26 crm_short_links token lookup works'
);

select results_eq(
  $$ select is_shared from public.crm_short_links where token = 'testtkn1' $$,
  $$ values (false) $$,
  '26.5 crm_short_links is_shared defaults to false'
);

-- duplicate token should fail
select throws_ok(
  $$ insert into public.crm_short_links (token, destination_url) values ('testtkn1', 'https://casagrown.com/') $$,
  '23505',
  null,
  '27 duplicate short link token raises error'
);

-- ════════════════════════════════════════════════════════════════
-- 6. crm_campaigns — channel constraint
-- ════════════════════════════════════════════════════════════════

select throws_ok(
  $$ insert into public.crm_campaigns (name, channel, status) values ('bad', 'fax', 'draft') $$,
  '23514',
  null,
  '28 invalid channel raises constraint error'
);

-- ════════════════════════════════════════════════════════════════
-- 7. crm_audience_all returns expected shape
-- ════════════════════════════════════════════════════════════════

select ok(
  (select count(*) >= 0 from public.crm_audience_all()),
  '29 crm_audience_all executes without error'
);

-- ════════════════════════════════════════════════════════════════
-- 8. Storage bucket exists
-- ════════════════════════════════════════════════════════════════

select ok(
  exists(select 1 from storage.buckets where id = 'marketing-assets'),
  '30 marketing-assets storage bucket exists'
);

-- ════════════════════════════════════════════════════════════════
-- 9. metrics RPCs return rows with expected columns
-- ════════════════════════════════════════════════════════════════

select ok(
  (select public.metrics_crm_lead_funnel(
    p_start => (current_date - interval '30 days')::text,
    p_end   => current_date::text
  ) is not null),
  '31 metrics_crm_lead_funnel executes without error'
);

select ok(
  (select public.metrics_crm_campaigns(
    p_start => (current_date - interval '30 days')::text,
    p_end   => current_date::text
  ) is not null),
  '32 metrics_crm_campaigns executes without error'
);

select * from finish();

rollback;
