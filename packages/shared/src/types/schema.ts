export interface SchemaColumn {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isNotNull: boolean;
  isIncrement: boolean;
  defaultValue: string | null;
  note: string | null;
}

export interface SchemaIndex {
  name: string | null;
  columns: string[];
  isPrimaryKey: boolean;
  isUnique: boolean;
  type: string | null;
}

export interface SchemaTable {
  id: string;
  name: string;
  schema: string;
  alias: string | null;
  columns: SchemaColumn[];
  indexes: SchemaIndex[];
  note: string | null;
  headerColor: string | null;
  groupName: string | null;
  groupColor: string | null;
}

export type RelationType = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

export interface SchemaRef {
  id: string;
  name: string | null;
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  type: RelationType;
  onDelete: string | null;
  onUpdate: string | null;
}

export interface SchemaEnum {
  name: string;
  schema: string;
  values: { name: string; note: string | null }[];
}

export interface SchemaTableGroup {
  name: string;
  tables: string[];
  color: string | null;
  note: string | null;
}

export interface ParsedSchema {
  tables: SchemaTable[];
  refs: SchemaRef[];
  enums: SchemaEnum[];
  tableGroups: SchemaTableGroup[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
}
