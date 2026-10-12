#!/usr/bin/env python3
"""Create a Hangi Tracker user.

Asks for a login name, a display name and a password, hashes the password with
PBKDF2-SHA256 (same parameters as worker/crypto.ts) and prints the wrangler
command that inserts the user into D1. Nothing is sent anywhere by this script.

Usage:
    python3 scripts/add_user.py            # prints a command for the deployed database
    python3 scripts/add_user.py --local    # prints a command for the local dev database

Login is password only for now, so every user needs a different password.
"""

import argparse
import getpass
import hashlib
import re
import secrets
import shlex
import sys

ITERATIONS = 100_000
SALT_BYTES = 16
HASH_BYTES = 32


def hash_password(password: str, salt_hex: str, iterations: int = ITERATIONS) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iterations, HASH_BYTES
    )
    return digest.hex()


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--local", action="store_true", help="target the local dev database")
    args = parser.parse_args()

    name = input("Login name (letters, digits, - or _): ").strip().lower()
    if not re.fullmatch(r"[a-z0-9_-]{1,40}", name):
        print("Invalid name.", file=sys.stderr)
        return 1
    display_name = input("Display name for the greeting: ").strip()
    if not display_name or len(display_name) > 60:
        print("Display name must be 1 to 60 characters.", file=sys.stderr)
        return 1
    password = getpass.getpass("Password (at least 8 characters): ")
    if len(password) < 8:
        print("Password is too short.", file=sys.stderr)
        return 1
    if getpass.getpass("Repeat password: ") != password:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    salt = secrets.token_hex(SALT_BYTES)
    pw_hash = hash_password(password, salt)
    sql = (
        "INSERT INTO users (name, display_name, pw_salt, pw_hash) VALUES "
        f"({sql_text(name)}, {sql_text(display_name)}, {sql_text(salt)}, {sql_text(pw_hash)});"
    )
    target = "--local" if args.local else "--remote"
    print("\nRun this command from the repository root:\n")
    print(f"npx wrangler d1 execute hangi-tracker {target} --command {shlex.quote(sql)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
