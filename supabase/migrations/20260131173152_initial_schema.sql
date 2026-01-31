-- Initial Schema Migration
-- Generated from docs/data_model.md

-- Extensions
create extension if not exists "pgcrypto"; -- required for gen_random_uuid()

-- Country/Region Reference Tables
create table countries (
  iso_3 text primary key, -- 'USA', 'CAN'
  name text not null,
  currency_symbol text, -- '$', '€'
  phone_code text, -- '+1'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table states (
  id uuid primary key default gen_random_uuid(),
  country_iso_3 text not null references countries(iso_3),
  code text not null, -- 'CA', 'NY', 'BC'
  name text not null, -- 'California'
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(country_iso_3, code)
);

create table cities (
  id uuid primary key default gen_random_uuid(),
  state_id uuid not null references states(id),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(state_id, name)
);

create table zip_codes (
  zip_code text not null,
  country_iso_3 text not null references countries(iso_3),
  city_id uuid not null references cities(id), -- Hierarchical link
  latitude numeric,
  longitude numeric,
  primary key (zip_code, country_iso_3)
);

create table communities (
  id uuid primary key default gen_random_uuid(),
  zip_code text not null,
  community_name text not null,
  country_iso_3 text not null default 'USA',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(zip_code, community_name, country_iso_3),
  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3)
);

-- Profiles & Users
create table profiles (
  id uuid primary key references auth.users(id),
  email text unique not null,
  full_name text,
  avatar_url text,
  community_id uuid references communities(id),
  phone_number text,
  notify_on_wanted boolean not null default true,
  notify_on_available boolean not null default true,
  push_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  referral_code text unique,
  invited_by_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table user_garden (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  produce_name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enums
create type incentive_action as enum (
  'signup',
  'complete_basic_profile',
  'join_a_community',
  'make_first_post',
  'invite_people_to_community',
  'invitee_signing_up',
  'invitee_making_first_transaction',
  'making_first_transaction'
);

create type incentive_scope as enum ('global', 'country', 'state', 'city', 'zip', 'community');

create table incentive_rules (
  id uuid primary key default gen_random_uuid(),
  action_type incentive_action not null,
  scope incentive_scope not null default 'global',
  points integer not null default 0,
  
  -- Hierarchical Scopes
  country_iso_3 text references countries(iso_3),
  state_id uuid references states(id),
  city_id uuid references cities(id),
  zip_code text, -- Composite FK
  community_id uuid references communities(id),

  start_date timestamptz not null default now(),
  end_date timestamptz,
  created_at timestamptz default now(),

  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3),

  -- Prevent duplicate active rules for same scope/target
  unique(action_type, scope, country_iso_3, state_id, city_id, zip_code, community_id, start_date)
);

create type media_asset_type as enum ('video', 'image');
create type delegation_status as enum ('pending', 'accepted', 'rejected', 'revoked');
create type post_type as enum (
  'want_to_sell',
  'want_to_buy',
  'offering_service',
  'need_service',
  'seeking_advice',
  'general_info'
);
create type post_reach as enum ('community', 'global');
create type unit_of_measure as enum ('piece', 'dozen', 'box', 'bag');
create type sales_category as enum (
  'fruits',
  'vegetables',
  'herbs',
  'flowers',
  'flower_arrangements',
  'garden_equipment',
  'pots',
  'soil'
);
create type restriction_scope as enum ('global', 'country', 'state', 'city', 'zip', 'community');

-- Sales Category Restrictions
create table sales_category_restrictions (
  id uuid primary key default gen_random_uuid(),
  category sales_category not null,
  scope restriction_scope not null default 'global',
  
  -- Hierarchical Scopes
  country_iso_3 text references countries(iso_3),
  state_id uuid references states(id),
  city_id uuid references cities(id),
  zip_code text, -- Composite FK
  community_id uuid references communities(id),

  is_allowed boolean not null default false,
  created_at timestamptz default now(),

  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3),

  unique(category, scope, country_iso_3, state_id, city_id, zip_code, community_id)
);

-- Experimentation System
create type experiment_status as enum ('draft', 'running', 'completed', 'rolled_out', 'rejected');

create table experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status experiment_status not null default 'draft',
  rollout_percentage integer default 0 check (rollout_percentage between 0 and 100),
  target_criteria jsonb default '{}', 
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  name text not null, 
  weight integer not null default 50,
  is_control boolean default false,
  config jsonb default '{}',
  created_at timestamptz default now()
);

create table experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id) on delete cascade,
  variant_id uuid not null references experiment_variants(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  device_id text,
  assigned_at timestamptz default now(),
  unique(experiment_id, user_id)
);

create table experiment_events (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments(id),
  variant_id uuid not null references experiment_variants(id),
  user_id uuid references profiles(id),
  event_name text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Media
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  storage_path text not null,
  media_type media_asset_type not null,
  mime_type text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Posts & Content
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id),
  community_id uuid references communities(id),
  type post_type not null,
  reach post_reach not null default 'community',
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id),
  content text not null,
  created_at timestamptz default now()
);

create table post_flags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id),
  reason text,
  created_at timestamptz default now()
);

create table post_media (
  post_id uuid references posts(id) on delete cascade,
  media_id uuid references media_assets(id) on delete cascade,
  position integer default 0,
  primary key (post_id, media_id)
);

create table want_to_sell_details (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  category sales_category not null,
  produce_name text not null,
  unit unit_of_measure not null,
  total_quantity_available numeric not null,
  price_per_unit numeric(10,2) not null,
  delegator_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table delivery_dates (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  delivery_date date not null,
  created_at timestamptz default now()
);

create table want_to_buy_details (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  category sales_category not null,
  produce_names text[] not null,
  need_by_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Transactional
create type offer_status as enum ('pending', 'accepted', 'rejected');
create type order_status as enum ('accepted', 'disputed');
create type rating_score as enum ('1', '2', '3', '4', '5');
create type chat_message_type as enum ('text', 'media', 'mixed', 'system');

create table conversations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  created_at timestamptz default now(),
  unique(post_id, buyer_id, seller_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id),
  content text,
  media_id uuid references media_assets(id),
  type chat_message_type not null default 'text',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  check (content is not null or media_id is not null)
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  created_by uuid not null references profiles(id),
  quantity numeric not null,
  price_per_unit numeric(10,2) not null,
  status offer_status not null default 'pending',
  created_at timestamptz default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
  buyer_id uuid not null,
  seller_id uuid not null,
  category sales_category not null,
  product text not null,
  quantity numeric not null,
  price_per_unit numeric(10,2) not null,
  delivery_date date,
  delivery_time time,
  delivery_instructions text,
  delivery_proof_media_id uuid references media_assets(id),
  conversation_id uuid not null references conversations(id),
  status order_status not null default 'accepted',
  buyer_rating rating_score,
  buyer_feedback text,
  seller_rating rating_score,
  seller_feedback text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  foreign key (offer_id) references offers (id)
);

create type escalation_status as enum ('open', 'resolved');
create type escalation_resolution as enum ('refund_accepted', 'resolved_without_refund', 'dismissed');
create type refund_offer_status as enum ('pending', 'accepted', 'rejected');

create table escalations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  initiator_id uuid not null references profiles(id),
  reason text not null,
  dispute_proof_media_id uuid references media_assets(id),
  status escalation_status not null default 'open',
  resolution_type escalation_resolution,
  accepted_refund_offer_id uuid,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table refund_offers (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references escalations(id) on delete cascade,
  amount numeric(10,2) not null,
  message text,
  status refund_offer_status not null default 'pending',
  created_at timestamptz default now()
);

alter table escalations 
add constraint fk_accepted_refund foreign key (accepted_refund_offer_id) references refund_offers(id);

create type point_transaction_type as enum ('purchase', 'transfer', 'payment', 'platform_charge', 'redemption', 'reward');

create table point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type point_transaction_type not null,
  amount integer not null,
  balance_after integer not null,
  reference_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Redemption System
create type redemption_item_type as enum ('gift_card', 'merchandize', 'donation');
create type redemption_reach_type as enum ('global', 'restricted');
create type redemption_status as enum ('pending', 'completed', 'failed');

create table redemption_merchandize (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  point_cost integer not null,
  type redemption_item_type not null,
  reach_type redemption_reach_type not null default 'global',
  is_active boolean default true,
  created_at timestamptz default now()
);

create table redemption_merchandize_media (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  media_id uuid not null references media_assets(id) on delete cascade,
  display_order integer default 0,
  created_at timestamptz default now(),
  unique(merchandize_id, media_id)
);

create table redemption_merchandize_country_restrictions (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  country_iso3 text not null,
  is_allowed boolean not null default true,
  created_at timestamptz default now()
);

create table redemption_merchandize_state_restrictions (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  state text not null,
  country_iso3 text not null,
  is_allowed boolean not null default true,
  created_at timestamptz default now()
);

create table redemption_merchandize_city_restrictions (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  city text not null,
  state text not null,
  country_iso3 text not null,
  is_allowed boolean not null default true,
  created_at timestamptz default now()
);

create table redemption_merchandize_zip_restrictions (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  zip_code text not null,
  country_iso_3 text not null,
  is_allowed boolean not null default true,
  created_at timestamptz default now(),
  foreign key (zip_code, country_iso_3) references zip_codes(zip_code, country_iso_3)
);

create table redemption_merchandize_community_restrictions (
  id uuid primary key default gen_random_uuid(),
  merchandize_id uuid not null references redemption_merchandize(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  is_allowed boolean not null default true,
  created_at timestamptz default now()
);

create table redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references redemption_merchandize(id),
  point_cost integer not null,
  status redemption_status not null default 'pending',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  link_url text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_id uuid not null references profiles(id),
  delegatee_id uuid not null references profiles(id),
  status delegation_status not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (delegator_id <> delegatee_id)
);

create type feedback_type as enum ('feature_request', 'bug_report');
create type feedback_status as enum ('open', 'under_review', 'planned', 'in_progress', 'completed', 'rejected', 'duplicate');

create table user_feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  type feedback_type not null,
  title text not null,
  description text not null,
  status feedback_status not null default 'open',
  created_at timestamptz default now()
);

create table feedback_media (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  media_id uuid not null references media_assets(id) on delete cascade,
  display_order integer default 0,
  unique(feedback_id, media_id)
);

create table feedback_votes (
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (feedback_id, user_id),
  created_at timestamptz default now()
);

create table feedback_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references user_feedback(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  is_official_response boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS on all tables
alter table countries enable row level security;
alter table states enable row level security;
alter table cities enable row level security;
alter table zip_codes enable row level security;
alter table communities enable row level security;
alter table profiles enable row level security;
alter table user_garden enable row level security;
alter table incentive_rules enable row level security;
alter table media_assets enable row level security;
alter table sales_category_restrictions enable row level security;
alter table experiments enable row level security;
alter table experiment_variants enable row level security;
alter table experiment_assignments enable row level security;
alter table experiment_events enable row level security;
alter table posts enable row level security;
alter table post_likes enable row level security;
alter table post_comments enable row level security;
alter table post_flags enable row level security;
alter table post_media enable row level security;
alter table want_to_sell_details enable row level security;
alter table delivery_dates enable row level security;
alter table want_to_buy_details enable row level security;
alter table conversations enable row level security;
alter table chat_messages enable row level security;
alter table offers enable row level security;
alter table orders enable row level security;
alter table escalations enable row level security;
alter table refund_offers enable row level security;
alter table point_ledger enable row level security;
alter table redemption_merchandize enable row level security;
alter table redemption_merchandize_media enable row level security;
alter table redemption_merchandize_country_restrictions enable row level security;
alter table redemption_merchandize_state_restrictions enable row level security;
alter table redemption_merchandize_city_restrictions enable row level security;
alter table redemption_merchandize_zip_restrictions enable row level security;
alter table redemption_merchandize_community_restrictions enable row level security;
alter table redemptions enable row level security;
alter table notifications enable row level security;
alter table delegations enable row level security;
alter table user_feedback enable row level security;
alter table feedback_media enable row level security;
alter table feedback_votes enable row level security;
alter table feedback_comments enable row level security;
