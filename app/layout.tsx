import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Olly Molly — Kanban",
  description: "Local-first AI team Kanban board.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
