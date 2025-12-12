-- Standardize permissions: change 'system' to 'admin' in do_permissions
-- This aligns with shares, ws_tokens, and Durable Object which all use 'admin'

-- Step 1: Recreate table with updated CHECK constraint
-- SQLite doesn't support ALTER TABLE to modify CHECK constraints, so we recreate the table
-- We'll update the data during the copy

-- Create new table with 'admin' instead of 'system'
CREATE TABLE IF NOT EXISTS do_permissions_new (
  do_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'delegate')),
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'admin')),
  granted_by_user_id TEXT NOT NULL REFERENCES users(id),
  granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  PRIMARY KEY (do_id, actor_id, permission)
);

-- Copy data from old table to new table, mapping 'system' to 'admin'
INSERT INTO do_permissions_new (do_id, actor_id, actor_type, permission, granted_by_user_id, granted_at, expires_at)
SELECT 
  do_id,
  actor_id,
  actor_type,
  CASE WHEN permission = 'system' THEN 'admin' ELSE permission END as permission,
  granted_by_user_id,
  granted_at,
  expires_at
FROM do_permissions;

-- Drop old table
DROP TABLE do_permissions;

-- Rename new table to original name
ALTER TABLE do_permissions_new RENAME TO do_permissions;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_do_permissions_do ON do_permissions(do_id);
CREATE INDEX IF NOT EXISTS idx_do_permissions_actor ON do_permissions(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_do_permissions_expires ON do_permissions(expires_at);
