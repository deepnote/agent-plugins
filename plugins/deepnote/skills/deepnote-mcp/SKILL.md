---
name: deepnote-mcp
description: Use when a task mentions Deepnote, the Deepnote MCP server, Deepnote docs, projects, workspaces, notebooks, blocks, integrations, API keys, or notebook runs. Shared rules for all Deepnote skills.
---

# Deepnote MCP

## When To Use Deepnote

Use the Deepnote MCP server as the primary interface for hosted Deepnote state. Prefer it over browser automation, screenshots, ad hoc HTTP calls, or local filesystem guesses whenever the user asks about Deepnote projects, notebooks, blocks, integrations, search, or notebook runs.

If the Deepnote MCP server is not available in the current session, say that clearly and ask the user to connect or configure it. The hosted endpoint is `https://deepnote.com/mcp`; it accepts an OAuth sign-in or a Deepnote personal API key sent as a bearer token. Do not pretend to have inspected Deepnote state.

The plugin registers the hosted server under the MCP server id `deepnote`.

## Tool Catalogue

This is the only place that documents tool arguments. The other Deepnote skills refer to tools by name.

- `get_me`: return the calling API key, creator user, workspace, and workspace access level.
- `search`: search workspace resources across projects, notebooks, blocks, and integrations.
- `list_projects`: list workspace projects, optionally filtered by name, with cursor pagination (`pageSize`, `pageToken`, `pagination.nextPageToken`, `pagination.hasMore`). Notebook rows expose `isInit`, `isScheduled`, and `lastRunAt`.
- `list_integrations`: list workspace integrations, optionally filtered by name or type.
- `get_integration`: get integration details and cached table structure, optionally filtered by `databaseName`, `schemaName`, or exact `tableName`.
- `list_integration_project_usages`: list projects connected to an integration, optionally narrowed to one `projectId`.
- `list_integration_notebook_usages`: list notebooks that contain SQL blocks using an integration, optionally narrowed to one `projectId`.
- `list_integration_block_usages`: list SQL blocks using an integration, optionally narrowed to one `projectId`.
- `get_notebook`: get notebook details, blocks, input variables, and last-run metadata by notebook ID.
- `create_project`: create a new project. Requires `name`; accepts optional `folderId` and `projectType` (`standard`, `notebook`, or `agent`; defaults to `standard`). The created project includes a default notebook.
- `create_notebook`: create an empty notebook inside a project. Requires `projectId`; accepts optional `name`. Does not accept starter blocks.
- `create_block`: create a block in a notebook. Requires `notebookId` and `type`; accepts optional `content`, `metadata`, zero-based `position` (omitted means append), `includeNotebookBlockIds`, and SQL-only `integrationId`.
- `update_block`: replace an existing block's content and/or SQL integration. Requires `blockId`; accepts `content`, SQL-only `integrationId`, or both, and at least one of them.
- `reorder_notebook_blocks`: move one or more existing blocks. Requires `notebookId`, non-empty unique `blockIds` in the desired moved-block order, and `placement` of `{ "type": "start" }`, `{ "type": "end" }`, or `{ "type": "after", "blockId": "anchor-block-id" }`.
- `create_run`: start a notebook run by `notebookId`. It accepts optional `inputs` keyed by notebook input name, `detached` (default `true`), `detachedRunStorageMode` (`read_write` or `readonly`, detached runs only), a non-empty unique `blockIds` list (live runs only), and `runDependentBlocks` (requires `blockIds`). For targeted execution, set `detached: false` and pass `blockIds`; omit `blockIds` to run the full notebook.
- `list_notebook_runs`: list historical notebook runs newest first, with `pageSize` (default 20) and `pageToken` pagination. Rows carry `runId`, `notebookId`, `status`, `createdAt`, and `completedAt`.
- `get_run`: fetch run `status`, `error`, `createdAt`, `completedAt`, and run snapshots. Optional `snapshotDelivery` is `"downloadUrl"` (the default when omitted), `"inline"`, or `"blocks"`.
- `list_docs`: return the Deepnote docs navigation tree.
- `get_doc`: fetch a Deepnote documentation article by slug.

This list is a documented subset, not a complete inventory. Before telling a user that a Deepnote action is impossible, check the tools the connected server actually advertises in the current session, and never claim to have used a tool that is not exposed there.

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
- Treat notebook execution as potentially stateful and costly.
- Treat creating, updating, reordering, and deleting blocks, creating projects and notebooks, attaching or detaching integrations, and changing static-site sharing as persistent write actions. Do them only when the user asked for that change, resolve targets carefully, and report affected IDs.
- If a tool returns `isError`, surface the user-facing error message concisely.
- Capability boundary: the hosted server can create projects, notebooks, and blocks, update, reorder, and delete blocks, rename and duplicate notebooks, create, inspect, attach, and detach integrations, and enable or disable static-site sharing and viewer API access. `publish_static_site` writes only beneath the static-site root. It cannot upload arbitrary project files or change schedules, permissions, environments, hardware, package versions, credentials, or secrets. Do not claim to have changed any of those through MCP, and do not tell a user that something is impossible without checking the advertised tools first.

## Response Style

Keep responses grounded in Deepnote state: project name, notebook name, block labels, execution status, and relevant links when the MCP server provides them or when `deepnote-links` can build them safely. If a task cannot be completed through the Deepnote MCP server, explain the missing capability and offer the nearest safe next step.

Default to brief, information-dense answers. Lead with the answer, use tables, counts, and status labels, and include only the highest-signal findings. Do not include long explanations, raw snapshots, presigned snapshot URLs, full block contents, or exhaustive notebook lists unless the user asks for more detail. When MCP does not expose a detail, say `Not visible via MCP` rather than inferring it from names.
