import { tool } from "@opencode-ai/plugin"
import { readdir } from "node:fs/promises"
import path from "node:path"

const lastSuccessfulTargetBySession = new Map<string, string>()

/** Compatibility alias for models that call `list` instead of OpenCode's `glob`. */
export default tool({
  description: "List one project directory once. Do not repeat an identical successful call; prefer glob for recursive pattern searches.",
  args: {
    path: tool.schema.string().optional().describe("Project-relative directory; defaults to the project root"),
    directory: tool.schema.string().optional().describe("Alias for path"),
  },
  async execute(args, context) {
    const root = path.resolve(context.worktree || context.directory)
    const requested = String(args.path || args.directory || ".").trim().replaceAll("\\", "/") || "."
    const target = path.resolve(root, requested)
    if (target !== root && !target.startsWith(root + path.sep)) return "Blocked: path is outside the project."
    if (lastSuccessfulTargetBySession.get(context.sessionID) === target) {
      return `Repeated list call blocked for "${requested}": the complete result is already in the conversation. Do not call list again; use that result or glob for a different search.`
    }
    try {
      const entries = await readdir(target, { withFileTypes: true })
      lastSuccessfulTargetBySession.set(context.sessionID, target)
      if (lastSuccessfulTargetBySession.size > 500) {
        const oldest = lastSuccessfulTargetBySession.keys().next().value
        if (oldest) lastSuccessfulTargetBySession.delete(oldest)
      }
      return entries.slice(0, 500).map(entry => `${entry.isDirectory() ? "d" : "f"} ${entry.name}`).join("\n")
        + (entries.length > 500 ? `\n... ${entries.length - 500} more; use glob for a narrower result` : "")
    } catch (error) {
      return `List failed: ${error instanceof Error ? error.message : String(error)}`
    }
  },
})
