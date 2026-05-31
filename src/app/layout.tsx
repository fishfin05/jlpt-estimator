import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { NavGuardProvider } from "@/components/NavGuardProvider";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "JLPT Level Estimator",
  description:
    "Adaptive Japanese kanji & vocabulary level estimator with typed input and progress tracking.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <NavGuardProvider>
          <TopNav email={user?.email} />
          {children}
        </NavGuardProvider>
      </body>
    </html>
  );
}
