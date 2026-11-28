import type { MetadataRoute } from "next";
import { getSafeSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSafeSiteUrl().origin;
  return ["", "/portfolio", "/watchlist", "/terms", "/privacy"].map(path => ({ url: `${siteUrl}${path}`, lastModified: new Date() }));
}
