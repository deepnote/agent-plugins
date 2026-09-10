---
name: deepnote-static-sites
description: Use when publishing, updating, sharing, or unpublishing a static HTML, CSS, and JavaScript site or dashboard in a Deepnote project, or changing its viewer API access, through the Deepnote CLI or the publish_static_site MCP tool.
---

# Deepnote Static Sites

Tool arguments and the capability boundary are defined in `deepnote-mcp`. `publish_static_site` and `update_project` are advertised only by some servers; check the connected server's tools before relying on them.

## Publishing Workflow

1. Author and validate the HTML, CSS, and JavaScript in the local agent workspace.
2. If a local shell and the Deepnote CLI are available, prefer `deepnote publish ./dist --project-id <uuid>`, especially for local builds and larger sites.
3. If deployment must happen through hosted MCP, use `publish_static_site` only when the connected server advertises it. Send the final file contents in one call.
4. Use the canonical URL returned by the publish operation. Never construct a static-site hostname.
5. To change access later without changing files, use `update_project` with `staticFiles.sharingEnabled` and/or `staticFiles.apiAccessEnabled`. Disabling sharing also disables viewer API access; re-enabling sharing serves the retained files again.
6. Do not execute a notebook to write published files, and do not look for generic file-write tools. `publish_static_site` can write only beneath the static-site root; it cannot upload arbitrary project files.

## Safety

Publishing makes the files available through the project's shared static site to anyone who can view the project. Never include API keys, personal tokens, `.env` contents, or other secrets. Viewer API access is separately opt-in and should be enabled only for browser apps that need the viewer-scoped Deepnote run API.

## Reporting

Report the canonical site URL, the number of files published, the sharing state, and the viewer API state.
