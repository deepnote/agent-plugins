#!/usr/bin/env node
// Previews a data app page locally, embedded the way Deepnote embeds it, against the real Deepnote API.
//
// Two loopback origins stand in for Deepnote: one serves the page folder with Deepnote's rules, the other serves a
// stand-in Deepnote page that embeds it and answers the app client's token requests. The page calls the API itself,
// as it does in Deepnote. --check loads it in an installed Chrome and reads the app's messages and API calls over
// the DevTools protocol. Built-in modules only.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const USAGE = `Usage: node app-dev.mjs <folder with index.html> --token <token> --api-origin <apiOrigin> [--check]

  --token        Viewer token from the create_app_token MCP tool. It is never printed.
  --api-origin   apiOrigin from the same create_app_token result.
  --check        Load the page headlessly in an installed Chrome or Chromium, print its errors and API calls,
                 and exit non-zero on an app error, a failed API call, or a timeout. Without it, serve a preview
                 to open in a browser until stopped.
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
// The app client asks for a new token a minute before this, so its refresh path runs during a preview.
const TOKEN_LIFETIME_SECONDS = 120
// --check finishes once the page is ready and the API has been quiet this long.
const SETTLE_MS = 3000
// The stand-in Deepnote page reports the app's messages to --check through this DevTools binding.
const REPORT_BINDING = '__deepnoteReport'

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

function createAppServer(root, origins, apiOrigin) {
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
      // The API origin is listed for local Deepnote setups, whose API is plain http.
      'content-security-policy': `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: ${apiOrigin}; frame-ancestors 'self' ${origins.deepnote}`,
      'content-type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    })
    res.end(req.method === 'HEAD' ? undefined : file)
  })
}

function renderDeepnotePage({ appOrigin, apiOrigin, token }) {
  // `<` is escaped so no value can close the script element.
  const config = JSON.stringify({ appOrigin, apiOrigin, token }).replaceAll('<', '\\u003c')
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
const { appOrigin, apiOrigin, token } = ${config}
const report = event => window.${REPORT_BINDING}?.(JSON.stringify(event))
document.querySelector('iframe').addEventListener('load', () => report({ type: 'page-load' }))
window.addEventListener('message', event => {
  if (event.origin !== appOrigin || !event.data || !event.source) return
  const { type, message, line, source } = event.data
  if (type === 'deepnote-static-files-api-token-request') {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + ${TOKEN_LIFETIME_SECONDS}
    event.source.postMessage({ type: 'deepnote-static-files-api-token-response', token, apiOrigin, expiresAtSeconds }, appOrigin)
    report({ type })
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

function createDeepnoteServer(renderPage) {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && new URL(req.url, 'http://localhost').pathname === '/') {
      res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' }).end(renderPage())
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
function launchChrome(executable, onEvent) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepnote-app-dev-'))
  const chrome = spawn(
    executable,
    [
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
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
      if (message.method) {
        onEvent(message)
        continue
      }
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

async function waitForPage(state, timeoutMs) {
  const startedAt = Date.now()
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 200))
    const now = Date.now()
    if (state.ready && state.apiCalls.size === 0 && now - state.lastActivityAt >= SETTLE_MS) return 'settled'
    if (!state.ready && state.pageLoadedAt && now - state.pageLoadedAt >= SETTLE_MS) return 'not-connected'
    if (now - startedAt >= timeoutMs) return 'timeout'
  }
}

async function check({ deepnoteOrigin, apiOrigin, timeoutSeconds }) {
  const executable = findChrome()
  if (!executable) {
    fail(
      'No Chrome or Chromium found. Install one, or set CHROME_PATH to its executable; this script never downloads a browser.'
    )
  }
  const state = {
    ready: false,
    pageLoadedAt: null,
    lastActivityAt: Date.now(),
    apiCalls: new Map(),
    errors: [],
    failedCalls: [],
  }
  let tokenRejected = false

  function handleReport(event) {
    if (event.type === 'page-load') {
      state.pageLoadedAt ??= Date.now()
    } else if (event.type === 'deepnote-static-files-api-token-request') {
      console.log('[app] token requested')
    } else if (event.type === 'deepnote-static-files-app-ready') {
      state.ready = true
      console.log('[app] ready')
    } else if (event.type === 'deepnote-static-files-app-error') {
      const where = [event.line != null && `line ${event.line}`, event.source].filter(Boolean).join(', ')
      const line = `${event.message}${where ? ` (${where})` : ''}`
      state.errors.push(line)
      console.log(`[app] error: ${line}`)
    }
  }

  async function finishApiCall(requestId, errorText) {
    const call = state.apiCalls.get(requestId)
    let detail = errorText
    if (!errorText && call.status >= 400) {
      detail = await browser
        .send('Network.getResponseBody', { requestId }, call.sessionId)
        .then(({ body }) => JSON.parse(body).message?.slice(0, 300))
        .catch(() => null)
    }
    const line = `${call.label} ${errorText ? 'failed' : call.status} (${Date.now() - call.startedAt} ms)${detail ? `: ${detail}` : ''}`
    console.log(`[api] ${line}`)
    if (errorText || call.status >= 400) {
      state.failedCalls.push(line)
    }
    if (call.status === 401 && !tokenRejected) {
      tokenRejected = true
      console.log(
        'The Deepnote API rejected the app token, most likely because it expired. Mint a new one with create_app_token and rerun.'
      )
    }
    state.apiCalls.delete(requestId)
    state.lastActivityAt = Date.now()
  }

  // Events come from the stand-in page's session and, when Chrome runs the app in a process of its own, the app's.
  function handleEvent({ method, params = {}, sessionId }) {
    state.lastActivityAt = Date.now()
    const call = state.apiCalls.get(params.requestId)
    if (method === 'Runtime.bindingCalled' && params.name === REPORT_BINDING) {
      handleReport(JSON.parse(params.payload))
    } else if (method === 'Target.attachedToTarget') {
      browser
        .send('Network.enable', {}, params.sessionId)
        .catch(() => {})
        .then(() => browser.send('Runtime.runIfWaitingForDebugger', {}, params.sessionId))
        .catch(() => {})
    } else if (
      method === 'Network.requestWillBeSent' &&
      params.request.url.startsWith(`${apiOrigin}/v2/`) &&
      params.request.method !== 'OPTIONS'
    ) {
      const label = `${params.request.method} ${params.request.url.slice(apiOrigin.length)}`
      state.apiCalls.set(params.requestId, { label, sessionId, startedAt: Date.now() })
    } else if (method === 'Network.responseReceived' && call) {
      call.status = params.response.status
    } else if (method === 'Network.loadingFinished' && call) {
      finishApiCall(params.requestId)
    } else if (method === 'Network.loadingFailed' && call) {
      finishApiCall(params.requestId, params.corsErrorStatus?.corsError ?? params.errorText)
    }
  }

  const browser = launchChrome(executable, handleEvent)
  let outcome
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
    await browser.send('Runtime.enable', {}, sessionId)
    await browser.send('Runtime.addBinding', { name: REPORT_BINDING }, sessionId)
    await browser.send('Network.enable', {}, sessionId)
    await browser.send(
      'Target.setAutoAttach',
      { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
      sessionId
    )
    await browser.send('Page.navigate', { url: `${deepnoteOrigin}/` }, sessionId)
    outcome = await waitForPage(state, timeoutSeconds * 1000)
  } finally {
    await browser.close()
  }

  const problems = [
    ...state.errors.map(error => `App error: ${error}`),
    ...state.failedCalls.map(call => `Failed API call: ${call}`),
  ]
  if (outcome === 'not-connected') {
    problems.push(
      'The page loaded but never connected to Deepnote. Load https://deepnote.com/static/app-client/v1.js first in its <head>.'
    )
  } else if (outcome === 'timeout') {
    problems.push(
      state.ready
        ? `The page was still calling the API after ${timeoutSeconds} s. Pass a longer --timeout if that is expected.`
        : `The page did not load within ${timeoutSeconds} s.`
    )
  }
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
  const deepnoteServer = createDeepnoteServer(() =>
    renderDeepnotePage({ appOrigin: origins.app, apiOrigin, token: values.token })
  )
  const appServer = createAppServer(root, origins, apiOrigin)
  try {
    origins.deepnote = await listen(deepnoteServer, port)
    origins.app = await listen(appServer, port === 0 ? 0 : port + 1)
  } catch (error) {
    fail(error.message)
  }

  console.log(`Serving ${root} as the app at ${origins.app}, against the API at ${apiOrigin}.`)
  if (values.check) {
    await check({ deepnoteOrigin: origins.deepnote, apiOrigin, timeoutSeconds })
  } else {
    console.log(`Preview: ${origins.deepnote}/`)
    console.log(
      "Pages are read from disk on every load, so reload after editing; the browser's developer tools show errors and API calls. Press Ctrl+C to stop."
    )
  }
}

await main().catch(error => fail(error.message))
