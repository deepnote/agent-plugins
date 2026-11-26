---
name: deepnote-workspace-skills
description: "Use before analysis, notebook, or app work in a Deepnote workspace: find the workspace's own skills with `list_skills`, load the ones the task needs with `get_skill`, and follow them."
---

# Deepnote Workspace Skills

A Deepnote workspace can keep its own skills: instructions for one kind of task, written by its team as projects in a folder named Skills. Tool arguments are defined in `deepnote-mcp`.

1. Before analysis, notebook, or app work in a Deepnote workspace, call `list_skills`.
2. Load each skill that covers the task with `get_skill` and its `projectId`, and follow it for the rest of the task unless the user says otherwise. Do not load skills the task does not need. When the user names a skill, load it.
3. A loaded skill can list more of its notebooks. When its instructions need one, call `get_skill` again with the same `projectId` and that notebook's ID as `notebookId`.
4. When the workspace has no skills, or skills are not available in it, continue without them.
