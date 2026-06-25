/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// js/cloudinary-config.js
// Configure your Cloudinary free-tier account keys below.
// CLOUD_NAME and UPLOAD_PRESET are safe to commit (public/unsigned).
// Never put your Cloudinary API Secret here — it must stay server-side.

const CLOUDINARY_CLOUD_NAME = "eezaf9ae";
const CLOUDINARY_UPLOAD_PRESET = "momenthive_uploads"; // unsigned upload preset

// Check if Cloudinary is configured with real credentials (non-empty strings).
// Previously this function incorrectly compared the real credentials against
// placeholder strings, causing it to return false even with valid keys.
function isCloudinaryConfigured() {
  return (
    typeof CLOUDINARY_CLOUD_NAME === 'string' &&
    CLOUDINARY_CLOUD_NAME.trim().length > 0 &&
    typeof CLOUDINARY_UPLOAD_PRESET === 'string' &&
    CLOUDINARY_UPLOAD_PRESET.trim().length > 0
  );
}

// Upload a file to Cloudinary via XMLHttpRequest.
// Reports upload progress percentage via the onProgress callback.
// Always attempts a real Cloudinary upload — there is no silent local fallback.
// If Cloudinary is not configured or the upload fails, an error is thrown so
// the caller can show an honest, specific error to the user.
function uploadFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) {
      reject(new Error(
        'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME and ' +
        'CLOUDINARY_UPLOAD_PRESET in js/cloudinary-config.js before uploading photos.'
      ));
      return;
    }

    // Real Cloudinary upload via XMLHttpRequest to get progress events
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    xhr.open('POST', url, true);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded * 100) / e.total);
        onProgress(percent);
      }
    });

    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          // Cloudinary returns secure_url
          // Generate a thumbnail using Cloudinary transform (e.g. w_400)
          let secureUrl = response.secure_url;
          let thumbnailUrl = secureUrl;
          if (secureUrl.includes('/upload/')) {
            thumbnailUrl = secureUrl.replace('/upload/', '/upload/w_400,c_limit/');
          }
          resolve({
            url: secureUrl,
            thumbnailUrl: thumbnailUrl
          });
        } else {
          console.error('Cloudinary upload failure:', xhr.status, xhr.responseText);
          reject(new Error(
            `Photo upload failed (HTTP ${xhr.status}). ` +
            'Check your internet connection and Cloudinary configuration, then try again.'
          ));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error(
        "Couldn't reach Cloudinary — check your internet connection and try again."
      ));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was cancelled.'));
    });

    xhr.send(formData);
  });
}

export { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, isCloudinaryConfigured, uploadFileWithProgress };
