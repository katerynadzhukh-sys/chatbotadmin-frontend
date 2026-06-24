import { defineConfig, loadEnv, type Plugin } from 'vite'
import type { IncomingMessage } from 'node:http'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import OpenAI from 'openai'

/**
 * Dev-only proxy that exposes:
 *   GET  /api/models  — list of available language models
 *   POST /api/chat    — chat completion with a chosen model
 *
 * Both call the OpenAI-compatible HRZ endpoint of Uni Gießen server-side via
 * openai-node, so the API key never reaches the browser. The key and base URL
 * are read from .env WITHOUT the VITE_ prefix, which keeps them out of the
 * client bundle.
 *
 * For production you need equivalent endpoints on your real backend — the
 * frontend only ever talks to /api/models and /api/chat.
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) reject(new Error('Request too large'))
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Ungültiges JSON im Request-Body'))
      }
    })
    req.on('error', reject)
  })
}

function kiProxy(env: Record<string, string>): Plugin {
  const apiKey = env.KI_API_KEY
  const baseURL = env.KI_BASE_URL || 'https://api.hrz.uni-giessen.de/v1'

  const json = (res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }, status: number, payload: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(payload))
  }

  return {
    name: 'ki-proxy',
    configureServer(server) {
      server.middlewares.use('/api/models', async (_req, res) => {
        if (!apiKey) return json(res, 503, { error: 'KI_API_KEY ist nicht gesetzt. Bitte in .env eintragen.' })

        try {
          const client = new OpenAI({ apiKey, baseURL })
          const list = await client.models.list()
          const models = list.data
            .map((m) => ({ id: m.id, ownedBy: m.owned_by, created: m.created }))
            .sort((a, b) => a.id.localeCompare(b.id))
          json(res, 200, { models })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
          json(res, 502, { error: `Modelle konnten nicht geladen werden: ${message}` })
        }
      })

      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' })
        if (!apiKey) return json(res, 503, { error: 'KI_API_KEY ist nicht gesetzt. Bitte in .env eintragen.' })

        let body: { model?: string; messages?: ChatMessage[]; maxTokens?: number; stream?: boolean }
        try {
          body = (await readJson(req)) as typeof body
        } catch (err) {
          return json(res, 400, { error: err instanceof Error ? err.message : 'Ungültiger Request' })
        }

        if (!body.model) return json(res, 400, { error: 'Kein Modell ausgewählt.' })
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return json(res, 400, { error: 'Keine Nachrichten übergeben.' })
        }

        const client = new OpenAI({ apiKey, baseURL })
        const maxTokens = body.maxTokens && body.maxTokens > 0 ? body.maxTokens : undefined

        // ── Streaming (Server-Sent Events) ──
        if (body.stream) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')
          const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)

          try {
            const stream = await client.chat.completions.create({
              model: body.model,
              messages: body.messages,
              max_tokens: maxTokens,
              stream: true,
            })

            let finishReason: string | null = null
            for await (const chunk of stream) {
              const choice = chunk.choices[0]
              const content = choice?.delta?.content
              if (content) send({ content })
              if (choice?.finish_reason) finishReason = choice.finish_reason
            }
            send({ done: true, finishReason })
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
            send({ error: `Antwort konnte nicht generiert werden: ${message}` })
          }
          res.end()
          return
        }

        // ── Non-streaming (single JSON response) ──
        try {
          const completion = await client.chat.completions.create({
            model: body.model,
            messages: body.messages,
            max_tokens: maxTokens,
          })
          const choice = completion.choices[0]
          json(res, 200, { reply: choice?.message?.content ?? '', finishReason: choice?.finish_reason ?? null })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
          json(res, 502, { error: `Antwort konnte nicht generiert werden: ${message}` })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' = load all vars, including those without the VITE_ prefix (server-side only).
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss(), kiProxy(env)],
  }
})
