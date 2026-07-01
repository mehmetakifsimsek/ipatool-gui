# IPATool GUI

A premium, modern desktop interface wrapper for the [ipatool](https://github.com/majd/ipatool) CLI, built with Electron, HTML5, and Vanilla CSS. It provides an elegant, fast, and feature-rich way to search, analyze, and download iOS `.ipa` files directly from the App Store.

---

## 🚀 Key Features & Screenshots

### 🖥️ 1. Dashboard
An elegant overview panel showing the status of your environment.
* **System Diagnostics:** Automatically verifies if the required `ipatool` binary is configured and ready.
* **Session Monitor:** Displays active Apple ID session status and warns you if you need to log in.
* **Dual Update Module:** Automatically checks for updates for both the GUI Application and the IPATool CLI backend on startup, featuring a zero-click background updater.

<p align="center">
  <img width="900" height="504" alt="Image" src="https://github.com/user-attachments/assets/2b1a1557-afe5-4e61-b1c7-b99652675c91" />
</p>

---

### 🔐 2. Apple ID Authentication & 2FA
A secure gateway to authenticate with your App Store account.
* **2FA Support:** Fully supports Apple Two-Factor Authentication (2FA) verification codes.
* **Session Manager:** Easily log out or revoke active sessions with a single click.

<p align="center">
  <img width="900" height="504" alt="Image" src="https://github.com/user-attachments/assets/7941128f-cfbf-402b-8473-99938afb16fc" />
</p>

---

### 🔍 3. App Store Search
Search for any iOS application globally or within localized regional storefronts.
* **Detailed Metadata:** View high-resolution icons, app names, bundle IDs, current versions, and pricing.
* **Localized Search:** Search regional App Stores by changing the default country/region code in settings.
* **Region Fallback:** If the region setting is left blank, the search query automatically falls back to and uses the storefront/region of the logged-in Apple ID.
* **Storefront Match Constraint:** During the download phase, the App Store handshake uses the region of the logged-in Apple ID. If an app is not available in your Apple ID's home region storefront, the download will return a region mismatch error (e.g., `item is temporarily unavailable`).

<p align="center">
  <img width="900" height="504" alt="Image" src="https://github.com/user-attachments/assets/9e45395b-ac0e-45c3-aab4-307a618094b9" />
</p>

---

### 📋 4. Version History (Releases)
Drill down into any application's release history.
* **Historical Releases:** Displays all historical Release IDs (External Version IDs) in descending order (newest first).
* **Metadata Loader:** Sequentially fetches display versions and release dates. Features safety prompts when requesting details for lists larger than 15 items to avoid Apple API rate-limiting.

<p align="center">
  <img width="1920" height="1080" alt="Image" src="https://github.com/user-attachments/assets/37903c05-a819-4788-aad2-66e271e60271" />
</p>

---

### 📥 5. Advanced Download Queue
An interactive, high-performance multitasking download environment for package acquisition.
* **Seamless Queuing:** Add apps to the queue directly from search results without leaving the page.
* **FIFO Scheduler:** Manages task execution automatically based on your concurrency limits.
* **Bandwidth & CPU Controls:** Pause/Resume and Cancel buttons instantly suspend/resume active download processes at the OS level to freeze bandwidth and CPU usage.
* **Interactive Status:** Displays live progress percentages with dedicated log drawers for real-time terminal output.

<p align="center">
  <img width="1800" height="1008" alt="Image" src="https://github.com/user-attachments/assets/2dd59f41-d51c-4893-908f-6407bb883e2a" />
</p>

---

### ⚙️ 6. Settings & Workspace Isolation
Customize local application preferences and manage execution concurrency.
* **Concurrency Limits:** Select a limit of 1, 2, or 3 concurrent downloads running in parallel.
* **Workspace Isolation:** Every download is executed inside an isolated temporary directory, preventing file collisions.
* **Custom Save Directories:** Select your default folder where downloaded `.ipa` files are saved.

<p align="center">
  <img width="1920" height="1080" alt="Image" src="https://github.com/user-attachments/assets/6535415f-6d8e-4c54-8888-69429aa862b5" />
</p>

---

### 📜 7. Application Logs
Monitor and diagnose the application background operations.
* **Console Monitoring:** Review timestamps of all main and renderer process events.
* **Quick Clipboard Copy:** Instantly copy error logs to your clipboard for troubleshooting.

<p align="center">
  <img width="900" height="504" alt="Image" src="https://github.com/user-attachments/assets/904a7878-316f-42c9-a2d4-4dbb9da38011" />
</p>

---

### 🌙 8. Dark Mode
A premium, glassmorphic dark interface designed for low-light environments.
* **Sleek Aesthetics:** Retains the modern glassmorphic look, readable typography, and card panels with soft gradients.

<p align="center">
  <img width="1800" height="1008" alt="Image" src="https://github.com/user-attachments/assets/79ce0d46-65b0-407d-9e6e-e287810c2a94" />
</p>

---

## 💡 Important Usage Notes (Gotchas)

These are crucial App Store rules that will save you time and prevent failures:

1. **App Ownership & Auto-Purchase:**
   * **Free Apps:** If your Apple ID has never downloaded the app, the tool will automatically acquire/purchase a free license for you on-the-fly during the download process.
   * **Paid Apps:** Purchasing paid apps is not supported. You must have already purchased the paid app using your Apple ID on a real iOS device or iTunes before downloading it here.
2. **Storefront & Country Match:**
   * App downloads are tied to the region of your **Apple ID**, not your search settings.
   * **Rule:** If an app is exclusive to the US storefront and your Apple ID is registered in Germany, the download will fail. Make sure your Apple ID's home storefront country matches the app's availability.
3. **Apple Rate Limiting (HTTP 404/5xx Errors):**
   * If you send too many requests or trigger Apple's security limits, their edge servers will temporarily return an HTML error page.
   * **Rule:** The app detects this and will display a clean warning asking you to wait a moment before trying again, rather than failing with cryptic errors.

---

## 🛠️ Installation & Quick Start

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+) installed on your Windows machine *(only required for running from source; not needed if you install using the standalone setup installer)*.

### Quick Start
1. **Clone and Install:**
   ```bash
   git clone https://github.com/mehmetakifsimsek/ipatool-gui.git
   cd ipatool-gui
   npm install
   ```
2. **Run Dev Server:**
   ```bash
   npm start
   ```
3. **Build Standalone Installer:**
   ```bash
   npm run build
   ```
   *The installer package will be built under the `dist/` directory.*

---

## 🤝 Credits & License

* **CLI Backend:** Built by [Majd Alfhaily](https://github.com/majd)
* **GUI Frontend:** Built by [Mehmet Akif Şimşek](https://github.com/mehmetakifsimsek)
* Licensed under the MIT License.
