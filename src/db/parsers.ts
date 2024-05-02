import pg from 'pg';

export function initPgParsers() {
  pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => BigInt(val));
}
