import { PublicTopBar } from "@/components/public/public-top-bar";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicTopBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
