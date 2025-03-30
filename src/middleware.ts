import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "~/env";

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
	// Only run middleware on admin routes
	if (!request.nextUrl.pathname.startsWith("/admin")) {
		return NextResponse.next();
	}

	// Check for basic auth header
	const authHeader = request.headers.get("authorization");

	if (!authHeader || !authHeader.startsWith("Basic ")) {
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

	if (username !== "admin" || password !== env.ADMIN_PASSWORD) {
		return new NextResponse("Invalid credentials", {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Basic realm="Admin Area"',
			},
		});
	}

	return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
	matcher: "/admin/:path*",
};
