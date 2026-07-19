import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Voice Remix — Speak your arrangement",
    description: "Edit a musical arrangement with natural language and hear the result instantly.",
    icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
    openGraph: {
      title: "Voice Remix",
      description: "Say it. See it. Shape it.",
      images: [{ url: imageUrl, width: 1536, height: 864, alt: "Voice Remix visual music arranger" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Voice Remix",
      description: "Say it. See it. Shape it.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
