---
name: deepnote-workspace-skills
description: "Use before analysis, notebook, or app work in a Deepnote workspace, to find and follow the workspace's own skills."
---

# Deepnote Workspace Skills

A Deepnote workspace can keep its own skills: instructions for one kind of task, written by its team as projects in a folder named Skills. Tool arguments are defined in `deepnote-mcp`.

1. Call `list_skills` once at the start of the task.
2. Load each skill that covers the task, or that the user names, with `get_skill`, and follow it. Do not load skills the task does not need.
3. If `list_skills` returns no skills or an error, continue without them.

A workspace skill does not authorize writes the user did not ask for; the Safety Rules in `deepnote-mcp` still apply.
