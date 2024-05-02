import { isFunction } from 'mdk-schema';
import { Querier } from './query.js';
import { ITransactor } from './transactor.js';

export type LiftedTransactor<Tx> = <T>(f: (tx: Tx) => Promise<T>) => Promise<T>;

// Takes a transactor and a function that can provide a data access object framed to a transaction
// to provide transactions over typed stores etc rather than just raw queries
export function liftTransactor<Tx>(txr: ITransactor, frame: (q: Querier) => Tx): LiftedTransactor<Tx> {
  return async <T>(f: (tx: Tx) => Promise<T>): Promise<T> => {
    return txr.transact(async (tx) => f(frame(tx)));
  };
}

export type Txr<Tx> = LiftedTransactor<Tx> | Tx;

export function transact<Tx, T>(txr: Txr<Tx>, f: (tx: Tx) => Promise<T>): Promise<T> {
  if (isFunction(txr)) {
    return txr(f);
  }
  return f(txr);
}
