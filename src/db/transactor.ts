import { AnyQuery, Querier, QueryResult, QueryResultRow } from './query.js';

export type IsolationLevel = 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
export type AccessMode = 'READ WRITE' | 'READ ONLY';
export type Deferrable = 'NOT DEFERRABLE' | 'DEFERRABLE';

// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const PostgresErrorCodes = {
  SerializationFailureCode: 40001,
  ForeignKeyViolationCode: 23503,
};

export type TxConfig = {
  isolationLevel: IsolationLevel;
  accessMode: AccessMode;
  deferrable: Deferrable;
  serializationRetries: number;
  lockTimeoutMs: number;
  // Should we rollback unconditionally - i.e. whether or not there was an error
  rollback: boolean;
};

export const defaultConfig: TxConfig = {
  isolationLevel: 'READ COMMITTED',
  accessMode: 'READ WRITE',
  deferrable: 'NOT DEFERRABLE',
  serializationRetries: 0,
  lockTimeoutMs: 5000,
  rollback: false,
};

// A no-overhead blocking serializable read
export const SAFE_SERIALIZABLE_READ: Partial<TxConfig> = {
  isolationLevel: 'SERIALIZABLE',
  accessMode: 'READ ONLY',
  deferrable: 'DEFERRABLE',
} as const;

export const SERIALIZABLE: Partial<TxConfig> = {
  isolationLevel: 'SERIALIZABLE',
  accessMode: 'READ WRITE',
} as const;

// A SERIALIZABLE transaction that will retry on serialization failures - should only be used when re-running the
// transaction block will not have adverse side-effects, e.g. non-idempotent smart contract calls
export const SERIALIZABLE_RETRY: Partial<TxConfig> = {
  isolationLevel: 'SERIALIZABLE',
  accessMode: 'READ WRITE',
  serializationRetries: 100,
} as const;

export const READ_ONLY: Partial<TxConfig> = {
  accessMode: 'READ ONLY',
  // The behaviour of COMMIT and ROLLBACK should be identical for read only access mode but for the sake of defensiveness
  rollback: true,
};

export interface ITransactor extends AsyncDisposable {
  query<R extends QueryResultRow = QueryResultRow, I extends unknown[] = unknown[]>(
    query: AnyQuery<I>,
    values?: unknown[] | undefined,
  ): Promise<QueryResult<R>>;

  transact<T>(f: (querier: Querier) => T | Promise<T>, txConfig?: Partial<TxConfig>): Promise<T>;

  readOnly<T>(f: (querier: Querier) => T | Promise<T>): Promise<T>;

  close(): Promise<void>;
}
