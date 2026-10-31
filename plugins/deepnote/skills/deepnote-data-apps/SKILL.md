---
name: deepnote-data-apps
description: Use when creating, changing, testing, or publishing a Deepnote data app project, a web page in `_deepnote_static/index.html` backed by one notebook.
---

# Deepnote Data Apps

Tool arguments and the capability boundary are defined in `deepnote-mcp`. Notebook edits follow `deepnote-notebooks`, runs follow `deepnote-runs`, and links follow `deepnote-links`.

A data app project has two parts: the page, a responsive HTML page in `_deepnote_static/index.html` that can load its own CSS, JavaScript, and images from that folder, and one notebook that runs the SQL and Python behind it.

## Creating An App

1. Create the project with `create_project` and `projectType: "data_app"`. It starts with its notebook and a placeholder page, with sharing and viewer API access already on; do not change them. Never add a page to a project of another type or publish one with the Deepnote CLI's `deepnote publish`; those are the legacy static sites.
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

- `index.html` can load other files from `_deepnote_static/` by relative path, such as `styles.css`, `app.js`, or `logo.svg`. Keep the app client script and the Tailwind setup below in `index.html`, and move the rest into files of their own when that keeps the page easier to change.
- Keep a local copy of `_deepnote_static/` in a folder of its own. Read each file the page loads or you will change with `read_file` once, unless you wrote it in this conversation; `get_project` lists them. `read_file` reads only text, so binary images show as broken in the local preview without failing the check. Edit the files there, and once the local check in Testing passes, push each new or changed file with `write_file` at its path under `_deepnote_static/` and `overwrite: true`. Where you cannot run local commands, write the files with `write_file` directly.
- Start the `<head>` of `index.html` with `<script src="https://deepnote.com/static/app-client/v1.js"></script>`, before any other script, and load CDN scripts with `crossorigin="anonymous"`. The script exposes `Deepnote.connect()`, not React components or `DeepnoteApp`.
- Style the page with Tailwind CSS 4.3.3. After the app client script, add the Tailwind browser build, Inter, and the default theme below, then use its colors in classes (`bg-surface`, `text-muted`, `border-border`, `bg-accent`, `text-positive`, ...). Its dark values apply on their own, so don't add `dark:` variants for theme colors. Chart code reads series colors with `getComputedStyle(document.documentElement).getPropertyValue('--color-chart-1')`.

  ```html
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3" crossorigin="anonymous"></script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
  <style type="text/tailwindcss">
    @theme static {
      --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
      --color-surface: #ffffff; --color-surface-subtle: #f8fafc; --color-surface-muted: #edf2f7;
      --color-fg: #334052; --color-muted: #606f85; --color-subtle: #8e9db4;
      --color-border: #dde4ee; --color-border-strong: #c2cddc;
      --color-accent: #146efe; --color-accent-hover: #0a56d0;
      --color-positive: #059669; --color-attention: #aa5413; --color-critical: #e11d48;
      --color-chart-1: #2266d3; --color-chart-2: #cc8bff; --color-chart-3: #0e9384; --color-chart-4: #8dca4c; --color-chart-5: #f9732c;
      --color-chart-6: #c8338a; --color-chart-7: #eec026; --color-chart-8: #61646c; --color-chart-9: #4e2b89; --color-chart-10: #6e7ba4;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --color-surface: #141c2f; --color-surface-subtle: #1a273d; --color-surface-muted: #233149;
        --color-fg: #c2cddc; --color-muted: #8e9db4; --color-subtle: #606f85;
        --color-border: #334052; --color-border-strong: #46566d;
        --color-accent: #498ffe; --color-accent-hover: #79acfe;
        --color-positive: #10b981; --color-attention: #e69a1a; --color-critical: #f43f5e;
      }
    }
    body { @apply bg-surface text-fg text-sm antialiased; }
  </style>
  ```

- By default, make it calm and compact like Deepnote without copying Deepnote's UI: neutral surfaces with one blue accent, 1px borders, `rounded-lg` controls and `rounded-xl` cards, sentence case, solid backgrounds without gradients, no emoji or decorative icons, shadows only on floating elements, and at most one primary button per view. When the user asks for another look or their brand, change the theme and classes freely.
- Connect with `const notebook = Deepnote.connect().notebook('<notebook ID>')`, using the notebook ID from `get_project`.
  - On load, render `const {appData, agentBlockSummary} = await notebook.appData()`. It throws when the viewer has no run yet, their results expired, or the run has no JSON output: show the message in an empty state with a button that runs the notebook with `{}`.
  - `const {run} = await notebook.run(values, {onProgress})` runs the whole notebook for this viewer. When `run.status === 'success'`, render `await notebook.appData()` again. Run it on submission, or with `{}` from a refresh button when the app has no inputs.
  - Build the form from `await notebook.inputs()`, which returns each input's label, value, min, max, step, and options, so input changes in the notebook reach the app. Never overwrite input variables with hardcoded values. Values are keyed by input name and are strings (sliders too), booleans, or string arrays.
- Show loading, empty, and error states, prevent duplicate submissions, and handle rejected calls, missing results, and `run.error`. When a failed run has no error text, show its status and point to run history.
- Lay out dashboards as a title with one line of context, filters, a row of key numbers, one to three main charts, then a detail table. Format numbers and dates for reading, and label units.
- To show another app's data, connect to that app's notebook instead of copying its queries. Find its ID with `search`, check its JSON output with a read-only run, and do not change that notebook. Its keys can change, so show an error state when they are missing.
- Never put API keys, tokens, `.env` contents, or other secrets in the page or its files.

## Testing

Test a changed-input submission with `create_run`, its `inputs`, and `detachedRunStorageMode: "readonly"`, then read it with `get_run` and `snapshotDelivery: "blocks"`. When it fails, inspect its status and output and fix the cause; when it is still pending after several checks, point to run history without claiming the flow works. Delete scratch blocks when done.

Check the page locally before pushing it, against the same API and data it gets in Deepnote:

1. Mint a viewer token with `create_data_app_token` for the project. Pass it only on the command line; never write it into files or answers.
2. Run `node scripts/app-dev.mjs <folder with index.html> --token <token> --api-origin <apiOrigin> --check`, with the script from this skill's directory. It needs Node 18 or later and an installed Chrome, Chromium, or Edge. It embeds the page the way Deepnote does, prints the page's errors and API calls, and exits non-zero on an app error, a failed API call, or a timeout. Fix the page and rerun until it passes. The token is short-lived: when the script says the API rejected it, mint a new one and rerun.
3. Look at the page. With a browser tool, run the script without `--check` in the background, open the preview URL it prints, and try the inputs; runs started there are real runs. Without one, say that only the check's output was reviewed. Give the user the preview URL when they want to try the page before you push it.
4. Push the new and changed files.

A client that cannot run local commands, such as ChatGPT or claude.ai, cannot load the page: say the page itself was not checked and ask the user to open it. Do not install browser tools in the notebook to check it.

## Publishing

A new data app is unpublished, so only the project's editors can open it. Publish it to its viewers only when the user asks, with `update_project` and `staticFiles.published: true`; `false` makes it editor-only again. Viewers need access to the project and the workspace must allow static file sharing; link sharing isn't available. People are invited from the Share menu in Deepnote, not through MCP.

## Reporting

Report the project, the app URL from `staticFiles.url` in `get_project`, and whether the app is published, and describe the work as changes to the app. Never construct the URL.
