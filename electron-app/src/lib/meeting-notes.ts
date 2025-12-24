import { format, parseISO } from "date-fns";
import { requireElectronAPI } from "@/lib/electron";
import type { CalendarEvent } from "@/lib/calendar-api";
import type { NoteInfo } from "@/shared/electron-api";

export type MeetingNoteResult = {
	note: NoteInfo;
	filePath: string;
};

type RecordingInfo = {
	path: string;
	createdAt: string;
	durationSec?: number;
};

function sanitizeFileName(value: string): string {
	return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function escapeYaml(value: string): string {
	return value.replace(/"/g, "\\\"");
}

function formatMeetingTime(startTime?: string): string {
	if (!startTime) {
		return format(new Date(), "yyyy-MM-dd HHmm");
	}
	const date = parseISO(startTime);
	return format(date, "yyyy-MM-dd HHmm");
}

function buildMeetingNoteContent(
	event: CalendarEvent,
	recording?: RecordingInfo,
): string {
	const attendees = event.attendees?.map((attendee) => attendee.email).filter(Boolean) ?? [];
	const meetingTitle = event.title || "Meeting";
	const recordingPath = recording?.path ?? "";
	const recordingCreatedAt = recording?.createdAt ?? "";
	const recordingDuration = recording?.durationSec
		? `${recording.durationSec}s`
		: "";

	return [
		"---",
		"meeting:",
		`  title: \"${escapeYaml(meetingTitle)}\"`,
		`  calendar_event_id: \"${event.event_id}\"`,
		`  calendar_id: \"${event.calendar_id}\"`,
		`  start_at: \"${event.start_time}\"`,
		`  end_at: \"${event.end_time}\"`,
		`  time_zone: \"${event.time_zone ?? ""}\"`,
		`  conference_url: \"${event.conference_url ?? ""}\"`,
		"recording:",
		`  path: \"${recordingPath}\"`,
		`  created_at: \"${recordingCreatedAt}\"`,
		`  duration: \"${recordingDuration}\"`,
		"---",
		"",
		`# ${meetingTitle}`,
		"",
		"## Agenda",
		"",
		"",
		"## Notes",
		"",
		"",
		"## Attendees",
		...attendees.map((email) => `- ${email}`),
		"",
		"## Recording",
		recordingPath ? `- Path: ${recordingPath}` : "- Path:",
		recordingCreatedAt ? `- Created: ${recordingCreatedAt}` : "- Created:",
		recordingDuration ? `- Duration: ${recordingDuration}` : "- Duration:",
		"",
	].join("\n");
}

export async function createMeetingNote(
	vaultPath: string,
	event: CalendarEvent,
	recording?: RecordingInfo,
): Promise<MeetingNoteResult> {
	const api = requireElectronAPI();
	const baseTitle = event.title || "Meeting";
	const timestamp = formatMeetingTime(event.start_time);
	const noteTitle = sanitizeFileName(`${baseTitle} ${timestamp}`);

	const result = await api.createNote(vaultPath, noteTitle);
	if (!result.success || !result.note) {
		throw new Error(result.error || "Failed to create meeting note");
	}

	const content = buildMeetingNoteContent(event, recording);
	const writeResult = await api.writeFile(result.note.filePath, content);
	if (!writeResult.success) {
		throw new Error(writeResult.error || "Failed to write meeting note");
	}

	return { note: result.note, filePath: result.note.filePath };
}

export async function appendRecordingToNote(
	filePath: string,
	recording: RecordingInfo,
): Promise<void> {
	const api = requireElectronAPI();
	const readResult = await api.readFile(filePath);
	const baseContent = readResult.success ? readResult.data ?? "" : "";
	const appendix = [
		"",
		"## Recording",
		`- Path: ${recording.path}`,
		`- Created: ${recording.createdAt}`,
		recording.durationSec ? `- Duration: ${recording.durationSec}s` : "",
		"",
	].join("\n");

	const writeResult = await api.writeFile(filePath, `${baseContent}${appendix}`);
	if (!writeResult.success) {
		throw new Error(writeResult.error || "Failed to update meeting note");
	}
}
