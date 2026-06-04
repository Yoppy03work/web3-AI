// Tiny Upstash Redis REST client. No SDK — just `fetch`.
//
// Why Upstash REST over @upstash/redis or @vercel/kv:
//   - Zero runtime dependencies (we maintain that invariant).
//   - REST works identically from Node runtime, Edge, or local dev.
//
// When UPSTASH_REDIS_REST_URL / TOKEN are not set, all operations transparently
// degrade to an in-memory Map. This keeps `npm run dev` usable without setting
// up Upstash, at the cost of "history" being lost on process restart.

type RedisResp<T> = { result: T } | { error: string };

const URL_ENV = "UPSTASH_REDIS_REST_URL";
const TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";

export function storeEnabled(): boolean {
  return !!process.env[URL_ENV] && !!process.env[TOKEN_ENV];
}

// In-memory fallback. Shared across the lambda lifetime; lost on cold start.
const memKv = new Map<string, string>();
const memZset = new Map<string, Map<string, number>>(); // key -> (member -> score)

async function call<T>(command: (string | number)[]): Promise<T> {
  if (!storeEnabled()) {
    return memCall<T>(command);
  }
  const url = process.env[URL_ENV]!;
  const token = process.env[TOKEN_ENV]!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Upstash ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as RedisResp<T>;
  if ("error" in json) {
    throw new Error(`Upstash error: ${json.error}`);
  }
  return json.result;
}

// Tiny mock just enough for the commands we use.
function memCall<T>(command: (string | number)[]): T {
  const cmd = String(command[0]).toUpperCase();
  switch (cmd) {
    case "SET": {
      memKv.set(String(command[1]), String(command[2]));
      return "OK" as unknown as T;
    }
    case "GET": {
      const v = memKv.get(String(command[1]));
      return (v ?? null) as unknown as T;
    }
    case "DEL": {
      let n = 0;
      for (let i = 1; i < command.length; i++) {
        if (memKv.delete(String(command[i]))) n++;
      }
      return n as unknown as T;
    }
    case "ZADD": {
      const key = String(command[1]);
      const score = Number(command[2]);
      const member = String(command[3]);
      const z = memZset.get(key) ?? new Map<string, number>();
      const had = z.has(member);
      z.set(member, score);
      memZset.set(key, z);
      return (had ? 0 : 1) as unknown as T;
    }
    case "ZRANGE": {
      // ZRANGE key start stop [REV]
      const key = String(command[1]);
      const start = Number(command[2]);
      const stop = Number(command[3]);
      const rev = command.includes("REV");
      const z = memZset.get(key) ?? new Map();
      const sorted = Array.from(z.entries()).sort((a, b) =>
        rev ? b[1] - a[1] : a[1] - b[1],
      );
      const sliced =
        stop === -1 ? sorted.slice(start) : sorted.slice(start, stop + 1);
      return sliced.map(([m]) => m) as unknown as T;
    }
    default:
      throw new Error(`memCall: unsupported command ${cmd}`);
  }
}

// -------- typed helpers --------

export async function kvSetJson<T>(key: string, value: T): Promise<void> {
  await call<string>(["SET", key, JSON.stringify(value)]);
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const v = await call<string | null>(["GET", key]);
  if (v == null) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

export async function zaddDate(setKey: string, date: string): Promise<void> {
  // score = epoch seconds at midnight UTC of the given YYYY-MM-DD
  const ts = Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
  if (!Number.isFinite(ts)) return;
  await call<number>(["ZADD", setKey, ts, date]);
}

export async function zrangeDatesDesc(
  setKey: string,
  limit: number,
): Promise<string[]> {
  const start = 0;
  const stop = limit - 1;
  return call<string[]>(["ZRANGE", setKey, start, stop, "REV"]);
}
