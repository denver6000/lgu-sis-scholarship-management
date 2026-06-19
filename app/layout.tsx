import type { Metadata } from "next";
import { AuthProvider } from "./auth-provider";
import { getSessionUser } from "./lib/server/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Student Information System",
  description: "Next.js migration shell for the San Jose City Educational Assistance Student Information System."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialUser = await getSessionUser();

  return (
    <html lang="en">
      <body>
        <AuthProvider initialUser={initialUser}>{children}</AuthProvider>
      </body>
    </html>
  );
}
