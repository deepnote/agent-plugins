#!/usr/bin/env node
// Previews a data app page locally, embedded the way Deepnote embeds it, against the real Deepnote API.
//
// Two loopback origins stand in for Deepnote: one serves the page folder with Deepnote's rules, the other serves a
// stand-in Deepnote page that embeds it, answers the app client's token requests, and lists the app's errors above
// it, where a browser tool can read them. The page calls the API itself, as it does in Deepnote. Built-in modules only.

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'

const USAGE = `Usage: node app-dev.mjs <folder with index.html> --token <token> --api-origin <apiOrigin> [--port <port>]

  --token        Viewer token from the create_data_app_token MCP tool. It is never printed.
  --api-origin   apiOrigin from the same create_data_app_token result.
  --port         Port of the preview page; the app is served on the next one. Default 4747.`

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
<style>
html, body { height: 100%; margin: 0; }
body { display: flex; flex-direction: column; font: 13px/1.5 system-ui, sans-serif; color: #334052; background: #f8fafc; }
#status { padding: 8px 16px; border-bottom: 1px solid #dde4ee; }
#status.problem { background: #fff1f2; color: #9f1239; }
#status ul { margin: 4px 0 0; padding-left: 20px; }
iframe { flex: 1; width: 100%; border: 0; background: #fff; }
</style>
</head>
<body>
<div id="status" role="status">Waiting for the app to connect to Deepnote.</div>
<iframe src="${appOrigin}/" allow="fullscreen" title="Data app"></iframe>
<script>
const { appOrigin, apiOrigin, token } = ${JSON.stringify({ appOrigin, apiOrigin, token })}
const status = document.getElementById('status')
const errors = []
let connected = false

function show(text, problem) {
  status.className = problem ? 'problem' : ''
  status.textContent = text
  if (errors.length === 0) return
  const list = status.appendChild(document.createElement('ul'))
  for (const error of errors) list.appendChild(document.createElement('li')).textContent = error
}

// The app client connects as soon as its script runs, well before the page finishes loading.
document.querySelector('iframe').addEventListener('load', () =>
  setTimeout(() => {
    if (!connected) {
      show('The page loaded but never connected to Deepnote. Load https://deepnote.com/static/app-client/v1.js first in its <head>.', true)
    }
  }, 3000)
)
window.addEventListener('message', event => {
  if (event.origin !== appOrigin) return
  const { type, message, line, source } = event.data ?? {}
  if (type === 'deepnote-static-files-api-token-request') {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + ${TOKEN_LIFETIME_SECONDS}
    event.source.postMessage({ type: 'deepnote-static-files-api-token-response', token, apiOrigin, expiresAtSeconds }, appOrigin)
    return
  }
  if (type === 'deepnote-static-files-app-ready') {
    connected = true
  } else if (type === 'deepnote-static-files-app-error') {
    const where = [line != null && 'line ' + line, source].filter(Boolean).join(', ')
    errors.push(where ? message + ' (' + where + ')' : message)
  } else {
    return
  }
  if (errors.length > 0) show(errors.length === 1 ? '1 app error:' : errors.length + ' app errors:', true)
  else show('Connected to Deepnote. No app errors.')
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

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      token: { type: 'string' },
      'api-origin': { type: 'string' },
      port: { type: 'string', default: '4747' },
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
  const port = Number(values.port)

  const origins = {}
  const deepnoteServer = http.createServer((req, res) =>
    res
      .writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' })
      .end(renderDeepnotePage({ appOrigin: origins.app, apiOrigin, token: values.token }))
  )
  origins.deepnote = await listen(deepnoteServer, port)
  origins.app = await listen(createAppServer(root, origins, apiOrigin), port + 1)

  console.log(`Serving ${root} as the app at ${origins.app}, against the API at ${apiOrigin}.`)
  console.log(`Preview: ${origins.deepnote}/`)
  console.log(
    'Files are read from disk on every load, so reload after editing. The bar above the page shows whether the app connected to Deepnote and lists its errors. Press Ctrl+C to stop.'
  )
}

await main().catch(error => fail(error.message))
