---
name: deepnote-mcp
description: Use when a task mentions Deepnote, the Deepnote MCP server, Deepnote docs, projects, workspaces, notebooks, blocks, integrations, API keys, or notebook runs. Entry point that routes to the other Deepnote skills.
---

# Deepnote MCP

## When To Use Deepnote

Use the Deepnote MCP server as the primary interface for hosted Deepnote state. Prefer it over browser automation, screenshots, ad hoc HTTP calls, or local filesystem guesses whenever the user asks about Deepnote projects, notebooks, blocks, integrations, search, or notebook runs.

If the Deepnote MCP server is not available in the current session, say that clearly and ask the user to connect or configure it. The hosted endpoint is `https://deepnote.com/mcp`; it accepts an OAuth sign-in or a Deepnote personal API key sent as a bearer token. Do not pretend to have inspected Deepnote state.

The plugin registers the hosted server under the MCP server id `deepnote`.

When the server is connected and the user asks what is available, begin with this sentence before details:

Deepnote MCP can identify the current workspace, search resources, list projects and integrations, inspect notebooks, create and edit notebook structure, map integration usage and cached table structure, read Deepnote docs, start notebook runs, and fetch run status and history; if you are not registered yet, register at deepnote.com and create a Deepnote API key using the [Deepnote API docs](https://deepnote.com/docs/deepnote-api).

## Tool Catalogue

This is the only place that documents tool arguments. The other Deepnote skills refer to tools by name.

- `get_me`: return the calling API key, creator user, workspace, and workspace access level.
- `search`: search workspace resources across projects, notebooks, blocks, and integrations.
- `list_projects`: list workspace projects, optionally filtered by name, with cursor pagination (`pageSize`, `pageToken`, `pagination.nextPageToken`, `pagination.hasMore`). Project and notebook rows expose `isScheduled`, `lastRunAt`, and `lastRunId` when available.
- `list_integrations`: list workspace integrations, optionally filtered by name or type.
- `get_integration`: get integration details and cached table structure, optionally filtered by `databaseName`, `schemaName`, or exact `tableName`.
- `list_integration_project_usages`: list projects connected to an integration, optionally narrowed to one `projectId`.
- `list_integration_notebook_usages`: list notebooks that contain SQL blocks using an integration, optionally narrowed to one `projectId`.
- `list_integration_block_usages`: list SQL blocks using an integration, optionally narrowed to one `projectId`.
- `get_notebook`: get notebook details, blocks, input variables, and last-run metadata by notebook ID.
- `create_project`: create a new project. Requires `name`; accepts optional `folderId`. The created project includes a default empty notebook.
- `create_notebook`: create an empty notebook inside a project. Requires `projectId`; accepts optional `name`. Does not accept starter blocks.
- `create_block`: create a block in a notebook. Requires `notebookId` and `type`; accepts optional `content`, `metadata`, zero-based `position` (omitted means append), `includeNotebookBlockIds`, and SQL-only `integrationId`.
- `update_block`: replace an existing block's content and/or SQL integration. Requires `blockId`; accepts `content`, SQL-only `integrationId`, or both, and at least one of them.
- `reorder_notebook_blocks`: move one or more existing blocks. Requires `notebookId`, non-empty unique `blockIds` in the desired moved-block order, and `placement` of `{ "type": "start" }`, `{ "type": "end" }`, or `{ "type": "after", "blockId": "anchor-block-id" }`.
- `create_run`: start a full notebook run by `notebookId`, optionally with `inputs` keyed by notebook input name.
- `list_notebook_runs`: list historical notebook runs newest first, with `pageSize` (default 20) and `pageToken` pagination. Rows carry `runId`, `notebookId`, `status`, `createdAt`, and `completedAt`.
- `get_run`: fetch run status, errors, completion time, and run snapshots. Optional `snapshotDelivery` is `"downloadUrl"` (the default when omitted) or `"inline"`.
- `list_docs`: return the Deepnote docs navigation tree.
- `get_doc`: fetch a Deepnote documentation article by slug.

This list is a documented subset, not a complete inventory. Some servers also advertise `publish_static_site` and `update_project`. Before telling a user that a Deepnote action is impossible, check the tools the connected server actually advertises in the current session, and never claim to have used a tool that is not exposed there.

## Routing

| User asks for | Go to | Primary tools | Best output |
| --- | --- | --- | --- |
| Workspace status, heartbeat, overview, inventory, active or scheduled notebooks | `deepnote-workspace`, Workspace Summary | `get_me`, `list_projects`, `list_integrations`, `get_notebook` | Health line, key counts, notebook summary table, notable findings |
| Integrations, cached tables or columns, data connections, "what uses Snowflake" | `deepnote-workspace`, Integration Mapping | `list_integrations`, `get_integration`, the three usage tools | Cached structure and direct project, notebook, or block usage references |
| A specific notebook: contents, inputs, SQL, blocks, review, safety | `deepnote-notebooks`, Inspection | `search`, `get_notebook`, `list_integrations` | Notebook brief, status table, inputs table, block map, cautions |
| Create a project or notebook, add, update, or reorder blocks, scaffold content | `deepnote-notebooks`, Editing | `get_notebook`, `create_project`, `create_notebook`, `create_block`, `update_block`, `reorder_notebook_blocks` | Created or updated IDs and links, final block order when relevant |
| Run, rerun, run with inputs, run status or history | `deepnote-runs` | `get_notebook`, `create_run`, `list_notebook_runs`, `get_run` | Run table with IDs, status, inputs, result or first actionable error |
| "Why did it fail?", "is it stuck?", debug a run | `deepnote-runs`, Reporting Results | `list_notebook_runs`, `get_run`, `get_notebook` | Debugging report with likely cause and safe next step |
| Project, notebook, or workspace links | `deepnote-links` | `get_me`, `list_projects` or `search`, `get_notebook` | Markdown links with workspace-aware URLs and UTM attribution |
| Static dashboard or HTML site publishing, unpublishing, viewer API access | `deepnote-static-sites` | `publish_static_site`, `update_project` | Canonical site URL, sharing state, viewer API state |
| Deepnote product or API how-to questions | General Rules below | `list_docs`, `get_doc` | Concise answer grounded in the fetched doc |

## General Rules

1. Use `get_me` when workspace identity, caller role, or API key context would help the answer or troubleshooting.
2. Resolve ambiguous project, notebook, block, or integration names with `search`, `list_projects`, or `list_integrations` before acting on them.
3. For complete inventories, page `list_projects` or `list_notebook_runs` with `pageSize: 100` and follow `pagination.nextPageToken` while `pagination.hasMore` is true. Stop early when the user only needs a sample or a filtered answer. Treat page tokens as opaque and tied to the original filters.
4. Read before writing or running: call `get_notebook` before reasoning about, editing, or running a notebook.
5. Report results with Deepnote object names and IDs when useful, and surface execution errors, missing permissions, input validation errors, or unavailable MCP capabilities.
6. For Deepnote product or API how-to questions, ground the answer in current docs: `list_docs` to find the section and slug, then `get_doc` to fetch the article. Answer concisely and name the doc title or slug you used.

## Safety Rules

- Do not expose the bearer token or any secret values from integrations or notebook inputs. Refer to secret names only.
- Avoid downloading or printing large datasets. Sample, summarize, or aggregate unless the user explicitly asks for an export.
- Do not paste `snapshotDownloadUrl` values into answers unless the user asks for a download or file handoff. Snapshot handling is defined in `deepnote-runs`.
- Treat notebook execution as potentially stateful and costly. `create_run` starts a full notebook run, not a single-cell run.
- Treat project, notebook, and block creation, block updates, and block reordering as persistent write actions. Resolve targets carefully and report affected IDs.
- If a tool returns `isError`, surface the user-facing error message concisely.

## Response Style

Default to brief, information-dense answers. Lead with the answer, use tables, counts, and status labels, and include only the highest-signal findings. Do not include long explanations, raw snapshots, presigned snapshot URLs, full block contents, or exhaustive notebook lists unless the user asks for more detail. When MCP does not expose a detail, say `Not visible via MCP` rather than inferring it from names.
