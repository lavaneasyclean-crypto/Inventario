import { TopBar } from "./top-bar";
import { SidebarNav } from "./sidebar-nav";

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      {/* El menú y la barra no van al papel: la guía se imprime en una
          térmica angosta y cada milímetro cuenta. */}
      <div className="print:hidden">
        <TopBar userEmail={userEmail} />
      </div>
      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r bg-background md:block print:hidden">
          <div className="sticky top-14">
            <SidebarNav />
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
