import React from "react";
import { getLaunches } from "~/server/queries";

interface AdminPageProps {
	launches: Awaited<ReturnType<typeof getLaunches>>;
}

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const launches = await getLaunches();

	return (
		<>
			{React.Children.map(children, (child) => {
				if (React.isValidElement<AdminPageProps>(child)) {
					return React.cloneElement(child, { launches });
				}
				return child;
			})}
		</>
	);
}
