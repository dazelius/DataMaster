import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { config } from '../config.js';

interface DbStore {
  chatSessions: Record<string, any>[];
  chatMessages: Record<string, any>[];
  knowledge: Record<string, any>[];
  artifacts: Record<string, any>[];
  folders: Record<string, any>[];
}

const DEFAULT_STORE: DbStore = {
  chatSessions: [],
  chatMessages: [],
  knowledge: [],
  artifacts: [],
  folders: [],
};

let store: DbStore = { ...DEFAULT_STORE };
let dbPath: string;

export function initializeDb() {
  dbPath = config.DB_PATH.replace(/\.db$/, '.json');
  mkdirSync(dirname(dbPath), { recursive: true });

  if (existsSync(dbPath)) {
    try {
      store = JSON.parse(readFileSync(dbPath, 'utf-8'));
    } catch {
      store = { ...DEFAULT_STORE };
    }
  }
  persist();
}

function persist() {
  writeFileSync(dbPath, JSON.stringify(store, null, 2));
}

export function getDb() {
  return {
    insert(table: keyof DbStore) {
      return {
        values(row: Record<string, any>) {
          return {
            run() {
              store[table].push(row);
              persist();
            },
          };
        },
      };
    },
    select() {
      return {
        from(table: keyof DbStore) {
          return {
            where(predicate: (row: any) => boolean) {
              return {
                orderBy(_col: any) {
                  return {
                    all() {
                      return store[table].filter(predicate).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
                    },
                  };
                },
                all() {
                  return store[table].filter(predicate);
                },
              };
            },
            orderBy(col: string, dir: 'asc' | 'desc' = 'asc') {
              return {
                all() {
                  return [...store[table]].sort((a, b) => {
                    const cmp = (a[col] ?? 0) - (b[col] ?? 0);
                    return dir === 'desc' ? -cmp : cmp;
                  });
                },
              };
            },
            all() {
              return [...store[table]];
            },
          };
        },
      };
    },
    delete(table: keyof DbStore) {
      return {
        where(predicate: (row: any) => boolean) {
          return {
            run() {
              store[table] = store[table].filter((r) => !predicate(r));
              persist();
            },
          };
        },
      };
    },
  };
}
