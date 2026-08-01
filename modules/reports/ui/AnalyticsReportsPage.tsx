import { FormEvent, useState } from 'react';
import {
  useCreateSchedule,
  useGenerateReport,
  useReports,
  useSchedules,
  useToggleSchedule,
} from '../hooks/use-analytics';

const REPORT_TYPES = [
  'EXECUTIVE',
  'SALES',
  'TRADING',
  'FINANCE',
  'INVENTORY',
  'PROCUREMENT',
  'AI_USAGE',
] as const;
const FORMATS = ['PDF', 'CSV'] as const;
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

export function AnalyticsReportsPage() {
  const { data: reports, loading, error, refetch: refetchReports } = useReports();
  const generateReport = useGenerateReport();
  const { data: schedules, refetch: refetchSchedules } = useSchedules();
  const createSchedule = useCreateSchedule();
  const toggleSchedule = useToggleSchedule();

  const [reportType, setReportType] = useState<(typeof REPORT_TYPES)[number]>('EXECUTIVE');
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('PDF');
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [scheduleType, setScheduleType] = useState<(typeof REPORT_TYPES)[number]>('EXECUTIVE');
  const [scheduleFormat, setScheduleFormat] = useState<(typeof FORMATS)[number]>('PDF');
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('WEEKLY');
  const [recipientEmails, setRecipientEmails] = useState('');

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setGenerating(true);
    try {
      await generateReport(reportType, format);
      await refetchReports();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateSchedule(e: FormEvent) {
    e.preventDefault();
    const emails = recipientEmails
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    setActionError(null);
    try {
      await createSchedule({
        reportType: scheduleType,
        format: scheduleFormat,
        frequency,
        recipientEmails: emails,
      });
      setRecipientEmails('');
      await refetchSchedules();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create schedule.');
    }
  }

  async function handleToggle(id: string, active: boolean) {
    setActionError(null);
    try {
      await toggleSchedule(id, active);
      await refetchSchedules();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update schedule.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Analytics Reports</h2>
      </div>
      {actionError && <div className="error-banner">{actionError}</div>}

      <div className="card">
        <h3>Generate a report</h3>
        <form onSubmit={handleGenerate} className="button-row" style={{ flexWrap: 'wrap' }}>
          <select value={reportType} onChange={(e) => setReportType(e.target.value as never)}>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value as never)}>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button type="submit" disabled={generating}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Generated reports</h3>
        {error && <div className="error-banner">{error}</div>}
        {loading && <p className="empty-state">Loading…</p>}
        {!loading && reports && reports.length === 0 && (
          <p className="empty-state">No reports yet.</p>
        )}
        {!loading && reports && reports.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Format</th>
                <th>Generated</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.type}</td>
                  <td>
                    <span className="pill">{r.format}</span>
                  </td>
                  <td>{new Date(r.generatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Scheduled reports</h3>
        {schedules && schedules.length === 0 && <p className="empty-state">No schedules yet.</p>}
        {schedules && schedules.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Format</th>
                <th>Frequency</th>
                <th>Recipients</th>
                <th>Status</th>
                <th>Last run</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td>{s.reportType}</td>
                  <td>{s.format}</td>
                  <td>{s.frequency}</td>
                  <td>{s.recipientEmails.join(', ')}</td>
                  <td>
                    <span className="pill">{s.isActive ? 'Active' : 'Paused'}</span>
                  </td>
                  <td>{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '—'}</td>
                  <td>
                    <button className="secondary" onClick={() => handleToggle(s.id, !s.isActive)}>
                      {s.isActive ? 'Pause' : 'Resume'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form
          onSubmit={handleCreateSchedule}
          className="button-row"
          style={{ flexWrap: 'wrap', marginTop: 16 }}
        >
          <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as never)}>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={scheduleFormat}
            onChange={(e) => setScheduleFormat(e.target.value as never)}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as never)}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <input
            placeholder="Recipient emails, comma-separated"
            value={recipientEmails}
            onChange={(e) => setRecipientEmails(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <button type="submit">Create schedule</button>
        </form>
      </div>
    </div>
  );
}
