import { useCallback, useEffect, useRef, useState } from "react";

const MIME_TYPE_CANDIDATES = [
	"audio/mp4",
	"audio/m4a",
	"audio/aac",
	"audio/webm;codecs=opus",
	"audio/webm",
];

export type RecordingResult = {
	blob: Blob;
	durationSec: number;
	mimeType: string;
};

export type UseAudioRecorder = {
	isRecording: boolean;
	durationSec: number;
	error: string | null;
	mimeType: string | null;
	startRecording: () => Promise<void>;
	stopRecording: () => Promise<RecordingResult>;
};

export function useAudioRecorder(): UseAudioRecorder {
	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const timerRef = useRef<number | null>(null);
	const startTimeRef = useRef<number | null>(null);

	const [isRecording, setIsRecording] = useState(false);
	const [durationSec, setDurationSec] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [mimeType, setMimeType] = useState<string | null>(null);

	const startRecording = useCallback(async () => {
		if (!navigator.mediaDevices?.getUserMedia) {
			setError("Audio recording is not supported in this environment");
			return;
		}
		if (typeof MediaRecorder === "undefined") {
			setError("MediaRecorder is not available");
			return;
		}
		if (isRecording) {
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			streamRef.current = stream;
			chunksRef.current = [];
			setError(null);

			const supportedType = MIME_TYPE_CANDIDATES.find((type) =>
				MediaRecorder.isTypeSupported(type),
			);
			const recorder = supportedType
				? new MediaRecorder(stream, { mimeType: supportedType })
				: new MediaRecorder(stream);

			setMimeType(recorder.mimeType || supportedType || null);
			recorderRef.current = recorder;

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};

			recorder.start();
			setIsRecording(true);
			setDurationSec(0);
			startTimeRef.current = Date.now();
			timerRef.current = window.setInterval(() => {
				if (startTimeRef.current) {
					setDurationSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
				}
			}, 1000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to start recording");
		}
	}, [isRecording]);

	const stopRecording = useCallback(async (): Promise<RecordingResult> => {
		const recorder = recorderRef.current;
		if (!recorder) {
			throw new Error("No active recording");
		}

		return new Promise((resolve) => {
			recorder.onstop = () => {
				if (timerRef.current) {
					window.clearInterval(timerRef.current);
					timerRef.current = null;
				}
				setIsRecording(false);
				const duration = startTimeRef.current
					? Math.floor((Date.now() - startTimeRef.current) / 1000)
					: 0;
				startTimeRef.current = null;
				streamRef.current?.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
				const blob = new Blob(chunksRef.current, {
					type: recorder.mimeType || "audio/webm",
				});
				chunksRef.current = [];
				resolve({
					blob,
					durationSec: duration,
					mimeType: recorder.mimeType || "audio/webm",
				});
			};
			recorder.stop();
		});
	}, []);

	useEffect(() => {
		return () => {
			if (timerRef.current) {
				window.clearInterval(timerRef.current);
			}
			streamRef.current?.getTracks().forEach((track) => track.stop());
			if (recorderRef.current && recorderRef.current.state !== "inactive") {
				recorderRef.current.stop();
			}
		};
	}, []);

	return {
		isRecording,
		durationSec,
		error,
		mimeType,
		startRecording,
		stopRecording,
	};
}
