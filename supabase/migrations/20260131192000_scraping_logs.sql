-- Scraping Health & Audit Logs
create type scraping_status as enum ('success', 'failure', 'zero_results');

create table scraping_logs (
  id uuid primary key default gen_random_uuid(),
  zip_code text not null,
  country_iso_3 text not null,
  status scraping_status not null,
  error_message text,
  communities_count integer default 0,
  scraped_at timestamptz default now(),
  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3)
);

-- RLS
alter table scraping_logs enable row level security;
-- Service role only usually, but we can allow read for admins
create policy "Service role can do everything" on scraping_logs for all using (true);
