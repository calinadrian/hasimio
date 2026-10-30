import {type Meta,safeHttp} from './media';

// Artwork lookup is independent of catalog/metadata providers. Catalogs can
// arrive before TVmaze's rate-limited enrichment, including cached library rows.
export function posterSources(meta:Pick<Meta,'id'|'poster'>):string[]{
  const sources=[safeHttp(meta.poster)];
  if(/^tt\d+$/.test(meta.id))sources.push(`https://images.metahub.space/poster/medium/${meta.id}/img`);
  return [...new Set(sources.filter((source):source is string=>!!source))];
}
