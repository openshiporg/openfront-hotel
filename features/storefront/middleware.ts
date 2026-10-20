import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

// Handles storefront routes for the hotel app. Like Restaurant, the hotel has no
// region or country routing; guest sessions and reservation access are enforced by
// the GraphQL API, so storefront requests pass straight through.
export async function handleStorefrontRoutes(request: NextRequest, user: any | null) {
  return NextResponse.next();
}
