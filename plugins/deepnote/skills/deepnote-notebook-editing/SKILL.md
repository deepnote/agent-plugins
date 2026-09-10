---
name: deepnote-notebook-editing
description: Use when creating Deepnote projects or notebooks, renaming or duplicating notebooks, adding, updating, deleting, or reordering blocks or cells, scaffolding notebook content, inserting SQL/code/markdown/input blocks, or otherwise editing notebook structure through the Deepnote MCP server.
---

# Deepnote Notebook Editing

## When To Use

Use this skill when the user asks you to create a Deepnote project, create, rename, or duplicate a notebook, add, revise, or delete a block or cell, move or reorder blocks, scaffold starter notebook content, insert code, SQL, markdown, or input blocks, or make a structural notebook edit supported by the current MCP write tools.

This workflow requires the Deepnote MCP server to expose the write tools needed for the requested edit. Use `create_project`, `create_notebook`, and `create_block` for creation workflows; use `update_notebook` and `duplicate_notebook` for notebook-level changes; use `update_block` for changing existing block content or SQL integration; use `delete_block` for removing a block; use `reorder_notebook_blocks` for moving existing blocks. If the required tool is not visible in the current session, do not claim editing support; explain which MCP tool is missing.

The current editing surface covered by this skill is:

- `create_project`: create a new project. Requires `name`; accepts optional `folderId`. Resolve `folderId` with `list_folders` when the user names a folder.
- `create_notebook`: create an empty notebook in a project. Requires `projectId`; accepts optional `name`.
- `update_notebook`: rename a notebook. Requires `notebookId` and `name`. Rename is the only supported change; naming a notebook `Init` designates it as the project init notebook, which can run as a prelude to other notebooks in the project.
- `duplicate_notebook`: duplicate a notebook inside its current project. Requires `notebookId`. The copy receives an auto-generated unique name; there is no target project or name parameter.
- `create_block`: create a block in a notebook. Requires `notebookId` and `type`; accepts optional `content`, `metadata`, `position`, `includeNotebookBlockIds`, and SQL-only `integrationId`.
- `update_block`: update an existing block. Requires `blockId`; accepts `content`, SQL-only `integrationId`, or both. At least one of `content` or `integrationId` is required.
- `delete_block`: permanently delete a block. Requires `blockId`. Returns 404 if the block no longer exists.
- `reorder_notebook_blocks`: move one or more existing blocks in a notebook. Requires `notebookId`, non-empty unique `blockIds` in the desired moved-block order, and `placement`.

## Editing Workflow

1. Resolve ambiguous names and IDs before writing. Use `get_me` for workspace identity, `search` or `list_projects` for projects/notebooks, `list_folders` for a target folder, `get_project` for a project's existing notebooks, `get_notebook` for current block order, and `list_integrations` for SQL connections.
2. Treat `create_project`, `create_notebook`, `duplicate_notebook`, and `create_block` as non-idempotent. Repeating the same call creates another resource.
3. Use `create_project` only when the user wants a new project. A created project includes a default empty notebook; if the workflow later calls `create_notebook`, the new `create_notebook` result becomes the active notebook for blocks, verification, links, and run prompts.
4. Use `create_notebook` only when adding an empty notebook to a project. It does not accept starter blocks; capture the returned notebook ID and create blocks afterward with `create_block` in that exact notebook.
5. Use `update_notebook` to rename a notebook. Notebook names are unique within a project, so a duplicate name returns a 409 error.
6. Use `duplicate_notebook` when the user wants a copy of a notebook in the same project, for example to experiment without touching the original. Then use `update_notebook` on the returned notebook ID if the user wants a specific name, and treat the copy as the active notebook for later edits. Notebooks cannot be duplicated or moved across projects.
7. Use `create_block` for each new block. Omit `position` to append, or pass a zero-based `position` when placement matters.
8. Use `update_block` when changing an existing block. It updates content and/or SQL integration in place; it does not create a new block.
9. Use `delete_block` only when the user clearly asks to remove a block. Read the block's ID, type, and content from `get_notebook` first, and when several blocks match the description, confirm which one before deleting.
10. Pass `includeNotebookBlockIds: true` when the final block order matters, especially for ordered inserts or multi-block scaffolds.
11. Use `reorder_notebook_blocks` when moving existing blocks. It preserves the relative order of blocks omitted from `blockIds` and returns the final active block order.
12. Verify meaningful edits with `get_notebook` after block creation, block update, block deletion, or block reordering when order, integration attachment, or multi-block content matters.
13. Do not run the notebook after editing unless the user explicitly asks for execution or confirms a final run prompt. After creating or scaffolding a notebook, ask whether to run that exact notebook in Deepnote.

## Creation Target Tracking

For creation workflows, keep one active target notebook:

- If only `create_project` is called, use the default notebook created with the project as the active notebook when blocks or a notebook link are needed.
- If `create_notebook` is called, use the notebook ID returned by `create_notebook` as the active notebook, even when the same project also has an initial default notebook.
- Create blocks, verify with `get_notebook`, build notebook links, and ask about running against the active notebook ID. Do not link to or run the project's default notebook unless it is the active notebook.
- When both a project link and notebook link are useful, label them separately so the notebook link points to the newly created or edited notebook.

## Block Creation Guidance

Choose the block `type` that matches Deepnote's block vocabulary. Common types include `code`, `sql`, `markdown`, input blocks such as `input-text`, `input-select`, `input-checkbox`, and text-cell variants such as `text-cell-h1`, `text-cell-p`, and `text-cell-callout`.

For SQL blocks:

- Resolve the integration first with `list_integrations` when the user gives a connection name.
- Pass the connection as top-level `integrationId`.
- Do not put `sql_integration_id` inside `metadata`.
- Do not pass `integrationId` for non-SQL blocks.

For input blocks, put block-type configuration in `metadata` and keep `content` for the visible/default textual content when applicable. Preserve existing notebook naming and variable conventions when adding inputs near related blocks.

## Block Update Guidance

Before updating a block, call `get_notebook` and identify the target block ID, current type, current content, and visible SQL integration when relevant. Ask a clarifying question only when the target block or requested replacement is ambiguous.

Use `update_block` when the user wants to revise an existing cell or block. Send the full replacement `content` for the block content you want saved; do not assume partial snippets will be merged unless the user explicitly asks for exactly that replacement. Use `create_block` only when the user wants an additional new block.

For SQL blocks, `update_block` can update `content`, `integrationId`, or both in a single call. Resolve the integration with `list_integrations` when the user gives a connection name, then pass the connection as top-level `integrationId`. Do not put `sql_integration_id` in metadata.

Do not pass `integrationId` for non-SQL blocks. `update_block` does not accept `metadata` and cannot change a block's type or saved input defaults; say so instead of claiming those changes were applied. To change metadata, create a replacement block with `create_block` and remove the old one with `delete_block`. To remove a block outright, use `delete_block`, not `update_block` with empty content.

## Block Deletion Guidance

Before deleting, call `get_notebook` and identify the target block by ID, type, and content. Deletion is permanent through MCP; there is no undo tool. Delete one block per `delete_block` call and report each deleted block ID. If the user asks to clear a notebook, list the blocks you would delete and confirm before proceeding. A 404 response means the block was already gone; treat it as already done rather than retrying.

## Block Reordering Guidance

Before moving blocks, call `get_notebook` and identify the current ordered block IDs. Ask a clarifying question only when the target block or destination is ambiguous.

Call `reorder_notebook_blocks` with:

- `notebookId`: the target notebook ID.
- `blockIds`: a non-empty list of unique block IDs to move, ordered exactly as they should appear as the moved group.
- `placement`: `{ "type": "start" }`, `{ "type": "end" }`, or `{ "type": "after", "blockId": "anchor-block-id" }`.

For `placement.type: "after"`, the anchor `blockId` must be an active block in the same notebook and must not be included in `blockIds`. Use `start` or `end` instead of manufacturing an anchor when the user asks for the beginning or end of the notebook.

After reordering, report the moved block IDs and final order when useful. If the tool returns the same final order, treat it as a no-op rather than an error.

## Response Style

After a successful edit, report the created project, active notebook, renamed or duplicated notebook, and block names/IDs when relevant, plus deleted block IDs and placement or final block order when useful. Include Deepnote links when they can be safely constructed with `deepnote-links`; for newly created notebooks, the notebook link must use the active notebook ID from `create_notebook` or the default notebook created by `create_project` when no separate notebook was created.

If a notebook was created or scaffolded and not already run, end with a short question asking whether to run the active notebook in Deepnote now. Do not call `create_run` until the user confirms; after confirmation, use `deepnote-data-execution` and pass the active notebook ID.

If a write tool returns an error, surface the user-facing message concisely and name the likely fix: missing permission, missing target resource, invalid block type, invalid position or placement, duplicate notebook name, notebook limit reached, suspended project, or incompatible SQL integration.
