import fs from 'node:fs';
import path from 'node:path';

const OFFICIAL_DISTRIBUTION_SHA256 = new Map([
  ['https://services.gradle.org/distributions/gradle-8.11.1-bin.zip', 'f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6'],
]);

function setProperty(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}=.*$`, 'mu');
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.replace(/\s*$/u, '')}\n${line}\n`;
}

export function hardenGodotGradleTemplate(buildRoot) {
  const wrapperFile = path.join(buildRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  const gradleFile = path.join(buildRoot, 'gradle.properties');
  let wrapper = fs.readFileSync(wrapperFile, 'utf8');
  const encodedUrl = wrapper.match(/^distributionUrl=(.+)$/mu)?.[1]?.trim() || '';
  const distributionUrl = encodedUrl.replaceAll('\\:', ':');
  const distributionSha256 = OFFICIAL_DISTRIBUTION_SHA256.get(distributionUrl) || null;
  if (distributionSha256) wrapper = setProperty(wrapper, 'distributionSha256Sum', distributionSha256);
  fs.writeFileSync(wrapperFile, wrapper, 'utf8');

  let gradle = fs.existsSync(gradleFile) ? fs.readFileSync(gradleFile, 'utf8') : '';
  gradle = setProperty(gradle, 'org.gradle.daemon', 'false');
  gradle = setProperty(gradle, 'org.gradle.vfs.watch', 'false');
  fs.writeFileSync(gradleFile, gradle, 'utf8');
  return { distributionUrl, distributionSha256, daemon: false, vfsWatch: false };
}
