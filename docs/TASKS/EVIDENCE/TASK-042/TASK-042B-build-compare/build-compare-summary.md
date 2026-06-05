# Win7POS Build Compare Summary

## Inputs

- Bad/Codex package: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/app`
- Good/GitHub package: `/Users/minxiang/Downloads/Win7POS_20260602_0242`
- Output directory: `/Users/minxiang/Projects/merchandise-control-admin-web/docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare`

## Counts

| Metric | Bad/Codex | Good/GitHub |
| --- | ---: | ---: |
| Files | 38 | 96 |
| Total bytes | 13831941 | 95369218 |

## Diff Totals

- Missing from Codex: 58
- Extra in Codex: 0
- Same relative path, different SHA-256: 7

## Key Findings

- `e_sqlite3.dll` in Bad/Codex: false
- `e_sqlite3.dll` in Good/GitHub: true
- `cli/` payload in Bad/Codex: false
- `cli/` payload in Good/GitHub: true
- `VERSION.txt` in Bad/Codex: false
- `VERSION.txt` in Good/GitHub: true

## Key File Rows

Filtered from `build-compare-files.csv` for executable, config, app DLLs, SQLite/native/runtime folders, assets, docs, and release metadata.

| Relative path | Status | Bad bytes | Good bytes |
| --- | --- | ---: | ---: |
| `Assets/sii_qrcode.png` | same | 172770 | 172770 |
| `Microsoft.Data.Sqlite.dll` | same | 176160 | 176160 |
| `README_RUN.txt` | missing_from_codex |  | 447 |
| `RELEASE_CHECKLIST.txt` | missing_from_codex |  | 981 |
| `SQLitePCLRaw.batteries_v2.dll` | same | 5632 | 5632 |
| `SQLitePCLRaw.core.dll` | same | 51200 | 51200 |
| `SQLitePCLRaw.provider.e_sqlite3.dll` | same | 40960 | 40960 |
| `VERSION.txt` | missing_from_codex |  | 118 |
| `Win7POS.Core.dll` | different_hash | 94720 | 94720 |
| `Win7POS.Data.dll` | different_hash | 256000 | 257536 |
| `Win7POS.Wpf.exe` | different_hash | 856064 | 856064 |
| `Win7POS.Wpf.exe.config` | different_hash | 1835 | 1872 |
| `cli/ClosedXML.dll` | missing_from_codex |  | 1437696 |
| `cli/Dapper.dll` | missing_from_codex |  | 245760 |
| `cli/DocumentFormat.OpenXml.dll` | missing_from_codex |  | 6025128 |
| `cli/ExcelDataReader.DataSet.dll` | missing_from_codex |  | 11776 |
| `cli/ExcelDataReader.dll` | missing_from_codex |  | 197632 |
| `cli/ExcelNumberFormat.dll` | missing_from_codex |  | 30720 |
| `cli/Irony.dll` | missing_from_codex |  | 144896 |
| `cli/Microsoft.Data.Sqlite.dll` | missing_from_codex |  | 177696 |
| `cli/SQLitePCLRaw.batteries_v2.dll` | missing_from_codex |  | 5632 |
| `cli/SQLitePCLRaw.core.dll` | missing_from_codex |  | 51200 |
| `cli/SQLitePCLRaw.provider.e_sqlite3.dll` | missing_from_codex |  | 36864 |
| `cli/SixLabors.Fonts.dll` | missing_from_codex |  | 1135616 |
| `cli/System.IO.Packaging.dll` | missing_from_codex |  | 122480 |
| `cli/Win7POS.Cli.deps.json` | missing_from_codex |  | 17134 |
| `cli/Win7POS.Cli.dll` | missing_from_codex |  | 66560 |
| `cli/Win7POS.Cli.exe` | missing_from_codex |  | 162304 |
| `cli/Win7POS.Cli.pdb` | missing_from_codex |  | 24056 |
| `cli/Win7POS.Cli.runtimeconfig.json` | missing_from_codex |  | 342 |
| `cli/Win7POS.Core.dll` | missing_from_codex |  | 94720 |
| `cli/Win7POS.Core.pdb` | missing_from_codex |  | 41744 |
| `cli/Win7POS.Data.dll` | missing_from_codex |  | 257024 |
| `cli/Win7POS.Data.pdb` | missing_from_codex |  | 46412 |
| `cli/XLParser.dll` | missing_from_codex |  | 54784 |
| `cli/runtimes/android-arm/native/libe_sqlite3.so` | missing_from_codex |  | 1213068 |
| `cli/runtimes/android-arm64/native/libe_sqlite3.so` | missing_from_codex |  | 1728080 |
| `cli/runtimes/android-x64/native/libe_sqlite3.so` | missing_from_codex |  | 1760040 |
| `cli/runtimes/android-x86/native/libe_sqlite3.so` | missing_from_codex |  | 1771220 |
| `cli/runtimes/browser-wasm/nativeassets/net9.0/e_sqlite3.a` | missing_from_codex |  | 1273274 |
| `cli/runtimes/ios-arm/native/e_sqlite3.a` | missing_from_codex |  | 5465392 |
| `cli/runtimes/ios-arm64/native/e_sqlite3.a` | missing_from_codex |  | 5465392 |
| `cli/runtimes/iossimulator-arm64/native/e_sqlite3.a` | missing_from_codex |  | 6374080 |
| `cli/runtimes/iossimulator-x64/native/e_sqlite3.a` | missing_from_codex |  | 6374080 |
| `cli/runtimes/iossimulator-x86/native/e_sqlite3.a` | missing_from_codex |  | 6374080 |
| `cli/runtimes/linux-arm/native/libe_sqlite3.so` | missing_from_codex |  | 952800 |
| `cli/runtimes/linux-arm64/native/libe_sqlite3.so` | missing_from_codex |  | 1530608 |
| `cli/runtimes/linux-armel/native/libe_sqlite3.so` | missing_from_codex |  | 1337732 |
| `cli/runtimes/linux-mips64/native/libe_sqlite3.so` | missing_from_codex |  | 1750688 |
| `cli/runtimes/linux-musl-arm/native/libe_sqlite3.so` | missing_from_codex |  | 1285764 |
| `cli/runtimes/linux-musl-arm64/native/libe_sqlite3.so` | missing_from_codex |  | 1414272 |
| `cli/runtimes/linux-musl-riscv64/native/libe_sqlite3.so` | missing_from_codex |  | 995824 |
| `cli/runtimes/linux-musl-s390x/native/libe_sqlite3.so` | missing_from_codex |  | 1645144 |
| `cli/runtimes/linux-musl-x64/native/libe_sqlite3.so` | missing_from_codex |  | 1404920 |
| `cli/runtimes/linux-ppc64le/native/libe_sqlite3.so` | missing_from_codex |  | 1868144 |
| `cli/runtimes/linux-riscv64/native/libe_sqlite3.so` | missing_from_codex |  | 1263704 |
| `cli/runtimes/linux-s390x/native/libe_sqlite3.so` | missing_from_codex |  | 1611168 |
| `cli/runtimes/linux-x64/native/libe_sqlite3.so` | missing_from_codex |  | 1434496 |
| `cli/runtimes/linux-x86/native/libe_sqlite3.so` | missing_from_codex |  | 1507844 |
| `cli/runtimes/maccatalyst-arm64/native/libe_sqlite3.dylib` | missing_from_codex |  | 1676400 |
| `cli/runtimes/maccatalyst-x64/native/libe_sqlite3.dylib` | missing_from_codex |  | 1713688 |
| `cli/runtimes/osx-arm64/native/libe_sqlite3.dylib` | missing_from_codex |  | 1661200 |
| `cli/runtimes/osx-x64/native/libe_sqlite3.dylib` | missing_from_codex |  | 1680992 |
| `cli/runtimes/win-arm64/native/e_sqlite3.dll` | missing_from_codex |  | 1695232 |
| `cli/runtimes/win-x64/native/e_sqlite3.dll` | missing_from_codex |  | 1910784 |
| `cli/runtimes/win-x86/native/e_sqlite3.dll` | missing_from_codex |  | 1502720 |
| `e_sqlite3.dll` | missing_from_codex |  | 1502720 |

## Bad/Codex File Tree

  - Assets/sii_qrcode.png
- ClosedXML.dll
- Dapper.dll
- DocumentFormat.OpenXml.dll
- ExcelDataReader.DataSet.dll
- ExcelDataReader.dll
- ExcelNumberFormat.dll
- Irony.dll
- Microsoft.Bcl.AsyncInterfaces.dll
- Microsoft.Data.Sqlite.dll
- PdfSharp-gdi.dll
- PdfSharp.Charting-gdi.dll
- SQLitePCLRaw.batteries_v2.dll
- SQLitePCLRaw.core.dll
- SQLitePCLRaw.provider.e_sqlite3.dll
- SixLabors.Fonts.dll
- System.Buffers.dll
- System.Drawing.Common.dll
- System.IO.Packaging.dll
- System.Memory.dll
- System.Numerics.Vectors.dll
- System.Runtime.CompilerServices.Unsafe.dll
- System.Text.Encoding.CodePages.dll
- System.Threading.Tasks.Extensions.dll
- System.ValueTuple.dll
- Win7POS.Core.dll
- Win7POS.Core.pdb
- Win7POS.Data.dll
- Win7POS.Data.pdb
- Win7POS.Wpf.exe
- Win7POS.Wpf.exe.config
- Win7POS.Wpf.pdb
- XLParser.dll
- ZXing.Windows.Compatibility.dll
  - de/PdfSharp-gdi.resources.dll
  - de/PdfSharp.Charting-gdi.resources.dll
- zxing.dll
- zxing.presentation.dll

## Good/GitHub File Tree

  - Assets/sii_qrcode.png
- ClosedXML.dll
- Dapper.dll
- DocumentFormat.OpenXml.dll
- ExcelDataReader.DataSet.dll
- ExcelDataReader.dll
- ExcelNumberFormat.dll
- Irony.dll
- Microsoft.Bcl.AsyncInterfaces.dll
- Microsoft.Data.Sqlite.dll
- PdfSharp-gdi.dll
- PdfSharp.Charting-gdi.dll
- README_RUN.txt
- RELEASE_CHECKLIST.txt
- SQLitePCLRaw.batteries_v2.dll
- SQLitePCLRaw.core.dll
- SQLitePCLRaw.provider.e_sqlite3.dll
- SixLabors.Fonts.dll
- System.Buffers.dll
- System.Drawing.Common.dll
- System.IO.Packaging.dll
- System.Memory.dll
- System.Numerics.Vectors.dll
- System.Runtime.CompilerServices.Unsafe.dll
- System.Text.Encoding.CodePages.dll
- System.Threading.Tasks.Extensions.dll
- System.ValueTuple.dll
- VERSION.txt
- Win7POS.Core.dll
- Win7POS.Core.pdb
- Win7POS.Data.dll
- Win7POS.Data.pdb
- Win7POS.Wpf.exe
- Win7POS.Wpf.exe.config
- Win7POS.Wpf.pdb
- XLParser.dll
- ZXing.Windows.Compatibility.dll
  - cli/ClosedXML.dll
  - cli/Dapper.dll
  - cli/DocumentFormat.OpenXml.dll
  - cli/ExcelDataReader.DataSet.dll
  - cli/ExcelDataReader.dll
  - cli/ExcelNumberFormat.dll
  - cli/Irony.dll
  - cli/Microsoft.Data.Sqlite.dll
  - cli/SQLitePCLRaw.batteries_v2.dll
  - cli/SQLitePCLRaw.core.dll
  - cli/SQLitePCLRaw.provider.e_sqlite3.dll
  - cli/SixLabors.Fonts.dll
  - cli/System.IO.Packaging.dll
  - cli/Win7POS.Cli.deps.json
  - cli/Win7POS.Cli.dll
  - cli/Win7POS.Cli.exe
  - cli/Win7POS.Cli.pdb
  - cli/Win7POS.Cli.runtimeconfig.json
  - cli/Win7POS.Core.dll
  - cli/Win7POS.Core.pdb
  - cli/Win7POS.Data.dll
  - cli/Win7POS.Data.pdb
  - cli/XLParser.dll
        - cli/runtimes/android-arm/native/libe_sqlite3.so
        - cli/runtimes/android-arm64/native/libe_sqlite3.so
        - cli/runtimes/android-x64/native/libe_sqlite3.so
        - cli/runtimes/android-x86/native/libe_sqlite3.so
          - cli/runtimes/browser-wasm/nativeassets/net9.0/e_sqlite3.a
        - cli/runtimes/ios-arm/native/e_sqlite3.a
        - cli/runtimes/ios-arm64/native/e_sqlite3.a
        - cli/runtimes/iossimulator-arm64/native/e_sqlite3.a
        - cli/runtimes/iossimulator-x64/native/e_sqlite3.a
        - cli/runtimes/iossimulator-x86/native/e_sqlite3.a
        - cli/runtimes/linux-arm/native/libe_sqlite3.so
        - cli/runtimes/linux-arm64/native/libe_sqlite3.so
        - cli/runtimes/linux-armel/native/libe_sqlite3.so
        - cli/runtimes/linux-mips64/native/libe_sqlite3.so
        - cli/runtimes/linux-musl-arm/native/libe_sqlite3.so
        - cli/runtimes/linux-musl-arm64/native/libe_sqlite3.so
        - cli/runtimes/linux-musl-riscv64/native/libe_sqlite3.so
        - cli/runtimes/linux-musl-s390x/native/libe_sqlite3.so
        - cli/runtimes/linux-musl-x64/native/libe_sqlite3.so
        - cli/runtimes/linux-ppc64le/native/libe_sqlite3.so
        - cli/runtimes/linux-riscv64/native/libe_sqlite3.so
        - cli/runtimes/linux-s390x/native/libe_sqlite3.so
        - cli/runtimes/linux-x64/native/libe_sqlite3.so
        - cli/runtimes/linux-x86/native/libe_sqlite3.so
        - cli/runtimes/maccatalyst-arm64/native/libe_sqlite3.dylib
        - cli/runtimes/maccatalyst-x64/native/libe_sqlite3.dylib
        - cli/runtimes/osx-arm64/native/libe_sqlite3.dylib
        - cli/runtimes/osx-x64/native/libe_sqlite3.dylib
        - cli/runtimes/win-arm64/native/e_sqlite3.dll
        - cli/runtimes/win-x64/native/e_sqlite3.dll
        - cli/runtimes/win-x86/native/e_sqlite3.dll
  - de/PdfSharp-gdi.resources.dll
  - de/PdfSharp.Charting-gdi.resources.dll
- e_sqlite3.dll
- zxing.dll
- zxing.presentation.dll
