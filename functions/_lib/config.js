// Configuración del negocio. El dueño puede editar servicios, precios y horarios aquí.

export const config = {
  business: {
    name: 'Chivas Barbería',
    address: 'Pedro Lozano 4372',
    instagram: 'https://www.instagram.com/chivas.barber',
    instagramHandle: '@chivas.barber',
  },

  timezone: 'America/Argentina/Buenos_Aires',

  // Seña mínima obligatoria para reservar (en pesos). Se valida siempre en el servidor.
  depositAmount: 1000,

  // Los turnos arrancan cada N minutos.
  slotStepMin: 30,
  // Cuántos clientes se pueden atender a la vez (cantidad de barberos/sillones).
  capacity: 1,
  // Minutos que se reserva un turno mientras el cliente paga.
  holdMinutes: 15,
  // Anticipación mínima para reservar (minutos) y días hacia adelante.
  leadMinutes: 30,
  daysAhead: 30,

  // Horarios por día de la semana (0 = domingo ... 6 = sábado). null = cerrado.
  hours: {
    0: null,
    1: ['10:00', '20:00'],
    2: ['10:00', '20:00'],
    3: ['10:00', '20:00'],
    4: ['10:00', '20:00'],
    5: ['10:00', '20:00'],
    6: ['10:00', '20:00'],
  },

  // Sellos de la tarjeta de fidelidad: al completar N cortes, el siguiente es gratis.
  loyaltyStamps: 7,

  // Servicios (precios y descripciones de ejemplo: editar a los reales).
  services: [
    {
      id: 'corte-clasico',
      name: 'Corte clásico',
      price: 8000,
      duration: 45,
      short: 'Corte a tijera o máquina, a tu estilo.',
      description:
        'Corte a tijera o máquina según lo que busques. Incluye lavado, peinado y terminación con producto. Asesoramiento para elegir el corte que mejor te quede.',
    },
    {
      id: 'degrade',
      name: 'Degradé / Fade',
      price: 9000,
      duration: 45,
      short: 'Degradé prolijo, bajo, medio o alto.',
      description:
        'Degradé bajo, medio o alto con transición pareja y detalle de contorno. Incluye lavado, peinado y terminación con producto.',
    },
    {
      id: 'barba',
      name: 'Barba',
      price: 5000,
      duration: 30,
      short: 'Perfilado y arreglo de barba.',
      description:
        'Arreglo y perfilado de barba con máquina y navaja. Toalla caliente, hidratación y aceite para que quede prolija y suave.',
    },
    {
      id: 'corte-barba',
      name: 'Corte + Barba',
      price: 12000,
      duration: 60,
      short: 'El combo completo.',
      description:
        'Corte a elección (clásico o degradé) más arreglo de barba con navaja y toalla caliente. La opción completa para salir impecable.',
    },
    {
      id: 'corte-ninos',
      name: 'Corte niños',
      price: 7000,
      duration: 30,
      short: 'Para los más chicos (hasta 12 años).',
      description:
        'Corte para chicos hasta 12 años, con paciencia y buena onda. Incluye peinado y terminación.',
    },
    {
      id: 'cejas',
      name: 'Perfilado de cejas',
      price: 2000,
      duration: 15,
      short: 'Detalle rápido para completar tu look.',
      description:
        'Perfilado de cejas con navaja o pinza, para sumar a cualquier servicio o hacerlo por separado.',
    },
  ],
};

export function getService(id) {
  return config.services.find((s) => s.id === id);
}
