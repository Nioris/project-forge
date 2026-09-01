# Project Forge v4.68.74

## External signing vault and verified Android production builds

Forge can now create the Android release identity instead of asking an agent or developer to invent
and store signing credentials inside a project.

This release:

- adds an external per-project vault under `forge-data/security/`;
- generates a stable reverse-DNS package ID, alias, strong password and RSA-3072 PKCS12 key once;
- encrypts password material with Windows CurrentUser DPAPI and applies restrictive filesystem ACLs;
- writes only the public identity and certificate SHA-256 to `forge.identity.json`;
- fails closed on missing, moved, linked, corrupted or mismatched vault state and never silently rekeys;
- adds an immutable Godot production Android lane that exports APK and AAB from an isolated source;
- verifies APK with `apksigner`, AAB with `jarsigner`/`keytool`, and binds both to the vault certificate;
- handles Windows `apksigner.bat` without `shell:true` or command-string interpolation;
- blocks keystores, PEPK exports, private keys, passwords and signing-credential documents from Git;
- removes legacy Forge instructions that told agents to put signing files or passwords in projects;
- allows the storefront packager/coordinator to consume and prefer the independent production Android
  manifest while retaining the existing local/debug path for development.

The signing vault proves local artifact identity only. Store account access, upload, moderation and
publication remain separate external facts and still require target-specific receipts.
