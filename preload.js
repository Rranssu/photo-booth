const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    /**
     * Saves a base64 DataURL as a PNG file
     * @param {string} dataUrl 
     */
    saveImage: (dataUrl) => ipcRenderer.invoke('save-image', dataUrl),

    /**
     * Saves a video ArrayBuffer as a WebM file
     * @param {ArrayBuffer} buffer 
     */
    saveVideo: (buffer) => ipcRenderer.invoke('save-video', buffer),

    /**
     * Fetches an array of file paths for images in the photobooth folder
     * @returns {Promise<string[]>}
     */
    getPhotos: () => ipcRenderer.invoke('get-photos')
});