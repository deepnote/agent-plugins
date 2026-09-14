---
name: deepnote-notebooks
description: "Use when reading, reviewing, creating, editing, or reordering Deepnote notebooks and blocks through the Deepnote MCP server: notebook structure, inputs, SQL, Python, and outputs, creating projects or notebooks, and adding, updating, scaffolding, or moving blocks."
---

# Deepnote Notebooks

Tool arguments are defined in `deepnote-mcp`. Running a notebook is `deepnote-runs`. Links follow `deepnote-links`.

## Inspection Workflow

1. Resolve the target notebook with `search` or project context before using `get_notebook`.
2. Read the notebook with `get_notebook` before answering questions about structure, inputs, blocks, or last-run state.
3. Preserve the distinctions between block types, notebook inputs, code, SQL, markdown, and metadata in your reasoning.
4. When reporting inputs, include the input `name`, `type`, current `value`, and `label` when useful.
5. When SQL connection usage matters, confirm it with `list_integrations` and the integration usage tools in `deepnote-workspace` instead of inferring from names; use `get_integration` for cached table and column context.
6. Ground reviews and explanations in specific notebook or block names and IDs when useful.
7. For recent, failed, or historical runs, use `deepnote-runs`.

## Inspection Output

Help the user decide what the notebook does, whether it is safe to run, and what to do next. Lead with the answer, then include only the tables or cautions that materially help. Omit exhaustive block listings, raw code, and long outputs unless asked.

1. Start with a one-sentence brief: `Notebook "Name" in project "Project" has 12 blocks, 2 inputs, 1 visible connection, and last ran successfully on YYYY-MM-DD HH:MM UTC.`
2. Show a compact status table:

| Field | Value |
| --- | --- |
| Project | `Project name` |
| Notebook | `Notebook name` |
| Notebook ID | `notebook-id` |
| Scheduled | `Yes` or `No` |
| Last Run | `status/date/run id` or `No run visible` |
| Visible Connections | `Integration name (type)` or `None visible via MCP` |

3. If inputs exist, add an inputs table:

| Input | Type | Current Value | Label |
| --- | --- | --- | --- |
| `input_name` | `text` | `safe summary or value` | `Human label` |

4. Add a block map when useful, especially for reviews and debugging:

| Order | Type | Purpose | Connection / Output |
| --- | --- | --- | --- |
| `1` | `sql` | `SELECT demo.gapminder sample` | `Clickhouse (clickhouse)` |

5. Add `Cautions` only when actionable: cells that print secrets, environment variables, or configuration objects, hard-coded credentials, mutating external calls, long-running servers, large dataset dumps, missing inputs, failed or pending last runs, SQL blocks whose integration is not visible, or integration usage that was not checked when it matters.
6. End with `Useful Next Actions` only when it helps: run the notebook, inspect the latest run, list recent runs, map integrations, summarize outputs, or review risky cells.

Keep raw code excerpts short; summarize large cells and mention block IDs when useful. If execution was not run, say so plainly and mention the remaining risk. For larger reviews, summarize relevant sections rather than listing every block.

## Code Guidance

- Before suggesting code changes, inspect nearby blocks for imports, shared variables, SQL connections, inputs, and upstream assumptions.
- Prefer deterministic notebook code. Avoid hidden global state, implicit external files, or hard-coded credentials.
- For SQL blocks, preserve the existing connection or data source in recommendations unless the user asks to move it.
- Do not claim an edit was applied unless a write tool is available and reported success.

## Editing Workflow

Use this workflow to create a project or notebook, add or revise a block or cell, move or reorder blocks, scaffold starter content, or insert code, SQL, markdown, or input blocks. Each edit needs its tool: `create_project`, `create_notebook`, `create_block`, `update_block`, `reorder_notebook_blocks`, or `delete_block`. If the tool for the requested edit is not in the current session, say which one is missing instead of claiming support.

1. Resolve ambiguous names and IDs before writing: `get_me` for workspace identity, `search` or `list_projects` for projects and notebooks, `get_notebook` for the current block order, and `list_integrations` for SQL connections.
2. Treat `create_project`, `create_notebook`, and `create_block` as non-idempotent. Repeating a call creates another resource.
3. Use `create_project` only when the user wants a new project. Use `create_notebook` only when adding an empty notebook to a project; capture the returned notebook ID and add blocks afterward with `create_block` in that exact notebook.
4. Use `create_block` for each new block. Omit `position` to append, or pass a zero-based `position` when placement matters. Pass `includeNotebookBlockIds: true` when the final order matters, especially for ordered inserts and multi-block scaffolds.
5. Use `update_block` to change an existing block in place; it never creates a new block. Use `reorder_notebook_blocks` to move existing blocks; it preserves the relative order of blocks omitted from `blockIds` and returns the final active order.
6. Verify meaningful edits with `get_notebook` when order, integration attachment, or multi-block content matters.
7. Do not run the notebook after editing unless the user explicitly asks or confirms a final run prompt.

## Active Notebook Rule

Creation workflows keep exactly one active target notebook, and every later block, verification, link, and run prompt uses it:

- If only `create_project` was called, the active notebook is the default notebook created with the project.
- If `create_notebook` was called, the active notebook is the notebook it returned, even when the project also has a default notebook.
- Never link to or run the project's default notebook unless it is the active notebook. When both a project link and a notebook link are useful, label them separately so the notebook link points at the active notebook.

## Block Creation

Block types, as enumerated by the `create_block` schema:

- Code and data: `code`, `sql`, `markdown`, `notebook-function`
- Inputs: `input-text`, `input-textarea`, `input-select`, `input-date`, `input-date-range`, `input-slider`, `input-file`, `input-checkbox`
- Text cells: `text-cell-h1`, `text-cell-h2`, `text-cell-h3`, `text-cell-p`, `text-cell-bullet`, `text-cell-todo`, `text-cell-callout`
- Other: `visualization`, `pivot-table`, `image`, `button`, `separator`, `big-number`, `agent`

A text cell holds one line. A bullet list is one `text-cell-bullet` block per item, and a task list is one `text-cell-todo` per item with `metadata.checked`. Bullets have no nesting or numbering; there is no numbered-list type, so use a `markdown` block for ordered lists, tables, links, and anything richer than a single formatted line. `text-cell-callout` takes `metadata.color` of `blue`, `green`, `yellow`, `red`, or `purple`.

For SQL blocks, resolve the integration with `list_integrations` when the user names a connection, pass it as top-level `integrationId`, and never put `sql_integration_id` inside `metadata`. Do not pass `integrationId` for non-SQL blocks; it must reference a SQL-capable integration in the same workspace.

For input blocks, put block-type configuration in `metadata` and keep `content` for the visible or default textual content. Preserve existing naming and variable conventions when adding inputs near related blocks.

## Block Update

Before updating, call `get_notebook` and identify the target block ID, its current type, and its content. When the current SQL integration matters, confirm it with `list_integrations` and the integration usage tools; do not infer it from block content. Ask a clarifying question only when the target block or the requested replacement is ambiguous.

Send the full replacement `content`; partial snippets are not merged. For SQL blocks, `update_block` can change `content`, `integrationId`, or both in one call, following the same `integrationId` rules as block creation. `update_block` cannot change a block's type, update arbitrary metadata, or edit saved input defaults; say so instead of claiming those changes were applied. Use `delete_block` to remove a block.

## Block Reordering

Before moving blocks, call `get_notebook` and identify the current ordered block IDs. Ask a clarifying question only when the target or destination is ambiguous.

Pass `blockIds` ordered exactly as the moved group should appear. For `placement.type: "after"`, the anchor block must be an active block in the same notebook and must not be included in `blockIds`; use `start` or `end` instead of manufacturing an anchor when the user asks for the beginning or end of the notebook. If the tool returns the same final order, treat it as a no-op rather than an error.

## Reporting Edits

After a successful edit, report the created project, the active notebook, and block names or IDs when relevant, plus placement or final block order when useful. Include links built with `deepnote-links` for the active notebook.

If a notebook was created or scaffolded and not run, end with a short question asking whether to run the active notebook now. Do not call `create_run` until the user confirms; then follow `deepnote-runs` with the active notebook ID.

If a write tool returns an error, surface the user-facing message concisely and name the likely fix: missing permission, missing target resource, invalid block type, invalid position or placement, duplicate notebook name, suspended project, or incompatible SQL integration.
