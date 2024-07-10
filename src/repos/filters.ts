type FilterFlag<K extends string> = `filter${Capitalize<K>}`;

const getFilterFlag = <T extends string>(str: T) =>
  `filter${str.charAt(0).toUpperCase() + str.slice(1)}` as FilterFlag<T>;

type ParamType = readonly unknown[] | undefined | null;

type FilterParamsWithFlags<T extends Record<string, ParamType>> = {
  [k in keyof T]-?: null | undefined extends T[k] ? [null] : NonNullable<T[k]>;
} & {
  [F in FilterFlag<string & keyof T>]: boolean;
};

export const filterParamsWithFlags = <T extends Record<string, ParamType>>(obj: T): FilterParamsWithFlags<T> => {
  return Object.fromEntries(
    Object.entries(obj).flatMap(([key, val]) => {
      const isFiltered = Array.isArray(val) ? val.length > 0 : val !== undefined && val !== null;
      return [
        [getFilterFlag(key), isFiltered],
        [key, isFiltered ? val : [null]],
      ];
    }),
  ) as FilterParamsWithFlags<T>;
};

export type ExcludeFilterFlags<T> = Omit<T, `filter${string}`>;
