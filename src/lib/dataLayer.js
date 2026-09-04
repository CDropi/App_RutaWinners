// ============================================================
// Capa de datos. Las dos páginas (Ingreso y Staff) llaman SOLO a
// estas funciones. Internamente decide si usar datos de ejemplo
// (localStorage) o Firebase real, según MODO_PRUEBA.
//
// Modelo:
//   - "preregistros": gente registrada (viene del registro público)
//   - "tickets": una entrada por persona por día elegido (se crea
//     cuando la persona elige ese día en Ingreso)
// ============================================================
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore, doc, getDoc, getDocs, collection, query, where,
  runTransaction, serverTimestamp, increment, setDoc, arrayUnion
} from "firebase/firestore";
import { firebaseConfig, MODO_PRUEBA, EVENTO, FECHA_SIMULADA_HOY } from "../config.js";
import { personasIniciales, ticketsIniciales } from "./mockData.js";

const MESES = { ENE:0, FEB:1, MAR:2, ABR:3, MAY:4, JUN:5, JUL:6, AGO:7, SEP:8, OCT:9, NOV:10, DIC:11 };

// Convierte "25 JUL" + el año del evento en una fecha real, para poder
// compararla contra el día de hoy y así saber si un ticket corresponde
// al día correcto del evento (y no a otro día que aún no ha llegado, o
// que ya pasó).
function fechaDelDia(diaId) {
  const dia = EVENTO.dias.find(d => d.id === diaId);
  if (!dia) return null;
  const [numeroStr, mesStr] = dia.fecha.split(" ");
  const mes = MESES[mesStr.toUpperCase()];
  if (mes === undefined) return null;
  return new Date(Number(EVENTO.anio), mes, Number(numeroStr));
}

function esMismoDiaCalendario(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function hoy() {
  return FECHA_SIMULADA_HOY ? new Date(`${FECHA_SIMULADA_HOY}T12:00:00`) : new Date();
}

function diaCoincideConHoy(diaId) {
  const fecha = fechaDelDia(diaId);
  if (!fecha) return true; // si no se pudo determinar la fecha, no bloqueamos por esto
  return esMismoDiaCalendario(fecha, hoy());
}

const LS_PERSONAS = "mock_personas_v2";
const LS_TICKETS = "mock_tickets_v2";
const LS_STATS = "mock_stats_v2";
const LS_PROGRESO = "mock_stand_progreso_v1"; // { [personId]: [standId, standId, ...] }
const LS_ACADEMY = "mock_academy_v1"; // { [personId]: true }
const LS_PREMIOS = "mock_premios_v1"; // { [personId]: { seleccionados:[], confirmado:false } }

let _db = null;
function getDb() {
  if (_db) return _db;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  _db = getFirestore(app);
  return _db;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- almacenamiento de prueba (localStorage) ----
function leerPersonas() {
  const raw = localStorage.getItem(LS_PERSONAS);
  if (raw) return JSON.parse(raw);
  localStorage.setItem(LS_PERSONAS, JSON.stringify(personasIniciales));
  return JSON.parse(JSON.stringify(personasIniciales));
}
function guardarPersonas(list) { localStorage.setItem(LS_PERSONAS, JSON.stringify(list)); }

function leerTickets() {
  const raw = localStorage.getItem(LS_TICKETS);
  if (raw) return JSON.parse(raw);
  localStorage.setItem(LS_TICKETS, JSON.stringify(ticketsIniciales));
  return JSON.parse(JSON.stringify(ticketsIniciales));
}
function guardarTickets(list) { localStorage.setItem(LS_TICKETS, JSON.stringify(list)); }

function leerStats() {
  const raw = localStorage.getItem(LS_STATS);
  return raw ? JSON.parse(raw) : { count: 0, count_dia1: 0, count_dia2: 0 };
}
function guardarStats(s) { localStorage.setItem(LS_STATS, JSON.stringify(s)); }

function leerProgreso() {
  const raw = localStorage.getItem(LS_PROGRESO);
  return raw ? JSON.parse(raw) : {};
}
function guardarProgreso(p) { localStorage.setItem(LS_PROGRESO, JSON.stringify(p)); }

function leerAcademy() {
  const raw = localStorage.getItem(LS_ACADEMY);
  return raw ? JSON.parse(raw) : {};
}
function guardarAcademy(a) { localStorage.setItem(LS_ACADEMY, JSON.stringify(a)); }

function leerPremios() {
  const raw = localStorage.getItem(LS_PREMIOS);
  return raw ? JSON.parse(raw) : {};
}
function guardarPremios(p) { localStorage.setItem(LS_PREMIOS, JSON.stringify(p)); }
// El staff no entrega premios (su vista es solo de consulta), así que acá no
// hay ningún campo de entrega.
function premiosVacio() { return { seleccionados: [], confirmado: false }; }

function generarCodigo(usados) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0,O,1,I,L
  let code;
  do {
    code = "";
    for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (usados.has(code));
  usados.add(code);
  return code;
}

// ============================================================
// API pública usada por las páginas
// ============================================================

// ---- Ingreso ----

export async function buscarPersonaPorId(idValue) {
  if (MODO_PRUEBA) {
    await delay(350);
    const list = leerPersonas();
    return list.find(p => p.id === idValue) || null;
  }
  const db = getDb();
  const snap = await getDoc(doc(db, "preregistros", idValue));
  return snap.exists() ? { id: idValue, ...snap.data() } : null;
}

// Devuelve los tickets ya elegidos por esta persona (0, 1 o 2)
export async function obtenerTicketsDePersona(idValue) {
  if (MODO_PRUEBA) {
    await delay(200);
    return leerTickets().filter(t => t.personId === idValue);
  }
  const db = getDb();
  const q = query(collection(db, "tickets"), where("personId", "==", idValue));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ticketCode: d.id, ...d.data() }));
}

// Crea la entrada para un día si no existe todavía. Si ya existe, devuelve la existente
// (evita duplicados si la persona hace doble clic o vuelve a entrar).
export async function elegirDia(idValue, nombre, diaId) {
  if (MODO_PRUEBA) {
    await delay(300);
    const tickets = leerTickets();
    const existente = tickets.find(t => t.personId === idValue && t.dia === diaId);
    if (existente) return existente;

    const usados = new Set(tickets.map(t => t.ticketCode));
    const nuevo = {
      ticketCode: generarCodigo(usados),
      personId: idValue,
      nombre,
      dia: diaId,
      checkedIn: false,
      checkedInAt: null
    };
    tickets.push(nuevo);
    guardarTickets(tickets);
    return nuevo;
  }

  const db = getDb();
  const indexRef = doc(db, "ticketIndex", `${idValue}_dia${diaId}`);

  return await runTransaction(db, async (tx) => {
    const indexSnap = await tx.get(indexRef);
    if (indexSnap.exists()) {
      const ticketRef = doc(db, "tickets", indexSnap.data().ticketCode);
      const ticketSnap = await tx.get(ticketRef);
      return { ticketCode: ticketRef.id, ...ticketSnap.data() };
    }
    const ticketCode = generarCodigo(new Set());
    const ticketRef = doc(db, "tickets", ticketCode);
    const nuevo = { personId: idValue, nombre, dia: diaId, checkedIn: false, checkedInAt: null };
    tx.set(ticketRef, nuevo);
    tx.set(indexRef, { ticketCode });
    return { ticketCode, ...nuevo };
  });
}

// ---- Staff ----

export async function procesarCheckin(ticketCode) {
  if (MODO_PRUEBA) {
    await delay(250);
    const tickets = leerTickets();
    const idx = tickets.findIndex(t => t.ticketCode === ticketCode);
    if (idx === -1) return { ok: false, reason: "not_found" };
    if (tickets[idx].checkedIn) return { ok: false, reason: "already_used", data: tickets[idx] };
    tickets[idx].checkedIn = true;
    tickets[idx].checkedInAt = new Date().toISOString();
    guardarTickets(tickets);

    const stats = leerStats();
    stats.count = (stats.count || 0) + 1;
    const key = `count_dia${tickets[idx].dia}`;
    stats[key] = (stats[key] || 0) + 1;
    guardarStats(stats);

    return { ok: true, data: tickets[idx] };
  }

  const db = getDb();
  const ref = doc(db, "tickets", ticketCode);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return { ok: false, reason: "not_found" };
    const data = snap.data();
    if (data.checkedIn) return { ok: false, reason: "already_used", data };
    if (!diaCoincideConHoy(data.dia)) return { ok: false, reason: "dia_incorrecto", data };
    tx.update(ref, { checkedIn: true, checkedInAt: serverTimestamp() });
    const statsRef = doc(db, "stats", "checkins");
    tx.set(statsRef, { count: increment(1), [`count_dia${data.dia}`]: increment(1) }, { merge: true });
    return { ok: true, data };
  });
}


// Conteo de ingresos separado por día: { 1: n, 2: n, ... }
export async function obtenerContadoresPorDia() {
  if (MODO_PRUEBA) {
    const stats = leerStats();
    const resultado = {};
    for (const dia of EVENTO.dias) resultado[dia.id] = stats[`count_dia${dia.id}`] || 0;
    return resultado;
  }
  const db = getDb();
  const snap = await getDoc(doc(db, "stats", "checkins"));
  const data = snap.exists() ? snap.data() : {};
  const resultado = {};
  for (const dia of EVENTO.dias) resultado[dia.id] = data[`count_dia${dia.id}`] || 0;
  return resultado;
}

// Lista de personas que YA ingresaron en un día puntual, con su nombre,
// teléfono, correo (cruzando con preregistros) y el código de su ticket.
export async function obtenerAsistentesIngresados(diaId) {
  let ticketsDelDia;
  if (MODO_PRUEBA) {
    ticketsDelDia = leerTickets().filter(t => t.dia === diaId && t.checkedIn);
  } else {
    const db = getDb();
    const q = query(
      collection(db, "tickets"),
      where("dia", "==", diaId),
      where("checkedIn", "==", true)
    );
    const snap = await getDocs(q);
    ticketsDelDia = snap.docs.map(d => ({ ticketCode: d.id, ...d.data() }));
  }

  // Cruza cada ticket con su preregistro para sacar el correo.
  const conCorreo = await Promise.all(
    ticketsDelDia.map(async (t) => {
      let correo = "";
      try {
        const persona = await buscarPersonaPorId(t.personId);
        correo = persona?.correo || "";
      } catch (err) {
        console.error(err);
      }
      return {
        nombre: t.nombre || "",
        telefono: t.personId || "",
        correo,
        ticketCode: t.ticketCode,
        checkedInAt: t.checkedInAt || null,
      };
    })
  );

  return conCorreo;
}

// Solo tiene efecto en modo prueba: borra los datos de ejemplo guardados en
// el navegador. La usa el atajo de MODO_PRUEBA del mapa.
export function reiniciarDatosDePrueba() {
  localStorage.removeItem(LS_PERSONAS);
  localStorage.removeItem(LS_TICKETS);
  localStorage.removeItem(LS_STATS);
  localStorage.removeItem(LS_PROGRESO);
  localStorage.removeItem(LS_ACADEMY);
  localStorage.removeItem(LS_PREMIOS);
}

// ---- Premios de la Ruta Winner ----
// Devuelve { seleccionados, confirmado } para esta persona.
// Si nunca ha tocado nada de premios, devuelve el estado vacío por defecto.
export async function obtenerPremiosPersona(personId) {
  if (MODO_PRUEBA) {
    await delay(150);
    const todos = leerPremios();
    return todos[personId] || premiosVacio();
  }
  const snap = await getDoc(doc(getDb(), "premios", personId));
  return snap.exists() ? { ...premiosVacio(), ...snap.data() } : premiosVacio();
}

// Confirma la selección de premios de forma DEFINITIVA. Si ya estaba
// confirmada antes, no la vuelve a tocar (para que quede bloqueada de
// verdad y no se pueda cambiar ni reenviando la petición otra vez).
export async function confirmarPremios(personId, premiosIds) {
  if (MODO_PRUEBA) {
    await delay(250);
    const todos = leerPremios();
    const actual = todos[personId] || premiosVacio();
    if (actual.confirmado) return actual; // ya estaba confirmada: no se toca
    todos[personId] = { ...actual, seleccionados: premiosIds, confirmado: true };
    guardarPremios(todos);
    return todos[personId];
  }
  const ref = doc(getDb(), "premios", personId);
  const actual = await obtenerPremiosPersona(personId);
  if (actual.confirmado) return actual; // ya estaba confirmada: no se toca
  const nuevo = { seleccionados: premiosIds, confirmado: true };
  await setDoc(ref, nuevo, { merge: true });
  return nuevo;
}

// Uso del STAFF: trae en un solo llamado todo lo que necesita la vista de
// entrega de premios para una persona (datos básicos + progreso + premios).
export async function buscarPersonaConPremios(idValue) {
  const persona = await buscarPersonaPorId(idValue);
  if (!persona) return null;
  // Una sola lectura de standProgress trae los stands y el estado de
  // Academy, que el staff también necesita ver.
  const [progreso, premios] = await Promise.all([
    obtenerProgresoRuta(idValue),
    obtenerPremiosPersona(idValue),
  ]);
  return {
    persona,
    standsCompletados: progreso.completados,
    academyCompletada: progreso.academy,
    premios,
  };
}

// ---- Progreso de la "Ruta Winner" (actividad por stand) ----
// Devuelve la lista de ids de stands que esta persona ya completó
// (escaneó el QR correcto tras responder las preguntas).
export async function obtenerStandsCompletados(personId) {
  return (await obtenerProgresoRuta(personId)).completados;
}

// Trae de una sola lectura TODO el progreso de la ruta: los stands
// completados y si ya terminó la actividad de Academy.
//
// Van en el MISMO documento (standProgress/{personId}) justamente para no
// gastar una lectura extra por persona: con ~5.000 asistentes, cada lectura
// evitable cuenta. De Academy solo interesa el sí/no, no en qué paso quedó.
export async function obtenerProgresoRuta(personId) {
  if (MODO_PRUEBA) {
    await delay(150);
    return {
      completados: leerProgreso()[personId] || [],
      academy: leerAcademy()[personId] === true,
    };
  }
  const snap = await getDoc(doc(getDb(), "standProgress", personId));
  const datos = snap.exists() ? snap.data() : {};
  return {
    completados: datos.completados || [],
    academy: datos.academy === true,
  };
}

// Deja registrado que esta persona ya completó la actividad de Academy.
// Es idempotente: volver a llamarla no cambia nada.
export async function marcarAcademyCompletada(personId) {
  if (MODO_PRUEBA) {
    await delay(150);
    const academy = leerAcademy();
    academy[personId] = true;
    guardarAcademy(academy);
    return true;
  }
  await setDoc(doc(getDb(), "standProgress", personId), { academy: true }, { merge: true });
  return true;
}

// Marca un stand como completado para esta persona (no truena si ya
// estaba marcado; simplemente no lo duplica).
export async function marcarStandCompletado(personId, standId) {
  if (MODO_PRUEBA) {
    await delay(200);
    const progreso = leerProgreso();
    const actuales = progreso[personId] || [];
    if (!actuales.includes(standId)) {
      progreso[personId] = [...actuales, standId];
      guardarProgreso(progreso);
    }
    return progreso[personId];
  }
  const ref = doc(getDb(), "standProgress", personId);
  await setDoc(ref, { completados: arrayUnion(standId) }, { merge: true });
  const snap = await getDoc(ref);
  return snap.data().completados || [];
}

