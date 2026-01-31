-- Update tracking logic to allow re-scraping after 90 days
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
    and (z.last_scraped_at is null or z.last_scraped_at < now() - interval '90 days')
  order by z.last_scraped_at nulls first, z.zip_code
  limit batch_size;
end;
$$;
