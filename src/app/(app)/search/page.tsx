import type { Metadata } from "next";
import { SearchView } from "@/components/search/search-view";

export const metadata: Metadata = { title: "Search · Fanthom" };

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = await props.searchParams;
  const q = Array.isArray(sp.q) ? (sp.q[0] ?? "") : (sp.q ?? "");
  return <SearchView initialQuery={q} />;
}
