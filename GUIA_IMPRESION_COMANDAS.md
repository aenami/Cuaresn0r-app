# Guía de instalación — impresión de comandas y facturas en Windows

Esta guía deja operativo el recorrido completo:

```text
POS web -> servidor NestJS -> cola persistente PostgreSQL
        -> agente local de Windows -> cola Epson -> impresora USB
```

El procedimiento está pensado para el computador de caja y sus dos impresoras
USB: una para facturas en caja y la Epson TM-m30II compartida por cocina y barra.

## 1. Requisitos

- Windows 10 u 11 en el computador de caja.
- Node.js 20 o superior instalado.
- Servidor del POS y PostgreSQL funcionando.
- Ambas impresoras conectadas por USB, encendidas y con papel.
- Controlador Epson APD instalado para la TM-m30II de preparación; instalar
  también el controlador correspondiente al modelo de caja.
- Acceso de administrador al POS y a Windows.

Comprobar Node.js:

```powershell
node --version
```

La versión debe comenzar por `v20` o una superior.

## 2. Instalar y comprobar la impresora en Windows

1. Instalar Epson Advanced Printer Driver 6 (`APD_612_m30II_WM.exe`) para la
   TM-m30II de preparación y el controlador de la impresora de caja según su
   modelo exacto.
2. Conectar ambas por USB y esperar a que Windows cree dos colas distintas.
3. Abrir **Configuración > Bluetooth y dispositivos > Impresoras y
   escáneres** y confirmar que aparecen las dos.
4. Darles nombres inequívocos, por ejemplo:

   ```text
   EPSON TM-m30II COCINA-BARRA
   TERMICA CAJA
   ```

5. Imprimir una página de prueba en cada una desde Windows para comprobar los
   controladores y cables USB.

Obtener el nombre exacto que deberá registrarse en el POS:

```powershell
Get-Printer |
  Select-Object Name, DriverName, PortName, PrinterStatus |
  Format-Table -AutoSize
```

El valor `Name` de cada cola debe copiarse sin abreviarlo ni modificarlo. No
asumir que la impresora de caja tiene el mismo modelo que la de preparación.

## 3. Crear la clave del agente

El agente y el backend se autentican con la misma clave privada. Para el
despliegue actual, **reutilizar la `PRINT_AGENT_KEY` ya guardada en Render**:
no generar una nueva solo para el computador de caja. Si se instala un entorno
nuevo y aun no existe clave, generarla en PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$claveAgente = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
$rng.Dispose()
$claveAgente
```

Copiar temporalmente el resultado. No guardar la clave en este documento ni
subirla a Git.

## 4. Comprobar la clave del servidor

El backend desplegado ya tiene `PRINT_AGENT_KEY` configurada en Render. No
cambiarla salvo que tambien se actualice la variable del computador de caja.
Despues de configurar Windows en el paso siguiente, verificar la comunicacion:

```powershell
$clave = [Environment]::GetEnvironmentVariable('PRINT_AGENT_KEY', 'User')
Invoke-RestMethod `
  -Uri 'https://cuaresnor-pos-api.onrender.com/printing/agent/health' `
  -Headers @{ 'x-agent-key' = $clave }
```

La respuesta esperada es `{"ok":true}`. Si se trabaja con un backend local
en lugar de Render, agregar la misma clave a `server/.env`:

```env
PRINT_AGENT_KEY=pegar-aqui-la-clave-generada
```

Reiniciar NestJS local para que lea la variable. No agregar comillas ni
espacios alrededor del valor en `server/.env`:

```powershell
cd C:\Users\ASUS\Desktop\Proyectos\Cuaresn0r-app\server
pnpm start:dev
```

En el entorno local, sustituir la URL de Render del comando anterior por
`http://localhost:3000`.

## 5. Configurar las variables de Windows

Ejecutar desde la cuenta de Windows que se usará diariamente en caja. Sustituir
el valor de la clave por la que ya esta en Render (o la generada para un entorno
nuevo en el paso 3):

```powershell
[Environment]::SetEnvironmentVariable(
  'PRINT_AGENT_KEY',
  'pegar-aqui-la-clave-generada',
  'User'
)

[Environment]::SetEnvironmentVariable(
  'POS_BACKEND_URL',
  'https://cuaresnor-pos-api.onrender.com',
  'User'
)

[Environment]::SetEnvironmentVariable(
  'PRINT_AGENT_PORT',
  '3001',
  'User'
)

[Environment]::SetEnvironmentVariable(
  'PRINT_AGENT_POLL_MS',
  '3000',
  'User'
)
```

Cerrar y volver a abrir PowerShell para que la nueva sesión reciba las
variables. Confirmar su presencia sin mostrar la clave:

```powershell
[pscustomobject]@{
  Backend = $env:POS_BACKEND_URL
  ClaveConfigurada = [bool]$env:PRINT_AGENT_KEY
  Puerto = $env:PRINT_AGENT_PORT
  SondeoMs = $env:PRINT_AGENT_POLL_MS
}
```

Resultado esperado:

```text
Backend           : https://cuaresnor-pos-api.onrender.com
ClaveConfigurada  : True
Puerto            : 3001
SondeoMs          : 3000
```

Usar la URL real de Render, sin barra final. `http://localhost:3000` solo
corresponde a pruebas en las que el backend tambien se ejecuta localmente.

## 6. Probar el agente manualmente

Antes de instalar el inicio automático, ejecutar:

```powershell
cd C:\Users\ASUS\Desktop\Proyectos\Cuaresn0r-app\print-agent
node .\src\index.js
```

Debe mostrar:

```text
Agente de impresion escuchando en http://localhost:3001
```

Sin cerrar esa ventana, comprobar desde otra:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health
```

La respuesta debe contener:

```json
{
  "ok": true,
  "procesando": false,
  "ultimoTrabajo": null,
  "ultimoError": null
}
```

Detener la ejecución manual con `Ctrl+C` antes de instalar la tarea automática.

## 7. Instalar el inicio automático

Abrir PowerShell **como administrador**, desde la misma cuenta de Windows que
operará la caja, y ejecutar:

```powershell
cd C:\Users\ASUS\Desktop\Proyectos\Cuaresn0r-app\print-agent
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

La instalación crea e inicia la tarea programada `POS Print Agent`. Verificarla:

```powershell
$tarea = Get-ScheduledTask -TaskName 'POS Print Agent'
$info = $tarea | Get-ScheduledTaskInfo

[pscustomobject]@{
  Tarea = $tarea.TaskName
  Estado = $tarea.State
  UltimaEjecucion = $info.LastRunTime
  UltimoResultado = $info.LastTaskResult
}
```

Comprobar nuevamente:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health
```

Si se cambia cualquier variable posteriormente, reiniciar la tarea:

```powershell
Stop-ScheduledTask -TaskName 'POS Print Agent'
Start-ScheduledTask -TaskName 'POS Print Agent'
```

## 8. Registrar la impresora en el POS

1. Iniciar sesión como administrador y abrir **Impresoras**.
2. Crear la impresora `Cocina y barra` con destino **Cocina y barra
   (compartida)**, nombre exacto de la cola de preparación y ancho real de
   papel (80 o 58 mm).
3. Crear la impresora `Caja` con destino **Caja (facturas)**, nombre exacto de
   la otra cola de Windows y su ancho real de papel.
4. Confirmar que ambas queden activas. El sistema permite una impresora activa
   por destino: activar otra del mismo destino desactiva la anterior.

`GENERAL` recibe dos tickets independientes cuando una comanda contiene
productos de cocina y de barra. `CAJA` recibe exclusivamente las facturas.
Si falta la impresora de caja activa, el POS mostrará un error al intentar
imprimir una factura: nunca la enviará a cocina/barra.

## 9. Imprimir el ticket de prueba

En **Impresoras**, pulsar **Imprimir prueba** por separado para las dos colas.
La respuesta de la interfaz confirma que cada ticket entró a la cola; la
confirmación física es que salga el papel de la impresora correspondiente.

Si no sale, consultar el agente:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health |
  Format-List
```

`ultimoTrabajo` debe mostrar el identificador reclamado y `ultimoError` debe
estar vacío después de una impresión correcta.

## 10. Prueba completa con una comanda

Preparar datos de prueba en el POS:

- Un producto cuya categoría tenga destino `COCINA`.
- Un producto cuya categoría tenga destino `BARRA`.
- Una indicación o personalización, para verificar su formato.
- Un pedido local con ficha asignada.

Procedimiento:

1. Crear el pedido y agregar ambos productos.
2. Pagarlo o usar el flujo autorizado sin pago.
3. Pulsar **Enviar a cocina**.
4. Esperar hasta tres segundos.
5. Confirmar que la misma Epson produzca dos tickets:
   - uno encabezado `COCINA`, con solo sus productos;
   - otro encabezado `BARRA`, con solo sus productos.
6. Revisar en el pedido que ambos destinos aparezcan como impresos. Si la
   pantalla no se actualiza inmediatamente, recargar el pedido.
7. Desde **Caja -> Cuentas cobradas**, abrir una factura y usar **Imprimir en
   térmica**. Debe salir solo en la impresora de caja.

## 11. Prueba de recuperación ante fallos

### Agente apagado

Esta es la prueba más determinista de la cola persistente:

```powershell
Stop-ScheduledTask -TaskName 'POS Print Agent'
```

1. Enviar una nueva comanda desde el POS.
2. Confirmar que la operación del pedido finalice aunque no salga papel.
3. Volver a iniciar el agente:

```powershell
Start-ScheduledTask -TaskName 'POS Print Agent'
```

4. La comanda pendiente debe imprimirse sin volver a enviarla desde el POS.

### Impresora apagada o sin papel

1. Apagar la impresora o retirar el papel.
2. Enviar una comanda nueva.
3. Consultar `/health` y verificar `ultimoError`.
4. Restaurar la impresora y esperar el reintento.

Los reintentos aumentan progresivamente desde 5 segundos hasta un máximo de 5
minutos. Algunos controladores de Windows aceptan el trabajo aunque falte papel;
en ese caso el POS puede marcarlo como impreso y será el spooler de Windows el
que lo conserve hasta colocar papel.

## 12. Diagnóstico rápido

### El agente no responde en el puerto 3001

```powershell
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
Get-ScheduledTask -TaskName 'POS Print Agent'
Get-ScheduledTaskInfo -TaskName 'POS Print Agent'
```

Ejecutar manualmente `node .\src\index.js` desde `print-agent` para ver el error
directamente. El mensaje `PRINT_AGENT_KEY es obligatoria` indica que la variable
no existe en la sesión o en el usuario que ejecuta la tarea.

### El backend responde 401

La clave de Render (o de `server/.env` si el backend es local) y la variable
de usuario `PRINT_AGENT_KEY` no son idénticas, o el servidor no se reinició
después del cambio.

### “La impresora no tiene configurado su nombre de dispositivo”

Editar la impresora en el POS y copiar exactamente el nombre mostrado por:

```powershell
Get-Printer | Select-Object Name
```

### Windows muestra la impresora desconectada

Revisar cable, energía, puerto USB y controlador Epson. Confirmar el estado:

```powershell
Get-Printer -Name 'EPSON TM-m30II COCINA-BARRA' |
  Select-Object Name, PrinterStatus, WorkOffline
```

### Se imprime texto ilegible o no se corta el papel

Confirmar que la cola seleccionada corresponde a la impresora física correcta,
no a una impresora virtual, y que el controlador instalado corresponde a su
modelo. El agente envía datos ESC/POS en modo `RAW`; ambas térmicas deben
interpretar ESC/POS para usar esta ruta.

### Reiniciar completamente la impresión

```powershell
Restart-Service Spooler
Stop-ScheduledTask -TaskName 'POS Print Agent'
Start-ScheduledTask -TaskName 'POS Print Agent'
Invoke-RestMethod http://127.0.0.1:3001/health
```

Reiniciar `Spooler` interrumpe temporalmente todas las impresiones de Windows;
hacerlo solamente cuando ninguna otra impresora esté trabajando.

## Lista de verificación final

- [ ] Node.js 20 o superior instalado.
- [ ] Controlador Epson APD instalado.
- [ ] Las dos colas USB visibles y funcionales en Windows.
- [ ] Nombres exactos de ambas colas registrados en el POS.
- [ ] `PRINT_AGENT_KEY` idéntica en Render (o `server/.env` si es local) y en el usuario de Windows.
- [ ] Backend reiniciado si se cambió la clave.
- [ ] Tarea `POS Print Agent` instalada y ejecutándose.
- [ ] `http://127.0.0.1:3001/health` responde `ok: true`.
- [ ] Impresoras activas `GENERAL` (preparación) y `CAJA` (facturas).
- [ ] Tickets de prueba impresos físicamente en las dos impresoras.
- [ ] Comanda mixta produce tickets separados de cocina y barra.
- [ ] Factura pagada sale solo en la impresora de caja.
- [ ] Una comanda enviada con el agente apagado se imprime al reiniciarlo.
