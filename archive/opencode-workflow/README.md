# OpenCode-style workflow

This extension adapts Pi's bundled Plan mode and permission-gate examples.

## Modes

- `/plan` enters read-only Plan mode.
- `/build` enters Build mode.
- `/mode` opens a mode picker.
- `Ctrl+Alt+P` toggles Plan and Build modes.
- `pi --plan` starts a session in Plan mode.

The footer displays the active mode.

### Plan mode

`edit` and `write` are unavailable, shell commands are limited to a read-only allowlist, and the `question` tool remains available. When the model returns a numbered `Plan:` section, Pi offers to execute it, stay in Plan mode, or refine it.

### Build mode

Normal coding tools are available. Every edit/write and the dangerous shell patterns mirrored from `~/.config/opencode/opencode.json` require approval. Approval choices are once, matching rule for the current session, or deny.

Mode, plan progress, and session approvals are restored when the session is resumed or extensions are reloaded.
