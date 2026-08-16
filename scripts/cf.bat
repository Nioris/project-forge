@echo off
:: cf.bat - short alias for claude --dangerously-skip-permissions
:: Copy to C:\Windows\cf.bat to use from anywhere
:: Then just type: cf

claude --dangerously-skip-permissions %*
