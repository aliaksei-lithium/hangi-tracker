-- One JSON snapshot per user. rev increases on every write; PUT with a stale rev gets 409.
CREATE TABLE user_data (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  doc        TEXT    NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
