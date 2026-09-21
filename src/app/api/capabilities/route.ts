import { getCapabilities } from "@/lib/capabilities";
import type { CapabilitiesResponse } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getCapabilities() satisfies CapabilitiesResponse);
}
