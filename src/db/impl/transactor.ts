import { PgConfig } from 'mdk-schema';
import { PoolConfig, default as Postgres, QueryResult, QueryResultRow } from 'pg';
import { coreTelemetry } from '../../telemetry/core.js';
import type { AnyQuery, Querier } from '../query.js';
import { ITransactor, PostgresErrorCodes, READ_ONLY, TxConfig, defaultConfig } from '../transactor.js';

@coreTelemetry
export class Transactor implements Querier, ITransactor {
  private readonly pool: Postgres.Pool;
  protected ended: boolean;

  constructor(config: PoolConfig | string) {
    this.ended = false;
    let dbConfig: PoolConfig;
    if (typeof config === 'string') {
      dbConfig = { connectionString: config };
    } else {
      dbConfig = config;
    }
    this.pool = new Postgres.Pool(dbConfig);

    this.pool.on('error', (err) => {
      console.error(new Error(`Error on pool client: ${err.stack || err}`));
    });

    this.pool.on('connect', (client) => {
      client.query(`SET search_path TO public;`).catch((err) => {
        console.error(`Could not configure client on first connection: ${err.stack}`);
        process.exit(1);
      });
    });
  }

  static fromConfig(config: PgConfig): Transactor {
    return new Transactor({
      user: config.POSTGRES_USER,
      host: config.POSTGRES_HOST,
      database: config.POSTGRES_DB,
      password: config.POSTGRES_PASSWORD,
      port: config.POSTGRES_PORT,
    });
  }

  query<R extends QueryResultRow = QueryResultRow, I extends unknown[] = unknown[]>(
    query: AnyQuery<I>,
    values?: unknown[] | undefined,
  ): Promise<QueryResult<R>> {
    return this.pool.query(query, values);
  }

  async transact<T>(f: (querier: Querier) => T | Promise<T>, txConfig?: Partial<TxConfig>): Promise<T> {
    const client = await this.pool.connect();
    try {
      // await so we do not skip release
      return await transact(client, f, txConfig);
    } finally {
      client.release();
    }
  }

  async readOnly<T>(f: (querier: Querier) => T | Promise<T>): Promise<T> {
    return this.transact(f, READ_ONLY);
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  async close(): Promise<void> {
    if (this.ended) {
      return;
    }
    await this.pool.end();
    this.ended = true;
  }
}

async function transact<T>(
  querier: Querier,
  f: (querier: Querier) => T | Promise<T>,
  txConfig?: Partial<TxConfig>,
  backoffMs?: number,
): Promise<T> {
  const { isolationLevel, accessMode, deferrable, serializationRetries, lockTimeoutMs, rollback } = {
    ...defaultConfig,
    ...txConfig,
  };
  const start = Date.now();
  try {
    await querier.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel} ${accessMode} ${deferrable}`);
    await querier.query(`SET LOCAL lock_timeout = '${Math.floor(lockTimeoutMs)}ms'`);
    // important to await the promise so we only commit/rollback after it has run
    const result = await f(wrapQuerier(querier));
    if (rollback) {
      await querier.query('ROLLBACK');
    } else {
      await querier.query('COMMIT');
    }
    return result;
  } catch (err) {
    await querier.query('ROLLBACK');
    // Automatic retries
    if (serializationRetries > 0 && getErrorCode(err) === PostgresErrorCodes.SerializationFailureCode) {
      // Scale backoff according to execution time
      backoffMs ??= Date.now() - start;
      await sleepWithJitter(backoffMs);
      return transact(querier, f, { ...txConfig, serializationRetries: serializationRetries - 1 }, backoffMs * 2);
    }
    throw err;
  }
}

type CodedError = { code: number };

function isCodedError(err: unknown): err is CodedError {
  const code = (err as CodedError).code;
  return !!Number(code);
}

function getErrorCode(err: unknown): number | null {
  if (isCodedError(err)) {
    return err.code;
  }
  return null;
}

function wrapQuerier(querier: Querier): Querier {
  return {
    query: async (query, values) => {
      try {
        return await querier.query(query, values);
      } catch (err) {
        throw { err, query };
      }
    },
  };
}

function sleepWithJitter(ms: number): Promise<void> {
  // Jitter by up to a quarter of the specified wait time
  const jitter = Math.floor(Math.random() * (ms / 4));
  ms += jitter;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
