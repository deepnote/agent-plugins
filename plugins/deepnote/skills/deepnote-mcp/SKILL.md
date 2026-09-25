---
name: deepnote-mcp
description: Use when a task mentions Deepnote, the Deepnote MCP server, Deepnote docs, projects, workspaces, notebooks, blocks, integrations, API keys, files, apps, or notebook runs. Shared rules for all Deepnote skills.
---

# Deepnote MCP

## When To Use Deepnote

Use the Deepnote MCP server as the primary interface for hosted Deepnote state. Prefer it over browser automation, screenshots, ad hoc HTTP calls, or local filesystem guesses whenever the user asks about Deepnote projects, notebooks, blocks, integrations, files, apps, search, or notebook runs.

If the Deepnote MCP server is not available in the current session, say that clearly and ask the user to connect or configure it. The hosted endpoint is `https://deepnote.com/mcp`; it accepts an OAuth sign-in or a Deepnote personal API key sent as a bearer token. Do not pretend to have inspected Deepnote state.

The plugin registers the hosted server under the MCP server id `deepnote`.

## Tool Catalogue

This is the authoritative summary of tool arguments. Workflow skills add only the constraints needed for their tasks.

- `get_me`: return the calling API key, creator user, workspace, and workspace access level.
- `search`: search workspace resources across projects, notebooks, blocks, and integrations.
- `list_folders`: list all workspace folders and their `parentFolderId` relationships, optionally filtered by `nameContains`.
- `list_projects`: list workspace projects, optionally filtered by name, with cursor pagination (`pageSize`, `pageToken`, `pagination.nextPageToken`, `pagination.hasMore`). Notebook rows expose `isInit`, `isScheduled`, and `lastRunAt`.
- `get_project`: get a project's type, folder, notebooks, attached integration summaries, recursive file inventory, static-site settings, `streamlitAppApiAccessEnabled`, and `environment` by `projectId`. `environment` is `null` when the project builds its image from a Dockerfile or has none set.
- `list_environments`: list the environments (Docker images) projects in the workspace can run on, Deepnote's and the workspace's custom ones, in one unpaginated response. Each has `id`, `name`, `image`, `type` (`deepnote` or `custom`), `language` (`python` or `r`), `isDefault` (one CPU and one GPU default), `isGpu`, and `isDeprecated`; deprecated environments keep working for projects already on them but should not be chosen. A custom image from a private registry is pulled only when its registry integration is attached to the project.
- `list_integrations`: list workspace integrations, optionally filtered by name or type.
- `get_integration`: get integration details and cached table structure, optionally filtered by `databaseName`, `schemaName`, or exact `tableName`.
- `list_integration_project_usages`: list projects connected to an integration, optionally narrowed to one `projectId`.
- `list_integration_notebook_usages`: list notebooks that contain SQL blocks using an integration, optionally narrowed to one `projectId`.
- `list_integration_block_usages`: list SQL blocks using an integration, optionally narrowed to one `projectId`.
- `create_integration`: create a workspace integration of an API-creatable type. Requires `name`, `type`, and connection `metadata`; requires workspace integration-management permission. The response repeats `metadata`, which can contain credentials.
- `attach_integration`: attach an integration to a project. Requires `integrationId` and `projectId`; returns a conflict if already attached.
- `detach_integration`: detach an integration from a project. Requires `integrationId` and `projectId`; returns a conflict if not attached.
- `create_project`: create a new project. Requires `name`; accepts optional `folderId`, `projectType` (`standard`, `notebook`, or `agent`; defaults to `standard`), and `environmentId` from `list_environments` (omitted means the default environment). The created project includes a default notebook.
- `create_notebook`: create an empty notebook inside a project. Requires `projectId`; accepts optional `name`. Does not accept starter blocks.
- `get_notebook`: get notebook details, blocks, input variables, and last-run metadata by notebook ID.
- `update_notebook`: rename a notebook. Requires `notebookId` and `name`; naming it `Init` designates the project init notebook. Rename is the only supported update.
- `duplicate_notebook`: duplicate a notebook inside its current project. Requires `notebookId`; it accepts no target-project or name argument and assigns a unique name.
- `create_block`: create a block in a notebook. Requires `notebookId` and `type`; accepts optional `content`, `metadata`, zero-based `position` (omitted means append), `includeNotebookBlockIds`, and SQL-only `integrationId`.
- `update_block`: replace an existing block's content and/or SQL integration. Requires `blockId`; accepts `content`, SQL-only `integrationId`, or both, and at least one of them.
- `delete_block`: permanently delete a block by `blockId`; an already deleted block returns not found.
- `reorder_notebook_blocks`: move one or more existing blocks. Requires `notebookId`, non-empty unique `blockIds` in the desired moved-block order, and `placement` of `{ "type": "start" }`, `{ "type": "end" }`, or `{ "type": "after", "blockId": "anchor-block-id" }`.
- `copy_file`: copy one file to a different project at the same normalized path. Requires `sourceProjectId`, `targetProjectId`, and `sourceFilePath`; it accepts no destination path and never overwrites.
- `publish_static_site`: publish files beneath a project's static-site root and enable sharing. Requires `projectId` and a non-empty `files` array of `{ path, content, encoding? }`; accepts optional `prune` and `apiAccess` (`enabled` or `disabled`), and returns the canonical URL.
- `update_project`: change a project's settings. Requires `projectId`, full access to the project, and at least one of `staticFiles`, `streamlitAppApiAccessEnabled`, or `environmentId`. `staticFiles` takes `sharingEnabled` and/or `apiAccessEnabled`; API access cannot be enabled while sharing is disabled. `streamlitAppApiAccessEnabled` lets the project's hosted Streamlit apps call the public API as their signed-in viewers. Changing `environmentId` (from `list_environments`) restarts a running machine in the background, which clears kernel state.
- `create_streamlit_app`: serve an existing project file as a Streamlit app. Requires `projectId` and project-relative `entrypoint`; returns the app record and URL.
- `list_streamlit_apps`: list all Streamlit apps served by a project. Requires `projectId`; the response is unpaginated.
- `get_streamlit_app_status`: return `running`, `starting`, or `unavailable` for a `streamlitAppId`.
- `generate_project_url`: return a canonical absolute project or notebook URL. Accepts `projectId`, `notebookId`, or both, and requires at least one; when both are supplied, the notebook must belong to that project.
- `create_run`: start a notebook run by `notebookId`. It accepts optional `inputs` keyed by notebook input name, `detached` (default `true`), `detachedRunStorageMode` (`read_write` or `readonly`, detached runs only), a non-empty unique `blockIds` list (live runs only), and `runDependentBlocks` (requires `blockIds`). For targeted execution, set `detached: false` and pass `blockIds`; omit `blockIds` to run the full notebook.
- `list_notebook_runs`: list historical notebook runs newest first, with `pageSize` (default 20) and `pageToken` pagination. Rows carry `runId`, `notebookId`, `status`, `createdAt`, and `completedAt`.
- `get_run`: fetch run `status`, `error`, `createdAt`, `completedAt`, and run snapshots. Optional `snapshotDelivery` is `"downloadUrl"` (the default when omitted), `"inline"`, or `"blocks"`.
- `list_docs`: return the Deepnote docs navigation tree.
- `get_doc`: fetch a Deepnote documentation article by slug.

Before telling a user that a Deepnote action is impossible, check the tools the connected server actually advertises, and never claim to have used a tool that is not exposed there.

## General Rules

1. Use `get_me` when workspace identity, caller role, or API key context would help the answer or troubleshooting.
2. Resolve ambiguous project, folder, notebook, block, integration, or environment names with `search`, `list_projects`, `list_folders`, `list_integrations`, or `list_environments` before acting on them.
3. For complete inventories, page `list_projects` or `list_notebook_runs` with `pageSize: 100` and follow `pagination.nextPageToken` while `pagination.hasMore` is true. Stop early when the user only needs a sample or a filtered answer. Treat page tokens as opaque and tied to the original filters.
4. Use `get_project` for project-wide notebook, integration, file, or static-site state. Call `get_notebook` before reasoning about, editing, or running an existing notebook.
5. Report results with Deepnote object names and IDs when useful, and surface execution errors, missing permissions, input validation errors, or unavailable MCP capabilities.
6. For Deepnote product or API how-to questions, ground the answer in current docs: `list_docs` to find the section and slug, then `get_doc` to fetch the article. Answer concisely and name the doc title or slug you used.

## Safety Rules

- Do not expose bearer tokens, integration credentials, or secret notebook input values. Refer to secret names only, and never repeat connection `metadata` returned by `create_integration`.
- Avoid downloading or printing large datasets. Sample, summarize, or aggregate unless the user explicitly asks for an export.
- Do not paste `snapshotDownloadUrl` values into answers unless the user asks for a download or file handoff. Snapshot handling is defined in `deepnote-runs`.
- Treat notebook execution as potentially stateful and costly.
- Treat resource creation, notebook duplication or renaming, block edits or deletion, file copies, integration creation or attachment changes, app creation, static-site publishing or sharing changes, and other project setting changes as persistent writes. Do them only when the user asked, resolve targets carefully, and report affected IDs.
- If a tool returns `isError`, surface the user-facing error message concisely.
- Capability boundary: the hosted server can create projects, notebooks, blocks, integrations, and Streamlit apps; rename and duplicate notebooks; update, reorder, and delete blocks; copy existing files between projects; attach and detach integrations; publish or change access to static sites; and change a project's Streamlit app API access and environment. It cannot upload arbitrary project files, delete projects, notebooks, or Streamlit apps, move notebooks between projects, create custom environments, or change schedules, permissions, hardware, package versions, credentials, or secrets. Check the advertised tools before relying on this boundary.

## Response Style

Keep responses grounded in Deepnote state: project name, notebook name, block labels, execution or app status, and relevant links when the MCP server provides them or when `deepnote-links` can build them safely. If a task cannot be completed through the Deepnote MCP server, explain the missing capability and offer the nearest safe next step.

Default to brief, information-dense answers. Lead with the answer, use tables, counts, and status labels, and include only the highest-signal findings. Do not include long explanations, raw snapshots, presigned snapshot URLs, full block contents, integration metadata, or exhaustive inventories unless the user asks for more detail. When MCP does not expose a detail, say `Not visible via MCP` rather than inferring it from names.
