import type { Issue } from '../imageInfo'

export function IssueList({ issues, empty }: { issues: Issue[]; empty?: string }) {
  if (!issues.length) return empty ? <p className="cs-ok">✓ {empty}</p> : null
  return (
    <ul className="cs-issues">
      {issues.map((i, n) => (
        <li key={n} className={i.level === 'error' ? 'cs-issue-error' : 'cs-issue-warn'}>
          <strong>{i.level === 'error' ? 'Blocks' : 'Note'}</strong> {i.message}
        </li>
      ))}
    </ul>
  )
}
