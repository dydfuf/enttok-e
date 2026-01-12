import { app, BrowserWindow } from "electron";
import { stopBackend } from "./main/backend.js";
import { stopMcp } from "./main/mcp.js";
import { registerIpcHandlers } from "./main/ipc.js";
import { createMainWindow } from "./main/window.js";
import {
  registerVaultProtocol,
  registerVaultProtocolScheme,
} from "./main/protocols.js";
import {
  initializeNotificationScheduler,
  stopNotificationScheduler,
} from "./main/notifications.js";

registerVaultProtocolScheme();

app.whenReady().then(() => {
  registerVaultProtocol();
  createMainWindow();
  registerIpcHandlers();
  initializeNotificationScheduler();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  stopNotificationScheduler();
  await stopMcp();
  await stopBackend();
});
