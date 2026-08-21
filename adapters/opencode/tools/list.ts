import { tool } from "@opencode-ai/plugin"
import { readdir } from "node:fs/promises"
import path from "node:path"

/** Compatibility alias for models that call `list` instead of OpenCode's `glob`. */
export default tool({
  description: "List files and directories inside the current project. Prefer glob for recursive pattern searches.",
  args: {
    path: tool.schema.string().optional().describe("Project-relative directory; defaults to the project root"),
    directory: tool.schema.string().optional().describe("Alias for path"),
  },
  async execute(args, context) {
    const root = path.resolve(context.worktree || context.directory)
    const requested = String(args.path || args.directory || ".").replaceAll("\\", "/")
    const target = path.resolve(root, requested)
    if (target !== root && !target.startsWith(root + path.sep)) return "Blocked: path is outside the project."
    try {
      const entries = await readdir(target, { withFileTypes: true })
      return entries.slice(0, 500).map(entry => `${entry.isDirectory() ? "d" : "f"} ${entry.name}`).join("\n")
        + (entries.length > 500 ? `\n... ${entries.length - 500} more; use glob for a narrower result` : "")
    } catch (error) {
      return `List failed: ${error instanceof Error ? error.message : String(error)}`
    }
  },
})
