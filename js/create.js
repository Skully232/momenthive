/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// js/create.js
import { isFirebaseConfigured, localFirestoreEmulator, firebaseConfig } from './firebase-config.js';
import { uploadFileWithProgress } from './cloudinary-config.js';

let db = localFirestoreEmulator;
let logoDataUrl = null;

// Initialize Firebase dynamically if configured
async function initFirebase() {
  if (isFirebaseConfigured()) {
    try {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
      const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      console.log("Firebase Firestore successfully initialized.");
    } catch (err) {
      console.error("Firebase SDK load failed, falling back to local sandbox:", err);
    }
  } else {
    console.log("Using Local Firestore Sandbox Mode.");
  }
}

// Generate unique Event ID (format: EVT-YYYYMMDD-XXXX)
function generateEventId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randStr = '';
  for (let i = 0; i < 4; i++) {
    randStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `EVT-${dateStr}-${randStr}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  await initFirebase();

  // Dynamic Hex text updating
  const colorPicker = document.getElementById('album-color');
  const colorHexLabel = document.getElementById('color-hex-label');
  colorPicker.addEventListener('input', (e) => {
    colorHexLabel.textContent = e.target.value.toUpperCase();
  });

  // Logo upload dropzone handling
  const dropzone = document.getElementById('logo-dropzone');
  const fileInput = document.getElementById('logo-file-input');
  const previewContainer = document.getElementById('logo-preview-container');
  const previewImg = document.getElementById('logo-preview-img');
  const removeLogoBtn = document.getElementById('remove-logo-btn');

  dropzone.addEventListener('click', (e) => {
    if (e.target !== removeLogoBtn && !removeLogoBtn.contains(e.target)) {
      fileInput.click();
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleLogoFile(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleLogoFile(e.target.files[0]);
    }
  });

  removeLogoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    logoDataUrl = null;
    fileInput.value = '';
    previewContainer.style.display = 'none';
    previewImg.src = '';
  });

  function handleLogoFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG/JPG).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo size must be less than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      logoDataUrl = e.target.result;
      previewImg.src = e.target.result;
      previewContainer.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }

  // Handle Event Creation Form Submission
  const form = document.getElementById('create-event-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Set loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

    const eventName = document.getElementById('event-name').value.trim();
    const eventType = document.getElementById('event-type').value;
    const eventDate = document.getElementById('event-date').value;
    const organizerName = document.getElementById('organizer-name').value.trim();
    const organizerPhone = document.getElementById('organizer-phone').value.trim();
    const organizerEmail = document.getElementById('organizer-email').value.trim();
    const eventPassword = document.getElementById('event-password').value || null;
    const maxPhotos = parseInt(document.getElementById('max-photos').value, 10) || 500;
    const allowVideo = document.getElementById('allow-video').checked;
    const primaryColor = colorPicker.value;

    const eventId = generateEventId();
    let finalLogoUrl = null;

    try {
      // 1. Upload Logo to Cloudinary or use FileReader sandbox cache
      const logoFile = fileInput.files[0];
      if (logoFile) {
        try {
          const res = await uploadFileWithProgress(logoFile, (pct) => {
            btnText.textContent = `Uploading logo (${pct}%)...`;
            btnText.style.display = 'inline-block';
          });
          finalLogoUrl = res.url;
        } catch (uploadErr) {
          console.warn("Logo upload failed or simulated:", uploadErr);
          finalLogoUrl = logoDataUrl; // Base64 fallback
        }
      }

      // 2. Prepare event document
      const eventData = {
        id: eventId,
        name: eventName,
        type: eventType,
        date: eventDate,
        organizerName: organizerName,
        organizerPhone: organizerPhone,
        organizerEmail: organizerEmail,
        password: eventPassword,
        maxPhotos: maxPhotos,
        allowVideo: allowVideo,
        logoUrl: finalLogoUrl,
        primaryColor: primaryColor,
        createdAt: new Date().toISOString(),
        status: "active",
        photoCount: 0,
        guestCount: 0,
        guestPhones: []
      };

      // 3. Save to Firestore (Real or Emulated)
      if (isFirebaseConfigured()) {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const docRef = doc(db, "events", eventId);
        await setDoc(docRef, eventData);
      } else {
        await db.setDoc({ id: eventId }, eventData);
      }

      // 4. Generate dynamic host URLs for scanning/visiting
      const origin = window.location.origin;
      const albumUrl = `${origin}/album.html?id=${eventId}`;
      const dashboardUrl = `${origin}/dashboard.html?id=${eventId}`;

      // 5. Render success screen and populate data
      document.getElementById('form-section').style.display = 'none';
      const successSection = document.getElementById('success-section');
      successSection.style.display = 'block';

      document.getElementById('success-event-id').textContent = eventId;
      document.getElementById('success-album-url').textContent = albumUrl;
      
      const pin = organizerPhone.slice(-4);
      document.getElementById('success-dashboard-pin').textContent = pin;

      document.getElementById('go-to-album-btn').href = albumUrl;
      document.getElementById('go-to-dashboard-btn').href = dashboardUrl;

      // 6. Generate QR Code
      const qrContainer = document.getElementById('qrcode-canvas');
      qrContainer.innerHTML = ''; // Clear container
      
      new QRCode(qrContainer, {
        text: albumUrl,
        width: 200,
        height: 200,
        colorDark: "#0A0A0A",
        colorLight: "#FFFFFF",
        correctLevel: QRCode.CorrectLevel.H
      });

      // 7. Setup QR code download
      document.getElementById('download-qr-btn').addEventListener('click', () => {
        const qrImg = qrContainer.querySelector('img');
        const qrCanvas = qrContainer.querySelector('canvas');
        if (qrImg) {
          const link = document.createElement('a');
          link.download = `${eventId}-QR.png`;
          link.href = qrImg.src;
          link.click();
        } else if (qrCanvas) {
          const link = document.createElement('a');
          link.download = `${eventId}-QR.png`;
          link.href = qrCanvas.toDataURL('image/png');
          link.click();
        }
      });

      // 8. Copy Album Link button click handler
      const copyBtn = document.getElementById('copy-album-link-btn');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(albumUrl);
          copyBtn.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i> Copied!';
          if (window.lucide) window.lucide.createIcons();
          setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy" style="width: 16px; height: 16px;"></i> Copy';
            if (window.lucide) window.lucide.createIcons();
          }, 2000);
        } catch (err) {
          alert('Could not copy link to clipboard automatically: ' + albumUrl);
        }
      });

      // 9. Configure WhatsApp Sharing
      // Pre-filled broadcast message: "📸 Share your memories from [Event Name]! Scan the QR or tap this link: [URL]"
      const whatsappMsg = encodeURIComponent(
        `📸 Share your memories from ${eventName}! Upload your beautiful photos to our shared album directly. Tap this link: ${albumUrl}`
      );
      document.getElementById('whatsapp-share-btn').href = `https://api.whatsapp.com/send?text=${whatsappMsg}`;

      // 10. Simulated EmailJS notification trigger
      console.log(`Sending simulated EmailJS receipt to ${organizerEmail} with access code PIN: ${pin}`);
      
    } catch (err) {
      console.error("Event creation error:", err);
      alert("Error building event album. Please check inputs and try again.");
    } finally {
      // Revert loading state
      submitBtn.disabled = false;
      btnText.style.display = 'inline-block';
      btnText.textContent = 'Create Album & Generate QR';
      btnSpinner.style.display = 'none';
      if (window.lucide) window.lucide.createIcons();
    }
  });
});
