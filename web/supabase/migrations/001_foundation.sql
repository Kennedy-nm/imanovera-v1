-- Imanovera foundation: tables, row-level security, storage

create table public.series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  style_prompt text not null default '',
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series_id uuid references public.series(id) on delete set null,
  kind text not null check (kind in (
    'product_photo','logo','background','character_pose',
    'generated_image','narration','music','video'
  )),
  storage_path text not null,
  mime_type text,
  width int,
  height int,
  duration_sec numeric,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series_id uuid references public.series(id) on delete set null,
  title text not null default 'Untitled video' check (char_length(title) <= 200),
  starter text not null default 'explainer' check (starter in ('business','teacher','story','explainer')),
  plan jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','rendering','done','failed')),
  progress int not null default 0 check (progress between 0 and 100),
  plan jsonb not null,
  output_path text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index on public.series (owner_id);
create index on public.assets (owner_id);
create index on public.assets (series_id);
create index on public.episodes (owner_id);
create index on public.episodes (series_id);
create index on public.render_jobs (owner_id);
create index on public.render_jobs (episode_id);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

create trigger episodes_updated_at before update on public.episodes
for each row execute function public.set_updated_at();

-- Row-level security: people only touch their own rows
alter table public.series enable row level security;
alter table public.assets enable row level security;
alter table public.episodes enable row level security;
alter table public.render_jobs enable row level security;

create policy "own series" on public.series for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own assets" on public.assets for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "own episodes" on public.episodes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Render jobs: users may read and request; only the server updates them
create policy "read own jobs" on public.render_jobs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "request own jobs" on public.render_jobs for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'queued' and progress = 0);

-- Private file storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('assets', 'assets', false, 10485760,
    array['image/jpeg','image/png','image/webp','audio/mpeg','audio/wav']),
  ('renders', 'renders', false, 52428800, array['video/mp4'])
on conflict (id) do nothing;

create policy "read own files" on storage.objects for select to authenticated
  using (bucket_id in ('assets','renders')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "upload own assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'assets'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "update own assets" on storage.objects for update to authenticated
  using (bucket_id = 'assets'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own assets" on storage.objects for delete to authenticated
  using (bucket_id = 'assets'
         and (storage.foldername(name))[1] = (select auth.uid())::text);