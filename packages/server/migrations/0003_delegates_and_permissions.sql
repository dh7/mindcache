-- Delegates (API Keys) with key-level permissions
-- Delegates are created by users and have inherent capabilities

CREATE TABLE IF NOT EXISTS delegates (
  delegate_id TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 1,
  can_write INTEGER NOT NULL DEFAULT 0,
  can_system INTEGER NOT NULL DEFAULT 0,
  secret_revealed INTEGER NOT NULL DEFAULT 0,  -- Legacy: kept for backward compatibility
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_delegates_user ON delegates(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_delegates_expires ON delegates(expires_at);

-- DO Ownership - tracks which user owns which Durable Object
CREATE TABLE IF NOT EXISTS do_ownership (
  do_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_do_ownership_user ON do_ownership(owner_user_id);

-- DO Permissions - resource-level permissions for users and delegates
CREATE TABLE IF NOT EXISTS do_permissions (
  do_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'delegate')),
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'system')),
  granted_by_user_id TEXT NOT NULL REFERENCES users(id),
  granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  PRIMARY KEY (do_id, actor_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_do_permissions_do ON do_permissions(do_id);
CREATE INDEX IF NOT EXISTS idx_do_permissions_actor ON do_permissions(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_do_permissions_expires ON do_permissions(expires_at);
