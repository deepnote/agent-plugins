---
name: deepnote-streamlit-apps
description: Use when creating, listing, linking to, or checking the serving status of Streamlit apps backed by files in a Deepnote project.
---

# Deepnote Streamlit Apps

Tool arguments and the capability boundary are defined in `deepnote-mcp`. Link handling follows `deepnote-links`.

## Workflow

1. Resolve the project and use `get_project` to confirm that the requested entrypoint is an existing file.
2. Call `list_streamlit_apps` before creating one. If that file is already served, reuse its app ID and URL; one app per entrypoint is allowed.
3. When the user asks to serve the file, call `create_streamlit_app`. Creation restarts the project machine, so the returned URL may not be live immediately.
4. Poll `get_streamlit_app_status` until it reports `running` or until a reasonable task deadline. The status may briefly be `unavailable` while the machine stops and then `starting` while it boots. Do not probe the app URL itself.
5. If the app does not reach `running`, report its last status and suggest checking the app logs in Deepnote; `starting` does not distinguish a slow boot from a crashed app.

## Constraints

- Use the URL returned by `create_streamlit_app` or `list_streamlit_apps`; never build it from the app ID.
- Creating an app requires project edit access and an available app port. A conflict can mean the entrypoint is already served or no ports remain.
- The Streamlit tools cannot create or upload the entrypoint file, and MCP can only supply one by copying an existing file from another Deepnote project. MCP cannot delete a Streamlit app.

## Reporting

Report the project, entrypoint, app ID, URL, and current serving status. Present the URL as ready only when the status is `running`.
