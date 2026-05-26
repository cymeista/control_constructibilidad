import { useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router";
import PageHeader from "./PageHeader";
import TabNav from "./TabNav";
import MobileNav from "./MobileNav";

export default function Layout({ children }: { children?: ReactNode }) {
  const loc = useLocation();
  const isLogin = loc.pathname === "/login";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-app-canvas md:h-[100dvh] md:flex-row md:overflow-hidden">
      {!isLogin ? <TabNav /> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:min-h-0 md:overflow-y-auto md:overflow-x-hidden">
        {!isLogin ? (
          <PageHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        ) : null}
        <main
          className={`mx-auto w-full max-w-[min(100%,1920px)] flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10 xl:px-12 ${
            !isLogin ? "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-6 lg:pb-10" : ""
          }`}
        >
          {children ?? <Outlet />}
        </main>
        {!isLogin ? (
          <MobileNav menuOpen={mobileMenuOpen} onMenuOpenChange={setMobileMenuOpen} />
        ) : null}
      </div>
    </div>
  );
}
