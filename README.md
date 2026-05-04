# Color Memory Arena

MVP de juego diario competitivo de memoria de color con React + Tailwind + Supabase.

## Funcionalidades implementadas

- Autenticacion con Supabase Auth (login y registro).
- Reto diario con color objetivo determinista generado por fecha (seed compartida).
- Flujo completo:
  - leaderboard del dia
  - boton de reto diario (deshabilitado si ya jugaste)
  - seleccion de dificultad
  - vista previa temporal del color
  - selector HSV con preview en tiempo real
  - resultado final (objetivo vs elegido, error, tiempo, score)
- Persistencia de intentos en Supabase.
- Restriccion backend de 1 intento por usuario por dia (unique constraint).

## Stack

- Frontend: React + TypeScript + Vite
- Estilos: TailwindCSS
- Backend: Supabase (Auth + Postgres)

## Configuracion

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo `.env` desde `.env.example`:

```bash
cp .env.example .env
```

3. Define las variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

4. Ejecuta el SQL de [supabase/schema.sql](supabase/schema.sql) en tu proyecto Supabase (SQL Editor).

5. Lanza la app:

```bash
npm run dev
```

## Cargar usuarios de prueba

Se incluye el script [scripts/create-test-users.mjs](scripts/create-test-users.mjs) para crear estos usuarios:

- Irene
- Natalia
- Alejandro
- Pablo
- Raul
- Lucas
- Sebas
- Alvaro
- Admin

Pasos:

1. Agrega en tu `.env` la variable `SUPABASE_SERVICE_ROLE_KEY`.
2. Opcional: define `TEST_USERS_DEFAULT_PASSWORD` (si no, usa `ColorMemory123!`).
3. Ejecuta:

```bash
npm run seed:test-users
```

La pantalla de autenticacion quedo en modo solo login para pruebas (registro desactivado).

## Modelo de datos

Tabla principal: `attempts`

- `id`
- `user_id`
- `date`
- `difficulty`
- `target_color`
- `user_color`
- `error`
- `time`
- `score`

Restriccion clave:

- `unique (user_id, date)` para impedir intentos multiples diarios.

Tabla auxiliar: `profiles`

- `id` (referencia a `auth.users`)
- `username` (para leaderboard)

## Scoring

El score considera precision y velocidad:

- `error`: distancia RGB normalizada a porcentaje
- `accuracy = 100 - error`
- base = `accuracy * 10 + bonus_por_tiempo`
- multiplicador por dificultad:
  - easy: x1.0
  - medium: x1.5
  - hard: x2.2

## Estructura principal

- `src/App.tsx`: orquestacion del flujo completo y estados principales.
- `src/components/*`: auth, selector de dificultad, HSV picker y leaderboard.
- `src/lib/dailyChallenge.ts`: seed diaria y color objetivo por fecha.
- `src/lib/colorMath.ts`: conversiones HSV/RGB/HEX y error de color.
- `src/lib/scoring.ts`: preview por dificultad y formula de score.
- `src/lib/supabase.ts`: cliente Supabase.
- `supabase/schema.sql`: tablas, indices, RLS y politicas.
