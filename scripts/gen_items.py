#!/usr/bin/env python3
# gen_items.py — Generate minecraft-data/data/pc/26.1.2/items.json from server report
#
# Prerequisites:
#   1. Extract registries from server jar (see scripts/README.md)
#   2. Place output at /tmp/registries_26.1.2.json
#
# Run from haksnbot-tools directory:
#   python3 scripts/gen_items.py

import json
import os
import sys

BASE = os.path.join(os.path.dirname(__file__), '..', 'node_modules', 'minecraft-data', 'minecraft-data', 'data', 'pc')
BASE = os.path.normpath(BASE)

items_src = os.path.join(BASE, '1.21.11', 'items.json')
registries_src = '/tmp/registries_26.1.2.json'
out = os.path.join(BASE, '26.1.2', 'items.json')

if not os.path.exists(registries_src):
    print(f"ERROR: {registries_src} not found. See scripts/README.md to generate it.", file=sys.stderr)
    sys.exit(1)

with open(items_src) as f:
    items_1_21 = json.load(f)

with open(registries_src) as f:
    reg = json.load(f)

item_entries = reg.get('minecraft:item', {}).get('entries', {})
report_by_name = {k.replace('minecraft:', ''): v['protocol_id'] for k, v in item_entries.items()}

updated = 0
missing = []
for item in items_1_21:
    name = item['name']
    if name in report_by_name:
        item['id'] = report_by_name[name]
        updated += 1
    else:
        missing.append(name)

print(f"Updated: {updated}, Missing from 26.1.2: {len(missing)}")
if missing:
    print(f"Missing: {missing[:10]}")

os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w') as f:
    json.dump(items_1_21, f)

print(f"Written to {out}")
