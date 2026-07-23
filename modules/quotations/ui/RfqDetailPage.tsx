import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRfq, useSubmitRfq } from '../hooks/use-rfqs';
import { useCreateQuotationFromRfq, type CreateQuotationLineInput } from '../hooks/use-quotations';

export function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: rfq, loading, error, refetch } = useRfq(id!);
  const submitRfq = useSubmitRfq();
  const createQuotation = useCreateQuotationFromRfq();

  const [quotationNumber, setQuotationNumber] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [creatingQuotation, setCreatingQuotation] = useState(false);

  async function handleSubmit() {
    setActionError(null);
    try {
      await submitRfq(id!);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not submit RFQ.');
    }
  }

  async function handleCreateQuotation(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setCreatingQuotation(true);
    try {
      const lineItems: CreateQuotationLineInput[] = rfq!.lineItems.map((li) => ({
        productId: li.productId,
        quantity: Number(li.quantity),
      }));
      const quotation = await createQuotation({ quotationNumber, rfqId: id!, lineItems });
      navigate(`/quotations/${quotation.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not generate quotation.');
      setCreatingQuotation(false);
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !rfq) return <div className="error-banner">{error ?? 'RFQ not found.'}</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {rfq.rfqNumber} <span className="pill">{rfq.status}</span>
        </h2>
        <Link to="/rfqs">
          <button className="secondary">Back to RFQs</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>Currency: {rfq.currency}</p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>UoM</th>
              <th>Target price</th>
            </tr>
          </thead>
          <tbody>
            {rfq.lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.productId}</td>
                <td>{li.quantity}</td>
                <td>{li.uom}</td>
                <td>{li.targetPrice ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rfq.status === 'DRAFT' && (
          <div className="button-row">
            <button onClick={handleSubmit}>Submit RFQ</button>
          </div>
        )}
      </div>

      {rfq.status === 'SUBMITTED' && (
        <div className="card">
          <h3>Generate quotation</h3>
          <form onSubmit={handleCreateQuotation}>
            <div className="line-item-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <input
                placeholder="Quotation number"
                value={quotationNumber}
                onChange={(e) => setQuotationNumber(e.target.value)}
                required
              />
              <button type="submit" disabled={creatingQuotation}>
                {creatingQuotation ? 'Generating…' : 'Generate quotation'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
