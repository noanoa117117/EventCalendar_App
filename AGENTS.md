<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Subagent orchestration

Use subagents automatically when they can make an implementation task safer or
faster. Do not wait for the user to explicitly request delegation.

- Before a non-trivial code, schema, auth, or security change, delegate a
  read-only review to the project `auditor` agent. Have it report evidence and
  risks without modifying files.
- After requirements are clear, delegate a bounded implementation task to the
  project `coder` agent. The coder owns only the assigned files and must run
  relevant verification.
- For small, mechanical, isolated edits, the parent may implement directly.
- Do not run more than one writing agent against the same files at once. The
  parent agent reviews each result, runs final checks, and reports the outcome.
- Treat a failed subagent or an unavailable model as non-blocking: continue
  with an available agent or directly, and disclose the fallback in the final
  report.
