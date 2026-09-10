# Deepnote Plugin for Codex and Claude Code

Use Deepnote from Codex or Claude Code to identify the current workspace, search resources, inspect notebooks, create projects, notebooks, and blocks, generate project and notebook links, list projects and integrations, map integration usage, read Deepnote docs, start notebook runs, and summarize run status and outputs.

One plugin directory serves both hosts. Codex reads `.codex-plugin/plugin.json`, Claude Code reads `.claude-plugin/plugin.json`, and both load the same `skills/` directory and `.mcp.json`. Guidance below that names Codex applies equally to Claude Code.

## What Is Included

- Codex marketplace manifest in `.agents/plugins/marketplace.json`
- Claude Code marketplace manifest in `.claude-plugin/marketplace.json`
- Codex plugin manifest in `plugins/deepnote/.codex-plugin/plugin.json`
- Claude Code plugin manifest in `plugins/deepnote/.claude-plugin/plugin.json`
- Hosted Deepnote MCP configuration in `plugins/deepnote/.mcp.json`, read by both hosts
- Deepnote skills, shared by both hosts, for workspace search, link generation, docs lookup, integration mapping, notebook inspection, notebook editing, and notebook execution workflows
- Deepnote branding assets

## Requirements

- A Deepnote account with access to the target workspace
- Codex with plugin support, or Claude Code with plugin support
- For Codex only: a Deepnote personal API key. Claude Code signs in with OAuth and needs no key.

Deepnote personal API keys act with the permissions of the user who created them. A viewer key has viewer capabilities, an editor key has editor capabilities, and an admin key has admin capabilities.

## Create A Deepnote API Key

Codex needs a personal API key. Claude Code uses OAuth instead, so skip this section for Claude Code.

1. Open Deepnote.
2. Go to account settings.
3. Open **API keys**.
4. Choose **Add API key** under **Personal API keys**.
5. Give the key a name, generate it, and copy it immediately.

Deepnote shows the generated key only once. Store it somewhere safe, and revoke it from the same settings page if it is no longer needed.

Deepnote API docs: https://deepnote.com/docs/deepnote-api

## Configure Authentication

Both hosts read the hosted Deepnote MCP server from `plugins/deepnote/.mcp.json`:

```json
{
  "mcpServers": {
    "deepnote": {
      "type": "http",
      "url": "https://deepnote.com/mcp",
      "bearer_token_env_var": "DEEPNOTE_MCP_TOKEN"
    }
  }
}
```

Keep the `type` field. Claude Code silently skips a server entry that has a `url` but no `type`; Codex accepts the field as well. `bearer_token_env_var` is Codex-only and Claude Code ignores it.

### Codex

Set the API key in the environment where Codex runs:

```bash
export DEEPNOTE_MCP_TOKEN="<your-deepnote-api-key>"
```

Codex reads that value through `bearer_token_env_var` and sends it as `Authorization: Bearer <token>`.

The Codex marketplace marks authentication as `ON_INSTALL`, so Codex may show Deepnote as requiring setup when you install the plugin. Deepnote does not use an OAuth sign-in flow in Codex yet; setup means making `DEEPNOTE_MCP_TOKEN` available to the Codex process and restarting Codex before using the plugin.

### Claude Code

No API key or environment variable is needed. Claude Code reads the same `.mcp.json`, ignores `bearer_token_env_var`, and connects with OAuth. The hosted Deepnote MCP endpoint supports OAuth 2.0 with dynamic client registration. After the plugin is enabled, run `/mcp` in Claude Code, pick the Deepnote server, and complete the sign-in in the browser. Do not add an `Authorization` header to this configuration; when a header is present, Claude Code skips the OAuth flow.

## Capabilities

The hosted Deepnote MCP server currently exposes these tools:

- `search`: search workspace resources across projects, notebooks, blocks, and integrations
- `get_me`: get the calling API key, creator user, workspace, and access level
- `list_projects`: list workspace projects, optionally filtered by name, with cursor pagination
- `list_integrations`: list workspace integrations, optionally filtered by name or type
- `get_integration`: inspect integration details and cached table structure
- `list_integration_project_usages`: list projects connected to an integration
- `list_integration_notebook_usages`: list notebooks containing SQL blocks that use an integration
- `list_integration_block_usages`: list SQL blocks that use an integration
- `get_notebook`: inspect notebook details, blocks, input variables, and last-run metadata
- `create_project`: create a new project, optionally inside a folder
- `create_notebook`: create an empty notebook inside a project
- `create_block`: create a new block in a notebook
- `update_block`: update an existing block's content or SQL integration
- `reorder_notebook_blocks`: move existing blocks within a notebook
- `create_run`: start a full notebook run, optionally with input values
- `list_notebook_runs`: list recent and historical notebook runs
- `get_run`: inspect run status, errors, completion time, and snapshot content when available
- `list_docs`: list Deepnote docs sections and article slugs
- `get_doc`: fetch a Deepnote documentation article by slug

The hosted MCP server also exposes capabilities beyond the tools listed above. It can create, inspect, attach, and detach integrations, and it can enable or disable static-site sharing and viewer API access. Once `publish_static_site` appears in the connected server's advertised tools, it can also publish a small HTML/CSS/JavaScript site in one call. Treat the list above as the documented subset rather than a complete inventory; check the tools advertised by the connected server before telling a user that something is impossible.

The hosted MCP server cannot execute a single block, browse database schemas directly, upload arbitrary project files, or change schedules, permissions, environments, hardware, credentials, or secrets.

When Deepnote MCP is connected, Codex should introduce it in one sentence: Deepnote MCP can identify the current workspace, search resources, list projects and integrations, inspect notebooks, create and edit notebook structure, map integration usage and cached table structure, read Deepnote docs, start notebook runs, and fetch run status and history; if you are not registered yet, register at deepnote.com and ready your Deepnote API key from the [Deepnote API docs](https://deepnote.com/docs/deepnote-api).

By default, Deepnote responses should be brief, concise, and information dense. Codex should lead with the answer, use tables and counts where they improve scanning, and avoid long explanations, raw snapshots, full logs, or exhaustive block listings unless the user asks for more detail.

Workspace status and heartbeat responses should read like a compact operations dashboard: one health sentence, key counts, a notebook table, an integration table when useful, and notable findings only when actionable.

| Project | Notebook | Active / Last Run | Scheduled | Linked Connections |
| --- | --- | --- | --- | --- |
| `Project name` | `Notebook name` | `Last run: YYYY-MM-DD HH:MM UTC` or `No recent run visible` | `Yes` or `No` | `Integration name (type)` or `None visible via MCP` |

For large workspaces, Codex should request `list_projects` with `pageSize: 100` and follow `pagination.nextPageToken` while `pagination.hasMore` is true when a complete inventory is needed. If the user only needs a sample or filtered answer, Codex can stop once it has enough evidence. Codex should include active notebooks, scheduled notebooks, and notebooks with visible linked connections first, then summarize remaining notebooks by count.

Notebook inspection responses should help the user understand purpose, safety, and next action. Start with a one-sentence brief, then use compact tables for status, inputs, block map, and visible connections:

| Field | Value |
| --- | --- |
| Project | `Project name` |
| Notebook | `Notebook name` |
| Scheduled | `Yes` or `No` |
| Last Run | `status/date/run id` or `No run visible` |
| Visible Connections | `Integration name (type)`, `Usage not checked`, or `None visible via MCP` |

When a notebook includes cells that print environment variables, credentials, large datasets, start servers, send network requests, or mutate external systems, Codex should call that out before running the notebook.

## Publish Static Dashboards

Author HTML, CSS, and JavaScript in the agent's local workspace. When a shell and the Deepnote CLI
are available, publish the finished directory with `deepnote publish ./dist --project-id <uuid>`.
When deployment must happen through hosted MCP, use `publish_static_site` only if the connected
server advertises it. Supply the final file contents in that one tool call; do not use notebook
execution or generic project-file writes as a deployment workaround.

`publish_static_site` enables sharing after its file operations succeed and returns the canonical
site URL. To change access later without re-uploading or deleting files, call `update_project` with
`staticFiles.sharingEnabled` and/or `staticFiles.apiAccessEnabled`. Disabling sharing also disables
viewer API access. Re-enabling sharing serves the retained files again.

Published files are served to people who can view the project. Never put API keys, personal tokens,
`.env` contents, or other secrets in them. Viewer API access is a separate explicit setting; enable
it only when the browser app needs the viewer-scoped Deepnote run API.

## Workspace Identity And Project Pagination

Use `get_me` when a response needs to name the authenticated workspace, debug access issues, or report the caller's access level. The response includes API key metadata, user metadata, workspace `{ id, name, slug }`, and `accessLevel`.

`list_projects` returns a paginated response:

```json
{
  "projects": [],
  "pagination": {
    "pageSize": 100,
    "nextPageToken": "opaque-token-or-null",
    "hasMore": true
  }
}
```

Pass `pageToken` from `pagination.nextPageToken` to fetch the next page. Treat page tokens as opaque and tied to the original filters.

## Project And Notebook Links

The [`deepnote-links`](plugins/deepnote/skills/deepnote-links/SKILL.md) skill covers how Codex should build workspace-aware Deepnote project and notebook links from MCP data.

## Create Projects, Notebooks, And Blocks

Use the [`deepnote-notebook-editing`](plugins/deepnote/skills/deepnote-notebook-editing/SKILL.md) skill when Codex needs to create Deepnote resources or add notebook blocks.

The creation tools are non-idempotent: repeated calls create additional projects, notebooks, or blocks. Resolve the target workspace, project, notebook, and integration first with `get_me`, `search`, `list_projects`, `get_notebook`, or `list_integrations` when names or placement are ambiguous.

- `create_project` requires `name` and accepts optional `folderId`. A new project includes a default empty notebook.
- `create_notebook` requires `projectId` and accepts optional `name`. It creates an empty notebook and does not accept initial blocks.
- `create_block` requires `notebookId` and `type`, accepts optional `content`, `metadata`, `position`, `includeNotebookBlockIds`, and SQL-only `integrationId`, and appends by default when `position` is omitted.

For SQL blocks, pass the SQL integration as top-level `integrationId`. Do not put `sql_integration_id` inside `metadata`; Deepnote returns a validation error for that shape. `integrationId` is only valid for `sql` blocks and must reference a SQL-capable integration in the same workspace.

Use zero-based `position` for ordered inserts. When placement matters, pass `includeNotebookBlockIds: true` and verify the final block order from the response or with `get_notebook`.

## Integration Usage Mapping

Use `list_integrations` first to discover integration IDs. Then use the usage tools for the needed granularity:

- `list_integration_project_usages` for connected projects
- `list_integration_notebook_usages` for notebooks containing SQL blocks that use the integration
- `list_integration_block_usages` for the exact SQL blocks and block content

Each usage tool can be narrowed with `projectId`. If usage is not checked, say `Usage not checked`; if the tool returns no usages, say `No usage returned`.

## Run Notebooks With Inputs

Use `get_notebook` before `create_run` when a notebook may need inputs. `get_notebook` returns input variables in notebook order with their `blockId`, `name`, `type`, current `value`, and optional human-readable `label`.

Pass run inputs to `create_run` as an `inputs` object keyed by the input `name`:

```json
{
  "notebookId": "00000000-0000-0000-0000-000000000000",
  "inputs": {
    "customer_name": "Acme",
    "include_archived": true,
    "segments": ["Enterprise", "Mid-market"]
  }
}
```

Input values must match the notebook input block type:

- Text, textarea, file, date, slider, and single-select inputs use strings.
- Checkbox inputs use booleans.
- Multi-select inputs use arrays of strings.
- Date-range inputs use a string or an array of exactly two strings.
- Slider values are numeric strings.

If an input name is not defined for the notebook, or a value does not match the input block type, Deepnote returns a validation error and the run is not started. Input values apply to that run only; they do not change the notebook's saved defaults.

If `create_run` fails before returning a run ID, Codex should surface the MCP/API error directly and should not poll `get_run`. This includes user-facing errors such as workspace or parallel run limits.

## Install From GitHub

### Codex

Add this repo as a Codex marketplace:

```bash
codex plugin marketplace add deepnote/codex-plugin
```

Then set `DEEPNOTE_MCP_TOKEN`, restart Codex, open the plugin directory, choose the Deepnote marketplace, and install the Deepnote plugin. If Codex prompts for setup during install, confirm that the environment variable is set in the environment Codex starts from.

To pin a branch, tag, or commit:

```bash
codex plugin marketplace add deepnote/codex-plugin --ref main
```

### Claude Code

Add this repo as a Claude Code marketplace and install the plugin from it:

```
/plugin marketplace add deepnote/codex-plugin
/plugin install deepnote@deepnote
```

Then run `/mcp`, choose the Deepnote server, and complete the OAuth sign-in. To pin a branch or tag, use `/plugin marketplace add deepnote/codex-plugin@main`.

## Install Locally For Development

### Codex

Codex discovers plugins through the repo marketplace at `.agents/plugins/marketplace.json`. To test this checkout directly:

```bash
codex plugin marketplace add /absolute/path/to/codex-plugin
```

For this checkout, that is:

```bash
codex plugin marketplace add /Users/dino/Development/deepnote-codex
```

Set `DEEPNOTE_MCP_TOKEN`, restart Codex, open the plugin directory, choose the Deepnote marketplace, and install the Deepnote plugin. If Codex prompts for setup during install, confirm that the environment variable is set in the environment Codex starts from.

The marketplace entry points at `plugins/deepnote`:

```json
{
  "name": "deepnote",
  "interface": {
    "displayName": "Deepnote"
  },
  "plugins": [
    {
      "name": "deepnote",
      "source": {
        "source": "local",
        "path": "./plugins/deepnote"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

After you change plugin files, upgrade the marketplace or remove and re-add it, then restart Codex so the local install picks up the latest files:

```bash
codex plugin marketplace upgrade deepnote
```

### Claude Code

Claude Code discovers plugins through the repo marketplace at `.claude-plugin/marketplace.json`. To load this checkout for one session without installing anything:

```bash
claude --plugin-dir /absolute/path/to/codex-plugin/plugins/deepnote
```

To install from the checkout instead:

```
/plugin marketplace add /absolute/path/to/codex-plugin
/plugin install deepnote@deepnote
```

Validate both manifests before opening a pull request:

```bash
claude plugin validate --strict . && claude plugin validate --strict plugins/deepnote
```

## Good First Prompts

- `Search my Deepnote workspace for customer retention notebooks.`
- `Which Deepnote workspace am I connected to?`
- `Give me links to my Deepnote projects.`
- `Inspect this Deepnote notebook and summarize its inputs.`
- `Create a Deepnote project named Revenue Analysis.`
- `Create a notebook in this Deepnote project and add starter markdown and code blocks.`
- `Update this Deepnote notebook block with the revised SQL.`
- `Add a SQL block to this notebook using my Snowflake integration.`
- `Move these Deepnote notebook blocks to the top of the notebook.`
- `Show me the recent runs for this Deepnote notebook.`
- `Run this Deepnote notebook with customer_name set to Acme.`
- `List Deepnote integrations matching Snowflake.`
- `Show cached tables for my Snowflake integration.`
- `Show me where this Deepnote integration is used.`
- `Look up the Deepnote docs for scheduled notebooks.`

## Troubleshooting

- If authentication fails in Codex, confirm `DEEPNOTE_MCP_TOKEN` is set in the environment Codex actually starts from.
- If Claude Code shows the Deepnote server as needing authentication, run `/mcp` and complete the OAuth sign-in. If the server shows as failed instead, check that no `Authorization` header was added to the plugin's MCP configuration. If Claude Code lists no Deepnote server at all, check that the entry in `plugins/deepnote/.mcp.json` still has `"type": "http"`.
- If a resource is missing, check that the API key creator has access to the workspace, project, notebook, or integration.
- If project listings look incomplete, check whether `pagination.hasMore` is true and continue with `pagination.nextPageToken`.
- If creating a project, notebook, or block fails with `Insufficient permissions`, use an editor or admin API key, or project edit access where applicable.
- If a block insertion fails, check that `notebookId`, `type`, and zero-based `position` are valid for the current notebook.
- If a SQL block creation fails, confirm `integrationId` references a SQL integration in the same workspace and pass it as a top-level field.
- If a notebook run with inputs fails before starting, check that each input key matches a `get_notebook` input `name` and that each value matches the input type.
- If a run fails, ask Codex to inspect the run with `get_run` and summarize the error.
- If Codex suggests an unsupported edit or environment change, remember the boundary: the hosted MCP server can create projects, notebooks, and blocks, update and reorder blocks, create, inspect, attach, and detach integrations, and enable or disable static-site sharing and viewer API access. If `publish_static_site` is advertised, it can publish files only beneath the static-site root; it still cannot upload arbitrary project files or change schedules, permissions, environments, hardware, credentials, or secrets.

## License

Apache-2.0. See [LICENSE](LICENSE).
