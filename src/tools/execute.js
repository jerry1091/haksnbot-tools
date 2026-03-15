/**
 * Code execution tool - execute_js
 *
 * Lets Claude write and run arbitrary Mineflayer JavaScript for complex
 * multi-step tasks (building structures, loops, multi-step logic) that
 * would otherwise require many sequential individual tool calls.
 *
 * Sandboxed via AsyncFunction scope — no require/process/fs/global access.
 * Timeout enforced via Promise.race.
 * Physical lock held for entire duration (see index.js PHYSICAL_TOOLS).
 */

import { text } from '../utils/helpers.js'

export const tools = [
  {
    name: 'execute_js',
    description: `Run custom JavaScript in the bot's context. Use for tasks that need loops, conditionals, or many sequential actions (e.g. build a staircase, place 50 blocks, navigate then mine).

Available in scope:
  bot        — full Mineflayer bot instance
  Vec3       — Vec3 constructor
  mcData     — minecraft-data for this MC version
  goals      — pathfinder goals (GoalBlock, GoalNear, GoalFollow, GoalY, etc.)
  Movements  — pathfinder Movements class (set canDig=false unless you intend to dig)
  sleep(ms)  — async delay
  log(...)   — capture output shown in result

Use await freely. Use log() to print progress. Use return to return a final value.
Timeout: default 15s, max 60s. No filesystem, network, or process access.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Async JavaScript code. Runs as: async function(bot, Vec3, mcData, goals, Movements, sleep, log) { <your code> }'
        },
        timeout_ms: {
          type: 'number',
          description: 'Max execution time in ms (default 15000, max 60000)',
          default: 15000
        }
      },
      required: ['code']
    }
  }
]

export function registerHandlers(mcp) {
  mcp.handlers['execute_js'] = (args) => mcp.executeJs(args)
}

export function registerMethods(mcp, Vec3, Movements, goals) {
  mcp.executeJs = async function({ code, timeout_ms = 15000 }) {
    this.requireBot()

    const cappedTimeout = Math.min(Math.max(timeout_ms, 1000), 60000)
    const logs = []

    const log = (...args) => {
      const line = args.map(a =>
        a === null        ? 'null'      :
        a === undefined   ? 'undefined' :
        typeof a === 'object' ? JSON.stringify(a) : String(a)
      ).join(' ')
      logs.push(line)
      console.error(`[execute_js] ${line}`)
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

    try {
      // Build sandboxed async function — only explicitly injected names are in scope.
      // require, process, fs, __dirname etc. are NOT accessible.
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
      const fn = new AsyncFunction(
        'bot', 'Vec3', 'mcData', 'goals', 'Movements', 'sleep', 'log',
        code
      )

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${cappedTimeout}ms`)), cappedTimeout)
      )

      const returnValue = await Promise.race([
        fn(this.bot, Vec3, this.mcData, goals, Movements, sleep, log),
        timeoutPromise
      ])

      const parts = []
      if (logs.length) parts.push(`Output:\n${logs.join('\n')}`)
      if (returnValue !== undefined) {
        const rv = typeof returnValue === 'object'
          ? JSON.stringify(returnValue, null, 2)
          : String(returnValue)
        parts.push(`Return: ${rv}`)
      }
      if (!parts.length) parts.push('Done.')

      return text(parts.join('\n\n'))

    } catch (err) {
      const parts = []
      if (logs.length) parts.push(`Output so far:\n${logs.join('\n')}`)
      parts.push(`Error: ${err.message}`)
      return text(parts.join('\n\n'))
    }
  }
}
