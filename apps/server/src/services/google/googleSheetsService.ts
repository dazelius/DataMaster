import { createSign } from 'crypto';
import { config } from '../../config.js';

export interface SheetTab {
  title: string;
  index: number;
  sheetId: number;
  rowCount: number;
  columnCount: number;
}

export function isConfigured(): boolean {
  return !!(config.GOOGLE_SHEETS_ID && (config.GOOGLE_API_KEY || config.GOOGLE_SERVICE_ACCOUNT_KEY));
}

export function getSpreadsheetId(): string {
  return config.GOOGLE_SHEETS_ID;
}

// ─── Service Account JWT Auth ───────────────────────────────────────────────

interface ServiceAccountCreds {
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64url');
}

async function getAccessToken(creds: ServiceAccountCreds): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: creds.token_uri,
    iat: now,
    exp: now + 3600,
  }));

  const signInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = signer.sign(creds.private_key, 'base64url');
  const jwt = `${signInput}.${signature}`;

  const res = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

// ─── API fetch with auth ────────────────────────────────────────────────────

async function apiFetch(url: string): Promise<Response> {
  let fullUrl = url;
  const headers: Record<string, string> = {};

  if (config.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const creds = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_KEY) as ServiceAccountCreds;
    const token = await getAccessToken(creds);
    headers['Authorization'] = `Bearer ${token}`;
  } else if (config.GOOGLE_API_KEY) {
    const sep = url.includes('?') ? '&' : '?';
    fullUrl = `${url}${sep}key=${config.GOOGLE_API_KEY}`;
  }

  const res = await fetch(fullUrl, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Sheets API error (${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

// ─── Sheet operations ───────────────────────────────────────────────────────

export async function listSheetTabs(spreadsheetId?: string): Promise<SheetTab[]> {
  const id = spreadsheetId ?? config.GOOGLE_SHEETS_ID;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`;
  const res = await apiFetch(url);
  const data = await res.json() as {
    sheets?: { properties?: { title?: string; index?: number; sheetId?: number; gridProperties?: { rowCount?: number; columnCount?: number } } }[];
  };
  return (data.sheets ?? []).map((s) => ({
    title: s.properties?.title ?? '',
    index: s.properties?.index ?? 0,
    sheetId: s.properties?.sheetId ?? 0,
    rowCount: s.properties?.gridProperties?.rowCount ?? 0,
    columnCount: s.properties?.gridProperties?.columnCount ?? 0,
  }));
}

export async function fetchSheetData(
  sheetName: string,
  spreadsheetId?: string,
): Promise<string[][]> {
  const id = spreadsheetId ?? config.GOOGLE_SHEETS_ID;
  const range = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await apiFetch(url);
  const data = await res.json() as { values?: string[][] };
  return data.values ?? [];
}

export async function fetchAllSheets(
  spreadsheetId?: string,
): Promise<Map<string, string[][]>> {
  const tabs = await listSheetTabs(spreadsheetId);
  const result = new Map<string, string[][]>();

  for (const tab of tabs) {
    try {
      const data = await fetchSheetData(tab.title, spreadsheetId);
      if (data.length > 1) result.set(tab.title, data);
    } catch {
      // skip inaccessible tabs
    }
  }

  if (result.size === 0 && tabs.length > 0) {
    throw new Error('시트 탭은 발견했으나 데이터를 읽을 수 없습니다.');
  }

  return result;
}
