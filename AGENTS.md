# Agent Development Guide

Guidelines for AI coding agents working on the Deepnote agent plugins.

## Documentation

The plugin is mostly documentation, so almost every change here has a documentation counterpart. Before opening a pull request, check whether the change makes any of these stale, and update them in the same pull request:

- `plugins/deepnote/skills/*/SKILL.md` and their reference files - what the agent is told about each Deepnote surface (MCP tools, notebooks, runs, links, workspaces, static sites, Streamlit apps)
- `README.md` - installation, authentication, and what the plugin can do
- `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` - plugin names, descriptions, and keywords shown in the marketplaces

The behavior these skills describe is not defined in this repository. The hosted MCP server and the product it exposes are documented under `docs/` in the public [`deepnote`](https://github.com/deepnote/deepnote) repository (published at https://deepnote.com/docs), and its agent-facing references live in `skills/deepnote/references/` there. When a skill and that source disagree, fix the skill — and when a product change is the cause, make sure the documentation pull request lands there too.

Update only the files your change actually affects.

## Pull Requests

Keep each pull request as simple and clean as possible: one purpose per pull request, the smallest diff that achieves it, and no drive-by rewrites of skills the change does not touch.
