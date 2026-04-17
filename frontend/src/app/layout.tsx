import type { Metadata } from "next";
import "./globals.css";
import TitleBar from "./titlebar";

export const metadata: Metadata = {
  title: "freecode",
  description: "Agentic AI coding assistant",
  icons: { icon: "/logo.ico", shortcut: "/logo.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ paddingTop: '32px' }}>
        <TitleBar />
        {children}
      </body>
    </html>
  );
}
