/**
 * Movement tools - move_to, move_near, navigate_to, follow_player, look_at, face_direction, turn_degrees, stop
 *
 * Both Mind and Body can call these. Body handles ambient movement;
 * Mind calls them for intentional navigation. Body defers when Mind
 * is actively directing movement (detected via narration tool_calls).
 *
 * move_to / move_near  — non-blocking, fire-and-forget
 * navigate_to          — blocking, waits for arrival or failure
 * look_at              — instantly face specific coordinates (force=true)
 * face_direction       — instantly face a compass direction (N/NE/E/SE/S/SW/W/NW)
 * turn_degrees         — turn relative to current facing (+right, -left)
 */

import { text, error } from '../utils/helpers.js'
import { writeNavigateEvent } from '../telemetry.js'

export const tools = [
  {
    name: 'move_to',
    description: 'Move the bot to exact coordinates using pathfinding. Non-blocking.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        z: { type: 'number', description: 'Z coordinate' }
      },
      required: ['x', 'y', 'z']
    }
  },
  {
    name: 'move_near',
    description: 'Move within range of coordinates using pathfinding. Non-blocking.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        z: { type: 'number', description: 'Z coordinate' },
        range: { type: 'number', description: 'How close to get (default 2)', default: 2 }
      },
      required: ['x', 'y', 'z']
    }
  },
  {
    name: 'navigate_to',
    description: 'Move to coordinates and WAIT until arrived, path fails, or timeout. Blocking — use this when you need to confirm arrival before the next action. Returns success, noPath, or timeout.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        z: { type: 'number', description: 'Z coordinate' },
        range: { type: 'number', description: 'Acceptable distance from goal (default 1)', default: 1 },
        timeout_ms: { type: 'number', description: 'Timeout in ms (default 30000)', default: 30000 }
      },
      required: ['x', 'y', 'z']
    }
  },
  {
    name: 'follow_player',
    description: 'Follow a player at a set distance. Non-blocking.',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Player username' },
        distance: { type: 'number', description: 'Follow distance (default 3)', default: 3 }
      },
      required: ['username']
    }
  },
  {
    name: 'look_at',
    description: 'Instantly face specific coordinates. Use this to aim at a block or entity before shooting/interacting.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        z: { type: 'number', description: 'Z coordinate' }
      },
      required: ['x', 'y', 'z']
    }
  },
  {
    name: 'face_direction',
    description: 'Instantly face a compass direction. Use when a player asks you to turn north/south/etc or when you need to orient yourself. Valid directions: N, NE, E, SE, S, SW, W, NW.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', description: 'Compass direction: N, NE, E, SE, S, SW, W, NW' }
      },
      required: ['direction']
    }
  },
  {
    name: 'turn_degrees',
    description: 'Turn relative to current facing. Positive = right (clockwise), negative = left (counterclockwise). E.g. 45 turns right 45°, -90 turns left 90°.',
    inputSchema: {
      type: 'object',
      properties: {
        degrees: { type: 'number', description: 'Degrees to turn. Positive = right, negative = left.' }
      },
      required: ['degrees']
    }
  },
  {
    name: 'stop',
    description: 'Stop all movement and pathfinding.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'traverse_stairs',
    description: 'Walk up or down a staircase in the given direction, bypassing the pathfinder which cannot route through stairs. Use navigate_to to reach the base of the stairs first, then call this tool.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', description: 'Direction to walk: north, south, east, or west' },
        target_y: { type: 'number', description: 'Y coordinate at the top (ascending) or bottom (descending) of the stairs' },
        timeout_ms: { type: 'number', description: 'Max time in ms (default 15000)', default: 15000 }
      },
      required: ['direction', 'target_y']
    }
  },
  {
    name: 'climb_scaffolding',
    description: 'Climb up or down a scaffolding column to a target Y height. Must already be standing at the base of the column (use navigate_to first). Holds jump to ascend or sneak to descend.',
    inputSchema: {
      type: 'object',
      properties: {
        target_y: { type: 'number', description: 'Target Y height to reach' },
        timeout_ms: { type: 'number', description: 'Timeout in ms (default 120000)', default: 120000 }
      },
      required: ['target_y']
    }
  }
]

export function registerHandlers(mcp) {
  mcp.handlers['move_to'] = (args) => mcp.moveTo(args)
  mcp.handlers['move_near'] = (args) => mcp.moveNear(args)
  mcp.handlers['navigate_to'] = (args) => mcp.navigateTo(args)
  mcp.handlers['follow_player'] = (args) => mcp.followPlayer(args)
  mcp.handlers['look_at'] = (args) => mcp.lookAt(args)
  mcp.handlers['face_direction'] = (args) => mcp.faceDirection(args)
  mcp.handlers['turn_degrees'] = (args) => mcp.turnDegrees(args)
  mcp.handlers['stop'] = () => mcp.stop()
  mcp.handlers['traverse_stairs'] = (args) => mcp.traverseStairs(args)
  mcp.handlers['climb_scaffolding'] = (args) => mcp.climbScaffolding(args)
}

// All door/gate block names to add to pathfinder's openable set.
// canOpenDoors=true only covers vanilla types; bamboo gates need manual registration.
const ALL_DOOR_TYPES = [
  'oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door',
  'dark_oak_door', 'mangrove_door', 'cherry_door', 'crimson_door', 'warped_door',
  'bamboo_door', 'iron_door',
  'oak_fence_gate', 'spruce_fence_gate', 'birch_fence_gate', 'jungle_fence_gate',
  'acacia_fence_gate', 'dark_oak_fence_gate', 'mangrove_fence_gate',
  'cherry_fence_gate', 'crimson_fence_gate', 'warped_fence_gate',
  'bamboo_fence_gate'
]

function makeMovements(bot, mcData, Movements) {
  const movements = new Movements(bot, mcData)
  movements.canDig = false
  movements.canOpenDoors = true
  for (const name of ALL_DOOR_TYPES) {
    const block = mcData.blocksByName[name]
    if (block) movements.openable.add(block.id)
  }
  // Add scaffolding as climbable so the pathfinder can route through scaffold columns
  const scaffoldingBlock = mcData.blocksByName['scaffolding']
  if (scaffoldingBlock) movements.climbables.add(scaffoldingBlock.id)
  const registered = ALL_DOOR_TYPES.filter(n => mcData.blocksByName[n]).map(n => n+":"+mcData.blocksByName[n].id)
  console.error("[makeMovements] registered:", registered.join(", "))
  return movements
}

export function registerMethods(mcp, Vec3, Movements, goals) {
  mcp.moveTo = function({ x, y, z }) {
    this.requireBot()
    const movements = makeMovements(this.bot, this.mcData, Movements)
    this.bot.pathfinder.setMovements(movements)

    // Non-blocking: start pathfinding and return immediately
    const goal = new goals.GoalBlock(x, y, z)
    this.bot.pathfinder.setGoal(goal)

    const pos = this.bot.entity.position
    const isMoving = this.bot.pathfinder.isMoving()
    console.error(`[moveTo] goal set to ${x},${y},${z} from ${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}, isMoving=${isMoving}, hasGoal=${!!this.bot.pathfinder.goal}`)
    return text(`Moving from ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)} to ${x}, ${y}, ${z}. Use get_status to check progress or stop to cancel.`)
  }

  mcp.moveNear = function({ x, y, z, range = 2 }) {
    this.requireBot()
    const movements = makeMovements(this.bot, this.mcData, Movements)
    this.bot.pathfinder.setMovements(movements)

    // Non-blocking: start pathfinding and return immediately
    const goal = new goals.GoalNear(x, y, z, range)
    this.bot.pathfinder.setGoal(goal)

    const pos = this.bot.entity.position
    return text(`Moving from ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)} toward ${x}, ${y}, ${z} (within ${range} blocks). Use get_status to check progress or stop to cancel.`)
  }

  mcp.navigateTo = function({ x, y, z, range = 1, timeout_ms = 30000 }) {
    this.requireBot()
    const movements = makeMovements(this.bot, this.mcData, Movements)
    this.bot.pathfinder.setMovements(movements)

    const goal = range > 1
      ? new goals.GoalNear(x, y, z, range)
      : new goals.GoalBlock(x, y, z)

    const startPos = { x: this.bot.entity.position.x, y: this.bot.entity.position.y, z: this.bot.entity.position.z }
    const goalPos = { x, y, z }
    const startTime = Date.now()
    const sessionId = this.sessionId || 'unknown'
    const dx = x - startPos.x, dy = y - startPos.y, dz = z - startPos.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

    return new Promise((resolve) => {
      const cleanup = () => {
        this.bot.removeListener('goal_reached', onReached)
        this.bot.removeListener('path_update', onUpdate)
        clearTimeout(timer)
      }

      const onReached = () => {
        cleanup()
        const pos = this.bot.entity.position
        writeNavigateEvent({ sessionId, startPos, goalPos, result: 'arrived', durationMs: Date.now() - startTime, distance })
        resolve(text(`Arrived at ${x}, ${y}, ${z}. Position: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`))
      }

      const onUpdate = (result) => {
        if (result.status === 'noPath') {
          cleanup()
          this.bot.pathfinder.stop()
          const pos = this.bot.entity.position
          writeNavigateEvent({ sessionId, startPos, goalPos, result: 'noPath', durationMs: Date.now() - startTime, distance })
          resolve(text(`No path to ${x}, ${y}, ${z} — destination unreachable or obstructed. Stopped at ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`))
        }
      }

      const timer = setTimeout(() => {
        cleanup()
        this.bot.pathfinder.stop()
        const pos = this.bot.entity.position
        writeNavigateEvent({ sessionId, startPos, goalPos, result: 'timeout', durationMs: Date.now() - startTime, distance })
        resolve(text(`Navigate timed out after ${timeout_ms}ms. Stopped at ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)} — goal was ${x}, ${y}, ${z}`))
      }, timeout_ms)

      this.bot.on('goal_reached', onReached)
      this.bot.on('path_update', onUpdate)
      this.bot.pathfinder.setGoal(goal)

      console.error(`[navigateTo] blocking goal ${x},${y},${z} range=${range} timeout=${timeout_ms}ms from ${Math.floor(startPos.x)},${Math.floor(startPos.y)},${Math.floor(startPos.z)}`)
    })
  }

  mcp.followPlayer = async function({ username, distance = 3 }) {
    this.requireBot()
    const player = this.bot.players[username]
    if (!player?.entity) {
      return error(`Player ${username} not found or not in range`)
    }

    const movements = makeMovements(this.bot, this.mcData, Movements)
    this.bot.pathfinder.setMovements(movements)
    this.bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, distance), true)

    return text(`Following ${username} at distance ${distance}. Use 'stop' to stop following.`)
  }

  mcp.lookAt = async function({ x, y, z }) {
    this.requireBot()
    // force=true: instant, not overrideable by pathfinder or animations
    await this.bot.lookAt(new Vec3(x, y, z), true)
    const yaw = this.bot.entity.yaw
    const yawDeg = Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360)
    const dirs8 = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE']
    const facing = dirs8[Math.round(yawDeg / 45) % 8]
    return text(`Now looking at ${x}, ${y}, ${z} — facing ${facing} (${yawDeg}°)`)
  }

  mcp.faceDirection = async function({ direction }) {
    this.requireBot()
    // Mineflayer yaw (verified via atan2(-dx,-dz)):
    //   0=North(-Z), π/2=West(-X), ±π=South(+Z), -π/2=East(+X)
    //   yaw increases counterclockwise: N→NW→W→SW→S→SE→E→NE
    const yawMap = {
      'N': 0, 'NW': Math.PI / 4, 'W': Math.PI / 2, 'SW': 3 * Math.PI / 4,
      'S': Math.PI, 'SE': -3 * Math.PI / 4, 'E': -Math.PI / 2, 'NE': -Math.PI / 4
    }
    const dir = direction.toUpperCase()
    if (!(dir in yawMap)) {
      return text(`Unknown direction "${direction}". Use N, NE, E, SE, S, SW, W, or NW.`)
    }
    await this.bot.look(yawMap[dir], 0, true)
    return text(`Now facing ${dir}`)
  }

  mcp.turnDegrees = async function({ degrees }) {
    this.requireBot()
    // Positive degrees = turn right (clockwise). Negative = turn left (counterclockwise).
    // Clockwise = decreasing yaw in Mineflayer's counterclockwise convention.
    const currentYaw = this.bot.entity.yaw
    const newYaw = currentYaw - (degrees * Math.PI / 180)
    await this.bot.look(newYaw, this.bot.entity.pitch, true)
    const finalYawDeg = Math.round(((newYaw * 180 / Math.PI) % 360 + 360) % 360)
    const dirs8 = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE']
    const facing = dirs8[Math.round(finalYawDeg / 45) % 8]
    return text(`Turned ${degrees > 0 ? 'right' : 'left'} ${Math.abs(degrees)}° — now facing ${facing} (${finalYawDeg}°)`)
  }

  mcp.stop = function() {
    this.requireBot()
    this.bot.pathfinder.stop()
    return text('Stopped')
  }

  mcp.traverseStairs = async function({ direction, target_y, timeout_ms = 15000 }) {
    this.requireBot()
    const bot = this.bot
    const dir = direction.toLowerCase()

    const yawMap = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 }
    if (!(dir in yawMap)) {
      return error(`Unknown direction "${direction}". Use north, south, east, or west.`)
    }

    const startY = bot.entity.position.y
    const ascending = target_y > startY

    bot.pathfinder.stop()
    await bot.look(yawMap[dir], 0, true)
    await new Promise(r => setTimeout(r, 100))

    bot.setControlState('forward', true)
    bot.setControlState('sprint', false)

    const stopAll = () => {
      bot.setControlState('forward', false)
      bot.setControlState('sprint', false)
      bot.setControlState('jump', false)
    }

    return new Promise((resolve) => {
      let lastY = bot.entity.position.y
      let lastYChangeTime = Date.now()

      const checkInterval = setInterval(() => {
        const pos = bot.entity.position
        const currentY = pos.y

        const reached = ascending ? currentY >= target_y - 0.6 : currentY <= target_y + 0.6
        if (reached) {
          clearInterval(checkInterval)
          clearTimeout(timer)
          stopAll()
          resolve(text(`Traversed stairs ${dir}: Y ${startY.toFixed(1)} → ${currentY.toFixed(1)}`))
          return
        }

        // Stuck detection — if Y hasn't changed in 1.5s, nudge with a jump
        if (Math.abs(currentY - lastY) > 0.05) {
          lastY = currentY
          lastYChangeTime = Date.now()
          bot.setControlState('jump', false)
        } else if (Date.now() - lastYChangeTime > 1500) {
          bot.setControlState('jump', true)
          setTimeout(() => bot.setControlState('jump', false), 250)
          lastYChangeTime = Date.now()
        }
      }, 100)

      const timer = setTimeout(() => {
        clearInterval(checkInterval)
        stopAll()
        const pos = bot.entity.position
        resolve(error(`traverse_stairs timed out at Y=${pos.y.toFixed(1)}, target Y=${target_y}, direction: ${dir}`))
      }, timeout_ms)
    })
  }

  mcp.climbScaffolding = async function({ target_y, timeout_ms = 120000 }) {
    this.requireBot()
    const bot = this.bot

    // Stop pathfinding so it doesn't fight the control state
    bot.pathfinder.stop()

    const startPos = bot.entity.position
    const goingUp = target_y > startPos.y

    // Hold jump to ascend scaffolding, sneak to descend
    bot.setControlState('jump', goingUp)
    bot.setControlState('sneak', !goingUp)

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const pos = bot.entity.position
        const reached = goingUp ? pos.y >= target_y - 1 : pos.y <= target_y + 1
        if (reached) {
          clearInterval(checkInterval)
          clearTimeout(timer)
          bot.setControlState('jump', false)
          bot.setControlState('sneak', false)
          resolve(text(`Climbed to y=${Math.floor(pos.y)}. Position: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`))
        }
      }, 250)

      const timer = setTimeout(() => {
        clearInterval(checkInterval)
        bot.setControlState('jump', false)
        bot.setControlState('sneak', false)
        const pos = bot.entity.position
        resolve(text(`Scaffold climb timed out after ${timeout_ms}ms — reached y=${Math.floor(pos.y)}, goal y=${target_y}. Position: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`))
      }, timeout_ms)
    })
  }
}

