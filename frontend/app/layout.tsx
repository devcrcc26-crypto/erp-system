// UI polish pass - styles only, no logic changes

import type { Metadata } from "next";
import AntDesignProvider from "@/components/providers/AntDesignProvider";
import { QueryProvider } from "@/lib/query/provider";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
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
