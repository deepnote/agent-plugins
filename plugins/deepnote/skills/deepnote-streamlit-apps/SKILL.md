---
name: deepnote-streamlit-apps
description: Use when creating, changing, testing, or checking a Deepnote Streamlit app project, a Python Streamlit app in `app.py` backed by one notebook.
---

# Deepnote Streamlit Apps

Tool arguments and the capability boundary are defined in `deepnote-mcp`. Notebook edits follow `deepnote-notebooks`, runs follow `deepnote-runs`, and links follow `deepnote-links`.

A Streamlit app project has two parts: the app, Python code in `app.py` hosted on the project machine, and one notebook for exploring data and testing code. Build Streamlit apps in these projects, not by serving a file from a standard project.

## Creating An App

1. Create the project with `create_project` and `projectType: "streamlit_app"`. It starts with its notebook and a placeholder `app.py` that is already served, with `streamlitAppApiAccessEnabled` on.
2. Get the app ID and URL from `list_streamlit_apps`. Do not call `create_streamlit_app`; the project serves one app.
3. Look for data in the project's integrations and files first, then build a small, polished first version. If nothing fits, use clearly labeled sample data and offer to connect real data, unless the user named specific data: then ask where it is.

## Writing The App

- Replace `app.py` with `write_file` and `overwrite: true`, sending the whole file. The app reloads when its code changes.
- MCP cannot read a file's content. To change an app you did not write in this conversation, print it from a scratch code block with `print(open('/work/app.py').read())` first.
- Use the notebook to explore data and test queries before moving them into the app. The app runs separately and can't see the notebook's variables, so it loads its own data.
- To query an integration attached to the project, call `deepnote_toolkit.set_integration_env()` at the top of the app, then `deepnote_toolkit.execute_sql(query, 'SQL_<INTEGRATION_ID>')` with the integration ID uppercased and dashes replaced by underscores. For OAuth integrations, use `get_snowflake_connection(integration_id)` or `get_bigquery_client(integration_id)` from `deepnote_toolkit.streamlit_data_apps`, so each viewer sees data with their own access.
- Every interaction reruns the whole script, so cache data loading. `@st.cache_data(ttl=...)` is shared by all viewers, so use it only for data that is the same for everyone; keep data from OAuth integrations in `st.session_state`.
- Start the app with `st.set_page_config(layout="wide")`, put filters in `st.sidebar`, and show key numbers with `st.metric` in `st.columns`. Lay out dashboards as a title with one line of context, filters, a row of key numbers, one to three main charts, then a detail table. Format numbers and dates for reading, and label units.
- For AI-written text, such as a summary of the data, keep an agent block as the last block of the notebook and ask for that text in its prompt. In the app, compute `StreamlitCloudRunner('<notebook ID>').run({}).agent_text()` from `deepnote_toolkit.streamlit` once per session in `st.session_state` and show it with `st.markdown`. It runs the notebook as the viewer through the app's API access.
- The theme is in `.streamlit/config.toml` next to `app.py`. Keep the Deepnote-like default unless the user asks for another look. Colors apply on the next rerun; font changes may need an app restart.
- Never put secrets or credentials in the app's code.

## Testing

1. Run the app in a scratch code block with `at = AppTest.from_file('/work/app.py', default_timeout=60).run()` from `streamlit.testing.v1`, and print `at.exception` and `at.error`. Run the block with `create_run`, `detached: false`, and its ID in `blockIds`, and read the output with `get_run` and `snapshotDelivery: "blocks"`. Fix what it reports, since the app keeps running when its script fails, and delete scratch blocks when done.
2. Poll `get_streamlit_app_status` until it reports `running`. `starting` does not distinguish a slow boot from a crashed app; if it does not reach `running`, report the last status and suggest checking the app logs in Deepnote. Do not probe the app URL itself.

## Constraints

- The project has one notebook and one app. Creating, renaming, duplicating, or deleting notebooks is rejected.
- `delete_file` on `app.py` deletes the app with it. Do it only when the user asked to remove the app.
- People are invited from the Share menu in Deepnote, not through MCP. Viewers need access to the project; link sharing isn't available.

## Reporting

Report the project, the app URL from `list_streamlit_apps`, and its status, and describe the work as changes to the app. Present the URL as ready only when the status is `running`.
