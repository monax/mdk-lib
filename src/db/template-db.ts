import type { PgConfig } from 'mdk-schema';
import pg from 'pg';
import { Transactor } from './impl/transactor.js';
import type { ITransactor } from './transactor.js';

export async function withTemplateDatabase(
  templateName: string,
  config: PgConfig,
  callback: (transactor: ITransactor) => Promise<void>,
) {
  const database = `${templateName}_${Math.random().toString(36).substring(2, 10)}`;

  const client = new pg.Client({ user: config.POSTGRES_USER, password: config.POSTGRES_PASSWORD });
  await client.connect();
  await client.query(`CREATE DATABASE ${database} TEMPLATE ${templateName}`);
  const transactor = Transactor.fromConfig({ ...config, POSTGRES_DB: database });

  try {
    await callback(transactor);
  } finally {
    // Must close the connection to `database` before we can drop it.
    await transactor.close();
    await client.query(`DROP DATABASE ${database}`);
    await client.end();
  }
}
