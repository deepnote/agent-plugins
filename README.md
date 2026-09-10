# Deepnote Plugin for Codex and Claude Code

Use Deepnote from Codex, Claude Code, or other AI agents. This repo serves all Deepnote agent plugins.

The plugin connects the agent to the hosted Deepnote MCP server at `https://deepnote.com/mcp` and ships skills that teach it how to work with Deepnote workspaces, projects, notebooks, integrations, docs, and notebook runs. One plugin directory, `plugins/deepnote`, serves every host: each host reads its own manifest, and all of them share the same skills and MCP configuration.

## Install

### Claude Code

```
/plugin marketplace add deepnote/agent-plugins
/plugin install deepnote@deepnote
```

Then run `/mcp`, choose the Deepnote server, and sign in with OAuth in the browser. To pin a branch or tag, use `/plugin marketplace add deepnote/agent-plugins@main`.

### Codex

```bash
codex plugin marketplace add deepnote/agent-plugins
codex plugin add deepnote@deepnote
```

Then sign in with OAuth:

```bash
codex mcp login deepnote
```

or use a personal API key instead, see [Authentication](#authentication). To pin a branch, tag, or commit, add `--ref main` to the marketplace command.

## Authentication

The hosted Deepnote MCP server accepts either an OAuth sign-in or a Deepnote personal API key.

- **OAuth.** Claude Code starts it from `/mcp`, Codex from `codex mcp login deepnote`. You pick the workspace to authorize in the browser and the host stores the tokens. There is no key to manage.
- **Personal API key.** Create one in Deepnote and export it as `DEEPNOTE_MCP_TOKEN` in the environment Codex starts from, then restart Codex. When the variable is set, Codex sends it as a bearer token instead of using OAuth. Claude Code ignores this variable and always uses OAuth.

Personal API keys act with the permissions of the user who created them. A viewer key has viewer capabilities, an editor key has editor capabilities, and an admin key has admin capabilities.

### Create a Deepnote API key

1. Open Deepnote.
2. Go to account settings.
3. Open **API keys**.
4. Choose **Add API key** under **Personal API keys**.
5. Give the key a name, generate it, and copy it immediately.

Deepnote shows the generated key only once. Store it somewhere safe, and revoke it from the same settings page if it is no longer needed. Deepnote API docs: https://deepnote.com/docs/deepnote-api

## What the plugin can do

Through the hosted MCP server the agent can:

- Identify the connected workspace and the caller's access level
- Search projects, notebooks, blocks, and integrations, and list projects and integrations
- Inspect notebooks, their blocks, input variables, and last-run metadata
- Create projects, notebooks, and blocks, and update or reorder blocks
- Start notebook runs, optionally with input values, and read run history, status, errors, and snapshot output
- Map integrations: cached table structure, and which projects, notebooks, and SQL blocks use an integration
- Read Deepnote docs
- Publish a small HTML/CSS/JavaScript site into a project and toggle its sharing, when the server advertises `publish_static_site`

It cannot execute a single block, browse live database schemas, upload arbitrary project files, or change schedules, permissions, environments, hardware, credentials, or secrets.

The skills under `plugins/deepnote/skills` are the agent-facing documentation for these workflows. Anything the agent should know belongs there, not in this README, which no host loads.

## Good first prompts

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

## Repository layout

```
.agents/plugins/marketplace.json       Codex marketplace
.claude-plugin/marketplace.json        Claude Code marketplace
plugins/deepnote/
  .codex-plugin/plugin.json            Codex manifest
  .claude-plugin/plugin.json           Claude Code manifest
  .mcp.json                            Hosted MCP server, shared by all hosts
  skills/                              Agent-facing skills, shared by all hosts
  assets/                              Icon
scripts/detect-deepnote-mcp-drift.sh   Compares the live MCP tools with the skills
```

## Development

Load a checkout in Claude Code for one session without installing anything:

```bash
claude --plugin-dir /path/to/agent-plugins/plugins/deepnote
```

Or install from the checkout. In Claude Code:

```
/plugin marketplace add /path/to/agent-plugins
/plugin install deepnote@deepnote
```

In Codex:

```bash
codex plugin marketplace add /path/to/agent-plugins
codex plugin add deepnote@deepnote
```

After changing plugin files, run `codex plugin marketplace upgrade deepnote` and restart Codex. Claude Code picks up skill edits live in sessions started with `--plugin-dir`; manifest and MCP changes need `/reload-plugins` or a restart.

Validate both manifests before opening a pull request:

```bash
claude plugin validate --strict . && claude plugin validate --strict plugins/deepnote
```

Things to know:

- Keep `"type": "http"` in `plugins/deepnote/.mcp.json`. Claude Code silently skips a server entry that has a `url` but no `type`. `bearer_token_env_var` is Codex-only and Claude Code ignores it.
- Bump `version` in both manifests to ship a release. Hosts only update an installed plugin when its version changes.
- A daily GitHub workflow runs the drift script against the hosted server and opens an issue when the server advertises tools the skills do not mention. Document new tools in a skill to close it.

## Troubleshooting

- Codex reports the Deepnote server as needing setup or authentication: run `codex mcp login deepnote`, or confirm `DEEPNOTE_MCP_TOKEN` is set in the environment Codex starts from.
- Claude Code shows the Deepnote server as needing authentication: run `/mcp` and complete the sign-in. If it shows as failed instead, check that no `Authorization` header was added to the plugin's MCP configuration; a header disables OAuth.
- Claude Code lists no Deepnote server at all: check that the entry in `plugins/deepnote/.mcp.json` still has `"type": "http"`.
- Sign-in says the workspace cannot use the MCP connector, or that MCP access is disabled: a workspace admin needs to enable MCP access for that workspace.
- A project, notebook, or integration is missing: the signed-in user, or the API key's creator, needs access to it.
- Creating or editing fails with `Insufficient permissions`: use an editor or admin key, or a user with edit access to the project.

## License

Apache-2.0. See [LICENSE](LICENSE).
