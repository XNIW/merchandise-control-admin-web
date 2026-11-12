using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32;

// Deployment host only. The Getnet worker and its gateway protocol are unchanged.
// No Supabase key, POS credential, financial commit or arbitrary command is used.
internal sealed class HistoryWorkerService : ServiceBase
{
    internal const string ProductionName = "MerchandiseControlHistoryWorker";
    internal const string Gateway = "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/api/internal/payment-history/worker";
    internal const ulong MemoryBytes = 1073741824;
    private readonly string name;
    private readonly ManualResetEvent stopped = new ManualResetEvent(false);
    private readonly object gate = new object();
    private JobProcess child;
    private string statusPath;

    private HistoryWorkerService(string value)
    {
        name = value; ServiceName = value; AutoLog = false; CanStop = true;
    }

    private static int Main(string[] args)
    {
        Native.SetErrorMode(0x8003); // Owned host/child only: no interactive fault UI.
        try
        {
            if (args.Length == 5 && args[0] == "--resource-probe")
                return ResourceProbe(args[1], args[2], args[3], args[4]);
            if (args.Length != 2 || args[0] != "--service-name" || !ValidName(args[1])) return 2;
            ServiceBase.Run(new HistoryWorkerService(args[1])); return 0;
        }
        catch { return 1; } // Never print configuration, environment or exception text.
    }

    private static bool ValidName(string value)
    {
        return value == ProductionName || Regex.IsMatch(value ?? "", "^" + ProductionName + @"\.QA\.[0-9a-f]{32}$");
    }

    protected override void OnStart(string[] args)
    {
        Thread thread = new Thread(Run) { IsBackground = true, Name = "History worker supervisor" };
        thread.Start();
    }

    private void Run()
    {
        byte[] plain = null;
        try
        {
            WindowsIdentity identity = WindowsIdentity.GetCurrent();
            SecurityIdentifier serviceSid = (SecurityIdentifier)new NTAccount("NT SERVICE", name).Translate(typeof(SecurityIdentifier));
            // A per-service virtual account, rather than a shared service user.
            if (identity.User == null || identity.User.Value != serviceSid.Value) throw new InvalidOperationException();
            using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\" + name + @"\Parameters"))
            {
                if (key == null) throw new InvalidOperationException();
                string node = Value(key, "NodePath"), worker = Value(key, "WorkerPath"), secretFile = Value(key, "SecretPath");
                string url = Value(key, "GatewayUrl"), workerHash = Value(key, "WorkerSha256"), nodeHash = Value(key, "NodeSha256");
                statusPath = Value(key, "StatusPath");
                bool synthetic = name != ProductionName;
                if (synthetic)
                {
                    string marker = Path.Combine(Path.GetDirectoryName(secretFile), ".synthetic-owner");
                    if (!File.Exists(marker) || File.ReadAllText(marker).Trim() != name.Substring(name.Length - 32) ||
                        url != "https://history-worker-qa.invalid/api/internal/payment-history/worker") throw new InvalidOperationException();
                }
                else if (url != Gateway) throw new InvalidOperationException();
                DemandFile(node, nodeHash); DemandFile(worker, workerHash); DemandPath(secretFile); DemandPath(statusPath);
                if (new FileInfo(secretFile).Length > 32768) throw new InvalidOperationException();
                plain = ProtectedData.Unprotect(File.ReadAllBytes(secretFile), Entropy(name, url), DataProtectionScope.LocalMachine);
                if (plain.Length < 32 || plain.Length > 256) throw new InvalidOperationException();
                string secret = new UTF8Encoding(false, true).GetString(plain);
                Dictionary<string, string> env = EnvironmentFor(Path.GetDirectoryName(worker));
                env.Add("PAYMENT_HISTORY_WORKER_GATEWAY_URL", url);
                env.Add("PAYMENT_HISTORY_WORKER_GATEWAY_SECRET", secret);
                lock (gate)
                {
                    if (stopped.WaitOne(0)) return;
                    child = new JobProcess(node, worker, env);
                    WriteStatus("running", child.Id, 0, child.Limits());
                }
                Array.Clear(plain, 0, plain.Length); plain = null; secret = null; env.Clear();
                while (!stopped.WaitOne(1000))
                {
                    lock (gate)
                    {
                        if (child == null) break;
                        if (child.Exited())
                        {
                            WriteStatus("child_exited", child.Id, child.ExitCode(), child.Limits());
                            ExitCode = 1; break;
                        }
                        WriteStatus("running", child.Id, 0, child.Limits());
                    }
                }
            }
        }
        catch { ExitCode = 1; try { WriteStatus("host_failed", 0, 1, new Native.ExtendedLimits()); } catch { } }
        finally
        {
            if (plain != null) Array.Clear(plain, 0, plain.Length);
            lock (gate) { if (child != null) { child.Dispose(); child = null; } }
            if (!stopped.WaitOne(0)) Stop();
        }
    }

    protected override void OnStop()
    {
        stopped.Set();
        lock (gate) { if (child != null) { child.Dispose(); child = null; } }
    }

    private void WriteStatus(string state, uint pid, uint exit, Native.ExtendedLimits limits)
    {
        if (statusPath == null) return;
        string value = "{\"schema\":\"history-worker-host-v1\",\"state\":\"" + state + "\",\"service\":\"" + name +
            "\",\"utc\":\"" + DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture) + "\",\"pid\":" + pid +
            ",\"exitCode\":" + exit + ",\"processMemoryLimit\":" + limits.ProcessMemoryLimit.ToUInt64() +
            ",\"jobMemoryLimit\":" + limits.JobMemoryLimit.ToUInt64() + ",\"activeProcessLimit\":" + limits.Basic.ActiveProcessLimit +
            ",\"peakPrivateCommit\":" + limits.PeakProcessMemoryUsed.ToUInt64() + ",\"heapMiB\":640,\"serviceSidPresent\":true}";
        string temp = statusPath + ".tmp";
        File.WriteAllText(temp, value, new UTF8Encoding(false));
        if (File.Exists(statusPath)) File.Replace(temp, statusPath, null); else File.Move(temp, statusPath);
    }

    private static string Value(RegistryKey key, string name)
    {
        string value = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
        if (String.IsNullOrWhiteSpace(value) || value.Length > 4096 || value.IndexOf('\0') >= 0) throw new InvalidOperationException();
        return value;
    }

    internal static byte[] Entropy(string service, string url) { return Encoding.UTF8.GetBytes("MC.HistoryWorker.v1|" + service + "|" + url); }
    private static void DemandPath(string path)
    {
        if (!Path.IsPathRooted(path) || Path.GetFullPath(path) != path || path.StartsWith(@"\\", StringComparison.Ordinal)) throw new InvalidOperationException();
        string current = path;
        while (current != null)
        {
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException();
            current = Path.GetDirectoryName(current);
        }
    }
    private static void DemandFile(string path, string expected)
    {
        DemandPath(path);
        if (!Regex.IsMatch(expected, "^[0-9a-f]{64}$")) throw new InvalidOperationException();
        using (SHA256 sha = SHA256.Create()) using (FileStream file = File.OpenRead(path))
            if (BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant() != expected) throw new InvalidOperationException();
    }
    private static Dictionary<string, string> EnvironmentFor(string directory)
    {
        Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string system = Environment.GetEnvironmentVariable("SystemRoot");
        if (String.IsNullOrEmpty(system)) throw new InvalidOperationException();
        result.Add("SystemRoot", system); result.Add("windir", system);
        result.Add("TEMP", directory); result.Add("TMP", directory);
        return result;
    }

    private static int ResourceProbe(string node, string script, string owner, string output)
    {
        if (!Regex.IsMatch(owner, "^[0-9a-f]{32}$")) return 2;
        DemandPath(script); DemandPath(output);
        string root = Path.GetDirectoryName(script);
        if (Path.GetDirectoryName(output) != root || !Path.GetFileName(script).StartsWith("worker-host-probe", StringComparison.Ordinal) ||
            File.ReadAllText(Path.Combine(root, ".synthetic-owner")).Trim() != owner || File.Exists(output)) return 2;
        using (JobProcess process = new JobProcess(node, script, EnvironmentFor(root)))
        {
            if (!process.Wait(30000)) return 3;
            Native.ExtendedLimits limits = process.Limits();
            string json = "{\"pid\":" + process.Id + ",\"exitCode\":" + process.ExitCode() + ",\"processMemoryLimit\":" + limits.ProcessMemoryLimit.ToUInt64() +
                ",\"jobMemoryLimit\":" + limits.JobMemoryLimit.ToUInt64() + ",\"activeProcessLimit\":" + limits.Basic.ActiveProcessLimit +
                ",\"peakPrivateCommit\":" + limits.PeakProcessMemoryUsed.ToUInt64() + ",\"assignedBeforeResume\":true}";
            File.WriteAllText(output, json, new UTF8Encoding(false)); return 0;
        }
    }

    private sealed class JobProcess : IDisposable
    {
        private IntPtr job, process;
        internal uint Id;
        internal JobProcess(string node, string script, Dictionary<string, string> environment)
        {
            IntPtr block = IntPtr.Zero, nul = new IntPtr(-1), thread = IntPtr.Zero;
            try
            {
                job = Native.CreateJobObject(IntPtr.Zero, null); Native.Demand(job != IntPtr.Zero);
                Native.ExtendedLimits limits = new Native.ExtendedLimits();
                limits.Basic.LimitFlags = 0x8 | 0x100 | 0x200 | 0x400 | 0x2000;
                limits.Basic.ActiveProcessLimit = 1;
                limits.ProcessMemoryLimit = new UIntPtr(MemoryBytes); limits.JobMemoryLimit = new UIntPtr(MemoryBytes);
                Native.Demand(Native.SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(Native.ExtendedLimits))));
                Native.SecurityAttributes security = new Native.SecurityAttributes();
                security.Length = Marshal.SizeOf(typeof(Native.SecurityAttributes)); security.Inherit = true;
                nul = Native.CreateFile("NUL", 0xC0000000, 3, ref security, 3, 0, IntPtr.Zero); Native.Demand(nul != new IntPtr(-1));
                List<string> keys = new List<string>(environment.Keys); keys.Sort(StringComparer.OrdinalIgnoreCase);
                StringBuilder text = new StringBuilder(); foreach (string key in keys) text.Append(key).Append('=').Append(environment[key]).Append('\0');
                text.Append('\0'); block = Marshal.StringToHGlobalUni(text.ToString());
                Native.StartupInfo startup = new Native.StartupInfo(); startup.Size = Marshal.SizeOf(typeof(Native.StartupInfo));
                startup.Flags = 0x100; startup.Input = startup.Output = startup.Error = nul;
                Native.ProcessInfo info;
                StringBuilder command = new StringBuilder("\"" + node + "\" --max-old-space-size=640 \"" + script + "\"");
                Native.Demand(Native.CreateProcess(node, command, IntPtr.Zero, IntPtr.Zero, true, 0x08004404, block, Path.GetDirectoryName(script), ref startup, out info));
                process = info.Process; thread = info.Thread; Id = info.Id;
                // The child cannot execute or allocate before it belongs to the job.
                Native.Demand(Native.AssignProcessToJobObject(job, process));
                Native.Demand(Native.ResumeThread(thread) != UInt32.MaxValue);
            }
            catch { if (process != IntPtr.Zero) Native.TerminateProcess(process, 1); Dispose(); throw; }
            finally
            {
                if (thread != IntPtr.Zero) Native.CloseHandle(thread);
                if (nul != new IntPtr(-1)) Native.CloseHandle(nul);
                if (block != IntPtr.Zero)
                {
                    // The environment block is private to this launch, never logged.
                    int count = 0; foreach (KeyValuePair<string, string> pair in environment) count += pair.Key.Length + pair.Value.Length + 2;
                    for (int i = 0; i < (count + 1) * 2; i++) Marshal.WriteByte(block, i, 0);
                    Marshal.FreeHGlobal(block);
                }
            }
        }
        internal bool Exited() { return Native.WaitForSingleObject(process, 0) == 0; }
        internal bool Wait(uint milliseconds) { return Native.WaitForSingleObject(process, milliseconds) == 0; }
        internal uint ExitCode() { uint code; Native.Demand(Native.GetExitCodeProcess(process, out code)); return code; }
        internal Native.ExtendedLimits Limits()
        {
            Native.ExtendedLimits result; uint length;
            Native.Demand(Native.QueryInformationJobObject(job, 9, out result, (uint)Marshal.SizeOf(typeof(Native.ExtendedLimits)), out length));
            if (result.ProcessMemoryLimit.ToUInt64() != MemoryBytes || result.JobMemoryLimit.ToUInt64() != MemoryBytes || result.Basic.ActiveProcessLimit != 1) throw new InvalidOperationException();
            return result;
        }
        public void Dispose()
        {
            if (job != IntPtr.Zero) { Native.CloseHandle(job); job = IntPtr.Zero; }
            if (process != IntPtr.Zero) { Native.CloseHandle(process); process = IntPtr.Zero; }
        }
    }

    private static class Native
    {
        [StructLayout(LayoutKind.Sequential)] internal struct BasicLimits { internal long ProcessTime, JobTime; internal uint LimitFlags; internal UIntPtr Minimum, Maximum; internal uint ActiveProcessLimit; internal UIntPtr Affinity; internal uint Priority, Scheduling; }
        [StructLayout(LayoutKind.Sequential)] internal struct IoCounters { internal ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
        [StructLayout(LayoutKind.Sequential)] internal struct ExtendedLimits { internal BasicLimits Basic; internal IoCounters Io; internal UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }
        [StructLayout(LayoutKind.Sequential)] internal struct SecurityAttributes { internal int Length; internal IntPtr Descriptor; [MarshalAs(UnmanagedType.Bool)] internal bool Inherit; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] internal struct StartupInfo { internal int Size; internal string Reserved, Desktop, Title; internal uint X, Y, Width, Height, CountX, CountY, Fill, Flags; internal short Show, ReservedSize; internal IntPtr ReservedData, Input, Output, Error; }
        [StructLayout(LayoutKind.Sequential)] internal struct ProcessInfo { internal IntPtr Process, Thread; internal uint Id, ThreadId; }
        internal static void Demand(bool value) { if (!value) throw new Win32Exception(Marshal.GetLastWin32Error()); }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool SetInformationJobObject(IntPtr job, int info, ref ExtendedLimits value, uint length);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool QueryInformationJobObject(IntPtr job, int info, out ExtendedLimits value, uint length, out uint returned);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern bool CreateProcess(string app, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] internal static extern IntPtr CreateFile(string name, uint access, uint share, ref SecurityAttributes security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern uint WaitForSingleObject(IntPtr value, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")] internal static extern uint SetErrorMode(uint mode);
    }
}
