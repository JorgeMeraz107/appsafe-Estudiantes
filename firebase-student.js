/* ═══════════════════════════════════════════════════════════════
   SCHOOLSAFE — Firebase para App del ALUMNO
   ───────────────────────────────────────────────────────────────
   Proyecto: school-safe-app-9fe53
   SDK: Firebase 12.10.0 (ESModules — CDN)
   ═══════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
    getFirestore,
    enableIndexedDbPersistence,
    doc,
    collection,
    getDoc,
    setDoc,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn("Firestore persistence target already active in another tab.");
    } else if (err.code == 'unimplemented') {
        console.warn("Firestore persistence not supported by this browser.");
    }
});

// Importar y configurar Auth para evitar bloqueos por reglas de seguridad
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
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
 * Suscribe en tiempo real a los datos del documento del estudiante.
 * Se usa para sincronizar Contactos y Horario desde el Padre.
 */
import { onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

export function subscribeStudentConfig(studentId, onChange) {
    const ref = doc(db, "students", studentId);
    return onSnapshot(ref, snap => {
        onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
}

export { db, auth };
