import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["read-excel-file", "unzipper", "write-excel-file"],
};

export default nextConfig;
