export function toAssetUrl(assetKey: string): string {
  const key = assetKey.replace(/^\/+/, "");
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/assets/${encoded}`;
}

