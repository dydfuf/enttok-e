import { useNavigate } from "@tanstack/react-router";
import { useBackend } from "@/contexts/BackendContext";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
	stopped: "Stopped",
	starting: "Starting",
	running: "Running",
	stopping: "Stopping",
	error: "Error",
};

const STATUS_CLASSES: Record<string, string> = {
	stopped: "bg-slate-400",
	starting: "bg-amber-400",
	running: "bg-emerald-500",
	stopping: "bg-amber-400",
	error: "bg-red-500",
};

export default function BackendStatusIndicator() {
	const navigate = useNavigate();
	const { state } = useBackend();

	const status = state?.status ?? "stopped";
	const statusLabel = STATUS_LABELS[status] ?? status;
	const statusClass = STATUS_CLASSES[status] ?? STATUS_CLASSES.stopped;

	const handleClick = () => {
		navigate({ to: "/settings", search: { tab: "system" } });
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			className="mt-6 border-t border-gray-200 dark:border-gray-800 pt-4 w-full text-left hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors cursor-pointer"
		>
			<div className="flex items-center justify-between text-xs text-muted-foreground px-1">
				<div className="flex items-center gap-2">
					<span className={cn("h-2 w-2 rounded-full", statusClass)} />
					<span className="font-medium text-gray-700 dark:text-gray-300">
						Backend: {statusLabel}
					</span>
				</div>
				<span className="text-[10px] text-muted-foreground">Details</span>
			</div>
		</button>
	);
}
