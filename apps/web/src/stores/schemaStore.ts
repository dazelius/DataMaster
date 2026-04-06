import { create } from 'zustand';
import type { ParsedSchema } from '@datamaster/shared';

interface SchemaState {
  dbml: string;
  schema: ParsedSchema | null;
  selectedTable: string | null;
  dataFiles: string[];
  setDbml: (dbml: string) => void;
  setSchema: (schema: ParsedSchema) => void;
  setSelectedTable: (name: string | null) => void;
  setDataFiles: (files: string[]) => void;
}

export const useSchemaStore = create<SchemaState>((set) => ({
  dbml: '',
  schema: null,
  selectedTable: null,
  dataFiles: [],
  setDbml: (dbml) => set({ dbml }),
  setSchema: (schema) => set({ schema }),
  setSelectedTable: (name) => set({ selectedTable: name }),
  setDataFiles: (files) => set({ dataFiles: files }),
}));
