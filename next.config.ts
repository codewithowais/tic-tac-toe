import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets you open the dev server from 127.0.0.1 or another device on your network.
  allowedDevOrigins: ["127.0.0.1", "*.local"],
};

export default nextConfig;
