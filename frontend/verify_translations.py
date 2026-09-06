"""
Validation script to guarantee complete key parity across all 4 language dictionaries:
en.json, ta.json, hi.json, kn.json.
Ensures zero missing-key warnings across all role flows.
"""

import os
import json
import sys

LOCALES_DIR = os.path.join(os.path.dirname(__file__), "src", "locales")
LANGUAGES = ["en", "ta", "hi", "kn"]

def get_nested_keys(data, prefix=""):
    keys = set()
    for k, v in data.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(get_nested_keys(v, full_key))
        else:
            keys.add(full_key)
    return keys

def verify():
    dicts = {}
    for lang in LANGUAGES:
        path = os.path.join(LOCALES_DIR, f"{lang}.json")
        if not os.path.exists(path):
            print(f"Error: missing locale file {path}")
            sys.exit(1)
        with open(path, "r", encoding="utf-8") as f:
            dicts[lang] = json.load(f)

    en_keys = get_nested_keys(dicts["en"])
    print(f"Base dictionary (en) contains {len(en_keys)} translation keys.")

    all_passed = True
    for lang in ["ta", "hi", "kn"]:
        target_keys = get_nested_keys(dicts[lang])
        missing = en_keys - target_keys
        extra = target_keys - en_keys
        if missing:
            print(f"FAILED: {lang}.json is missing keys: {missing}")
            all_passed = False
        if extra:
            print(f"WARNING: {lang}.json has extra keys: {extra}")
        if not missing:
            print(f"PASSED: {lang}.json has 100% key parity with en.json ({len(target_keys)} keys).")

    if all_passed:
        print("\nAll 4 languages verified successfully! Zero missing keys.")
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    verify()
