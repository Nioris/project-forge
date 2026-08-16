@echo off
:: cx.bat - short alias for Codex with no approval prompts and full sandbox access
:: Copy to a folder in PATH (for example C:\Windows\cx.bat) to use from anywhere.
:: Then just type: cx

codex -a never -s danger-full-access --dangerously-bypass-hook-trust %*
