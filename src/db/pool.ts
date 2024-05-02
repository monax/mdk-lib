import pg from 'pg';
import { format } from 'util';
import { coreTelemetry } from '../telemetry/core.js';
import { initPgParsers } from './parsers.js';
import { AnyQuery, formatQuery, Querier } from './query.js';

export interface PoolClient extends Querier {
  release(): void;
}

@coreTelemetry
export class Pool implements Querier {
  private readonly pool: pg.Pool;
  private querier: Querier;

  constructor(config: pg.PoolConfig | pg.Pool) {
    initPgParsers();

    this.pool = config instanceof pg.Pool ? config : new pg.Pool(config);
    this.querier = errorCaptureQuerier(this.pool);

    this.pool.on('error', (err, client) => {
      // eslint-disable-next-line no-console
      console.error(`Unexpected error on client ${client}: ${err.message}`);
      process.exit(101);
    });

    this.pool.on('connect', (client) => {
      client.query('SET INTERVALSTYLE = iso_8601;').catch((err) => {
        console.trace(err);
        process.exit(101);
      });
    });
  }

  connect(): Promise<PoolClient>;
  connect(
    callback: (err: Error | undefined, client: PoolClient | undefined, done: (release?: unknown) => void) => void,
  ): void;
  connect(
    callback?: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void,
  ): Promise<PoolClient> | void {
    if (callback) {
      return this.pool.connect(callback);
    }
    return this.pool.connect().then((client) => ({
      query: (query: string, values?: unknown[]) => {
        return client.query(query, values);
      },
      release: () => client.release(),
    }));
  }

  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    query: string,
    values?: unknown[] | undefined,
  ): Promise<pg.QueryResult<R>> {
    return this.querier.query<R>(query, values);
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function defaultErrorHandler(err: unknown, query: AnyQuery, values?: unknown[]): Error {
  return new Error(`Error running query: '${formatQuery(query)}' : ${format(err)}`);
}

export function errorCaptureQuerier(querier: Querier, errGenerator = defaultErrorHandler): Querier {
  return {
    query: async (query, values) => {
      try {
        return await querier.query(query, values);
      } catch (err) {
        throw errGenerator(err, query, values);
      }
    },
  };
}
