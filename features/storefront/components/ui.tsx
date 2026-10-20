import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';

const NOTICE_ICONS: Record<string, LucideIcon> = { info: Info, accent: Info, success: CircleCheck, warn: TriangleAlert, danger: CircleAlert };

export function PageHead({ eyebrow, title, lead, children, crumbs, narrow = false }: { eyebrow?: React.ReactNode; title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode; crumbs?: React.ReactNode; narrow?: boolean }) {
  return <header className={`sf-pagehead ${narrow ? 'sf-wrap sf-wrap--mid' : 'sf-wrap'}`}>
    {crumbs}
    <div className="sf-pagehead__row">
      <div>
        {eyebrow && <p className="sf-eyebrow">{eyebrow}</p>}
        <h1 className="sf-h1">{title}</h1>
        {lead && <p className="sf-lead">{lead}</p>}
      </div>
      {children}
    </div>
  </header>;
}

export function Notice({ tone = 'info', title, children, role, className = '' }: { tone?: 'info' | 'accent' | 'success' | 'warn' | 'danger'; title?: React.ReactNode; children?: React.ReactNode; role?: 'alert' | 'status'; className?: string }) {
  const Icon = NOTICE_ICONS[tone];
  return <div role={role} className={`sf-notice ${tone === 'info' ? '' : `sf-notice--${tone}`} ${className}`}>
    <Icon aria-hidden="true" />
    {title && <p><b>{title}</b></p>}
    {children && <div>{children}</div>}
  </div>;
}

export function StatePanel({ icon: Icon, eyebrow, title, children, actions, role }: { icon: LucideIcon; eyebrow?: string; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; role?: 'alert' | 'status' }) {
  return <div className="sf-wrap sf-wrap--mid">
    <div className="sf-state" role={role}>
      <span className="sf-state__icon"><Icon aria-hidden="true" /></span>
      {eyebrow && <p className="sf-eyebrow">{eyebrow}</p>}
      <h1 className="sf-h1">{title}</h1>
      {children && <div className="sf-lead">{children}</div>}
      {actions && <div className="sf-row">{actions}</div>}
    </div>
  </div>;
}

export function Skeleton({ height, width = '100%', radius, className = '' }: { height: number | string; width?: number | string; radius?: number; className?: string }) {
  return <span aria-hidden="true" className={`sf-skeleton ${className}`} style={{ display: 'block', height, width, borderRadius: radius }} />;
}
