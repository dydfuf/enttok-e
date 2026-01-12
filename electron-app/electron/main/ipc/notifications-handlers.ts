import { ipcMain } from "electron";
import {
  getWorkTimeNotifications,
  setWorkTimeNotifications,
  type WorkTimeNotificationSettings,
} from "../../store.js";
import {
  initializeNotificationScheduler,
  sendTestNotification,
} from "../notifications.js";

export function registerNotificationsHandlers() {
  // IPC Handlers for work time notifications
  ipcMain.handle("notifications:get-settings", () => getWorkTimeNotifications());
  ipcMain.handle(
    "notifications:set-settings",
    (_event, settings: unknown) => {
      // Validate input from renderer
      if (!settings || typeof settings !== "object") {
        return { success: false, error: "Invalid settings format" };
      }
      const s = settings as Record<string, unknown>;
      if (typeof s.enabled !== "boolean") {
        return { success: false, error: "Invalid enabled field" };
      }
      if (s.workStartTime !== null && typeof s.workStartTime !== "string") {
        return { success: false, error: "Invalid workStartTime field" };
      }
      if (s.workEndTime !== null && typeof s.workEndTime !== "string") {
        return { success: false, error: "Invalid workEndTime field" };
      }
      if (typeof s.workStartMessage !== "string") {
        return { success: false, error: "Invalid workStartMessage field" };
      }
      if (typeof s.workEndMessage !== "string") {
        return { success: false, error: "Invalid workEndMessage field" };
      }
      // Validate time format if provided
      const timeRegex = /^\d{2}:\d{2}$/;
      if (s.workStartTime && !timeRegex.test(s.workStartTime as string)) {
        return { success: false, error: "Invalid workStartTime format" };
      }
      if (s.workEndTime && !timeRegex.test(s.workEndTime as string)) {
        return { success: false, error: "Invalid workEndTime format" };
      }

      setWorkTimeNotifications(s as unknown as WorkTimeNotificationSettings);
      initializeNotificationScheduler();
      return { success: true };
    }
  );
  ipcMain.handle("notifications:test", () => {
    sendTestNotification();
    return { success: true };
  });
}
