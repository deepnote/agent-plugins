---
name: deepnote-links
description: Use when a task asks for Deepnote URLs, links, project links, notebook links, workspace links, share links, UTM/campaign links, or when a Deepnote response should include clickable links built from MCP project, notebook, or workspace data.
---

# Deepnote Links

Use this skill to build user-facing Deepnote web links from MCP data. Prefer links grounded in `get_me`, `list_projects`, `search`, and `get_notebook` responses instead of guessing from names alone. Every project and notebook link built from Deepnote MCP data must include the UTM parameters below.

## Inputs To Resolve

1. Call `get_me` when workspace-aware links are useful. Use `workspace.id` and `workspace.slug`; do not use the API key name, bearer token, or user email in links or summaries.
2. Resolve the project with `list_projects` or `search`. Use the project `id`, `name`, and `slug` if the MCP response exposes one.
3. Resolve notebook links with `get_notebook` when possible. Use the notebook `id`, `name`, and parent project data.
4. If the exact project or notebook is ambiguous, ask a short clarification or provide a compact candidate list with links only for unambiguous matches.

## Links After Creation

Link the active notebook as defined by the Active Notebook Rule in `deepnote-notebooks`: the notebook returned by `create_notebook` when one was called, otherwise the default notebook of the project returned by `create_project`. If parent project data is missing for that notebook, call `get_notebook` for its ID or use the project ID from the creation workflow before building the link.

## URL Shapes

Use the production web origin `https://deepnote.com` for Deepnote MCP links. Do not derive the web origin from API or MCP hosts.

Prefer workspace-scoped links when `get_me` returns both `workspace.slug` and `workspace.id`:

```text
workspaceSlugWithId = {workspace.slug}-{workspace.id}
workspace link = {origin}/workspace/{workspaceSlugWithId}
project link = {origin}/workspace/{workspaceSlugWithId}/project/{projectSegment}
notebook link = {origin}/workspace/{workspaceSlugWithId}/project/{projectSegment}/notebook/{notebookSegment}
```

If workspace data is not available, use the non-workspace project route:

```text
project link = {origin}/project/{projectSegment}
notebook link = {origin}/project/{projectSegment}/notebook/{notebookSegment}
```

## Slug Segments

Use the most canonical segment available:

1. If the MCP response exposes a `slug`, use it.
2. Otherwise, for simple names, build a readable segment as `{slugifiedName}-{id}`.
3. If exact slugification is uncertain, the name is missing, or the name has unusual characters, use the ID alone.

Deepnote project routing accepts UUID-only project segments, so `{project.id}` is the safest fallback. Notebook routing uses ID-only segments when a notebook name is not available, so `{notebook.id}` is the safest notebook fallback.

Deepnote's readable slugs are created with strict slugification: spaces become hyphens, `/` becomes `-`, unsafe characters are stripped or normalized, and case is preserved. Examples:

```text
Subject Tracker + 0508fc64-b2c8-4982-b6a0-2590c94b6000
=> Subject-Tracker-0508fc64-b2c8-4982-b6a0-2590c94b6000

folder/notebook 10% + a1b2c3d4
=> folder-notebook-10percent-a1b2c3d4
```

## Optional Suffixes

- File paths, when exposed and requested, append after the project segment as `/{encodeURIComponent(filePath)}`.
- Cell or block anchors append as `#anchor`.
- Only generate published app links such as `/app/{authorSlug}/{projectSegment}` or `/streamlit-apps/{streamlitAppId}` when MCP data explicitly exposes the published author slug or Streamlit app ID.

## UTM Parameters

Every project and notebook link gets these parameters. `utm_source` and `utm_campaign` depend on the host:

| Host | `utm_source` | `utm_campaign` |
| --- | --- | --- |
| Codex | `codex` | `openaimcp` |
| Claude Code | `claude-code` | `claudemcp` |
| Claude Desktop or Cowork | `claude-desktop` | `claudemcp` |

```text
https://deepnote.com/<path>?utm_source={host_source}&utm_medium=mcp&utm_campaign={host_campaign}&utm_content={id}&utm_term={tool_name}
```

- `utm_content` is the notebook ID for notebook links and the project ID for project links.
- `utm_term` is the tool that produced the link, such as `list_projects`, `search`, `get_notebook`, or `create_notebook`, or `workspace_summary` for links built by the workspace summary.

## Response Style

Return Markdown links with human-readable labels. Shown here with Codex values; in Claude Code use `utm_source=claude-code&utm_campaign=claudemcp` instead:

```markdown
[Project Name](https://deepnote.com/workspace/workspace-slug-workspace-id/project/project-id?utm_source=codex&utm_medium=mcp&utm_campaign=openaimcp&utm_content=project-id&utm_term=list_projects)
[Notebook Name](https://deepnote.com/workspace/workspace-slug-workspace-id/project/project-id/notebook/notebook-id?utm_source=codex&utm_medium=mcp&utm_campaign=openaimcp&utm_content=notebook-id&utm_term=get_notebook)
```

For lists, inventories, and workspace summaries, put links in the `Project` or `Notebook` column and keep IDs in a separate column only when they help disambiguate. When a table has a `Notebook` column, hyperlink the notebook name itself. If a link cannot be built safely because workspace, project, or notebook data is missing, say which field is missing and how to resolve it.
