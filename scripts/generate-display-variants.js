const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const rootDir = path.resolve(__dirname, "..");
const indexPath = path.join(rootDir, "index.html");
const outputDir = path.join(rootDir, "webp", "responsive");
const manifestPath = path.join(rootDir, "assets", "responsive-images.generated.js");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const imageMatches = Array.from(indexHtml.matchAll(/<img\b[^>]*\ssrc="(\.\/webp\/[^"]+)"/g));
const sources = Array.from(new Set(imageMatches.map((match) => match[1])));

const BANNER_BASENAMES = new Set(["AN_08516"]);

const toPosixPath = (filePath) => filePath.split(path.sep).join("/");

const getWidths = ({ width, height, basename }) => {
  if (BANNER_BASENAMES.has(basename)) {
    return [640, 960, 1280, 1600].filter((value) => value <= width);
  }

  if (width >= height) {
    return [480, 768, 960, 1280].filter((value) => value <= width);
  }

  return [320, 480, 640, 960].filter((value) => value <= width);
};

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const buildVariant = async (absoluteSourcePath, basename, width) => {
  const fileName = `${basename}-${width}.webp`;
  const absoluteTargetPath = path.join(outputDir, fileName);

  if (!fs.existsSync(absoluteTargetPath)) {
    await sharp(absoluteSourcePath)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: BANNER_BASENAMES.has(basename) ? 76 : 74, effort: 5 })
      .toFile(absoluteTargetPath);
  }

  return `./${toPosixPath(path.relative(rootDir, absoluteTargetPath))}`;
};

const buildPlaceholder = async (absoluteSourcePath, basename, width, height) => {
  const placeholderWidth = width >= height ? 128 : 96;
  const fileName = `${basename}-tiny.webp`;
  const absoluteTargetPath = path.join(outputDir, fileName);

  if (!fs.existsSync(absoluteTargetPath)) {
    await sharp(absoluteSourcePath)
      .resize({ width: placeholderWidth, withoutEnlargement: true })
      .blur(0.6)
      .webp({ quality: 54, effort: 4 })
      .toFile(absoluteTargetPath);
  }

  return `./${toPosixPath(path.relative(rootDir, absoluteTargetPath))}`;
};

const buildManifest = async () => {
  ensureDir(outputDir);

  const manifest = {};

  for (const source of sources) {
    const relativeSourcePath = source.replace(/^\.\//, "");
    const absoluteSourcePath = path.join(rootDir, relativeSourcePath);

    if (!fs.existsSync(absoluteSourcePath)) {
      continue;
    }

    const { width, height } = await sharp(absoluteSourcePath).metadata();
    if (!width || !height) {
      continue;
    }

    const parsed = path.parse(absoluteSourcePath);
    const widths = getWidths({ width, height, basename: parsed.name });
    const safeWidths = widths.length ? widths : [width];
    const sourcesForImage = [];
    const placeholder = await buildPlaceholder(absoluteSourcePath, parsed.name, width, height);

    for (const variantWidth of safeWidths) {
      const url = await buildVariant(absoluteSourcePath, parsed.name, variantWidth);
      sourcesForImage.push({ width: variantWidth, url });
    }

    manifest[source] = {
      aspectRatio: Number((width / height).toFixed(4)),
      orientation: width >= height ? "landscape" : "portrait",
      placeholder,
      sources: sourcesForImage,
    };
  }

  const manifestContent = `window.responsiveImageManifest = ${JSON.stringify(manifest, null, 2)};\n`;
  fs.writeFileSync(manifestPath, manifestContent);
};

buildManifest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
