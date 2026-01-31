-- Add tracking for community scraping
alter table zip_codes add column last_scraped_at timestamptz;

-- Function to pick zips for scraping
create or replace function get_zips_without_communities(batch_size int)
returns table (zip_code text, country_iso_3 text)
language plpgsql
security definer
as $$
begin
  return query
  select z.zip_code, z.country_iso_3
  from zip_codes z
  where z.country_iso_3 = 'USA'
  order by z.last_scraped_at nulls first, z.zip_code
  limit batch_size;
end;
$$;
