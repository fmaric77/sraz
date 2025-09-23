import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthModalProvider } from "./components/AuthModalProvider";
import { AuthModal } from "./components/AuthModal";
import { CurrentUserProvider } from "./components/CurrentUserProvider";
import { SessionProvider } from "next-auth/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mind Siege",
  description: "Mind Siege – strategy meets knowledge on an 8×8 board",
  icons: {
    icon: "/images/icon.png",
    shortcut: "/images/icon.png",
    apple: "/images/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProvider>
          <AuthModalProvider>
            <CurrentUserProvider>
              {children}
              <AuthModal />
            </CurrentUserProvider>
          </AuthModalProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
