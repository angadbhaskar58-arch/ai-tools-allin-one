create table if not exists public.tools (
    category text not null,
    name text not null,
    description text not null,
    url text not null check (url ~ '^https://'),
    pricing text not null check (pricing in ('free', 'freemium', 'paid')),
    domain text not null,
    position integer not null,
    primary key (category, name)
);

create table if not exists public.payment_orders (
    order_id text primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    amount integer not null check (amount = 29900),
    currency text not null check (currency = 'INR'),
    status text not null default 'created' check (status in ('created', 'paid')),
    payment_id text unique,
    created_at timestamptz not null default now()
);

alter table public.payment_orders
    drop constraint if exists payment_orders_amount_check;
alter table public.payment_orders
    add constraint payment_orders_amount_check check (amount = 29900);

create table if not exists public.memberships (
    user_id uuid primary key references auth.users (id) on delete cascade,
    order_id text not null unique references public.payment_orders (order_id),
    payment_id text not null unique,
    paid_at timestamptz not null default now()
);

alter table public.tools enable row level security;
alter table public.payment_orders enable row level security;
alter table public.memberships enable row level security;
