/**
 * Memory tools - read_memory, write_memory
 *
 * Persistent markdown file giving Claudio knowledge across game sessions.
 * File location: /home/claudio/haksnbot-tools/claudio-memory.md
 */

import { text } from '../utils/helpers.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEMORY_FILE = path.join(__dirname, '../../claudio-memory.md')

export const tools = [
  {
    name: 'read_memory',
    description: 'Read Claudio\'s persistent memory file. Call this at the start of every session (when last_ts is 0) to restore knowledge of world locations, ongoing tasks, player context, and useful skills from previous sessions.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'write_memory',
    description: 'Overwrite Claudio\'s persistent memory file with updated content. Call this after completing a task, discovering a new location, learning something about a player, or any time knowledge should be saved for future sessions. Always include all existing sections — this overwrites the whole file.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Full markdown content to save. Preserve all sections (World, Tasks, Players, Skills) and append new entries rather than losing old ones.'
        }
      },
      required: ['content']
    }
  }
]

export function registerHandlers(mcp) {
  mcp.handlers['read_memory'] = (args) => mcp.readMemory(args)
  mcp.handlers['write_memory'] = (args) => mcp.writeMemory(args)
}

export function registerMethods(mcp) {
  mcp.readMemory = function() {
    if (!fs.existsSync(MEMORY_FILE)) {
      return text('No memory file yet. This is a fresh start.\n\nYou can create one with write_memory once you have things worth remembering.')
    }
    const content = fs.readFileSync(MEMORY_FILE, 'utf8')
    return text(content || 'Memory file exists but is empty.')
  }

  mcp.writeMemory = function({ content }) {
    fs.writeFileSync(MEMORY_FILE, content, 'utf8')
    return text('Memory saved.')
  }
}
