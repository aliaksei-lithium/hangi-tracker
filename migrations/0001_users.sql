-- Users are created with scripts/add_user.py. No sign-up in the app.
-- Login is password only for now; name stays so name + password can be added later.
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,   -- lower-cased login name
  display_name TEXT    NOT NULL,          -- shown in the greeting
  pw_salt      TEXT    NOT NULL,          -- hex, 16 bytes
  pw_hash      TEXT    NOT NULL,          -- hex, PBKDF2-SHA256, 100 000 iterations, 32 bytes
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
