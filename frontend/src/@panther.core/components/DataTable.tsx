import clsx from 'clsx'
import type { ReactNode } from 'react'

export type Column<Row> = {
  key: string
  header: string
  render: (row: Row) => ReactNode
  /** Numbers align right, so their digits line up. */
  align?: 'left' | 'right'
  /** Identifiers, paths and ids render mono. */
  mono?: boolean
  className?: string
}

type Props<Row> = {
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  /** Read by screen readers; say what the rows are. */
  caption: string
  empty?: ReactNode
  /** Rows scroll under a sticky header past this height. */
  maxHeightClass?: string
}

/**
 * A table of figures: sticky header, tabular numbers, ruled rows, edge padding that lines up with
 * the card around it. Every chart has one of these as its table view, so no value is reachable
 * only by hovering.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  maxHeightClass = 'max-h-96',
}: Props<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>

  return (
    <div className={clsx('overflow-auto', maxHeightClass)}>
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            {columns.map(c => (
              <th
                key={c.key}
                scope="col"
                className={clsx(
                  'px-3 py-2 text-2xs font-medium whitespace-nowrap text-ink-faint sd-hairline-b first:pl-4 last:pr-4',
                  c.align === 'right' ? 'text-right' : 'text-left'
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)} className="group hover:bg-wash-hover">
              {columns.map(c => (
                <td
                  key={c.key}
                  className={clsx(
                    'px-3 py-2 align-top text-ink sd-hairline-b group-last:shadow-none first:pl-4 last:pr-4',
                    c.align === 'right' ? 'text-right whitespace-nowrap' : 'text-left',
                    c.mono && 'sd-ident',
                    c.className
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
