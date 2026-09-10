---
name: deepnote-dynamic-apps
description: Use when authoring a Deepnote static site page that runs notebooks from the browser, reads run results in JavaScript, or needs full dataframe rows in a dashboard, chart, or table.
---

# Deepnote Dynamic Apps

A published Deepnote static site can be more than static HTML. Pages can load Deepnote's
hosted browser client, run the project's notebooks as the signed-in viewer, and render the
results. Use this skill when the page needs live data; use plain HTML when it does not.

This is browser JavaScript that Codex authors and publishes. Codex itself never calls this
client; the viewer's browser does.

## Prerequisites

1. The project's files are shared as a website (`staticFiles.sharingEnabled`).
2. Viewer API access is enabled (`staticFiles.apiAccessEnabled`). Set both with `update_project`.
   API access cannot be enabled in the same request that disables sharing.
3. The viewer opens the page through its canonical Deepnote URL, shape
   `https://deepnote.com/static-files/<projectId>/`. Opening the raw site origin directly
   leaves the page with no parent shell to authenticate against, and every call fails.

If viewer API access is off, say so and offer to enable it rather than shipping a page that
cannot authenticate.

## Loading The Client

```html
<script src="https://deepnote.com/static/app-client/v1.js"></script>
```

Served from the main Deepnote domain, so the tag is the same for every project. The `v1`
segment changes only when the contract changes; do not pin anything else. Guard for
`window.Deepnote` being undefined and show a clear on-page message, so a blocked or failed
script load does not surface as a silently empty page.

## API Surface

```js
const deepnote = window.Deepnote.connect({ onAuthExpired })
const notebook = deepnote.notebook(notebookId)

const inputs = await notebook.inputs()
const { run, result } = await notebook.run(
  { region: 'emea', include_all: true },
  { onProgress: (run, phase) => {}, timeoutMs: 20 * 60_000 }
)
```

- `inputs()` returns the notebook's input blocks with `blockId`, `name`, `type`, `value`, and
  optional `label`, `min`, `max`, `step`, `options`, `multiple`. Key the run payload by `name`,
  never by label or block ID, and match the input types from `deepnote-data-execution`.
- `run()` starts a detached run and polls until it reaches a terminal state. `onProgress`
  receives `'executing'` while the run is going and `'storing-result'` during the short window
  after success when results are not readable yet.
- `result(schema?)` returns the first `application/json` output found across all blocks,
  optionally filtered by that payload's own `schema` field.
- `run.snapshotBlocks` is the raw per-block output list: `{ id, type, outputs, metadata }`,
  where `outputs` are Jupyter output objects with their full MIME bundles.

Authentication is handled for you: the client asks the parent Deepnote shell for a
short-lived viewer token, renews it before expiry, and re-requests it if the API rejects it.
A handshake that never gets answered fails after about 8 seconds and stays failed until the
page reloads, so surface `onAuthExpired` in the UI instead of retrying in a loop.

## Typings

The client ships as plain JavaScript with no published type declarations. For a TypeScript
page, declare the surface yourself:

```ts
type DeepnoteInputValue = string | boolean | string[]

interface DeepnoteInput {
  blockId: string
  name: string
  type: string
  value: unknown
  label?: string
  min?: number; max?: number; step?: number   // input-slider only
  options?: string[]; multiple?: boolean      // input-select only
}

interface DeepnoteRun {
  runId: string
  notebookId: string
  status: string
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
    inputs: Record<string, DeepnoteInputValue>,
    options?: Partial<{
      onProgress: (run: DeepnoteRun, phase: 'executing' | 'storing-result') => void
      timeoutMs: number
    }>
  ) => Promise<{ run: DeepnoteRun; result: (schema?: string) => Record<string, unknown> | null }>
}
```

`snapshotBlocks` is `null` until the run's results are stored, and covers every block in the
notebook, including markdown blocks with no outputs. The useful payload is
`outputs[i].data[mimeType]`.

## What Viewer Tokens Can Reach

Only the run loop. Every other public API endpoint answers 403.

| Allowed | Purpose |
| --- | --- |
| `GET /v2/notebooks/{id}` | inputs and block IDs/types — **no block source** |
| `POST /v2/runs` | start a run; detached only, live runs rejected |
| `GET /v2/runs/{id}` | the viewer's **own** run only |

Runs started from a page mount project storage read-only, so a dynamic app cannot write
project files, and there is no file download endpoint for viewer tokens. Any data the page
needs must come back through the run's outputs.

Authority is recomputed on every request against the viewer's own access, so a page can never
show a viewer more than they could already open in Deepnote.

## Getting Full Dataframe Rows

**A dataframe output carries one page of rows, not the whole result.** The block's
`application/vnd.deepnote.dataframe.v3+json` output has a `row_count` field with the true
total and a `rows` array holding only the current page, which defaults to **10 rows**. A
notebook whose SQL ends in `LIMIT 100` still yields 10 rows in `rows` and `row_count: 100`.
The `text/plain` and `text/html` outputs on the same block are the library's own truncated
representations and are not fuller.

Never build a chart or table straight from `rows` without checking it against `row_count`.

Two ways to get the real data, in order of preference:

### Return an explicit JSON result

Have the notebook publish exactly what the page needs as a JSON output. This is what
`result()` is designed to read, it bypasses dataframe pagination entirely, and it keeps the
page's contract independent of block order.

```python
from IPython.display import display

display({'application/json': {
    'schema': 'sales-by-region/v1',
    'rows': df.to_dict('records'),
    'generated_at': str(pd.Timestamp.utcnow()),
}}, raw=True)
```

```js
const { result } = await notebook.run(inputs)
const payload = result('sales-by-region/v1')
if (!payload) {
  // the run succeeded but produced no matching result
}
```

Always set a distinct `schema` on each payload and always read with that schema: `result()`
with no argument returns whichever JSON output appears first, which silently breaks as soon
as a second one is added.

Aggregate in the notebook, not in the browser. Send the rows the page renders — thousands,
not millions. A page that needs a million rows needs a different design.

### Raise the page size on the block

When the page must read the dataframe output itself, set the block's table state when
creating it, so the kernel serializes more rows:

```json
{
  "notebookId": "...",
  "type": "sql",
  "content": "SELECT ... LIMIT 100",
  "integrationId": "...",
  "metadata": { "deepnote_table_state": { "pageSize": 100 } }
}
```

`update_block` does not accept `metadata`, so a block that already exists must be recreated to
change this. Keep the page size close to what the notebook actually returns; a large page size
inflates every stored output and every snapshot read.

## Dataframe Output Format

A dataframe block's output lives under the MIME type
`application/vnd.deepnote.dataframe.v3+json`, and is either a result or an error. Check for the
error shape first.

```ts
type DeepnoteDataframeOutput =
  | { error: string }
  | {
      type: 'dataframe' | 'query_preview' | 'data_preview'
      column_count: number        // excludes the index column below
      row_count: number           // total rows after filters, not rows delivered
      preview_row_count?: number  // rows materialized; defaults to row_count
      columns: Array<{ name: string | number; dtype: string; stats?: ColumnStats /* see below */ }>
      rows: Array<Record<string, unknown>> | Record<string, Record<string, unknown>>
    }
```

`dtype` is the library's own dtype string; see the
[pandas dtypes reference](https://pandas.pydata.org/docs/user_guide/basics.html#dtypes).
`stats` carries optional `unique_count`, `nan_count`, `min`/`max` as strings, and either a
`histogram` of `{ bin_start, bin_end, count }` or `categories` of `{ name, count }`.

`type` is `query_preview` for SQL results that were not fully materialized and `data_preview`
for distributed frames (PySpark, pandas-on-Spark) where only a local cache exists. For
`data_preview`, `row_count` is the remote total and `preview_row_count` is what was pulled, so
raising `pageSize` past `preview_row_count` returns nothing extra.

Current kernels emit `rows` as an array; the contract also permits an object keyed by index, so
normalize with `Array.isArray(rows) ? rows : Object.values(rows)`.

### Value Encoding

Row values are serialized for transport and are **not** type-stable, none of which is visible
from `dtype`:

- Missing values arrive as the strings `nan`, `NaN`, `NaT`, or `None` — never `null`. pandas'
  [missing data guide](https://pandas.pydata.org/docs/user_guide/missing_data.html) explains
  which values become which; the point here is that they cross the wire as text.
- A numeric column whose values exceed 2^53 is serialized entirely as strings, to preserve
  precision that `JSON.parse` would lose.
- Dates and timestamps are strings in the frame's own formatting.

So coerce with `Number(v)` and guard `Number.isFinite` rather than trusting
`typeof v === 'number'`, and parse timestamps explicitly.

Every row also carries `_deepnote_index_column`, which appears as a trailing entry in `columns`
with no `stats`. Strip it before rendering, or `Object.keys(row)` shows a phantom column. It is
excluded from `column_count`, so `column_count !== columns.length`.

For SQL blocks, the same block also carries an
`application/vnd.deepnote.sql-output-metadata+json` output with query cache `status` and
optional `size_in_bytes`, `cache_created_at`, `compiled_query`, `variable_type`,
`integration_id`, and `error`.

None of this applies to a JSON result the notebook publishes itself, which is one more reason to
prefer that path: `df.to_dict('records')` gives the page clean values under a shape it controls.

## Authoring Workflow

1. Resolve the project and notebook, and read the notebook's inputs with `get_notebook`.
2. Decide the result contract first: pick a `schema` name and the exact JSON shape the page
   will render.
3. Add or update the notebook block that emits that JSON, then verify it end to end with
   `create_run` and `get_run` before writing any HTML.
4. Author the page against the verified shape.
5. Enable sharing and viewer API access with `update_project`.
6. Publish with the Static Site Workflow in `deepnote-mcp`, and hand the user the canonical
   URL the publish operation returned.

Verifying the result shape from a real run before writing the page is what keeps the page
from rendering an empty chart for reasons no one can see in the browser.

## Failure Modes To Handle In The Page

| Symptom | Cause | Handle it by |
| --- | --- | --- |
| Handshake times out after ~8s | page opened outside the Deepnote shell, or viewer API access is off | show a message pointing at the canonical Deepnote URL |
| `run` succeeds, `result()` is `null` | notebook emitted no matching JSON output, or the schema does not match | check the notebook's output block and the `schema` string |
| Chart shows 10 points for a bigger query | reading `rows` from a dataframe output | switch to a JSON result, or raise `pageSize` |
| Calls start failing mid-session | viewer's access was revoked | `onAuthExpired`, then prompt for a reload |
| Run never finishes | default timeout is 20 minutes | pass a shorter `timeoutMs` and show progress from `onProgress` |

## Safety Rules

- Published files are served to everyone who can view the project. Never put API keys,
  personal tokens, `.env` contents, or other secrets in page source.
- Viewer API access is a separate opt-in. Enable it only when the page genuinely needs to run
  notebooks, and tell the user what enabling it allows.
- The page runs notebooks as whoever is viewing it. Treat every run as attributable to that
  viewer and do not design pages that run notebooks with side effects on page load.
- Do not invent endpoints for viewer tokens. Anything outside the three allowed routes returns
  403 no matter how the request is shaped.
