# Project Forge v4.68.51

## Phase 4 can no longer pass on CSS or clean console output

Phase 4 now has an executable visual-acceptance contract. Phase 2 freezes the complete screen inventory;
Phase 4 generates a mobile/desktop GPT Image blueprint for every key state from the approved master
reference. The direct batch route sends the master PNG through `/v1/images/edits` and requires the
provider request ID. The host-native route is required to use the same image input, but its local record
is explicitly a hash-bound host attestation rather than independent provider proof. Prompt pack, input
target, model and output hashes are recorded. Phase 2 separately requires the user to approve the full
state/transition inventory; any graph edit invalidates that approval.
`screens-shoot.mjs` switches every declared state through a local runtime adapter and records mobile
412px + desktop frames, strict PNG integrity, hashes/dimensions, overflow, missing states and browser
errors. A separate reviewer session must open and score every captured frame against
that state-specific target and the style bible. Each frame must name at least two matches and three
concrete differences plus a target-distance score; any distance or visual criterion below 6/10, or an
open Critical/Major defect, blocks completion.

The durable gate verifies screenshot freshness after code, production asset, data, font, flow or style
changes. Engine-adjacent HMAC receipts make later project-local capture/review edits detectable;
project-local identity strings alone are not authority, while a process with full host shell access remains
inside the trusted boundary. A Stop hook in Claude and Codex blocks unsupported
“Phase 4 complete” claims,
and GigaChat uses the same central validator. The regression suite explicitly rejects the former
Card Chaos path where substantial CSS and `errors: []` were treated as visual quality. It also rejects
self-declared screen subsets, fake PNG headers, symlink escapes, identical state screenshots and future timestamps.
