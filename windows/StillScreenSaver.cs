using System;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

internal static class StillScreenSaver
{
    private const string MutexName = @"Local\StillScreenSaver";

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string mode = args.Length == 0 ? string.Empty : args[0].Trim().ToLowerInvariant();
            switch (mode)
            {
                case "/s":
                    return RunSaver();
                case "/c":
                    return LaunchStill("--settings");
                case "/p":
                    return RunPreview(args);
                default:
                    ShowError("Windows passed an unsupported screensaver command. Use /s, /c, or /p HWND.");
                    return 2;
            }
        }
        catch (Exception error)
        {
            ShowError("Still screensaver could not start:\r\n\r\n" + error.Message);
            return 1;
        }
    }

    private static int RunSaver()
    {
        bool acquired;
        using (var mutex = new Mutex(true, MutexName, out acquired))
        {
            if (!acquired)
                return 0;

            return LaunchStillAndWait("--screensaver");
        }
    }

    private static int LaunchStill(string argument)
    {
        string executable = FindStillExecutable();
        if (executable == null)
        {
            ShowError("Still.exe was not found next to Still.scr. Reinstall Still or place both files in the same folder.");
            return 3;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = executable,
            Arguments = QuoteArgument(argument),
            WorkingDirectory = Path.GetDirectoryName(executable),
            UseShellExecute = false,
            CreateNoWindow = true,
        });
        return 0;
    }

    private static int LaunchStillAndWait(string argument)
    {
        string executable = FindStillExecutable();
        if (executable == null)
        {
            ShowError("Still.exe was not found next to Still.scr. Reinstall Still or place both files in the same folder.");
            return 3;
        }

        using (var process = Process.Start(new ProcessStartInfo
        {
            FileName = executable,
            Arguments = QuoteArgument(argument),
            WorkingDirectory = Path.GetDirectoryName(executable),
            UseShellExecute = false,
            CreateNoWindow = true,
        }))
        {
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    private static string FindStillExecutable()
    {
        string directory = AppDomain.CurrentDomain.BaseDirectory;
        string adjacent = Path.Combine(directory, "Still.exe");
        if (File.Exists(adjacent))
            return adjacent;

        // Keep a useful fallback for portable layouts where the launcher is
        // copied into a subdirectory beside the unpacked executable.
        DirectoryInfo parentInfo = Directory.GetParent(directory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        string parent = parentInfo == null ? null : parentInfo.FullName;
        if (parent != null)
        {
            string parentExecutable = Path.Combine(parent, "Still.exe");
            if (File.Exists(parentExecutable))
                return parentExecutable;
        }
        return null;
    }

    private static int RunPreview(string[] args)
    {
        IntPtr parent;
        if (args.Length < 2 || !TryParseWindowHandle(args[1], out parent))
        {
            ShowError("Windows did not provide a valid preview window handle.");
            return 2;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var preview = new PreviewForm(parent))
        {
            Application.Run(preview);
        }
        return 0;
    }

    private static bool TryParseWindowHandle(string value, out IntPtr handle)
    {
        handle = IntPtr.Zero;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        long number;
        if (value.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            if (!long.TryParse(value.Substring(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out number))
                return false;
        }
        else if (!long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out number))
        {
            return false;
        }

        handle = new IntPtr(number);
        return handle != IntPtr.Zero;
    }

    private static string QuoteArgument(string argument)
    {
        return "\"" + argument.Replace("\"", "\\\"") + "\"";
    }

    private static void ShowError(string message)
    {
        try
        {
            MessageBox.Show(message, "Still screensaver", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch
        {
            // A screensaver may be running on a non-interactive desktop.
        }
    }

    private sealed class PreviewForm : Form
    {
        private readonly IntPtr parentHandle;
        private readonly Label clock;
        private readonly System.Windows.Forms.Timer timer;

        public PreviewForm(IntPtr parentHandle)
        {
            this.parentHandle = parentHandle;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            ShowInTaskbar = false;
            BackColor = Color.Black;
            ForeColor = Color.White;
            MinimizeBox = false;
            MaximizeBox = false;
            ControlBox = false;

            clock = new Label
            {
                Dock = DockStyle.Fill,
                BackColor = Color.Black,
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 18f, FontStyle.Regular, GraphicsUnit.Point),
                TextAlign = ContentAlignment.MiddleCenter,
                Text = DateTime.Now.ToString("HH:mm:ss"),
            };
            Controls.Add(clock);

            timer = new System.Windows.Forms.Timer { Interval = 500 };
            timer.Tick += (sender, eventArgs) => clock.Text = DateTime.Now.ToString("HH:mm:ss");
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            SetParent(Handle, parentHandle);
            int style = GetWindowLong(Handle, GWL_STYLE);
            SetWindowLong(Handle, GWL_STYLE, (style | WS_CHILD) & ~WS_POPUP);
            ResizeToParent();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            ResizeToParent();
            timer.Start();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            timer.Stop();
            timer.Dispose();
            base.OnFormClosed(e);
        }

        private void ResizeToParent()
        {
            if (parentHandle == IntPtr.Zero) return;
            RECT rect;
            if (GetClientRect(parentHandle, out rect))
                MoveWindow(Handle, 0, 0, Math.Max(1, rect.Right - rect.Left), Math.Max(1, rect.Bottom - rect.Top), true);
        }

        private const int GWL_STYLE = -16;
        private const int WS_CHILD = 0x40000000;
        private const int WS_POPUP = unchecked((int)0x80000000);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetParent(IntPtr child, IntPtr parent);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern int GetWindowLong(IntPtr window, int index);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern int SetWindowLong(IntPtr window, int index, int value);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetClientRect(IntPtr window, out RECT rect);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool MoveWindow(IntPtr window, int x, int y, int width, int height, bool repaint);
    }
}
