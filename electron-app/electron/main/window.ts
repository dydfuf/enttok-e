import { BrowserWindow } from "electron";
import { getPreloadPath, getRendererIndexPath } from "../paths.js";

const isDev = process.env.NODE_ENV === "development";

export function createMainWindow() {
  const isMac = process.platform === "darwin";

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    titleBarOverlay: isMac
      ? {
          color: "#00000000",
          symbolColor: "#ffffff",
          height: 32,
        }
      : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    // 개발 모드: Vite 개발 서버 로드
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션: 빌드된 파일 로드
    mainWindow.loadFile(getRendererIndexPath());
  }

  return mainWindow;
}
