# Deepnote

Work with your Deepnote workspace from Claude. Search projects, read and edit notebooks, run them and read the results, manage integrations and project machines, and build data apps and Streamlit apps.

## What the plugin includes

- A connection to the hosted Deepnote MCP server at `https://deepnote.com/mcp`. You sign in with your Deepnote account through OAuth, and Claude can only see and change what your account already has access to.
- Seven skills that teach Claude how to use the server well: shared rules and the tool catalogue, workspace and project inspection, notebooks and blocks, notebook runs and machines, project and notebook links, data apps, and Streamlit apps.

If you already added the Deepnote connector in Claude, the plugin uses the same server, so you see one set of Deepnote tools.

## Install in Claude Code

```text
/plugin install deepnote --marketplace deepnote/agent-plugins
```

Then run `/mcp`, choose the Deepnote server, and sign in.

Installed this way, the plugin also includes a script that previews data apps on your computer before publishing. The directory edition leaves that script out.

## Requirements

- A Deepnote account with access to the workspace you want to use.
- A workspace whose plan includes API access, with MCP access enabled by a workspace admin.
- Edit access to a project for anything that creates, changes, runs, or deletes content in it.

## Things to try

- Which Deepnote workspace am I connected to?
- Search my Deepnote workspace for customer retention notebooks.
- Inspect this Deepnote notebook and summarize it.
- Run this Deepnote notebook with customer_name set to Acme.
- Show me where this Deepnote integration is used.
- Build a data app that shows weekly signups by country.

## Data and network access

- The plugin sends requests to `https://deepnote.com/mcp` on your behalf. What Claude reads there, such as notebook content, run outputs, file contents, and integration metadata, becomes part of your conversation with Claude.
- The plugin has no hooks, ships no scripts, and runs nothing on your computer.
- Data app pages that Claude writes with this skill load the Deepnote app client from `deepnote.com`, the Tailwind CSS browser build from `cdn.jsdelivr.net`, and the Inter font from `fonts.googleapis.com`.

## Links

- Documentation: https://deepnote.com/docs/deepnote-mcp
- Support: https://deepnote.com/docs/support
- Privacy policy: https://deepnote.com/privacy
- Terms of service: https://deepnote.com/terms
- Source: https://github.com/deepnote/agent-plugins

## License

Apache-2.0
