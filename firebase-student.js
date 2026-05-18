/* ═══════════════════════════════════════════════════════════════
   SCHOOLSAFE — Firebase para App del ALUMNO
   ───────────────────────────────────────────────────────────────
   Proyecto: school-safe-app-9fe53
   SDK: Firebase 12.10.0 (ESModules — CDN)
   ═══════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    enableIndexedDbPersistence,
    doc,
    collection,
    getDoc,
    setDoc,
    updateDoc,
    query,
    where,
    getDocs,
    addDoc,
    onSnapshot,
    orderBy,
    limit,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

/* ── Configuración del proyecto ────────────────────────────────── */
const firebaseConfig = {
    apiKey: "AIzaSyCIpJRDZHweSb48pWyODa3NWRD7bsCv6r0",
    authDomain: "school-safe-app-9fe53.firebaseapp.com",
    projectId: "school-safe-app-9fe53",
    storageBucket: "school-safe-app-9fe53.firebasestorage.app",
    messagingSenderId: "807596016988",
    appId: "1:807596016988:web:3f7ab4d4e1a5c8b9d2e3f1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Enable offline persistence (v9/v10 standard)
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn("Firestore persistence target already active in another tab.");
    } else if (err.code == 'unimplemented') {
        console.warn("Firestore persistence not supported by this browser.");
    }
});

// Importar y configurar Auth para evitar bloqueos por reglas de seguridad
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
const auth = getAuth(app);

// Iniciar sesión de forma anónima silenciosamente (necesario si Firestore Rules exigen autenticación)
signInAnonymously(auth).catch((error) => {
    console.error("Error al autenticar anónimamente:", error);
});

/* ═══════════════════════════════════════════════════════════════
   VINCULACIÓN — Verifica el código de 6 dígitos
   ═══════════════════════════════════════════════════════════════ */

/**
 * Busca en la colección `students` un documento cuyo `linkCode` coincida.
 * @param {string} code — 6 dígitos ingresados por el alumno
 * @returns {Promise<{id, name, parentid, ...} | null>}
 */
export async function verifyLinkCode(code) {
    const q = query(
        collection(db, "students"),
        where("linkCode", "==", code.trim())
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Marca el alumno como vinculado en Firestore.
 * Escribe linked: true y deviceToken opcional.
 * @param {string} studentId
 */
export async function markStudentLinked(studentId) {
    await setDoc(doc(db, "students", studentId), {
        linked: true,
        linkedAt: serverTimestamp()
    }, { merge: true });
}

/**
 * Obtiene los datos completos de un alumno.
 */
export async function getStudentData(studentId) {
    const snap = await getDoc(doc(db, "students", studentId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* ═══════════════════════════════════════════════════════════════
   DATOS EN VIVO — Escribe en student_live/{studentId}
   La app del PADRE lee esta colección en tiempo real.

   Datos esperados:
   {
     lat, lng, accuracy,   ← GPS
     battery, charging,    ← Batería
     speed,                ← Velocidad (m/s → convertimos a km/h)
     sos,                  ← Botón SOS activo
     ts                    ← Timestamp epoch (ms)
   }
   ═══════════════════════════════════════════════════════════════ */

/**
 * Escribe o actualiza los datos en vivo del alumno en Firestore.
 * @param {string} studentId
 * @param {object} data — { lat, lng, accuracy, battery, charging, speed, sos }
 */
export async function writeLiveData(studentId, data) {
    const ref = doc(db, "student_live", studentId);
    await setDoc(ref, {
        ...data,
        ts: Date.now(),
    }, { merge: true });
}

/**
 * Agrega un evento al historial del alumno en Firestore.
 * Se guarda en /students/{studentId}/history
 */
export async function addHistoryEventFS(studentId, event) {
    const historyRef = collection(db, "students", studentId, "history");
    await addDoc(historyRef, {
        ...event,
        serverTs: serverTimestamp()
    });
}

/**
 * Envía una notificación persistente a la colección del PADRE.
 * @param {string} studentId
 * @param {string} parentid — El UID del padre obtenido del documento del estudiante
 * @param {object} notif — { type, title, body, icon, action }
 */
export async function sendNotificationFS(studentId, parentid, notif) {
  if (!parentid) return;
  const colRef = collection(db, 'notifications');
  await addDoc(colRef, {
    studentId,
    parentid,
    ...notif,
    timestamp: serverTimestamp(),
    unread: true
  });
}

/**
 * Actualiza el avatar del alumno en Firestore
 */
export async function updateStudentAvatarFS(studentId, url) {
    if (!studentId || !url) return;
    const ref = doc(db, "students", studentId);
    await updateDoc(ref, { photoURL: url });
}

/**
 * Sube un archivo WebP optimizado a Firebase Storage y retorna la URL
 * @param {string} studentId
 * @param {Blob} blob WebP blob generado por canvas
 * @returns {Promise<string>} Download URL
 */
export async function uploadCustomAvatarWebP(studentId, blob) {
    if (!studentId || !blob) throw new Error("Faltan datos para subir imagen");
    const storageRef = ref(storage, `avatars/${studentId}_${Date.now()}.webp`);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
}

/**
 * Suscribe en tiempo real a los datos del documento del estudiante.
 * Se usa para sincronizar Contactos y Horario desde el Padre.
 */

export function subscribeStudentConfig(studentId, onChange) {
    const ref = doc(db, "students", studentId);
    return onSnapshot(ref, snap => {
        onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
}

/**
 * Actualiza la ubicación de la zona segura (Hogar o Escuela) del alumno
 */
export async function updateStudentSafeZoneFS(studentId, type, lat, lng) {
  const docRef = doc(db, 'students', studentId);
  const updates = {};
  if (type === 'home') {
    updates.homeLat = lat;
    updates.homeLng = lng;
  } else if (type === 'school') {
    updates.schoolLat = lat;
    updates.schoolLng = lng;
  }
  await updateDoc(docRef, updates);
}

/**
 * Desvincula al alumno en Firestore.
 * Genera un nuevo código de 6 dígitos para que el padre pueda re-vincularlo.
 * @param {string} studentId
 */
export async function unlinkStudentFS(studentId) {
    if (!studentId) return;
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const docRef = doc(db, "students", studentId);
    await updateDoc(docRef, {
        linked: false,
        linkCode: newCode,
        linkedAt: null,
        parentid: null
    });
    return newCode;
}

/**
 * Suscribe al chat en tiempo real (últimos 20 mensajes).
 */
export function subscribeToChat(studentId, onChange) {
    const q = query(
        collection(db, "students", studentId, "chat"),
        orderBy("ts", "desc"),
        limit(20)
    );
    return onSnapshot(q, snap => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        onChange(msgs);
    }, err => {
        console.error("❌ Error en subscribeToChat (Student):", err);
        if (onChange) onChange([], err);
    });
}

/**
 * Envía un mensaje al chat.
 */
export async function sendChatMessage(studentId, sender, text) {
    if (!text.trim()) return;
    const chatRef = collection(db, "students", studentId, "chat");
    await addDoc(chatRef, {
        sender: sender, // 'parent' o 'student'
        text: text.trim(),
        ts: serverTimestamp()
    });
}

export { db, auth };

window.ss_firebase = {
  db,
  auth,
  subscribeStudentConfig,
  updateStudentSafeZoneFS,
  unlinkStudentFS,
  subscribeToChat,
  sendChatMessage
};
