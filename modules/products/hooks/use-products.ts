import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface Product {
  id: string;
  sku: string;
  name: string;
  status: string;
  baseUom: string;
  brand?: string | null;
  categoryId?: string | null;
  standardCost?: string | null;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface PriceListEntry {
  id: string;
  productId: string;
  customerId?: string | null;
  currency: string;
  uom: string;
  minQuantity: string;
  unitPrice: string;
}

export interface PricingRecommendation {
  recommendedUnitPrice: number;
  rationale: string;
}

export interface ProductExpertAnswer {
  answer: string;
  confidence: number;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  categoryId?: string;
  baseUom: string;
  standardCost?: number;
}

function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    load()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => refetch(), [refetch]);

  return { data, loading, error, refetch };
}

export function useProducts(status?: string) {
  const api = useApiClient();
  return useAsync<Product[]>(() => api.get('/products', { status }), [status]);
}

export function useProduct(id: string) {
  const api = useApiClient();
  return useAsync<Product>(() => api.get(`/products/${id}`), [id]);
}

export function useCategories() {
  const api = useApiClient();
  return useAsync<Category[]>(() => api.get('/categories'), []);
}

export function usePriceLists(productId: string) {
  const api = useApiClient();
  return useAsync<PriceListEntry[]>(() => api.get('/price-lists', { productId }), [productId]);
}

export function useCreateProduct() {
  const api = useApiClient();
  return useCallback((input: CreateProductInput) => api.post<Product>('/products', input), [api]);
}

export function useCreateCategory() {
  const api = useApiClient();
  return useCallback(
    (name: string, parentId?: string) => api.post<Category>('/categories', { name, parentId }),
    [api],
  );
}

export function useUpsertPriceListEntry() {
  const api = useApiClient();
  return useCallback(
    (
      productId: string,
      input: {
        customerId?: string;
        currency: string;
        uom: string;
        minQuantity?: number;
        unitPrice: number;
      },
    ) => api.post<PriceListEntry>(`/price-lists/${productId}`, input),
    [api],
  );
}

export function useRequestProductApproval() {
  const api = useApiClient();
  return useCallback(
    (productId: string) => api.post(`/products/${productId}/request-approval`, {}),
    [api],
  );
}

export function useProductAiPricing() {
  const api = useApiClient();
  return useCallback(
    (productId: string, input: { customerId?: string; quantity: number }) =>
      api.post<PricingRecommendation>(`/products/${productId}/ai-pricing`, input),
    [api],
  );
}

export function useProductAiExpert() {
  const api = useApiClient();
  return useCallback(
    (productId: string, question: string) =>
      api.post<ProductExpertAnswer>(`/products/${productId}/ai-expert`, { question }),
    [api],
  );
}
