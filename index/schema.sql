-- DualLaunch index. Source of truth is chain state, not DexScreener or Birdeye.
-- tokens = discovered launches. trades = decoded swaps. candles = rollups we own.

create table if not exists tokens (
  id text primary key,                 -- rh-0x.. or sol-<mint>
  chain text not null,                 -- rh | sol
  address text not null,
  name text,
  symbol text,
  decimals int,
  logo text,
  description text,
  twitter text,
  telegram text,
  website text,
  creator text,
  curve text,                          -- bonding-curve address / PDA
  pool text,                           -- post-graduation pool
  quote text,                          -- SOL | ETH | token address
  created_at timestamptz,
  graduated boolean not null default false,
  curve_pct numeric,
  price_usd numeric,
  mcap_usd numeric,
  vol_24h_usd numeric,
  last_trade_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (chain, address)
);

create index if not exists tokens_created_idx on tokens (created_at desc);
create index if not exists tokens_mcap_idx on tokens (mcap_usd desc nulls last);
create index if not exists tokens_last_trade_idx on tokens (last_trade_at desc nulls last);

create table if not exists trades (
  id bigserial primary key,
  token_id text not null references tokens(id),
  chain text not null,
  tx text not null,
  log_index int not null default 0,
  side text not null,                  -- buy | sell
  quote_amount numeric,
  token_amount numeric,
  price_usd numeric,
  usd numeric,
  actor text,
  block_time timestamptz not null,
  unique (chain, tx, log_index)
);

create index if not exists trades_token_time_idx on trades (token_id, block_time desc);

create table if not exists candles (
  token_id text not null references tokens(id),
  tf text not null,                    -- 1m | 5m | 1h
  ts timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume_usd numeric not null default 0,
  primary key (token_id, tf, ts)
);

create table if not exists cursors (
  name text primary key,               -- sol-slot | rh-block
  value text not null,
  updated_at timestamptz not null default now()
);
