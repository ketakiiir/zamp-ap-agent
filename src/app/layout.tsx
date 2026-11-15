import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ChatWidget } from "@/components/ChatWidget";
import { Header } from "@/components/Header";
import { PasscodeDialog } from "@/components/PasscodeDialog";
import { Tour } from "@/components/Tour";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Invoice Agent",
  description: "Invoice to decision: a six-stage accounts payable agent with a visible run view.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
        <Header />
        {children}
        <ChatWidget />
        <Tour />
        <PasscodeDialog />
      </body>
    </html>
  );
}
