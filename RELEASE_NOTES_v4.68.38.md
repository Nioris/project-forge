# Project Forge v4.68.38

## OpenCode loop budget

Whole-project agents running through OpenCode now have a 64-step ceiling for each model turn. When
the ceiling is reached, OpenCode forces a text response; useful unfinished work remains resumable in
the same session through `forge-agent resume`.

The managed project-local `list` compatibility tool also suppresses an identical successful repeat
within the same session. This addresses the live Qwen benchmark where the model received the correct
directory listing and then requested it repeatedly without producing a final answer.
