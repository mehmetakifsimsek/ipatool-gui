const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Binary Management ──────────────────────────────────────────────────────
  checkBinary: () => ipcRenderer.invoke('check-binary'),
  downloadBinary: (params) => ipcRenderer.invoke('download-binary', params),
  getLocalCliVersion: () => ipcRenderer.invoke('get-local-cli-version'),

  // ── Auth ────────────────────────────────────────────────────────────────────
  authLogin: (credentials) => ipcRenderer.invoke('auth-login', credentials),
  auth2FA: (data) => ipcRenderer.invoke('auth-2fa', data),
  cancelAuth: () => ipcRenderer.invoke('cancel-auth'),
  authInfo: () => ipcRenderer.invoke('auth-info'),
  authRevoke: () => ipcRenderer.invoke('auth-revoke'),

  // ── App Store Operations ───────────────────────────────────────────────────
  search: (params) => ipcRenderer.invoke('search', params),
  purchase: (params) => ipcRenderer.invoke('purchase', params),
  downloadIpa: (params) => ipcRenderer.invoke('download-ipa', params),
  cancelDownload: (params) => ipcRenderer.invoke('cancel-download', params),
  pauseDownload: (params) => ipcRenderer.invoke('pause-download', params),
  resumeDownload: (params) => ipcRenderer.invoke('resume-download', params),
  listVersions: (params) => ipcRenderer.invoke('list-versions', params),
  getVersionMetadata: (params) => ipcRenderer.invoke('get-version-metadata', params),
  cancelVersionDetails: () => ipcRenderer.invoke('cancel-version-details'),


  // ── File System ────────────────────────────────────────────────────────────
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openFileLocation: (params) => ipcRenderer.invoke('open-file-location', params),

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  cleanTempFiles: () => ipcRenderer.invoke('clean-temp-files'),

  // ── GitHub ────────────────────────────────────────────────────────────────────
  fetchIpatoolVersion: () => ipcRenderer.invoke('fetch-ipatool-version'),
  fetchGithubAvatar: (params) => ipcRenderer.invoke('fetch-github-avatar', params),
  checkGuiUpdate: () => ipcRenderer.invoke('check-gui-update'),
  downloadGuiUpdate: (params) => ipcRenderer.invoke('download-gui-update', params),
  openExternal: (params) => ipcRenderer.invoke('open-external', params),

  // ── Event Listeners ────────────────────────────────────────────────────────
  onDownloadLog: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('download-log', handler);
    // Return unsubscribe function for convenience
    return () => ipcRenderer.removeListener('download-log', handler);
  },

  onCommandOutput: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('command-output', handler);
    return () => ipcRenderer.removeListener('command-output', handler);
  },

  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  onGuiUpdateProgress: (callback) => {
    const handler = (_event, percentage) => callback(percentage);
    ipcRenderer.on('gui-update-progress', handler);
    return () => ipcRenderer.removeListener('gui-update-progress', handler);
  },

  // ── Cleanup ────────────────────────────────────────────────────────────────
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // ── Window Controls ────────────────────────────────────────────────────────
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
});
