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

  --token        Viewer token from the create_data_app_token MCP tool. It is never printed.
  --api-origin   apiOrigin from the same create_data_app_token result.
  --check        Load the page headlessly in an installed Chrome, Chromium, or Edge, print its errors and API
                 calls, and exit non-zero on an app error, a failed API call, or a timeout. Without it, serve a
                 preview to open in a browser until stopped.
  --port         Port of the preview page; the app is served on the next one. Default 4747, or free ports
                 with --check.

Set CHROME_PATH to use a browser that is not found automatically.`

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}
// The app client asks for a new token a minute before this, so its refresh path runs during a preview.
const TOKEN_LIFETIME_SECONDS = 120
// --check finishes once the page is ready and the API has been quiet this long.
const SETTLE_MS = 3000
const TIMEOUT_SECONDS = 60
// The stand-in Deepnote page reports the app's messages to --check through this DevTools binding.
const REPORT_BINDING = '__deepnoteReport'

function fail(message) {
  console.error(message)
  process.exit(1)
}

/**
 * Serves the folder the way Deepnote serves `_deepnote_static/`: paths ending in `/` get their index.html, other
 * paths need the exact file name, and nosniff makes the content type matter.
 */
function createAppServer(root, origins, apiOrigin) {
  return http.createServer(async (req, res) => {
    let filePath
    let file
    try {
      const { pathname } = new URL(req.url, origins.app)
      filePath = path.join(root, decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : '')
      if (filePath.startsWith(root + path.sep)) file = await fs.promises.readFile(filePath)
    } catch {}
    if (!file) {
      console.log(`[page] 404 ${req.url}`)
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'cache-control': 'no-store',
      // The API origin is listed for local Deepnote setups, whose API is plain http.
      'content-security-policy': `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: ${apiOrigin}; frame-ancestors 'self' ${origins.deepnote}`,
      'content-type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    })
    res.end(file)
  })
}

function renderDeepnotePage({ appOrigin, apiOrigin, token }) {
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
const { appOrigin, apiOrigin, token } = ${JSON.stringify({ appOrigin, apiOrigin, token })}
const report = event => window.${REPORT_BINDING}?.(JSON.stringify(event))
document.querySelector('iframe').addEventListener('load', () => report({ type: 'page-load' }))
window.addEventListener('message', event => {
  if (event.origin !== appOrigin) return
  const { type, message, line, source } = event.data ?? {}
  if (type === 'deepnote-static-files-api-token-request') {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + ${TOKEN_LIFETIME_SECONDS}
    event.source.postMessage({ type: 'deepnote-static-files-api-token-response', token, apiOrigin, expiresAtSeconds }, appOrigin)
  }
  report({ type, message, line, source })
})
</script>
</body>
</html>
`
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
  })
}

/** Finds an installed Chrome, Chromium, or Edge, in that order. They all speak the same DevTools protocol. */
function findBrowser() {
  const [names, dirs] = {
    darwin: [
      [
        'Google Chrome.app/Contents/MacOS/Google Chrome',
        'Chromium.app/Contents/MacOS/Chromium',
        'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ],
      ['/Applications', path.join(os.homedir(), 'Applications')],
    ],
    win32: [
      ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'],
      [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean),
    ],
  }[process.platform] ?? [
    [
      'google-chrome',
      'google-chrome-stable',
      'chromium',
      'chromium-browser',
      'microsoft-edge',
      'microsoft-edge-stable',
    ],
    (process.env.PATH ?? '').split(path.delimiter),
  ]
  const executables = names.flatMap(name => dirs.map(dir => path.join(dir, name)))
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
    exited,
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

async function waitForPage(state) {
  const startedAt = Date.now()
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 200))
    const now = Date.now()
    // The iframe's load event waits for every script, stylesheet, and image, so a late one can still fail the check.
    if (state.ready && state.pageLoadedAt && state.apiCalls.size === 0 && now - state.lastActivityAt >= SETTLE_MS) {
      return 'settled'
    }
    if (!state.ready && state.pageLoadedAt && now - state.pageLoadedAt >= SETTLE_MS) return 'not-connected'
    if (now - startedAt >= TIMEOUT_SECONDS * 1000) return 'timeout'
  }
}

async function check({ deepnoteOrigin, apiOrigin }) {
  const executable = findBrowser()
  if (!executable) {
    fail(
      'No Chrome, Chromium, or Edge found. Install one, or set CHROME_PATH to its executable; this script never downloads a browser.'
    )
  }
  const state = {
    ready: false,
    pageLoadedAt: null,
    lastActivityAt: Date.now(),
    apiCalls: new Map(),
    errors: [],
    failedCalls: [],
    tokenRejected: false,
  }

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
        .then(({ body }) => JSON.parse(body).message)
        .catch(() => null)
    }
    const line = `${call.label} ${errorText ? 'failed' : call.status} (${Date.now() - call.startedAt} ms)${detail ? `: ${detail}` : ''}`
    console.log(`[api] ${line}`)
    if (errorText || call.status >= 400) {
      state.failedCalls.push(line)
    }
    if (call.status === 401) {
      state.tokenRejected = true
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
    outcome = await Promise.race([waitForPage(state), browser.exited.then(() => 'browser-exited')])
  } finally {
    await browser.close()
  }

  const problems = [
    ...state.errors.map(error => `App error: ${error}`),
    ...state.failedCalls.map(call => `Failed API call: ${call}`),
  ]
  if (state.tokenRejected) {
    problems.push(
      'The Deepnote API rejected the data app token, most likely because it expired. Mint a new one with create_data_app_token and rerun.'
    )
  }
  if (outcome === 'not-connected') {
    problems.push(
      'The page loaded but never connected to Deepnote. Load https://deepnote.com/static/app-client/v1.js first in its <head>.'
    )
  } else if (outcome === 'browser-exited') {
    problems.push('The browser exited before the check finished.')
  } else if (outcome === 'timeout') {
    problems.push(
      state.ready && state.pageLoadedAt
        ? `The page was still calling the API after ${TIMEOUT_SECONDS} s.`
        : `The page did not load within ${TIMEOUT_SECONDS} s.`
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
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      token: { type: 'string' },
      'api-origin': { type: 'string' },
      check: { type: 'boolean', default: false },
      port: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })
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
  const apiOrigin = new URL(values['api-origin']).origin
  const port = Number(values.port ?? (values.check ? 0 : 4747))

  const origins = {}
  const deepnoteServer = http.createServer((req, res) =>
    res
      .writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' })
      .end(renderDeepnotePage({ appOrigin: origins.app, apiOrigin, token: values.token }))
  )
  origins.deepnote = await listen(deepnoteServer, port)
  origins.app = await listen(createAppServer(root, origins, apiOrigin), port === 0 ? 0 : port + 1)

  console.log(`Serving ${root} as the app at ${origins.app}, against the API at ${apiOrigin}.`)
  if (values.check) {
    await check({ deepnoteOrigin: origins.deepnote, apiOrigin })
  } else {
    console.log(`Preview: ${origins.deepnote}/`)
    console.log(
      "Files are read from disk on every load, so reload after editing; the browser's developer tools show errors and API calls. Press Ctrl+C to stop."
    )
  }
}

await main().catch(error => fail(error.message))
