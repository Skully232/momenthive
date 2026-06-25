# MomentHive — India's Guest Photo Album Platform

MomentHive is India's first event guest photo sharing platform. Built specifically for the Indian market, it features a WhatsApp-first design, INR (₹) pricing, zero friction (no mobile app download required), real-time photo synchronization powered by **Supabase Realtime**, and a beautiful, high-performance dark theme.

This repository contains the complete, standalone Phase 1 MVP designed for high-performance static deployment (e.g., GitHub Pages).

---

## 🚀 Features Built in Phase 1 MVP
1. **Organizer - Create Event (`/create.html`):**
   - Clean, validated input form for event details, branding, contact info, and customization.
   - Generates a unique Event ID (format: `EVT-YYYYMMDD-XXXX`).
   - Supports uploading an optional branding logo.
   - Dynamically renders a downloadable High-Quality QR Code pointing to the guest album.
   - Pre-fills WhatsApp broadcast templates to easily invite guest lists.
2. **Guest - View & Upload Album (`/album.html?id=...`):**
   - High-contrast responsive dark theme styled precisely according to brand rules.
   - Optional password lock access prompt to secure personal events.
   - Dynamic custom brand style overrides based on the event's primary color choice.
   - Zero-friction multi-file select and upload for images and videos with live progress bars.
   - Real-time stream updates using Supabase Realtime (`postgres_changes`).
   - Lightweight masonry grid layout (CSS columns) with lazy-loaded image optimization.
   - Fullscreen interactive media lightbox supporting left/right swipe and arrow key navigation.
   - Instant liking (localStorage prevents duplicate likes), high-resolution downloads, and reporting.
3. **Organizer Dashboard (`/dashboard.html?id=...`):**
   - Secured by a 4-digit PIN (last 4 digits of the organizer's mobile number).
   - Rich real-time analytical stats cards: Total Photos, Total Videos, Total Guests, Most Active Guest.
   - Quick search moderation: Toggle between all files or reported (flagged) files only.
   - Admin-level actions: close/reopen guest uploads, copy guest links, soft-delete individual photos.
   - One-click "Download All as ZIP" (client-side compression using JSZip and FileSaver).
   - Live guest registry table showing names, mobile numbers, photo contribution counts, and join times.
   - Instant guest list export as a formatted CSV file.
   - Sponsor customizer: dynamic upload/text form to inject sponsor watermarks instantly.
4. **Landing Page (`/index.html`):**
   - Elegant, high-conversion marketing page with product showcase, descriptive "How It Works" blocks, feature grid, and transparent ₹ pricing tables.

---

## 🛠️ Configuration & Setup Steps

### 1. Supabase Database Setup

The app uses Supabase (Postgres) as its backend. The project is already pre-configured with the MomentHive Supabase project credentials in `js/supabase-config.js`.

**To recreate the database schema in your own Supabase project:**

1. Go to [app.supabase.com](https://app.supabase.com/) and open your project.
2. Navigate to **SQL Editor** in the sidebar.
3. Open the file `supabase-schema.sql` from this repository and paste its entire contents into the editor.
4. Click **Run** to create all tables and RLS policies.

> ⚠️ **Security Note:** The RLS policies in `supabase-schema.sql` are intentionally wide-open for MVP testing (public read/write). Before onboarding paying partner events, tighten these policies with proper authentication-based access control.

**To update the project credentials** (if you're using your own Supabase project):

Open `js/supabase-config.js` and replace the values:
```javascript
const SUPABASE_URL = "https://your-project-ref.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-public-key";
```
You can find these in your Supabase project under **Settings → API**.

### 2. Cloudinary Upload Setup
To handle image/video uploads under free tier (25GB limit):
1. Sign up/Log in to [Cloudinary](https://cloudinary.com/).
2. On your Cloudinary Dashboard, copy your **Cloud Name**.
3. Go to **Settings** > **Upload** tab. Scroll down to **Upload Presets** and click **Add Upload Preset**.
4. Set the name of your preset, change the **Signing Mode** from Signed to **Unsigned**, and save.
5. Open the file `js/cloudinary-config.js` and replace the placeholders:
   ```javascript
   const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUDINARY_CLOUD_NAME";
   const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET";
   ```

> **Note:** If Cloudinary is not configured, uploaded photos will display as base64 Data URLs (works for demo/testing, not suitable for production — images will be large and won't persist across devices).

---

## 📦 Deployment to GitHub Pages
To deploy your static site on GitHub Pages:
1. Initialize a Git repository in the project folder:
   ```bash
   git init
   git add .
   git commit -m "[PHASE-1] feature: init MomentHive with Supabase backend"
   ```
2. Create an empty repository named `momenthive` on your GitHub account (`Skully232`).
3. Add the remote and push the branch:
   ```bash
   git remote add origin https://github.com/Skully232/momenthive.git
   git branch -M main
   git push -u origin main
   ```
4. Go to your GitHub repository **Settings** > **Pages**.
5. Under **Build and deployment**, select **Deploy from a branch** and choose the `main` branch, then click **Save**.
6. Within a few minutes, your platform will be live at `https://skully232.github.io/momenthive/`!

> **Important for GitHub Pages:** All asset paths in the HTML use absolute paths starting with `/`. On GitHub Pages at a sub-path like `/momenthive/`, these paths will 404. You'll need to either (a) serve from the root of a custom domain, or (b) update all `/css/`, `/js/` paths to relative paths (`css/`, `js/`) before deploying.

---

## 🏗️ Tech Stack
- **Frontend:** Vanilla HTML + CSS + JavaScript (no framework, no build step)
- **Database:** Supabase (Postgres) — REST API + Realtime via `@supabase/supabase-js@2` CDN
- **Media Storage:** Cloudinary (free tier) — unsigned upload preset
- **Hosting:** GitHub Pages (static site)
- **Icons:** Lucide Icons (CDN)
- **QR Codes:** QRCode.js (CDN)
- **ZIP Downloads:** JSZip + FileSaver.js (CDN)
