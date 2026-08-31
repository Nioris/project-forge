/** Enable the texture-import mode required by official Godot Android libraries. */
export function withAndroidEtc2AstcImport(value) {
  const source = String(value || '');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const setting = 'textures/vram_compression/import_etc2_astc=true';
  const existing = /^textures\/vram_compression\/import_etc2_astc\s*=.*$/mu;
  if (existing.test(source)) return source.replace(existing, setting);
  const rendering = /^\[rendering\][ \t]*\r?$/mu;
  if (rendering.test(source)) return source.replace(rendering, `[rendering]${newline}${setting}`);
  const separator = source && !source.endsWith('\n') ? newline : '';
  return `${source}${separator}${newline}[rendering]${newline}${setting}${newline}`;
}
