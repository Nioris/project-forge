/** Exact classification helpers for host-only Godot diagnostics. */

const ROOT_CERTIFICATE_WARNING = /^ERROR:\s*Failed to read the root certificate store\.\s*$/iu;

export function isGodotRootCertificateWarning(line) {
  return ROOT_CERTIFICATE_WARNING.test(String(line || '').trim());
}

export function godotVersionLine(output) {
  return String(output || '').split(/\r?\n/u)
    .map(line => line.trim())
    .find(line => line && !isGodotRootCertificateWarning(line)) || null;
}
