declare module "sql.js" {
  export type SqlValue = number | string | Uint8Array | null;

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Statement {
    bind(values?: SqlValue[] | Record<string, SqlValue>): boolean;
    step(): boolean;
    get(params?: SqlValue[] | Record<string, SqlValue>): SqlValue[];
    getAsObject(params?: SqlValue[] | Record<string, SqlValue>): Record<string, SqlValue>;
    run(values?: SqlValue[] | Record<string, SqlValue>): void;
    reset(): void;
    free(): boolean;
  }

  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
    run(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Database;
    exec(sql: string, params?: SqlValue[] | Record<string, SqlValue>): QueryExecResult[];
    prepare(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface SqlJsConfig {
    locateFile?: (filename: string, scriptDirectory: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
