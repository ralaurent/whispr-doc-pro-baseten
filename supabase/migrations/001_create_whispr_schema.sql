-- Create organizations table
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  is_guest boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create users_organizations junction table
create table if not exists public.users_organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamp with time zone default now(),
  unique(user_id, organization_id)
);

-- Create documents table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  original_name text,
  pdf_data bytea,
  renamed_pdf_data bytea,
  file_size_bytes bigint,
  status text default 'processing' check (status in ('processing', 'ready', 'error')),
  error_message text,
  ai_failed boolean default false,
  field_count integer default 0,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create document_fields table (stores detected form fields)
create table if not exists public.document_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  field_name text not null,
  field_type text,
  page_index integer,
  x numeric,
  y numeric,
  width numeric,
  height numeric,
  value text,
  original_name text,
  ai_assigned_name text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS on all tables
alter table public.organizations enable row level security;
alter table public.users_organizations enable row level security;
alter table public.documents enable row level security;
alter table public.document_fields enable row level security;

-- RLS Policies for organizations
create policy "Users can view organizations they belong to" on public.organizations for select
  using (exists (
    select 1 from public.users_organizations
    where organization_id = organizations.id
    and user_id = auth.uid()
  ));

-- RLS Policies for users_organizations
create policy "Users can view their org memberships" on public.users_organizations for select
  using (user_id = auth.uid());

create policy "Users can view other members in their orgs" on public.users_organizations for select
  using (organization_id in (
    select organization_id from public.users_organizations
    where user_id = auth.uid()
  ));

-- RLS Policies for documents
create policy "Users can view documents in their orgs" on public.documents for select
  using (organization_id in (
    select organization_id from public.users_organizations
    where user_id = auth.uid()
  ));

create policy "Users can create documents in their orgs" on public.documents for insert
  with check (organization_id in (
    select organization_id from public.users_organizations
    where user_id = auth.uid()
  ) and created_by = auth.uid());

create policy "Users can update their own documents" on public.documents for update
  using (created_by = auth.uid() and organization_id in (
    select organization_id from public.users_organizations
    where user_id = auth.uid()
  ));

create policy "Users can delete their own documents" on public.documents for delete
  using (created_by = auth.uid());

-- RLS Policies for document_fields
create policy "Users can view fields of documents they can access" on public.document_fields for select
  using (document_id in (
    select id from public.documents where organization_id in (
      select organization_id from public.users_organizations
      where user_id = auth.uid()
    )
  ));

create policy "Users can insert fields for their documents" on public.document_fields for insert
  with check (document_id in (
    select id from public.documents
    where created_by = auth.uid()
  ));

create policy "Users can update fields in their documents" on public.document_fields for update
  using (document_id in (
    select id from public.documents
    where created_by = auth.uid()
  ));

create policy "Users can delete fields from their documents" on public.document_fields for delete
  using (document_id in (
    select id from public.documents
    where created_by = auth.uid()
  ));

-- Create trigger to auto-create guest org and user_org for new users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  is_guest boolean;
begin
  is_guest := coalesce(new.raw_user_meta_data ->> 'is_guest', 'false')::boolean;

  if is_guest then
    -- Create a guest organization for this user
    insert into public.organizations (name, slug, is_guest)
    values ('Guest Org - ' || new.id, 'guest-' || new.id, true)
    returning id into org_id;
  else
    -- Create a default organization for this user
    insert into public.organizations (name, slug, is_guest)
    values (coalesce(new.raw_user_meta_data ->> 'email', 'User Organization'), 'org-' || new.id, false)
    returning id into org_id;
  end if;

  -- Add user to their organization as owner
  insert into public.users_organizations (user_id, organization_id, role)
  values (new.id, org_id, 'owner')
  on conflict (user_id, organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
