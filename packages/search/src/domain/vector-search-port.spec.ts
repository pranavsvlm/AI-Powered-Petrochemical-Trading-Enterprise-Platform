import { NotImplementedInPhaseError } from '@platform/core';
import { NotImplementedVectorSearchProvider, type VectorSearchPort } from './vector-search-port';

describe('NotImplementedVectorSearchProvider', () => {
  const provider: VectorSearchPort = new NotImplementedVectorSearchProvider();

  it('throws NotImplementedInPhaseError on indexChunk', async () => {
    await expect(provider.indexChunk('co1', 'doc1', 'text')).rejects.toBeInstanceOf(
      NotImplementedInPhaseError,
    );
  });

  it('throws NotImplementedInPhaseError on similaritySearch', async () => {
    await expect(provider.similaritySearch('co1', 'query', 5)).rejects.toBeInstanceOf(
      NotImplementedInPhaseError,
    );
  });
});
