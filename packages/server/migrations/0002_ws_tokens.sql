-- WebSocket Tokens
-- Short-lived tokens for secure WebSocket connections

CREATE TABLE IF NOT EXISTS ws_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'admin')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ws_tokens_expires ON ws_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_ws_tokens_instance ON ws_tokens(instance_id);

