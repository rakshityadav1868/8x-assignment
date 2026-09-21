"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "./app-sidebar";

export function TopBar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-sidebar p-4">
          <SheetHeader className="px-3 pb-4">
            <SheetTitle asChild>
              <div>
                <Logo href="/calls" />
              </div>
            </SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="md:hidden">
        <Logo href="/calls" />
      </div>

      <Link
        href="/search"
        className="ml-auto flex h-9 w-full max-w-md items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3.5 text-sm text-muted-foreground transition-colors hover:border-white/15 hover:bg-white/[0.06] md:ml-0"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate">Search across all calls…</span>
        <kbd className="hidden rounded border border-border bg-white/5 px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </Link>

      <Avatar className="ml-auto hidden size-8 md:flex">
        <AvatarFallback className="bg-primary/20 text-xs text-primary">AR</AvatarFallback>
      </Avatar>
    </header>
  );
}
