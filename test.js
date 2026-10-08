const TT_REGEX = /^(?:https?:\/\/)?(?:(?:www|vm|vt)\.)?tiktok\.com\/(?:(?:@?[A-Za-z0-9._]{1,24}(?:\/(?:video|photo)\/\d+)?)|[A-Za-z0-9]{6,15})(?:\?.*)?$/i;

function tiktokUrlFormatter(value) {
  if (typeof value !== "string") {
    return null;
  }

  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/[?#].*$/, "").replace(/\/+$/, "");

  const ttSiteMatch = normalized.match(/^(?:https?:\/\/)?(?:www\.)?tt\.site\/t\/([A-Za-z0-9]+)$/i);
  if (ttSiteMatch) {
    return `https://vt.tiktok.com/${ttSiteMatch[1]}`;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();

    if (host === "tt.site" || host.endsWith(".tt.site")) {
      const pathCode = url.pathname.match(/^\/t\/([A-Za-z0-9]+)$/i)?.[1];
      return pathCode ? `https://vt.tiktok.com/${pathCode}` : null;
    }

    if (!["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
      return null;
    }

    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/") {
      return null;
    }

    const canonical = `https://www.tiktok.com${pathname}`;
    return TT_REGEX.test(canonical) ? canonical : null;
  } catch {
    // Fall through to raw string validation below.
  }

  const bare = normalized.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (bare.includes("tt.site")) {
    const shortCode = bare.match(/tt\.site\/t\/([A-Za-z0-9]+)$/i)?.[1];
    return shortCode ? `https://vt.tiktok.com/${shortCode}` : null;
  }

  if (!bare.includes("tiktok.com")) {
    return null;
  }

  const formatted = bare.startsWith("tiktok.com")
    ? `https://${bare}`
    : `https://www.${bare}`;

  return TT_REGEX.test(formatted) ? formatted : null;
}

export { TT_REGEX, tiktokUrlFormatter };
export default tiktokUrlFormatter;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TT_REGEX, tiktokUrlFormatter };
  module.exports.default = tiktokUrlFormatter;
}

console.log(tiktokUrlFormatter("tiktokUrlFormatter")); // Example usage