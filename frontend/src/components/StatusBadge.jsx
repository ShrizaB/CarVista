const statusMap = {
  booked: { label: 'Booked', cls: 'badge-amber' },
  started: { label: 'Trip Started', cls: 'badge-amber' },
  in_progress: { label: 'In Progress', cls: 'badge-amber' },
  completed: { label: 'Completed', cls: 'badge-green' },
  cancelled: { label: 'Cancelled', cls: 'badge-red' },
  published: { label: 'Published', cls: 'badge-green' },
  full: { label: 'Full', cls: 'badge-slate' },
  expired: { label: 'Expired', cls: 'badge-slate' },
  pending: { label: 'Payment Pending', cls: 'badge-amber' },
  failed: { label: 'Payment Failed', cls: 'badge-red' },
  refunded: { label: 'Refunded', cls: 'badge-slate' },
};

export default function StatusBadge({ status }) {
  const s = statusMap[status] || { label: status, cls: 'badge-slate' };
  return (
    <span className={`badge ${s.cls}`}>
      <span className="badge-dot" />
      {s.label}
    </span>
  );
}
