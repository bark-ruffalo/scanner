"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createLaunch } from "~/app/admin/new/actions";

type FormErrors = {
	title?: string;
	launchpad?: string;
	url?: string;
	description?: string;
};

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
	const [errors, setErrors] = useState<FormErrors>({});

	const validateForm = (): boolean => {
		const newErrors: FormErrors = {};

		// Validate title
		if (!formData.title.trim()) {
			newErrors.title = "Title is required";
		} else if (formData.title.length > 256) {
			newErrors.title = "Title must be less than 256 characters";
		}

		// Validate launchpad
		if (!formData.launchpad.trim()) {
			newErrors.launchpad = "Launchpad is required";
		} else if (formData.launchpad.length > 256) {
			newErrors.launchpad = "Launchpad must be less than 256 characters";
		}

		// Validate URL
		if (!formData.url.trim()) {
			newErrors.url = "URL is required";
		} else {
			try {
				// Check if it's a valid URL
				new URL(formData.url);
			} catch (e) {
				newErrors.url = "Please enter a valid URL";
			}
		}

		// Validate description
		if (!formData.description.trim()) {
			newErrors.description = "Description is required";
		}

		// If there are validation errors
		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Validate form before submission
		if (!validateForm()) {
			return;
		}

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
		// Clear error for this field when user starts typing
		if (errors[name as keyof FormErrors]) {
			setErrors((prev) => ({ ...prev, [name]: undefined }));
		}
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
					className={`w-full rounded-lg bg-gray-700 p-2 text-white ${
						errors.title ? "border border-red-500" : ""
					}`}
				/>
				{errors.title && (
					<p className="mt-1 text-red-500 text-sm">{errors.title}</p>
				)}
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
					className={`w-full rounded-lg bg-gray-700 p-2 text-white ${
						errors.launchpad ? "border border-red-500" : ""
					}`}
				/>
				{errors.launchpad && (
					<p className="mt-1 text-red-500 text-sm">{errors.launchpad}</p>
				)}
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
					className={`w-full rounded-lg bg-gray-700 p-2 text-white ${
						errors.url ? "border border-red-500" : ""
					}`}
				/>
				{errors.url && (
					<p className="mt-1 text-red-500 text-sm">{errors.url}</p>
				)}
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
					rows={10}
					className={`w-full rounded-lg bg-gray-700 p-2 text-white ${
						errors.description ? "border border-red-500" : ""
					}`}
				/>
				{errors.description && (
					<p className="mt-1 text-red-500 text-sm">{errors.description}</p>
				)}
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
