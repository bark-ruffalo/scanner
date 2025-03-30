"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createLaunch } from "~/app/admin/new/actions";

export function NewLaunchForm() {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [formData, setFormData] = useState({
		title: "",
		launchpad: "",
		url: "",
		description: "",
		imageUrl: "",
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			await createLaunch(formData);
			router.push("/admin");
			router.refresh();
		} catch (error) {
			console.error("Error creating launch:", error);
			alert("Error creating launch");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div>
				<label htmlFor="title" className="mb-2 block font-medium text-gray-200">
					Title
				</label>
				<input
					type="text"
					id="title"
					name="title"
					value={formData.title}
					onChange={handleChange}
					required
					className="w-full rounded-lg bg-gray-700 p-2 text-white"
				/>
			</div>

			<div>
				<label
					htmlFor="launchpad"
					className="mb-2 block font-medium text-gray-200"
				>
					Launchpad
				</label>
				<input
					type="text"
					id="launchpad"
					name="launchpad"
					value={formData.launchpad}
					onChange={handleChange}
					required
					className="w-full rounded-lg bg-gray-700 p-2 text-white"
				/>
			</div>

			<div>
				<label htmlFor="url" className="mb-2 block font-medium text-gray-200">
					URL
				</label>
				<input
					type="url"
					id="url"
					name="url"
					value={formData.url}
					onChange={handleChange}
					required
					className="w-full rounded-lg bg-gray-700 p-2 text-white"
				/>
			</div>

			<div>
				<label
					htmlFor="imageUrl"
					className="mb-2 block font-medium text-gray-200"
				>
					Image URL
				</label>
				<input
					type="url"
					id="imageUrl"
					name="imageUrl"
					value={formData.imageUrl}
					onChange={handleChange}
					className="w-full rounded-lg bg-gray-700 p-2 text-white"
				/>
			</div>

			<div>
				<label
					htmlFor="description"
					className="mb-2 block font-medium text-gray-200"
				>
					Description
				</label>
				<textarea
					id="description"
					name="description"
					value={formData.description}
					onChange={handleChange}
					required
					rows={10}
					className="w-full rounded-lg bg-gray-700 p-2 text-white"
				/>
			</div>

			<div className="flex gap-4">
				<button
					type="submit"
					disabled={isSubmitting}
					className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
				>
					{isSubmitting ? "Creating..." : "Create Launch"}
				</button>
				<button
					type="button"
					onClick={() => router.back()}
					disabled={isSubmitting}
					className="rounded bg-gray-600 px-4 py-2 font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
				>
					Cancel
				</button>
			</div>
		</form>
	);
}
