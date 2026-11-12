# Independent CLR Getnet oracle

Calls the real Win7POS HistoricalSalesImportAnalyzer from the qualified QA Core/Data
assemblies, without opening a database or profile. The executable accepts only the
two synthetic workbook names in a directory containing windows-manifest.json.

On Windows with .NET Framework4.8, build with an explicit verified assembly root:
`dotnet build tools/PaymentHistoryClrOracle/GetnetParity.csproj -c Release -p:QualifiedWin7PosAssemblyRoot=<verified-QA-root>`.
Run GetnetParity.exe with the synthetic fixture directory and one of IsoUtc,
ExportedLocal or Unresolved. Verify the assembly hashes against clr-provenance.json
before running; a source/version change requires a new reviewed oracle checkpoint.

Normalize volatile file IDs and parser implementation version only. Monetary longs
remain decimal strings, dates retain seven fractional digits, source sheet/row,
profile version, merchant, card type, rejected amounts and evidence state remain.
Expected aggregates also have a separate literal oracle in corpus-v1.json.
