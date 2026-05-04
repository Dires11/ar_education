import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AR Educational Center",
  description: "CRM for AR Educational Center",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignUpUrl="/dashboard">
      <html lang="en" className="font-sans">
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
