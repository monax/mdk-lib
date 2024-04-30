/** Types generated for queries found in "src/queries/lock.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'CreateLock' parameters type */
export interface ICreateLockParams {
  lockName: string;
}

/** 'CreateLock' return type */
export interface ICreateLockResult {
  pg_advisory_xact_lock: undefined | null;
}

/** 'CreateLock' query type */
export interface ICreateLockQuery {
  params: ICreateLockParams;
  result: ICreateLockResult;
}

const createLockIR: any = {"usedParamSet":{"lockName":true},"params":[{"name":"lockName","required":true,"transform":{"type":"scalar"},"locs":[{"a":38,"b":47}]}],"statement":"SELECT pg_advisory_xact_lock(hashtext(:lockName!))"};

/**
 * Query generated from SQL:
 * ```
 * SELECT pg_advisory_xact_lock(hashtext(:lockName!))
 * ```
 */
export const createLock = new PreparedQuery<ICreateLockParams,ICreateLockResult>(createLockIR);


