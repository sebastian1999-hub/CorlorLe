declare module 'crossword-layout-generator' {
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

  type LayoutResult = {
    rows: number
    cols: number
    result: LayoutResultEntry[]
  }

  const crosswordLayoutGenerator: {
    generateLayout: (entries: LayoutInput[]) => LayoutResult
  }

  export default crosswordLayoutGenerator
}
