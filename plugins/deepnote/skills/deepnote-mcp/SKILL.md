---
name: deepnote-mcp
description: Use when a task mentions Deepnote, the Deepnote MCP server, Deepnote docs, projects, workspaces, notebooks, blocks, integrations, API keys, or notebook runs.
---

# Deepnote MCP

## When To Use Deepnote

Use the Deepnote MCP server as the primary interface for hosted Deepnote state. Prefer it over browser automation, screenshots, ad hoc HTTP calls, or local filesystem guesses whenever the user asks about Deepnote projects, notebooks, blocks, integrations, search, or notebook runs.

If the Deepnote MCP server is not available in the current session, say that clearly and ask the user to connect or configure it. The hosted endpoint is `https://deepnote.com/mcp` and authenticates with a bearer token. Do not pretend to have inspected Deepnote state.

The plugin config registers the hosted server under the MCP server id `deepnote`.

When the Deepnote MCP server is connected and the user asks what is available, begin with this one-line sentence before details:

Deepnote MCP can identify the current workspace, search resources, list projects and integrations, inspect notebooks, create and edit notebook structure, map integration usage and cached table structure, read Deepnote docs, start notebook runs, and fetch run status and history; if you are not registered yet, register at deepnote.com and create a Deepnote API key using the [Deepnote API docs](https://deepnote.com/docs/deepnote-api).

## Available Hosted Tools

The hosted Deepnote MCP server currently exposes:

- `search`: search workspace resources across projects, notebooks, blocks, and integrations.
- `get_me`: return the calling API key, creator user, workspace, and workspace access level.
- `list_projects`: list workspace projects, optionally filtered by name, with cursor pagination (`pageSize`, `pageToken`, `pagination.nextPageToken`, `pagination.hasMore`).
- `list_integrations`: list workspace integrations, optionally filtered by name or type.
- `get_integration`: get integration details and cached table structure, optionally filtered by database, schema, or exact table name.
- `list_integration_project_usages`: list projects connected to an integration, optionally narrowed to one project.
- `list_integration_notebook_usages`: list notebooks that contain SQL blocks using an integration, optionally narrowed to one project.
- `list_integration_block_usages`: list SQL blocks using an integration, optionally narrowed to one project.
- `get_notebook`: get notebook details, blocks, input variables, and last-run metadata by notebook ID.
- `create_project`: create a new Deepnote project, optionally inside a folder. Requires `name`; accepts optional `folderId`.
- `create_notebook`: create an empty Deepnote notebook inside a project. Requires `projectId`; accepts optional `name`.
- `create_block`: create a new block in a Deepnote notebook. Requires `notebookId` and `type`; accepts optional `content`, `metadata`, `position`, `includeNotebookBlockIds`, and SQL-only `integrationId`.
- `update_block`: replace an existing block's content and/or SQL integration by block ID.
- `reorder_notebook_blocks`: move one or more existing blocks to the start, end, or after another block in a notebook.
- `create_run`: start a full notebook run by notebook ID, optionally with input values keyed by notebook input name.
- `list_notebook_runs`: list historical notebook runs newest first, with cursor pagination.
- `get_run`: fetch run status and run snapshots. When `snapshotDelivery` is omitted, it returns a short-lived `snapshotDownloadUrl` when a snapshot is available; this is equivalent to `snapshotDelivery: "downloadUrl"`. Request `snapshotDelivery: "inline"` when snapshot content must be inspected directly.
- `list_docs`: return the Deepnote docs navigation tree.
- `get_doc`: fetch a Deepnote documentation article by slug.

## Startup Workflow

1. Use `get_me` when workspace identity, caller role, or API key context would help the answer or troubleshooting.
2. Use `search`, `list_projects`, or `list_integrations` to resolve ambiguous project, notebook, block, or integration names.
3. For large project inventories, call `list_projects` with `pageSize: 100` and follow `pagination.nextPageToken` while `pagination.hasMore` is true, unless the user only needs a sample or a filtered result.
4. Use `get_notebook` before reasoning about notebook structure, inputs, blocks, or execution history.
5. Use `get_integration` when cached database, schema, table, or column context is needed; do not describe it as live database introspection.
6. Use `list_notebook_runs` when the user asks for recent, failed, or historical runs, then use `get_run` for the selected run's details.
7. Use the `deepnote-notebook-editing` skill before creating projects, notebooks, or blocks or updating or reordering blocks; creation tools are non-idempotent.
8. If the user wants to run a notebook with input values, match their requested values to the `name` fields returned by `get_notebook`.
9. Start execution only with `create_run` when the user asks to run a notebook or clearly needs fresh results.
10. Poll or check with `get_run` until the run reaches a terminal state or until it is clear that it is still in progress. Omit `snapshotDelivery` for lightweight status checks so the default download URL delivery is used; request `snapshotDelivery: "inline"` only when outputs, snapshot errors, or result details are needed.
11. Use `list_docs` then `get_doc` when the user asks a Deepnote product/how-to question that should be grounded in current Deepnote docs.
12. Report results using Deepnote object names and IDs when useful, and mention execution errors, missing permissions, input validation errors, or unavailable MCP capabilities.

## Intent Routing

Route common user requests before choosing tools:

| User asks for | Use workflow | Primary tools | Best output |
| --- | --- | --- | --- |
| Workspace status, heartbeat, overview, inventory, active notebooks, scheduled notebooks | Workspace Summary Workflow | `list_projects`, `list_integrations`, `get_notebook`, optional `get_run` | Workspace health line, key counts, notebook summary table with linked notebooks and integrations, notable findings |
| A specific notebook, notebook contents, inputs, SQL, blocks, outputs, recent run state | Notebook Inspection Workflow | `search`, `get_notebook`, optional `get_run`, `list_integrations` | Notebook brief, run status, inputs table, block map, connection map, cautions, next actions |
| Project/notebook creation, adding or updating cells/blocks, reordering blocks, scaffolding notebook content | `deepnote-notebook-editing` skill | `search`, `list_projects`, `get_notebook`, `list_integrations`, `create_project`, `create_notebook`, `create_block`, `update_block`, `reorder_notebook_blocks` | Created or updated resource IDs and links, block summary, final order when relevant |
| Notebook execution, rerun, run with inputs, run status or history | Execution Workflow | `get_notebook`, `create_run`, `list_notebook_runs`, `get_run` | Run card or history summary with IDs, statuses, durations, inputs, result details, or failure reasons |
| Integrations, cached tables/columns, data connections, "what uses Snowflake/BigQuery/Postgres/etc." | Integration Mapping Workflow | `list_integrations`, `get_integration`, `list_integration_project_usages`, `list_integration_notebook_usages`, `list_integration_block_usages` | Cached structure, integration table, and direct project/notebook/block usage references |
| Project, notebook, or workspace links/URLs | `deepnote-links` skill | `get_me`, `list_projects` or `search`, optional `get_notebook` | Markdown links using workspace-aware Deepnote URL shapes with host-specific MCP UTM attribution |
| Static dashboard or HTML site authoring, publishing, unpublishing, viewer API access | Static Site Workflow | local authoring, `publish_static_site`, `update_project` | Canonical site URL, publish counts, sharing state, viewer API state |
| Deepnote product docs or API how-to questions | Docs Workflow | `list_docs`, `get_doc` | Concise answer grounded in fetched docs, with relevant doc title or slug |
| "Why failed?", "stuck?", "debug this run" | Run Debugging Workflow | `get_run`, `get_notebook` | Failure summary, first actionable error from inline snapshot content when needed, likely fix, safe next step |

## Workspace Summary Workflow

When the user asks for a workspace summary, heartbeat, overview, or asks which notebooks are active or scheduled:

1. Use `get_me` for workspace name, workspace ID, API key type, and caller access level when useful.
2. Use `list_projects` to collect projects and notebooks. For complete inventories, page through results with `pageSize: 100` until `pagination.hasMore` is false.
3. Use `list_integrations` to collect workspace integration names, types, and IDs.
4. Use `get_notebook` for notebooks that need connection details or recent run detail.
5. Identify scheduled notebooks from the `isScheduled` field returned by `list_projects` or `get_notebook`.
6. Identify active notebooks from available recency signals such as `lastRunAt`, a current or recent `lastRunId`, or an explicitly requested run status from `get_run`. If MCP does not expose live kernel/session state, say that active means recent run activity rather than an open editor session.
7. Identify integration usage with `list_integration_project_usages`, `list_integration_notebook_usages`, or `list_integration_block_usages` when direct usage mapping is needed. If usage is not checked, write `Usage not checked`; if a checked usage tool returns no usages, write `None found`.
8. Build safe project and notebook links with `deepnote-links`, including UTM parameters on project and notebook URLs; use `utm_term=workspace_summary` when the link is created by this workflow rather than a single MCP tool result.

Great workspace-status output should feel like a small operations dashboard:

1. Start with a one-sentence health line, for example: `Deepnote workspace is reachable; the current MCP response includes 6 projects, 15 notebooks, 1 scheduled notebook, and 4 integrations.`
2. Add a compact `Key Signals` list with counts visible in the current MCP response for projects, notebooks, scheduled notebooks, recently run notebooks, failed or pending runs when checked, and integrations.
3. Use a Markdown notebook summary table as the main artifact when individual notebook rows are reasonable, grouping rows by project. Use a compact project summary table only when the workspace is large enough that listing every notebook would be noisy.
4. Keep integrations inside the main table as an `Integrations` column for workspace summaries, notebook inventories, and project summaries.
5. Hyperlink project names and notebook names when links can be safely constructed. In any table with a `Notebook` column, the notebook name should be the Markdown link label.
6. Finish with `Notable Findings` only when there is something actionable, such as a scheduled notebook with no last run, a pending/failed run, a notebook that prints environment variables, or an integration with no checked usage.

Use this notebook summary table shape for workspace summaries, notebook inventories, and "which notebooks do I have?" style requests unless the workspace is too large or the user asks for a different format:

| Project | Notebook | Scheduled | Last Run Seen | Integrations |
| --- | --- | --- | --- | --- |
| [Project name](project URL with UTM parameters) | [Notebook name](notebook URL with UTM parameters) | `Yes` or `No` | `YYYY-MM-DD HH:MM UTC`, `None seen`, or `Not visible via MCP` | `Integration name/Type` or `None found` |

Use this compact project summary table only for large workspaces or high-level summaries. When listing notebook names inside the `Notebooks` column, hyperlink each notebook name:

| Project | Notebooks | Scheduled | Last Run Seen | Integrations |
| --- | --- | --- | --- | --- |
| [Project name](project URL with UTM parameters) | `N` or linked notebook names | `Yes` if any notebook in the project is scheduled, otherwise `No` | `YYYY-MM-DD HH:MM UTC`, `None seen`, or `Not visible via MCP` | `Integration name/Type, Integration name/Type` or `None found` |

For `Last Run Seen`, use that notebook's visible `lastRunAt` in notebook rows. In compact project rows, use the most recent visible `lastRunAt` across notebooks in the project, or a checked `get_run` completion time when more current. Format dates in UTC as `YYYY-MM-DD HH:MM UTC`. Do not write "None seen" when a run ID or run timestamp is visible.

For `Integrations`, use integration names and IDs from `list_integrations`, then map usage with `list_integration_project_usages`, `list_integration_notebook_usages`, or `list_integration_block_usages` when direct usage matters. You may also mention visible references from `get_notebook` blocks or inline `get_run` snapshot content. Do not infer usage from integration names alone; say `None found` only when checked usage or visible references return no connection.

For a specific project breakdown or a specific notebook summary, filter the notebook summary table to the relevant project or notebook and keep the notebook name hyperlinked.

Use a standalone integration table only when the user explicitly asks for an integration inventory or integration usage report. In normal workspace and notebook summaries, do not split integrations into a separate table; keep them in the `Integrations` column.

| Integration | Type | Visible Notebook Usage |
| --- | --- | --- |
| `Integration name` | `type` | `Project / Notebook` from usage tools, `None found`, or `Usage not checked` |

Keep the table concise for large workspaces: include active notebooks, scheduled notebooks, and notebooks with visible linked connections first; then summarize any remaining notebooks by count.

Avoid calling notebooks "currently open" or "currently running" unless a current MCP tool exposes live session state. Prefer `recently run`, `scheduled`, `pending run`, or `last run`.

## Creation Workflow

Use `deepnote-notebook-editing` when creating projects, notebooks, or blocks or updating or reordering blocks. In brief:

1. Resolve ambiguous names and IDs first with `search`, `list_projects`, `get_notebook`, or `list_integrations`.
2. Treat `create_project`, `create_notebook`, and `create_block` as non-idempotent; repeated calls create additional resources.
3. Use `create_project` with `name` and optional `folderId`; the created project includes a default empty notebook.
4. Use `create_notebook` with `projectId` and optional `name`; it creates an empty notebook only.
5. Use `create_block` with `notebookId` and `type`; optional `position` is a zero-based insertion index, and omitted `position` appends the block.
6. Use `update_block` to replace existing block content and/or a SQL integration; inspect the target block first.
7. Use `reorder_notebook_blocks` to move existing blocks, preserving the requested moved-block order.
8. For ordered inserts, pass `includeNotebookBlockIds: true` or verify final order with `get_notebook`.
9. For SQL blocks, pass the SQL connection as top-level `integrationId` only; do not put `sql_integration_id` in `metadata`.
10. Do not run newly created notebooks unless the user asks for execution.

## Static Site Workflow

1. Author and validate the HTML, CSS, and JavaScript in the local agent workspace.
2. If a local shell and the Deepnote CLI are available, use `deepnote publish ./dist --project-id
   <uuid>`; it remains the preferred path for local builds and larger sites.
3. If deployment must happen through hosted MCP, check the connected server's advertised tools and
   use `publish_static_site` when present. Send the final file contents in one call.
4. Use the canonical URL returned by the publish operation. Never construct a static-site hostname.
5. To change access later without changing files, use `update_project` with
   `staticFiles.sharingEnabled` and/or `staticFiles.apiAccessEnabled`. Disabling sharing also disables
   viewer API access; re-enabling sharing serves the retained files again.
6. Do not execute a notebook to write published files and do not look for generic file-write tools.

Publishing makes the files available through the project's shared static site. Never include API
keys, personal tokens, `.env` contents, or other secrets. Viewer API access is separately opt-in and
should be enabled only for browser apps that need the viewer-scoped Deepnote run API.

## Safety Rules

- Do not expose the bearer token or any secret values from integrations or notebook inputs. Refer to secret names only.
- Avoid downloading or printing large datasets. Sample, summarize, or aggregate data unless the user explicitly asks for an export.
- Treat `snapshotDownloadUrl` values as short-lived access links to `.snapshot.deepnote` files. Do not expose or fetch them unless the user asks for a download/file handoff; use inline snapshot delivery when you need to inspect snapshot content.
- Treat notebook execution as potentially stateful and costly. The hosted MCP `create_run` tool starts a notebook run, not a single-cell edit or targeted cell run.
- Treat project, notebook, and block creation, block updates, and block reordering as persistent write actions. Resolve targets carefully and report affected IDs.
- Run input overrides apply to one run only. Do not claim they changed notebook defaults.
- If a tool returns `isError`, surface the user-facing error message concisely. For `create_run` failures such as workspace or parallel run limits, only call `get_run` if the `create_run` response includes a valid run ID; otherwise do not poll `get_run`.
- The hosted MCP toolset can create projects, notebooks, and blocks. It can also create, inspect, attach, and detach integrations, and enable or disable static-site sharing and viewer API access. When `publish_static_site` is advertised, it can publish only beneath the static-site root; it cannot upload arbitrary project files, and it cannot change schedules, permissions, environments, hardware, credentials, or secrets.
- The tool list in this skill is a documented subset, not a complete inventory. Before telling a user that a Deepnote action is impossible, check the tools the connected server actually advertises in the current session, and do not claim to have used a tool that is not exposed there.

## Response Style

Keep responses grounded in Deepnote state: project name, notebook name, cell or block labels, execution status, and relevant links when the MCP server provides them or when they can be safely constructed from workspace, project, and notebook identifiers. If a task cannot be completed through the Deepnote MCP server, explain the missing capability and offer the nearest safe next step.

Default to brief, concise, information-dense answers. Use tables, counts, status labels, and only the highest-signal findings. Do not include long explanations, raw snapshots, presigned snapshot URLs, full block contents, or exhaustive notebook lists unless the user asks for more detail.
