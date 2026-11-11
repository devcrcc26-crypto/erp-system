const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3008/api';

async function tryLogin(identifier, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(
    JSON.stringify({
      identifier,
      status: res.status,
      ok: res.ok,
      mustChangePassword: body?.data?.user?.mustChangePassword ?? body?.user?.mustChangePassword,
      message: body?.error?.message ?? body?.message,
    }),
  );
}

await tryLogin('Eyuel Tilahun', 'Employee@12345');
await tryLogin('Eyuel Tilahun', 'Admin@12345');
await tryLogin('Jinxia Dong', 'Admin@12345');
await tryLogin('Jinxia Dong', 'Employee@12345');
