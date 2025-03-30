import { NewLaunchForm } from "~/app/admin/new/NewLaunchForm";

export default function NewLaunchPage() {
	return (
		<main className="min-h-screen bg-gradient-to-b from-[var(--color-scanner-purple-light)] to-indigo-950 p-8 text-white">
			<div className="container mx-auto max-w-4xl">
				<h1 className="mb-8 font-bold text-3xl">Add New Launch</h1>
				<NewLaunchForm />
			</div>
		</main>
	);
}
