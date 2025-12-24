import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ExternalLink, Mic, MicOff, FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import {
	appendRecordingToNote,
	createMeetingNote,
	type MeetingNoteResult,
} from "@/lib/meeting-notes";
import { requireElectronAPI } from "@/lib/electron";
import type { CalendarEvent } from "@/lib/calendar-api";
import type { NoteInfo } from "@/shared/electron-api";
import { toast } from "sonner";

const RECORDING_EXTENSION_BY_MIME: Array<[string, string]> = [
	["audio/mp4", "m4a"],
	["audio/m4a", "m4a"],
	["audio/aac", "m4a"],
	["audio/webm", "webm"],
];

function sanitizeSegment(value: string): string {
	return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function pickExtension(mimeType: string): string {
	for (const [prefix, extension] of RECORDING_EXTENSION_BY_MIME) {
		if (mimeType.startsWith(prefix)) {
			return extension;
		}
	}
	return "webm";
}

function formatTimeRange(event: CalendarEvent): string {
	if (event.all_day) {
		return "종일";
	}
	const start = parseISO(event.start_time);
	const end = parseISO(event.end_time);
	return `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Failed to read recording"));
				return;
			}
			const base64 = result.split(",")[1];
			resolve(base64);
		};
		reader.onerror = () => reject(new Error("Failed to read recording"));
		reader.readAsDataURL(blob);
	});
}

export type CalendarEventDetailProps = {
	event: CalendarEvent;
	vaultPath: string | null;
	onNoteCreated?: (note: NoteInfo) => void;
};

export function CalendarEventDetail({
	event,
	vaultPath,
	onNoteCreated,
}: CalendarEventDetailProps) {
	const [meetingNote, setMeetingNote] = useState<MeetingNoteResult | null>(null);
	const { isRecording, durationSec, error, mimeType, startRecording, stopRecording } =
		useAudioRecorder();

	useEffect(() => {
		setMeetingNote(null);
	}, [event.event_id]);

	const eventDate = useMemo(() => {
		return format(parseISO(event.start_time), "yyyy년 M월 d일 (EEE)");
	}, [event.start_time]);

	const handleCreateMeetingNote = async () => {
		if (!vaultPath) {
			toast.error("Vault is not available");
			return;
		}
		try {
			const result = await createMeetingNote(vaultPath, event);
			setMeetingNote(result);
			onNoteCreated?.(result.note);
			toast.success("Meeting note created");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to create note");
		}
	};

	const handleOpenLink = (url?: string) => {
		if (!url) return;
		window.open(url, "_blank");
	};

	const handleStartRecording = async () => {
		try {
			await startRecording();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to start recording");
		}
	};

	const handleStopRecording = async () => {
		if (!vaultPath) {
			toast.error("Vault is not available");
			return;
		}
		try {
			const result = await stopRecording();
			const extension = pickExtension(result.mimeType);
			const now = new Date();
			const timestamp = format(now, "yyyy-MM-dd_HHmm");
			const titleSegment = sanitizeSegment(event.title || "meeting");
			const fileName = `${timestamp}_${titleSegment}_${event.event_id}.${extension}`;
			const relativePath = `.enttokk-e/recordings/${format(
				now,
				"yyyy/MM",
			)}/${fileName}`;
			const filePath = `${vaultPath}/${relativePath}`;

			const base64 = await blobToBase64(result.blob);
			const api = requireElectronAPI();
			const writeResult = await api.writeBinaryFile(filePath, base64);
			if (!writeResult.success) {
				throw new Error(writeResult.error || "Failed to save recording");
			}

			const recordingInfo = {
				path: relativePath,
				createdAt: new Date().toISOString(),
				durationSec: result.durationSec,
			};

			if (meetingNote) {
				await appendRecordingToNote(meetingNote.filePath, recordingInfo);
			} else {
				const createdNote = await createMeetingNote(
					vaultPath,
					event,
					recordingInfo,
				);
				setMeetingNote(createdNote);
				onNoteCreated?.(createdNote.note);
			}

			toast.success("Recording saved");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to stop recording");
		}
	};

	return (
		<div className="space-y-4">
			<div>
				<div className="text-lg font-semibold">{event.title}</div>
				<div className="text-sm text-muted-foreground">
					{eventDate} · {formatTimeRange(event)}
				</div>
			</div>

			<div className="flex flex-wrap gap-2">
				<Button size="sm" onClick={handleCreateMeetingNote}>
					<FileText className="mr-2 h-4 w-4" />
					회의 노트 만들기
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={!event.conference_url}
					onClick={() => handleOpenLink(event.conference_url)}
				>
					<Link2 className="mr-2 h-4 w-4" />
					미팅 링크 열기
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={!event.html_link}
					onClick={() => handleOpenLink(event.html_link)}
				>
					<ExternalLink className="mr-2 h-4 w-4" />
					캘린더에서 보기
				</Button>
			</div>

			<div className="rounded-lg border border-border p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-sm font-medium">녹음</div>
						<div className="text-xs text-muted-foreground">
							{isRecording ? "녹음 중" : "준비됨"}
							{durationSec > 0 && ` · ${durationSec}s`}
						</div>
					</div>
					<Button
						size="sm"
						variant={isRecording ? "destructive" : "outline"}
						onClick={isRecording ? handleStopRecording : handleStartRecording}
					>
						{isRecording ? (
							<MicOff className="mr-2 h-4 w-4" />
						) : (
							<Mic className="mr-2 h-4 w-4" />
						)}
						{isRecording ? "녹음 중지" : "녹음 시작"}
					</Button>
				</div>
				{mimeType && (
					<div className="text-xs text-muted-foreground mt-2">
						저장 형식: {mimeType}
					</div>
				)}
				{error && (
					<div className="text-xs text-destructive mt-2">{error}</div>
				)}
			</div>

			<Separator />

			<div className="space-y-3 text-sm">
				<div>
					<div className="text-muted-foreground">위치</div>
					<div>{event.location || "-"}</div>
				</div>
				<div>
				<div className="text-muted-foreground">참석자</div>
				{event.attendees?.length ? (
					<ul className="list-disc list-inside">
						{event.attendees.map((attendee, index) => {
							const label =
								attendee.email || attendee.displayName || `Attendee ${index + 1}`;
							return <li key={attendee.email ?? `${index}`}>{label}</li>;
						})}
					</ul>
				) : (
					<div>-</div>
				)}
				</div>
				<div>
					<div className="text-muted-foreground">설명</div>
					<div className="whitespace-pre-wrap">
						{event.description || "-"}
					</div>
				</div>
			</div>
		</div>
	);
}
