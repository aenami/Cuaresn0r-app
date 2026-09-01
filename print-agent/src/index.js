const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const backend = (process.env.POS_BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const clave = process.env.PRINT_AGENT_KEY;
const puerto = Number(process.env.PRINT_AGENT_PORT || 3001);
const intervalo = Number(process.env.PRINT_AGENT_POLL_MS || 3000);
const scriptImpresion = path.resolve(__dirname, '../scripts/print-raw.ps1');

if (!clave) {
  throw new Error('PRINT_AGENT_KEY es obligatoria');
}

let procesando = false;
let ultimoError = null;
let ultimoTrabajo = null;

async function llamarBackend(ruta, opciones = {}) {
  const respuesta = await fetch(`${backend}${ruta}`, {
    ...opciones,
    headers: {
      'content-type': 'application/json',
      'x-agent-key': clave,
      ...(opciones.headers || {}),
    },
  });
  if (!respuesta.ok) throw new Error(`Backend respondio ${respuesta.status}: ${await respuesta.text()}`);
  return respuesta.json();
}

function ejecutarPowerShell(argumentos) {
  return new Promise((resolve, reject) => {
    const proceso = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptImpresion, ...argumentos],
      { windowsHide: true },
    );
    let error = '';
    proceso.stderr.on('data', (datos) => {
      error += datos.toString();
    });
    proceso.on('error', reject);
    proceso.on('exit', (codigo) => {
      if (codigo === 0) resolve();
      else reject(new Error(error.trim() || `PowerShell termino con codigo ${codigo}`));
    });
  });
}

async function imprimir(trabajo) {
  if (!trabajo.impresora.dispositivo) {
    const error = new Error('La impresora no tiene configurado su nombre de dispositivo de Windows');
    error.reintentable = false;
    throw error;
  }

  const temporal = path.join(os.tmpdir(), `pos-ticket-${trabajo.id}-${Date.now()}.bin`);
  await fs.writeFile(temporal, Buffer.from(trabajo.contenidoBase64, 'base64'));
  try {
    await ejecutarPowerShell(['-PrinterName', trabajo.impresora.dispositivo, '-DataFile', temporal]);
  } finally {
    await fs.rm(temporal, { force: true });
  }
}

async function procesarSiguiente() {
  if (procesando) return;
  procesando = true;
  try {
    const trabajo = await llamarBackend('/printing/agent/reclamar', { method: 'POST', body: '{}' });
    if (!trabajo) return;
    ultimoTrabajo = trabajo.id;

    try {
      await imprimir(trabajo);
      await llamarBackend(`/printing/agent/trabajos/${trabajo.id}/resultado`, {
        method: 'POST',
        body: JSON.stringify({ token: trabajo.token, exitoso: true }),
      });
      ultimoError = null;
    } catch (error) {
      ultimoError = error instanceof Error ? error.message : String(error);
      await llamarBackend(`/printing/agent/trabajos/${trabajo.id}/resultado`, {
        method: 'POST',
        body: JSON.stringify({
          token: trabajo.token,
          exitoso: false,
          reintentable: error?.reintentable !== false,
          error: ultimoError.slice(0, 300),
        }),
      });
    }
  } catch (error) {
    ultimoError = error instanceof Error ? error.message : String(error);
  } finally {
    procesando = false;
  }
}

const servidor = http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') {
    return res.end(JSON.stringify({ ok: true, procesando, ultimoTrabajo, ultimoError }));
  }
  if (req.method === 'POST' && (req.url === '/sync' || req.url === '/print')) {
    void procesarSiguiente();
    res.statusCode = 202;
    return res.end(JSON.stringify({ ok: true, mensaje: 'Sincronizacion de impresion iniciada' }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ ok: false, mensaje: 'Ruta no encontrada' }));
});

servidor.listen(puerto, '127.0.0.1', () => {
  process.stdout.write(`Agente de impresion escuchando en http://localhost:${puerto}\n`);
});

setInterval(() => void procesarSiguiente(), intervalo).unref();
void procesarSiguiente();
