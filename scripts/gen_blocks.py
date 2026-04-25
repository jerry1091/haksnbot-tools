#!/usr/bin/env python3
# gen_blocks.py — Generate minecraft-data/data/pc/26.1.2/blocks.json from server report
#
# Prerequisites:
#   1. Extract blocks report from server jar (see scripts/README.md)
#   2. Place output at /tmp/blocks_26.1.2_report.json
#
# Run from haksnbot-tools directory:
#   python3 scripts/gen_blocks.py

import json
import os
import sys

BASE = os.path.join(os.path.dirname(__file__), '..', 'node_modules', 'minecraft-data', 'minecraft-data', 'data', 'pc')
BASE = os.path.normpath(BASE)

blocks_src = os.path.join(BASE, '1.21.11', 'blocks.json')
report_src = '/tmp/blocks_26.1.2_report.json'
out = os.path.join(BASE, '26.1.2', 'blocks.json')

if not os.path.exists(report_src):
    print(f"ERROR: {report_src} not found. See scripts/README.md to generate it.", file=sys.stderr)
    sys.exit(1)

with open(blocks_src) as f:
    blocks_1_21 = json.load(f)

with open(report_src) as f:
    report = json.load(f)

report_by_name = {}
for full_name, data in report.items():
    name = full_name.replace('minecraft:', '')
    states = data['states']
    min_id = min(s['id'] for s in states)
    max_id = max(s['id'] for s in states)
    default_id = next((s['id'] for s in states if s.get('default', False)), min_id)
    report_by_name[name] = {'min': min_id, 'max': max_id, 'default': default_id}

updated = 0
missing = []
for block in blocks_1_21:
    name = block['name']
    if name in report_by_name:
        info = report_by_name[name]
        block['minStateId'] = info['min']
        block['maxStateId'] = info['max']
        block['defaultState'] = info['default']
        updated += 1
    else:
        missing.append(name)

print(f"Updated: {updated}, Missing from 26.1.2: {len(missing)}")
if missing:
    print(f"Missing: {missing[:10]}")

os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w') as f:
    json.dump(blocks_1_21, f)

print(f"Written to {out}")
