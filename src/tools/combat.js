/**
 * Combat tools - attack_entity, use_item
 *
 * attack_entity re-enabled as MCP tool for Body agent access.
 * Mind's allowed_tools in core.py continues to exclude it.
 */

import { text, error, matchesEntityType } from '../utils/helpers.js'

export const tools = [
  {
    name: 'auto_attack',
    description: 'Continuously attack nearby mobs of a given type for a set duration. Use this for mob farm clearing (gold farms, mob farms, etc.). Respects sword cooldown, tracks dead entities, and handles brief disconnects gracefully. Returns hit count when done.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', description: 'Entity type to attack (e.g. zombified_piglin, zombie, skeleton)' },
        duration_ms: { type: 'number', description: 'How long to attack in ms (default 10000, max 60000)', default: 10000 },
        max_distance: { type: 'number', description: 'Max attack range in blocks (default 4)', default: 4 }
      },
      required: ['entity_type']
    }
  },
  {
    name: 'attack_entity',
    description: 'Attack the nearest entity of a given type (single swing). For repeated farm clearing use auto_attack instead.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', description: 'Entity type to attack (cow, sheep, pig, horse, villager, etc.)' },
        max_distance: { type: 'number', description: 'Max search distance', default: 32 }
      },
      required: ['entity_type']
    }
  },
  {
    name: 'use_item',
    description: 'Use/activate held item (right-click action). For bows, use shoot_bow instead.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'shoot_bow',
    description: 'Aim at target coordinates and shoot the held bow in one atomic action. Looks at the target, charges, then fires. Always provide target_x/y/z so aim and shot stay aligned.',
    inputSchema: {
      type: 'object',
      properties: {
        target_x: { type: 'number', description: 'X coordinate of target' },
        target_y: { type: 'number', description: 'Y coordinate of target' },
        target_z: { type: 'number', description: 'Z coordinate of target' },
        charge_ms: { type: 'number', description: 'How long to charge the bow in ms (default 1200 = full power, min 200)', default: 1200 }
      },
      required: ['target_x', 'target_y', 'target_z']
    }
  }
]

export function registerHandlers(mcp) {
  mcp.handlers['auto_attack'] = (args) => mcp.autoAttack(args)
  mcp.handlers['attack_entity'] = (args) => mcp.attackEntity(args)
  mcp.handlers['use_item'] = async () => mcp.useItem()
  mcp.handlers['shoot_bow'] = (args) => mcp.shootBow(args)
}

export function registerMethods(mcp) {
  mcp.autoAttack = async function({ entity_type, duration_ms = 10000, max_distance = 4 }) {
    this.requireBot()
    const bot = this.bot
    const duration = Math.min(duration_ms, 60000)
    const SWORD_COOLDOWN = 620  // ms — matches sword attack cooldown (0.6s base + margin)

    // Auto-equip sword if not already holding one
    const held = this.bot.heldItem
    if (!held || !held.name.includes('sword')) {
      const SWORD_TIERS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword']
      const sword = SWORD_TIERS.map(name => this.bot.inventory.items().find(i => i.name === name)).find(Boolean)
      if (sword) {
        await this.bot.equip(sword, 'hand')
      }
      // If no sword found, continue anyway — caller will deal with it
    }

    // Track entities that die during this session to avoid attacking their corpses
    const deadSet = new Set()
    const onDead = (e) => {
      deadSet.add(e.id)
      setTimeout(() => deadSet.delete(e.id), 2000)
    }
    bot.on('entityDead', onDead)

    let hits = 0
    let skipped = 0
    const startTime = Date.now()

    while (Date.now() - startTime < duration) {
      if (!this.bot) break  // Disconnected — watchdog will reconnect

      const botPos = this.bot.entity.position
      const entity = this.bot.nearestEntity(e => {
        if (!matchesEntityType(e, entity_type)) return false
        if (deadSet.has(e.id)) return false
        if (e.position.distanceTo(botPos) > max_distance) return false
        return true
      })

      if (entity) {
        if (!this.bot.entities[entity.id] || deadSet.has(entity.id)) {
          skipped++
        } else {
          try {
            await this.bot.attack(entity)
            hits++
          } catch (_err) {
            // Ignore — entity may have died between check and attack
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, SWORD_COOLDOWN))
    }

    // Clean up listener
    const listenerBot = this.bot || bot
    listenerBot.removeListener('entityDead', onDead)

    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const status = this.bot ? 'connected' : 'disconnected (watchdog will reconnect)'
    return text(`auto_attack done: ${hits} hits, ${skipped} skipped (dead), ${elapsed}s elapsed — ${status}`)
  }

  mcp.attackEntity = async function({ entity_type, max_distance = 32 }) {
    this.requireBot()

    const botPos = this.bot.entity.position
    const entity = this.bot.nearestEntity(e => {
      if (!matchesEntityType(e, entity_type)) return false
      if (e.position.distanceTo(botPos) > max_distance) return false
      return true
    })

    if (!entity) {
      return error(`No ${entity_type} found within ${max_distance} blocks`)
    }

    // Re-validate right before attack — entity may have died since scan
    if (!this.bot.entities[entity.id]) {
      return error(`${entity_type} despawned before attack`)
    }
    if (entity.health !== undefined && entity.health <= 0) {
      return error(`${entity_type} is already dead`)
    }

    try {
      await this.bot.attack(entity)
      const dist = Math.floor(entity.position.distanceTo(this.bot.entity.position))
      return text(`Attacked ${entity.name || entity_type} at distance ${dist}`)
    } catch (err) {
      return error(`Attack failed: ${err.message}`)
    }
  }

  mcp.useItem = async function() {
    this.requireBot()
    const item = this.bot.heldItem
    if (!item) {
      return error('Not holding any item')
    }

    try {
      await this.bot.activateItem()
      return text(`Used ${item.name}`)
    } catch (err) {
      return error(`Failed to use item: ${err.message}`)
    }
  }

  mcp.shootBow = async function({ target_x, target_y, target_z, charge_ms = 1200 }) {
    this.requireBot()
    const item = this.bot.heldItem
    if (!item) {
      return error('Not holding any item — equip a bow first')
    }
    if (!item.name.includes('bow')) {
      return error(`Holding ${item.name}, not a bow. Equip a bow first.`)
    }

    const chargeTime = Math.max(200, Math.min(charge_ms, 3000))

    try {
      // Atomically: look at target, charge, then release — no drift between aim and shot
      const { Vec3 } = await import('vec3')
      await this.bot.lookAt(new Vec3(target_x, target_y, target_z), true)
      this.bot.activateItem()
      await new Promise(resolve => setTimeout(resolve, chargeTime))
      // Re-aim just before release in case of drift
      await this.bot.lookAt(new Vec3(target_x, target_y, target_z), true)
      this.bot.deactivateItem()
      return text(`Fired ${item.name} at (${target_x}, ${target_y}, ${target_z}) — charged ${chargeTime}ms`)
    } catch (err) {
      this.bot.deactivateItem()
      return error(`Failed to shoot: ${err.message}`)
    }
  }
}
