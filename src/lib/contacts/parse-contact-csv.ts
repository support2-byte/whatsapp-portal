export interface ParsedContactRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  tagNames: string[];
}

export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of value.split(/[,;]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  hasPhoneColumn: boolean;
  hasTagsColumn: boolean;
  hasCompanyColumn: boolean;
}

const HEADER_ALIASES = {
  phone: [
    'phone', 'phonenumber', 'phoneno', 'phonenum', 'mobile', 'mobilenumber',
    'mobileno', 'mobilephone', 'cell', 'cellphone', 'cellnumber', 'whatsapp',
    'whatsappnumber', 'whatsappno', 'wa', 'tel', 'telephone', 'telephonenumber',
    'contactnumber', 'contactno', 'contactphone', 'number', 'msisdn', 'gsm',
    'primaryphone', 'customerphone', 'clientphone',
  ],
  name: [
    'name', 'fullname', 'contactname', 'customername', 'clientname',
    'displayname', 'username', 'person',
  ],
  firstName: ['firstname', 'first', 'givenname', 'fname', 'forename'],
  lastName: ['lastname', 'last', 'surname', 'familyname', 'lname'],
  email: ['email', 'emailaddress', 'emailid', 'mail', 'mailaddress', 'eaddress'],
  company: [
    'company', 'companyname', 'organization', 'organisation', 'org',
    'business', 'businessname', 'employer', 'account', 'firm',
  ],
  tags: ['tags', 'tag', 'labels', 'label', 'groups', 'group', 'segments', 'categories'],
} as const;

type Field = keyof typeof HEADER_ALIASES;

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function findColumn(headers: string[], field: Field): number {
  for (const alias of HEADER_ALIASES[field]) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function looksLikePhone(value: string): boolean {
  const v = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function cleanPhone(raw: string): string {
  const v = raw.trim();
  if (/^00\d/.test(v.replace(/[\s().-]/g, ''))) {
    return '+' + v.replace(/[\s().-]/g, '').slice(2);
  }
  return v;
}

function detectDelimiter(text: string): string {
  let inQuotes = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

function tokenizeCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  rows.push(row);

  return rows.filter((r) => r.some((c) => c !== ''));
}

const EMPTY_RESULT: ParseContactCsvResult = {
  rows: [],
  hasPhoneColumn: false,
  hasTagsColumn: false,
  hasCompanyColumn: false,
};

export function parseContactCsv(input: string): ParseContactCsvResult {
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text) return { ...EMPTY_RESULT };

  const table = tokenizeCsv(text, detectDelimiter(text));
  if (table.length < 2) return { ...EMPTY_RESULT };

  const headers = table[0].map(normalizeHeader);
  const dataRows = table.slice(1);

  let phoneIdx = findColumn(headers, 'phone');

  if (phoneIdx === -1) {
    let bestScore = 0;
    headers.forEach((_, col) => {
      const filled = dataRows.filter((r) => (r[col] ?? '') !== '');
      if (filled.length === 0) return;
      const hits = filled.filter((r) => looksLikePhone(r[col])).length;
      const score = hits / filled.length;
      if (score >= 0.6 && score > bestScore) {
        bestScore = score;
        phoneIdx = col;
      }
    });
  }
  if (phoneIdx === -1) return { ...EMPTY_RESULT };

  const nameIdx = findColumn(headers, 'name');
  const firstIdx = findColumn(headers, 'firstName');
  const lastIdx = findColumn(headers, 'lastName');
  const emailIdx = findColumn(headers, 'email');
  const companyIdx = findColumn(headers, 'company');
  const tagsIdx = findColumn(headers, 'tags');

  const cell = (r: string[], idx: number) =>
    idx >= 0 ? (r[idx] ?? '').trim() : '';

  const rows: ParsedContactRow[] = dataRows.map((r) => {
    const name =
      cell(r, nameIdx) ||
      [cell(r, firstIdx), cell(r, lastIdx)].filter(Boolean).join(' ');

    return {
      phone: cleanPhone(cell(r, phoneIdx)),
      name: name || undefined,
      email: cell(r, emailIdx) || undefined,
      company: cell(r, companyIdx) || undefined,
      tagNames: tagsIdx >= 0 ? parseTagCell(cell(r, tagsIdx)) : [],
    };
  });

  return {
    rows,
    hasPhoneColumn: true,
    hasTagsColumn: tagsIdx >= 0,
    hasCompanyColumn: companyIdx >= 0,
  };
}

export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}