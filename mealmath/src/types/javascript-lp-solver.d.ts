declare module 'javascript-lp-solver' {
  export interface Model {
    optimize: string;
    opType: 'min' | 'max';
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, 1>;
    options?: { tolerance?: number; timeout?: number };
  }
  export type Solution = { feasible: boolean; result: number; bounded: boolean } & Record<string, number | boolean>;
  const solver: { Solve(model: Model): Solution };
  export default solver;
}
