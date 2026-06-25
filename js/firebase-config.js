/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// js/firebase-config.js
// Configure your Firebase project details below.
// This client-side configuration will connect to your Firestore database.

const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};

// Check if Firebase is configured with real credentials
function isFirebaseConfigured() {
  return (
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY" &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== "REPLACE_WITH_YOUR_PROJECT_ID"
  );
}

// In case Firebase is not configured, we provide a robust client-side emulator 
// of the Firestore APIs to ensure the MomentHive MVP is 100% interactive and 
// fully functional out of the box in the AI Studio preview environment.
class LocalFirestoreEmulator {
  constructor() {
    this.listeners = {};
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('momenthive_')) {
        this.triggerListeners();
      }
    });
  }

  getEvents() {
    const data = localStorage.getItem('momenthive_events');
    return data ? JSON.parse(data) : {};
  }

  saveEvents(events) {
    localStorage.setItem('momenthive_events', JSON.stringify(events));
    this.triggerListeners();
  }

  triggerListeners() {
    Object.values(this.listeners).forEach(cb => {
      try { cb(); } catch (err) { console.error(err); }
    });
  }

  async getDoc(docRef) {
    const events = this.getEvents();
    const id = docRef.id;
    return {
      exists: () => !!events[id],
      data: () => events[id] || null,
      id: id
    };
  }

  async setDoc(docRef, data) {
    const events = this.getEvents();
    events[docRef.id] = { ...data, id: docRef.id };
    this.saveEvents(events);
  }

  async updateDoc(docRef, updateData) {
    const events = this.getEvents();
    if (events[docRef.id]) {
      // Process dot-notation or standard merge
      let updatedObj = { ...events[docRef.id] };
      for (const [key, val] of Object.entries(updateData)) {
        if (typeof val === 'object' && val !== null && val.constructor?.name === 'FieldValue') {
          // FieldValue simulation
          if (val.type === 'increment') {
            updatedObj[key] = (updatedObj[key] || 0) + val.value;
          } else if (val.type === 'arrayUnion') {
            const arr = Array.isArray(updatedObj[key]) ? updatedObj[key] : [];
            val.values.forEach(v => {
              if (!arr.includes(v)) arr.push(v);
            });
            updatedObj[key] = arr;
          }
        } else {
          updatedObj[key] = val;
        }
      }
      events[docRef.id] = updatedObj;
      this.saveEvents(events);
    }
  }

  onSnapshot(docRef, callback) {
    const listenerId = Math.random().toString(36).substring(2);
    const trigger = async () => {
      const docSnap = await this.getDoc(docRef);
      callback(docSnap);
    };
    this.listeners[listenerId] = trigger;
    trigger();
    return () => {
      delete this.listeners[listenerId];
    };
  }

  // Collection emulator
  async getDocs(collectionRef) {
    const path = collectionRef.path;
    if (path.includes('/photos')) {
      const eventId = path.split('/')[1];
      const photos = JSON.parse(localStorage.getItem(`momenthive_photos_${eventId}`) || '[]');
      return {
        docs: photos.map(p => ({
          id: p.id,
          data: () => p
        }))
      };
    }
    return { docs: [] };
  }

  onCollectionSnapshot(collectionRef, callback) {
    const listenerId = Math.random().toString(36).substring(2);
    const trigger = () => {
      const path = collectionRef.path;
      if (path.includes('/photos')) {
        const eventId = path.split('/')[1];
        const photos = JSON.parse(localStorage.getItem(`momenthive_photos_${eventId}`) || '[]');
        callback({
          docs: photos.map(p => ({
            id: p.id,
            data: () => p
          }))
        });
      }
    };
    this.listeners[listenerId] = trigger;
    trigger();
    return () => {
      delete this.listeners[listenerId];
    };
  }

  async addDoc(collectionRef, docData) {
    const path = collectionRef.path;
    const id = Math.random().toString(36).substring(2).toUpperCase();
    if (path.includes('/photos')) {
      const eventId = path.split('/')[1];
      const photos = JSON.parse(localStorage.getItem(`momenthive_photos_${eventId}`) || '[]');
      const newPhoto = { ...docData, id };
      photos.push(newPhoto);
      localStorage.setItem(`momenthive_photos_${eventId}`, JSON.stringify(photos));
      
      // Auto increment count on parent event
      const events = this.getEvents();
      if (events[eventId]) {
        events[eventId].photoCount = (events[eventId].photoCount || 0) + 1;
        this.saveEvents(events);
      }
      
      this.triggerListeners();
      return { id };
    }
    return { id };
  }
}

const localFirestoreEmulator = new LocalFirestoreEmulator();

export { firebaseConfig, isFirebaseConfigured, localFirestoreEmulator };
