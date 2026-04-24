#!/usr/bin/env bash
# patch-deps.sh — Re-apply node_modules compatibility patches after npm install.
#
# Run this after every `npm install` or dependency change:
#   npm install && npm run patch-deps
#
# Context: mineflayer and its dependencies ship with minecraft-data/prismarine-item
# that predates full MC 1.21.2 item-component support (data version 26.1.2).
# These patches were originally applied during CW10-CW11 (Mar 2026) and must
# be re-applied whenever node_modules is refreshed.
#
# Patches applied here:
#   CW10: prismarine-item — handle unknown item component IDs without throwing
#   CW10: mineflayer inventory plugin — skip component deserialization errors
#   CW11: minecraft-data — add missing 1.21.2 item component type mappings
#
# NOTE: The exact patch diffs were not available in the repository at the time
# patch-deps.sh was created (Apr 2026).  The original patches were applied
# directly to node_modules during live sessions.  A future agent or Jay should
# populate the heredocs below from the CW10/CW11 session notes and test on
# Claudio_Test_World before deploying to production.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NM="$SCRIPT_DIR/node_modules"

if [ ! -d "$NM" ]; then
  echo "[patch-deps] ERROR: node_modules not found. Run 'npm install' first." >&2
  exit 1
fi

echo "[patch-deps] Applying MC 1.21.2 (data version 26.1.2) compatibility patches..."

# ── Patch 1 (CW10): prismarine-item — tolerate unknown component IDs ─────────
# Problem: prismarine-item throws on item component IDs added in MC 1.21.2
# that are not present in its registry, crashing window_items deserialization.
# Fix: wrap the component read loop in a try/catch and skip unknown IDs.
#
# Target: node_modules/prismarine-item/index.js
#
# TODO: populate patch content from CW10 session notes
PRISMARINE_ITEM="$NM/prismarine-item/index.js"
if [ ! -f "$PRISMARINE_ITEM" ]; then
  echo "[patch-deps] WARNING: prismarine-item/index.js not found — skipping patch 1" >&2
else
  if grep -q 'patch-deps:cw10' "$PRISMARINE_ITEM" 2>/dev/null; then
    echo "[patch-deps] Patch 1 (CW10 prismarine-item) already applied."
  else
    echo "[patch-deps] TODO: Patch 1 (CW10 prismarine-item) — content not yet populated."
    echo "             Source the diff from CW10 session notes and add it here."
    # patch -p1 -d "$NM/prismarine-item" << 'EOF'
    # <patch content here>
    # EOF
    # After applying, append a marker line so the guard above works:
    # echo '// patch-deps:cw10' >> "$PRISMARINE_ITEM"
  fi
fi

# ── Patch 2 (CW10): mineflayer inventory — skip deserialization errors ────────
# Problem: mineflayer's inventory plugin propagates prismarine-item parse errors
# instead of returning an empty slot, causing bot.inventory to be null after
# receiving a window_items packet with any unrecognised component.
# Fix: catch errors in the item-from-slot helper and return null.
#
# Target: node_modules/mineflayer/lib/plugins/inventory.js
#
# TODO: populate patch content from CW10 session notes
MINEFLAYER_INV="$NM/mineflayer/lib/plugins/inventory.js"
if [ ! -f "$MINEFLAYER_INV" ]; then
  echo "[patch-deps] WARNING: mineflayer/lib/plugins/inventory.js not found — skipping patch 2" >&2
else
  if grep -q 'patch-deps:cw10' "$MINEFLAYER_INV" 2>/dev/null; then
    echo "[patch-deps] Patch 2 (CW10 mineflayer inventory) already applied."
  else
    echo "[patch-deps] TODO: Patch 2 (CW10 mineflayer inventory) — content not yet populated."
    echo "             Source the diff from CW10 session notes and add it here."
  fi
fi

# ── Patch 3 (CW11): minecraft-data — 1.21.2 item component type mappings ─────
# Problem: minecraft-data ships with incomplete item component type IDs for
# MC 1.21.2.  Items with new component types (e.g. equipped, tooltip_style,
# entity_data) are rejected by the protocol parser before reaching prismarine-item.
# Fix: extend the componentTypeById map with the missing 1.21.2 entries.
#
# Target: node_modules/minecraft-data/minecraft-data/data/pc/1.21.x/itemComponents.json
#         (or equivalent version path, depending on installed version)
#
# TODO: populate patch content from CW11 session notes
MC_DATA_VERSION_DIR=$(find "$NM/minecraft-data/minecraft-data/data/pc" -maxdepth 1 -type d -name "1.21*" 2>/dev/null | sort -V | tail -1)
if [ -z "$MC_DATA_VERSION_DIR" ]; then
  echo "[patch-deps] WARNING: minecraft-data 1.21.x version directory not found — skipping patch 3" >&2
else
  COMPONENT_JSON="$MC_DATA_VERSION_DIR/itemComponents.json"
  if [ ! -f "$COMPONENT_JSON" ]; then
    echo "[patch-deps] WARNING: $COMPONENT_JSON not found — skipping patch 3" >&2
  elif grep -q 'patch-deps:cw11' "$COMPONENT_JSON" 2>/dev/null; then
    echo "[patch-deps] Patch 3 (CW11 minecraft-data itemComponents) already applied."
  else
    echo "[patch-deps] TODO: Patch 3 (CW11 minecraft-data itemComponents) — content not yet populated."
    echo "             Source the additions from CW11 session notes and add them here."
  fi
fi

echo "[patch-deps] Done. Review any TODO lines above and populate from CW10/CW11 session notes."
