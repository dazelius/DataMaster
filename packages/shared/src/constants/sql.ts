/**
 * alasql reserved words that conflict with common game data table names.
 * Keys are original table names, values are safe aliases used in queries.
 */
export const RESERVED_WORD_MAP: Record<string, string> = {
  Enum: '__u_enum',
  Index: '__u_index',
  Key: '__u_key',
  Value: '__u_value',
  Status: '__u_status',
  Type: '__u_type',
  Level: '__u_level',
  Group: '__u_group',
  Order: '__u_order',
  Table: '__u_table',
  Column: '__u_column',
  Select: '__u_select',
  Insert: '__u_insert',
  Update: '__u_update',
  Delete: '__u_delete',
  Create: '__u_create',
  Drop: '__u_drop',
  Alter: '__u_alter',
};

const reverseMap = new Map(Object.entries(RESERVED_WORD_MAP).map(([k, v]) => [v, k]));

export function toSafeTableName(name: string): string {
  return RESERVED_WORD_MAP[name] ?? name;
}

export function fromSafeTableName(safeName: string): string {
  return reverseMap.get(safeName) ?? safeName;
}

export function replaceReservedWords(sql: string): string {
  let result = sql;
  for (const [original, safe] of Object.entries(RESERVED_WORD_MAP)) {
    const pattern = new RegExp(`\\b${original}\\b`, 'g');
    result = result.replace(pattern, safe);
  }
  return result;
}
