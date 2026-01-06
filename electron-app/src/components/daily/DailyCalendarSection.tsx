import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { CalendarDays, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCalendar } from "@/hooks/useCalendar";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { CalendarEventDetail } from "@/components/calendar/CalendarEventDetail";
import { useVault } from "@/contexts/VaultContext";
import { getElectronAPI } from "@/lib/electron";
import type { CalendarEvent } from "@/lib/calendar-api";
import { useNavigate } from "@tanstack/react-router";
import {
	getStaleAccountIds,
	syncCalendarAccounts,
	type SyncSummary,
} from "@/lib/calendar-sync";
import { toast } from "sonner";

export type DailyCalendarSectionProps = {
	date: Date;
};

export function DailyCalendarSection({ date }: DailyCalendarSectionProps) {
	const navigate = useNavigate();
	const electronAPI = useMemo(() => getElectronAPI(), []);
	const { vaultPath } = useVault();
	const { accounts, primaryCalendarIds, isLoading: isAccountLoading, triggerSync } = useCalendar();
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [autoSyncDone, setAutoSyncDone] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const accountLabelMap = useMemo(() => {
		return new Map(
			accounts.map((account) => [
				account.account_id,
				account.display_name || account.email || "캘린더",
			]),
		);
	}, [accounts]);

	const start = useMemo(() => startOfDay(date), [date]);
	const end = useMemo(() => addDays(start, 1), [start]);

	const { events, isLoading, error, reload } = useCalendarEvents({
		start,
		end,
		calendarIds: primaryCalendarIds,
		selectedOnly: true,
		enabled: accounts.length > 0 && primaryCalendarIds.length > 0,
	});

	const allDayEvents = useMemo(
		() => events.filter((event) => event.all_day),
		[events],
	);
	const timedEvents = useMemo(
		() =>
			events
				.filter((event) => !event.all_day)
				.sort((a, b) => a.start_ts - b.start_ts),
		[events],
	);

	const nowSec = Math.floor(Date.now() / 1000);

	const reportSyncFailures = useCallback(
		(summary: SyncSummary) => {
			if (summary.failed === 0) {
				return;
			}
			const first = summary.failures[0];
			if (!first) {
				toast.error(`일부 캘린더 동기화 실패 (${summary.failed}개)`);
				return;
			}
			const label = accountLabelMap.get(first.accountId) ?? "캘린더";
			const base = first.message
				? `${label} - ${first.message}`
				: `${label} 동기화 실패`;
			const suffix =
				summary.failed > 1 ? ` 외 ${summary.failed - 1}개` : "";
			toast.error(`${base}${suffix}`);
		},
		[accountLabelMap],
	);

	useEffect(() => {
		if (!electronAPI) {
			return;
		}
		let isMounted = true;
		electronAPI
			.getDailyCalendarCollapsed()
			.then((collapsed) => {
				if (isMounted) {
					setIsOpen(!collapsed);
				}
			})
			.catch(() => {});
		return () => {
			isMounted = false;
		};
	}, [electronAPI]);

	const handleSync = async () => {
		if (isSyncing) return;
		setIsSyncing(true);
		try {
			const accountIds = accounts.map((account) => account.account_id);
			const result = await syncCalendarAccounts(accountIds, triggerSync);
			reportSyncFailures(result);
			await reload();
		} finally {
			setIsSyncing(false);
		}
	};

	useEffect(() => {
		if (autoSyncDone || isSyncing || accounts.length === 0) {
			return;
		}
		const staleIds = getStaleAccountIds(accounts, 5 * 60 * 1000);
		if (staleIds.length === 0) {
			setAutoSyncDone(true);
			return;
		}
		setIsSyncing(true);
		syncCalendarAccounts(staleIds, triggerSync)
			.then((result) => {
				reportSyncFailures(result);
				return reload();
			})
			.finally(() => {
				setIsSyncing(false);
				setAutoSyncDone(true);
			});
	}, [
		accounts,
		autoSyncDone,
		isSyncing,
		reload,
		reportSyncFailures,
		triggerSync,
	]);

	if (!accounts.length && !isAccountLoading) {
		return (
			<Card className="mt-3 gap-3 p-3">
				<div className="flex items-center gap-2">
					<CalendarDays className="h-4 w-4" />
					<div className="text-sm font-semibold">오늘 일정</div>
				</div>
				<div className="mt-2 text-xs text-muted-foreground">
					캘린더 계정을 연결하면 오늘 일정을 표시할 수 있어요.
				</div>
				<Button
					variant="link"
					onClick={() => navigate({ to: "/integrations/calendar" })}
				>
					연결하러 가기
				</Button>
			</Card>
		);
	}

	const handleOpenChange = (nextOpen: boolean) => {
		setIsOpen(nextOpen);
		if (electronAPI) {
			void electronAPI.setDailyCalendarCollapsed(!nextOpen);
		}
	};

	return (
		<Collapsible open={isOpen} onOpenChange={handleOpenChange}>
			<Card className="mt-3 gap-3 p-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<CalendarDays className="h-4 w-4" />
						<div className="text-sm font-semibold">오늘 일정</div>
						<div className="text-xs text-muted-foreground">
							{events.length}개
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={handleSync}
							disabled={!accounts.length || isSyncing}
						>
							<RefreshCw
								className={
									isLoading || isSyncing ? "h-4 w-4 animate-spin" : "h-4 w-4"
								}
							/>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => navigate({ to: "/calendar" })}
						>
							캘린더 열기
						</Button>
						<CollapsibleTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={isOpen ? "일정 접기" : "일정 펼치기"}
							>
								<ChevronDown
									className={`h-4 w-4 transition-transform ${
										isOpen ? "rotate-180" : ""
									}`}
								/>
							</Button>
						</CollapsibleTrigger>
					</div>
				</div>

				<CollapsibleContent>
					{error && (
						<div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
							{error}
						</div>
					)}

					{isLoading ? (
						<div className="mt-2 text-sm text-muted-foreground">
							일정을 불러오는 중...
						</div>
					) : events.length === 0 ? (
						<div className="mt-2 text-sm text-muted-foreground">
							오늘 일정이 없습니다.
						</div>
					) : (
						<ScrollArea className="mt-2 max-h-44">
							<div className="space-y-2 pr-2">
								{allDayEvents.length > 0 && (
									<div className="space-y-1.5">
										<div className="text-xs font-semibold text-muted-foreground">
											종일 일정
										</div>
										{allDayEvents.map((event) => (
											<button
												key={`${event.calendar_id}-${event.event_id}`}
												className="w-full text-left rounded-md border border-border px-2.5 py-1.5 hover:border-primary/60 hover:bg-muted/30"
												onClick={() => setSelectedEvent(event)}
											>
												<div className="flex items-center justify-between">
													<div className="text-sm font-medium truncate">
														{event.title}
													</div>
													<span
														className="ml-2 h-2 w-2 rounded-full"
														style={{
															backgroundColor: event.calendar_color || "#94a3b8",
														}}
													/>
												</div>
												<div className="text-xs text-muted-foreground mt-1">
													종일
												</div>
											</button>
										))}
									</div>
								)}

								{timedEvents.length > 0 && (
									<div className="space-y-1.5">
										<div className="text-xs font-semibold text-muted-foreground">
											시간 일정
										</div>
										{timedEvents.map((event) => {
											const isCurrent =
												nowSec >= event.start_ts && nowSec <= event.end_ts;
											return (
												<button
													key={`${event.calendar_id}-${event.event_id}`}
													className={`w-full text-left rounded-md border px-2.5 py-1.5 hover:border-primary/60 hover:bg-muted/30 ${
														isCurrent
															? "border-primary/60 bg-primary/5"
															: "border-border"
													}`}
													onClick={() => setSelectedEvent(event)}
												>
													<div className="flex items-center justify-between">
														<div className="text-sm font-medium truncate">
															{event.title}
														</div>
														<span
															className="ml-2 h-2 w-2 rounded-full"
															style={{
																backgroundColor: event.calendar_color || "#94a3b8",
															}}
														/>
													</div>
													<div className="text-xs text-muted-foreground mt-1">
														{format(parseISO(event.start_time), "HH:mm")} -
														{format(parseISO(event.end_time), "HH:mm")}
													</div>
												</button>
											);
										})}
									</div>
								)}
							</div>
						</ScrollArea>
					)}
				</CollapsibleContent>

				<Dialog
					open={!!selectedEvent}
					onOpenChange={(open) => {
						if (!open) setSelectedEvent(null);
					}}
				>
					<DialogContent className="max-w-xl">
						{selectedEvent && (
							<CalendarEventDetail
								event={selectedEvent}
								vaultPath={vaultPath}
								onNoteCreated={(note) =>
									navigate({
										to: "/notes/$noteId",
										params: { noteId: note.id },
									})
								}
							/>
						)}
					</DialogContent>
				</Dialog>
			</Card>
		</Collapsible>
	);
}
