/**
 * Communication tools - chat, whisper, get_chat_history, wait_for_chat
 *
 * health_alert is kept as a high-threshold last-resort fallback (Option B per
 * Jay's decision). Guts handles eating at food < 20 and fleeing at health ≤ 12,
 * so health_alert only fires at extreme values (health < 4, food < 2) that Guts
 * has somehow failed to catch — e.g. during a tool lock or an edge case.
 */

import { text } from '../utils/helpers.js'

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
    description: 'Block until a new player chat message arrives, then return it. Use instead of polling get_chat_history for near-real-time responsiveness. Pass the timestamp of the last message you saw as since_timestamp so only truly new messages are returned. Returns immediately if new messages already exist. On timeout returns "status: timeout" — call again to keep listening. Optionally set health_alert to return early if health/food hits critical levels (Guts handles normal eating/fleeing; this is a last-resort fallback).',
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
        health_alert: {
          type: 'object',
          description: 'Last-resort fallback: return early when health or food hits critical levels. Guts handles normal eating (food < 20) and fleeing (health ≤ 12) automatically — only set this for extreme emergencies.',
          properties: {
            min_health: { type: 'number', description: 'Trigger if health drops below this (default 4 — near death)' },
            min_food: { type: 'number', description: 'Trigger if food drops below this (default 2 — nearly starving)' }
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

  mcp.waitForChat = function({ since_timestamp = 0, timeout_ms = 55000, health_alert = null }) {
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
      let healthPoll = null

      const cleanup = () => {
        this.bot.off('chat', chatHandler)
        clearTimeout(timer)
        if (healthPoll) clearInterval(healthPoll)
      }

      const timer = setTimeout(() => {
        cleanup()
        resolve(text(`status: timeout\nlast_timestamp: ${since_timestamp}`))
      }, cappedTimeout)

      const chatHandler = () => {
        setTimeout(() => {
          cleanup()
          const newMsgs = this.chatLog.filter(m =>
            m.timestamp > since_timestamp && m.type === 'chat'
          )
          if (newMsgs.length > 0) {
            resolve(formatMessages(newMsgs))
          } else {
            resolve(text(`status: timeout\nlast_timestamp: ${since_timestamp}`))
          }
        }, 200)
      }

      this.bot.on('chat', chatHandler)

      // Last-resort health/food fallback — only fires at extreme values.
      // Guts handles normal eating (food < 20) and fleeing (health ≤ 12).
      if (health_alert) {
        const minHealth = health_alert.min_health ?? 4
        const minFood = health_alert.min_food ?? 2
        healthPoll = setInterval(() => {
          if (!this.bot) return
          const health = this.bot.health
          const food = this.bot.food
          if (health < minHealth || food < minFood) {
            cleanup()
            resolve(text(`status: health_critical\nhealth: ${Math.round(health)}\nfood: ${Math.round(food)}\nlast_timestamp: ${since_timestamp}`))
          }
        }, 2000)
      }
    })
  }
}
