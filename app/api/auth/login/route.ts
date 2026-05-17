import { NextRequest, NextResponse } from "next/server";

async function expectedToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? "fallback-secret";
  const password = process.env.AUTH_PASSWORD ?? "changeme";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(password));
  return Buffer.from(sig).toString("base64");
}

export async function POST(request: NextRequest) {
  const { password, from } = await request.json();

  if (password !== (process.env.AUTH_PASSWORD ?? "changeme")) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await expectedToken();
  const redirect = (from && from !== "/login" && from !== "/") ? from : "/home";

  const response = NextResponse.json({ ok: true, redirect });
  response.cookies.set("compliance_auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
