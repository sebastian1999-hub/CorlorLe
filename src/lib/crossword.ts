import { generateCrossword } from 'crossword-generator'

export type CrosswordDirection = 'across' | 'down'

export type CrosswordCell = {
  row: number
  col: number
  blocked: boolean
  solution: string | null
  number?: number
}

export type CrosswordClue = {
  number: number
  direction: CrosswordDirection
  clue: string
  answer: string
  row: number
  col: number
  length: number
}

export type CrosswordPuzzle = {
  dateKey: string
  size: number
  grid: CrosswordCell[][]
  cluesAcross: CrosswordClue[]
  cluesDown: CrosswordClue[]
}

type WordEntry = {
  word: string
  clue: string
}

type GridCell = {
  blocked: boolean
  letter: string | null
}

type LayoutInput = {
  clue: string
  answer: string
}

type LayoutResultEntry = {
  clue: string
  answer: string
  startx: number
  starty: number
  position: number
  orientation: 'across' | 'down' | 'none'
}

function isValidLayoutEntry(entry: LayoutResultEntry): boolean {
  const validOrientation = entry.orientation === 'across' || entry.orientation === 'down'
  if (!validOrientation) {
    return false
  }

  if (!Number.isFinite(entry.startx) || !Number.isFinite(entry.starty)) {
    return false
  }

  if (entry.startx < 1 || entry.starty < 1) {
    return false
  }

  if (!entry.answer || entry.answer.length < 3 || entry.answer.length > GRID_SIZE) {
    return false
  }

  return /^[A-Z]+$/.test(entry.answer)
}

const GRID_SIZE = 9
const MAX_GENERATION_MS = 120

const puzzleCache = new Map<string, CrosswordPuzzle>()

const WORDS: WordEntry[] = [
  // 3 letters
  { word: 'SOL', clue: 'Estrella del sistema solar' },
  { word: 'MAR', clue: 'Gran masa de agua salada' },
  { word: 'RED', clue: 'Conjunto de conexiones' },
  { word: 'LUZ', clue: 'Permite ver los objetos' },
  { word: 'RIO', clue: 'Corriente natural de agua' },
  { word: 'PAN', clue: 'Alimento comun de harina' },
  { word: 'VOZ', clue: 'Sonido emitido al hablar' },
  { word: 'PIE', clue: 'Parte del cuerpo para caminar' },
  { word: 'TIC', clue: 'Tecnologias de informacion y comunicacion' },
  { word: 'DIA', clue: 'Periodo de veinticuatro horas' },
  { word: 'ECO', clue: 'Repeticion de un sonido' },
  { word: 'LEY', clue: 'Norma obligatoria' },
  { word: 'ROL', clue: 'Funcion de un usuario en un sistema' },
  { word: 'GOL', clue: 'Punto en un partido de futbol' },
  { word: 'FIN', clue: 'Ultima parte de algo' },
  { word: 'OLA', clue: 'Movimiento del agua en el mar' },
  { word: 'MES', clue: 'Unidad de tiempo del calendario' },
  { word: 'OJO', clue: 'Organo para ver' },
  { word: 'AVE', clue: 'Animal con plumas y alas' },
  { word: 'ORO', clue: 'Metal precioso de color amarillo' },
  { word: 'SAL', clue: 'Condimento comun de cocina' },
  { word: 'UVA', clue: 'Fruta usada para hacer vino' },

  // 4 letters
  { word: 'LUNA', clue: 'Satelite natural de la Tierra' },
  { word: 'NUBE', clue: 'Conjunto de vapor en el cielo' },
  { word: 'ROJO', clue: 'Color del fuego' },
  { word: 'AZUL', clue: 'Color del cielo despejado' },
  { word: 'RUTA', clue: 'Camino planificado' },
  { word: 'TONO', clue: 'Matiz o variacion de color' },
  { word: 'CLAN', clue: 'Grupo unido por afinidad' },
  { word: 'AULA', clue: 'Sala donde se imparten clases' },
  { word: 'PILA', clue: 'Bateria pequena' },
  { word: 'IDEA', clue: 'Pensamiento o concepto mental' },
  { word: 'DATO', clue: 'Valor de informacion concreta' },
  { word: 'NODO', clue: 'Punto de conexion en una red' },
  { word: 'MENU', clue: 'Lista de opciones en pantalla' },
  { word: 'MODO', clue: 'Configuracion de funcionamiento' },
  { word: 'CITA', clue: 'Encuentro acordado entre personas' },
  { word: 'TEMA', clue: 'Asunto principal' },
  { word: 'META', clue: 'Objetivo final' },
  { word: 'AREA', clue: 'Superficie o campo de trabajo' },
  { word: 'BASE', clue: 'Fundamento de una estructura' },
  { word: 'CUBO', clue: 'Figura geometrica de seis caras iguales' },
  { word: 'BOLA', clue: 'Objeto de forma redonda' },
  { word: 'FOTO', clue: 'Imagen capturada por camara' },
  { word: 'MAPA', clue: 'Representacion grafica de un territorio' },
  { word: 'PICO', clue: 'Punta de una montana' },

  // 5 letters
  { word: 'COLOR', clue: 'Percepcion visual de la luz' },
  { word: 'PIXEL', clue: 'Unidad minima de una imagen digital' },
  { word: 'TEXTO', clue: 'Conjunto de palabras escritas' },
  { word: 'CLAVE', clue: 'Dato secreto de acceso' },
  { word: 'PISTA', clue: 'Ayuda para resolver algo' },
  { word: 'NIVEL', clue: 'Grado o categoria de dificultad' },
  { word: 'SERIE', clue: 'Conjunto ordenado de elementos' },
  { word: 'REGLA', clue: 'Instrumento para medir lineas' },
  { word: 'TRAZO', clue: 'Linea hecha al dibujar' },
  { word: 'CURSO', clue: 'Proceso de aprendizaje o formacion' },
  { word: 'RATON', clue: 'Dispositivo apuntador de la computadora' },
  { word: 'VIDEO', clue: 'Secuencia de imagenes en movimiento' },
  { word: 'AUDIO', clue: 'Contenido que se escucha' },
  { word: 'CLASE', clue: 'Sesion de ensenanza' },
  { word: 'PLANO', clue: 'Representacion simplificada de un espacio' },
  { word: 'GRUPO', clue: 'Conjunto de personas o elementos' },
  { word: 'PANEL', clue: 'Zona con controles o informacion' },
  { word: 'BOTON', clue: 'Elemento que se pulsa para ejecutar una accion' },
  { word: 'ICONO', clue: 'Simbolo grafico de una accion' },
  { word: 'NUEVO', clue: 'Que aparece por primera vez' },
  { word: 'VISTA', clue: 'Modo en que se muestra la informacion' },
  { word: 'FONDO', clue: 'Color o imagen de base' },
  { word: 'TRAMA', clue: 'Conjunto de lineas entrecruzadas' },
  { word: 'FICHA', clue: 'Pieza pequena de juego' },
  { word: 'JUEGO', clue: 'Actividad con reglas para divertirse' },
  { word: 'RANGO', clue: 'Intervalo entre limite inferior y superior' },
  { word: 'LAPIZ', clue: 'Herramienta para escribir o dibujar' },
  { word: 'TABLA', clue: 'Cuadro de filas y columnas' },
  { word: 'CURVA', clue: 'Linea que cambia de direccion' },
  { word: 'FLUJO', clue: 'Secuencia continua de pasos o datos' },
  { word: 'CABLE', clue: 'Conductor para transmitir energia o datos' },
  { word: 'FRASE', clue: 'Conjunto corto de palabras con sentido' },

  // 6 letters
  { word: 'BLANCO', clue: 'Color de la nieve' },
  { word: 'CODIGO', clue: 'Conjunto de instrucciones de un programa' },
  { word: 'TECLAS', clue: 'Botones de un teclado' },
  { word: 'MATRIZ', clue: 'Tabla rectangular de datos' },
  { word: 'OBJETO', clue: 'Elemento individual en programacion' },
  { word: 'GRAFIA', clue: 'Modo de representar letras o signos' },
  { word: 'JUEGOS', clue: 'Actividades de entretenimiento' },
  { word: 'ENIGMA', clue: 'Acertijo o problema dificil de resolver' },
  { word: 'LOGICA', clue: 'Razonamiento ordenado para resolver problemas' },
  { word: 'ESCENA', clue: 'Parte visual concreta de una representacion' },
  { word: 'PAGINA', clue: 'Documento visible dentro de un sitio web' },
  { word: 'MODULO', clue: 'Parte independiente de un sistema' },
  { word: 'RELATO', clue: 'Narracion breve de hechos' },
  { word: 'BLOQUE', clue: 'Seccion compacta de contenido' },
  { word: 'TABLAS', clue: 'Conjuntos de filas y columnas' },
  { word: 'ESTILO', clue: 'Conjunto de reglas visuales' },
  { word: 'FUENTE', clue: 'Tipo de letra usado en un texto' },
  { word: 'FILTRO', clue: 'Condicion para limitar resultados' },
  { word: 'LINEAS', clue: 'Trazos rectos o renglones de texto' },
  { word: 'FORMAS', clue: 'Figuras con contorno definido' },
  { word: 'SENSOR', clue: 'Dispositivo que detecta cambios' },
  { word: 'CAMBIO', clue: 'Variacion de estado' },
  { word: 'CLAVES', clue: 'Datos secretos de acceso' },
  { word: 'IMAGEN', clue: 'Representacion visual' },
  { word: 'EDITOR', clue: 'Herramienta para modificar contenido' },
  { word: 'RAPIDO', clue: 'Que sucede con velocidad' },
  { word: 'SIGNOS', clue: 'Simbolos con significado' },
  { word: 'MARCOS', clue: 'Bordes que delimitan una zona' },
  { word: 'VECTOR', clue: 'Elemento con direccion y magnitud' },
  { word: 'ENLACE', clue: 'Vinculo hacia otro contenido' },
  { word: 'CAMARA', clue: 'Dispositivo para capturar imagen' },
  { word: 'MUSICA', clue: 'Combinacion de sonidos ritmicos' },
  { word: 'TACTIL', clue: 'Que responde al contacto del dedo' },

  // 7 letters
  { word: 'TABLERO', clue: 'Superficie donde se colocan las casillas del juego' },
  { word: 'VENTANA', clue: 'Marco visual de una aplicacion' },
  { word: 'ARCHIVO', clue: 'Documento guardado en el sistema' },
  { word: 'USUARIO', clue: 'Persona que utiliza la aplicacion' },
  { word: 'SISTEMA', clue: 'Conjunto de elementos que cooperan' },
  { word: 'FUNCION', clue: 'Bloque de codigo que realiza una tarea' },
  { word: 'PUNTAJE', clue: 'Resultado numerico en un juego' },
  { word: 'DESAFIO', clue: 'Reto que requiere habilidad' },
  { word: 'RECURSO', clue: 'Elemento util para completar una tarea' },
  { word: 'MEMORIA', clue: 'Capacidad para almacenar informacion' },
  { word: 'SECCION', clue: 'Parte de un documento o interfaz' },
  { word: 'EQUIPOS', clue: 'Conjuntos de personas organizadas' },
  { word: 'OBJETOS', clue: 'Elementos individuales de un conjunto' },
  { word: 'TECLADO', clue: 'Dispositivo con teclas para escribir' },
  { word: 'CONTROL', clue: 'Mando para gestionar una accion' },
  { word: 'MOSAICO', clue: 'Composicion hecha con piezas pequenas' },
  { word: 'TERMINO', clue: 'Palabra de significado especifico' },
  { word: 'RESPETO', clue: 'Consideracion por reglas o personas' },
  { word: 'NAVEGAR', clue: 'Recorrer paginas en internet' },
  { word: 'LECTURA', clue: 'Accion de interpretar un texto' },
  { word: 'ESCRITO', clue: 'Contenido expresado con palabras' },
  { word: 'PALABRA', clue: 'Unidad basica de un texto' },
  { word: 'ORACION', clue: 'Conjunto de palabras con sentido completo' },
  { word: 'DETALLE', clue: 'Parte pequena pero importante' },
  { word: 'CARPETA', clue: 'Directorio para agrupar archivos' },
  { word: 'ESTUDIO', clue: 'Proceso dedicado a aprender' },
  { word: 'SEMANAL', clue: 'Que ocurre cada semana' },

  // 8 letters
  { word: 'PANTALLA', clue: 'Superficie donde se muestra la imagen' },
  { word: 'VARIABLE', clue: 'Dato cuyo valor puede cambiar' },
  { word: 'DESCUBRE', clue: 'Encuentra algo oculto' },
  { word: 'MEMORIAS', clue: 'Capacidades para recordar' },
  { word: 'PROGRAMA', clue: 'Conjunto de instrucciones que ejecuta un equipo' },
  { word: 'MAQUINAS', clue: 'Equipos con piezas para realizar tareas' },
  { word: 'PROYECTO', clue: 'Trabajo planificado con objetivo claro' },
  { word: 'INTERFAZ', clue: 'Zona de interaccion con el usuario' },
  { word: 'TECLADOS', clue: 'Dispositivos con teclas' },
  { word: 'PREGUNTA', clue: 'Frase que solicita una respuesta' },
  { word: 'RESPONDE', clue: 'Accion de contestar' },
  { word: 'CUADERNO', clue: 'Libro para tomar apuntes' },
  { word: 'PRACTICA', clue: 'Ejercicio para mejorar habilidad' },
  { word: 'PALABRAS', clue: 'Unidades de texto con significado' },
  { word: 'TERMINAL', clue: 'Consola para ejecutar comandos' },
  { word: 'REGISTRO', clue: 'Anotacion de un evento' },
  { word: 'LISTADOS', clue: 'Conjuntos de elementos en lista' },
  { word: 'TABLEROS', clue: 'Superficies de juego con casillas' },
  { word: 'COMENTAR', clue: 'Agregar una observacion al codigo' },
  { word: 'CREATIVO', clue: 'Con capacidad para ideas originales' },

  // 9 letters
  { word: 'ALGORITMO', clue: 'Secuencia ordenada de pasos para resolver un problema' },
  { word: 'BIBLIOTECA', clue: 'Coleccion organizada de libros o recursos' },
  { word: 'DIRECTORIO', clue: 'Carpeta que agrupa archivos' },
  { word: 'NAVEGADOR', clue: 'Programa para visitar paginas web' },
  { word: 'SEGURIDAD', clue: 'Proteccion frente a riesgos o accesos indebidos' },
  { word: 'RESPUESTA', clue: 'Contestacion a una pregunta' },
  { word: 'CONTENIDO', clue: 'Informacion principal de una publicacion' },
  { word: 'COMPUTADOR', clue: 'Maquina electronica que procesa datos' },
  { word: 'PRACTICAS', clue: 'Actividades para mejorar una habilidad' },
  { word: 'EDUCACION', clue: 'Proceso de aprendizaje y formacion' },
  { word: 'EJERCICIO', clue: 'Actividad para entrenar o practicar' },
  { word: 'FRECUENTE', clue: 'Que sucede muchas veces' },
  { word: 'CATEGORIA', clue: 'Clase o tipo dentro de una clasificacion' },
  { word: 'CONECTADO', clue: 'Unido a una red o servicio' },
  { word: 'ORDENADOR', clue: 'Equipo informatico de uso personal' },
  { word: 'SECCIONES', clue: 'Partes en que se divide un contenido' },
  { word: 'PUNTUAJES', clue: 'Resultados numericos de varios intentos' },
  { word: 'OBJETIVOS', clue: 'Metas que se quieren alcanzar' },
  { word: 'USABILIDAD', clue: 'Facilidad de uso de una interfaz' },
  { word: 'MOVILIDAD', clue: 'Capacidad de uso en dispositivos moviles' },
]

function hashDate(dateKey: string): number {
  let hash = 2166136261
  for (let i = 0; i < dateKey.length; i += 1) {
    hash ^= dateKey.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createRng(seed: number): () => number {
  let t = seed + 0x6d2b79f5
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}

function createEmptyGrid(size: number): GridCell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      blocked: true,
      letter: null,
    })),
  )
}

function withSeededMathRandom<T>(seed: number, work: () => T): T {
  const originalRandom = Math.random
  const seededRandom = createRng(seed)
  Math.random = seededRandom
  try {
    return work()
  } finally {
    Math.random = originalRandom
  }
}

function withSilencedConsole<T>(work: () => T): T {
  const originalLog = console.log
  console.log = () => {}
  try {
    return work()
  } finally {
    console.log = originalLog
  }
}

function normalizeAnswer(word: string): string {
  return word
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z]/g, '')
}

function getBounds(entries: LayoutResultEntry[]): { minRow: number; minCol: number; height: number; width: number } {
  let minRow = Number.POSITIVE_INFINITY
  let minCol = Number.POSITIVE_INFINITY
  let maxRow = Number.NEGATIVE_INFINITY
  let maxCol = Number.NEGATIVE_INFINITY

  for (const entry of entries) {
    if (entry.orientation === 'none') {
      continue
    }

    const startRow = entry.starty - 1
    const startCol = entry.startx - 1
    const len = entry.answer.length
    const endRow = entry.orientation === 'down' ? startRow + len - 1 : startRow
    const endCol = entry.orientation === 'across' ? startCol + len - 1 : startCol

    minRow = Math.min(minRow, startRow)
    minCol = Math.min(minCol, startCol)
    maxRow = Math.max(maxRow, endRow)
    maxCol = Math.max(maxCol, endCol)
  }

  if (!Number.isFinite(minRow) || !Number.isFinite(minCol)) {
    return { minRow: 0, minCol: 0, height: 0, width: 0 }
  }

  return {
    minRow,
    minCol,
    height: maxRow - minRow + 1,
    width: maxCol - minCol + 1,
  }
}

function getLayoutStats(entries: LayoutResultEntry[]): {
  placedCount: number
  acrossCount: number
  downCount: number
  filledCells: number
  intersections: number
  boundsArea: number
  density: number
} {
  const bounds = getBounds(entries)
  const occupied = new Set<string>()
  let intersections = 0

  for (const entry of entries) {
    if (entry.orientation === 'none') {
      continue
    }
    const startRow = entry.starty - 1
    const startCol = entry.startx - 1
    for (let i = 0; i < entry.answer.length; i += 1) {
      const row = entry.orientation === 'down' ? startRow + i : startRow
      const col = entry.orientation === 'across' ? startCol + i : startCol
      const key = `${row}-${col}`
      if (occupied.has(key)) {
        intersections += 1
      } else {
        occupied.add(key)
      }
    }
  }

  const placedCount = entries.length
  const acrossCount = entries.filter((entry) => entry.orientation === 'across').length
  const downCount = entries.filter((entry) => entry.orientation === 'down').length
  const filledCells = occupied.size
  const boundsArea = bounds.height * bounds.width
  const density = boundsArea > 0 ? filledCells / boundsArea : 0

  return {
    placedCount,
    acrossCount,
    downCount,
    filledCells,
    intersections,
    boundsArea,
    density,
  }
}

function scoreLayout(entries: LayoutResultEntry[]): number {
  const stats = getLayoutStats(entries)
  return (
    stats.placedCount * 40 +
    stats.filledCells * 5 +
    stats.intersections * 35 +
    stats.density * 180 -
    stats.boundsArea
  )
}

function tryGenerateLayout(dateKey: string): LayoutResultEntry[] | null {
  const seed = hashDate(dateKey)
  const rng = createRng(seed)
  const startTs = Date.now()

  const cleanedWords = WORDS.map((entry) => ({
    answer: normalizeAnswer(entry.word),
    clue: entry.clue,
  })).filter((entry) => entry.answer.length >= 3 && entry.answer.length <= GRID_SIZE)

  const unique = new Map<string, LayoutInput>()
  for (const entry of cleanedWords) {
    if (!unique.has(entry.answer)) {
      unique.set(entry.answer, entry)
    }
  }
  const dictionary = [...unique.values()]

  let bestCandidate: LayoutResultEntry[] | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (let count = Math.min(24, dictionary.length); count >= 10; count -= 1) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (Date.now() - startTs > MAX_GENERATION_MS) {
        return bestCandidate
      }

      const shuffled = shuffle(dictionary, rng)
      const selected = shuffled.slice(0, count)

      const clueByAnswer = new Map<string, string>()
      for (const entry of selected) {
        clueByAnswer.set(entry.answer, entry.clue)
      }

      let placed: LayoutResultEntry[] = []
      try {
        const crossword = withSeededMathRandom(seed + count * 997 + attempt * 37, () =>
          withSilencedConsole(() =>
            generateCrossword(
              selected.map((entry) => entry.answer),
              {
                wordCount: Math.min(count, 16),
                maxGridSize: GRID_SIZE,
                maxAttempts: 90,
                validationLevel: 'normal',
                minWordLength: 3,
                maxWordLength: GRID_SIZE,
              },
            ),
          ),
        )

        placed = crossword.placedWords
          .map<LayoutResultEntry>((word, index) => {
            const orientation: LayoutResultEntry['orientation'] = word.direction === 'horizontal' ? 'across' : 'down'
            return {
              clue: clueByAnswer.get(word.word) ?? `Definicion de ${word.word}`,
              answer: word.word,
              startx: word.startCol + 1,
              starty: word.startRow + 1,
              position: index + 1,
              orientation,
            }
          })
          .filter((entry) => isValidLayoutEntry(entry))
      } catch {
        continue
      }

      if (placed.length < 8) {
        continue
      }

      const stats = getLayoutStats(placed)
      if (stats.acrossCount < 4 || stats.downCount < 3) {
        continue
      }

      if (stats.filledCells < 32) {
        continue
      }

      const bounds = getBounds(placed)
      if (bounds.height <= GRID_SIZE && bounds.width <= GRID_SIZE) {
        const score = scoreLayout(placed)
        if (score > bestScore) {
          bestScore = score
          bestCandidate = placed

          // Early exit once we have a strong layout to avoid freezing navigation.
          if (stats.placedCount >= 10 && stats.acrossCount >= 5 && stats.downCount >= 4 && stats.filledCells >= 36) {
            return bestCandidate
          }
        }
      }
    }
  }

  return bestCandidate
}

function sortByRowCol(a: CrosswordClue, b: CrosswordClue): number {
  if (a.number !== b.number) {
    return a.number - b.number
  }
  if (a.row !== b.row) {
    return a.row - b.row
  }
  return a.col - b.col
}

function buildPuzzleFromLayout(dateKey: string, entries: LayoutResultEntry[]): CrosswordPuzzle {
  const bounds = getBounds(entries)
  const size = GRID_SIZE
  const grid = createEmptyGrid(size)
  const placementByStart = new Map<string, LayoutResultEntry[]>()
  const rowOffset = Math.floor((GRID_SIZE - bounds.height) / 2)
  const colOffset = Math.floor((GRID_SIZE - bounds.width) / 2)

  for (const entry of entries) {
    const startRow = entry.starty - 1 - bounds.minRow + rowOffset
    const startCol = entry.startx - 1 - bounds.minCol + colOffset
    if (!Number.isFinite(startRow) || !Number.isFinite(startCol)) {
      continue
    }

    if (startRow < 0 || startCol < 0) {
      continue
    }

    let canPlaceEntireWord = true
    for (let i = 0; i < entry.answer.length; i += 1) {
      const row = entry.orientation === 'down' ? startRow + i : startRow
      const col = entry.orientation === 'across' ? startCol + i : startCol
      if (row < 0 || row >= size || col < 0 || col >= size) {
        canPlaceEntireWord = false
        break
      }
    }

    if (!canPlaceEntireWord) {
      continue
    }

    for (let i = 0; i < entry.answer.length; i += 1) {
      const row = entry.orientation === 'down' ? startRow + i : startRow
      const col = entry.orientation === 'across' ? startCol + i : startCol
      grid[row][col].blocked = false
      grid[row][col].letter = entry.answer[i]
    }

    const key = `${startRow}-${startCol}`
    const existing = placementByStart.get(key) ?? []
    existing.push({
      ...entry,
      startx: startCol + 1,
      starty: startRow + 1,
    })
    placementByStart.set(key, existing)
  }

  const numbering = new Map<string, number>()
  let number = 1

  const orderedStartKeys = [...placementByStart.keys()].sort((a, b) => {
    const [rowA, colA] = a.split('-').map(Number)
    const [rowB, colB] = b.split('-').map(Number)
    if (rowA !== rowB) {
      return rowA - rowB
    }
    return colA - colB
  })

  for (const startKey of orderedStartKeys) {
    numbering.set(startKey, number)
    number += 1
  }

  const cluesAcross: CrosswordClue[] = []
  const cluesDown: CrosswordClue[] = []

  for (const placements of placementByStart.values()) {
    for (const entry of placements) {
      const row = entry.starty - 1
      const col = entry.startx - 1
      const startKey = `${row}-${col}`
      const slotNumber = numbering.get(startKey)

      if (!slotNumber) {
        continue
      }

      const clue: CrosswordClue = {
        number: slotNumber,
        direction: entry.orientation === 'across' ? 'across' : 'down',
        clue: entry.clue,
        answer: entry.answer,
        row,
        col,
        length: entry.answer.length,
      }

      if (entry.orientation === 'across') {
        cluesAcross.push(clue)
      } else if (entry.orientation === 'down') {
        cluesDown.push(clue)
      }
    }
  }

  cluesAcross.sort(sortByRowCol)
  cluesDown.sort(sortByRowCol)

  const uiGrid: CrosswordCell[][] = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      const key = `${row}-${col}`
      return {
        row,
        col,
        blocked: grid[row][col].blocked,
        solution: grid[row][col].blocked ? null : grid[row][col].letter,
        number: numbering.get(key),
      }
    }),
  )

  return {
    dateKey,
    size,
    grid: uiGrid,
    cluesAcross,
    cluesDown,
  }
}

export function buildDailyCrossword(dateKey: string): CrosswordPuzzle {
  const cached = puzzleCache.get(dateKey)
  if (cached) {
    return cached
  }

  const layout = tryGenerateLayout(dateKey)
  if (layout) {
    const puzzle = buildPuzzleFromLayout(dateKey, layout)
    puzzleCache.set(dateKey, puzzle)
    return puzzle
  }

  const fallbackGrid = createEmptyGrid(GRID_SIZE)
  const fallbackPuzzle: CrosswordPuzzle = {
    dateKey,
    size: GRID_SIZE,
    grid: fallbackGrid.map((row, rowIndex) =>
      row.map((cell, colIndex) => ({
        row: rowIndex,
        col: colIndex,
        blocked: cell.blocked,
        solution: null,
      })),
    ),
    cluesAcross: [],
    cluesDown: [],
  }

  puzzleCache.set(dateKey, fallbackPuzzle)
  return fallbackPuzzle
}
