import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { ensureProfile, getGlobalStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Programming Wizard — domine engenharia de software",
    template: "%s · Programming Wizard",
  },
  description:
    "Trilha local de estudos para se tornar engenheiro sênior: Java, estruturas de dados, algoritmos, backend, Kafka e system design.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [profile, stats] = await Promise.all([ensureProfile(), getGlobalStats()]);
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen font-sans antialiased">
        <AppShell stats={stats} name={profile.name} targetRole={profile.targetRole}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
