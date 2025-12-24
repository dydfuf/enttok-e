import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	addDays,
	endOfMonth,
	format,
	formatDistanceToNow,
	isSameDay,
	parseISO,
	startOfDay,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBackend } from "@/contexts/BackendContext";
import { useVault } from "@/contexts/VaultContext";
import { useCalendar } from "@/hooks/useCalendar";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { CalendarEventDetail } from "@/components/calendar/CalendarEventDetail";
import {
	fetchCalendars,
	updateCalendarSelection,
	type CalendarEvent,
	type CalendarListItem,
} from "@/lib/calendar-api";
import {
	getStaleAccountIds,
	syncCalendarAccounts,
	type SyncSummary,
} from "@/lib/calendar-sync";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/calendar")({
	component: CalendarPage,
});

type CalendarView = "day" | "week" | "month";

function CalendarPage() {
	const navigate = useNavigate();
	const { state } = useBackend();
	const { vaultPath } = useVault();
	const { accounts, isLoading: isCalendarLoading, triggerSync } = useCalendar();

	const [view, setView] = useState<CalendarView>("week");
	const [anchorDate, setAnchorDate] = useState<Date>(new Date());
	const [calendarList, setCalendarList] = useState<CalendarListItem[]>([]);
	const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [autoSyncDone, setAutoSyncDone] = useState(false);

	const isBackendReady =
		state?.status === "running" && state.port !== null && state.token !== null;

	const dateRange = useMemo(() => {
		if (view === "day") {
			const start = startOfDay(anchorDate);
			return { start, end: addDays(start, 1) };
		}
		if (view === "month") {
			const start = startOfMonth(anchorDate);
			const end = addDays(endOfMonth(anchorDate), 1);
			return { start, end };
		}
		const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
		return { start, end: addDays(start, 7) };
	}, [anchorDate, view]);

	const { events, isLoading, error, reload } = useCalendarEvents({
		start: dateRange.start,
		end: dateRange.end,
		selectedOnly: true,
		enabled: isBackendReady,
	});

	const days = useMemo(() => {
		const daysInRange = [] as Date[];
		let current = dateRange.start;
		while (current < dateRange.end) {
			daysInRange.push(current);
			current = addDays(current, 1);
		}
		return daysInRange;
	}, [dateRange.end, dateRange.start]);

	const eventsByDay = useMemo(() => {
		const grouped = new Map<string, CalendarEvent[]>();
		for (const day of days) {
			const dayKey = format(day, "yyyy-MM-dd");
			const startTs = Math.floor(day.getTime() / 1000);
			const endTs = Math.floor(addDays(day, 1).getTime() / 1000);
			const dayEvents = events.filter(
				(event) => event.start_ts < endTs && event.end_ts > startTs,
			);
			grouped.set(dayKey, dayEvents);
		}
		return grouped;
	}, [days, events]);

	const accountLabelMap = useMemo(() => {
		return new Map(
			accounts.map((account) => [
				account.account_id,
				account.display_name || account.email || "Calendar",
			]),
		);
	}, [accounts]);

	const calendarsByAccount = useMemo(() => {
		const grouped = new Map<string, CalendarListItem[]>();
		for (const calendar of calendarList) {
			const list = grouped.get(calendar.account_id) ?? [];
			list.push(calendar);
			grouped.set(calendar.account_id, list);
		}
		return grouped;
	}, [calendarList]);

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
			const label = accountLabelMap.get(first.accountId) ?? "Calendar";
			const base = first.message
				? `${label} - ${first.message}`
				: `${label} 동기화 실패`;
			const suffix =
				summary.failed > 1 ? ` 외 ${summary.failed - 1}개` : "";
			toast.error(`${base}${suffix}`);
		},
		[accountLabelMap],
	);

	const loadCalendars = useCallback(async () => {
		if (!isBackendReady || !state?.port || !state?.token) {
			return;
		}
		setIsLoadingCalendars(true);
		try {
			const data = await fetchCalendars(state.port, state.token, {
				selected_only: false,
			});
			setCalendarList(data);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load calendars");
		} finally {
			setIsLoadingCalendars(false);
		}
	}, [isBackendReady, state?.port, state?.token]);

	const handleToggleCalendar = async (
		calendar: CalendarListItem,
		nextSelected: boolean,
	) => {
		if (!isBackendReady || !state?.port || !state?.token) {
			return;
		}
		try {
			await updateCalendarSelection(
				state.port,
				state.token,
				calendar.account_id,
				calendar.calendar_id,
				nextSelected,
			);
			setCalendarList((prev) =>
				prev.map((item) =>
					item.calendar_id === calendar.calendar_id &&
					item.account_id === calendar.account_id
						? { ...item, selected: nextSelected }
						: item,
					),
			);
			await reload();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to update calendar",
			);
		}
	};

	const handleNavigateRange = (direction: "prev" | "next") => {
		if (view === "day") {
			setAnchorDate((prev) => addDays(prev, direction === "prev" ? -1 : 1));
			return;
		}
		if (view === "month") {
			const monthShift = direction === "prev" ? -1 : 1;
			const nextDate = new Date(anchorDate);
			nextDate.setMonth(anchorDate.getMonth() + monthShift);
			setAnchorDate(nextDate);
			return;
		}
		setAnchorDate((prev) => addDays(prev, direction === "prev" ? -7 : 7));
	};

	const handleSyncAll = async () => {
		if (!accounts.length || isSyncing) {
			return;
		}
		setIsSyncing(true);
		try {
			const result = await syncCalendarAccounts(
				accounts.map((account) => account.account_id),
				triggerSync,
			);
			reportSyncFailures(result);
			await reload();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to sync");
		} finally {
			setIsSyncing(false);
		}
	};

	const rangeLabel = useMemo(() => {
		if (view === "day") {
			return format(anchorDate, "yyyy년 M월 d일");
		}
		const startLabel = format(dateRange.start, "yyyy년 M월 d일");
		const endLabel = format(addDays(dateRange.end, -1), "M월 d일");
		return `${startLabel} - ${endLabel}`;
	}, [anchorDate, dateRange.end, dateRange.start, view]);

	const lastSyncLabel = useMemo(() => {
		const timestamps = accounts
			.map((account) => account.last_sync_at)
			.filter(Boolean)
			.map((value) => new Date(value as string).getTime())
			.filter((value) => Number.isFinite(value));
		if (timestamps.length === 0) {
			return "동기화 기록 없음";
		}
		const latest = Math.max(...timestamps);
		return `${formatDistanceToNow(new Date(latest), { addSuffix: true })} 동기화`;
	}, [accounts]);

	useEffect(() => {
		loadCalendars();
	}, [loadCalendars, accounts.length]);

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

	if (!isBackendReady) {
		return (
			<div className="min-h-full p-6">
				<div className="max-w-3xl">
					<div className="flex items-center gap-3">
						<CalendarDays className="w-8 h-8" />
						<h1 className="text-2xl font-bold">Calendar</h1>
					</div>
					<div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
						Backend is not running. Please wait for it to start.
					</div>
				</div>
			</div>
		);
	}

	if (!accounts.length && !isCalendarLoading) {
		return (
			<div className="min-h-full p-6">
				<div className="max-w-3xl">
					<div className="flex items-center gap-3">
						<CalendarDays className="w-8 h-8" />
						<h1 className="text-2xl font-bold">Calendar</h1>
					</div>
					<div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
						캘린더 계정이 연결되어 있지 않습니다.
						<Button
							variant="link"
							onClick={() => navigate({ to: "/integrations/calendar" })}
						>
							연결하러 가기
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-full flex flex-col p-6">
			<div className="flex items-center justify-between mb-4">
				<div>
					<div className="flex items-center gap-2">
						<CalendarDays className="w-6 h-6" />
						<h1 className="text-2xl font-bold">Calendar</h1>
					</div>
				<div className="text-sm text-muted-foreground mt-1">{rangeLabel}</div>
				<div className="text-xs text-muted-foreground">{lastSyncLabel}</div>
			</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={() => setAnchorDate(new Date())}>
						Today
					</Button>
					<Button
						variant="outline"
						onClick={handleSyncAll}
						disabled={!accounts.length || isSyncing}
					>
						Sync
					</Button>
					<Button
						variant="outline"
						onClick={() => {
							loadCalendars();
							reload();
						}}
						disabled={isLoading || isLoadingCalendars || isSyncing}
					>
						<RefreshCw
							className={`h-4 w-4 ${isLoading || isSyncing ? "animate-spin" : ""}`}
						/>
					</Button>
					<ToggleGroup
						type="single"
						value={view}
						onValueChange={(value) => {
							if (value) setView(value as CalendarView);
						}}
						variant="outline"
					>
						<ToggleGroupItem value="day">Day</ToggleGroupItem>
						<ToggleGroupItem value="week">Week</ToggleGroupItem>
						<ToggleGroupItem value="month">Month</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</div>

			<div className="flex-1 min-h-0 flex gap-4">
				<Card className="w-72 shrink-0 p-4 flex flex-col gap-4">
					<div className="flex items-center justify-between">
						<div className="text-sm font-semibold">캘린더</div>
						<div className="text-xs text-muted-foreground">
							{calendarList.length}개
						</div>
					</div>
					<ScrollArea className="h-48">
						<div className="space-y-4">
							{Array.from(calendarsByAccount.entries()).map(([accountId, items]) => (
								<div key={accountId} className="space-y-2">
									<div className="text-xs font-medium text-muted-foreground">
										{accountLabelMap.get(accountId) || "Calendar"}
									</div>
									<div className="space-y-2">
										{items.map((calendar) => (
											<div
												key={calendar.calendar_id}
												className="flex items-center justify-between gap-2"
											>
												<div className="flex items-center gap-2">
													<span
														className="h-2 w-2 rounded-full"
														style={{
															backgroundColor: calendar.background_color || "#94a3b8",
														}}
													/>
													<span className="text-sm">{calendar.name}</span>
												</div>
												<Switch
													checked={calendar.selected}
													onCheckedChange={(value) =>
														handleToggleCalendar(calendar, value)
													}
												/>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</ScrollArea>
					<Separator />
					<Calendar
						mode="single"
						selected={anchorDate}
						onSelect={(date) => {
							if (date) setAnchorDate(date);
						}}
						className="rounded-md border"
					/>
				</Card>

				<Card className="flex-1 min-w-0 min-h-0 p-4 overflow-hidden">
					<div className="flex items-center justify-between mb-4 shrink-0">
						<div className="text-sm font-semibold">일정</div>
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="icon"
								onClick={() => handleNavigateRange("prev")}
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => handleNavigateRange("next")}
							>
								<ChevronRight className="h-4 w-4" />
							</Button>
						</div>
					</div>
					{error && (
						<div className="mb-4 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
							{error}
						</div>
					)}
					<ScrollArea className="flex-1 min-h-0">
						{isLoading ? (
							<div className="text-sm text-muted-foreground">Loading...</div>
						) : (
							<div
								className={
									view === "week"
										? "grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-7"
										: "space-y-4"
								}
							>
								{days.map((day) => {
									const dayKey = format(day, "yyyy-MM-dd");
									const dayEvents = eventsByDay.get(dayKey) ?? [];
									return (
										<div
											key={dayKey}
											className="rounded-lg border border-border p-3 space-y-2"
										>
											<div className="text-sm font-medium">
												{format(day, "M월 d일 (EEE)")}
												{isSameDay(day, new Date()) && (
													<span className="ml-2 text-xs text-primary">오늘</span>
												)}
											</div>
											{dayEvents.length === 0 ? (
												<div className="text-xs text-muted-foreground">일정 없음</div>
											) : (
												<div className="space-y-2">
													{dayEvents.map((event) => (
														<button
															key={`${event.calendar_id}-${event.event_id}`}
															className="w-full text-left rounded-md border border-border/60 px-2 py-2 hover:border-primary/60 hover:bg-muted/30"
															onClick={() => setSelectedEvent(event)}
														>
															<div className="flex items-center justify-between">
																<div className="text-sm font-medium truncate">
																	{event.title}
																</div>
																<span
																	className="ml-2 h-2 w-2 rounded-full"
																	style={{
																		backgroundColor:
																			event.calendar_color || "#94a3b8",
																	}}
																/>
															</div>
															<div className="text-xs text-muted-foreground mt-1">
																{event.all_day
																	? "종일"
																	: format(parseISO(event.start_time), "HH:mm")}
															</div>
														</button>
													))}
												</div>
											)}
										</div>
									);
								})}
							</div>
						)}
					</ScrollArea>
				</Card>

				<Card className="w-80 shrink-0 p-4">
					{selectedEvent ? (
						<CalendarEventDetail
							event={selectedEvent}
							vaultPath={vaultPath}
							onNoteCreated={(note) =>
								navigate({ to: "/notes/$noteId", params: { noteId: note.id } })
							}
						/>
					) : (
						<div className="text-sm text-muted-foreground">
							일정을 선택하면 상세 정보가 표시됩니다.
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
