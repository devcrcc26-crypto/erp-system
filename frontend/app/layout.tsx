import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AntDesignProvider from "@/components/providers/AntDesignProvider";
import { QueryProvider } from "@/lib/query/provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CCECC PWF",
  description: "",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen flex-col">
        <AntDesignProvider>
          <QueryProvider>
            <div className="flex min-h-screen flex-1 flex-col">{children}</div>
          </QueryProvider>
        </AntDesignProvider>
      </body>
    </html>
  );
}
