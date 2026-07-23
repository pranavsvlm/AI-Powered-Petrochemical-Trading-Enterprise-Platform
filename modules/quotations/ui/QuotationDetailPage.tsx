import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useDecideQuotationApproval,
  useNegotiateQuotation,
  useQuotation,
  useRequestQuotationApproval,
  useReviseQuotation,
  useSendQuotation,
  type ReviseQuotationLineInput,
} from '../hooks/use-quotations';

export function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: quotation, loading, error, refetch } = useQuotation(id!);
  const send = useSendQuotation();
  const negotiate = useNegotiateQuotation();
  const revise = useReviseQuotation();
  const requestApproval = useRequestQuotationApproval();
  const decideApproval = useDecideQuotationApproval();

  const [actionError, setActionError] = useState<string | null>(null);
  // Kept in local state only — there is no "list pending approvals for this quotation" GET
  // endpoint yet, so a decide-approval action is only reachable in the same session that
  // requested it. A real reload-safe flow needs that endpoint (see docs/DOMAIN_MODEL_PHASE4.md).
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [revisedLines, setRevisedLines] = useState<ReviseQuotationLineInput[] | null>(null);

  const currentVersion = quotation?.versions.find(
    (v) => v.versionNumber === quotation.currentVersionNumber,
  );

  function startRevision() {
    if (!currentVersion) return;
    setRevisedLines(
      currentVersion.lineItems.map((li) => ({
        productId: li.productId,
        quantity: Number(li.quantity),
        uom: li.uom,
        unitPrice: Number(li.unitPrice),
        discountPercent: Number(li.discountPercent),
      })),
    );
  }

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    }
  }

  async function handleRequestApproval() {
    setActionError(null);
    try {
      const approvals = await requestApproval(id!);
      setPendingApprovalId(approvals[0]?.id ?? null);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approval request failed.');
    }
  }

  async function handleDecide(decision: 'APPROVED' | 'REJECTED') {
    if (!pendingApprovalId) return;
    await runAction(() => decideApproval(pendingApprovalId, decision));
    setPendingApprovalId(null);
  }

  async function handleRevise(e: FormEvent) {
    e.preventDefault();
    if (!revisedLines) return;
    await runAction(() => revise(id!, revisedLines));
    setRevisedLines(null);
  }

  function updateRevisedLine(index: number, patch: Partial<ReviseQuotationLineInput>) {
    setRevisedLines(
      (lines) => lines?.map((line, i) => (i === index ? { ...line, ...patch } : line)) ?? null,
    );
  }

  if (loading) return <p className="empty-state">Loading…</p>;
  if (error || !quotation || !currentVersion) {
    return <div className="error-banner">{error ?? 'Quotation not found.'}</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>
          {quotation.quotationNumber} <span className="pill">{quotation.status}</span>
        </h2>
        <Link to="/quotations">
          <button className="secondary">Back to quotations</button>
        </Link>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <p>
          Version {quotation.currentVersionNumber} · Total {currentVersion.totalAmount}{' '}
          {quotation.currency}
          {currentVersion.marginPercent &&
            ` · Margin ${Number(currentVersion.marginPercent).toFixed(1)}%`}
        </p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>Discount %</th>
              <th>Line total</th>
            </tr>
          </thead>
          <tbody>
            {currentVersion.lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.productId}</td>
                <td>
                  {li.quantity} {li.uom}
                </td>
                <td>{li.unitPrice}</td>
                <td>{li.discountPercent}</td>
                <td>{li.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="button-row">
          {quotation.status === 'DRAFT' && (
            <button onClick={() => runAction(() => send(id!))}>Send</button>
          )}
          {(quotation.status === 'SENT' || quotation.status === 'NEGOTIATING') && (
            <>
              {quotation.status === 'SENT' && (
                <button className="secondary" onClick={() => runAction(() => negotiate(id!))}>
                  Move to negotiating
                </button>
              )}
              <button className="secondary" onClick={startRevision}>
                Revise pricing
              </button>
              <button onClick={handleRequestApproval}>Request approval</button>
            </>
          )}
          {quotation.status === 'APPROVED' && (
            <button onClick={() => navigate(`/orders/new?quotationId=${id}`)}>
              Convert to order
            </button>
          )}
        </div>

        {pendingApprovalId && quotation.status === 'PENDING_APPROVAL' && (
          <div className="button-row">
            <span className="pill">Pending approval {pendingApprovalId}</span>
            <button onClick={() => handleDecide('APPROVED')}>Approve</button>
            <button className="secondary" onClick={() => handleDecide('REJECTED')}>
              Reject
            </button>
          </div>
        )}
      </div>

      {revisedLines && (
        <div className="card">
          <h3>Revise pricing (new version)</h3>
          <form onSubmit={handleRevise}>
            {revisedLines.map((line, i) => (
              <div className="line-item-row" key={i}>
                <span>{line.productId}</span>
                <input
                  type="number"
                  value={line.quantity}
                  onChange={(e) => updateRevisedLine(i, { quantity: Number(e.target.value) })}
                />
                <input
                  type="number"
                  placeholder="Unit price"
                  value={line.unitPrice}
                  onChange={(e) => updateRevisedLine(i, { unitPrice: Number(e.target.value) })}
                />
                <input
                  type="number"
                  placeholder="Discount %"
                  value={line.discountPercent ?? 0}
                  onChange={(e) =>
                    updateRevisedLine(i, { discountPercent: Number(e.target.value) })
                  }
                />
                <span />
              </div>
            ))}
            <div className="button-row">
              <button type="submit">Save new version</button>
              <button type="button" className="secondary" onClick={() => setRevisedLines(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
