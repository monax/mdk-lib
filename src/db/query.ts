import type { TypeId } from 'pg-types';

export interface Querier {
  query<R extends QueryResultRow = QueryResultRow, I extends unknown[] = unknown[]>(
    query: AnyQuery<I>,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

export interface QueryRunner<P, R> {
  run: (params: P, querier: Querier) => Promise<Array<R>>;
}

export function formatQuery(query: AnyQuery): string {
  if (typeof query === 'string') {
    return query;
  }
  const { name = 'unknown', text, values } = query;
  return `[${name}: '${text}' with values [${values?.join(', ') || ''}] ]`;
}

// --- Types below lifted from 'pg' to avoid pulling in pg-native dependencies ---

export interface FieldDef {
  name: string;
  tableID: number;
  columnID: number;
  dataTypeID: number;
  dataTypeSize: number;
  dataTypeModifier: number;
  format: string;
}

export interface QueryResultRow {
  [column: string]: unknown;
}

export interface QueryResult<R extends QueryResultRow = QueryResultRow> extends QueryResultBase {
  rows: R[];
}

export interface QueryResultBase {
  command: string;
  rowCount: number | null;
  oid: number;
  fields: FieldDef[];
}

export interface CustomTypesConfig {
  // biome-ignore lint/suspicious/noExplicitAny: just any
  getTypeParser: (id: TypeId | number, format?: 'text' | 'binary') => any;
}

export interface QueryConfig<I extends unknown[] = unknown[]> {
  name?: string | undefined;
  text: string;
  values?: I | undefined;
  types?: CustomTypesConfig | undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: just any
export type AnyQuery<I extends any[] = any[]> = string | QueryConfig<I>;

export interface PreparedStatement<P> {
  name: string;
  text: string;
  values: P[];
}
