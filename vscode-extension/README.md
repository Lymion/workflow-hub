# Workflow Hub for VS Code

Use your Workflow Hub without leaving the editor. It talks only to the hub's engine on your own machine (`http://127.0.0.1:8765`); it has no API key and sends nothing anywhere else.

| Command | Keys | What it does |
| --- | --- | --- |
| Workflow Hub: Insert snippet | `Ctrl+Alt+I` | Search your snippet library and insert one at the cursor. Marks it as used in this project. |
| Workflow Hub: Ask hub | `Ctrl+Alt+H` | Ask the docs guide. Pick how much help (docs link, bigger hint, tiny snippet). Your open file is attached; a selected error is attached too. The answer opens beside your code. |
| Workflow Hub: Save selection to library | right-click | Saves the selected code to the library inbox. File it later on the hub's Library page. |
| Workflow Hub: Log selection as an error | right-click | Adds the selected error to the error log, and tells you first if you've fixed it before. |

The status bar shows **⚡ Hub** while the engine is running. Click it to ask the hub.

## Install (Windows 11)

1. Make sure the hub is running (open the Workflow Hub app, or run `python -m engine` in the hub folder).
2. In a terminal, from the hub folder:

   ```bash
   cd vscode-extension
   npx @vscode/vsce package --no-dependencies
   code --install-extension workflow-hub-0.1.0.vsix
   ```

3. Reload VS Code. Run `Workflow Hub: Insert snippet` from the Command Palette (`Ctrl+Shift+P`).

To try it without packaging: open the `vscode-extension` folder in VS Code and press `F5`.

## Settings

- `workflowHub.engineUrl`: where the engine runs. Leave it as `http://127.0.0.1:8765` unless you changed the hub's port.

## Tests

```bash
cd vscode-extension
node --test test/lib.test.js
```
