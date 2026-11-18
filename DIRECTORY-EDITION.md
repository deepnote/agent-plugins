# Claude plugin directory edition

This branch (`Claude`) is the version of the Deepnote plugin that the Claude plugin directory tracks. It is `main` with a few items removed. Do not merge it into `main`.

## Why it exists

The directory accepts scripts, file types outside its allowed list, and extra config fields only from Verified organizations. Deepnote's Claude organization is not Verified, so the directory refused the plugin as it is on `main`. `main` stays unchanged for Codex and for the Claude Code marketplace in this repository.

## How it differs from main

All differences are inside `plugins/deepnote/`, the only folder the directory reads:

- `skills/deepnote-data-apps/scripts/app-dev.mjs` is removed. The directory does not accept scripts.
- `assets/deepnote-icon.svg` is removed. SVG is not an allowed image type. The listing uses `assets/icon.png`.
- `.codex-plugin/plugin.json` is removed. It is not used by Claude and referred to the SVG.
- `.mcp.json` has no `bearer_token_env_var` field. Claude signs in with OAuth.
- `skills/deepnote-data-apps/SKILL.md` has no local preview steps. It tells Claude to say the page was not checked and to ask the user to open it.
- `README.md` in the plugin folder describes this edition.

The Codex marketplace file in `.agents/` and the root `README.md` are left as they are on `main`. They do not apply to this branch.

## Updating it for a release

1. Merge `main` into this branch: `git checkout Claude && git merge main`.
2. Resolve conflicts by keeping this branch's side for the items listed above. A change on `main` to a removed file shows up as a modify/delete conflict; keep the deletion.
3. Check that nothing in `plugins/deepnote/` refers to the removed files: `grep -rn -E "app-dev|scripts/|bearer_token|\.svg" plugins/deepnote`. The one expected match is the `logo.svg` example in the data apps skill.
4. Run `claude plugin validate --strict plugins/deepnote`.
5. Push. The directory scans the new commit and shows the result in the developer portal.

## Retiring it

Once the organization is Verified, set the plugin's tracked branch back to `main` on its Settings tab in the developer portal, then delete this branch.
