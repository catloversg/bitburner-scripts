import { app, BrowserWindow } from "electron";

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            backgroundThrottling: false,
        },
    });
    mainWindow.loadURL("https://bitburner.local/");
    mainWindow.once("ready-to-show", () => {
        mainWindow.maximize();
    });
};
app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
