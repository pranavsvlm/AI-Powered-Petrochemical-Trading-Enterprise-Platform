import { SearchService } from './search.service';
import type { DocumentFullTextSearchService } from '../infrastructure/document-fulltext-search.service';
import type { VectorSearchPort } from '../domain/vector-search-port';

describe('SearchService', () => {
  const fullText = { search: jest.fn() } as unknown as jest.Mocked<DocumentFullTextSearchService>;
  const vectorSearch = {
    indexChunk: jest.fn(),
    similaritySearch: jest.fn(),
  } as unknown as jest.Mocked<VectorSearchPort>;
  const service = new SearchService(fullText, vectorSearch);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('defaults to fulltext mode and delegates to the fulltext service', async () => {
    fullText.search.mockResolvedValue([{ id: 'doc1', rank: 0.8 }]);
    const result = await service.search('co1', 'invoice', { limit: 10 });
    expect(fullText.search).toHaveBeenCalledWith('co1', 'invoice', { limit: 10 });
    expect(result).toEqual([{ id: 'doc1', rank: 0.8 }]);
  });

  it('routes semantic mode to the vector search port and maps results', async () => {
    vectorSearch.similaritySearch.mockResolvedValue([
      { documentId: 'doc2', chunkText: 'x', score: 0.9 },
    ]);
    const result = await service.search('co1', 'invoice', { limit: 5 }, 'semantic');
    expect(vectorSearch.similaritySearch).toHaveBeenCalledWith('co1', 'invoice', 5);
    expect(result).toEqual([{ id: 'doc2', rank: 0.9 }]);
    expect(fullText.search).not.toHaveBeenCalled();
  });

  it('propagates the NotImplemented error when semantic search is unavailable', async () => {
    vectorSearch.similaritySearch.mockRejectedValue(new Error('not implemented'));
    await expect(service.search('co1', 'invoice', {}, 'semantic')).rejects.toThrow(
      'not implemented',
    );
  });
});
