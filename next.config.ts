import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "thenewbev.com",
      },
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
      {
        protocol: "https",
        hostname: "assets.americancinematheque.com",
      },
      {
        protocol: "https",
        hostname: "media.americancinematheque.com",
      },
      {
        protocol: "https",
        hostname: "www.vistatheaterhollywood.com",
      },
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
      },
      {
        protocol: "https",
        hostname: "assets.ctfassets.net",
      },
      {
        protocol: "https",
        hostname: "cms-assets.webediamovies.pro",
      },
      {
        protocol: "https",
        hostname: "all.web.img.acsta.net",
      },
    ],
  },
};

export default nextConfig;
