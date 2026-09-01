# Agente local de impresion

Servicio para el computador de caja. Reclama la cola persistente del backend y
envia los bytes ESC/POS a la cola USB de Windows mediante `WritePrinter` RAW.

1. Instalar el controlador Epson APD y comprobar el nombre de cada cola con
   `Get-Printer`.
2. Configurar ese nombre en el modulo Impresoras del POS.
3. Definir `POS_BACKEND_URL`, `PRINT_AGENT_KEY`, `PRINT_AGENT_PORT` y
   `PRINT_AGENT_POLL_MS` como variables de entorno del usuario de Windows.
4. Ejecutar como administrador:
   `powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1`.

El agente escucha solo en `127.0.0.1:3001`. Tanto `/sync` como `/print`
despiertan la cola inmediatamente; ademas existe sondeo automatico cada tres
segundos. Los errores temporales (apagada, sin papel, desconectada) vuelven a
la cola con espera exponencial.
