"use client";

// import { ArrowLeftIcon } from "@heroicons/react/24/solid"; // Assuming you have heroicons installed
import { ArrowLeft } from "lucide-react"; // Use lucide-react icon
import { useRouter } from "next/navigation";

export function BackButton() {
	const router = useRouter();

	return (
		<button
			onClick={() => router.back()}
			className="rounded p-2 hover:bg-gray-200"
			aria-label="Go back"
			type="button"
		>
			{/* <ArrowLeftIcon className="h-6 w-6" /> */}
			<ArrowLeft className="h-6 w-6" /> {/* Use ArrowLeft from lucide-react */}
		</button>
	);
}
