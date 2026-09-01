# Project Forge v4.68.75

## Same-volume Android release publication

This hotfix repairs the final atomic publication step of the production Android builder on Windows
workstations where the project and the OS temporary directory are on different drives.

The APK and AAB were already built and certificate-verified, but `rename` cannot move a directory from
`C:` to `F:` and correctly returned `EXDEV`. Forge now keeps private build work in the OS temp directory,
copies only verified public artifacts into a uniquely named sibling stage on the project volume, and
atomically renames that stage into the immutable release directory.

Failed publication cleans only the exact validated stage and never leaves a partial version. Signing
identity, package ID, private key and encrypted passwords are unchanged.
