"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#1a013d] to-[#15162c] text-white">
      <div className="container mx-auto flex max-w-md flex-col items-center p-4 text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-8 text-lg">Page not found</p>
        <Link
          href="/"
          className="rounded-md bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}