begin;
select plan(2);

-- Test new ip_address column
select has_column('public', 'growbot_token_usage', 'ip_address', 'ip_address column exists on growbot_token_usage');

-- Test index
select has_index('public', 'growbot_token_usage', 'idx_growbot_usage_ip_guest', 'idx_growbot_usage_ip_guest index exists');

select * from finish();
rollback;
