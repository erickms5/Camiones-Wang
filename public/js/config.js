// Decisiones abiertas del documento de requisitos (sección 3.2).
// Se cambian aquí sin tocar el resto del código.
export const CONFIG = {
  kmPor: 'cabezal',            // D1: el km pertenece al cabezal (donde está el odómetro)
  conductorObligatorio: false, // D2: el conductor se puede registrar después
  cedulaObligatoria: true,     // D3: la cédula se pide al registrar un conductor
  tanqueComoUnidad: false,     // D4: el tanque es atributo del remolque, con placa propia opcional
  placaUnica: 'global',        // D5: la placa no se puede repetir
  maxCompartimentos: 10,
  maxGalonesCompartimento: 50000,
  kmAdvertencia: 2000000,
  anioMin: 1980,
};

export const DECISIONES = [
  { id: 'D1', pregunta: '¿El km se maneja por cabezal o por conjunto completo?', prototipo: 'Por cabezal. El remolque usa el km del cabezal al que está acoplado.' },
  { id: 'D2', pregunta: '¿El conductor es obligatorio o se puede registrar después?', prototipo: 'Se puede registrar después, con un recordatorio en la pantalla principal.' },
  { id: 'D3', pregunta: '¿La cédula es indispensable o bastan nombre y teléfono?', prototipo: 'Se pide la cédula y se muestra enmascarada (ej. 17******65).' },
  { id: 'D4', pregunta: '¿El tanque se registra como unidad aparte o como atributo del remolque?', prototipo: 'Atributo del remolque, con campo para su placa propia.' },
  { id: 'D5', pregunta: '¿La placa debe ser única globalmente o por cuenta?', prototipo: 'Única. Se avisa si ya existe.' },
];
