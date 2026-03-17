/**
 * Communication tools - chat, whisper, get_chat_history, wait_for_chat
 */

import { text, matchesEntityType } from '../utils/helpers.js'

export const tools = [
  {
    name: 'chat',
    description: 'Send a chat message (can include /commands if bot has permission)',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to send' }
      },
      required: ['message']
    }
  },
  {
    name: 'whisper',
    description: 'Send a private message to a player',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Player username' },
        message: { type: 'string', description: 'Message to send' }
      },
      required: ['username', 'message']
    }
  },
  {
    name: 'get_chat_history',
    description: 'Get recent chat and system messages (includes command outputs, deaths, server messages)',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of messages', default: 20 }
      }
    }
  },
  {
    name: 'wait_for_chat',
    description: 'Block until a new player chat message arrives, then return it. Use instead of polling get_chat_history for near-real-time responsiveness. Pass the timestamp of the last message you saw as since_timestamp so only truly new messages are returned. Returns immediately if new messages already exist. On timeout returns "status: timeout" — call again to keep listening.',
    inputSchema: {
      type: 'object',
      properties: {
        since_timestamp: {
          type: 'number',
          description: 'Unix ms timestamp — only return messages newer than this. Pass 0 or omit to get any recent message.'
        },
        timeout_ms: {
          type: 'number',
          description: 'Max time to wait in ms (default 55000, max 58000)',
          default: 55000
        },
        entity_alert: {
          type: 'object',
          description: 'If provided, return early when nearby entity count exceeds max_count. Use when farming to avoid mob buildup.',
          properties: {
            entity_type: { type: 'string', description: 'Entity type to count (e.g. zombified_piglin)' },
            max_count: { type: 'number', description: 'Trigger threshold — return when count >= this value' }
          }
        },
        health_alert: {
          type: 'object',
          description: 'If provided, return early when health or food drops below thresholds. Use for self-preservation during combat or farming.',
          properties: {
            min_health: { type: 'number', description: 'Trigger if health drops below this (0-20, default 10)' },
            min_food: { type: 'number', description: 'Trigger if food drops below this (0-20, default 14)' }
          }
        }
      }
    }
  }
]

export function registerHandlers(mcp) {
  mcp.handlers['chat'] = (args) => mcp.chat(args)
  mcp.handlers['whisper'] = (args) => mcp.whisper(args)
  mcp.handlers['get_chat_history'] = (args) => mcp.getChatHistory(args)
  mcp.handlers['wait_for_chat'] = (args) => mcp.waitForChat(args)
}

export function registerMethods(mcp) {
  mcp.chat = function({ message }) {
    this.requireBot()
    this.bot.chat(message)
    return text(`Sent: ${message}`)
  }

  mcp.whisper = function({ username, message }) {
    this.requireBot()
    this.bot.whisper(username, message)
    return text(`Whispered to ${username}: ${message}`)
  }

  mcp.getChatHistory = function({ limit = 20 }) {
    const recent = this.chatLog.slice(-limit)
    if (recent.length === 0) {
      return text('No chat messages yet')
    }
    return text(recent.map(m => {
      const time = new Date(m.timestamp).toLocaleTimeString()
      if (m.type === 'system') {
        return `[${time}] [SYSTEM] ${m.message}`
      } else {
        return `[${time}] <${m.user}> ${m.message}`
      }
    }).join('\n'))
  }

  mcp.waitForChat = function({ since_timestamp = 0, timeout_ms = 55000, entity_alert = null, health_alert = null }) {
    this.requireBot()

    const cappedTimeout = Math.min(timeout_ms, 58000)

    const formatMessages = (msgs) => {
      const lines = msgs.map(m => {
        const time = new Date(m.timestamp).toLocaleTimeString()
        return m.type === 'system'
          ? `[${time}] [SYSTEM] ${m.message}`
          : `[${time}] <${m.user}> ${m.message}`
      })
      const lastTs = msgs[msgs.length - 1].timestamp
      return text(`status: messages\nlast_timestamp: ${lastTs}\n\n${lines.join('\n')}`)
    }

    // Return immediately if new messages already exist
    const existing = this.chatLog.filter(m =>
      m.timestamp > since_timestamp && m.type === 'chat'
    )
    if (existing.length > 0) {
      return Promise.resolve(formatMessages(existing))
    }

    return new Promise((resolve) => {
      let entityPoll = null
      let healthPoll = null

      const cleanup = () => {
        this.bot.off('chat', chatHandler)
        clearTimeout(timer)
        if (entityPoll) clearInterval(entityPoll)
        if (healthPoll) clearInterval(healthPoll)
      }

      const timer = setTimeout(() => {
        cleanup()
        resolve(text(`status: timeout\nlast_timestamp: ${since_timestamp}`))
      }, cappedTimeout)

      const chatHandler = () => {
        setTimeout(() => {
          const newMsgs = this.chatLog.filter(m =>
            m.timestamp > since_timestamp && m.type === 'chat'
          )
          if (newMsgs.length > 0) {
            cleanup()
            resolve(formatMessages(newMsgs))
          }
        }, 200)
      }

      this.bot.on('chat', chatHandler)

      // Entity threshold polling — check every 2 seconds
      if (entity_alert && entity_alert.entity_type && entity_alert.max_count) {
        const { entity_type, max_count } = entity_alert
        entityPoll = setInterval(() => {
          if (!this.bot) return
          const count = Object.values(this.bot.entities).filter(e =>
            matchesEntityType(e, entity_type)
          ).length
          if (count >= max_count) {
            cleanup()
            resolve(text(`status: mob_threshold\nentity_type: ${entity_type}\ncount: ${count}\nlast_timestamp: ${since_timestamp}`))
          }
        }, 2000)
      }

      // Health/food threshold polling — check every 2 seconds
      if (health_alert) {
        const minHealth = health_alert.min_health ?? 10
        const minFood = health_alert.min_food ?? 14
        healthPoll = setInterval(() => {
          if (!this.bot) return
          const health = this.bot.health
          const food = this.bot.food
          if (health < minHealth || food < minFood) {
            cleanup()
            resolve(text(`status: health_low\nhealth: ${Math.round(health)}\nfood: ${Math.round(food)}\nlast_timestamp: ${since_timestamp}`))
          }
        }, 2000)
      }
    })
  }
}
