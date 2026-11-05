/**
 * Lógica de "Roommates": búsqueda con filtros, perfiles y mensajes.
 */
const store = require('./store');
const { HttpError } = require('../middleware/errors');

/** Rango de edad a partir del valor del filtro ("18-25", "26-35", "36+"). */
const AGE_RANGES = {
  '18-25': (age) => age >= 18 && age <= 25,
  '26-35': (age) => age >= 26 && age <= 35,
  '36+': (age) => age >= 36,
};

/**
 * @param {object} f { gender, age, occupation, schedule, petsOnly }
 * @returns {object[]} Roommates ordenados por compatibilidad (mayor primero).
 */
function search(f = {}) {
  return store.roommates
    .filter((r) => {
      if (f.gender && f.gender !== 'cualquiera' && r.gender !== f.gender) return false;
      if (f.occupation && f.occupation !== 'todas' && r.occupation !== f.occupation) return false;
      if (f.schedule && f.schedule !== 'todos' && r.schedule !== f.schedule) return false;
      if (f.petsOnly && !r.pets) return false;
      if (f.age && AGE_RANGES[f.age] && !AGE_RANGES[f.age](r.age)) return false;
      return true;
    })
    .sort((a, b) => b.compatibility - a.compatibility);
}

function findById(id) {
  const roommate = store.roommates.find((r) => r.id === id);
  if (!roommate) throw new HttpError(404, `No existe el roommate #${id}.`);
  return roommate;
}

/** Guarda el perfil de roommate del usuario actual (en memoria). */
function saveProfile(plan, profile) {
  const record = { plan, ...profile, savedAt: new Date().toISOString() };
  const index = store.roommateProfiles.findIndex((p) => p.plan === plan);
  if (index >= 0) store.roommateProfiles[index] = record;
  else store.roommateProfiles.push(record);
  return record;
}

/** Registra un mensaje dirigido a un roommate. */
function sendMessage(roommateId, fromPlan, text) {
  const roommate = findById(roommateId);
  const message = { id: store.messages.length + 1, to: roommate.name, fromPlan, text, sentAt: new Date().toISOString() };
  store.messages.push(message);
  return { roommate, message };
}

module.exports = { search, findById, saveProfile, sendMessage };
