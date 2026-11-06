import { ActionIcon, Tooltip } from '@mantine/core'
import { IconActivityHeartbeat, IconMoon, IconSun } from '@tabler/icons-react'
import clsx from 'clsx'
import { Link, NavLink } from 'react-router'

import { useFilesQuery, useSpanQuery } from '@/app/api/api'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { NAV } from '@/app/nav'
import { selectColorScheme, toggleColorScheme } from '@/app/slices/uiSlice'

function day(t: number): string {
  return new Date(t).toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

/** The name, linking home: a mark and two lines. */
export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-lg sd-brand shadow-sm"
      >
        <IconActivityHeartbeat size={18} stroke={2} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-ink">PANTHER Services</span>
        <span className="text-3xs text-ink-faint">Logs, joined up</span>
      </span>
    </Link>
  )
}

/** What's loaded and whether the backend answers: the first thing to check when a page is empty. */
function DataStatus() {
  const files = useFilesQuery()
  const span = useSpanQuery()
  const count = files.data?.files.length
  const range = span.data?.range

  return (
    <Link
      to="/files"
      className="flex flex-col gap-1 rounded-lg bg-surface-1 px-3 py-2.5 sd-card hover:bg-surface-2"
    >
      <span className="flex items-center gap-2 text-2xs font-medium text-ink">
        <span
          aria-hidden="true"
          className={clsx(
            'size-2 rounded-full',
            files.isError
              ? 'bg-status-fail'
              : count === undefined
                ? 'bg-status-neutral'
                : 'bg-status-pass'
          )}
        />
        {files.isError
          ? 'backend not reachable'
          : count === undefined
            ? 'Connecting…'
            : count === 1
              ? '1 file loaded'
              : `${count} files loaded`}
      </span>
      {range && (
        <span className="text-3xs text-ink-faint sd-figures">
          {day(range.start)} to {day(range.end)} UTC
        </span>
      )}
      {files.data?.hasSample && (
        <span className="text-3xs font-medium text-status-warn">Includes the sample day</span>
      )}
    </Link>
  )
}

type Props = {
  /** Called after a link is followed, so the phone drawer can close. */
  onNavigate?: () => void
}

/** The app's chrome: the name, the pages, what's loaded, and the colour scheme. */
export function Sidebar({ onNavigate }: Props) {
  const dispatch = useAppDispatch()
  const colorScheme = useAppSelector(selectColorScheme)
  const nextScheme = colorScheme === 'dark' ? 'light' : 'dark'

  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <div className="px-1.5">
        <Brand />
      </div>

      <nav aria-label="Pages" className="flex flex-col gap-4">
        {NAV.map(section => (
          <div key={section.group} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1 text-3xs font-semibold tracking-wider text-ink-faint uppercase">
              {section.group}
            </p>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-accent-wash text-accent'
                      : 'text-ink-muted hover:bg-wash-hover hover:text-ink'
                  )
                }
              >
                <item.icon size={17} stroke={1.75} aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <DataStatus />
        <div className="flex items-center justify-between px-1.5">
          <span className="text-3xs text-ink-faint">Times in UTC</span>
          <Tooltip label={`Switch to ${nextScheme} mode`}>
            <ActionIcon
              aria-label={`Switch to ${nextScheme} mode`}
              onClick={() => dispatch(toggleColorScheme())}
            >
              {colorScheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
