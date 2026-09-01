param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$DataFile
)

$printer = Get-Printer -Name $PrinterName -ErrorAction Stop
if ($printer.PrinterStatus -in @('Offline', 'Error', 'PaperProblem', 'NoToner', 'NotAvailable')) {
  throw "La impresora '$PrinterName' reporta estado $($printer.PrinterStatus)"
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOC_INFO_1 {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr printer, int level, [In] DOC_INFO_1 info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr printer);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr printer, byte[] bytes, int count, out int written);

  public static void Send(string printerName, byte[] bytes) {
    IntPtr printer;
    if (!OpenPrinter(printerName, out printer, IntPtr.Zero)) throw new System.ComponentModel.Win32Exception();
    try {
      var info = new DOC_INFO_1 { pDocName = "Ticket POS", pDataType = "RAW" };
      if (StartDocPrinter(printer, 1, info) == 0) throw new System.ComponentModel.Win32Exception();
      try {
        if (!StartPagePrinter(printer)) throw new System.ComponentModel.Win32Exception();
        try {
          int written;
          if (!WritePrinter(printer, bytes, bytes.Length, out written) || written != bytes.Length)
            throw new System.ComponentModel.Win32Exception();
        } finally { EndPagePrinter(printer); }
      } finally { EndDocPrinter(printer); }
    } finally { ClosePrinter(printer); }
  }
}
'@

[RawPrinter]::Send($PrinterName, [System.IO.File]::ReadAllBytes($DataFile))
