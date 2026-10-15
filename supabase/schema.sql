-- Run once in the Supabase SQL Editor. Requires a Supabase project with Auth enabled.
create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  filename text not null,
  file_type text not null check (file_type in ('pdf','docx','txt','md')),
  file_size integer not null check (file_size > 0 and file_size <= 5242880),
  storage_path text not null unique,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  error text,
  page_count integer not null default 0,
  chunk_count integer not null default 0,
  indexed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  page_number integer,
  content text not null,
  embedding extensions.vector(1536) not null,
  unique (document_id, chunk_index)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  document_ids uuid[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_user on public.documents(user_id, created_at desc);
create index if not exists idx_chunks_document on public.document_chunks(document_id);
create index if not exists idx_chunks_user on public.document_chunks(user_id);
create index if not exists idx_conversations_user on public.conversations(user_id, updated_at desc);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_chunks_vector on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "owner documents select" on public.documents for select to authenticated using (user_id = (select auth.uid()));
create policy "owner documents insert" on public.documents for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner documents update" on public.documents for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner documents delete" on public.documents for delete to authenticated using (user_id = (select auth.uid()));

create policy "owner chunks select" on public.document_chunks for select to authenticated using (user_id = (select auth.uid()));
create policy "owner chunks insert" on public.document_chunks for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));
create policy "owner chunks delete" on public.document_chunks for delete to authenticated using (user_id = (select auth.uid()));

create policy "owner conversations select" on public.conversations for select to authenticated using (user_id = (select auth.uid()));
create policy "owner conversations insert" on public.conversations for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner conversations update" on public.conversations for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner conversations delete" on public.conversations for delete to authenticated using (user_id = (select auth.uid()));

create policy "owner messages select" on public.messages for select to authenticated using (user_id = (select auth.uid()));
create policy "owner messages insert" on public.messages for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

create policy "owner file insert" on storage.objects for insert to authenticated
with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner file select" on storage.objects for select to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner file delete" on storage.objects for delete to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  filter_document_ids uuid[],
  match_count integer default 8
)
returns table (id bigint, document_id uuid, document_name text, page_number integer, content text, similarity double precision)
language sql stable security invoker set search_path = public, extensions
as $$
  select c.id, c.document_id, d.filename, c.page_number, c.content,
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.user_id = (select auth.uid())
    and d.user_id = (select auth.uid())
    and d.status = 'ready'
    and c.document_id = any(filter_document_ids)
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 12);
$$;
grant execute on function public.match_document_chunks(extensions.vector, uuid[], integer) to authenticated;
