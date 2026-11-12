using System;using System.Collections;using System.Collections.Generic;using System.Globalization;using System.IO;using System.Linq;using System.Reflection;using System.Web.Script.Serialization;using Win7POS.Core.Import;using Win7POS.Data.Import;
class Program {
 static object Normalize(object value) {
  if(value==null)return null;
  if(value is string||value is bool||value is int)return value;
  if(value is long)return ((long)value).ToString(CultureInfo.InvariantCulture);
  if(value is DateTime)return ((DateTime)value).ToString("yyyy-MM-ddTHH:mm:ss.fffffff",CultureInfo.InvariantCulture);
  if(value is DateTimeOffset)return ((DateTimeOffset)value).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffffff",CultureInfo.InvariantCulture)+"Z";
  if(value.GetType().IsEnum)return value.ToString();
  if(value is IEnumerable)return ((IEnumerable)value).Cast<object>().Select(Normalize).ToArray();
  var d=new SortedDictionary<string,object>(StringComparer.Ordinal);
  foreach(var p in value.GetType().GetProperties(BindingFlags.Instance|BindingFlags.Public)) {
   if(p.Name=="ParserVersion"||p.Name=="FileId"||p.Name=="Path"||(value is HistoricalSalesTransaction&&p.Name=="BusinessDateTime"))continue;
   d.Add(char.ToLowerInvariant(p.Name[0])+p.Name.Substring(1),Normalize(p.GetValue(value)));
  }return d;
 }
 static int Main(string[] args) {
  if(args.Length!=2||!File.Exists(Path.Combine(args[0],"windows-manifest.json")))return 4;
  var files=new[]{"synthetic-legacy.xlsx","synthetic-modern.xlsx"}.Select(name=>Path.Combine(args[0],name)).ToArray();
  HistoricalSalesModernTimeInterpretation mode;if(!Enum.TryParse(args[1],out mode))return 5;
  var options=new HistoricalSalesImportOptions{ModernTimeInterpretation=mode,LegacyClpConfirmed=true,TemporalPolicyVersion="synthetic-fixed-offset-v1",TemporalEvidenceReference=mode==HistoricalSalesModernTimeInterpretation.Unresolved?"":"synthetic ISO UTC evidence"};
  var analysis=new HistoricalSalesImportAnalyzer().Analyze(files,options);
  var normalized=new {transactions=Normalize(analysis.AcceptedTransactions),rejected=Normalize(analysis.RejectedRows),summary=Normalize(analysis.Summary),needsEvidence=analysis.NeedsEvidence,hasErrors=analysis.HasErrors};
  Console.Write(new JavaScriptSerializer{MaxJsonLength=1000000}.Serialize(normalized));return 0;
 }
}
