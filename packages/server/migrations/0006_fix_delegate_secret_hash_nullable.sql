-- Remove legacy delegate_secret_hash column
-- Secrets are now managed via delegate_secrets table, so this column is no longer needed

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Step 1: Create new table without delegate_secret_hash
CREATE TABLE IF NOT EXISTS delegates_new (
  delegate_id TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 1,
  can_write INTEGER NOT NULL DEFAULT 0,
  can_system INTEGER NOT NULL DEFAULT 0,
  secret_revealed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER
);

-- Step 2: Copy data from old table (excluding delegate_secret_hash)
-- Note: Using COALESCE and literal 0 for secret_revealed to handle cases where 
-- the column might not exist in older production databases
INSERT INTO delegates_new 
  (delegate_id, created_by_user_id, name, can_read, can_write, can_system, secret_revealed, created_at, expires_at)
SELECT 
  delegate_id, created_by_user_id, name, can_read, can_write, can_system, 0, created_at, expires_at
FROM delegates;

-- Step 3: Drop old table
DROP TABLE delegates;

-- Step 4: Rename new table
ALTER TABLE delegates_new RENAME TO delegates;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_delegates_user ON delegates(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_delegates_expires ON delegates(expires_at);

