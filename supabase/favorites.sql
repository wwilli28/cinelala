create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  film_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, film_id)
);

alter table public.favorites enable row level security;

create policy "Users can view their own favorites"
on public.favorites
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own favorites"
on public.favorites
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete their own favorites"
on public.favorites
for delete
to authenticated
using (auth.uid() = user_id);
