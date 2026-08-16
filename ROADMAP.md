# Project Forge Roadmap

This roadmap describes the direction of Project Forge. It is not a promise of specific dates or features, and priorities may change based on real-world use and contributor feedback.

Current public baseline: **v4.68.2**.

## Product principles

Project Forge will continue to follow a few stable principles:

- **terminal-first** — the core workflow must not depend on a particular IDE;
- **provider-neutral runtime** — supported agents should share the same project state, phases and verification contract without hiding their native strengths;
- **exactly 9 canonical phases** — new capabilities should fit the existing lifecycle instead of creating parallel pseudo-phases;
- **reproducible project state** — STOP-points, checks and release gates should make work resumable and auditable;
- **secrets stay outside project repositories**;
- **no fake integrations** — Forge should report unavailable providers/tools honestly rather than simulate support;
- **open-source core** — Project Forge is distributed under Apache License 2.0 and should remain useful without paid services.

## Near-term direction

### 1. Runtime reliability

- strengthen regression and compatibility checks across supported terminal hosts;
- improve diagnostics, recovery and resume behavior;
- make versioning and release validation more consistent;
- reduce configuration drift between Forge-managed projects.

### 2. Multi-agent interoperability

- deepen the shared runtime contract between Claude Code, OpenAI Codex and GigaChat;
- make it easier to add new terminal agents through adapters rather than duplicating the Forge core;
- improve hand-off of project state between agents and sessions;
- keep native provider features available where they add real value.

### 3. Developer experience

- simplify first-run setup and project bootstrap;
- expand practical examples and reference projects;
- improve error messages and `doctor` diagnostics;
- make common workflows discoverable without requiring users to read the entire documentation first.

### 4. AI Studio

- improve prompt compilation and reusable generation workflows;
- expand image, 3D and visual-QA provider adapters;
- add stronger reproducibility and artifact tracking for generated assets;
- keep generated content connected to the same 9-phase project lifecycle.

### 5. Platform integrations and release gates

Continue improving release tooling and validation for:

- Yandex Games;
- VK Mini Apps;
- Telegram Mini Apps;
- OK;
- MAX;
- RuStore;
- Web;
- Steam;
- VK Play.

The goal is not only to add more platform names, but to make existing integrations more reliable and easier to verify before release.

### 6. Extensibility and community contributions

- document a clearer extension model for skills, agents and platform adapters;
- make external contributions easier to review and test;
- improve contribution documentation and examples;
- avoid turning the core into a collection of provider-specific forks.

## Longer-term exploration

Areas we want to explore without committing to a specific release yet:

- additional terminal AI providers;
- stronger local/offline model support where practical;
- richer project observability and dashboard diagnostics;
- reusable project templates and verified starter kits;
- better automation for multi-project Forge fleets;
- optional integrations around CI/CD and release infrastructure.

## What we do not want Forge to become

Project Forge is not intended to become another generic chat interface or a thin prompt collection. The project should remain an engineering runtime that connects agents to an explicit lifecycle, project state, tools and release checks.

## Feedback

Roadmap priorities should be driven by real usage. Bug reports, compatibility reports, feature proposals and contributions are welcome through GitHub Issues and pull requests.

Project Forge is developed by [Rodrik Studio](https://rodrik.dev) / Rodrik LTD.

Original author: **Aleksandr Krasnokutskiy**.
