# Project Forge v4.68.28 — safe project Git secret scan

The first real Qwen-only project revealed that a bare PEM example in Forge-managed RuStore documentation blocked the initial local Git checkpoint.

- PEM secret detection now requires a matching private-key header/footer and a plausible encoded body.
- Documentation placeholders and instructions containing bare PEM markers no longer block project creation.
- Complete plausible private keys remain blocked.
- Offline regression covers both the false-positive and real-secret cases.

No provider/model behavior changed from v4.68.27.
