function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a string`);
  return value;
}

function requireHttps(value, label) {
  const url = new URL(requireString(value, label));
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return value;
}

export function parseFontCatalog(value) {
  const catalog = requireObject(value, "catalog");
  if (catalog.schemaVersion !== 1) throw new Error("unsupported catalog schema");
  if (catalog.cpfontVersion !== 4) throw new Error("unsupported cpfont version");
  if (catalog.manifestVersion !== 2) throw new Error("unsupported manifest version");
  if (!Array.isArray(catalog.previewSizes) || !Array.isArray(catalog.families)) throw new Error("catalog arrays are missing");
  requireHttps(catalog.siteUrl, "siteUrl");
  requireHttps(catalog.manifestUrl, "manifestUrl");
  requireHttps(catalog.fontMakerUrl, "fontMakerUrl");
  catalog.families.forEach((rawFamily) => {
    const family = requireObject(rawFamily, "family");
    requireString(family.name, "family.name");
    requireString(family.description, "family.description");
    if (!Array.isArray(family.files) || family.files.length !== 7) throw new Error("family must contain seven physical files");
    if (!Array.isArray(family.languages) || !Array.isArray(family.styles)) throw new Error("family metadata arrays are missing");
    const previews = requireObject(family.previews, "family.previews");
    catalog.previewSizes.forEach((size) => requireHttps(previews[String(size)], `preview ${size}`));
    family.files.forEach((rawFile) => {
      const file = requireObject(rawFile, "font file");
      requireHttps(file.downloadUrl, "font download URL");
      if (typeof file.physicalSize !== "number" || typeof file.byteSize !== "number") throw new Error("font file metadata is invalid");
    });
  });
  return catalog;
}

export async function fetchFontCatalog(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`catalog request failed (${response.status})`);
  return parseFontCatalog(await response.json());
}
