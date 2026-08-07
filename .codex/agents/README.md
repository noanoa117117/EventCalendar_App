# Project subagents

Codex loads the project-scoped agent definitions in this directory when it
spawns subagents.

Use `auditor` for read-only review:

```text
Use the auditor subagent to review this change. Do not modify files; return
findings with file references and severity.
```

Use `coder` only for a clearly bounded implementation task:

```text
Use the coder subagent to implement the approved change, then report the files
changed and validation performed.
```

For a change that benefits from both roles, request the auditor first, resolve
any blocking findings, then delegate the isolated fix to coder. Do not have
multiple writing agents edit the same files concurrently.

`coder` requests `gpt-5.6-luna`. If Luna is unavailable in the active Codex
client or workspace, select an available model for that task (normally Terra)
or change the model in `coder.toml`.
