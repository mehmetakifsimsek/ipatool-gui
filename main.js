const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
// Set custom userData path to prevent Turkish character/encoding issues in Windows username (non-ASCII usernames)
app.setPath('userData', 'C:\\Users\\Public\\ipatool-gui');

const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');

// ── Fix Windows GPU cache & rendering issues ───────────────────────────────────
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('no-sandbox');

// ── Constants ──────────────────────────────────────────────────────────────────
const IPATOOL_VERSION = '2.3.0';
const IPATOOL_URL = `https://github.com/majd/ipatool/releases/download/v${IPATOOL_VERSION}/ipatool-${IPATOOL_VERSION}-windows-amd64.tar.gz`;
const KEYCHAIN_PASSPHRASE = 'ipatool';
const DEFAULT_TIMEOUT = 30000;   // 30 seconds
const DOWNLOAD_TIMEOUT = 300000; // 5 minutes

// ── Paths ──────────────────────────────────────────────────────────────────────
let binDir;
let binaryPath;
let settingsPath;

function initPaths() {
  binDir = path.join(app.getPath('userData'), 'bin');
  binaryPath = path.join(binDir, 'ipatool.exe');
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
}

// ── Single Instance Lock ───────────────────────────────────────────────────────
let gotTheLock = false;
try {
  gotTheLock = app.requestSingleInstanceLock();
} catch (e) {
  // Lock file might be stale — continue anyway
  gotTheLock = true;
}

if (!gotTheLock) {
  app.quit();
}

// ── Window ─────────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App Lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  initPaths();

  // Automatically update the cached binary in userData if the bundled binary is different in size or newer
  const bundledPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'bin', 'ipatool.exe') 
    : path.join(__dirname, 'bin', 'ipatool.exe');

  if (fs.existsSync(bundledPath)) {
    try {
      let shouldCopy = false;
      if (!fs.existsSync(binaryPath)) {
        shouldCopy = true;
      } else {
        const bundledStats = fs.statSync(bundledPath);
        const cachedStats = fs.statSync(binaryPath);
        if (bundledStats.size !== cachedStats.size || bundledStats.mtime > cachedStats.mtime) {
          shouldCopy = true;
        }
      }
      if (shouldCopy) {
        fs.mkdirSync(binDir, { recursive: true });
        fs.copyFileSync(bundledPath, binaryPath);
        console.log('[Startup] Successfully updated cached ipatool binary from resources');
        saveInstalledCliVersion(IPATOOL_VERSION);
      }
    } catch (e) {
      console.error('[Startup] Failed to sync cached binary:', e.message);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

// ── Settings ───────────────────────────────────────────────────────────────────
function getDefaultSettings() {
  return {
    outputDir: app.getPath('downloads'),
    country: 'US',
    concurrentDownloads: 1,
  };
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      return { ...getDefaultSettings(), ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('Failed to load settings:', err.message);
  }
  return getDefaultSettings();
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err.message);
    return false;
  }
}

function saveInstalledCliVersion(version) {
  try {
    const settings = loadSettings();
    settings.installedCliVersion = version;
    saveSettings(settings);
  } catch (e) {
    console.error('Failed to save installed CLI version to settings:', e.message);
  }
}

// ── Binary Management ──────────────────────────────────────────────────────────
function binaryExists() {
  return fs.existsSync(binaryPath);
}

/**
 * Follow HTTP redirects (GitHub releases redirect to CDN).
 * Returns a readable response stream via callback.
 */
function httpsGetFollowRedirects(url, callback) {
  https.get(url, { headers: { 'User-Agent': 'ipatool-gui' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      httpsGetFollowRedirects(res.headers.location, callback);
    } else {
      callback(null, res);
    }
  }).on('error', (err) => {
    callback(err, null);
  });
}

function getLocalIpatoolVersion() {
  return new Promise((resolve) => {
    if (!fs.existsSync(binaryPath)) {
      resolve('Not Installed');
      return;
    }
    execFile(binaryPath, ['--version'], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve('Unknown');
        return;
      }
      const match = stdout.match(/version\s+([^\s\r\n]+)/);
      if (match && match[1]) {
        let ver = match[1].trim();
        if (ver.toLowerCase() === 'dev' || ver.toLowerCase() === 'vdev') {
          ver = '2.3.0';
        }
        resolve('v' + ver);
      } else {
        resolve('Unknown');
      }
    });
  });
}

function downloadBinary(event, version) {
  return new Promise((resolve) => {
    const sendLog = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-log', msg);
      }
    };

    const targetVersion = version || IPATOOL_VERSION;
    const downloadUrl = `https://github.com/majd/ipatool/releases/download/v${targetVersion}/ipatool-${targetVersion}-windows-amd64.tar.gz`;

    sendLog(`Target binary path: ${binaryPath}`);
    sendLog(`Target version: ${targetVersion}`);
    sendLog(`Creating binary directory: ${binDir}`);

    // Ensure bin directory exists
    try {
      fs.mkdirSync(binDir, { recursive: true });
    } catch (err) {
      sendLog(`Error creating directory: ${err.message}`);
      resolve({ success: false, error: err.message });
      return;
    }

    // Only use bundled local resources if we are installing the default IPATOOL_VERSION
    if (!version || version === IPATOOL_VERSION) {
      const bundledPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'bin', 'ipatool.exe') 
        : path.join(__dirname, 'bin', 'ipatool.exe');

      if (fs.existsSync(bundledPath)) {
        sendLog(`Bundled ipatool binary detected at: ${bundledPath}`);
        sendLog(`Installing local binary from resources to: ${binaryPath}`);
        setTimeout(() => {
          try {
            fs.copyFileSync(bundledPath, binaryPath);
            saveInstalledCliVersion(IPATOOL_VERSION);
            sendLog(`Setup complete. ipatool binary installed successfully at: ${binaryPath}`);
            resolve({ success: true });
          } catch (copyErr) {
            sendLog(`Error copying binary: ${copyErr.message}`);
            resolve({ success: false, error: copyErr.message });
          }
        }, 1000);
        return;
      }
    }

    const tarPath = path.join(binDir, `ipatool-${targetVersion}.tar.gz`);

    sendLog(`Downloading ipatool v${targetVersion} into temp file: ${tarPath}`);
    sendLog(`URL: ${downloadUrl}`);

    httpsGetFollowRedirects(downloadUrl, (err, res) => {
      if (err) {
        sendLog(`Download error: ${err.message}`);
        resolve({ success: false, error: err.message });
        return;
      }

      if (res.statusCode !== 200) {
        sendLog(`HTTP error: ${res.statusCode}`);
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;
      let lastProgress = -1;

      const fileStream = fs.createWriteStream(tarPath);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const progress = Math.floor((downloadedBytes / totalBytes) * 100);
          if (progress !== lastProgress && progress % 10 === 0) {
            lastProgress = progress;
            sendLog(`Progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
          }
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        sendLog(`Download complete. Extracting archive to: ${binDir}`);

        // Extract using system tar (available on Windows 10/11)
        const tarProc = spawn('tar', ['-xzf', tarPath, '-C', binDir], {
          timeout: 60000,
        });

        let tarStderr = '';

        tarProc.stderr.on('data', (data) => {
          tarStderr += data.toString();
        });

        tarProc.on('close', (code) => {
          // Clean up tar.gz regardless of outcome
          try {
            fs.unlinkSync(tarPath);
          } catch (_) {
            /* ignore cleanup errors */
          }

          if (code !== 0) {
            sendLog(`Extraction failed (exit code ${code}): ${tarStderr}`);
            resolve({ success: false, error: `Extraction failed: ${tarStderr}` });
            return;
          }

          // Verify binary exists after extraction
          if (binaryExists()) {
            saveInstalledCliVersion(targetVersion);
            sendLog(`ipatool binary installed successfully at: ${binaryPath}`);
            resolve({ success: true });
          } else {
            // The extracted binary may be nested in a folder — search for it
            sendLog('Binary not found at expected path, searching...');
            const found = findBinaryRecursive(binDir, 'ipatool.exe');
            if (found) {
              try {
                fs.renameSync(found, binaryPath);
                saveInstalledCliVersion(targetVersion);
                sendLog('Binary moved to correct location.');
                resolve({ success: true });
              } catch (moveErr) {
                sendLog(`Failed to move binary: ${moveErr.message}`);
                resolve({ success: false, error: moveErr.message });
              }
            } else {
              sendLog('Could not find ipatool.exe after extraction.');
              resolve({ success: false, error: 'Binary not found after extraction' });
            }
          }
        });

        tarProc.on('error', (spawnErr) => {
          sendLog(`Failed to run tar: ${spawnErr.message}`);
          try {
            fs.unlinkSync(tarPath);
          } catch (_) {
            /* ignore */
          }
          resolve({ success: false, error: spawnErr.message });
        });
      });

      fileStream.on('error', (writeErr) => {
        sendLog(`File write error: ${writeErr.message}`);
        resolve({ success: false, error: writeErr.message });
      });
    });
  });
}

function findBinaryRecursive(dir, filename) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        const lowerName = entry.name.toLowerCase();
        // Match either the exact requested filename or any filename starting with ipatool and ending with .exe
        if (lowerName === filename.toLowerCase() || (lowerName.startsWith('ipatool') && lowerName.endsWith('.exe'))) {
          return fullPath;
        }
      }
      if (entry.isDirectory()) {
        const result = findBinaryRecursive(fullPath, filename);
        if (result) return result;
      }
    }
  } catch (_) {
    /* ignore access errors */
  }
  return null;
}

// ── CLI Wrapper ────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const os = require('os');
let ipatoolQueue = Promise.resolve();

/**
 * Direct execution of ipatool command.
 */
function runIpatoolDirect(args, options = {}) {
  return new Promise((resolve) => {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const fullArgs = [
      ...args,
      '--format', 'json',
      '--non-interactive',
      '--keychain-passphrase', KEYCHAIN_PASSPHRASE,
    ];

    execFile(binaryPath, fullArgs, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        // If the process produced output before erroring, include it
        const output = (stdout || '') + (stderr || '');
        resolve({
          success: false,
          output: output || err.message,
          error: err.message,
        });
        return;
      }
      resolve({
        success: true,
        output: (stdout || '').trim(),
      });
    });
  });
}

let activeReadOnlyProcesses = [];

/**
 * Run ipatool in a completely isolated temp home directory to avoid lock file conflicts.
 */
function runIpatoolIsolated(args, options = {}) {
  return new Promise((resolve) => {
    const tempHome = path.join(os.tmpdir(), `ipatool-isolated-${Date.now()}-${Math.random().toString(36).substring(2)}`);
    const tempIpatoolDir = path.join(tempHome, '.ipatool');
    
    try {
      fs.mkdirSync(tempIpatoolDir, { recursive: true });
      
      const masterDir = path.join(os.homedir(), '.ipatool');
      const filesToCopy = ['account', 'cookies'];
      for (const file of filesToCopy) {
        const srcPath = path.join(masterDir, file);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, path.join(tempIpatoolDir, file));
        }
      }
    } catch (err) {
      resolve({
        success: false,
        output: '',
        error: `Failed to initialize isolated environment: ${err.message}`
      });
      return;
    }

    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const fullArgs = [
      ...args,
      '--format', 'json',
      '--non-interactive',
      '--keychain-passphrase', KEYCHAIN_PASSPHRASE,
    ];

    let drive = '';
    let restPath = tempHome;
    if (tempHome.charAt(1) === ':') {
      drive = tempHome.substring(0, 2);
      restPath = tempHome.substring(2);
    }

    const env = {
      ...process.env,
      USERPROFILE: tempHome,
      HOME: tempHome,
      HOMEDRIVE: drive,
      HOMEPATH: restPath,
    };

    const proc = execFile(binaryPath, fullArgs, { timeout, env, windowsHide: true }, (err, stdout, stderr) => {
      // Remove from active processes list
      activeReadOnlyProcesses = activeReadOnlyProcesses.filter(p => p !== proc);

      // Async cleanup
      try {
        fs.rm(tempHome, { recursive: true, force: true }, () => {});
      } catch (_) {}

      if (err) {
        const output = (stdout || '') + (stderr || '');
        resolve({
          success: false,
          output: output || err.message,
          error: err.message,
        });
        return;
      }
      resolve({
        success: true,
        output: (stdout || '').trim(),
      });
    });

    activeReadOnlyProcesses.push(proc);
  });
}

/**
 * Route commands: read-only run concurrently (isolated), writes run sequentially.
 */
function runIpatool(args, options = {}) {
  const cmd = args[0];
  const isReadOnly = cmd === 'search' || cmd === 'list-versions' || cmd === 'get-version-metadata' || (cmd === 'auth' && args[1] === 'info');

  if (isReadOnly) {
    return runIpatoolIsolated(args, options);
  } else {
    const run = async () => {
      // Add 150ms delay to let OS release locks completely
      await delay(150);
      return runIpatoolDirect(args, options);
    };
    ipatoolQueue = ipatoolQueue.then(run, run);
    return ipatoolQueue;
  }
}

// ── Auth Login with 2FA Support ────────────────────────────────────────────────
let activeAuthProcess = null;

function authLogin(email, password) {
  return new Promise((resolve) => {
    // Kill any lingering auth process
    if (activeAuthProcess) {
      try {
        activeAuthProcess.kill();
      } catch (_) {
        /* ignore */
      }
      activeAuthProcess = null;
    }

    const args = [
      'auth', 'login',
      '--email', email,
      '--password', password,
      '--format', 'json',
      '--keychain-passphrase', KEYCHAIN_PASSPHRASE,
    ];

    const proc = spawn(binaryPath, args, { windowsHide: true });
    activeAuthProcess = proc;

    let stdout = '';
    let stderr = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        activeAuthProcess = null;
        resolve({
          success: false,
          output: stdout + stderr,
          error: 'Login timed out after 30 seconds',
        });
      }
    }, DEFAULT_TIMEOUT);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();

      // Check if 2FA is needed — ipatool asks for the code on stdout
      const combined = stdout.toLowerCase();
      if (combined.includes('2fa') || combined.includes('two-factor') || combined.includes('verification code') || combined.includes('code:')) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          // Don't kill the process — we need it alive for 2FA input
          resolve({
            success: false,
            output: stdout,
            needs2FA: true,
          });
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();

      // Also check stderr for 2FA prompts
      const combined = stderr.toLowerCase();
      if (combined.includes('2fa') || combined.includes('two-factor') || combined.includes('verification code') || combined.includes('code:')) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            output: stdout + stderr,
            needs2FA: true,
          });
        }
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      activeAuthProcess = null;
      if (!resolved) {
        resolved = true;
        resolve({
          success: code === 0,
          output: (stdout + stderr).trim(),
          error: code !== 0 ? `Process exited with code ${code}` : undefined,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      activeAuthProcess = null;
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          output: stdout + stderr,
          error: err.message,
        });
      }
    });
  });
}

function auth2FA(code) {
  return new Promise((resolve) => {
    if (!activeAuthProcess || activeAuthProcess.killed) {
      resolve({
        success: false,
        output: '',
        error: 'No active auth process. Please start login again.',
      });
      return;
    }

    const proc = activeAuthProcess;
    let additionalOutput = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          proc.kill();
        } catch (_) {
          /* ignore */
        }
        activeAuthProcess = null;
        resolve({
          success: false,
          output: additionalOutput,
          error: '2FA verification timed out',
        });
      }
    }, DEFAULT_TIMEOUT);

    // Collect any further output after writing the code
    const onStdout = (data) => {
      additionalOutput += data.toString();
    };
    const onStderr = (data) => {
      additionalOutput += data.toString();
    };

    proc.stdout.on('data', onStdout);
    proc.stderr.on('data', onStderr);

    proc.on('close', (exitCode) => {
      clearTimeout(timeout);
      activeAuthProcess = null;
      if (!resolved) {
        resolved = true;
        resolve({
          success: exitCode === 0,
          output: additionalOutput.trim(),
          error: exitCode !== 0 ? `Process exited with code ${exitCode}` : undefined,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      activeAuthProcess = null;
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          output: additionalOutput,
          error: err.message,
        });
      }
    });

    // Write the 2FA code to stdin
    try {
      proc.stdin.write(code + '\n');
    } catch (err) {
      clearTimeout(timeout);
      activeAuthProcess = null;
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          output: additionalOutput,
          error: `Failed to send 2FA code: ${err.message}`,
        });
      }
    }
  });
}

// ── Download IPA with Streaming Output ─────────────────────────────────────────
const activeDownloadProcesses = new Map();
let purchaseLock = Promise.resolve();

function serializedPurchase(bundleId) {
  return new Promise((resolve) => {
    purchaseLock = purchaseLock.then(async () => {
      try {
        const result = await runIpatool(['purchase', '--bundle-identifier', bundleId]);
        resolve(result);
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  });
}

function downloadIpa(taskId, bundleId, outputDir, purchaseFlag, versionId) {
  return new Promise(async (resolve) => {
    // 1. If purchase flag is enabled, run it in a serialized queue first to avoid session conflicts
    if (purchaseFlag) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('command-output', { taskId, line: 'Checking/Acquiring application license (serialized purchase)...' });
      }
      const purchaseResult = await serializedPurchase(bundleId);
      if (purchaseResult && !purchaseResult.success) {
        const errStr = purchaseResult.error || '';
        // If it failed because it's already purchased, that's fine. Log it but continue.
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('command-output', { taskId, line: `Note: License check/acquisition returned: ${errStr || 'Already licensed or skipped'}` });
        }
      } else {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('command-output', { taskId, line: '✅ License acquired or verified successfully.' });
        }
      }
    }

    // 2. Create a completely isolated temporary directory for this download task
    const taskTempDir = path.join(outputDir, `.tmp-ipatool-${taskId}`);
    try {
      if (!fs.existsSync(taskTempDir)) {
        fs.mkdirSync(taskTempDir, { recursive: true });
      }
    } catch (err) {
      return resolve({
        success: false,
        output: '',
        error: `Failed to create isolated temp workspace: ${err.message}`,
      });
    }

    const args = [
      'download',
      '--bundle-identifier', bundleId,
      '--output', taskTempDir, // Download into the isolated directory
      '--format', 'json',
      '--non-interactive',
      '--keychain-passphrase', KEYCHAIN_PASSPHRASE,
    ];

    if (versionId) {
      args.push('--external-version-id', String(versionId));
    }

    const proc = spawn(binaryPath, args, { windowsHide: true });
    activeDownloadProcesses.set(taskId, proc);

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      proc.kill();
      try {
        if (fs.existsSync(taskTempDir)) {
          fs.rmSync(taskTempDir, { recursive: true, force: true });
        }
      } catch (_) {}
      resolve({
        success: false,
        output: stdout + stderr,
        error: 'Download timed out after 5 minutes',
      });
    }, DOWNLOAD_TIMEOUT);

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      // Stream each line to the renderer with the taskId
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      for (const line of lines) {
        if (line.startsWith('{"type":"progress"') || line.startsWith('{"type": "progress"')) {
          try {
            const progressData = JSON.parse(line);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download-progress', { taskId, percentage: progressData.percentage });
            }
          } catch (e) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('command-output', { taskId, line });
            }
          }
        } else {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('command-output', { taskId, line });
          }
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;

      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      for (const line of lines) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('command-output', { taskId, line });
        }
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      activeDownloadProcesses.delete(taskId);

      if (code === 0) {
        // Success: Find the .ipa file in the isolated workspace and move it to the parent outputDir
        try {
          const files = fs.readdirSync(taskTempDir);
          const ipaFile = files.find((f) => f.toLowerCase().endsWith('.ipa'));

          if (ipaFile) {
            const srcPath = path.join(taskTempDir, ipaFile);
            const destPath = path.join(outputDir, ipaFile);

            // Move file (overwrite if exists)
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath);
            }
            fs.renameSync(srcPath, destPath);

            // Delete isolated temp directory
            fs.rmSync(taskTempDir, { recursive: true, force: true });

            resolve({
              success: true,
              output: JSON.stringify({ success: true, path: destPath }),
              error: undefined,
            });
          } else {
            // No ipa file found inside the folder
            fs.rmSync(taskTempDir, { recursive: true, force: true });
            resolve({
              success: false,
              output: (stdout + stderr).trim(),
              error: 'Download succeeded but could not locate the compiled .ipa package in workspace',
            });
          }
        } catch (err) {
          try {
            if (fs.existsSync(taskTempDir)) {
              fs.rmSync(taskTempDir, { recursive: true, force: true });
            }
          } catch (_) {}
          resolve({
            success: false,
            output: (stdout + stderr).trim(),
            error: `Failed to finalize downloaded package: ${err.message}`,
          });
        }
      } else {
        // Process failed: Clean up the isolated directory
        try {
          if (fs.existsSync(taskTempDir)) {
            fs.rmSync(taskTempDir, { recursive: true, force: true });
          }
        } catch (_) {}
        resolve({
          success: false,
          output: (stdout + stderr).trim(),
          error: `Process exited with code ${code}`,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      activeDownloadProcesses.delete(taskId);
      try {
        if (fs.existsSync(taskTempDir)) {
          fs.rmSync(taskTempDir, { recursive: true, force: true });
        }
      } catch (_) {}
      resolve({
        success: false,
        output: stdout + stderr,
        error: err.message,
      });
    });
  });
}

// ── IPC Handlers ───────────────────────────────────────────────────────────────

// Binary management
ipcMain.handle('check-binary', () => {
  return { exists: binaryExists(), path: binaryPath };
});

ipcMain.handle('download-binary', async (event, { version } = {}) => {
  try {
    return await downloadBinary(event, version);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-local-cli-version', async () => {
  try {
    return await getLocalIpatoolVersion();
  } catch (err) {
    return 'Unknown';
  }
});

// Auth
ipcMain.handle('auth-login', async (_event, { email, password }) => {
  try {
    return await authLogin(email, password);
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});

ipcMain.handle('auth-2fa', async (_event, { code }) => {
  try {
    return await auth2FA(code);
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});

ipcMain.handle('cancel-auth', () => {
  if (activeAuthProcess) {
    try {
      activeAuthProcess.kill();
    } catch (_) {}
    activeAuthProcess = null;
  }
  return { success: true };
});

ipcMain.handle('auth-info', async () => {
  try {
    return await runIpatool(['auth', 'info']);
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});

ipcMain.handle('auth-revoke', async () => {
  try {
    return await runIpatool(['auth', 'revoke']);
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});

// Enrich search output with artwork from public iTunes API
async function enrichSearchOutput(output, country = 'us') {
  if (!output) return output;
  const lines = output.split('\n');
  const enrichedLines = [];
  const parsedLines = [];
  const appIds = [];
  
  for (const line of lines) {
    if (!line.trim()) {
      parsedLines.push({ isJson: false, raw: line });
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      parsedLines.push({ isJson: true, data: parsed, raw: line });
      if (parsed && Array.isArray(parsed.apps)) {
        for (const app of parsed.apps) {
          if (app.id) {
            appIds.push(app.id);
          }
        }
      }
    } catch (e) {
      parsedLines.push({ isJson: false, raw: line });
    }
  }

  if (appIds.length === 0) {
    return output;
  }

  const artworkMap = new Map();
  try {
    const url = `https://itunes.apple.com/lookup?id=${appIds.join(',')}&country=${country || 'us'}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.results)) {
        for (const item of data.results) {
          if (item.trackId && item.artworkUrl100) {
            artworkMap.set(item.trackId, item.artworkUrl100);
          }
        }
      }
    }
  } catch (err) {
    // Fail silently, returning original search results without logos
  }

  for (const line of parsedLines) {
    if (line.isJson) {
      const parsed = line.data;
      if (parsed && Array.isArray(parsed.apps)) {
        for (const app of parsed.apps) {
          if (app.id && artworkMap.has(app.id)) {
            const url = artworkMap.get(app.id);
            app.artworkUrl = url;
            app.artworkURL = url;
            app.artworkUrl100 = url;
          }
        }
      }
      enrichedLines.push(JSON.stringify(parsed));
    } else {
      enrichedLines.push(line.raw);
    }
  }

  return enrichedLines.join('\n');
}

// Search
ipcMain.handle('search', async (_event, { query, limit, country }) => {
  try {
    const args = ['search', query, '--limit', String(limit || 5)];
    if (country) {
      args.push('--country', country.toLowerCase());
    }
    const result = await runIpatool(args);
    if (result && result.success && result.output) {
      result.output = await enrichSearchOutput(result.output, country);
    }
    return result;
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});


// Purchase
ipcMain.handle('purchase', async (_event, { bundleId }) => {
  try {
    return await runIpatool(['purchase', '--bundle-identifier', bundleId]);
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});

// Download IPA
ipcMain.handle('download-ipa', async (_event, { taskId, bundleId, outputDir, purchase, versionId }) => {
  try {
    return await downloadIpa(taskId, bundleId, outputDir, purchase, versionId);
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});

// List versions
ipcMain.handle('list-versions', async (_event, { bundleId }) => {
  try {
    return await runIpatool(['list-versions', '--bundle-identifier', bundleId]);
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});

// Get version metadata
ipcMain.handle('get-version-metadata', async (_event, { bundleId, versionId }) => {
  try {
    return await runIpatool(['get-version-metadata', '--bundle-identifier', bundleId, '--external-version-id', String(versionId)]);
  } catch (err) {
    return { success: false, output: '', error: err.message };
  }
});

// Directory picker
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return { path: null };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Output Directory',
  });
  return { path: result.canceled ? null : result.filePaths[0] };
});

// Open file location
ipcMain.handle('open-file-location', async (_event, { path: filePath }) => {
  try {
    shell.showItemInFolder(path.normalize(filePath));
  } catch (err) {
    console.error('Failed to open file location:', err.message);
  }
});

// Settings
ipcMain.handle('get-settings', () => {
  return loadSettings();
});

ipcMain.handle('save-settings', (_event, settings) => {
  const success = saveSettings(settings);
  return { success };
});

// Cancel download
ipcMain.handle('cancel-download', async (_event, { taskId } = {}) => {
  if (taskId && activeDownloadProcesses.has(taskId)) {
    const proc = activeDownloadProcesses.get(taskId);
    if (proc && !proc.killed) {
      try {
        // Resume first in case it's suspended, to ensure clean termination on Windows
        await resumeProcess(proc.pid);
        proc.kill();
        activeDownloadProcesses.delete(taskId);
        return { success: true };
      } catch (err) {
        // Fallback directly to kill
        try {
          proc.kill();
        } catch (_) {}
        activeDownloadProcesses.delete(taskId);
        return { success: true };
      }
    }
  }
  return { success: false, error: 'No active download process with specified Task ID found' };
});

// OS-Level Process Suspend/Resume Helpers for Windows
function suspendProcess(pid) {
  return new Promise((resolve) => {
    const code = `
      $member = '[DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr hProcess);'
      $type = Add-Type -MemberDefinition $member -Name 'ntdll' -Namespace 'Win32' -PassThru
      $proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
      if ($proc) {
        [void]$type::NtSuspendProcess($proc.Handle)
        exit 0
      } else {
        exit 1
      }
    `;
    const child = spawn('powershell', ['-Command', code], { windowsHide: true });
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

function resumeProcess(pid) {
  return new Promise((resolve) => {
    const code = `
      $member = '[DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr hProcess);'
      $type = Add-Type -MemberDefinition $member -Name 'ntdll' -Namespace 'Win32' -PassThru
      $proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
      if ($proc) {
        [void]$type::NtResumeProcess($proc.Handle)
        exit 0
      } else {
        exit 1
      }
    `;
    const child = spawn('powershell', ['-Command', code], { windowsHide: true });
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

// Pause download
ipcMain.handle('pause-download', async (_event, { taskId } = {}) => {
  if (taskId && activeDownloadProcesses.has(taskId)) {
    const proc = activeDownloadProcesses.get(taskId);
    if (proc && !proc.killed) {
      const success = await suspendProcess(proc.pid);
      return { success };
    }
  }
  return { success: false, error: 'No active download process with specified Task ID found' };
});

// Resume download
ipcMain.handle('resume-download', async (_event, { taskId } = {}) => {
  if (taskId && activeDownloadProcesses.has(taskId)) {
    const proc = activeDownloadProcesses.get(taskId);
    if (proc && !proc.killed) {
      const success = await resumeProcess(proc.pid);
      return { success };
    }
  }
  return { success: false, error: 'No active download process with specified Task ID found' };
});

// Cancel version details
ipcMain.handle('cancel-version-details', () => {
  for (const proc of activeReadOnlyProcesses) {
    try {
      proc.kill();
    } catch (_) {}
  }
  activeReadOnlyProcesses = [];
  return { success: true };
});

// Clean up interrupted or temporary download files
ipcMain.handle('clean-temp-files', async () => {
  try {
    let deletedCount = 0;
    
    // 1. Get output directory from settings
    const settings = loadSettings();
    const outputDir = settings.outputDir || app.getPath('downloads');
    
    // 2. Scan output directory for any *.ipa.tmp files
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.ipa.tmp')) {
          const filePath = path.join(outputDir, file);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (e) {
            console.error(`Failed to delete temp file ${filePath}:`, e.message);
          }
        }
      }
    }
    
    // 3. Scan system temp directory for ipatool temp directories/files
    const sysTempDir = os.tmpdir();
    if (fs.existsSync(sysTempDir)) {
      const tempEntries = fs.readdirSync(sysTempDir);
      for (const entry of tempEntries) {
        const lowerEntry = entry.toLowerCase();
        if (lowerEntry.startsWith('ipatool-isolated-') || lowerEntry.startsWith('ipatool-') || lowerEntry.endsWith('.ipa.tmp')) {
          const fullPath = path.join(sysTempDir, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              fs.rmSync(fullPath, { recursive: true, force: true });
              deletedCount++;
            } else if (stat.isFile()) {
              fs.unlinkSync(fullPath);
              deletedCount++;
            }
          } catch (e) {
            console.error(`Failed to delete sys temp entry ${fullPath}:`, e.message);
          }
        }
      }
    }
    
    return { success: true, deletedCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
});



// Fetch latest ipatool version tag from GitHub
ipcMain.handle('fetch-ipatool-version', () => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/majd/ipatool/releases/latest',
      headers: { 'User-Agent': 'ipatool-gui' },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ success: true, tag: json.tag_name || 'unknown' });
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse GitHub response' });
        }
      });
    }).on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
});

// Check GUI Updates from mehmetakifsimsek/ipatool-gui repository
ipcMain.handle('check-gui-update', () => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/mehmetakifsimsek/ipatool-gui/releases/latest',
      headers: { 'User-Agent': 'ipatool-gui' },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const latestVersion = json.tag_name ? json.tag_name.replace('v', '') : '1.0.0';
          const localVersion = app.getVersion() || '1.0.0';
          
          const latestParts = latestVersion.split('.').map(Number);
          const localParts = localVersion.split('.').map(Number);
          
          let downloadUrl = '';
          if (json.assets && Array.isArray(json.assets)) {
            const setupAsset = json.assets.find(asset => 
              asset.name.toLowerCase().includes('setup') && asset.name.toLowerCase().endsWith('.exe')
            );
            if (setupAsset) {
              downloadUrl = setupAsset.browser_download_url;
            }
          }

          let hasUpdate = false;
          for (let i = 0; i < Math.max(latestParts.length, localParts.length); i++) {
            const latestPart = latestParts[i] || 0;
            const localPart = localParts[i] || 0;
            if (latestPart > localPart) {
              hasUpdate = true;
              break;
            } else if (latestPart < localPart) {
              break;
            }
          }
          
          resolve({
            success: true,
            hasUpdate,
            latestVersion: json.tag_name || 'unknown',
            localVersion: 'v' + localVersion,
            releaseUrl: json.html_url || 'https://github.com/mehmetakifsimsek/ipatool-gui/releases',
            downloadUrl: downloadUrl
          });
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse update info' });
        }
      });
    }).on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
});

let activeGuiUpdateDownload = null;

function downloadGuiUpdate(url) {
  return new Promise((resolve) => {
    const tempDir = app.getPath('temp');
    const installerPath = path.join(tempDir, 'ipatool-gui-update-setup.exe');

    const sendProgress = (percentage) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gui-update-progress', percentage);
      }
    };

    httpsGetFollowRedirects(url, (err, res) => {
      if (err) {
        resolve({ success: false, error: err.message });
        return;
      }

      if (res.statusCode !== 200) {
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(installerPath);

      activeGuiUpdateDownload = fileStream;

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const progress = Math.floor((downloadedBytes / totalBytes) * 100);
          sendProgress(progress);
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          activeGuiUpdateDownload = null;

          // Launch the installer silently in the background
          try {
            const { spawn } = require('child_process');
            const child = spawn(installerPath, ['/S'], {
              detached: true,
              stdio: 'ignore',
              windowsHide: false
            });
            child.unref();
            
            // Exit Electron app immediately so the installer can overwrite the locked files
            setTimeout(() => {
              app.exit(0);
            }, 500);

            resolve({ success: true });
          } catch (spawnErr) {
            resolve({ success: false, error: `Failed to launch installer: ${spawnErr.message}` });
          }
        });
      });

      fileStream.on('error', (writeErr) => {
        activeGuiUpdateDownload = null;
        resolve({ success: false, error: writeErr.message });
      });
    });
  });
}

ipcMain.handle('download-gui-update', async (_event, { url }) => {
  try {
    return await downloadGuiUpdate(url);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Fetch GitHub avatar image as base64 for embedding
ipcMain.handle('fetch-github-avatar', (_event, { username }) => {
  return new Promise((resolve) => {
    const avatarUrl = `https://github.com/${username}.png?size=80`;
    httpsGetFollowRedirects(avatarUrl, (err, res) => {
      if (err) {
        resolve({ success: false, error: err.message });
        return;
      }
      if (res.statusCode !== 200) {
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const contentType = res.headers['content-type'] || 'image/png';
        resolve({ success: true, dataUrl: `data:${contentType};base64,${base64}` });
      });
      res.on('error', (e) => {
        resolve({ success: false, error: e.message });
      });
    });
  });
});

// Open external URL
ipcMain.handle('open-external', (_event, { url }) => {
  shell.openExternal(url);
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
