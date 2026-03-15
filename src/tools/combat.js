/**
 * Combat tools - attack_entity, use_item
 *
 * attack_entity re-enabled as MCP tool for Body agent access.
 * Mind's allowed_tools in core.py continues to exclude it.
 */

import { text, error } from '../utils/helpers.js'
import { matchesEntityType } from '../utils/helpers.js'

export const tools = [
  {
    name: 'attack_entity',
    description: 'Attack the nearest entity of a given type',
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
  mcp.handlers['attack_entity'] = (args) => mcp.attackEntity(args)
  mcp.handlers['use_item'] = async () => mcp.useItem()
  mcp.handlers['shoot_bow'] = (args) => mcp.shootBow(args)
}

export function registerMethods(mcp) {
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
