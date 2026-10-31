---
name: deepnote-mcp
description: Use when a task mentions Deepnote, the Deepnote MCP server, Deepnote docs, projects, workspaces, notebooks, blocks, integrations, API keys, files, apps, or notebook runs. Shared rules for all Deepnote skills.
---

# Deepnote MCP

## When To Use Deepnote

Use the Deepnote MCP server as the primary interface for hosted Deepnote state. Prefer it over browser automation, screenshots, ad hoc HTTP calls, or local filesystem guesses whenever the user asks about Deepnote projects, notebooks, blocks, integrations, files, apps, search, or notebook runs. The one exception is previewing a data app page locally with the script in `deepnote-data-apps`.

If the Deepnote MCP server is not available in the current session, say that clearly and ask the user to connect or configure it. The hosted endpoint is `https://deepnote.com/mcp`; it accepts an OAuth sign-in or a Deepnote personal API key sent as a bearer token. Do not pretend to have inspected Deepnote state.

The plugin registers the hosted server under the MCP server id `deepnote`.

## Tool Catalogue

This is the authoritative summary of tool arguments. Workflow skills add only the constraints needed for their tasks.

- `get_me`: return the calling API key, creator user, workspace, and workspace access level.
- `search`: search workspace resources across projects, notebooks, blocks, and integrations.
- `list_folders`: list all workspace folders and their `parentFolderId` relationships, optionally filtered by `nameContains`.
- `list_projects`: list workspace projects, optionally filtered by name, with cursor pagination (`pageSize`, `pageToken`, `pagination.nextPageToken`, `pagination.hasMore`). Notebook rows expose `isInit`, `isScheduled`, and `lastRunAt`.
- `get_project`: get a project's type, folder, notebooks, attached integration summaries, recursive file inventory, data app settings (`staticFiles`), `streamlitAppApiAccessEnabled`, and environment (Docker image) by `projectId`. `environment` is `null` when the project builds its image from a Dockerfile or has none set.
- `list_environments`: list the environments (Docker images) projects in the workspace can run on, Deepnote's and the workspace's custom ones, in one unpaginated response. Each has `id`, `name`, `image`, `type` (`deepnote` or `custom`), `language` (`python` or `r`), `isDefault` (one CPU and one GPU default), `isGpu`, and `isDeprecated`; deprecated environments keep working for projects already on them but should not be chosen. A custom image from a private registry is pulled only when its registry integration is attached to the project.
- `list_integrations`: list workspace integrations, optionally filtered by name or type.
- `get_integration`: get integration details and cached table structure, optionally filtered by `databaseName`, `schemaName`, or exact `tableName`. For large integrations, `search` takes a natural-language description and returns only the 20 most relevant tables.
- `list_integration_project_usages`: list projects connected to an integration, optionally narrowed to one `projectId`.
- `list_integration_notebook_usages`: list notebooks that contain SQL blocks using an integration, optionally narrowed to one `projectId`.
- `list_integration_block_usages`: list SQL blocks using an integration, optionally narrowed to one `projectId`.
- `create_integration`: create a workspace integration of an API-creatable type. Requires `name`, `type`, and connection `metadata`; requires workspace integration-management permission. The response repeats `metadata`, which can contain credentials.
- `attach_integration`: attach an integration to a project. Requires `integrationId` and `projectId`; returns a conflict if already attached.
- `detach_integration`: detach an integration from a project. Requires `integrationId` and `projectId`; returns a conflict if not attached.
- `create_folder`: create a workspace folder. Requires `name`; accepts optional `parentFolderId` from `list_folders` (omitted means the workspace root). Folder names are not unique, so reuse an existing folder from `list_folders` instead of creating a duplicate.
- `create_project`: create a new project. Requires `name`; accepts optional `folderId`, `projectType` (`standard`, `notebook`, `agent`, `data_app`, or `streamlit_app`; defaults to `standard`), and `environmentId` from `list_environments` (defaults to the default environment). The created project includes a default notebook. A `streamlit_app` project also starts with a placeholder `app.py` that is already served as a Streamlit app, with `streamlitAppApiAccessEnabled` on; a `data_app` project starts with a placeholder `_deepnote_static/index.html`, with sharing and viewer API access on. `notebook`, `agent`, `data_app`, and `streamlit_app` projects have a single notebook and reject creating, renaming, duplicating, or deleting notebooks.
- `delete_project`: move a project and all its notebooks to the workspace trash by `projectId`, where it can be restored for 30 days. Its schedules are deleted for good, and its machine is stopped. Requires full access to the project.
- `create_notebook`: create an empty notebook inside a project. Requires `projectId`; accepts optional `name`. Does not accept starter blocks.
- `get_notebook`: get notebook details, blocks, input variables, and last-run metadata by notebook ID. Each block carries only its `id`, `type`, `content`, and `contentHash`.
- `get_block`: get one block by `blockId`, with its `notebookId`, `type`, `content`, `contentHash`, `metadata`, `integrationId` (set only on SQL blocks), `version`, `createdAt`, and `updatedAt`. Optional `includeOutputs: true` adds the `outputs` the block shows in the live editor, from its last run there: live and scheduled runs change them (unless the schedule has output syncing turned off), detached runs do not. Outputs longer than 16,384 characters as JSON are replaced by a notice, with `outputHead` and `outputTail` showing how they start and end; `fullOutputs: true`, used with `includeOutputs`, returns them whole. View access is enough; a deleted block returns not found.
- `update_notebook`: rename a notebook. Requires `notebookId` and `name`; naming it `Init` designates the project init notebook. Rename is the only supported update.
- `duplicate_notebook`: duplicate a notebook inside its current project. Requires `notebookId`; it accepts no target-project or name argument and assigns a unique name.
- `delete_notebook`: delete a notebook by `notebookId`. A project version is saved first, so the notebook can be restored from version history. Single-notebook projects reject it; an already deleted notebook returns not found.
- `create_block`: create a block in a notebook. Requires `notebookId` and `type`; accepts optional `content`, `metadata`, zero-based `position` (omitted means append), `includeNotebookBlockIds`, and SQL-only `integrationId`.
- `update_block`: replace an existing block's content and/or SQL integration. Requires `blockId`; accepts `content`, SQL-only `integrationId`, or both, and at least one of them.
- `delete_block`: permanently delete a block by `blockId`; an already deleted block returns not found.
- `reorder_notebook_blocks`: move one or more existing blocks. Requires `notebookId`, non-empty unique `blockIds` in the desired moved-block order, and `placement` of `{ "type": "start" }`, `{ "type": "end" }`, or `{ "type": "after", "blockId": "anchor-block-id" }`.
- `copy_file`: copy one file to a different project at the same normalized path. Requires `sourceProjectId`, `targetProjectId`, and `sourceFilePath`; it accepts no destination path and never overwrites.
- `read_file`: read one small text-based file, such as a script, config, or CSV, by `projectId` and project-relative `path`, to inspect or edit it. Optional `startLine` and `endLine` (inclusive, starting at 1) read part of it. Returns `content`, `startLine`, `endLine`, and `hasMore`. A call returns at most 64 KiB and fails beyond that, so read a long file in line ranges, continuing while `hasMore` is true. It is not for large or binary files. View access is enough.
- `write_file`: write one small text-based file, such as a script, config, or CSV, into a project. Requires `projectId`, project-relative `path`, and `content`; accepts `encoding` (`utf8` by default, or `base64` for small binary files) and `overwrite` (default `false`). Without `overwrite`, an existing path is left alone and the file is written to a generated unique path; the returned `file.path` is the path actually written. With `overwrite: true` it replaces the file, and a directory path returns a conflict. It is not a way to upload large files or big binary blobs.
- `delete_file`: permanently delete one file by `projectId` and project-relative `path`; a directory path returns an error. A Streamlit app that uses the file as its entrypoint is deleted with it.
- `update_project`: change a project's data app publishing, hosted Streamlit app API access, environment, or folder. Requires `projectId`, full access to the project, and at least one of `staticFiles.published`, `streamlitAppApiAccessEnabled`, `environmentId` from `list_environments`, or `folderId` from `list_folders` or `create_folder` (`null` moves the project to the workspace root). `staticFiles.published` publishes or unpublishes a data app for its viewers; editors can always open it. Leave the other `staticFiles` settings as they are. `streamlitAppApiAccessEnabled` lets the project's hosted Streamlit apps call the public API as their signed-in viewers. Changing the environment restarts a running machine in the background, which clears kernel state.
- `create_data_app_token`: mint a short-lived viewer token for a `data_app` project by `projectId`, so its page can be previewed locally against the real API. Returns `token`, `apiOrigin`, and `expiresAtSeconds`. The token acts as the caller in that project, so never write it into files.
- `create_streamlit_app`: serve an existing project file as a Streamlit app. Requires `projectId` and project-relative `entrypoint`; returns the app record and URL.
- `list_streamlit_apps`: list all Streamlit apps served by a project. Requires `projectId`; the response is unpaginated.
- `get_streamlit_app_status`: return `running`, `starting`, or `unavailable` for a `streamlitAppId`.
- `generate_project_url`: return a canonical absolute project or notebook URL. Accepts `projectId`, `notebookId`, or both, and requires at least one; when both are supplied, the notebook must belong to that project.
- `create_run`: start a notebook run by `notebookId`. It accepts optional `inputs` keyed by notebook input name, `detached` (default `true`), `detachedRunStorageMode` (`read_write` or `readonly`, detached runs only), `machineType` (an `id` from `list_machine_types`, detached runs only; defaults to the project's machine type), a non-empty unique `blockIds` list (live runs only), and `runDependentBlocks` (requires `blockIds`). For targeted execution, set `detached: false` and pass `blockIds`; omit `blockIds` to run the full notebook.
- `list_notebook_runs`: list historical notebook runs newest first, with `pageSize` (default 20) and `pageToken` pagination. Rows carry `runId`, `notebookId`, `status`, `createdAt`, and `completedAt`.
- `get_run`: fetch run `status`, `error`, `createdAt`, `completedAt`, and run snapshots. Optional `snapshotDelivery` is `"downloadUrl"` (the default when omitted), `"inline"`, or `"blocks"`. With `"blocks"`, outputs longer than 16,384 characters as JSON are replaced by a notice, with `outputHead` and `outputTail` showing how they start and end; `fullOutputs: true` returns them whole.
- `list_machine_types`: list the machine types (sizes) projects can run on, with `id`, `name`, `vCpus`, `memoryGiB`, `gpuCount`, and `available` plus `unavailableReason` for the workspace's plan and free quota, plus the `sandboxEnvironments` and which one new projects use. A custom machine (`custom:<id>`) only works for projects in its sandbox environment.
- `get_machine`: get the project machine's `status` (`stopped`, `starting`, `running`, `stopping`, or `error`), `error`, `startingPhase` (what a `starting` machine waits for: `waiting_for_capacity` or `pulling_image`), machine `type` with its vCPUs, memory, and GPUs, `sandboxEnvironmentId`, and `idleShutdownSeconds` by `projectId`. This is the machine the editor, live runs, and hosted Streamlit apps use; detached runs use machines of their own.
- `start_machine`, `stop_machine`, `restart_machine`: start, stop, or restart the project machine by `projectId`. They return without waiting, so poll `get_machine`. Starting a running machine or stopping a stopped one does nothing. Stopping or restarting clears kernel state for everyone working in the project; restarting recovers a machine in the `error` status.
- `update_machine`: change the project machine's `type` or `sandboxEnvironmentId` (`id`s from `list_machine_types`), or `idleShutdownSeconds` (up to 86400). Requires `projectId` and at least one of them. Changing the type or sandbox environment of a running machine requires `restart: true`; without it the call returns a conflict and changes nothing.
- `list_docs`: return the Deepnote docs navigation tree.
- `get_doc`: fetch a Deepnote documentation article by slug.

Before telling a user that a Deepnote action is impossible, check the tools the connected server actually advertises, and never claim to have used a tool that is not exposed there.

## General Rules

1. Use `get_me` when workspace identity, caller role, or API key context would help the answer or troubleshooting.
2. Resolve ambiguous project, folder, notebook, block, integration, or environment names with `search`, `list_projects`, `list_folders`, `list_integrations`, or `list_environments` before acting on them.
3. For complete inventories, page `list_projects` or `list_notebook_runs` with `pageSize: 100` and follow `pagination.nextPageToken` while `pagination.hasMore` is true. Stop early when the user only needs a sample or a filtered answer. Treat page tokens as opaque and tied to the original filters.
4. Use `get_project` for project-wide notebook, integration, file, or data app state. Call `get_notebook` before reasoning about, editing, or running an existing notebook.
5. Report results with Deepnote object names and IDs when useful, and surface execution errors, missing permissions, input validation errors, or unavailable MCP capabilities.
6. For Deepnote product or API how-to questions, ground the answer in current docs: `list_docs` to find the section and slug, then `get_doc` to fetch the article. Answer concisely and name the doc title or slug you used.

## Safety Rules

- Do not expose bearer tokens, integration credentials, or secret notebook input values. Refer to secret names only, and never repeat connection `metadata` returned by `create_integration`.
- Avoid downloading or printing large datasets. Sample, summarize, or aggregate unless the user explicitly asks for an export.
- Do not paste `snapshotDownloadUrl` values into answers unless the user asks for a download or file handoff. Snapshot handling is defined in `deepnote-runs`.
- Treat notebook execution as potentially stateful and costly.
- Treat resource creation, notebook duplication or renaming, block edits, file writes and copies, deleting projects, notebooks, blocks, or files, integration creation or attachment changes, app creation, data app publishing, Streamlit app API access changes, environment, folder, and sandbox environment changes, and machine type or idle shutdown changes as persistent writes. Do them only when the user asked, resolve targets carefully, and report affected IDs.
- Delete only what the user named, and say what can be undone: `delete_notebook` can be restored from version history and `delete_project` from the trash for 30 days, but a deleted project's schedules are gone. `delete_file` cannot be undone, nor can the old content `write_file` replaces with `overwrite: true`.
- A running machine uses machine time. Start, stop, or restart it, or change its type or the project's environment, only when the user asked; a live run the user asked for may start it. Stopping or restarting it, changing its type or sandbox environment with `restart: true`, and changing the project's environment clear kernel state for everyone working in the project, so say that kernel state will be lost.
- If a tool returns `isError`, surface the user-facing error message concisely.
- Capability boundary: the hosted server can create folders, integrations, and Streamlit apps; create and delete projects, notebooks, and blocks; rename and duplicate notebooks; update and reorder blocks; read and write small text-based project files, copy files between projects, and delete files; attach and detach integrations; publish and unpublish data apps; mint short-lived viewer tokens to preview a data app page locally; move a project to another folder and change its Streamlit app API access and environment; and start, stop, restart, or resize the project machine. It cannot read or upload large files or big binary blobs, delete folders or integrations, delete a Streamlit app other than by deleting its entrypoint file, move notebooks between projects, create custom environments, or change schedules, permissions, package versions, credentials, or secrets. Check the advertised tools before relying on this boundary.

## Response Style

Keep responses grounded in Deepnote state: project name, notebook name, block labels, execution or app status, and relevant links when the MCP server provides them or when `deepnote-links` can build them safely. If a task cannot be completed through the Deepnote MCP server, explain the missing capability and offer the nearest safe next step.

Default to brief, information-dense answers. Lead with the answer, use tables, counts, and status labels, and include only the highest-signal findings. Do not include long explanations, raw snapshots, presigned snapshot URLs, full block contents, integration metadata, or exhaustive inventories unless the user asks for more detail. When MCP does not expose a detail, say `Not visible via MCP` rather than inferring it from names.
