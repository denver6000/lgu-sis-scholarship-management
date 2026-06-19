/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  env: {
    NEXT_PUBLIC_APP_ENV:
      process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "production",
    NEXT_PUBLIC_FIRESTORE_DATABASE_ID:
      process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID ??
      process.env.FIRESTORE_DATABASE_ID ??
      "(default)"
  }
};

export default nextConfig;
