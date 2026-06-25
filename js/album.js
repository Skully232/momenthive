/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// js/album.js
// Guest album page — Supabase backend, no Firebase dependency.
import { supabaseClient } from './supabase-config.js';
import { uploadFileWithProgress } from './cloudinary-config.js';

let eventId = null;
let eventData = null;
let allPhotos = [];
let currentLightboxIdx = -1;
let loadedPhotosCount = 20;
let realtimeChannel = null;

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

  // Parse eventId from URL query parameters
  const params = new URLSearchParams(window.location.search);
  eventId = params.get('id');

  if (!eventId) {
    alert('No Event ID provided in the URL! Returning to landing page.');
    window.location.href = 'index.html';
    return;
  }

  // 1. Fetch event data from Supabase
  try {
    const { data: event, error } = await supabaseClient
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (error || !event) {
      console.error('Event fetch error:', error);
      document.getElementById('loader-view').innerHTML = `
        <p style="color: var(--error-red); font-weight: 600;">Event not found.</p>
        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Check the URL or return to the <a href="index.html">home page</a>.</p>
      `;
      return;
    }

    handleEventLoaded(event);

    // 2. Fetch photos initially
    await fetchAndRenderPhotos();

    // 3. Subscribe to realtime photo inserts
    subscribeToPhotos();

  } catch (err) {
    console.error('Failed to fetch event data:', err);
    document.getElementById('loader-view').innerHTML = `
      <p style="color: var(--error-red); font-weight: 600;">Connection failed.</p>
      <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Check your internet connection and try again. Error: ${err.message}</p>
    `;
  }

  // 4. Handle Unlock submission (private albums)
  document.getElementById('unlock-btn').addEventListener('click', () => {
    const entered = document.getElementById('album-lock-password').value;
    if (entered && entered === eventData.password) {
      sessionStorage.setItem(`momenthive_unlocked_${eventId}`, 'true');
      document.getElementById('lock-view').style.display = 'none';
      document.getElementById('gallery-view').style.display = 'block';
      document.getElementById('floating-upload-bar').style.display = 'flex';
      renderGallery();
    } else {
      alert('Incorrect password! Please contact the event organizer.');
    }
  });

  // 5. Floating and Slate Upload Triggers
  const uploadTriggers = document.querySelectorAll('.start-upload-btn-trigger');
  const fileInput = document.getElementById('guest-photos-file-input');

  uploadTriggers.forEach(btn => {
    btn.addEventListener('click', () => {
      const guest = getCachedGuest();
      if (!guest) {
        document.getElementById('guest-registration-modal').classList.add('active');
      } else {
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
      alert('Please enter a valid name and a 10-digit phone number.');
      return;
    }

    // Save to local cache
    cacheGuest(name, phone);

    // Upsert guest record to Supabase (unique constraint on event_id + phone handles duplicates)
    try {
      const { error: guestError } = await supabaseClient
        .from('guests')
        .upsert(
          { event_id: eventId, name, phone },
          { onConflict: 'event_id,phone', ignoreDuplicates: true }
        );

      if (guestError) {
        console.warn('Guest upsert failed:', guestError.message);
      }

      // Increment guest_count on the event row
      const { data: current } = await supabaseClient
        .from('events')
        .select('guest_count')
        .eq('id', eventId)
        .single();

      if (current) {
        await supabaseClient
          .from('events')
          .update({ guest_count: (current.guest_count || 0) + 1 })
          .eq('id', eventId);
      }
    } catch (err) {
      console.warn('Guest record save failed:', err.message);
    }

    // Close modal and open file picker
    document.getElementById('guest-registration-modal').classList.remove('active');
    fileInput.click();
  });

  // 6. File select handler (multi-file uploads)
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Check if video is enabled
    if (!eventData.allow_video && files.some(f => f.type.startsWith('video/'))) {
      alert('Video uploads are disabled for this album. Please choose photos only.');
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

    // Iterate and upload files concurrently
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
        // Save photo record to Supabase
        const photoRecord = {
          event_id:      eventId,
          url:           uploadedRes.url,
          thumbnail_url: uploadedRes.thumbnailUrl,
          guest_name:    guest ? guest.name : 'Anonymous',
          guest_phone:   guest ? guest.phone : '',
          file_type:     isVideo ? 'video' : 'image',
          file_size:     file.size,
          likes:         0,
          downloads:     0,
          flagged:       false,
          deleted:       false
        };

        const { error: insertErr } = await supabaseClient
          .from('photos')
          .insert(photoRecord);

        if (insertErr) {
          throw new Error(`Photo DB insert failed: ${insertErr.message}`);
        }

        // Increment photo_count on event
        const { data: current } = await supabaseClient
          .from('events')
          .select('photo_count')
          .eq('id', eventId)
          .single();

        if (current) {
          await supabaseClient
            .from('events')
            .update({ photo_count: (current.photo_count || 0) + 1 })
            .eq('id', eventId);
        }

        const label = document.getElementById(`pct-label-${idx}`);
        if (label) {
          label.innerHTML = '<i data-lucide="check-circle-2" style="color: var(--success-green); width: 16px; height: 16px; display: inline-block; vertical-align: middle;"></i>';
          if (window.lucide) window.lucide.createIcons();
        }
      }).catch((err) => {
        console.error('Upload error for file ' + file.name, err);
        const label = document.getElementById(`pct-label-${idx}`);
        if (label) {
          label.innerHTML = '<i data-lucide="alert-circle" style="color: var(--error-red); width: 16px; height: 16px; display: inline-block; vertical-align: middle;"></i>';
          if (window.lucide) window.lucide.createIcons();
        }
      });
    });

    await Promise.all(uploadPromises);

    // Reset file input and refresh photos
    fileInput.value = '';
    closeQueueBtn.style.display = 'inline-block';
    await fetchAndRenderPhotos();
  });

  // Close Upload Queue Modal
  document.getElementById('close-upload-queue-btn').addEventListener('click', () => {
    document.getElementById('upload-queue-modal').classList.remove('active');
  });

  // 7. Lightbox Interactions & Controls
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

    if (confirm('Would you like to report this photo as inappropriate? The organizer will be notified.')) {
      try {
        const { error } = await supabaseClient
          .from('photos')
          .update({ flagged: true })
          .eq('id', photo.id);

        if (error) throw error;
        alert('Photo reported successfully.');
        closeLightbox();
        await fetchAndRenderPhotos();
      } catch (err) {
        console.error('Flag error:', err);
        alert('Failed to report photo. Please try again.');
      }
    }
  });

  // Lightbox Like Button click (localStorage prevents duplicate likes per device)
  document.getElementById('lightbox-like-btn').addEventListener('click', async () => {
    const photo = allPhotos[currentLightboxIdx];
    if (!photo) return;

    const likedPhotosKey = `momenthive_liked_${eventId}`;
    const likedPhotos = JSON.parse(localStorage.getItem(likedPhotosKey) || '[]');

    if (likedPhotos.includes(photo.id)) {
      alert('You have already liked this photo!');
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
    photo.likes = newLikes; // Update local state

    try {
      const { error } = await supabaseClient
        .from('photos')
        .update({ likes: newLikes })
        .eq('id', photo.id);

      if (error) console.error('Like update error:', error);
    } catch (err) {
      console.error('Like error:', err);
    }
    if (window.lucide) window.lucide.createIcons();
  });

  // Lightbox Download Button click
  document.getElementById('lightbox-download-btn').addEventListener('click', () => {
    const photo = allPhotos[currentLightboxIdx];
    if (!photo) return;

    const link = document.createElement('a');
    link.href = photo.url;
    link.download = `${eventId}_${photo.id}.${photo.file_type === 'video' ? 'mp4' : 'jpg'}`;
    link.target = '_blank';
    link.click();
  });

  // 8. Infinite Scroll setup with IntersectionObserver
  const scrollSentinel = document.getElementById('gallery-scroll-sentinel');
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && allPhotos.length > loadedPhotosCount) {
      loadedPhotosCount += 20;
      renderGallery();
    }
  }, { threshold: 1.0 });
  observer.observe(scrollSentinel);
});

// Fetch all non-deleted, non-flagged photos for this event, sorted newest first
async function fetchAndRenderPhotos() {
  try {
    const { data: photos, error } = await supabaseClient
      .from('photos')
      .select('*')
      .eq('event_id', eventId)
      .eq('flagged', false)
      .eq('deleted', false)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Photos fetch error:', error);
      return;
    }

    handlePhotosLoaded(photos || []);
  } catch (err) {
    console.error('Failed to fetch photos:', err);
  }
}

// Subscribe to Supabase Realtime for new photo inserts on this event
function subscribeToPhotos() {
  // Clean up any existing subscription
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel(`photos-${eventId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'photos',
        filter: `event_id=eq.${eventId}`
      },
      (payload) => {
        console.log('New photo received via Realtime:', payload.new.id);
        // Refresh the full photo list to pick up the new photo
        fetchAndRenderPhotos();
      }
    )
    .subscribe((status) => {
      console.log('Realtime subscription status:', status);
    });
}

// Callback when event schema is fetched
function handleEventLoaded(data) {
  eventData = data;
  document.getElementById('loader-view').style.display = 'none';

  // Apply Partner Color schemes
  if (eventData.primary_color) {
    document.documentElement.style.setProperty('--hive-purple', eventData.primary_color);
  }

  // Bind logo
  const logoHeaderImg = document.getElementById('header-event-logo');
  if (eventData.logo_url) {
    logoHeaderImg.src = eventData.logo_url;
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

  // Setup Sponsor watermark banner if active (stored on event record)
  if (eventData.sponsor_name && eventData.sponsor_logo_url) {
    document.getElementById('sponsor-banner-name').textContent = eventData.sponsor_name;
    document.getElementById('sponsor-banner-logo').src = eventData.sponsor_logo_url;
    document.getElementById('sponsor-watermark-banner').style.display = 'flex';
  } else {
    document.getElementById('sponsor-watermark-banner').style.display = 'none';
  }
}

// Callback when photos array loads
function handlePhotosLoaded(photos) {
  allPhotos = photos;

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
    if (photo.file_type === 'video') {
      mediaHTML = `
        <video class="gallery-image" src="${photo.url}" preload="metadata" muted playsinline></video>
        <div class="gallery-video-indicator">
          <i data-lucide="play" style="width: 14px; height: 14px;"></i>
        </div>
      `;
    } else {
      // Lazy loading via loading="lazy" + Cloudinary w_400 optimized thumbnails
      mediaHTML = `
        <img class="gallery-image" src="${photo.thumbnail_url || photo.url}" alt="Shared photo" loading="lazy" referrerPolicy="no-referrer" />
      `;
    }

    item.innerHTML = `
      ${mediaHTML}
      <div class="gallery-overlay">
        <span class="uploader-name">${photo.guest_name || ''}</span>
        <span class="upload-time">${formatRelativeTime(photo.uploaded_at)}</span>
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
  const newLikes = (photo.likes || 0) + 1;
  span.textContent = newLikes;
  photo.likes = newLikes;
  const heartIcon = btnEl.querySelector('i');
  if (heartIcon) heartIcon.setAttribute('data-lucide', 'heart-handshake');

  try {
    const { error } = await supabaseClient
      .from('photos')
      .update({ likes: newLikes })
      .eq('id', photo.id);

    if (error) console.error('Inline like error:', error);
  } catch (err) {
    console.error('Inline like error:', err);
  }
  if (window.lucide) window.lucide.createIcons();
}

// Inline downloading inside hover panel
function handleInlineDownload(photo) {
  const link = document.createElement('a');
  link.href = photo.url;
  link.download = `${eventId}_${photo.id}.${photo.file_type === 'video' ? 'mp4' : 'jpg'}`;
  link.target = '_blank';
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
  document.getElementById('lightbox-uploader-name').textContent = photo.guest_name || '';
  document.getElementById('lightbox-upload-time').textContent = formatRelativeTime(photo.uploaded_at);
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

  if (photo.file_type === 'video') {
    imgEl.style.display = 'none';
    videoEl.src = photo.url;
    videoEl.style.display = 'block';
    videoEl.play();
  } else {
    videoEl.style.display = 'none';
    videoEl.src = '';
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
  if (diffSecs < 60) return 'Just now';

  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
