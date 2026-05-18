
-- Enums
create type public.cycle_status as enum ('active','completed','archived');
create type public.log_source as enum ('whatsapp','web');
create type public.msg_direction as enum ('in','out');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  whatsapp_number text unique,
  avg_cycle_length int not null default 28,
  period_length int not null default 5,
  disclaimer_accepted_at timestamptz,
  bot_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Cycles
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_on date not null,
  ended_on date,
  ovulation_day int,
  predicted_fertile_start date,
  predicted_fertile_end date,
  status public.cycle_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.cycles(user_id, started_on desc);

alter table public.cycles enable row level security;
create policy "Users manage own cycles" on public.cycles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Temperature logs
create table public.temperature_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  logged_for date not null,
  temp_celsius numeric(4,2) not null,
  source public.log_source not null default 'web',
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, logged_for)
);
create index on public.temperature_logs(cycle_id, logged_for);

alter table public.temperature_logs enable row level security;
create policy "Users manage own logs" on public.temperature_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bot messages
create table public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  wa_message_id text,
  direction public.msg_direction not null,
  body text,
  media_url text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index on public.bot_messages(user_id, created_at desc);

alter table public.bot_messages enable row level security;
create policy "Users view own messages" on public.bot_messages
  for select using (auth.uid() = user_id);

-- Auto-update updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger set_cycles_updated_at before update on public.cycles
  for each row execute function public.tg_set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
