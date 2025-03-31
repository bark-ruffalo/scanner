import { NextResponse } from "next/server";

export const GET = async () => {
	// You could add more complex checks here, like database connectivity tests

	// Return a 200 OK status to indicate the service is healthy
	return NextResponse.json({
		status: "ok",
		timestamp: new Date().toISOString(),
	});
};
