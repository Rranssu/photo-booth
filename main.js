const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const photoDir = path.join(app.getPath('pictures'), 'photobooth');

if (!fs.existsSync(photoDir)) {
    fs.mkdirSync(photoDir, { recursive: true });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1100,
        height: 750,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false 
        },
        autoHideMenuBar: true
    });

    win.loadFile('src/index.html');
}

// Fixed: Strips the DataURL prefix if a string is sent, or handles Buffer
ipcMain.handle('save-image', async (event, dataUrl) => {
    try {
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        const fileName = `photo-${Date.now()}.png`;
        const filePath = path.join(photoDir, fileName);
        fs.writeFileSync(filePath, base64Data, 'base64');
        return { success: true, path: filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Fixed: Handles the incoming video data correctly
ipcMain.handle('save-video', async (event, arrayBuffer) => {
    try {
        const fileName = `video-${Date.now()}.webm`;
        const filePath = path.join(photoDir, fileName);
        // Convert the ArrayBuffer from the renderer into a Node.js Buffer
        const buffer = Buffer.from(arrayBuffer);
        
        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath };
    } catch (error) {
        console.error("Save Video Error:", error);
        return { success: false, error: error.message };
    }
});

// Updated: Includes .webm files so they show up in your gallery
ipcMain.handle('get-photos', async () => {
    try {
        const files = fs.readdirSync(photoDir);
        return files
            .filter(file => /\.(png|jpg|jpeg|webm)$/i.test(file)) // Added webm
            .map(file => path.join(photoDir, file))
            .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
    } catch (error) {
        return [];
    }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });