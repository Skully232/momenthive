# MomentHive — India's Guest Photo Album Platform

MomentHive is India's first event guest photo sharing platform. Built specifically for the Indian market, it features a WhatsApp-first design, INR (₹) pricing, zero friction (no mobile app download required), real-time photo synchronization, and a beautiful, high-performance dark theme.

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
   - Real-time stream updates using Firestore `onSnapshot`.
   - Lightweight masonry grid layout (CSS columns) with lazy-loaded image optimization.
   - Fullscreen interactive media lightbox supporting left/right swipe and arrow key navigation.
   - Instant liking (localStorage prevents duplicate likes), high-resolution downloads, and reporting.
3. **Organizer Dashboard (`/dashboard.html?id=...`):**
   - Secured by a 4-digit PIN (last 4 digits of the organizer's mobile number).
   - Rich real-time analytical stats cards: Total Photos, Total Videos, Total Guests, Most Active Guest, and Most Liked Photo.
   - Quick search moderation: Toggle between all files or reported (flagged) files only.
   - Admin-level actions: close/reopen guest uploads, copy guest links, delete individual photos.
   - One-click "Download All as ZIP" (client-side compression using JSZip and FileSaver).
   - Live guest registry table showing names, mobile numbers, photo contribution counts, and join times.
   - Instant guest list export as a formatted CSV file.
   - Sponsor customizer: dynamic upload/text form to inject sponsor watermarks instantly.
4. **Landing Page (`/index.html`):**
   - Elegant, high-conversion marketing page with product showcase, descriptive "How It Works" blocks, feature grid, and transparent ₹ pricing tables.

---

## 🛠️ Configuration & Setup Steps

### 1. Firebase Firestore Setup
To connect your live Firestore database to the production build:
1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add Project**.
2. Create a Web App inside your new project and copy the `firebaseConfig` credentials object.
3. Open the file `js/firebase-config.js` and replace the placeholder keys with your production details:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```
4. In the Firebase Sidebar, navigate to **Firestore Database** and click **Create Database**.
5. Set security rules for Firestore. Below are the recommended secure rules:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /events/{eventId} {
         allow read, write: if true;
         
         match /photos/{photoId} {
           allow read, write: if true;
         }
         match /guests/{phone} {
           allow read, write: if true;
         }
       }
     }
   }
   ```

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

---

## 📦 Deployment to GitHub Pages
To deploy your static site on GitHub Pages:
1. Initialize a Git repository in the project folder:
   ```bash
   git init
   git add .
   git commit -m "feat: init MomentHive Phase 1 MVP"
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
