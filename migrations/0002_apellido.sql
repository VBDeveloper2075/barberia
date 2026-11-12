-- Separa el apellido del nombre.
-- Hasta ahora "name" guardaba "Nombre Apellido" en un solo campo.

ALTER TABLE bookings ADD COLUMN last_name TEXT NOT NULL DEFAULT '';

-- Turnos ya existentes: la primera palabra queda como nombre y el resto como apellido.
UPDATE bookings
SET last_name = trim(substr(name, instr(name, ' ') + 1)),
    name = substr(name, 1, instr(name, ' ') - 1)
WHERE last_name = '' AND instr(name, ' ') > 0;
