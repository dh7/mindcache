-- MindCache OAuth Provider
-- Enables "Sign in with MindCache" for third-party apps

-- OAuth Applications (registered by developers)
CREATE TABLE IF NOT EXISTS oauth_apps (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT NOT NULL,
  redirect_uris TEXT NOT NULL DEFAULT '[]',  -- JSON array of allowed redirect URIs
  scopes TEXT NOT NULL DEFAULT '["read"]',   -- JSON array of allowed scopes
  logo_url TEXT,
  homepage_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_oauth_apps_client ON oauth_apps(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_apps_owner ON oauth_apps(owner_user_id);

-- OAuth Authorization Codes (short-lived, one-time use)
-- Used in the OAuth flow between authorize redirect and token exchange
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  redirect_uri TEXT NOT NULL,
  scopes TEXT NOT NULL,           -- JSON array of granted scopes
  code_challenge TEXT,            -- PKCE: hashed verifier
  code_challenge_method TEXT,     -- PKCE: 'S256' or 'plain'
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_client ON oauth_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_codes(expires_at);

-- OAuth Access Tokens
-- Short-lived tokens (1 hour) for API access
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  instance_id TEXT REFERENCES instances(id),  -- Auto-provisioned instance for this user+app
  scopes TEXT NOT NULL,           -- JSON array
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_hash ON oauth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client ON oauth_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON oauth_tokens(expires_at);

-- OAuth Refresh Tokens
-- Long-lived tokens (30 days) for getting new access tokens
-- Rotated on each use (old token invalidated, new one issued)
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  access_token_id TEXT NOT NULL REFERENCES oauth_tokens(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER,             -- NULL = never expires (not recommended)
  revoked_at INTEGER,             -- Set when token is used or explicitly revoked
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_hash ON oauth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_user ON oauth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_access ON oauth_refresh_tokens(access_token_id);

-- User App Authorizations
-- Remembers what scopes user has granted to each app
-- Allows skipping consent screen for previously authorized apps (same scopes)
CREATE TABLE IF NOT EXISTS oauth_authorizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL,
  scopes TEXT NOT NULL,           -- JSON array of authorized scopes
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations_user ON oauth_authorizations(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_authorizations_client ON oauth_authorizations(client_id);

-- OAuth User Instances
-- Maps user+app to their auto-provisioned instance
-- Each OAuth app gets exactly one instance per user (isolated)
CREATE TABLE IF NOT EXISTS oauth_user_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL,
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,  -- The "OAuth Apps" project
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_user_instances_user ON oauth_user_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_user_instances_client ON oauth_user_instances(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_user_instances_instance ON oauth_user_instances(instance_id);
