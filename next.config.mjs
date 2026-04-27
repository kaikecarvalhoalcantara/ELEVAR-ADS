/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Remotion + suas dependências nativas (rspack, chrome, esbuild) NÃO podem
  // ser empacotadas pelo webpack do Next — precisam ser carregadas em runtime
  // como módulos Node nativos.
  serverExternalPackages: [
    "remotion",
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/cli",
    "@remotion/google-fonts",
    "@remotion/compositor-win32-x64",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-linux-arm64-musl",
    "@rspack/core",
    "@rspack/binding",
    "@rspack/binding-win32-x64-msvc",
    "esbuild",
    "puppeteer-core",
  ],
};

export default nextConfig;
