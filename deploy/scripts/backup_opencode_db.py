#!/usr/bin/env python3
"""Backup diario y con retencion de 7 dias de cada DB opencode de usuario."""
import sqlite3
import json
import os
import glob
import time

USERS_FILE = "/opt/asimov/users.json"
VOLUME_BASE = "/var/lib/docker/volumes"
BACKUP_BASE = "/opt/asimov/backups"
RETENTION_DAYS = 7


def backup_user(username: str):
    data_dir = f"{VOLUME_BASE}/asimov_opencode_data_{username}/_data"
    db_files = glob.glob(f"{data_dir}/*.db")
    if not db_files:
        print(f"[{username}] no db found, skip")
        return
    src_path = db_files[0]
    dest_dir = f"{BACKUP_BASE}/{username}"
    os.makedirs(dest_dir, exist_ok=True)
    ts = time.strftime("%Y%m%d%H%M%S")
    dest_path = f"{dest_dir}/backup-{ts}.db"

    src = sqlite3.connect(src_path)
    dst = sqlite3.connect(dest_path)
    src.backup(dst)
    src.close()
    dst.close()
    print(f"[{username}] backup ok -> {dest_path}")

    cutoff = time.time() - RETENTION_DAYS * 86400
    for f in glob.glob(f"{dest_dir}/backup-*.db"):
        if os.path.getmtime(f) < cutoff:
            os.remove(f)
            print(f"[{username}] pruned old backup {f}")


if __name__ == "__main__":
    with open(USERS_FILE) as f:
        users = json.load(f)
    for username in users:
        try:
            backup_user(username)
        except Exception as e:
            print(f"[{username}] ERROR: {e}")
