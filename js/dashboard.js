/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// js/dashboard.js
// Organizer dashboard — Supabase backend, no Firebase dependency.
import { supabaseClient } from './supabase-config.js';

let eventId = null;
let eventData = null;
let allPhotos = [];
let allGuests = [];
let showFlaggedOnly = false;
let realtimeChannel = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();

  // Parse eventId from URL parameters
  const params = new URLSearchParams(window.location.search);
  eventId = params.get('id');

  if (!eventId) {
    alert('No Event ID provided in the URL! Returning to landing page.');
    window.location.href = 'index.html';
    return;
  }

  // 1. Fetch event from Supabase for PIN verification
  try {
    const { data: event, error } = await supabaseClient
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (error || !event) {
      alert('This event does not exist or could not be loaded. Check the event ID.');
      window.location.href = 'index.html';
      return;
    }

    eventData = event;

    // Check if organizer is already logged in
    const isLogged = sessionStorage.getItem(`momenthive_dash_logged_${eventId}`) === 'true';
    if (isLogged) {
      showDashboardConsole();
    } else {
      document.getElementById('pin-prompt-view').style.display = 'block';
    }

  } catch (err) {
    console.error('Failed to load event data:', err);
    alert(`Could not load organizer session. Check your internet connection.\n\nError: ${err.message}`);
  }

  // 2. PIN Verification Click handler
  document.getElementById('verify-pin-btn').addEventListener('click', () => {
    const enteredPin = document.getElementById('organizer-pin').value;
    if (!eventData.organizer_phone) {
      alert('No organizer phone number found on record. Bypassing safety PIN.');
      sessionStorage.setItem(`momenthive_dash_logged_${eventId}`, 'true');
      showDashboardConsole();
      return;
    }

    const expectedPin = eventData.organizer_phone.slice(-4);
    if (enteredPin === expectedPin) {
      sessionStorage.setItem(`momenthive_dash_logged_${eventId}`, 'true');
      showDashboardConsole();
    } else {
      alert('Verification PIN is incorrect! (It is the last 4 digits of the organizer mobile number on file)');
    }
  });

  // 3. Logout action
  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem(`momenthive_dash_logged_${eventId}`);
    window.location.reload();
  });

  // 4. Copy Guest Album Link click handler
  document.getElementById('copy-guest-album-btn').addEventListener('click', async () => {
    const origin = window.location.origin;
    const albumUrl = `${origin}/album.html?id=${eventId}`;
    try {
      await navigator.clipboard.writeText(albumUrl);
      const copyBtn = document.getElementById('copy-guest-album-btn');
      copyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
      if (window.lucide) window.lucide.createIcons();
      setTimeout(() => {
        copyBtn.innerHTML = '<i data-lucide="copy"></i> Guest Album URL';
        if (window.lucide) window.lucide.createIcons();
      }, 2000);
    } catch (err) {
      alert('Album Link: ' + albumUrl);
    }
  });

  // 5. Download ALL photos as a single compressed ZIP file
  // Uses JSZip + FileSaver libraries via CDN loaded on dashboard.html
  document.getElementById('download-all-zip-btn').addEventListener('click', async () => {
    if (allPhotos.length === 0) {
      alert('No photos in this album to compress into a ZIP file!');
      return;
    }

    const zipBtn = document.getElementById('download-all-zip-btn');
    const btnText = document.getElementById('zip-btn-text');
    const spinner = document.getElementById('zip-btn-spinner');

    // Set loading state
    zipBtn.disabled = true;
    btnText.textContent = 'Compressing files...';
    spinner.style.display = 'inline-block';

    try {
      const zip = new JSZip();
      const folderName = `${eventData.name.replace(/\s+/g, '_')}_Memories`;
      const imgFolder = zip.folder(folderName);

      // Fetch each image URL as a blob and append it to the ZIP folder
      const downloadPromises = allPhotos.map(async (photo, idx) => {
        try {
          const res = await fetch(photo.url);
          const blob = await res.blob();

          const ext = photo.file_type === 'video' ? 'mp4' : 'jpg';
          const guestNameSafe = (photo.guest_name || 'Guest').replace(/\s+/g, '_');
          const filename = `${guestNameSafe}_${photo.id || idx}.${ext}`;

          imgFolder.file(filename, blob);
        } catch (fetchErr) {
          console.warn(`Failed to fetch and zip photo index ${idx}:`, fetchErr);
        }
      });

      await Promise.all(downloadPromises);

      // Compile and trigger save via FileSaver
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}.zip`);

    } catch (err) {
      console.error('ZIP creation failed:', err);
      alert('An error occurred while generating the ZIP archive.');
    } finally {
      // Revert loading state
      zipBtn.disabled = false;
      btnText.textContent = 'Download All as ZIP';
      spinner.style.display = 'none';
    }
  });

  // 6. Moderation Flag toggle (Show All vs. Flagged Only)
  const moderationToggle = document.getElementById('moderation-flagged-toggle');
  moderationToggle.addEventListener('change', (e) => {
    showFlaggedOnly = e.target.checked;
    renderModerationGallery();
  });

  // 7. Album Active Status Toggle
  const activeToggle = document.getElementById('album-active-toggle');
  activeToggle.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    const newStatus = isChecked ? 'active' : 'closed';

    // Show immediate feedback label
    const statusBadge = document.getElementById('dash-event-status');
    statusBadge.textContent = isChecked ? 'Active' : 'Closed';
    statusBadge.className = isChecked ? 'badge badge-green' : 'badge';

    try {
      const { error } = await supabaseClient
        .from('events')
        .update({ status: newStatus })
        .eq('id', eventId);

      if (error) throw error;
    } catch (err) {
      console.error('Status update error:', err);
      alert('Failed to update album status.');
    }
  });

  // 8. Sponsor Form Customization Save
  document.getElementById('dash-sponsor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sponsorName = document.getElementById('sponsor-name').value.trim();
    const sponsorLogoUrl = document.getElementById('sponsor-logo-url').value.trim();

    if (!sponsorName || !sponsorLogoUrl) {
      alert('Please fill in both the sponsor name and logo image URL!');
      return;
    }

    const saveBtn = document.getElementById('sponsor-save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Saving...';

    try {
      const { error } = await supabaseClient
        .from('events')
        .update({
          sponsor_name:     sponsorName,
          sponsor_logo_url: sponsorLogoUrl
        })
        .eq('id', eventId);

      if (error) throw error;
      alert('Sponsor branding customized successfully! This watermark is now live on the Guest Album view.');
    } catch (err) {
      console.error('Sponsor save error:', err);
      alert('Failed to save sponsor branding customization details.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i data-lucide="check"></i> Save Sponsor Branding';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  // 9. Export Registered Guest list as formatted CSV file
  document.getElementById('export-guests-csv-btn').addEventListener('click', () => {
    if (allGuests.length === 0) {
      alert('No guests registered to export!');
      return;
    }

    // Build CSV string
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Guest Name,WhatsApp Phone,Photos Uploaded,Join Time\r\n';

    allGuests.forEach((guest) => {
      const name = `"${(guest.name || '').replace(/"/g, '""')}"`;
      const phone = `"${guest.phone || ''}"`;
      const count = guest.photo_count || 0;
      const joined = `"${new Date(guest.joined_at || eventData.created_at).toLocaleString()}"`;

      csvContent += `${name},${phone},${count},${joined}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${eventData.id}_Guest_List.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
});

// Triggers once PIN is verified and console opens
async function showDashboardConsole() {
  document.getElementById('pin-prompt-view').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'inline-block';

  const dashboardView = document.getElementById('dashboard-view');
  dashboardView.style.display = 'block';

  // Bind static header event values
  document.getElementById('dash-event-name').textContent = eventData.name;
  document.getElementById('dash-event-id').textContent = eventData.id;

  // Set toggle status badge
  const isActive = eventData.status === 'active';
  const statusBadge = document.getElementById('dash-event-status');
  statusBadge.textContent = isActive ? 'Active' : 'Closed';
  statusBadge.className = isActive ? 'badge badge-green' : 'badge';
  document.getElementById('album-active-toggle').checked = isActive;

  // Prefill Sponsor inputs if already set
  if (eventData.sponsor_name) document.getElementById('sponsor-name').value = eventData.sponsor_name;
  if (eventData.sponsor_logo_url) document.getElementById('sponsor-logo-url').value = eventData.sponsor_logo_url;

  // Render QR code
  const origin = window.location.origin;
  const albumUrl = `${origin}/album.html?id=${eventId}`;
  const qrContainer = document.getElementById('dash-qrcode-canvas');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: albumUrl,
    width: 140,
    height: 140,
    colorDark: '#0A0A0A',
    colorLight: '#FFFFFF',
    correctLevel: QRCode.CorrectLevel.H
  });

  // Download QR handler
  document.getElementById('dash-download-qr-btn').addEventListener('click', () => {
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

  // Load initial data
  await loadDashboardData();

  // Subscribe to realtime photo changes
  subscribeToRealtimeUpdates();
}

// Fetch photos and guests from Supabase
async function loadDashboardData() {
  try {
    // Fetch ALL photos (including flagged) so organizer can moderate them
    const { data: photos, error: photosError } = await supabaseClient
      .from('photos')
      .select('*')
      .eq('event_id', eventId)
      .eq('deleted', false)
      .order('uploaded_at', { ascending: false });

    if (photosError) {
      console.error('Photos fetch error:', photosError);
    } else {
      allPhotos = photos || [];
    }

    // Fetch registered guests
    const { data: guests, error: guestsError } = await supabaseClient
      .from('guests')
      .select('*')
      .eq('event_id', eventId)
      .order('joined_at', { ascending: false });

    if (guestsError) {
      console.error('Guests fetch error:', guestsError);
    } else {
      allGuests = guests || [];
    }

    calculateStatsAndRender();
    renderGuestTable();
  } catch (err) {
    console.error('Dashboard data load failed:', err);
  }
}

// Subscribe to Supabase Realtime for photo changes
function subscribeToRealtimeUpdates() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel(`dashboard-${eventId}`)
    .on(
      'postgres_changes',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'photos',
        filter: `event_id=eq.${eventId}`
      },
      (payload) => {
        console.log('Dashboard realtime event:', payload.eventType);
        loadDashboardData();
      }
    )
    .subscribe();
}

// Calculate and bind stats counters
function calculateStatsAndRender() {
  const totalPhotos = allPhotos.filter(p => !p.flagged).length;
  const totalVideos = allPhotos.filter(p => p.file_type === 'video' && !p.flagged).length;

  // Update UI Counters
  document.getElementById('stat-photos-count').textContent = totalPhotos;
  document.getElementById('stat-videos-count').textContent = totalVideos;

  // Calculate Most Liked Photo
  const guestUploadCountMap = {};
  allPhotos.forEach(p => {
    guestUploadCountMap[p.guest_name] = (guestUploadCountMap[p.guest_name] || 0) + 1;
  });

  let mostActiveName = 'None';
  let maxUploads = 0;
  for (const [name, count] of Object.entries(guestUploadCountMap)) {
    if (count > maxUploads) {
      maxUploads = count;
      mostActiveName = `${name} (${count})`;
    }
  }

  document.getElementById('stat-active-guest').textContent = mostActiveName;

  // Calculate distinct guest count (use guests table, fallback to photos-derived count)
  const guestCountFromPhotos = new Set(allPhotos.map(p => p.guest_phone).filter(Boolean)).size;
  document.getElementById('stat-guests-count').textContent = Math.max(guestCountFromPhotos, allGuests.length);

  renderModerationGallery();
}

// Render the grid moderation photos
function renderModerationGallery() {
  const grid = document.getElementById('dash-gallery-grid');
  grid.innerHTML = '';

  // Filter based on toggle state
  const filtered = allPhotos.filter(p => {
    if (showFlaggedOnly) {
      return p.flagged === true;
    }
    return true; // Show all
  });

  if (filtered.length === 0) {
    document.getElementById('dash-empty-gallery-slate').style.display = 'block';
    return;
  } else {
    document.getElementById('dash-empty-gallery-slate').style.display = 'none';
  }

  filtered.forEach((photo) => {
    const item = document.createElement('div');
    item.className = 'dashboard-gallery-item';

    let mediaHTML = '';
    if (photo.file_type === 'video') {
      mediaHTML = `<video class="dashboard-gallery-media" src="${photo.url}" preload="metadata" muted></video>`;
    } else {
      mediaHTML = `<img class="dashboard-gallery-media" src="${photo.thumbnail_url || photo.url}" alt="Shared image" referrerPolicy="no-referrer" />`;
    }

    const flaggedBadge = photo.flagged ? `<span class="flagged-badge">FLAGGED</span>` : '';

    item.innerHTML = `
      ${flaggedBadge}
      ${mediaHTML}
      <div class="dashboard-gallery-actions">
        <span style="font-size: 11px; font-weight: 500; color: white;">By: ${photo.guest_name || 'Guest'}</span>
        <button class="btn-danger delete-btn" style="padding: 4px 8px; font-size: 11px; display: flex; align-items: center; gap: 4px;">
          <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Delete
        </button>
      </div>
    `;

    // Delete photo click event
    item.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Are you sure you want to permanently delete this photo uploaded by ${photo.guest_name || 'Guest'}? This cannot be undone.`)) {
        try {
          // Soft-delete: mark as deleted rather than hard delete to preserve referential integrity
          const { error } = await supabaseClient
            .from('photos')
            .update({ deleted: true })
            .eq('id', photo.id);

          if (error) throw error;

          // Decrement photo_count on event
          const { data: current } = await supabaseClient
            .from('events')
            .select('photo_count')
            .eq('id', eventId)
            .single();

          if (current) {
            await supabaseClient
              .from('events')
              .update({ photo_count: Math.max(0, (current.photo_count || 0) - 1) })
              .eq('id', eventId);
          }

          alert('Photo deleted successfully!');
          await loadDashboardData();
        } catch (err) {
          console.error('Delete error:', err);
          alert('Failed to delete photo.');
        }
      }
    });

    grid.appendChild(item);
  });

  if (window.lucide) window.lucide.createIcons();
}

// Render the Guest Table list
function renderGuestTable() {
  const tbody = document.querySelector('#guest-list-table tbody');
  tbody.innerHTML = '';

  if (allGuests.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 32px 0;">No guests registered yet.</td>
      </tr>
    `;
    return;
  }

  allGuests.forEach((guest) => {
    const row = document.createElement('tr');

    // Format join date beautifully
    const joinDate = new Date(guest.joined_at || eventData.created_at);
    const dateStr = joinDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    row.innerHTML = `
      <td style="font-weight: 600; font-family: 'Plus Jakarta Sans', sans-serif;">${guest.name || ''}</td>
      <td class="code-font" style="color: var(--text-secondary);">${guest.phone || ''}</td>
      <td>
        <span class="badge ${(guest.photo_count || 0) > 0 ? 'badge-green' : ''}">${guest.photo_count || 0} Shared</span>
      </td>
      <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
    `;
    tbody.appendChild(row);
  });
}
