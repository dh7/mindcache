-- MindCache D1 Schema
-- Initial migration

-- Users (synced from Clerk via webhooks)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- MindCache Instances
CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  parent_instance_id TEXT REFERENCES instances(id),
  is_readonly INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_instances_project ON instances(project_id);
CREATE INDEX IF NOT EXISTS idx_instances_owner ON instances(owner_id);

-- Shares
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('project', 'instance')),
  resource_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'group', 'api_key', 'public')),
  target_id TEXT,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'admin')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_shares_resource ON shares(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_shares_target ON shares(target_type, target_id);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_id);

-- Group Members
CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (group_id, user_id)
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('account', 'project', 'instance')),
  scope_id TEXT,
  permissions TEXT NOT NULL DEFAULT '["read"]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '["key.updated"]',
  secret TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_triggered_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_webhooks_instance ON webhooks(instance_id);

-- Usage Logs (for billing)
CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  api_key_id TEXT REFERENCES api_keys(id),
  endpoint TEXT NOT NULL,
  instance_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_key ON usage_logs(api_key_id, created_at);

