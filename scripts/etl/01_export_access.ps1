# Exporta cada tabla del Access a un CSV en _out/raw/.
# Usa el provider Microsoft.ACE.OLEDB.16.0 (ya verificado en este equipo).
#
# Uso (desde la raíz del proyecto):
#   pwsh ./scripts/etl/01_export_access.ps1
#
# Requiere que "_legacy/Datos Lavanderia.accdb" exista.

$ErrorActionPreference = "Stop"

$root   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dbPath = Join-Path $root "_legacy\Datos Lavanderia.accdb"
$outDir = Join-Path $PSScriptRoot "_out\raw"

if (-not (Test-Path $dbPath)) {
  throw "No se encontró el Access en $dbPath"
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$tables = @(
  "Clientes",
  "Clientes_Empresa",
  "Productos",
  "Producto_Empresa",
  "Forma_Pago",
  "Pedido",
  "Detalle_Pedidos",
  "Pedido_Empresa",
  "Detalle_Pedido_Empresa"
)

$conn = New-Object System.Data.OleDb.OleDbConnection
$conn.ConnectionString = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$dbPath;Persist Security Info=False;"
$conn.Open()

foreach ($t in $tables) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = "SELECT * FROM [$t]"
  $reader = $cmd.ExecuteReader()

  $rows = New-Object System.Collections.Generic.List[object]
  while ($reader.Read()) {
    $row = [ordered]@{}
    for ($i = 0; $i -lt $reader.FieldCount; $i++) {
      $name = $reader.GetName($i)
      $val  = if ($reader.IsDBNull($i)) { $null } else { $reader.GetValue($i) }
      # Datetime → ISO 8601 (sin TZ — Access los guarda como locales, los interpretamos UTC al cargar)
      if ($val -is [datetime]) {
        $val = $val.ToString("yyyy-MM-ddTHH:mm:ss")
      }
      $row[$name] = $val
    }
    $rows.Add([pscustomobject]$row) | Out-Null
  }
  $reader.Close()

  $outFile = Join-Path $outDir "$t.csv"
  $rows | Export-Csv -Path $outFile -NoTypeInformation -Encoding UTF8
  Write-Host ("  {0,-26}  {1,7} filas  →  {2}" -f $t, $rows.Count, $outFile)
}

$conn.Close()
Write-Host "`nExportación completa en $outDir"
