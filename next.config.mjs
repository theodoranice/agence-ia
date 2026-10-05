/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "bcryptjs"],
  poweredByHeader: false,
};

export default nextConfig;
