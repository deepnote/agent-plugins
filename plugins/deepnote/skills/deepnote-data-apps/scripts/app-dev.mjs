#!/usr/bin/env node
// Previews a data app page locally, embedded the way Deepnote embeds it, against the real Deepnote API.
//
// Two loopback origins stand in for Deepnote: one serves the page folder with Deepnote's rules, the other
// serves a stand-in Deepnote page that embeds it, answers the app client's token requests, and proxies
// /v2 API calls. The page only ever sees short-lived stand-in tokens; the proxy swaps in the real token,
// which is never printed. Built-in modules only.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const USAGE = `Usage: node app-dev.mjs <folder with index.html> --token <token> --api-origin <apiOrigin> [--check]

  --token        Viewer token from the create_app_token MCP tool. It is never printed.
  --api-origin   apiOrigin from the same create_app_token result.
  --check        Load the page headlessly in an installed Chrome or Chromium, save screenshot.png, and exit
                 non-zero on an app error, a failed API call, or a timeout. Without it, serve a preview to
                 open in a browser until stopped.
  --port         Port of the preview page; the app is served on the next one. Default 4747, or free ports
                 with --check.
  --timeout      Seconds --check waits for the page to settle. Default 60.

Set CHROME_PATH to use a browser that is not found automatically.`

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
// The app client asks for a new token a minute before this, so the refresh path runs during a preview.
const PAGE_TOKEN_LIFETIME_SECONDS = 120
// --check takes the screenshot once the page is ready and the API has been quiet this long.
const SETTLE_MS = 3000
const VIEWPORT = { width: 1280, height: 900 }
const MAX_SCREENSHOT_HEIGHT = 8000

const session = {
  ready: false,
  pageLoadedAt: null,
  pendingCalls: 0,
  lastActivityAt: Date.now(),
  errors: [],
  failedCalls: [],
}
let tokenRejected = false

function touch() {
  session.lastActivityAt = Date.now()
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** Deepnote's rules: `/` and paths ending in `/` serve their index.html, other paths need the exact file name. */
function resolvePagePath(root, urlPath) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decodedPath.split(/[\\/]/).includes('..') || decodedPath.includes('\0')) {
    return null
  }
  const withIndex = decodedPath.endsWith('/') ? `${decodedPath}index.html` : decodedPath
  return path.join(root, path.posix.normalize(withIndex).replace(/^\/+/, ''))
}

function createAppServer(root, origins) {
  return http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('referrer-policy', 'no-referrer')
    const filePath =
      (req.method === 'GET' || req.method === 'HEAD') && resolvePagePath(root, new URL(req.url, origins.app).pathname)
    const file = filePath ? await fs.promises.readFile(filePath).catch(() => null) : null
    if (!file) {
      console.log(`[page] 404 ${req.method} ${req.url}`)
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
      return
    }
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-security-policy': `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: ${origins.deepnote}; frame-ancestors 'self' ${origins.deepnote}`,
      'content-type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    })
    res.end(req.method === 'HEAD' ? undefined : file)
  })
}

function renderDeepnotePage(appOrigin) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Deepnote app preview</title>
<style>html, body, iframe { display: block; width: 100%; height: 100%; margin: 0; border: 0; }</style>
</head>
<body>
<iframe src="${appOrigin}/" allow="fullscreen" title="Data app"></iframe>
<script>
const appOrigin = ${JSON.stringify(appOrigin)}
const report = event => fetch('/__event', { method: 'POST', body: JSON.stringify(event) })
document.querySelector('iframe').addEventListener('load', () => report({ type: 'page-load' }))
window.addEventListener('message', async event => {
  if (event.origin !== appOrigin || !event.data || !event.source) return
  const { type, message, line, source } = event.data
  if (type === 'deepnote-static-files-api-token-request') {
    const auth = await fetch('/__token', { method: 'POST' }).then(response => response.json())
    event.source.postMessage({ type: 'deepnote-static-files-api-token-response', ...auth }, appOrigin)
  } else if (type === 'deepnote-static-files-app-ready') {
    report({ type })
  } else if (type === 'deepnote-static-files-app-error' && typeof message === 'string') {
    report({ type, message: message.slice(0, 500), line: typeof line === 'number' ? line : null, source: typeof source === 'string' ? source : null })
  }
})
</script>
</body>
</html>
`
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function reportCall(req, status, startedAt, detail) {
  const line = `${req.method} ${req.url} ${status} (${Date.now() - startedAt} ms)${detail ? `: ${detail}` : ''}`
  console.log(`[api] ${line}`)
  if (status >= 400) {
    session.failedCalls.push(line)
  }
}

function createDeepnoteServer({ token, apiOrigin, origins }) {
  const pageTokens = new Map()

  async function proxyApiCall(req, res) {
    res.setHeader('access-control-allow-origin', origins.app)
    res.setHeader('vary', 'origin')
    if (req.method === 'OPTIONS') {
      res
        .writeHead(204, {
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'access-control-max-age': '86400',
        })
        .end()
      return
    }
    const startedAt = Date.now()
    const pageToken = req.headers.authorization?.replace(/^Bearer /, '')
    if (!(pageTokens.get(pageToken) > Date.now())) {
      reportCall(req, 401, startedAt, 'the page sent no token or an expired one')
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Unauthorized' }))
      return
    }
    session.pendingCalls++
    try {
      const body = await readBody(req)
      const response = await fetch(`${apiOrigin}${req.url}`, {
        method: req.method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': req.headers['content-type'] ?? 'application/json',
        },
        body: body.length > 0 ? body : undefined,
      })
      const responseBody = Buffer.from(await response.arrayBuffer())
      let detail = null
      if (!response.ok) {
        try {
          detail = JSON.parse(responseBody.toString()).message?.slice(0, 300) ?? null
        } catch {}
      }
      reportCall(req, response.status, startedAt, detail)
      if (response.status === 401 && !tokenRejected) {
        tokenRejected = true
        console.log(
          'The Deepnote API rejected the app token, most likely because it expired. Mint a new one with create_app_token and restart this script.'
        )
      }
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' })
      res.end(responseBody)
    } catch (error) {
      const message = `Could not reach ${apiOrigin}: ${error.cause?.message ?? error.message}`
      reportCall(req, 502, startedAt, message)
      res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ message }))
    } finally {
      session.pendingCalls--
      touch()
    }
  }

  async function handleEvent(req) {
    let event
    try {
      event = JSON.parse(await readBody(req))
    } catch {
      return
    }
    touch()
    if (event.type === 'page-load') {
      session.pageLoadedAt ??= Date.now()
    } else if (event.type === 'deepnote-static-files-app-ready') {
      session.ready = true
      console.log('[app] ready')
    } else if (event.type === 'deepnote-static-files-app-error') {
      const where = [event.line != null && `line ${event.line}`, event.source].filter(Boolean).join(', ')
      const line = `${event.message}${where ? ` (${where})` : ''}`
      session.errors.push(line)
      console.log(`[app] error: ${line}`)
    }
  }

  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, origins.deepnote)
    if (pathname.startsWith('/v2/')) {
      await proxyApiCall(req, res)
    } else if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' })
      res.end(renderDeepnotePage(origins.app))
    } else if (req.method === 'POST' && pathname === '/__token') {
      const now = Date.now()
      for (const [pageToken, expiresAt] of pageTokens) {
        if (expiresAt <= now) pageTokens.delete(pageToken)
      }
      const pageToken = randomBytes(24).toString('hex')
      const expiresAtSeconds = Math.floor(now / 1000) + PAGE_TOKEN_LIFETIME_SECONDS
      pageTokens.set(pageToken, expiresAtSeconds * 1000)
      console.log('[app] token requested')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ token: pageToken, apiOrigin: origins.deepnote, expiresAtSeconds }))
    } else if (req.method === 'POST' && pathname === '/__event') {
      await handleEvent(req)
      res.writeHead(204).end()
    } else {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found')
    }
  })
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', error =>
      reject(error.code === 'EADDRINUSE' ? new Error(`Port ${port} is in use. Pass another --port.`) : error)
    )
    server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
  })
}

function findChrome() {
  const executables =
    {
      darwin: ['/Applications', path.join(os.homedir(), 'Applications')].flatMap(dir => [
        path.join(dir, 'Google Chrome.app/Contents/MacOS/Google Chrome'),
        path.join(dir, 'Chromium.app/Contents/MacOS/Chromium'),
      ]),
      win32: [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
        .filter(Boolean)
        .map(dir => path.join(dir, 'Google/Chrome/Application/chrome.exe')),
    }[process.platform] ??
    (process.env.PATH ?? '')
      .split(path.delimiter)
      .flatMap(dir =>
        ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].map(name => path.join(dir, name))
      )
  return [process.env.CHROME_PATH, ...executables].find(executable => executable && fs.existsSync(executable))
}

/** Starts headless Chrome and talks the DevTools protocol over its pipe, so no WebSocket client is needed. */
function launchChrome(executable) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepnote-app-dev-'))
  const chrome = spawn(
    executable,
    [
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      // Chrome refuses to start its sandbox as root, as in many containers.
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] }
  )
  const [, , , input, output] = chrome.stdio
  const pending = new Map()
  let nextId = 0
  let buffer = ''
  const exited = new Promise(resolve => {
    chrome.once('exit', resolve)
    chrome.once('error', resolve)
  }).then(() => {
    for (const call of pending.values()) call.reject(new Error(`Chrome exited during ${call.method}.`))
    pending.clear()
  })
  input.on('error', () => {})
  output.setEncoding('utf8')
  output.on('data', chunk => {
    buffer += chunk
    for (let end = buffer.indexOf('\0'); end !== -1; end = buffer.indexOf('\0')) {
      const message = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      const call = pending.get(message.id)
      if (!call) continue
      pending.delete(message.id)
      if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`))
      else call.resolve(message.result)
    }
  })

  return {
    send(method, params, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        pending.set(id, { method, resolve, reject })
        input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`)
      })
    },
    async close() {
      chrome.kill()
      await exited
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 })
    },
  }
}

async function waitForPage(timeoutMs) {
  const startedAt = Date.now()
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 200))
    const now = Date.now()
    if (session.ready && session.pendingCalls === 0 && now - session.lastActivityAt >= SETTLE_MS) return 'settled'
    if (!session.ready && session.pageLoadedAt && now - session.pageLoadedAt >= SETTLE_MS) return 'not-connected'
    if (now - startedAt >= timeoutMs) return 'timeout'
  }
}

/** Grows the viewport to the page's height first, so the screenshot shows all of it. */
async function saveScreenshot(browser, sessionId, file) {
  try {
    const { frameTree } = await browser.send('Page.getFrameTree', {}, sessionId)
    const appFrame = frameTree.childFrames?.[0]?.frame
    const { executionContextId } = await browser.send('Page.createIsolatedWorld', { frameId: appFrame.id }, sessionId)
    const { result } = await browser.send(
      'Runtime.evaluate',
      { contextId: executionContextId, expression: 'document.documentElement.scrollHeight', returnByValue: true },
      sessionId
    )
    const height = Math.min(Math.max(result.value, VIEWPORT.height), MAX_SCREENSHOT_HEIGHT)
    if (height > VIEWPORT.height) {
      await browser.send(
        'Emulation.setDeviceMetricsOverride',
        { ...VIEWPORT, height, deviceScaleFactor: 1, mobile: false },
        sessionId
      )
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch {
    // Keep the first screen when the page's height can't be read.
  }
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId)
  fs.writeFileSync(file, Buffer.from(data, 'base64'))
}

async function check(deepnoteOrigin, timeoutSeconds) {
  const executable = findChrome()
  if (!executable) {
    fail(
      'No Chrome or Chromium found. Install one, or set CHROME_PATH to its executable; this script never downloads a browser.'
    )
  }
  const browser = launchChrome(executable)
  const screenshot = path.resolve('screenshot.png')
  let outcome
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
    await browser.send(
      'Emulation.setDeviceMetricsOverride',
      { ...VIEWPORT, deviceScaleFactor: 1, mobile: false },
      sessionId
    )
    await browser.send('Page.navigate', { url: `${deepnoteOrigin}/` }, sessionId)
    outcome = await waitForPage(timeoutSeconds * 1000)
    await saveScreenshot(browser, sessionId, screenshot)
  } finally {
    await browser.close()
  }

  const problems = [
    ...session.errors.map(error => `App error: ${error}`),
    ...session.failedCalls.map(call => `Failed API call: ${call}`),
  ]
  if (outcome === 'not-connected') {
    problems.push(
      'The page loaded but never connected to Deepnote. Load https://deepnote.com/static/app-client/v1.js first in its <head>.'
    )
  } else if (outcome === 'timeout') {
    problems.push(
      session.ready
        ? `The page was still calling the API after ${timeoutSeconds} s. Pass a longer --timeout if that is expected.`
        : `The page did not load within ${timeoutSeconds} s.`
    )
  }
  console.log(`\nScreenshot: ${screenshot}`)
  if (problems.length === 0) {
    console.log('Check passed.')
    process.exit(0)
  }
  console.log(`Check failed:\n${problems.map(problem => `- ${problem}`).join('\n')}`)
  process.exit(1)
}

async function main() {
  let args
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        token: { type: 'string' },
        'api-origin': { type: 'string' },
        check: { type: 'boolean', default: false },
        port: { type: 'string' },
        timeout: { type: 'string', default: '60' },
        help: { type: 'boolean', default: false },
      },
    })
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`)
  }
  const { values, positionals } = args
  if (values.help) {
    console.log(USAGE)
    return
  }
  if (positionals.length !== 1 || !values.token || !values['api-origin']) {
    fail(USAGE)
  }
  const root = path.resolve(positionals[0])
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    fail(`No index.html in ${root}.`)
  }
  let apiOrigin
  try {
    apiOrigin = new URL(values['api-origin']).origin
  } catch {
    fail(`--api-origin is not a URL: ${values['api-origin']}`)
  }
  const port = Number(values.port ?? (values.check ? 0 : 4747))
  const timeoutSeconds = Number(values.timeout)
  if (!Number.isInteger(port) || port < 0 || port > 65534 || !(timeoutSeconds > 0)) {
    fail(USAGE)
  }

  const origins = {}
  const deepnoteServer = createDeepnoteServer({ token: values.token, apiOrigin, origins })
  const appServer = createAppServer(root, origins)
  try {
    origins.deepnote = await listen(deepnoteServer, port)
    origins.app = await listen(appServer, port === 0 ? 0 : port + 1)
  } catch (error) {
    fail(error.message)
  }

  console.log(`Serving ${root} as the app at ${origins.app}, proxying /v2 calls to ${apiOrigin}.`)
  if (values.check) {
    await check(origins.deepnote, timeoutSeconds)
  } else {
    console.log(`Preview: ${origins.deepnote}/`)
    console.log('Pages are read from disk on every load, so reload after editing. Press Ctrl+C to stop.')
  }
}

await main().catch(error => fail(error.message))
