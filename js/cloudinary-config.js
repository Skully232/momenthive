/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// js/cloudinary-config.js
// Configure your Cloudinary free-tier account keys below.

const CLOUDINARY_CLOUD_NAME = "eezaf9ae";
const CLOUDINARY_UPLOAD_PRESET = "momenthive_uploads"; // unsigned upload preset

// Check if Cloudinary is configured with real credentials
function isCloudinaryConfigured() {
  return (
    CLOUDINARY_CLOUD_NAME &&
    CLOUDINARY_CLOUD_NAME !== "eezaf9ae" &&
    CLOUDINARY_UPLOAD_PRESET &&
    CLOUDINARY_UPLOAD_PRESET !== "momenthive_uploads"
  );
}

// Emulates a Cloudinary upload with real progress events and converts the file to a base64 Data URL, 
// ensuring that uploaded photos actually display in the gallery immediately in sandbox mode!
function uploadFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (isCloudinaryConfigured()) {
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
            console.error('Cloudinary upload failure:', xhr.responseText);
            reject(new Error('Cloudinary upload failed. Please verify configuration keys.'));
          }
        }
      });

      xhr.send(formData);
    } else {
      // Elegant local sandbox upload simulation using FileReader
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        if (progress > 100) {
          progress = 100;
        }
        onProgress(progress);

        if (progress === 100) {
          clearInterval(interval);
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              url: reader.result,
              thumbnailUrl: reader.result // Use the same base64 for thumbnail in sandbox mode
            });
          };
          reader.onerror = () => {
            reject(new Error('Failed to read file locally.'));
          };
          reader.readAsDataURL(file);
        }
      }, 200);
    }
  });
}

export { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, isCloudinaryConfigured, uploadFileWithProgress };
