import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "~/env";

// Log when this file is loaded
console.error("🚀 Middleware file loaded!");

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
	// Use console.error for more visibility
	console.error("⭐ [Middleware] Starting middleware execution");
	console.error("[Middleware] Request URL:", request.nextUrl.pathname);

	// Only run middleware on admin routes
	if (!request.nextUrl.pathname.startsWith("/admin")) {
		console.error("[Middleware] Not an admin route, skipping auth");
		return NextResponse.next();
	}

	console.error("[Middleware] Admin route detected, checking auth");

	// Check for basic auth header
	const authHeader = request.headers.get("authorization");
	console.error("[Middleware] Auth header present:", !!authHeader);

	if (!authHeader || !authHeader.startsWith("Basic ")) {
		console.error(
			"[Middleware] No valid auth header, requesting authentication",
		);
		return new NextResponse("Authentication required", {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Basic realm="Admin Area"',
			},
		});
	}

	// Verify credentials
	const base64Credentials = authHeader.split(" ")[1];
	if (!base64Credentials) {
		console.error("[Middleware] Invalid base64 credentials");
		return new NextResponse("Invalid authorization header", {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Basic realm="Admin Area"',
			},
		});
	}

	const credentials = Buffer.from(base64Credentials, "base64").toString(
		"ascii",
	);
	const [username, password] = credentials.split(":");

	console.error("[Middleware] Checking credentials:");
	console.error("- Username matches:", username === "admin");
	console.error("- Password matches:", password === env.ADMIN_PASSWORD);
	console.error(
		"- Expected password from env:",
		typeof env.ADMIN_PASSWORD,
		"length:",
		env.ADMIN_PASSWORD?.length ?? 0,
	);

	if (username !== "admin" || password !== env.ADMIN_PASSWORD) {
		console.error("[Middleware] Invalid credentials provided");
		return new NextResponse("Invalid credentials", {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Basic realm="Admin Area"',
			},
		});
	}

	console.error("[Middleware] Authentication successful");
	return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
	matcher: "/admin/:path*",
};
