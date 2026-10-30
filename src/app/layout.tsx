import type { Metadata } from "next";
import { Chakra_Petch, Figtree, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const share = Share_Tech_Mono({
  variable: "--font-share",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Counterprogram: when should your movie open?",
  description:
    "An AI analyst for film releases. It compares every movie opening near your date using Qloo audience data and tells you which Friday gives your film the clearest run.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${chakra.variable} ${figtree.variable} ${share.variable} antialiased`}>{children}</body>
    </html>
  );
}
