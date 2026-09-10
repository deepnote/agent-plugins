---
name: deepnote-workspace
description: Use for workspace-level questions about Deepnote: workspace summary, heartbeat, overview, inventory of projects and notebooks, scheduled or recently run notebooks, integrations, cached table and column structure, and which projects, notebooks, or SQL blocks use an integration.
---

# Deepnote Workspace

Tool arguments, pagination, and the capability boundary are defined in `deepnote-mcp`. Build links with `deepnote-links`.

## Workspace Summary Workflow

When the user asks for a workspace summary, heartbeat, overview, or which notebooks are active or scheduled:

1. Use `get_me` for workspace name, workspace ID, API key type, and caller access level when useful.
2. Use `list_projects` to collect projects and notebooks. For complete inventories, page through all results.
3. Use `list_integrations` to collect integration names, types, and IDs.
4. Use `get_notebook` for notebooks that need connection details or recent run detail.
5. Identify scheduled notebooks from `isScheduled`.
6. Identify active notebooks from `lastRunAt` or an explicitly requested run status from `get_run`. MCP does not expose live kernel or session state, so say that active means recent run activity rather than an open editor session. Prefer `recently run`, `scheduled`, `pending run`, or `last run` over "currently open" or "currently running".
7. Map integration usage with the usage tools when direct usage matters. If usage was not checked, write `Usage not checked`; if a checked usage tool returns nothing, write `None found`.
8. Build project and notebook links with `deepnote-links`, using `utm_term=workspace_summary` for links created by this workflow rather than by a single tool result.

## Workspace Summary Output

Workspace-status output should read like a small operations dashboard:

1. Start with a one-sentence health line, for example: `Deepnote workspace is reachable; the current MCP response includes 6 projects, 15 notebooks, 1 scheduled notebook, and 4 integrations.`
2. Add a compact `Key Signals` list with counts visible in the current MCP response: projects, notebooks, scheduled notebooks, recently run notebooks, failed or pending runs when checked, and integrations.
3. Use the summary table below as the main artifact: one row per notebook, grouped by project.
4. Keep integrations inside the table as an `Integrations` column. Use a standalone integration table only when the user explicitly asks for an integration inventory or usage report.
5. Hyperlink project and notebook names. The notebook name is the link label.
6. Finish with `Notable Findings` only when something is actionable: a scheduled notebook with no last run, a pending or failed run, a notebook that prints environment variables, or an integration with no checked usage.

Summary table, for workspace summaries, notebook inventories, project breakdowns, and "which notebooks do I have?" requests:

| Project | Notebook | Scheduled | Last Run Seen | Integrations |
| --- | --- | --- | --- | --- |
| [Project name](project URL with UTM parameters) | [Notebook name](notebook URL with UTM parameters) or `N more notebooks` | `Yes` or `No` | `YYYY-MM-DD HH:MM UTC`, `None seen`, or `Not visible via MCP` | `Integration name/Type` or `None found` |

Row rules:

- For a specific project or notebook, filter the table to it.
- For large workspaces, keep individual rows for scheduled notebooks, recently run notebooks, and notebooks with visible integrations, then collapse each project's remaining notebooks into one `N more notebooks` row. A collapsed row is `No` for Scheduled, shows the most recent visible `lastRunAt` among its notebooks or `None seen`, and lists their integrations, `None found` when usage was checked, or `Usage not checked`.
- `Last Run Seen` is the notebook's visible `lastRunAt`, or a checked `get_run` completion time when more current. Format dates in UTC as `YYYY-MM-DD HH:MM UTC`. Never write `None seen` when a run ID or run timestamp is visible.
- `Integrations` uses names and IDs from `list_integrations`, mapped with the usage tools when direct usage matters. Visible references from `get_notebook` blocks or inline run snapshots may also be mentioned. Do not infer usage from integration names alone; write `None found` only when checked usage or visible references return no connection.

## Integration Mapping Workflow

1. Use `list_integrations` to resolve an integration name or type to an ID.
2. Use `get_integration` for cached structure. The response includes integration details plus `tables`, each with `name`, `schema`, optional `database`, and cached `columns` with names and database-native types. The `databaseName`, `schemaName`, and `tableName` filters apply to cached rows; an empty result means no matching cached structure is visible through MCP, not that the live database lacks the table.
3. Use `list_integration_project_usages` for connected projects, `list_integration_notebook_usages` for notebooks with SQL blocks that use the integration, and `list_integration_block_usages` for the exact SQL blocks and their content. Narrow any of them with `projectId`.
4. Say that structure is cached. Do not present it as a live database scan, and do not claim access to row previews, query results, file metadata, or environment configuration unless an exposed MCP tool or a run snapshot provided them.

Standalone integration table, only when explicitly requested:

| Integration | Type | Visible Notebook Usage |
| --- | --- | --- |
| `Integration name` | `type` | `Project / Notebook` from usage tools, `None found`, or `Usage not checked` |
