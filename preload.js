const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    login: (email, password) => ipcRenderer.invoke('login', { email, password }),
    register: (email, password) => ipcRenderer.invoke('register', { email, password }),
    getCarrotCount: (email) => ipcRenderer.invoke('getCarrotCount', { email }),
    updateCarrots: (email, amount) => ipcRenderer.invoke('updateCarrots', { email, carrotsToAdd: amount }),
    purchaseItem: (email, itemId, price) => ipcRenderer.invoke('purchaseItem', { email, itemId, price }),
    getVolume: (email) => ipcRenderer.invoke('getVolume', { email }),
    saveVolume: (email, volume) => ipcRenderer.invoke('saveVolume', { email, volume }),
});
