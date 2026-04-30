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
    <div className="min-h-screen bg-muted/30">
      <TopBar userEmail={userEmail} />
      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r bg-background md:block">
          <div className="sticky top-14">
            <SidebarNav />
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
