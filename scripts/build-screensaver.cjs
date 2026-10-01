'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'windows', 'StillScreenSaver.cs');
const outputDir = path.join(root, 'build');
const output = path.join(outputDir, 'Still.scr');
const windowsDir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
const compilerCandidates = [
  path.join(windowsDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(windowsDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];
const compiler = compilerCandidates.find((candidate) => fs.existsSync(candidate));

if (process.platform !== 'win32') {
  console.error('Still.scr can only be built on Windows: the launcher uses the installed .NET Framework WinForms assemblies.');
  process.exitCode = 1;
} else if (!compiler) {
  console.error('Could not find Framework csc.exe. Install the .NET Framework developer tools or repair the Windows .NET Framework installation.');
  console.error(`Checked:\n${compilerCandidates.join('\n')}`);
  process.exitCode = 1;
} else {
  fs.mkdirSync(outputDir, { recursive: true });
  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    `/out:${output}`,
    `/r:${path.join(windowsDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'System.Windows.Forms.dll')}`,
    `/r:${path.join(windowsDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'System.Drawing.dll')}`,
    `/r:${path.join(windowsDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'System.dll')}`,
    source,
  ];

  // Framework64 references are preferred for an x64 build, but the compiler
  // can still compile AnyCPU using the 32-bit framework on 32-bit Windows.
  for (const index of [4, 5, 6]) {
    const reference = args[index];
    if (reference.includes('Framework64') && !fs.existsSync(reference.slice(3))) {
      args[index] = reference.replace('Framework64', 'Framework');
    }
  }

  console.log(`Compiling ${path.relative(root, source)} -> ${path.relative(root, output)}`);
  const result = spawnSync(compiler, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) {
    console.error(`Could not start csc.exe: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    console.log(`Created ${output}`);
  }
}
