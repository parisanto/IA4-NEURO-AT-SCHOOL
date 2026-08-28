/* IA4-NEURO — sauvegarde globale commune au Web et à l'application de bureau. */
(function () {
  'use strict';

  const BACKUP_FORMAT = 'ia4-neuro-backup';
  const BACKUP_VERSION = 1;
  const APP_KEY = /^(ia4neuro_|form_)/;

  const tauriInvoke = () => window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;

  function setBackupStatus(message) {
    const status = document.getElementById('ia4-backup-status');
    if (!status) return;
    status.textContent = message;
    setTimeout(() => { if (status.textContent === message) status.textContent = ''; }, 5000);
  }

  function blobToData(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: blob.type || 'application/octet-stream', dataUrl: reader.result });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function dataToBlob(value) {
    const encoded = String(value.dataUrl || '').split(',')[1] || '';
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: value.type || 'application/octet-stream' });
  }

  if (tauriInvoke()) {
    window.IA4NativeStore = {
      async all() {
        const serialized = await tauriInvoke()('list_documents');
        return JSON.parse(serialized).map(saved => ({
          ...saved,
          blob: dataToBlob(saved.blob),
          thumb: saved.thumb ? dataToBlob(saved.thumb) : null
        }));
      },
      async put(item) {
        const payload = { ...item, blob: await blobToData(item.blob) };
        payload.thumb = item.thumb instanceof Blob ? await blobToData(item.thumb) : null;
        await tauriInvoke()('put_document', { item: JSON.stringify(payload) });
      },
      async delete(id) {
        await tauriInvoke()('delete_document', { id });
      },
      async clear() {
        await tauriInvoke()('clear_documents');
      }
    };
  }

  async function serializeClasseur() {
    if (typeof clAll !== 'function') return [];
    const items = await clAll();
    return Promise.all(items.map(async item => {
      const copy = { ...item };
      if (item.blob instanceof Blob) copy.blob = await blobToData(item.blob);
      if (item.thumb instanceof Blob) copy.thumb = await blobToData(item.thumb);
      return copy;
    }));
  }

  function serializeStorage() {
    const values = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (APP_KEY.test(key)) values[key] = localStorage.getItem(key);
    }
    return values;
  }

  async function createBackup() {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      app: 'IA4-NEURO',
      storage: serializeStorage(),
      classeur: await serializeClasseur()
    };
  }

  function downloadBackup(contents) {
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sauvegarde-ia4-neuro.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.exportIA4Backup = async function () {
    try {
      const contents = JSON.stringify(await createBackup());
      const invoke = tauriInvoke();
      if (invoke) {
        const destination = await invoke('export_backup', { contents });
        if (destination) setBackupStatus('✓ Sauvegarde complète enregistrée');
      } else {
        downloadBackup(contents);
        setBackupStatus('✓ Sauvegarde complète créée');
      }
    } catch (error) {
      console.error(error);
      alert('La sauvegarde complète n’a pas pu être créée. Vérifie l’espace disponible puis réessaie.');
    }
  };

  async function clearClasseur() {
    if (window.IA4NativeStore) return window.IA4NativeStore.clear();
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ia4neuro-classeur', 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  async function restoreBackup(contents) {
    const backup = JSON.parse(contents);
    if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
      throw new Error('format de sauvegarde incompatible');
    }
    if (!confirm('Restaurer cette sauvegarde complète ? Les données actuelles de IA4-NEURO seront remplacées.')) return;

    Object.keys(localStorage).filter(key => APP_KEY.test(key)).forEach(key => localStorage.removeItem(key));
    Object.entries(backup.storage || {}).forEach(([key, value]) => {
      if (APP_KEY.test(key) && typeof value === 'string') localStorage.setItem(key, value);
    });

    await clearClasseur();
    if (typeof clPut === 'function') {
      for (const saved of backup.classeur || []) {
        const item = { ...saved };
        if (item.blob && item.blob.dataUrl) item.blob = dataToBlob(item.blob);
        if (item.thumb && item.thumb.dataUrl) item.thumb = dataToBlob(item.thumb);
        await clPut(item);
      }
    }
    alert('Sauvegarde restaurée. IA4-NEURO va maintenant se recharger.');
    location.reload();
  }

  window.importIA4Backup = async function () {
    try {
      const invoke = tauriInvoke();
      if (invoke) {
        const contents = await invoke('import_backup');
        if (contents) await restoreBackup(contents);
      } else {
        document.getElementById('ia4-backup-input').click();
      }
    } catch (error) {
      console.error(error);
      alert('Cette sauvegarde est illisible ou incompatible.');
    }
  };

  window.handleIA4BackupFile = function (input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => restoreBackup(reader.result).catch(error => {
      console.error(error);
      alert('Cette sauvegarde est illisible ou incompatible.');
    });
    reader.readAsText(file);
    input.value = '';
  };

  async function saveNativeSnapshot() {
    const invoke = tauriInvoke();
    if (!invoke) return;
    try {
      await invoke('save_snapshot', { contents: JSON.stringify({ storage: serializeStorage() }) });
    } catch (error) {
      console.error('Sauvegarde native différée :', error);
    }
  }

  async function restoreNativeSnapshotIfNeeded() {
    const invoke = tauriInvoke();
    if (!invoke || Object.keys(serializeStorage()).length) return;
    try {
      const contents = await invoke('load_snapshot');
      if (!contents) return;
      const snapshot = JSON.parse(contents);
      let restored = false;
      Object.entries(snapshot.storage || {}).forEach(([key, value]) => {
        if (APP_KEY.test(key) && typeof value === 'string') {
          localStorage.setItem(key, value);
          restored = true;
        }
      });
      if (restored && !sessionStorage.getItem('ia4-native-restored')) {
        sessionStorage.setItem('ia4-native-restored', '1');
        location.reload();
      }
    } catch (error) {
      console.error('Restauration native différée :', error);
    }
  }

  restoreNativeSnapshotIfNeeded();
  if (tauriInvoke()) {
    setInterval(saveNativeSnapshot, 5000);
    window.addEventListener('pagehide', saveNativeSnapshot);
  }

  window.addEventListener('load', () => {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  });
})();
