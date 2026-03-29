export interface SourceAdapter<TRecord> {
  sourceName: string;
  fetchRecordIds(params: { query: string; hasImages?: boolean }): Promise<number[]>;
  fetchRecordById(id: number): Promise<TRecord | null>;
  iterateRecordsByIds(args: {
    ids: number[];
    batchSize: number;
    startOffset?: number;
  }): AsyncGenerator<{ id: number; record: TRecord | null; index: number }>;
}
