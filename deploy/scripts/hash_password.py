#!/usr/bin/env python3
"""Genera un hash scrypt de password para users.json. Uso: python3 hash_password.py <password>"""
import sys
import os
import hashlib
import binascii


def hash_password(password: str) -> tuple:
    salt = os.urandom(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
    return binascii.hexlify(salt).decode(), binascii.hexlify(derived).decode()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python3 hash_password.py <password>")
        sys.exit(1)
    salt_hex, hash_hex = hash_password(sys.argv[1])
    print(f"salt={salt_hex}")
    print(f"password_hash={hash_hex}")
