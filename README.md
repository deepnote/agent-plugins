# Deepnote Plugin for Codex and Claude Code

Use Deepnote from Codex, Claude Code, or other AI agents. This repo serves all Deepnote agent plugins.

The plugin connects the agent to the hosted Deepnote MCP server at `https://deepnote.com/mcp` and ships skills that teach it how to work with Deepnote workspaces, projects, notebooks, integrations, docs, and notebook runs.

## Install

### Claude Code

```text
/plugin marketplace add deepnote/agent-plugins
/plugin install deepnote@deepnote
```

Then run `/mcp`, choose the Deepnote server, and sign in with OAuth in the browser. OAuth is the only option in Claude Code.

### Codex

```bash
codex plugin marketplace add deepnote/agent-plugins
codex plugin add deepnote@deepnote
```

Then sign in with OAuth:

```bash
codex mcp login deepnote
```

Alternatively, you can use a personal API key instead. Create one in Deepnote under account settings, **API keys**, **Add API key**. Export it in the environment Codex starts from and restart Codex:

```bash
export DEEPNOTE_MCP_TOKEN="<your-deepnote-api-key>"
```

When the variable is set, Codex uses it and skips OAuth. Deepnote API docs: https://deepnote.com/docs/deepnote-api

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

## Good first prompts

- `Which Deepnote workspace am I connected to?`
- `Search my Deepnote workspace for customer retention notebooks.`
- `Inspect this Deepnote notebook and summarize it.`
- `Move these Deepnote notebook blocks to the top of the notebook.`
- `Run this Deepnote notebook with customer_name set to Acme.`
- `Show me the recent runs for this Deepnote notebook.`
- `List Deepnote integrations matching Snowflake.`
- `Show me where this Deepnote integration is used.`
- `Look up the Deepnote docs for scheduled notebooks.`

## Repository layout

```text
.agents/plugins/marketplace.json       Codex marketplace
.claude-plugin/marketplace.json        Claude marketplace
plugins/deepnote/
  .codex-plugin/plugin.json            Codex manifest
  .claude-plugin/plugin.json           Claude manifest
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

```text
/plugin marketplace add /path/to/agent-plugins
/plugin install deepnote@deepnote
```

In Codex:

```bash
codex plugin marketplace add /path/to/agent-plugins
codex plugin add deepnote@deepnote
```

After changing plugin files for local Codex testing, give `plugins/deepnote/.codex-plugin/plugin.json` a fresh `+codex.<cachebuster>` version suffix, rerun `codex plugin add deepnote@deepnote`, and start a new Codex thread. Claude Code picks up skill edits live in sessions started with `--plugin-dir`; manifest and MCP changes need `/reload-plugins` or a restart.

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
