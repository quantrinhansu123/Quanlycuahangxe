import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ignoredDirectories = new Set(['.git', '.vercel', 'dist', 'node_modules']);
const textExtensions = new Set([
  '.cjs',
  '.env',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function extensionOf(file) {
  const name = file.toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot);
}

function walk(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

const failures = [];

// App Secret must never be placed in any local .env file. It belongs only in
// Supabase Edge Function Secrets. In particular, a VITE_ prefix would bundle it
// into browser JavaScript.
for (const entry of readdirSync(root)) {
  if (!entry.startsWith('.env') || entry === '.env.example') continue;
  const envPath = join(root, entry);
  if (!statSync(envPath).isFile()) continue;
  const envText = readFileSync(envPath, 'utf8');
  if (/^\s*(?:VITE_)?ZALO_APP_SECRET\s*=/m.test(envText)) {
    failures.push(`${entry}: không được lưu ZALO_APP_SECRET trong file môi trường local`);
  }
}

for (const fullPath of walk(root)) {
  const rel = relative(root, fullPath).replaceAll('\\', '/');
  const ext = extensionOf(fullPath);
  if (!textExtensions.has(ext) && !rel.startsWith('.env')) continue;

  let text;
  try {
    text = readFileSync(fullPath, 'utf8');
  } catch {
    continue;
  }

  // Any reference from browser code would make accidental exposure possible.
  if (rel.startsWith('src/') && /ZALO_APP_SECRET|secret_key/i.test(text)) {
    failures.push(`${rel}: frontend không được tham chiếu Zalo App Secret`);
  }

  // Catch the most dangerous typo anywhere in the repository.
  if (rel !== 'scripts/check-zalo-secrets.mjs' && /VITE_ZALO_APP_SECRET/i.test(text)) {
    failures.push(`${rel}: VITE_ZALO_APP_SECRET sẽ bị công khai trong bundle`);
  }

  // Token/secret values must not be written to logs in Zalo Edge Functions.
  if (rel.startsWith('supabase/functions/') && /console\.(?:log|info|warn|error)\s*\([^\n]*(?:access_token|refresh_token|appSecret|ZALO_APP_SECRET)/i.test(text)) {
    failures.push(`${rel}: không được ghi Zalo token/secret vào log`);
  }
}

if (!existsSync(join(root, '.gitignore')) || !/^\.env\*\s*$/m.test(readFileSync(join(root, '.gitignore'), 'utf8'))) {
  failures.push('.gitignore: thiếu quy tắc .env* để chặn các bản sao .env');
}

if (failures.length > 0) {
  console.error('Kiểm tra bảo mật Zalo thất bại:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Kiểm tra bảo mật Zalo đạt yêu cầu: không phát hiện App Secret/token trong frontend hoặc file .env local.');
