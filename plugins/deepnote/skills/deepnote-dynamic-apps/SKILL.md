---
name: deepnote-dynamic-apps
description: Use when writing the JavaScript of a Deepnote static site that runs the project's notebooks as its viewer, reads notebook results in the browser, or shows notebook data in a published dashboard, chart, or table.
---

# Deepnote Dynamic Apps

A dynamic app is a static site whose JavaScript runs notebooks as the signed-in viewer and renders the results. Publishing is in `deepnote-static-sites`. Run inputs and dataframe outputs are defined in `deepnote-runs`.

The page calls Deepnote from the viewer's browser with a short-lived token that Deepnote gives the viewer.

## Requirements

- The project shares its static site with viewer API access enabled: `staticFiles.sharingEnabled` and `staticFiles.apiAccessEnabled` on `update_project`, or `apiAccess: "enabled"` on `publish_static_site`.
- The viewer is signed in to Deepnote and has access to the project.
- The viewer opens the site's canonical URL (`staticFiles.url`). The page gets its token from the Deepnote page that frames it, so it cannot authenticate anywhere else.

## Browser Client

Load the client from the origin of the canonical URL, before the page's own scripts:

```html
<script src="https://deepnote.com/static/app-client/v1.js"></script>
```

It defines `window.Deepnote`. If that is missing because the script failed to load, show a message instead of an empty page.

```js
const deepnote = window.Deepnote.connect({ onAuthExpired: showReloadMessage })
const notebook = deepnote.notebook(notebookId)

const inputs = await notebook.inputs()
const { run, result } = await notebook.run(values, { onProgress: (_, phase) => showProgress(phase) })
const payload = run.status === 'success' ? result('sales-by-region/v1') : null
```

- `inputs()` returns the notebook's input blocks with `blockId`, `name`, `type`, `value`, and, where they apply, `label`, `min`, `max`, `step`, `options`, and `multiple`. Key `values` by input `name` and type them as in `deepnote-runs` Run Inputs.
- `run()` starts a detached run with read-only project storage, polls it every 2 seconds, and resolves when the run ends with any status, so check `run.status` and `run.error`. It rejects when a request fails, when `timeoutMs` (default 20 minutes) passes, or when the run succeeded but Deepnote could not save its results. `onProgress` receives `'executing'`, then `'storing-result'` while a successful run's results are saved.
- `result(schema)` returns the first `application/json` output whose `schema` field equals `schema`, or `null`. Always pass the schema: without it, `result()` returns the first JSON output of any block.
- `run.snapshotBlocks` lists every block as `{ id, type, outputs, metadata }`; output data is under `outputs[i].data[mimeType]`. Block source is never included.
- The client requests the token, renews it before it expires, and drops it after a 401 or 403 so the next call requests a new one. If no token arrives within 8 seconds, the call rejects with `Could not reach Deepnote`, `onAuthExpired` runs, and every later call rejects until the page reloads.

The client ships no type declarations. For a TypeScript page, save these as `deepnote.d.ts`:

```ts
type DeepnoteInputValue = string | boolean | string[]

interface DeepnoteInput {
  blockId: string
  name: string
  type: string
  value: unknown
  label?: string
  min?: number
  max?: number
  step?: number
  options?: string[]
  multiple?: boolean
}

interface DeepnoteRun {
  runId: string
  notebookId: string
  status: 'pending' | 'running' | 'success' | 'error' | 'internal_error' | 'stopped'
  snapshotStatus?: 'pending' | 'available' | 'unavailable'
  snapshotBlocks?: Array<{
    id: string
    type: string
    outputs: Array<{ data?: Record<string, unknown> }>
    metadata: Record<string, unknown>
  }> | null
  error?: string | null
  createdAt: string
  completedAt?: string | null
}

interface DeepnoteNotebook {
  inputs: () => Promise<DeepnoteInput[]>
  run: (
    values: Record<string, DeepnoteInputValue>,
    options?: {
      onProgress?: (run: DeepnoteRun, phase: 'executing' | 'storing-result') => void
      timeoutMs?: number
    },
  ) => Promise<{ run: DeepnoteRun; result: (schema?: string) => Record<string, unknown> | null }>
}

interface Window {
  Deepnote?: {
    connect: (options?: { onAuthExpired?: () => void }) => { notebook: (notebookId: string) => DeepnoteNotebook }
  }
}
```

## What The Viewer Token Can Reach

| Request | Allowed |
| --- | --- |
| `GET /v2/notebooks/{notebookId}` | Notebook name, inputs, and block IDs and types; no block source |
| `POST /v2/runs` | Detached runs only; `detached: false`, `blockIds`, and `machineType` are rejected |
| `GET /v2/runs/{runId}` | The viewer's own runs, with `snapshotBlocks` once results are saved; never a raw snapshot or download URL |

Every other endpoint answers 403, so do not offer notebook listing, run history, or other viewers' runs. The token can access notebooks in the site's project and in other projects of the same workspace where the viewer has direct access; starting runs in other projects also requires execute permission. Deepnote checks the viewer's access on every request, and turning off viewer API access fails the page's next call.

Use the client. A page that calls the API without it must follow the handshake in the [cloud app example](https://github.com/deepnote/deepnote/tree/main/examples/local-runner/cloud-app), refresh the token through the handshake before its 15-minute expiry and on a 401, and send `detachedRunStorageMode: "readonly"` with every run.

## Getting Data Into The Page

### Return A JSON Result

Have one notebook block display exactly what the page renders, under a schema name of your choice:

```python
import json
from IPython.display import display

rows = json.loads(df.to_json(orient='records', date_format='iso'))
display({'application/json': {'schema': 'sales-by-region/v1', 'rows': rows}}, raw=True)
```

`to_json` writes missing values as `null` and dates as ISO strings. `df.to_dict('records')` does not: a missing number reaches the page as the string `"nan"`, and a missing timestamp fails the block with `NaTType does not support strftime`. Integers past 2^53 lose precision in the browser's `JSON.parse`, so send them as strings, for example `df.astype({'id': str})`.

Send only what the page shows and aggregate in the notebook. Deepnote replaces a block's outputs with a short notice when they pass 512 KiB as JSON, or when the notebook's outputs together pass 5 MiB, and `result()` then returns `null`.

### Read A Dataframe Output

When the page must read a block's table instead, find it under the `application/vnd.deepnote.dataframe.v3+json` output data and read it as `deepnote-runs` Dataframe Outputs describes: compare `rows.length` with `row_count` before charting it. In JavaScript:

- In a numeric column, treat `null` and any value for which `Number(v)` is `NaN` as missing; that covers `"nan"`, `"<NA>"`, and `"inf"`.
- In an integer column with a value past 2^53, keep the strings, which suits IDs, or use `BigInt(v)` for integer math; `Number(v)` rounds them.
- Pandas sends booleans as the strings `"True"` and `"False"`. Parse timestamps explicitly.
- Drop `_deepnote_index_column` from each row before rendering it.

## Authoring Workflow

1. Read the notebook with `get_notebook` for its ID and input names.
2. Choose the schema name and the exact JSON shape the page renders, and add or update the one block that displays it.
3. Run it as a viewer would: `create_run` with `detachedRunStorageMode: "readonly"` and the values the page will send, then `get_run` with `snapshotDelivery: "blocks"` and `fullOutputs: true`. Check the JSON before writing the page.
4. Write the page against that shape. Show a default view without a run, run the notebook only on an explicit submission, prevent duplicate submissions, and show loading, empty, and error states.
5. Publish with `deepnote-static-sites` with viewer API access enabled.
6. Open the canonical URL as a signed-in viewer and submit once, or ask the user to. A run through MCP does not test the page's token or rendering.

## Failures To Handle In The Page

| Symptom | Cause | Handle it by |
| --- | --- | --- |
| Calls reject after about 8 seconds and `onAuthExpired` runs | Page opened outside the canonical URL, viewer API access off, or the viewer signed out or without access | Message pointing to the canonical URL; reload to retry |
| `run.status` is `error`, `internal_error`, or `stopped` | The notebook failed or was stopped | Show `run.error`, or the status when it is empty |
| `result(schema)` is `null` after `success` | No JSON output with that schema, the output was over the size limit, or `run.snapshotBlocks` is still `null` | Check the notebook's output and the schema string |
| The chart shows 10 points | Reading `rows` of a dataframe output | Return a JSON result, or create the block with a larger page size |
| `run()` rejects with `did not finish in time` | The run took longer than `timeoutMs` | Show progress from `onProgress`; raise `timeoutMs` or speed up the notebook |

## Safety

- Never put API keys, personal tokens, `.env` contents, or other secrets in page source.
- Runs start as the viewer. Do not start them on page load, and do not have a page run notebooks with side effects such as sending messages or writing to external systems.
- A notebook the page runs must not depend on writing project files: viewer runs from the client have read-only project storage.
