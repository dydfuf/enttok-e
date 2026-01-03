import { app, BrowserWindow } from "electron";
import { stopBackend } from "./main/backend.js";
import { registerIpcHandlers } from "./main/ipc.js";
import { createMainWindow } from "./main/window.js";
import {
  registerVaultProtocol,
  registerVaultProtocolScheme,
} from "./main/protocols.js";

registerVaultProtocolScheme();

app.whenReady().then(() => {
  registerVaultProtocol();
  createMainWindow();
  registerIpcHandlers();

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
  await stopBackend();
});
