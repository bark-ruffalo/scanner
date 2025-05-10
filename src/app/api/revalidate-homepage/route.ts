import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// This API route exists to allow background jobs and server-side scripts
// to trigger homepage revalidation, since revalidatePath cannot be called
// outside of a request context (e.g., in background jobs or cron tasks).

export async function POST(req: NextRequest) {
	// Revalidate the homepage
	revalidatePath("/");
	return NextResponse.json({ revalidated: true });
}

// Only POST is supported
export const dynamic = "force-dynamic";
