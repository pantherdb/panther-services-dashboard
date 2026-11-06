import {
  IconBox,
  IconBriefcase,
  IconCpu,
  IconFolder,
  IconLayoutDashboard,
  IconListDetails,
  IconTimeline,
} from '@tabler/icons-react'

/** The pages, grouped as the sidebar lists them. A new page is added here and in `routes.tsx`. */
export const NAV = [
  {
    group: 'Investigate',
    items: [
      { to: '/', label: 'Overview', icon: IconLayoutDashboard, end: true },
      { to: '/timeline', label: 'Timeline', icon: IconTimeline, end: false },
      { to: '/jobs', label: 'Jobs', icon: IconBriefcase, end: false },
      { to: '/resources', label: 'Resources', icon: IconCpu, end: false },
      { to: '/containers', label: 'Containers', icon: IconBox, end: false },
      { to: '/logs', label: 'Logs', icon: IconListDetails, end: false },
    ],
  },
  {
    group: 'Data',
    items: [{ to: '/files', label: 'Files', icon: IconFolder, end: false }],
  },
] as const
