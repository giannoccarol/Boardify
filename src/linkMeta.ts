const cache = new Map<string, LinkMeta>();

export interface LinkMeta {
  url: string;
  title: string;
  author?: string;
  thumbnail?: string;
  embed?: string;
  site: "youtube" | "vimeo" | "web";
  host: string;
}

export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s<>"'`]+/i);
  if (m) return m[0].replace(/[),.;]+$/, "");
  const t = text.trim();
  if (/^www\./i.test(t)) return `https://${t.split(/\s/)[0]}`;
  return null;
}

export function youtubeId(url: string): string | null {
  const u = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i
  );
  return u?.[1] ?? null;
}

export function vimeoId(url: string): string | null {
  const u = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return u?.[1] ?? null;
}

export function parseMedia(url: string): LinkMeta {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep */
  }
  const yt = youtubeId(url);
  if (yt) {
    return {
      url,
      title: "YouTube",
      thumbnail: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      embed: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`,
      site: "youtube",
      host,
    };
  }
  const vm = vimeoId(url);
  if (vm) {
    return {
      url,
      title: "Vimeo",
      thumbnail: `https://vumbnail.com/${vm}.jpg`,
      embed: `https://player.vimeo.com/video/${vm}`,
      site: "vimeo",
      host,
    };
  }
  return { url, title: host, site: "web", host };
}

const fetched = new Set<string>();

export async function loadLinkMeta(url: string): Promise<LinkMeta> {
  const base = cache.get(url) ?? parseMedia(url);
  if (!cache.has(url)) cache.set(url, base);
  if (fetched.has(url) || base.site === "web") return cache.get(url)!;
  fetched.add(url);
  try {
    const oembed =
      base.site === "youtube"
        ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
        : base.site === "vimeo"
          ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`
          : null;
    if (oembed) {
      const r = await fetch(oembed);
      if (r.ok) {
        const j = (await r.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
        const next: LinkMeta = {
          ...base,
          title: j.title || base.title,
          author: j.author_name,
          thumbnail: j.thumbnail_url || base.thumbnail,
        };
        cache.set(url, next);
        return next;
      }
    }
  } catch {
    /* offline / CORS */
  }
  return base;
}
