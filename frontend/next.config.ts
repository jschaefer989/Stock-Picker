import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Static export – produces an `out/` folder with plain HTML/JS/CSS.
  // This lets PyInstaller bundle the frontend and FastAPI serve it directly.
  output: "export",
  // Emit a trailing slash so every route becomes a real directory/index.html.
  trailingSlash: true,
  // Disable Next.js image optimisation (requires a server; incompatible with
  // static export).
  images: { unoptimized: true },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
