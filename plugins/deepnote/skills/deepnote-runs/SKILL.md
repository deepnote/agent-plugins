---
name: deepnote-runs
description: Use when running a Deepnote notebook, passing run input values, checking run status, listing or auditing run history, debugging a failed or stuck run, or reading run snapshot outputs through the Deepnote MCP server.
---

# Deepnote Runs

Tool arguments, pagination, and the capability boundary are defined in `deepnote-mcp`. Integration structure and usage are in `deepnote-workspace`.

## Execution Workflow

1. Read the notebook first with `get_notebook`.
2. Identify whether the user needs a fresh run, a specific run's status, or run history.
3. If the notebook has inputs and the user supplied values, map them to the exact input `name` fields from `get_notebook` (see Run Inputs).
4. Before starting a run, inspect the notebook for cells that print environment variables, secrets, credentials, or entire configuration objects, and for cells that start servers, send bulk or network requests, write files, call external or production-like systems, or mutate data. Name the risk and get explicit confirmation before running.
5. Use `create_run` only for full-notebook execution by `notebookId`; the hosted server does not expose single-block execution.
6. If `create_run` returns an error, report it and stop. Do not call `get_run` unless a run ID was returned. This includes user-facing errors such as workspace or parallel run limits.
7. Poll `get_run` until the run reaches a terminal state or it is clear the run is still in progress, following Snapshot Delivery below.

## Run Inputs

`create_run` accepts an optional `inputs` object. Keys must be notebook input names from `get_notebook`, not labels or block IDs. Values must match the input block type:

- Text, textarea, file, date, slider, and single-select inputs use strings. Slider values are numeric strings.
- Checkbox inputs use booleans.
- Multi-select inputs use arrays of strings.
- Date-range inputs use a string or an array of exactly two strings.

If the user gives a label instead of a name, map it to the closest input `name` only when the match is unambiguous; otherwise ask. An undefined input name or a mismatched value type makes Deepnote reject the run with a validation error. Run input values apply to that run only and never change the notebook's saved defaults.

## Run History

Use `list_notebook_runs` for recent runs, failed runs, run history, or anything older than the latest run metadata in `get_notebook`. For short requests, keep the default page size; for audits, page through all results. Use `get_run` only after selecting a specific run that needs detail. For "why did the last run fail?" without a run ID, list recent runs, pick the newest failed run, then call `get_run` for it.

## Snapshot Delivery

This is the single definition of how to handle `get_run` snapshots.

- Omit `snapshotDelivery` for routine status checks. The response then carries `snapshotContent: null` and, when a snapshot exists, a short-lived `snapshotDownloadUrl` to a `.snapshot.deepnote` file. That URL grants access to the snapshot: never paste it into an answer unless the user asks for a download or file handoff, and never fetch it on your own.
- Request `snapshotDelivery: "inline"` when the user asks you to inspect outputs, summarize results, diagnose a failure from snapshot details, or map references visible in the snapshot. Inline snapshots can be large and sensitive: summarize the relevant blocks, outputs, failures, or data shape instead of dumping raw content.
- If the current tool schema does not expose `snapshotDelivery`, use the fields `get_run` returns as they are and do not invent `snapshotContent` or `snapshotDownloadUrl`.

## Sensitive Outputs

When snapshot content, download URLs, or errors include sensitive, proprietary, personal, or production-like data, minimize exposure. Summarize the result, shape, quality issues, aggregates, or failure mode instead of dumping raw records, presigned URLs, or long logs.

## Reporting Results

For successful runs, include the notebook name or ID, run ID, status, any input overrides that are safe to mention, and the important result from inline snapshot content when you requested it. If you only have a download URL, say a snapshot is available without exposing the URL. For failures, include concise error detail and the next fix to try. Prefer one compact run table plus the most important result or first actionable error; do not paste long logs, raw snapshots, or full outputs by default.

| Field | Value |
| --- | --- |
| Notebook | `Notebook name` |
| Run ID | `run-id` |
| Status | `success`, `failed`, `pending`, or `running` |
| Started | `YYYY-MM-DD HH:MM UTC` |
| Completed | `YYYY-MM-DD HH:MM UTC` or `Still running` |
| Inputs | `safe input summary` or `None` |
| Result | `short result summary` |

For failed or stuck runs, use a debugging report:

| Check | Finding |
| --- | --- |
| Run state | `failed`, `pending`, or `running for N minutes` |
| First actionable error | `short error text` |
| Likely cause | `missing input`, `missing file`, `server not listening`, `dependency failure`, or `unknown from MCP` |
| Safe next step | `inspect notebook`, `rerun with inputs`, `start serving notebook`, or `manual Deepnote action needed` |

When inspecting a large snapshot, request inline delivery only when necessary, then summarize block counts, failed blocks, final outputs, and the first actionable error.
