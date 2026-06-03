/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Firebase Hosting serves a static export. `next build` emits the site to
  // `out/`. Keep this in sync with the Firebase `public: "out"` setting.
  output: "export",
  // Static export can't optimise images at runtime.
  images: { unoptimized: true },
  // Optional: trailing slashes make static hosting routing more predictable.
  trailingSlash: true,
};

export default nextConfig;
