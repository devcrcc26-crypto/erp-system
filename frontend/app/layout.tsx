import type { Metadata } from "next";
import AntDesignProvider from "@/components/providers/AntDesignProvider";
import { QueryProvider } from "@/lib/query/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCECC",
  description: "CCECC Construction ERP",
  icons: {
    icon: [{ url: "/ccecc-logo.png", type: "image/png" }],
    apple: [{ url: "/ccecc-logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        <AntDesignProvider>
          <QueryProvider>
            <div className="flex h-full flex-col">{children}</div>
          </QueryProvider>
        </AntDesignProvider>
      </body>
    </html>
  );
}
