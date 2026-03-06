import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = process.cwd();
const assetsRoot = path.join(projectRoot, 'assets');
const assetsJsonPath = path.join(projectRoot, 'assets.json');

const backgroundFiles = new Map([
  ['assets/branding/logo.webp', { maxWidth: 1600, quality: 72 }],
  ['assets/ui/backgrounds/account-background-wide.webp', { maxWidth: 1600, quality: 70 }],
  ['assets/ui/backgrounds/account-background-compact.webp', { maxWidth: 1280, quality: 70 }],
  ['assets/ui/backgrounds/campaign-background-wide.webp', { maxWidth: 1600, quality: 70 }],
  ['assets/ui/backgrounds/campaign-background-compact.webp', { maxWidth: 1280, quality: 70 }],
  ['assets/ui/backgrounds/hub-background-wide.webp', { maxWidth: 1600, quality: 70 }],
  ['assets/ui/backgrounds/hub-background-compact.webp', { maxWidth: 1280, quality: 70 }],
  ['assets/ui/backgrounds/loading-background.webp', { maxWidth: 1600, quality: 70 }],
  ['assets/ui/backgrounds/book-wide.webp', { maxWidth: 1600, quality: 74 }],
  ['assets/ui/backgrounds/book-compact.webp', { maxWidth: 1280, quality: 74 }],
  ['assets/ui/backgrounds/stains-background.webp', { maxWidth: 1600, quality: 72 }],
  ['assets/ui/backgrounds/combat-background.webp', { maxWidth: 1100, quality: 74 }],
  ['assets/ui/illustrations/wallet.webp', { maxWidth: 1200, quality: 76 }],
]);

function shouldOptimize(relativePath) {
  if (backgroundFiles.has(relativePath)) return backgroundFiles.get(relativePath);

  if (relativePath.startsWith('assets/icons/')) {
    return { maxWidth: 256, quality: 82 };
  }

  if (relativePath.startsWith('assets/world/pois/')) {
    return { maxWidth: 256, quality: 82 };
  }

  if (relativePath.startsWith('assets/ui/control-buttons/')) {
    return { maxWidth: 256, quality: 82 };
  }

  if (relativePath.startsWith('assets/ui/illustrations/')) {
    return { maxWidth: 384, quality: 80 };
  }

  if (relativePath === 'assets/entities/characters/default-mole.webp') {
    return { maxWidth: 640, quality: 80 };
  }

  return null;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function identifySize(filePath) {
  const output = execFileSync('magick', ['identify', '-format', '%w %h', filePath], {
    encoding: 'utf8',
  }).trim();
  const [width, height] = output.split(/\s+/).map(Number);
  return { width, height };
}

function optimizeImage(absolutePath, options) {
  const tmpPath = `${absolutePath}.tmp.webp`;
  execFileSync('magick', [
    absolutePath,
    '-resize',
    `${options.maxWidth}x${options.maxWidth}>`,
    '-strip',
    '-quality',
    String(options.quality),
    '-define',
    'webp:method=6',
    '-define',
    'webp:alpha-quality=82',
    tmpPath,
  ]);
  fs.renameSync(tmpPath, absolutePath);
}

function updateAssetJsonDimensions(node, dimensionsByPath) {
  if (!node || typeof node !== 'object') return;

  if (typeof node.path === 'string' && dimensionsByPath.has(node.path)) {
    const { width, height } = dimensionsByPath.get(node.path);
    node.width = width;
    node.height = height;
  }

  for (const value of Object.values(node)) {
    updateAssetJsonDimensions(value, dimensionsByPath);
  }
}

const allFiles = walk(assetsRoot).filter((filePath) => filePath.endsWith('.webp'));
const candidates = allFiles
  .map((absolutePath) => {
    const relativePath = path.relative(projectRoot, absolutePath);
    const options = shouldOptimize(relativePath);
    return options ? { absolutePath, relativePath, options } : null;
  })
  .filter(Boolean);

const dimensionsByPath = new Map();
let beforeBytes = 0;
let afterBytes = 0;

for (const candidate of candidates) {
  const beforeStat = fs.statSync(candidate.absolutePath);
  beforeBytes += beforeStat.size;
  optimizeImage(candidate.absolutePath, candidate.options);
  const afterStat = fs.statSync(candidate.absolutePath);
  afterBytes += afterStat.size;
  dimensionsByPath.set(candidate.relativePath, identifySize(candidate.absolutePath));
}

const assetIndex = JSON.parse(fs.readFileSync(assetsJsonPath, 'utf8'));
updateAssetJsonDimensions(assetIndex, dimensionsByPath);
fs.writeFileSync(`${assetsJsonPath}.tmp`, `${JSON.stringify(assetIndex, null, 2)}\n`);
fs.renameSync(`${assetsJsonPath}.tmp`, assetsJsonPath);

const savedBytes = beforeBytes - afterBytes;
const savedPct = beforeBytes === 0 ? 0 : (savedBytes / beforeBytes) * 100;

console.log(
  `Optimized ${candidates.length} assets. ` +
    `Before: ${(beforeBytes / 1024 / 1024).toFixed(2)} MB, ` +
    `After: ${(afterBytes / 1024 / 1024).toFixed(2)} MB, ` +
    `Saved: ${(savedBytes / 1024 / 1024).toFixed(2)} MB (${savedPct.toFixed(1)}%).`,
);
