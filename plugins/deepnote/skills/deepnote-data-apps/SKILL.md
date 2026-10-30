---
name: deepnote-data-apps
description: Use when creating, changing, testing, or publishing a Deepnote data app project, a web page in `_deepnote_static/index.html` backed by one notebook.
---

# Deepnote Data Apps

Tool arguments and the capability boundary are defined in `deepnote-mcp`. Notebook edits follow `deepnote-notebooks`, runs follow `deepnote-runs`, and links follow `deepnote-links`.

A data app project has two parts: the page, a responsive HTML page in `_deepnote_static/index.html` with inline CSS and JavaScript, and one notebook that runs the SQL and Python behind it.

## Creating An App

1. Create the project with `create_project` and `projectType: "data_app"`. It starts with its notebook and a placeholder page, with sharing and viewer API access already on; do not change them.
2. Look for data in the project's integrations and files first, then build a small, polished first version. If nothing fits, use clearly labeled sample data and offer to connect real data, unless the user named specific data: then ask where it is.

## The Notebook

- Keep one short block that computes only the data the page needs and displays it as the notebook's only JSON output:

  ```python
  import json
  from IPython.display import display
  app_data = {'rows': json.loads(df.to_json(orient='records', date_format='iso'))}
  display({'application/json': app_data}, raw=True)
  ```

- Queries, heavy computation, credentials, and authenticated calls stay in the notebook. The page only filters, sorts, and charts.
- The app's controls are the notebook's input blocks. Reuse them by name and add only the missing ones.
- For AI-written text, such as a summary of the data, keep an agent block as the last block and ask for that text in its prompt. The page reads it as `agentBlockSummary`.
- The page shows each viewer's own newest successful detached run, so running blocks in the editor changes nothing. After changing the notebook, start a run with `create_run` and `detachedRunStorageMode: "readonly"`, wait until `get_run` with `snapshotDelivery: "blocks"` reports success, and check the JSON output's keys, types, and first rows before wiring the page to it. Changes to the page alone need no new run.

## The Page

- Read the current page with `read_file` before changing it, unless you wrote it in this conversation, and write the whole page with `write_file` at `_deepnote_static/index.html` and `overwrite: true`.
- Start its `<head>` with `<script src="https://deepnote.com/static/app-client/v1.js"></script>`, before any other script, and load CDN scripts with `crossorigin="anonymous"`. The script exposes `Deepnote.connect()`, not React components or `DeepnoteApp`.
- Connect with `const notebook = Deepnote.connect().notebook('<notebook ID>')`, using the notebook ID from `get_project`.
  - On load, render `const {appData, agentBlockSummary} = await notebook.appData()`. It throws when the viewer has no run yet, their results expired, or the run has no JSON output: show the message in an empty state with a button that runs the notebook with `{}`.
  - `const {run} = await notebook.run(values, {onProgress})` runs the whole notebook for this viewer. When `run.status === 'success'`, render `await notebook.appData()` again. Run it on submission, or with `{}` from a refresh button when the app has no inputs.
  - Build the form from `await notebook.inputs()`, which returns each input's label, value, min, max, step, and options, so input changes in the notebook reach the app. Never overwrite input variables with hardcoded values. Values are keyed by input name and are strings (sliders too), booleans, or string arrays.
- Show loading, empty, and error states, prevent duplicate submissions, and handle rejected calls, missing results, and `run.error`. When a failed run has no error text, show its status and point to run history.
- Lay out dashboards as a title with one line of context, filters, a row of key numbers, one to three main charts, then a detail table. Format numbers and dates for reading, and label units.
- To show another app's data, connect to that app's notebook instead of copying its queries. Find its ID with `search`, check its JSON output with a read-only run, and do not change that notebook. Its keys can change, so show an error state when they are missing.
- Never put API keys, tokens, `.env` contents, or other secrets in the page. Keep the calm, Deepnote-like look unless the user asks for another.

## Testing

Test a changed-input submission with `create_run`, its `inputs`, and `detachedRunStorageMode: "readonly"`, then read it with `get_run` and `snapshotDelivery: "blocks"`. When it fails, inspect its status and output and fix the cause; when it is still pending after several checks, point to run history without claiming the flow works. MCP cannot load the page in a browser, so say the page itself was not checked and ask the user to open it; do not install browser tools in the notebook to check it. Delete scratch blocks when done.

## Publishing

A new data app is unpublished, so only the project's editors can open it. Publish it to its viewers only when the user asks, with `update_project` and `staticFiles.published: true`; `false` makes it editor-only again. Viewers need access to the project and the workspace must allow static file sharing; link sharing isn't available. People are invited from the Share menu in Deepnote, not through MCP.

## Reporting

Report the project, the app URL from `staticFiles.url` in `get_project`, and whether the app is published, and describe the work as changes to the app. Never construct the URL.
