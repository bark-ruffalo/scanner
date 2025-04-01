import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getLaunchById } from "~/server/queries";
import { EditLaunchForm } from "./EditLaunchForm";

export default async function EditLaunchPage({
	params,
}: { params: { id: string } }): Promise<ReactNode> {
	const launchId = Number.parseInt(params.id, 10);
	if (Number.isNaN(launchId)) {
		notFound();
	}

	const launch = await getLaunchById(launchId);
	if (!launch) {
		notFound();
	}

	return (
		<main className="min-h-screen bg-gradient-to-b from-[var(--color-scanner-purple-light)] to-indigo-950 p-8 text-white">
			<div className="container mx-auto max-w-4xl">
				<h1 className="mb-8 font-bold text-3xl">Edit Launch</h1>
				<EditLaunchForm launch={launch} />
			</div>
		</main>
	);
}
