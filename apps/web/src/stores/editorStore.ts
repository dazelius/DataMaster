import { create } from 'zustand';

interface EditorState {
  dbmlText: string;
  isDirty: boolean;
  parseError: string | null;
  setDbmlText: (text: string) => void;
  setParseError: (error: string | null) => void;
  markClean: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  dbmlText: '',
  isDirty: false,
  parseError: null,
  setDbmlText: (text) => set({ dbmlText: text, isDirty: true }),
  setParseError: (error) => set({ parseError: error }),
  markClean: () => set({ isDirty: false }),
}));
