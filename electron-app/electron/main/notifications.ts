import { Notification } from "electron";
import { getMainWindow } from "./window.js";
import { getWorkTimeNotifications } from "../store.js";

type ScheduledTimer = {
  workStart: NodeJS.Timeout | null;
  workEnd: NodeJS.Timeout | null;
};

const scheduledTimers: ScheduledTimer = {
  workStart: null,
  workEnd: null,
};

/**
 * Parse "HH:mm" string to { hours, minutes }
 */
function parseTimeString(
  timeStr: string
): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Calculate milliseconds until next occurrence of given time
 */
function getMsUntilTime(hours: number, minutes: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  // If target time has already passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

/**
 * Show native notification and handle click to focus window
 */
function showWorkNotification(title: string, body: string): void {
  if (!Notification.isSupported()) {
    console.warn("Notifications not supported on this system");
    return;
  }

  const notification = new Notification({
    title,
    body,
    silent: false,
  });

  notification.on("click", () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    }
  });

  notification.show();
}

/**
 * Schedule a recurring daily notification
 */
function scheduleDaily(
  key: keyof ScheduledTimer,
  hours: number,
  minutes: number,
  title: string,
  body: string
): void {
  // Clear any existing timer for this key
  if (scheduledTimers[key]) {
    clearTimeout(scheduledTimers[key]);
    scheduledTimers[key] = null;
  }

  const scheduleNext = () => {
    const msUntil = getMsUntilTime(hours, minutes);

    scheduledTimers[key] = setTimeout(() => {
      showWorkNotification(title, body);
      // Schedule the next occurrence (tomorrow)
      scheduleNext();
    }, msUntil);
  };

  scheduleNext();
}

/**
 * Clear all scheduled notification timers
 */
function clearAllTimers(): void {
  if (scheduledTimers.workStart) {
    clearTimeout(scheduledTimers.workStart);
    scheduledTimers.workStart = null;
  }
  if (scheduledTimers.workEnd) {
    clearTimeout(scheduledTimers.workEnd);
    scheduledTimers.workEnd = null;
  }
}

/**
 * Initialize or reinitialize notification schedules based on stored settings
 */
export function initializeNotificationScheduler(): void {
  const settings = getWorkTimeNotifications();

  clearAllTimers();

  if (!settings.enabled) {
    return;
  }

  // Schedule work start notification
  if (settings.workStartTime) {
    const parsed = parseTimeString(settings.workStartTime);
    if (parsed) {
      scheduleDaily(
        "workStart",
        parsed.hours,
        parsed.minutes,
        "출근 알림",
        settings.workStartMessage
      );
    }
  }

  // Schedule work end notification
  if (settings.workEndTime) {
    const parsed = parseTimeString(settings.workEndTime);
    if (parsed) {
      scheduleDaily(
        "workEnd",
        parsed.hours,
        parsed.minutes,
        "퇴근 알림",
        settings.workEndMessage
      );
    }
  }
}

/**
 * Stop all scheduled notifications (call on app quit)
 */
export function stopNotificationScheduler(): void {
  clearAllTimers();
}

/**
 * Test notification (for user to verify settings work)
 */
export function sendTestNotification(): void {
  showWorkNotification("테스트 알림", "알림이 정상적으로 작동합니다!");
}
