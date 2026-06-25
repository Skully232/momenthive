/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// js/album.js
import { isFirebaseConfigured, localFirestoreEmulator, firebaseConfig } from './firebase-config.js';
import { uploadFileWithProgress } from './cloudinary-config.js';

let db = localFirestoreEmulator;
let eventId = null;
let eventData = null;
let allPhotos = [];
let currentLightboxIdx = -1;
let loadedPhotosCount = 20;

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
  }
}

// Retrieve guest credentials from localStorage
function getCachedGuest() {
  const name = localStorage.getItem('momenthive_guest_name');
  const phone = localStorage.getItem('momenthive_guest_phone');
  if (name && phone) {
    return { name, phone };
  }
  return null;
}

// Save guest credentials to localStorage
function cacheGuest(name, phone) {
  localStorage.setItem('momenthive_guest_name', name);
  localStorage.setItem('momenthive_guest_phone', phone);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();

  await initFirebase();

  // Parse eventId from URL query parameters
  const params = new URLSearchParams(window.location.search);
  eventId = params.get('id');

  if (!eventId) {
    alert("No Event ID provided in the URL! Returning to landing page.");
    window.location.href = "index.html";
    return;
  }

  // 1. Fetch Event and Bind real-time snapshot
  try {
    if (isFirebaseConfigured()) {
      const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const docRef = doc(db, "events", eventId);
      
      onSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) {
          alert("This event does not exist or has been deleted.");
          window.location.href = "index.html";
          return;
        }
        handleEventLoaded(docSnap.data());
      }, (err) => {
        console.error("Firestore listen error:", err);
        alert("Failed to listen to live event updates.");
      });

      // Fetch live photos list
      const { collection, query, orderBy } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const photosRef = collection(db, "events", eventId, "photos");
      const photosQuery = query(photosRef, orderBy("uploadedAt", "desc"));
      
      onSnapshot(photosQuery, (querySnap) => {
        const photos = [];
        querySnap.forEach(doc => {
          photos.push({ id: doc.id, ...doc.data() });
        });
        handlePhotosLoaded(photos);
      });

    } else {
      // Sandbox fallback
      const docRef = { id: eventId };
      db.onSnapshot(docRef, (docSnap) => {
        if (!docSnap.exists()) {
          alert("Event does not exist in Sandbox. Please create one on create.html!");
          window.location.href = "create.html";
          return;
        }
        handleEventLoaded(docSnap.data());
      });

      // Sandbox photos
      const photosRef = { path: `events/${eventId}/photos` };
      db.onCollectionSnapshot(photosRef, (querySnap) => {
        const photos = [];
        querySnap.docs.forEach(doc => {
          photos.push({ id: doc.id, ...doc.data() });
        });
        // Sort sandbox photos by upload time descending
        photos.sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        handlePhotosLoaded(photos);
      });
    }
  } catch (err) {
    console.error("Failed to fetch event data:", err);
    document.getElementById('loader-view').innerHTML = `
      <p style="color: var(--error-red); font-weight: 600;">Connection failed.</p>
      <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Error details: ${err.message}</p>
    `;
  }

  // 2. Handle Unlock submission (Private albums)
  document.getElementById('unlock-btn').addEventListener('click', () => {
    const entered = document.getElementById('album-lock-password').value;
    if (entered && entered === eventData.password) {
      sessionStorage.setItem(`momenthive_unlocked_${eventId}`, 'true');
      document.getElementById('lock-view').style.display = 'none';
      document.getElementById('gallery-view').style.display = 'block';
      document.getElementById('floating-upload-bar').style.display = 'flex';
      renderGallery();
    } else {
      alert("Incorrect password! Please contact the event organizer.");
    }
  });

  // 3. Floating and Slate Upload Triggers
  const uploadTriggers = document.querySelectorAll('.start-upload-btn-trigger');
  const fileInput = document.getElementById('guest-photos-file-input');

  uploadTriggers.forEach(btn => {
    btn.addEventListener('click', () => {
      // Check if guest is signed up
      const guest = getCachedGuest();
      if (!guest) {
        // Open guest registration modal
        document.getElementById('guest-registration-modal').classList.add('active');
      } else {
        // Direct file picker trigger
        fileInput.click();
      }
    });
  });

  // Close Registration Modal
  document.getElementById('close-reg-modal-btn').addEventListener('click', () => {
    document.getElementById('guest-registration-modal').classList.remove('active');
  });

  // Handle Guest Registration Submission
  document.getElementById('guest-reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('guest-name-input').value.trim();
    const phone = document.getElementById('guest-phone-input').value.trim();

    if (!name || !phone || phone.length !== 10) {
      alert("Please enter a valid name and a 10-digit phone number.");
      return;
    }

    // Save to local cache
    cacheGuest(name, phone);

    // Save Guest Record to Firestore under events/{eventId}/guests/{phone}
    try {
      if (isFirebaseConfigured()) {
        const { doc, setDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const guestDocRef = doc(db, "events", eventId, "guests", phone);
        await setDoc(guestDocRef, {
          name,
          phone,
          joinedAt: new Date().toISOString(),
          photoCount: 0
        });

        // Increment guestCount on parent event
        const eventRef = doc(db, "events", eventId);
        await setDoc(eventRef, { guestCount: increment(1), guestPhones: [phone] }, { merge: true });
      } else {
        // Local simulation
        const events = db.getEvents();
        if (events[eventId]) {
          events[eventId].guestCount = (events[eventId].guestCount || 0) + 1;
          if (!events[eventId].guestPhones) events[eventId].guestPhones = [];
          if (!events[eventId].guestPhones.includes(phone)) {
            events[eventId].guestPhones.push(phone);
          }
          db.saveEvents(events);
        }
      }
    } catch (err) {
      console.warn("Guest counter increment failed or was simulated:", err);
    }

    // Close modal and open file picker
    document.getElementById('guest-registration-modal').classList.remove('active');
    fileInput.click();
  });

  // 4. File select handler (multi-file uploads)
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Check if video is enabled
    if (!eventData.allowVideo && files.some(f => f.type.startsWith('video/'))) {
      alert("Video uploads are disabled for this album. Please choose photos only.");
      return;
    }

    // Open upload queue modal
    const queueModal = document.getElementById('upload-queue-modal');
    queueModal.classList.add('active');

    const progressList = document.getElementById('upload-progress-list');
    progressList.innerHTML = ''; // Reset list

    const closeQueueBtn = document.getElementById('close-upload-queue-btn');
    closeQueueBtn.style.display = 'none';

    const guest = getCachedGuest();

    // Iterate and upload files sequentially or concurrently
    const uploadPromises = files.map((file, idx) => {
      // Create progress row
      const progressRow = document.createElement('div');
      progressRow.className = 'card';
      progressRow.style.padding = '12px';
      progressRow.style.background = 'var(--bg-surface-dark)';
      progressRow.innerHTML = `
        <div class="flex justify-between items-center mb-1">
          <span style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${file.name}</span>
          <span id="pct-label-${idx}" class="code-font text-gradient" style="font-size: 12px; font-weight: 700;">0%</span>
        </div>
        <div class="progress-bar-container">
          <div id="pct-bar-${idx}" class="progress-bar-fill" style="width: 0%;"></div>
        </div>
      `;
      progressList.appendChild(progressRow);

      const isVideo = file.type.startsWith('video/');

      return uploadFileWithProgress(file, (percent) => {
        const label = document.getElementById(`pct-label-${idx}`);
        const bar = document.getElementById(`pct-bar-${idx}`);
        if (label && bar) {
          label.textContent = `${percent}%`;
          bar.style.width = `${percent}%`;
        }
      }).then(async (uploadedRes) => {
        // Success upload callback - Save record to Firestore
        const photoRecord = {
          url: uploadedRes.url,
          thumbnailUrl: uploadedRes.thumbnailUrl,
          guestName: guest.name,
          guestPhone: guest.phone,
          uploadedAt: new Date().toISOString(),
          fileType: isVideo ? "video" : "image",
          fileSize: file.size,
          likes: 0,
          downloads: 0,
          flagged: false
        };

        if (isFirebaseConfigured()) {
          const { collection, addDoc, doc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
          await addDoc(collection(db, "events", eventId, "photos"), photoRecord);
          
          // Increment event photoCount
          await updateDoc(doc(db, "events", eventId), {
            photoCount: increment(1)
          });
        } else {
          await db.addDoc({ path: `events/${eventId}/photos` }, photoRecord);
        }

        const label = document.getElementById(`pct-label-${idx}`);
        if (label) {
          label.innerHTML = '<i data-lucide="check-circle-2" style="color: var(--success-green); width: 16px; height: 16px; display: inline-block; vertical-align: middle;"></i>';
          if (window.lucide) window.lucide.createIcons();
        }
      }).catch((err) => {
        console.error("Upload error for file " + file.name, err);
        const label = document.getElementById(`pct-label-${idx}`);
        if (label) {
          label.innerHTML = '<i data-lucide="alert-circle" style="color: var(--error-red); width: 16px; height: 16px; display: inline-block; vertical-align: middle;"></i>';
          if (window.lucide) window.lucide.createIcons();
        }
      });
    });

    await Promise.all(uploadPromises);

    // Reset file input
    fileInput.value = '';
    closeQueueBtn.style.display = 'inline-block';
  });

  // Close Upload Queue Modal
  document.getElementById('close-upload-queue-btn').addEventListener('click', () => {
    document.getElementById('upload-queue-modal').classList.remove('active');
  });

  // 5. Lightbox Interactions & Controls
  document.getElementById('lightbox-close-btn').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev-btn').addEventListener('click', prevLightbox);
  document.getElementById('lightbox-next-btn').addEventListener('click', nextLightbox);

  // Keypress event handler (Esc to close, Arrows to navigate)
  document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox');
    if (lightbox.classList.contains('active')) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevLightbox();
      if (e.key === 'ArrowRight') nextLightbox();
    }
  });

  // Lightbox Flag/Report Button click
  document.getElementById('lightbox-report-btn').addEventListener('click', async () => {
    const photo = allPhotos[currentLightboxIdx];
    if (!photo) return;

    if (confirm("Would you like to report this photo as inappropriate? The organizer will be notified.")) {
      try {
        if (isFirebaseConfigured()) {
          const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
          const photoDocRef = doc(db, "events", eventId, "photos", photo.id);
          await updateDoc(photoDocRef, { flagged: true });
        } else {
          // Emulated flagging
          const photos = JSON.parse(localStorage.getItem(`momenthive_photos_${eventId}`) || '[]');
          const idx = photos.findIndex(p => p.id === photo.id);
          if (idx !== -1) {
            photos[idx].flagged = true;
            localStorage.setItem(`momenthive_photos_${eventId}`, JSON.stringify(photos));
          }
        }
        alert("Photo reported successfully.");
        closeLightbox();
      } catch (err) {
        console.error(err);
      }
    }
  });

  // Lightbox Like Button click (includes localStorage duplicate block)
  document.getElementById('lightbox-like-btn').addEventListener('click', async () => {
    const photo = allPhotos[currentLightboxIdx];
    if (!photo) return;

    const likedPhotosKey = `momenthive_liked_${eventId}`;
    const likedPhotos = JSON.parse(localStorage.getItem(likedPhotosKey) || '[]');

    if (likedPhotos.includes(photo.id)) {
      alert("You have already liked this photo!");
      return;
    }

    likedPhotos.push(photo.id);
    localStorage.setItem(likedPhotosKey, JSON.stringify(likedPhotos));

    // UI Feedback immediately
    const likeBtn = document.getElementById('lightbox-like-btn');
    likeBtn.classList.add('liked');
    const heartIcon = likeBtn.querySelector('i');
    if (heartIcon) heartIcon.setAttribute('data-lucide', 'heart-handshake');
    
    const countEl = document.getElementById('lightbox-likes-count');
    const newLikes = (photo.likes || 0) + 1;
    countEl.textContent = newLikes;

    try {
      if (isFirebaseConfigured()) {
        const { doc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const photoDocRef = doc(db, "events", eventId, "photos", photo.id);
        await updateDoc(photoDocRef, { likes: increment(1) });
      } else {
        // Emulated liking
        const photos = JSON.parse(localStorage.getItem(`momenthive_photos_${eventId}`) || '[]');
        const idx = photos.findIndex(p => p.id === photo.id);
        if (idx !== -1) {
          photos[idx].likes = (photos[idx].likes || 0) + 1;
          localStorage.setItem(`momenthive_photos_${eventId}`, JSON.stringify(photos));
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Lightbox Download Button click
  document.getElementById('lightbox-download-btn').addEventListener('click', () => {
    const photo = allPhotos[currentLightboxIdx];
    if (!photo) return;

    const link = document.createElement('a');
    link.href = photo.url;
    link.download = `${eventId}_${photo.id}.${photo.fileType === 'video' ? 'mp4' : 'jpg'}`;
    link.target = "_blank";
    link.click();
    
    // Fire increment downloads count on firebase (optional)
  });

  // 6. Infinite Scroll setup with IntersectionObserver
  const scrollSentinel = document.getElementById('gallery-scroll-sentinel');
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && allPhotos.length > loadedPhotosCount) {
      loadedPhotosCount += 20;
      renderGallery();
    }
  }, { threshold: 1.0 });
  observer.observe(scrollSentinel);
});

// Callback when event schema is fetched
function handleEventLoaded(data) {
  eventData = data;
  document.getElementById('loader-view').style.display = 'none';

  // Apply Partner Color schemes inject styles beautifully
  if (eventData.primaryColor) {
    document.documentElement.style.setProperty('--hive-purple', eventData.primaryColor);
  }

  // Bind logo
  const logoHeaderImg = document.getElementById('header-event-logo');
  if (eventData.logoUrl) {
    logoHeaderImg.src = eventData.logoUrl;
    logoHeaderImg.style.display = 'block';
  } else {
    logoHeaderImg.style.display = 'none';
  }

  // Bind titles
  document.getElementById('header-event-name').textContent = eventData.name;
  
  // Format Date beautifully
  const dateObj = new Date(eventData.date);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('header-event-date').textContent = dateObj.toLocaleDateString('en-IN', options);

  // Check Password Lock conditions
  const isUnlocked = sessionStorage.getItem(`momenthive_unlocked_${eventId}`) === 'true';
  if (eventData.password && !isUnlocked) {
    document.getElementById('lock-view').style.display = 'block';
    document.getElementById('gallery-view').style.display = 'none';
    document.getElementById('floating-upload-bar').style.display = 'none';
  } else {
    document.getElementById('lock-view').style.display = 'none';
    document.getElementById('gallery-view').style.display = 'block';
    document.getElementById('floating-upload-bar').style.display = 'flex';
  }

  // Setup Sponsor Ads watermarking if active
  // Sponsors are saved inside the events collection directly for easy reading or simulated
  if (eventData.sponsorName && eventData.sponsorLogoUrl) {
    document.getElementById('sponsor-banner-name').textContent = eventData.sponsorName;
    document.getElementById('sponsor-banner-logo').src = eventData.sponsorLogoUrl;
    document.getElementById('sponsor-watermark-banner').style.display = 'flex';
  } else {
    document.getElementById('sponsor-watermark-banner').style.display = 'none';
  }
}

// Callback when photos array snapshot loads
function handlePhotosLoaded(photos) {
  // Filter out reported / flagged photos for guest view
  allPhotos = photos.filter(p => !p.flagged);

  // Update header count
  document.getElementById('header-photo-count-badge').textContent = `${allPhotos.length} Photos`;

  // Bind empty state vs gallery grid render
  if (allPhotos.length === 0) {
    document.getElementById('empty-gallery-slate').style.display = 'block';
    document.getElementById('gallery-masonry-grid').style.display = 'none';
  } else {
    document.getElementById('empty-gallery-slate').style.display = 'none';
    document.getElementById('gallery-masonry-grid').style.display = 'block';
    renderGallery();
  }
}

// Draw the masonry grid gallery items
function renderGallery() {
  const grid = document.getElementById('gallery-masonry-grid');
  grid.innerHTML = ''; // Reset

  const likedPhotosKey = `momenthive_liked_${eventId}`;
  const likedPhotos = JSON.parse(localStorage.getItem(likedPhotosKey) || '[]');

  // Slice list up to current page size
  const paginatedPhotos = allPhotos.slice(0, loadedPhotosCount);

  paginatedPhotos.forEach((photo, idx) => {
    const isLiked = likedPhotos.includes(photo.id);
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.setAttribute('tabindex', '0');
    
    // Prepare HTML content
    let mediaHTML = '';
    if (photo.fileType === 'video') {
      mediaHTML = `
        <video class="gallery-image" src="${photo.url}" preload="metadata" muted playsinline></video>
        <div class="gallery-video-indicator">
          <i data-lucide="play" style="width: 14px; height: 14px;"></i>
        </div>
      `;
    } else {
      // Lazy loading via loading="lazy" + Cloudinary w_400 optimized thumbnails
      mediaHTML = `
        <img class="gallery-image" src="${photo.thumbnailUrl || photo.url}" alt="Shared photo" loading="lazy" referrerPolicy="no-referrer" />
      `;
    }

    item.innerHTML = `
      ${mediaHTML}
      <div class="gallery-overlay">
        <span class="uploader-name">${photo.guestName}</span>
        <span class="upload-time">${formatRelativeTime(photo.uploadedAt)}</span>
        <div class="gallery-actions">
          <button class="gallery-action-btn like-btn-trigger ${isLiked ? 'liked' : ''}">
            <i data-lucide="${isLiked ? 'heart-handshake' : 'heart'}" style="width: 16px; height: 16px;"></i> 
            <span>${photo.likes || 0}</span>
          </button>
          <button class="gallery-action-btn download-btn-trigger" title="Download">
            <i data-lucide="download" style="width: 16px; height: 16px;"></i>
          </button>
        </div>
      </div>
    `;

    // Click trigger lightbox
    item.addEventListener('click', (e) => {
      // If clicking like or download, intercept
      const isLikeClick = e.target.closest('.like-btn-trigger');
      const isDownloadClick = e.target.closest('.download-btn-trigger');

      if (isLikeClick) {
        handleInlineLike(photo, idx, isLikeClick);
      } else if (isDownloadClick) {
        handleInlineDownload(photo);
      } else {
        openLightbox(idx);
      }
    });

    grid.appendChild(item);
  });

  if (window.lucide) window.lucide.createIcons();
}

// Inline liking inside hover panel
async function handleInlineLike(photo, index, btnEl) {
  const likedPhotosKey = `momenthive_liked_${eventId}`;
  const likedPhotos = JSON.parse(localStorage.getItem(likedPhotosKey) || '[]');

  if (likedPhotos.includes(photo.id)) return;

  likedPhotos.push(photo.id);
  localStorage.setItem(likedPhotosKey, JSON.stringify(likedPhotos));

  btnEl.classList.add('liked');
  const span = btnEl.querySelector('span');
  span.textContent = (photo.likes || 0) + 1;
  const heartIcon = btnEl.querySelector('i');
  if (heartIcon) heartIcon.setAttribute('data-lucide', 'heart-handshake');

  try {
    if (isFirebaseConfigured()) {
      const { doc, updateDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const photoDocRef = doc(db, "events", eventId, "photos", photo.id);
      await updateDoc(photoDocRef, { likes: increment(1) });
    } else {
      // Emulated
      const photos = JSON.parse(localStorage.getItem(`momenthive_photos_${eventId}`) || '[]');
      const idx = photos.findIndex(p => p.id === photo.id);
      if (idx !== -1) {
        photos[idx].likes = (photos[idx].likes || 0) + 1;
        localStorage.setItem(`momenthive_photos_${eventId}`, JSON.stringify(photos));
      }
    }
  } catch (err) {
    console.error(err);
  }
  if (window.lucide) window.lucide.createIcons();
}

// Inline downloading inside hover panel
function handleInlineDownload(photo) {
  const link = document.createElement('a');
  link.href = photo.url;
  link.download = `${eventId}_${photo.id}.${photo.fileType === 'video' ? 'mp4' : 'jpg'}`;
  link.target = "_blank";
  link.click();
}

// Open fullscreen lightbox
function openLightbox(index) {
  currentLightboxIdx = index;
  const photo = allPhotos[index];
  if (!photo) return;

  const lightbox = document.getElementById('lightbox');
  lightbox.classList.add('active');

  // Populate metadata
  document.getElementById('lightbox-uploader-name').textContent = photo.guestName;
  document.getElementById('lightbox-upload-time').textContent = formatRelativeTime(photo.uploadedAt);
  document.getElementById('lightbox-likes-count').textContent = photo.likes || 0;

  // Set like button state in lightbox
  const likedPhotosKey = `momenthive_liked_${eventId}`;
  const likedPhotos = JSON.parse(localStorage.getItem(likedPhotosKey) || '[]');
  const isLiked = likedPhotos.includes(photo.id);
  const likeBtn = document.getElementById('lightbox-like-btn');
  
  if (isLiked) {
    likeBtn.classList.add('liked');
    likeBtn.querySelector('i').setAttribute('data-lucide', 'heart-handshake');
  } else {
    likeBtn.classList.remove('liked');
    likeBtn.querySelector('i').setAttribute('data-lucide', 'heart');
  }

  // Populate media elements
  const imgEl = document.getElementById('lightbox-image-el');
  const videoEl = document.getElementById('lightbox-video-el');

  if (photo.fileType === 'video') {
    imgEl.style.display = 'none';
    videoEl.src = photo.url;
    videoEl.style.display = 'block';
    videoEl.play();
  } else {
    videoEl.style.display = 'none';
    videoEl.src = '';
    // Load full resolution URL in lightbox
    imgEl.src = photo.url;
    imgEl.style.display = 'block';
  }

  if (window.lucide) window.lucide.createIcons();
}

// Navigation and close lightbox
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
  const videoEl = document.getElementById('lightbox-video-el');
  videoEl.pause();
  videoEl.src = '';
}

function prevLightbox() {
  if (currentLightboxIdx > 0) {
    openLightbox(currentLightboxIdx - 1);
  } else {
    // Wrap around to end
    openLightbox(allPhotos.length - 1);
  }
}

function nextLightbox() {
  if (currentLightboxIdx < allPhotos.length - 1) {
    openLightbox(currentLightboxIdx + 1);
  } else {
    // Wrap around to start
    openLightbox(0);
  }
}

// Relative time formatting utility (e.g. "5 mins ago", "2 hours ago")
function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "Just now";

  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
