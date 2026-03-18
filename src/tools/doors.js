/**
 * Door/gate traversal tools
 */

import { text, error } from '../utils/helpers.js'

const DOOR_TYPES = new Set([
  'oak_door','spruce_door','birch_door','jungle_door','acacia_door',
  'dark_oak_door','mangrove_door','cherry_door','crimson_door','warped_door',
  'bamboo_door','iron_door',
  'oak_fence_gate','spruce_fence_gate','birch_fence_gate','jungle_fence_gate',
  'acacia_fence_gate','dark_oak_fence_gate','mangrove_fence_gate',
  'cherry_fence_gate','crimson_fence_gate','warped_fence_gate','bamboo_fence_gate'
])

export const tools = [
  {
    name: 'traverse_door',
    description: 'Open a door or fence gate, walk through it, then close it. x/y/z are optional — if omitted, automatically finds the nearest door/gate block in the given direction. Always navigate_to the aligned position in front first.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', description: 'Direction to walk: north, south, east, or west' },
        x: { type: 'number', description: 'X of door block (optional — auto-detected if omitted)' },
        y: { type: 'number', description: 'Y of door block (optional — auto-detected if omitted)' },
        z: { type: 'number', description: 'Z of door block (optional — auto-detected if omitted)' },
        timeout_ms: { type: 'number', description: 'Max ms to wait for traversal (default 5000)', default: 5000 }
      },
      required: ['direction']
    }
  }
]

export function registerHandlers(mcp) {
  mcp.handlers['traverse_door'] = (args) => mcp.traverseDoor(args)
}

export function registerMethods(mcp, Vec3) {
  mcp.traverseDoor = async function({ direction, x, y, z, timeout_ms = 5000 }) {
    this.requireBot()
    const bot = this.bot
    const dir = direction.toLowerCase()

    // Walk yaw + approach face vector (the face the bot clicks when approaching)
    const dirConfig = {
      north: { yaw: 0,           face: new Vec3( 0, 0,  1) }, // bot south of door, clicks south face
      south: { yaw: Math.PI,     face: new Vec3( 0, 0, -1) }, // bot north of door, clicks north face
      east:  { yaw: -Math.PI/2,  face: new Vec3(-1, 0,  0) }, // bot west of door, clicks west face
      west:  { yaw:  Math.PI/2,  face: new Vec3( 1, 0,  0) }, // bot east of door, clicks east face
    }
    if (!(dir in dirConfig)) {
      return error(`Unknown direction "${direction}". Use north, south, east, or west.`)
    }
    const { yaw, face } = dirConfig[dir]

    // Auto-detect door block if coords not provided
    let blockPos
    if (x !== undefined && y !== undefined && z !== undefined) {
      blockPos = new Vec3(x, y, z)
    } else {
      const pos = bot.entity.position
      const stepMap = { north: [0,0,-1], south: [0,0,1], east: [1,0,0], west: [-1,0,0] }
      const [dx, , dz] = stepMap[dir]
      // Perpendicular sweep (±1) handles bot position drift — e.g. Z=0.6 rounds to 1,
      // missing a door at Z=0. Sweep catches it without needing explicit coords.
      const [px, pz] = (dir === 'east' || dir === 'west') ? [0, 1] : [1, 0]
      for (let dist = 1; dist <= 4 && !blockPos; dist++) {
        for (const yOff of [0, 1, -1]) {
          for (const pOff of [0, -1, 1]) {
            const candidate = new Vec3(
              Math.round(pos.x) + dx * dist + px * pOff,
              Math.floor(pos.y) + yOff,
              Math.round(pos.z) + dz * dist + pz * pOff
            )
            const b = bot.blockAt(candidate)
            if (b && DOOR_TYPES.has(b.name)) {
              const props = b.getProperties()
              if (props.half === 'upper') continue
              blockPos = candidate
              break
            }
          }
          if (blockPos) break
        }
      }
      if (!blockPos) {
        return error(`No door/gate found within 4 blocks to the ${dir}.`)
      }
    }

    const block = bot.blockAt(blockPos)
    if (!block) return error(`No block at ${blockPos.x},${blockPos.y},${blockPos.z}`)

    // Stop pathfinder
    bot.pathfinder.stop()
    await new Promise(r => setTimeout(r, 150))

    // Activate with the correct face direction so 2-tall doors work
    let activateError = null
    try {
      await bot.activateBlock(block, face)
    } catch (e) {
      activateError = e.message
    }
    await new Promise(r => setTimeout(r, 400))

    // Check if opened
    const blockAfter = bot.blockAt(blockPos)
    const props = blockAfter ? blockAfter.getProperties() : {}
    const isOpen = props.open === true || props.open === 'true'

    if (activateError) {
      return error(`activateBlock threw: ${activateError}. Block: ${block.name}`)
    }
    if (!isOpen) {
      return error(`Door did not open. Block: ${block.name} at ${blockPos.x},${blockPos.y},${blockPos.z}. Props after: ${JSON.stringify(props)}`)
    }

    // Face direction and walk through
    await bot.look(yaw, 0, true)
    await new Promise(r => setTimeout(r, 100))
    bot.setControlState('forward', true)

    const deadline = Date.now() + timeout_ms
    let passed = false
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50))
      const p = bot.entity.position
      if (dir === 'west'  && p.x < blockPos.x - 0.5) { passed = true; break }
      if (dir === 'east'  && p.x > blockPos.x + 0.5) { passed = true; break }
      if (dir === 'north' && p.z < blockPos.z - 0.5) { passed = true; break }
      if (dir === 'south' && p.z > blockPos.z + 0.5) { passed = true; break }
    }
    bot.setControlState('forward', false)

    // Close
    const blockFinal = bot.blockAt(blockPos)
    if (blockFinal) {
      try { await bot.activateBlock(blockFinal, face) } catch (e) {}
    }

    const end = bot.entity.position
    if (!passed) {
      return error(`Timed out after opening. Stuck at ${end.x.toFixed(1)},${end.y.toFixed(1)},${end.z.toFixed(1)}`)
    }
    return text(`Traversed ${dir} through ${block.name} at ${blockPos.x},${blockPos.y},${blockPos.z}. Now at ${end.x.toFixed(1)},${end.y.toFixed(1)},${end.z.toFixed(1)}`)
  }
}
