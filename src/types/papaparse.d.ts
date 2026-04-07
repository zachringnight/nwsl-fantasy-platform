/* eslint-disable @typescript-eslint/no-unused-vars */
declare module "papaparse" {
  interface ParseConfig<T> {
    header?: boolean;
    dynamicTyping?: boolean;
    skipEmptyLines?: boolean;
    transformHeader?: (header: string) => string;
  }

  interface ParseResult<T> {
    data: T[];
  }

  function parse<T>(input: string, config?: ParseConfig<T>): ParseResult<T>;

  const Papa: {
    parse: typeof parse;
  };

  export default Papa;
}
