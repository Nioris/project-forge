# Project Forge v4.68.14 — GigaChat Mature-Phase Orchestration

This release hardens the full Phase 2–8 GigaChat workflow after an end-to-end game-production run.

- Completed phases are immutable, durable marker evidence is authoritative, and downstream phases cannot start out of order.
- Repeated broad workspace/skill reads are bounded to reduce token use and prevent compaction loops.
- Common wrong calls are recovered automatically: skill names sent as scripts, missing `.mjs`, HTML files sent to browser tools, shell scripts sent to Node, and malformed evidence lists.
- Corrected playtest, screenshot and local-stage reruns clear obsolete failures instead of poisoning later gates.
- Phase 4 accepts supported target-frame formats, numbered variants and all canonical selection files; Phase 7 recognizes canonical QA skill evidence.
- Local stage always uses finite AI play mode, while browser helpers resolve project-local Puppeteer, dismiss dialogs and serve a safe local Yandex SDK stub.
- Promo capture performs real gameplay actions and produces a valid portrait H.264 video.
