import { Parser } from '@dbml/core';
import type { ParsedSchema, SchemaTable, SchemaRef, SchemaEnum, SchemaTableGroup, RelationType } from '@datamaster/shared';

export function parseDbml(dbmlText: string): ParsedSchema {
  const parser = new Parser();
  const database = parser.parse(dbmlText, 'dbml');
  const schema = database.schemas[0];

  const tables: SchemaTable[] = (schema?.tables ?? []).map((t: any) => ({
    id: `${t.schema?.name ?? 'public'}.${t.name}`,
    name: t.name,
    schema: t.schema?.name ?? 'public',
    alias: t.alias ?? null,
    columns: (t.fields ?? []).map((f: any) => ({
      name: f.name,
      type: f.type?.type_name ?? 'unknown',
      isPrimaryKey: f.pk ?? false,
      isForeignKey: false,
      isUnique: f.unique ?? false,
      isNotNull: f.not_null ?? false,
      isIncrement: f.increment ?? false,
      defaultValue: f.dbdefault?.value ?? null,
      note: f.note?.value ?? null,
    })),
    indexes: (t.indexes ?? []).map((idx: any) => ({
      name: idx.name ?? null,
      columns: (idx.columns ?? []).map((c: any) => c.value ?? c.toString()),
      isPrimaryKey: idx.pk ?? false,
      isUnique: idx.unique ?? false,
      type: idx.type ?? null,
    })),
    note: t.note?.value ?? null,
    headerColor: t.headerColor ?? null,
    groupName: null,
    groupColor: null,
  }));

  const rawRefs = schema?.refs ?? (database as any).refs ?? [];
  const refs: SchemaRef[] = rawRefs.map((r: any, i: number) => {
    const ep0 = r.endpoints?.[0];
    const ep1 = r.endpoints?.[1];
    let type: RelationType = 'one-to-many';
    if (ep0?.relation === '1' && ep1?.relation === '1') type = 'one-to-one';
    else if (ep0?.relation === '*' && ep1?.relation === '*') type = 'many-to-many';
    else if (ep0?.relation === '*') type = 'many-to-one';

    return {
      id: `ref-${i}`,
      name: r.name ?? null,
      fromTable: ep0?.tableName ?? '',
      fromColumns: ep0?.fieldNames ?? [],
      toTable: ep1?.tableName ?? '',
      toColumns: ep1?.fieldNames ?? [],
      type,
      onDelete: r.onDelete ?? null,
      onUpdate: r.onUpdate ?? null,
    };
  });

  const enums: SchemaEnum[] = (schema?.enums ?? []).map((e: any) => ({
    name: e.name,
    schema: e.schema?.name ?? 'public',
    values: (e.values ?? []).map((v: any) => ({
      name: v.name,
      note: v.note?.value ?? null,
    })),
  }));

  const tableGroups: SchemaTableGroup[] = (schema?.tableGroups ?? []).map((g: any) => ({
    name: g.name,
    tables: (g.tables ?? []).map((t: any) => t.name ?? t.toString()),
    color: null,
    note: null,
  }));

  // Mark FK columns
  for (const ref of refs) {
    const table = tables.find((t) => t.name === ref.fromTable);
    if (table) {
      for (const col of table.columns) {
        if (ref.fromColumns.includes(col.name)) {
          col.isForeignKey = true;
        }
      }
    }
  }

  return { tables, refs, enums, tableGroups };
}
