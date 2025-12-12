-- Add delegate_secrets table for multiple secrets per delegate
-- This allows revoking individual secrets without revoking the entire delegate
-- The old delegate_secret_hash column in delegates is kept for backward compatibility

CREATE TABLE IF NOT EXISTS delegate_secrets (
  secret_id TEXT PRIMARY KEY,
  delegate_id TEXT NOT NULL REFERENCES delegates(delegate_id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  name TEXT,  -- Optional name (e.g., "Production API", "Dev Environment")
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  revoked_at INTEGER,  -- NULL = active, timestamp = revoked
  created_by_user_id TEXT NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_delegate_secrets_delegate ON delegate_secrets(delegate_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_delegate_secrets_hash ON delegate_secrets(secret_hash) WHERE revoked_at IS NULL;
