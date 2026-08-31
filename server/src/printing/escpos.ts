import * as iconv from 'iconv-lite';

// Constructor minimo de buffers ESC/POS (el protocolo de facto de las
// impresoras termicas de recibos). Texto codificado en CP850 para que las
// tildes y la eñe salgan bien en el papel.
export class EscPosBuilder {
  private readonly partes: Buffer[] = [];

  constructor(readonly columnas: number) {
    // ESC @ (reset) + ESC t 2 (codepage PC850 multilingue)
    this.raw(0x1b, 0x40);
    this.raw(0x1b, 0x74, 2);
  }

  private raw(...bytes: number[]) {
    this.partes.push(Buffer.from(bytes));
    return this;
  }

  texto(linea = '') {
    this.partes.push(iconv.encode(`${linea}\n`, 'cp850'));
    return this;
  }

  // Envuelve lineas largas respetando el ancho del papel, con sangria para
  // las lineas de continuacion.
  textoEnvuelto(linea: string, sangria = 0) {
    const ancho = this.columnas;
    const prefijo = ' '.repeat(sangria);
    let resto = linea;
    let primera = true;
    while (resto.length > 0) {
      const disponible = primera ? ancho : ancho - sangria;
      const corte = resto.length > disponible ? disponible : resto.length;
      this.texto((primera ? '' : prefijo) + resto.slice(0, corte));
      resto = resto.slice(corte);
      primera = false;
    }
    if (primera) this.texto('');
    return this;
  }

  centrar() {
    return this.raw(0x1b, 0x61, 1); // ESC a 1
  }

  izquierda() {
    return this.raw(0x1b, 0x61, 0); // ESC a 0
  }

  negrita(activa: boolean) {
    return this.raw(0x1b, 0x45, activa ? 1 : 0); // ESC E n
  }

  // GS ! n — 0x11 = doble ancho y doble alto, 0x00 = normal.
  tamanoDoble(activo: boolean) {
    return this.raw(0x1d, 0x21, activo ? 0x11 : 0x00);
  }

  separador() {
    return this.texto('-'.repeat(this.columnas));
  }

  avanzar(lineas: number) {
    return this.raw(0x1b, 0x64, lineas); // ESC d n
  }

  cortar() {
    return this.raw(0x1d, 0x56, 0x42, 0x03); // GS V 66 3 (corte parcial con avance)
  }

  build(): Buffer {
    return Buffer.concat(this.partes);
  }
}

// 80mm -> 48 columnas, 58mm -> 32 columnas.
export function columnasPorAncho(anchoPapelMm: number): number {
  return anchoPapelMm >= 80 ? 48 : 32;
}
