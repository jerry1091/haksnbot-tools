#!/usr/bin/env bash
# patch-deps.sh — Re-apply all MC 26.1.2 compatibility patches to node_modules
#
# Run this after every `npm install`. Patches are in node_modules and not
# preserved by npm — they will be silently wiped on reinstall.
#
# Usage: ./patch-deps.sh
# Must be run from the haksnbot-tools directory.

set -e
cd "$(dirname "$0")"

NM=node_modules
MC_DATA=$NM/minecraft-data/minecraft-data/data/pc

echo "Applying MC 26.1.2 compatibility patches..."

# ---------------------------------------------------------------------------
# 1. mineflayer/lib/version.js — add 26.1.2 to testedVersions
# ---------------------------------------------------------------------------
if ! grep -q "'26.1.2'" $NM/mineflayer/lib/version.js; then
  sed -i "s/'1.21.11'\]/'1.21.11', '26.1.2']/" $NM/mineflayer/lib/version.js
  echo "  [OK] mineflayer/lib/version.js"
else
  echo "  [SKIP] mineflayer/lib/version.js (already patched)"
fi

# ---------------------------------------------------------------------------
# 2. minecraft-protocol/src/version.js — add 26.1.2 support
# ---------------------------------------------------------------------------
if ! grep -q "'26.1.2'" $NM/minecraft-protocol/src/version.js; then
  node -e "
const path = '$NM/minecraft-protocol/src/version.js';
let src = require('fs').readFileSync(path, 'utf8');
src = src.replace(\"defaultVersion: '1.21.11'\", \"defaultVersion: '26.1.2'\");
src = src.replace(\"'1.21.11']\", \"'1.21.11', '26.1.2']\");
require('fs').writeFileSync(path, src);
"
  echo "  [OK] minecraft-protocol/src/version.js"
else
  echo "  [SKIP] minecraft-protocol/src/version.js (already patched)"
fi

# ---------------------------------------------------------------------------
# 3. mineflayer/lib/plugins/time.js — handle packet.gameTime rename in 26.1.2
# ---------------------------------------------------------------------------
if ! grep -q "packet.gameTime" $NM/mineflayer/lib/plugins/time.js; then
  cat > $NM/mineflayer/lib/plugins/time.js << 'ENDOFFILE'
module.exports = inject

function inject (bot) {
  bot.time = {
    doDaylightCycle: null,
    bigTime: null,
    time: null,
    timeOfDay: null,
    day: null,
    isDay: null,
    moonPhase: null,
    bigAge: null,
    age: null
  }
  bot._client.on('update_time', (packet) => {
    const time = packet.time !== undefined ? longToBigInt(packet.time) : longToBigInt(packet.gameTime)
    const age = packet.age !== undefined ? longToBigInt(packet.age) : (bot.time.bigAge ?? time)
    const doDaylightCycle = packet.tickDayTime !== undefined ? !!packet.tickDayTime : null
    // When doDaylightCycle is false, we need to take the absolute value of time
    const finalTime = doDaylightCycle == null ? time : (doDaylightCycle ? time : (time < 0n ? -time : time))

    bot.time.doDaylightCycle = doDaylightCycle
    bot.time.bigTime = finalTime
    bot.time.time = Number(finalTime)
    bot.time.timeOfDay = bot.time.time % 24000
    bot.time.day = Math.floor(bot.time.time / 24000)
    bot.time.isDay = bot.time.timeOfDay >= 0 && bot.time.timeOfDay < 13000
    bot.time.moonPhase = bot.time.day % 8
    bot.time.bigAge = age
    bot.time.age = Number(age)

    bot.emit('time')
  })
}

function longToBigInt (arr) {
  return BigInt.asIntN(64, (BigInt(arr[0]) << 32n)) | BigInt(arr[1])
}
ENDOFFILE
  echo "  [OK] mineflayer/lib/plugins/time.js"
else
  echo "  [SKIP] mineflayer/lib/plugins/time.js (already patched)"
fi

# ---------------------------------------------------------------------------
# 4. mineflayer/lib/plugins/health.js — set health/food before emitting spawn
# ---------------------------------------------------------------------------
if ! grep -q "bot.foodSaturation = packet.foodSaturation" $NM/mineflayer/lib/plugins/health.js | grep -q "once"; then
  cat > $NM/mineflayer/lib/plugins/health.js << 'ENDOFFILE'
module.exports = inject

function inject (bot, options) {
  bot.isAlive = true

  bot._client.on('respawn', (packet) => {
    bot.isAlive = false
    bot.emit('respawn')
  })

  bot._client.once('update_health', (packet) => {
    bot.health = packet.health
    bot.food = packet.food
    bot.foodSaturation = packet.foodSaturation
    if (packet.health > 0) {
      bot.emit('spawn')
    }
  })

  bot._client.on('update_health', (packet) => {
    bot.health = packet.health
    bot.food = packet.food
    bot.foodSaturation = packet.foodSaturation
    bot.emit('health')
    if (bot.health <= 0) {
      if (bot.isAlive) {
        bot.isAlive = false
        bot.emit('death')
      }
      if (!options.respawn) return
      bot.respawn()
    } else if (bot.health > 0 && !bot.isAlive) {
      bot.isAlive = true
      bot.emit('spawn')
    }
  })

  const respawn = () => {
    if (bot.isAlive) return
    bot._client.write('client_command', bot.supportFeature('respawnIsPayload') ? { payload: 0 } : { actionId: 0 })
  }

  bot.respawn = respawn
}
ENDOFFILE
  echo "  [OK] mineflayer/lib/plugins/health.js"
else
  echo "  [SKIP] mineflayer/lib/plugins/health.js (already patched)"
fi

# ---------------------------------------------------------------------------
# 5. mineflayer/lib/plugins/entities.js — use new attack packet for 26.1.2+
# ---------------------------------------------------------------------------
if ! grep -q "attackUsesOwnPacket" $NM/mineflayer/lib/plugins/entities.js; then
  sed -i "s/bot\._client\.write('use_entity', { target: target\.id, mouse: 1/if (bot.supportFeature('attackUsesOwnPacket')) {\n        bot._client.write('attack', { entityId: target.id })\n      } else {\n        bot._client.write('use_entity', { target: target.id, mouse: 1/" $NM/mineflayer/lib/plugins/entities.js
  echo "  [OK] mineflayer/lib/plugins/entities.js — NOTE: verify attack function manually if bot fails to attack"
else
  echo "  [SKIP] mineflayer/lib/plugins/entities.js (already patched)"
fi

# ---------------------------------------------------------------------------
# 6. prismarine-physics/lib/features.json — add 26.1 to liquid gravity + climb
# ---------------------------------------------------------------------------
if ! grep -q '"26.1"' $NM/prismarine-physics/lib/features.json; then
  node -e "
const path = '$NM/prismarine-physics/lib/features.json';
const features = JSON.parse(require('fs').readFileSync(path, 'utf8'));
for (const f of features) {
  if (f.name === 'proportionalLiquidGravity' || f.name === 'climbUsingJump') {
    if (!f.versions.includes('26.1')) f.versions.push('26.1');
  }
}
require('fs').writeFileSync(path, JSON.stringify(features, null, 2) + '\n');
"
  echo "  [OK] prismarine-physics/lib/features.json"
else
  echo "  [SKIP] prismarine-physics/lib/features.json (already patched)"
fi

# ---------------------------------------------------------------------------
# 7. prismarine-chunk — add usesFluidCount support for 26.1.2 chunk sections
# ---------------------------------------------------------------------------
if ! grep -q "usesFluidCount" $NM/prismarine-chunk/src/pc/common/PaletteChunkSection.js; then
  echo "  [WARN] PaletteChunkSection.js needs manual patch — copy from bot machine"
  echo "         scp claudio@192.168.1.152:/home/claudio/haksnbot-tools/node_modules/prismarine-chunk/src/pc/common/PaletteChunkSection.js $NM/prismarine-chunk/src/pc/common/"
else
  echo "  [SKIP] prismarine-chunk/src/pc/common/PaletteChunkSection.js (already patched)"
fi

if ! grep -q "usesFluidCount" $NM/prismarine-chunk/src/pc/1.18/ChunkColumn.js; then
  echo "  [WARN] ChunkColumn.js needs manual patch — copy from bot machine"
  echo "         scp claudio@192.168.1.152:/home/claudio/haksnbot-tools/node_modules/prismarine-chunk/src/pc/1.18/ChunkColumn.js $NM/prismarine-chunk/src/pc/1.18/"
else
  echo "  [SKIP] prismarine-chunk/src/pc/1.18/ChunkColumn.js (already patched)"
fi

# ---------------------------------------------------------------------------
# 8. minecraft-data — add 26.1.2 version metadata files
# ---------------------------------------------------------------------------
mkdir -p $MC_DATA/26.1.2

if [ ! -f $MC_DATA/26.1.2/version.json ]; then
  cat > $MC_DATA/26.1.2/version.json << 'ENDOFFILE'
{
  "version": 775,
  "minecraftVersion": "26.1.2",
  "majorVersion": "26.1",
  "releaseType": "release"
}
ENDOFFILE
  echo "  [OK] minecraft-data/26.1.2/version.json"
else
  echo "  [SKIP] minecraft-data/26.1.2/version.json (exists)"
fi

# Add 26.1.2 to protocolVersions.json
if ! node -e "const d=require('./$MC_DATA/common/protocolVersions.json'); process.exit(d.some(v=>v.minecraftVersion==='26.1.2')?0:1)" 2>/dev/null; then
  node -e "
const path = './$MC_DATA/common/protocolVersions.json';
const arr = JSON.parse(require('fs').readFileSync(path, 'utf8'));
arr.push({ minecraftVersion: '26.1.2', version: 775, dataVersion: 4790, usesNetty: true, majorVersion: '26.1', releaseType: 'release' });
require('fs').writeFileSync(path, JSON.stringify(arr, null, 2) + '\n');
"
  echo "  [OK] minecraft-data/common/protocolVersions.json"
else
  echo "  [SKIP] minecraft-data/common/protocolVersions.json (already has 26.1.2)"
fi

# Add 26.1.2 to versions.json
if ! node -e "const d=require('./$MC_DATA/common/versions.json'); process.exit(d.includes('26.1.2')?0:1)" 2>/dev/null; then
  node -e "
const path = './$MC_DATA/common/versions.json';
const arr = JSON.parse(require('fs').readFileSync(path, 'utf8'));
arr.push('26.1.2');
require('fs').writeFileSync(path, JSON.stringify(arr, null, 2) + '\n');
"
  echo "  [OK] minecraft-data/common/versions.json"
else
  echo "  [SKIP] minecraft-data/common/versions.json (already has 26.1.2)"
fi

# Add attackUsesOwnPacket to minecraft-data features.json
if ! grep -q "attackUsesOwnPacket" $MC_DATA/common/features.json 2>/dev/null; then
  node -e "
const path = './$MC_DATA/common/features.json';
const arr = JSON.parse(require('fs').readFileSync(path, 'utf8'));
arr.push({ name: 'attackUsesOwnPacket', description: '26.1.2+ uses a dedicated attack serverbound packet instead of use_entity', versions: ['26.1.2', 'latest'] });
require('fs').writeFileSync(path, JSON.stringify(arr, null, 2) + '\n');
"
  echo "  [OK] minecraft-data/common/features.json"
else
  echo "  [SKIP] minecraft-data/common/features.json (already has attackUsesOwnPacket)"
fi

# Add 26.1.2 to dataPaths.json
if ! node -e "const d=require('./$MC_DATA/../dataPaths.json'); process.exit(d.pc&&d.pc['26.1.2']?0:1)" 2>/dev/null; then
  node -e "
const path = './$MC_DATA/../dataPaths.json';
const obj = JSON.parse(require('fs').readFileSync(path, 'utf8'));
obj.pc = obj.pc || {};
obj.pc['26.1.2'] = {
  attributes: 'pc/1.21.11', blockCollisionShapes: 'pc/1.21.11', blocks: 'pc/26.1.2',
  blockLoot: 'pc/1.20', biomes: 'pc/1.21.11', commands: 'pc/1.20.3', effects: 'pc/1.21.11',
  enchantments: 'pc/1.21.11', entities: 'pc/1.21.11', entityLoot: 'pc/1.20',
  foods: 'pc/1.21.11', instruments: 'pc/1.21.11', items: 'pc/26.1.2',
  language: 'pc/1.21.11', loginPacket: 'pc/1.21.11', mapIcons: 'pc/1.20.2',
  materials: 'pc/1.21.11', particles: 'pc/1.21.11', protocol: 'pc/26.1.2',
  recipes: 'pc/1.21.11', sounds: 'pc/1.21.11', tints: 'pc/1.21.11',
  version: 'pc/26.1.2', windows: 'pc/1.16.1'
};
require('fs').writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
"
  echo "  [OK] minecraft-data/dataPaths.json"
else
  echo "  [SKIP] minecraft-data/dataPaths.json (already has 26.1.2)"
fi

# Add '26.1' entry to minecraft-data/data.js
if ! grep -q "'26.1':" $NM/minecraft-data/data.js; then
  # Insert the 26.1 entry before the closing of the 'pc' block (before "'bedrock':")
  python3 - << 'PYEOF'
import re

path = 'node_modules/minecraft-data/data.js'
with open(path) as f:
    content = f.read()

entry = """    '26.1': {
      get attributes () { return require("./minecraft-data/data/pc/1.21.11/attributes.json") },
      get blockCollisionShapes () { return require("./minecraft-data/data/pc/1.21.11/blockCollisionShapes.json") },
      get blocks () { return require("./minecraft-data/data/pc/26.1.2/blocks.json") },
      get blockLoot () { return require("./minecraft-data/data/pc/1.20/blockLoot.json") },
      get biomes () { return require("./minecraft-data/data/pc/1.21.11/biomes.json") },
      get commands () { return require("./minecraft-data/data/pc/1.20.3/commands.json") },
      get effects () { return require("./minecraft-data/data/pc/1.21.11/effects.json") },
      get enchantments () { return require("./minecraft-data/data/pc/1.21.11/enchantments.json") },
      get entities () { return require("./minecraft-data/data/pc/1.21.11/entities.json") },
      get entityLoot () { return require("./minecraft-data/data/pc/1.20/entityLoot.json") },
      get foods () { return require("./minecraft-data/data/pc/1.21.11/foods.json") },
      get instruments () { return require("./minecraft-data/data/pc/1.21.11/instruments.json") },
      get items () { return require("./minecraft-data/data/pc/26.1.2/items.json") },
      get language () { return require("./minecraft-data/data/pc/1.21.11/language.json") },
      get loginPacket () { return require("./minecraft-data/data/pc/1.21.11/loginPacket.json") },
      get mapIcons () { return require("./minecraft-data/data/pc/1.20.2/mapIcons.json") },
      get materials () { return require("./minecraft-data/data/pc/1.21.11/materials.json") },
      get particles () { return require("./minecraft-data/data/pc/1.21.11/particles.json") },
      get protocol () { return require("./minecraft-data/data/pc/26.1.2/protocol.json") },
      get recipes () { return require("./minecraft-data/data/pc/1.21.11/recipes.json") },
      get sounds () { return require("./minecraft-data/data/pc/1.21.11/sounds.json") },
      get tints () { return require("./minecraft-data/data/pc/1.21.11/tints.json") },
      get version () { return require("./minecraft-data/data/pc/26.1.2/version.json") },
      get windows () { return require("./minecraft-data/data/pc/1.16.1/windows.json") },
      proto: __dirname + '/minecraft-data/data/pc/latest/proto.yml'
    }
"""

# Insert before the 'bedrock': section
content = content.replace("  'bedrock': {", entry + "  'bedrock': {", 1)
with open(path, 'w') as f:
    f.write(content)
print("  [OK] minecraft-data/data.js")
PYEOF
else
  echo "  [SKIP] minecraft-data/data.js (already has '26.1' entry)"
fi

# ---------------------------------------------------------------------------
# 9. blocks.json and items.json — generated from server jar
# ---------------------------------------------------------------------------
echo ""
echo "  NOTE: blocks.json and items.json for 26.1.2 must be generated separately."
echo "  Run: python3 scripts/gen_blocks.py  (requires /tmp/blocks_26.1.2_report.json)"
echo "       python3 scripts/gen_items.py   (requires /tmp/blocks_26.1.2_report.json and /tmp/registries_26.1.2.json)"
echo "  See scripts/README.md for how to extract these files from the server jar."
if [ -f "$MC_DATA/26.1.2/blocks.json" ]; then
  echo "  [OK] blocks.json already present ($(wc -c < $MC_DATA/26.1.2/blocks.json) bytes)"
else
  echo "  [WARN] blocks.json MISSING — bot will misidentify blocks"
fi
if [ -f "$MC_DATA/26.1.2/items.json" ]; then
  echo "  [OK] items.json already present ($(wc -c < $MC_DATA/26.1.2/items.json) bytes)"
else
  echo "  [WARN] items.json MISSING — bot will misidentify items"
fi

echo ""
echo "All patches applied. Restart the bot process to pick up changes."
