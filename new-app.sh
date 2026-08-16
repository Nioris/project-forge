#!/usr/bin/env bash
set -e
node "$(cd "$(dirname "$0")" && pwd)/scripts/new-project.mjs" "$@" --type app
