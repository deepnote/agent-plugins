---
name: deepnote-data-execution
description: Use when running Deepnote notebooks, inspecting notebook inputs, reviewing integration references and cached table structure, listing run history, or interpreting run status and snapshot outputs through the Deepnote MCP server.
---

# Deepnote Data And Execution

## Available Context

Use the Deepnote MCP server for the execution and context it currently exposes:

- `get_notebook` for notebook blocks, input variables, last-run metadata, and integration references visible in blocks.
- `list_integrations` for workspace integration names and types.
- `get_integration` for integration details and cached table structure, optionally filtered by `databaseName`, `schemaName`, or exact `tableName`.
- `list_integration_project_usages`, `list_integration_notebook_usages`, and `list_integration_block_usages` for direct integration usage mapping.
- `create_run` to start full-notebook execution, optionally with input values.
- `list_notebook_runs` for historical notebook runs, newest first, with `pageSize` and `pageToken` pagination.
- `get_run` for run status, errors, completion time, and run snapshots. When `snapshotDelivery` is omitted, it returns a short-lived `snapshotDownloadUrl` when a snapshot is available; this is equivalent to `snapshotDelivery: "downloadUrl"`. Request `snapshotDelivery: "inline"` only when you need `snapshotContent` in the tool response.
- `get_me` for the authenticated workspace, API key type, and caller access level when execution permissions or workspace identity matter.

Use `get_integration` for cached table and column structure when the user asks about integration schemas, tables, columns, or whether a table exists. Do not claim live database introspection, table previews, query previews, file metadata, or environment configuration unless a current MCP tool explicitly exposes that data.

## Execution Workflow

1. Read the notebook context first with `get_notebook`.
2. Identify whether the user needs a fresh run, a specific run status, or notebook run history.
3. If the notebook has inputs and the user supplied values, map values to the exact input `name` fields returned by `get_notebook`.
4. Check whether execution may mutate data, call external services, trigger schedules, or consume significant compute.
5. Use `create_run` only for full-notebook execution by `notebookId`; the hosted MCP server does not currently expose single-block execution.
6. If `create_run` returns an MCP error, report that error and stop; do not call `get_run` unless a run ID was returned.
7. Use `get_run` to inspect status, errors, completion time, and snapshot availability before reporting results. For routine status checks, omit `snapshotDelivery` so the default download URL delivery is used; request `snapshotDelivery: "inline"` when you need to inspect notebook outputs, snapshot errors, or result details.

Before starting a run, inspect the notebook for cells that print environment variables, secrets, credentials, or entire configuration objects. If found, warn the user and get explicit confirmation before running. Also warn before running notebooks that start servers, send bulk requests, call external services, or mutate data.

## Run History

Use `list_notebook_runs` when the user asks about recent runs, failed runs, run history, or anything older than the latest run metadata returned by `get_notebook`. The tool returns runs newest first with `runId`, `notebookId`, `status`, `createdAt`, `completedAt`, and `pagination`.

For short history requests, call `list_notebook_runs` with the default `pageSize` of 20. For broader audits, use `pageSize: 100` and follow `pagination.nextPageToken` while `pagination.hasMore` is true, stopping once you have enough evidence for the user's question.

Use `get_run` only after selecting a specific run that needs detail, snapshot availability, output inspection, or failure debugging. If the user asks "why did the last run fail?" and no run ID is provided, list recent runs first, pick the newest failed run, then call `get_run` for that run.

## Cached Integration Structure

Use `list_integrations` to resolve an integration name or type to an ID, then call `get_integration` for cached table structure. The response includes integration details plus `tables`, where each table has `name`, `schema`, optional `database`, and cached `columns` with names and database-native types.

Use `databaseName`, `schemaName`, and `tableName` filters when the user asks about a specific database, schema, or exact table. These filters apply to cached structure rows; an empty table list means no matching cached structure is visible through MCP, not proof that the live database has no such table.

When reporting cached structure, say it is cached. Do not present it as a fresh live database scan, and do not claim access to row previews or query results unless you obtained them from a notebook run snapshot or another exposed MCP tool.

## Notebook Run Inputs

`create_run` accepts an optional `inputs` object. Keys must be notebook input names from `get_notebook`, not labels or block IDs. Values must match the input block type:

- Text, textarea, file, date, slider, and single-select inputs use strings.
- Checkbox inputs use booleans.
- Multi-select inputs use arrays of strings.
- Date-range inputs use a string or an array of exactly two strings.
- Slider values must be numeric strings.

If the user provides a label instead of a name, inspect `get_notebook` inputs and map it to the closest input `name` only when the match is unambiguous. Otherwise ask for clarification. Run input values apply only to the new run and do not update the notebook's saved defaults.

## Run Snapshots

When `snapshotDelivery` is omitted, `get_run` returns `snapshotDownloadUrl` for available `.snapshot.deepnote` files and `snapshotContent: null`; this is equivalent to `snapshotDelivery: "downloadUrl"`. The URL is short-lived and grants access to the run snapshot, so do not paste it into the final answer unless the user asks for a download link or file handoff.

Use `snapshotDelivery: "inline"` when the user asks you to inspect outputs, summarize results, diagnose a failed run from snapshot details, map visible references from the snapshot, or otherwise reason over the snapshot content. Inline snapshots can be large and sensitive, so summarize the relevant blocks, outputs, failures, or data shape instead of dumping raw content.

If the current MCP tool schema does not expose `snapshotDelivery`, use the fields returned by `get_run` as-is and do not invent `snapshotContent` or `snapshotDownloadUrl`.

## Dataframe Outputs Are Paginated

A snapshot stores whatever the kernel produced, and for a dataframe the kernel produces one
page of rows. The block's `application/vnd.deepnote.dataframe.v3+json` output carries
`row_count` with the true total and a `rows` array holding only the current page, which
defaults to **10 rows**. A query ending in `LIMIT 100` still shows 10 rows in `rows` with
`row_count: 100`. The `text/plain` and `text/html` outputs on the same block are the library's
own truncated representations and are not fuller. No larger copy exists anywhere: fetching the
snapshot a different way returns the same 10 rows.

So when reporting results from a snapshot, read `row_count` alongside `rows` and say which one
you are quoting. Report counts, totals, and column structure from the output's own metadata,
and describe `rows` as a sample rather than the result set. Do not tell a user a query returned
10 rows when `row_count` says otherwise.

When the user needs the actual rows, two options exist and both act before the run:

- Have the notebook publish the data as a JSON output, which is not paginated:
  `display({'application/json': {'schema': 'my-result/v1', 'rows': df.to_dict('records')}}, raw=True)`.
  Keep the payload to what is genuinely needed; aggregate in the notebook.
- Create the block with `metadata.deepnote_table_state.pageSize` set to the row count the
  notebook returns. See `deepnote-notebook-editing`. `update_block` cannot change metadata, so
  an existing block must be recreated.

Row values inside `rows` are not type-stable: missing values arrive as strings, not `null`, and
every row carries a `_deepnote_index_column` that is not part of the data. `deepnote-dynamic-apps`
documents the encoding; apply the same care when quoting values out of a snapshot.

If the page reading these results is a published Deepnote site, use `deepnote-dynamic-apps`.

## Sensitive Outputs

When snapshot content, snapshot download URLs, or errors include sensitive, proprietary, personal, or production-like data, minimize exposure in the response. Summarize the result, shape, quality issues, aggregates, or failure mode instead of dumping raw records, presigned URLs, or long logs.

## Configuration Changes

The hosted Deepnote MCP server can create, inspect, attach, and detach integrations, and it can enable or disable static-site sharing and viewer API access. It cannot upload the website files behind a static site, and it cannot change schedules, permissions, environments, hardware, credentials, or secrets.

So do not claim to change package versions, environment images, hardware, credentials, secrets, scheduled runs, or permissions through MCP. Equally, do not tell a user that integration or static-site sharing changes are impossible through MCP; check the tools the connected server advertises in the current session, and use them if they are exposed.

## Reporting Results

For successful runs, include the executed notebook name or ID, run ID, status, any input overrides that are safe to mention, and the important result from inline snapshot content when you requested it. If you only have `snapshotDownloadUrl`, mention that a snapshot is available without exposing the URL by default. For failures, include concise error detail and the next fix to try. If a run fails before it starts, such as a workspace or parallel run limit, report the user-facing API error directly. Avoid pasting long logs unless the user asks for them.

Keep run reports brief and information-dense unless the user asks for detail. Prefer one compact run table plus the most important result or first actionable error. Do not paste long logs, raw snapshots, or full notebook outputs by default.

Prefer this run summary shape:

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

When inspecting a large run snapshot, request inline delivery only when necessary, then summarize block counts, failed blocks, final outputs, and the first actionable error instead of pasting the snapshot.
