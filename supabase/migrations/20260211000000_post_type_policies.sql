-- Post Type Policies
-- Configurable expiration days per post type (used by My Posts to show active/expired status)

create table post_type_policies (
  post_type post_type primary key,
  expiration_days integer not null default 30,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table post_type_policies enable row level security;

-- Everyone can read policies
create policy "Post type policies are readable by all authenticated users"
  on post_type_policies for select to authenticated using (true);

-- Seed default expiration days per type
insert into post_type_policies (post_type, expiration_days) values
  ('want_to_sell', 14),
  ('want_to_buy', 7),
  ('offering_service', 30),
  ('need_service', 7),
  ('seeking_advice', 30),
  ('general_info', 30);
